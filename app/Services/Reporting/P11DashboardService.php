<?php

namespace App\Services\Reporting;

use App\Models\AccountingBook;
use App\Models\Location;
use App\Models\Organization;
use App\Models\Product;
use App\Models\Unit;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class P11DashboardService
{
    private const PAGE_SIZE = 25;

    public function books(Organization $organization): array
    {
        $books = AccountingBook::query()
            ->where('organization_id', $organization->getKey())
            ->orderByDesc('id')
            ->get(['id', 'code', 'name', 'currency_code', 'currency_scale', 'time_zone'])
            ->map(fn (AccountingBook $book): array => [
                'id' => (int) $book->getKey(),
                'code' => $book->code,
                'name' => $book->name,
                'currency_code' => $book->currency_code,
                'currency_scale' => (int) $book->currency_scale,
                'time_zone' => $book->time_zone,
            ])
            ->values()
            ->all();

        $defaultBook = $books[0] ?? null;

        return [
            'books' => $books,
            'default_book_id' => $defaultBook['id'] ?? null,
            'default_as_of_date' => $defaultBook === null
                ? null
                : CarbonImmutable::now($defaultBook['time_zone'])->toDateString(),
            'display_currencies' => [
                ['code' => 'IRR', 'label' => 'ریال'],
                ['code' => 'TOMAN', 'label' => 'تومان'],
            ],
        ];
    }

    public function summary(
        Organization $organization,
        AccountingBook $book,
        string $asOfDate,
        string $currency,
    ): array {
        $this->assertBookBelongsTo($organization, $book);
        $cutoff = $this->cutoff($asOfDate, $book->time_zone);
        $organizationId = (int) $organization->getKey();
        $bookId = (int) $book->getKey();

        $sales = $this->eligibleCustomerInvoices($organizationId, $bookId, $asOfDate)
            ->selectRaw('COUNT(invoices.id) AS record_count, COALESCE(SUM(invoices.amount_rial), 0) AS total_rial')
            ->first();

        $receivables = $this->overdueReceivables($organizationId, $bookId, $asOfDate)
            ->selectRaw(
                'COUNT(invoices.id) AS record_count, COALESCE(SUM(invoices.amount_rial - COALESCE(settled_allocations.allocated_rial, 0)), 0) AS total_rial',
            )
            ->first();

        $stockRows = $this->availableStockAsOf($organizationId, $cutoff['utc']);
        $stockGroups = [];

        foreach ($stockRows as $row) {
            $unitId = $row['base_unit']['id'];
            $stockGroups[$unitId] ??= [
                'unit' => $row['base_unit'],
                'quantity_milli' => 0,
                'product_location_count' => 0,
            ];
            $stockGroups[$unitId]['quantity_milli'] += $row['available_milli'];
            $stockGroups[$unitId]['product_location_count']++;
        }

        $stockGroups = array_values(array_map(fn (array $group): array => [
            'unit' => $group['unit'],
            'quantity_milli' => (string) $group['quantity_milli'],
            'quantity' => $this->formatQuantity($group['quantity_milli']),
            'product_location_count' => $group['product_location_count'],
        ], $stockGroups));

        $pendingApprovals = $this->pendingApprovals($organizationId, $cutoff['utc'])
            ->selectRaw('COUNT(requests.id) AS record_count')
            ->value('record_count');

        return [
            'organization_id' => $organizationId,
            'book' => [
                'id' => $bookId,
                'code' => $book->code,
                'name' => $book->name,
                'currency_code' => $book->currency_code,
                'currency_scale' => (int) $book->currency_scale,
                'time_zone' => $book->time_zone,
            ],
            'as_of_date' => $asOfDate,
            'cutoff_local' => $cutoff['local'],
            'display_currency' => $currency,
            'metrics' => [
                'net_sales' => [
                    'total_rial' => (string) ($sales->total_rial ?? '0'),
                    'display_amount' => $this->displayAmount((string) ($sales->total_rial ?? '0'), $currency),
                    'currency' => $currency,
                    'record_count' => (int) ($sales->record_count ?? 0),
                ],
                'overdue_receivables' => [
                    'total_rial' => (string) ($receivables->total_rial ?? '0'),
                    'display_amount' => $this->displayAmount((string) ($receivables->total_rial ?? '0'), $currency),
                    'currency' => $currency,
                    'record_count' => (int) ($receivables->record_count ?? 0),
                ],
                'available_stock' => [
                    'unit_totals' => $stockGroups,
                    'record_count' => count($stockRows),
                    'scope' => 'organization',
                ],
                'pending_purchase_approvals' => [
                    'count' => (int) ($pendingApprovals ?? 0),
                    'record_count' => (int) ($pendingApprovals ?? 0),
                    'scope' => 'organization',
                ],
            ],
        ];
    }

    public function records(
        Organization $organization,
        AccountingBook $book,
        string $asOfDate,
        string $currency,
        string $metric,
        int $page,
    ): array {
        $this->assertBookBelongsTo($organization, $book);
        $cutoff = $this->cutoff($asOfDate, $book->time_zone);
        $organizationId = (int) $organization->getKey();
        $bookId = (int) $book->getKey();

        return match ($metric) {
            'net-sales' => $this->salesRecords($organizationId, $bookId, $asOfDate, $currency, $page),
            'overdue-receivables' => $this->receivableRecords($organizationId, $bookId, $asOfDate, $currency, $page),
            'available-stock' => $this->stockRecords($organizationId, $cutoff['utc'], $page),
            'pending-purchase-approvals' => $this->approvalRecords($organizationId, $cutoff['utc'], $page),
            default => abort(404),
        };
    }

    private function salesRecords(int $organizationId, int $bookId, string $asOfDate, string $currency, int $page): array
    {
        $query = $this->eligibleCustomerInvoices($organizationId, $bookId, $asOfDate)
            ->select([
                'invoices.id', 'invoices.code', 'invoices.effective_on', 'invoices.due_on', 'invoices.amount_rial',
                'invoices.sales_order_id', 'sales_orders.code AS source_code', 'parties.display_name AS party_name',
            ])
            ->orderBy('invoices.effective_on')
            ->orderBy('invoices.id');
        $total = (int) (clone $query)->count('invoices.id');
        $items = $query->forPage($page, self::PAGE_SIZE)->get()->map(fn ($invoice): array => [
            'id' => (int) $invoice->id,
            'code' => $invoice->code,
            'effective_on' => (string) $invoice->effective_on,
            'due_on' => (string) $invoice->due_on,
            'amount_rial' => (string) $invoice->amount_rial,
            'display_amount' => $this->displayAmount((string) $invoice->amount_rial, $currency),
            'party_name' => $invoice->party_name,
            'source' => [
                'id' => (int) $invoice->sales_order_id,
                'code' => $invoice->source_code,
                'href' => '/orders/'.$invoice->sales_order_id,
            ],
        ])->all();

        $sum = $this->eligibleCustomerInvoices($organizationId, $bookId, $asOfDate)
            ->selectRaw('COALESCE(SUM(invoices.amount_rial), 0) AS total_rial')
            ->value('total_rial');

        return $this->paginatedResult('net-sales', $items, $total, $page, [
            'total_rial' => (string) ($sum ?? '0'),
            'display_amount' => $this->displayAmount((string) ($sum ?? '0'), $currency),
            'currency' => $currency,
        ]);
    }

    private function receivableRecords(int $organizationId, int $bookId, string $asOfDate, string $currency, int $page): array
    {
        $query = $this->overdueReceivables($organizationId, $bookId, $asOfDate)
            ->select([
                'invoices.id', 'invoices.code', 'invoices.effective_on', 'invoices.due_on', 'invoices.amount_rial',
                'invoices.sales_order_id', 'sales_orders.code AS source_code', 'parties.display_name AS party_name',
            ])
            ->selectRaw('COALESCE(settled_allocations.allocated_rial, 0) AS allocated_rial')
            ->selectRaw('invoices.amount_rial - COALESCE(settled_allocations.allocated_rial, 0) AS outstanding_rial')
            ->orderBy('invoices.due_on')
            ->orderBy('invoices.id');
        $total = (int) (clone $query)->count('invoices.id');
        $items = $query->forPage($page, self::PAGE_SIZE)->get()->map(fn ($invoice): array => [
            'id' => (int) $invoice->id,
            'code' => $invoice->code,
            'effective_on' => (string) $invoice->effective_on,
            'due_on' => (string) $invoice->due_on,
            'amount_rial' => (string) $invoice->amount_rial,
            'allocated_rial' => (string) $invoice->allocated_rial,
            'outstanding_rial' => (string) $invoice->outstanding_rial,
            'display_outstanding' => $this->displayAmount((string) $invoice->outstanding_rial, $currency),
            'party_name' => $invoice->party_name,
            'source' => [
                'id' => (int) $invoice->sales_order_id,
                'code' => $invoice->source_code,
                'href' => '/orders/'.$invoice->sales_order_id,
            ],
        ])->all();

        $sum = $this->overdueReceivables($organizationId, $bookId, $asOfDate)
            ->selectRaw('COALESCE(SUM(invoices.amount_rial - COALESCE(settled_allocations.allocated_rial, 0)), 0) AS total_rial')
            ->value('total_rial');

        return $this->paginatedResult('overdue-receivables', $items, $total, $page, [
            'total_rial' => (string) ($sum ?? '0'),
            'display_amount' => $this->displayAmount((string) ($sum ?? '0'), $currency),
            'currency' => $currency,
        ]);
    }

    private function stockRecords(int $organizationId, string $cutoffUtc, int $page): array
    {
        $rows = $this->availableStockAsOf($organizationId, $cutoffUtc);
        $unitTotals = [];

        foreach ($rows as $row) {
            $unitId = $row['base_unit']['id'];
            $unitTotals[$unitId] ??= ['unit' => $row['base_unit'], 'quantity_milli' => 0];
            $unitTotals[$unitId]['quantity_milli'] += $row['available_milli'];
        }

        $items = array_map(static function (array $row): array {
            unset($row['available_milli']);

            return $row;
        }, array_slice($rows, ($page - 1) * self::PAGE_SIZE, self::PAGE_SIZE));

        return $this->paginatedResult('available-stock', $items, count($rows), $page, [
            'unit_totals' => array_values(array_map(fn (array $group): array => [
                'unit' => $group['unit'],
                'quantity_milli' => (string) $group['quantity_milli'],
                'quantity' => $this->formatQuantity($group['quantity_milli']),
            ], $unitTotals)),
            'scope' => 'organization',
        ]);
    }

    private function approvalRecords(int $organizationId, string $cutoffUtc, int $page): array
    {
        $query = $this->pendingApprovals($organizationId, $cutoffUtc)
            ->select([
                'requests.id', 'requests.code', 'requests.title', 'requests.status', 'requests.submitted_at',
                'requests.approved_at', 'submitters.name AS submitter_name',
            ])
            ->orderBy('requests.submitted_at')
            ->orderBy('requests.id');
        $total = (int) (clone $query)->count('requests.id');
        $items = $query->forPage($page, self::PAGE_SIZE)->get()->map(fn ($request): array => [
            'id' => (int) $request->id,
            'code' => $request->code,
            'title' => $request->title,
            'status' => $request->status,
            'submitted_at' => (string) $request->submitted_at,
            'approved_at' => $request->approved_at === null ? null : (string) $request->approved_at,
            'submitter_name' => $request->submitter_name,
            'href' => '/purchase-requests/'.$request->id,
        ])->all();

        return $this->paginatedResult('pending-purchase-approvals', $items, $total, $page, [
            'count' => $total,
            'scope' => 'organization',
        ]);
    }

    private function availableStockAsOf(int $organizationId, string $cutoffUtc): array
    {
        $movementRows = DB::table('inventory_movements')
            ->where('organization_id', $organizationId)
            ->where('created_at', '<=', $cutoffUtc)
            ->select(['product_id', 'base_unit_id', 'location_id'])
            ->selectRaw("SUM(CASE WHEN direction = 'inbound' THEN quantity_milli ELSE 0 END) AS inbound_milli")
            ->selectRaw("SUM(CASE WHEN direction = 'outbound' THEN quantity_milli ELSE 0 END) AS outbound_milli")
            ->selectRaw('COUNT(*) AS movement_count')
            ->groupBy('product_id', 'base_unit_id', 'location_id')
            ->get();
        $totals = [];

        foreach ($movementRows as $movement) {
            $key = $this->stockKey((int) $movement->product_id, (int) $movement->base_unit_id, (int) $movement->location_id);
            $totals[$key] = [
                'product_id' => (int) $movement->product_id,
                'base_unit_id' => (int) $movement->base_unit_id,
                'location_id' => (int) $movement->location_id,
                'physical_milli' => (int) $movement->inbound_milli - (int) $movement->outbound_milli,
                'reserved_milli' => 0,
                'movement_count' => (int) $movement->movement_count,
            ];
        }

        $deliveryTotals = DB::table('sales_order_deliveries')
            ->where('organization_id', $organizationId)
            ->where('created_at', '<=', $cutoffUtc)
            ->select('stock_reservation_id')
            ->selectRaw('SUM(quantity_milli) AS consumed_milli')
            ->groupBy('stock_reservation_id');

        $reservations = DB::table('stock_reservations AS reservations')
            ->leftJoinSub($deliveryTotals, 'deliveries', fn ($join) => $join->on('deliveries.stock_reservation_id', '=', 'reservations.id'))
            ->where('reservations.organization_id', $organizationId)
            ->where('reservations.created_at', '<=', $cutoffUtc)
            ->get([
                'reservations.product_id', 'reservations.base_unit_id', 'reservations.location_id',
                'reservations.quantity_milli', 'reservations.released_quantity_milli', 'reservations.released_at',
                'deliveries.consumed_milli',
            ]);

        foreach ($reservations as $reservation) {
            $key = $this->stockKey((int) $reservation->product_id, (int) $reservation->base_unit_id, (int) $reservation->location_id);
            $consumedMilli = (int) ($reservation->consumed_milli ?? 0);
            $releasedMilli = $reservation->released_at !== null && $reservation->released_at <= $cutoffUtc
                ? (int) $reservation->released_quantity_milli
                : 0;
            $outstandingMilli = (int) $reservation->quantity_milli - $consumedMilli - $releasedMilli;

            if ($outstandingMilli < 0) {
                throw new RuntimeException('The persisted reservation history is inconsistent.');
            }

            $totals[$key] ??= [
                'product_id' => (int) $reservation->product_id,
                'base_unit_id' => (int) $reservation->base_unit_id,
                'location_id' => (int) $reservation->location_id,
                'physical_milli' => 0,
                'reserved_milli' => 0,
                'movement_count' => 0,
            ];
            $totals[$key]['reserved_milli'] += $outstandingMilli;
        }

        $productIds = array_values(array_unique(array_column($totals, 'product_id')));
        $unitIds = array_values(array_unique(array_column($totals, 'base_unit_id')));
        $locationIds = array_values(array_unique(array_column($totals, 'location_id')));
        $products = Product::query()->where('organization_id', $organizationId)->whereIn('id', $productIds)->get()->keyBy('id');
        $units = Unit::query()->where('organization_id', $organizationId)->whereIn('id', $unitIds)->get()->keyBy('id');
        $locations = Location::query()->where('organization_id', $organizationId)->whereIn('id', $locationIds)->with('warehouse')->get()->keyBy('id');
        $rows = [];

        foreach ($totals as $total) {
            $availableMilli = $total['physical_milli'] - $total['reserved_milli'];

            if ($total['physical_milli'] < 0 || $availableMilli < 0) {
                throw new RuntimeException('The historical stock ledger and reservations are inconsistent.');
            }

            if ($availableMilli === 0) {
                continue;
            }

            $product = $products->get($total['product_id']);
            $unit = $units->get($total['base_unit_id']);
            $location = $locations->get($total['location_id']);

            if ($product === null || $unit === null || $location === null || $location->warehouse === null) {
                throw new RuntimeException('A stock report row references unavailable organization-owned master data.');
            }

            $rows[] = [
                'product' => ['id' => (int) $product->getKey(), 'code' => $product->code, 'name' => $product->name],
                'base_unit' => ['id' => (int) $unit->getKey(), 'code' => $unit->code, 'name' => $unit->name, 'symbol' => $unit->symbol],
                'location' => [
                    'id' => (int) $location->getKey(),
                    'code' => $location->code,
                    'name' => $location->name,
                    'warehouse' => [
                        'id' => (int) $location->warehouse->getKey(),
                        'code' => $location->warehouse->code,
                        'name' => $location->warehouse->name,
                    ],
                ],
                'physical_quantity' => $this->formatQuantity($total['physical_milli']),
                'reserved_quantity' => $this->formatQuantity($total['reserved_milli']),
                'available_quantity' => $this->formatQuantity($availableMilli),
                'movement_count' => $total['movement_count'],
                'available_milli' => $availableMilli,
            ];
        }

        usort($rows, fn (array $left, array $right): int => [
            $left['product']['code'], $left['location']['code'], $left['base_unit']['code'],
        ] <=> [
            $right['product']['code'], $right['location']['code'], $right['base_unit']['code'],
        ]);

        return $rows;
    }

    private function eligibleCustomerInvoices(int $organizationId, int $bookId, string $asOfDate): Builder
    {
        return DB::table('p10_invoices AS invoices')
            ->join('accounting_journals AS invoice_journals', function ($join): void {
                $join->on('invoice_journals.organization_id', '=', 'invoices.organization_id')
                    ->on('invoice_journals.book_id', '=', 'invoices.book_id')
                    ->on('invoice_journals.id', '=', 'invoices.journal_id')
                    ->where('invoice_journals.status', '=', 'posted');
            })
            ->leftJoin('sales_orders', function ($join): void {
                $join->on('sales_orders.organization_id', '=', 'invoices.organization_id')
                    ->on('sales_orders.id', '=', 'invoices.sales_order_id');
            })
            ->join('parties', function ($join): void {
                $join->on('parties.organization_id', '=', 'invoices.organization_id')
                    ->on('parties.id', '=', 'invoices.party_id');
            })
            ->where('invoices.organization_id', $organizationId)
            ->where('invoices.book_id', $bookId)
            ->where('invoices.direction', 'customer')
            ->where('invoices.status', 'posted')
            ->where('invoices.effective_on', '<=', $asOfDate);
    }

    private function overdueReceivables(int $organizationId, int $bookId, string $asOfDate): Builder
    {
        $settledAllocations = DB::table('p10_allocations AS allocations')
            ->join('p10_treasury_movements AS settlements', function ($join): void {
                $join->on('settlements.organization_id', '=', 'allocations.organization_id')
                    ->on('settlements.book_id', '=', 'allocations.book_id')
                    ->on('settlements.id', '=', 'allocations.treasury_movement_id')
                    ->where('settlements.direction', '=', 'customer_receipt');
            })
            ->join('accounting_journals AS settlement_journals', function ($join): void {
                $join->on('settlement_journals.organization_id', '=', 'allocations.organization_id')
                    ->on('settlement_journals.book_id', '=', 'allocations.book_id')
                    ->on('settlement_journals.id', '=', 'allocations.journal_id')
                    ->where('settlement_journals.status', '=', 'posted');
            })
            ->where('allocations.organization_id', $organizationId)
            ->where('allocations.book_id', $bookId)
            ->where('allocations.direction', 'customer')
            ->where('settlements.effective_on', '<=', $asOfDate)
            ->select('allocations.invoice_id')
            ->selectRaw('SUM(allocations.amount_rial) AS allocated_rial')
            ->groupBy('allocations.invoice_id');

        return $this->eligibleCustomerInvoices($organizationId, $bookId, $asOfDate)
            ->leftJoinSub($settledAllocations, 'settled_allocations', fn ($join) => $join->on('settled_allocations.invoice_id', '=', 'invoices.id'))
            ->where('invoices.due_on', '<', $asOfDate)
            ->whereRaw('invoices.amount_rial > COALESCE(settled_allocations.allocated_rial, 0)');
    }

    private function pendingApprovals(int $organizationId, string $cutoffUtc): Builder
    {
        return DB::table('purchase_requests AS requests')
            ->leftJoin('users AS submitters', 'submitters.id', '=', 'requests.submitted_by')
            ->where('requests.organization_id', $organizationId)
            ->whereIn('requests.status', ['submitted', 'approved', 'converted'])
            ->whereNotNull('requests.submitted_at')
            ->where('requests.submitted_at', '<=', $cutoffUtc)
            ->where(fn ($query) => $query->whereNull('requests.approved_at')->orWhere('requests.approved_at', '>', $cutoffUtc));
    }

    private function cutoff(string $asOfDate, string $timeZone): array
    {
        $local = CarbonImmutable::createFromFormat('!Y-m-d', $asOfDate, $timeZone)->endOfDay();

        return [
            'local' => $local->format('Y-m-d H:i:s P').' '.$timeZone,
            'utc' => $local->utc()->format('Y-m-d H:i:s'),
        ];
    }

    private function paginatedResult(string $metric, array $items, int $total, int $page, array $reconciliation): array
    {
        $lastPage = max(1, (int) ceil($total / self::PAGE_SIZE));

        return [
            'metric' => $metric,
            'records' => $items,
            'pagination' => [
                'current_page' => $page,
                'per_page' => self::PAGE_SIZE,
                'total_records' => $total,
                'last_page' => $lastPage,
                'previous_page' => $page > 1 ? $page - 1 : null,
                'next_page' => $page < $lastPage ? $page + 1 : null,
            ],
            'reconciliation' => $reconciliation,
        ];
    }

    private function displayAmount(string $amountRial, string $currency): string
    {
        if ($currency === 'IRR') {
            return $amountRial;
        }

        $amountRial = ltrim($amountRial, '0') ?: '0';
        if (strlen($amountRial) === 1) {
            return $amountRial === '0' ? '0' : '0.'.$amountRial;
        }

        $whole = substr($amountRial, 0, -1);
        $fraction = substr($amountRial, -1);

        return $fraction === '0' ? $whole : $whole.'.'.$fraction;
    }

    private function formatQuantity(int $milli): string
    {
        return intdiv($milli, 1000).'.'.str_pad((string) ($milli % 1000), 3, '0', STR_PAD_LEFT);
    }

    private function stockKey(int $productId, int $unitId, int $locationId): string
    {
        return $productId.':'.$unitId.':'.$locationId;
    }

    private function assertBookBelongsTo(Organization $organization, AccountingBook $book): void
    {
        abort_unless((int) $book->organization_id === (int) $organization->getKey(), 404);
    }
}
