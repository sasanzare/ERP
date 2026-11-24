<?php

namespace App\Services\Settlements;

use App\Models\AccountingBook;
use App\Models\AccountingJournal;
use App\Models\Organization;
use App\Models\P10AccountingProfile;
use App\Models\P10Allocation;
use App\Models\P10Invoice;
use App\Models\P10InvoiceLine;
use App\Models\P10OpenItem;
use App\Models\P10TreasuryMovement;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderLine;
use App\Models\PurchaseReceipt;
use App\Models\SalesOrder;
use App\Models\SalesOrderDelivery;
use App\Models\SalesOrderLine;
use App\Models\User;
use App\Services\Accounting\AccountingMoneyCalculator;
use App\Services\Accounting\AccountingService;
use App\Services\Stock\StockService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

class P10SettlementService
{
    public function __construct(
        private readonly AccountingMoneyCalculator $money,
        private readonly AccountingService $accounting,
        private readonly P10AmountCalculator $amounts,
        private readonly P10PostingProfileResolver $profiles,
    ) {}

    public function options(Organization $organization): array
    {
        $books = AccountingBook::query()
            ->where('organization_id', $organization->getKey())
            ->orderBy('name')->orderBy('id')->get();

        return [
            'books' => $books->map(function (AccountingBook $book) use ($organization): array {
                $profile = P10AccountingProfile::query()
                    ->where('organization_id', $organization->getKey())
                    ->where('book_id', $book->getKey())
                    ->first();
                try {
                    $this->profiles->resolve($organization, $book);
                    $ready = true;
                    $message = null;
                } catch (HttpException $exception) {
                    $ready = false;
                    $message = $exception->getMessage();
                }

                return [
                    'id' => (int) $book->getKey(),
                    'code' => $book->code,
                    'name' => $book->name,
                    'currency_code' => $book->currency_code,
                    'currency_scale' => (int) $book->currency_scale,
                    'posting_ready' => $ready,
                    'posting_blocker' => $message,
                    'posting_mode' => $profile?->status,
                ];
            })->values()->all(),
            'customer_sources' => $this->customerSources($organization),
            'supplier_sources' => $this->supplierSources($organization),
            'policy' => [
                'source_posting_enabled' => $books->contains(fn (AccountingBook $book): bool => $this->profileReady($organization, $book)),
                'partial_invoice_basis' => 'delivered_or_received_quantity',
                'tax_treatment' => 'not_configured',
                'allocation_rule' => 'each_movement_is_fully_allocated_to_one_invoice',
            ],
        ];
    }

    /** @return array<int, array<string, mixed>> */
    public function invoices(Organization $organization, ?string $direction = null): array
    {
        $query = P10Invoice::query()
            ->where('organization_id', $organization->getKey())
            ->with([
                'book', 'party', 'salesOrder', 'purchaseOrder', 'journal', 'openItem', 'lines',
                'lines.salesDelivery.operation', 'lines.salesDelivery.movement',
                'lines.purchaseReceipt.operation', 'lines.purchaseReceipt.movement',
                'allocations.treasuryMovement.journal', 'allocations.journal',
            ]);

        if ($direction !== null) {
            $query->where('direction', $direction);
        }

        return $query->orderByDesc('effective_on')->orderByDesc('id')->limit(200)->get()
            ->map(fn (P10Invoice $invoice): array => $this->serializeInvoice($invoice))
            ->all();
    }

    /** @param array<int, array<string, mixed>> $inputLines */
    public function postCustomerInvoice(
        Organization $organization,
        User $actor,
        int $salesOrderId,
        int $bookId,
        string $effectiveOn,
        string $dueOn,
        array $inputLines,
        string $idempotencyKey,
    ): array {
        return $this->postInvoice(
            $organization, $actor, 'customer', $salesOrderId, $bookId, $effectiveOn, $dueOn, $inputLines, $idempotencyKey,
        );
    }

    /** @param array<int, array<string, mixed>> $inputLines */
    public function postSupplierInvoice(
        Organization $organization,
        User $actor,
        int $purchaseOrderId,
        int $bookId,
        string $effectiveOn,
        string $dueOn,
        array $inputLines,
        string $idempotencyKey,
    ): array {
        return $this->postInvoice(
            $organization, $actor, 'supplier', $purchaseOrderId, $bookId, $effectiveOn, $dueOn, $inputLines, $idempotencyKey,
        );
    }

    /** @return array{movement: P10TreasuryMovement, allocation: P10Allocation, invoice: P10Invoice, already_exists: bool} */
    public function settleInvoice(
        Organization $organization,
        User $actor,
        int $invoiceId,
        string $direction,
        mixed $amount,
        string $effectiveOn,
        ?string $reference,
        string $idempotencyKey,
    ): array {
        $this->validateIdempotencyKey($idempotencyKey);
        $amountRial = $this->money->normalizeRial($amount, 'amount_rial', false);
        $target = P10Invoice::query()
            ->where('organization_id', $organization->getKey())
            ->where('direction', $direction)
            ->findOrFail($invoiceId);
        $bookId = (int) $target->book_id;
        $hash = $this->hash([
            'direction' => $direction,
            'invoice_id' => $invoiceId,
            'amount_rial' => $amountRial,
            'effective_on' => $effectiveOn,
            'reference' => $reference,
        ]);

        return DB::transaction(function () use (
            $organization, $actor, $invoiceId, $direction, $amountRial, $effectiveOn, $reference,
            $idempotencyKey, $hash, $bookId,
        ): array {
            $this->lockBook($organization, $bookId);
            $movementDirection = $direction === 'customer' ? 'customer_receipt' : 'supplier_payment';
            $existing = P10TreasuryMovement::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $bookId)
                ->where('direction', $movementDirection)
                ->where('idempotency_key', $idempotencyKey)
                ->lockForUpdate()->first();

            if ($existing !== null) {
                if (! hash_equals($existing->request_hash, $hash)) {
                    throw new HttpException(409, 'کلید تکرار با مبلغ، تاریخ یا صورتحساب دیگری استفاده شده است.');
                }

                return $this->existingSettlement($organization, $existing);
            }

            $book = AccountingBook::query()
                ->where('organization_id', $organization->getKey())
                ->findOrFail($bookId);
            $profile = $this->profiles->resolve($organization, $book);
            $invoice = P10Invoice::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $bookId)
                ->where('direction', $direction)
                ->lockForUpdate()->findOrFail($invoiceId);
            $openItem = P10OpenItem::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $bookId)
                ->where('invoice_id', $invoice->getKey())
                ->lockForUpdate()->first();

            if ($openItem === null) {
                throw new HttpException(409, 'برای این صورتحساب قلم باز ثبت‌شده‌ای وجود ندارد.');
            }

            $allocatedRial = (int) P10Allocation::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $bookId)
                ->where('open_item_id', $openItem->getKey())
                ->sum('amount_rial');
            $openRial = (int) $openItem->original_amount_rial;
            if ($allocatedRial > $openRial) {
                throw new \RuntimeException('The P10 allocations exceed their open item amount.');
            }
            $outstanding = $openRial - $allocatedRial;
            if ((int) $amountRial > $outstanding) {
                throw ValidationException::withMessages(['amount_rial' => 'مبلغ تسویه از ماندهٔ صورتحساب بیشتر است.']);
            }

            $treasuryAccountId = $direction === 'customer'
                ? (int) $profile->customer_treasury_account_id
                : (int) $profile->supplier_treasury_account_id;
            $movement = P10TreasuryMovement::query()->create([
                'organization_id' => $organization->getKey(),
                'book_id' => $bookId,
                'direction' => $movementDirection,
                'party_id' => $invoice->party_id,
                'treasury_account_id' => $treasuryAccountId,
                'effective_on' => $effectiveOn,
                'currency_code' => 'IRR',
                'currency_scale' => 0,
                'amount_rial' => $amountRial,
                'reference' => $reference,
                'idempotency_key' => $idempotencyKey,
                'request_hash' => $hash,
                'posting_key' => (string) Str::uuid(),
                'created_by' => $actor->getKey(),
            ]);

            $journal = $this->postSettlementJournal($organization, $actor, $invoice, $movement, $profile, $amountRial);
            $movement->forceFill(['journal_id' => $journal->getKey(), 'posted_at' => now()])->save();
            $allocation = P10Allocation::query()->create([
                'organization_id' => $organization->getKey(),
                'book_id' => $bookId,
                'invoice_id' => $invoice->getKey(),
                'open_item_id' => $openItem->getKey(),
                'treasury_movement_id' => $movement->getKey(),
                'direction' => $direction,
                'amount_rial' => $amountRial,
                'journal_id' => $journal->getKey(),
            ]);

            return [
                'movement' => $movement->load(['party', 'treasuryAccount', 'journal']),
                'allocation' => $allocation->load(['invoice', 'openItem', 'treasuryMovement.journal', 'journal']),
                'invoice' => $this->freshInvoice($organization, (int) $invoice->getKey()),
                'already_exists' => false,
            ];
        }, 3);
    }

    private function postInvoice(
        Organization $organization,
        User $actor,
        string $direction,
        int $sourceId,
        int $bookId,
        string $effectiveOn,
        string $dueOn,
        array $inputLines,
        string $idempotencyKey,
    ): array {
        $this->validateIdempotencyKey($idempotencyKey);
        $normalizedLines = $this->normalizeInvoiceLines($direction, $inputLines);
        $sourceType = $direction === 'customer' ? 'sales_order_id' : 'purchase_order_id';
        $hash = $this->hash([
            'direction' => $direction,
            'source_id' => $sourceId,
            'book_id' => $bookId,
            'effective_on' => $effectiveOn,
            'due_on' => $dueOn,
            'lines' => $normalizedLines,
        ]);

        // Resolve the primary document before opening/locking a related record.
        $source = $direction === 'customer'
            ? SalesOrder::query()->where('organization_id', $organization->getKey())->findOrFail($sourceId)
            : PurchaseOrder::query()->where('organization_id', $organization->getKey())->findOrFail($sourceId);
        $book = AccountingBook::query()->where('organization_id', $organization->getKey())->findOrFail($bookId);

        return DB::transaction(function () use (
            $organization, $actor, $direction, $sourceId, $bookId, $effectiveOn, $dueOn,
            $normalizedLines, $idempotencyKey, $hash, $sourceType, $book,
        ): array {
            // Lock order: accounting book → source document → source lines/events → open item.
            // AccountingService then uses book → journal → period → sorted accounts.
            $this->lockBook($organization, $bookId);
            $existing = P10Invoice::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $bookId)
                ->where('direction', $direction)
                ->where('idempotency_key', $idempotencyKey)
                ->lockForUpdate()->first();

            if ($existing !== null) {
                if (! hash_equals($existing->request_hash, $hash)
                    || (int) $existing->{$sourceType} !== $sourceId) {
                    throw new HttpException(409, 'کلید تکرار با منبع یا محتوای دیگری استفاده شده است.');
                }

                return ['invoice' => $this->freshInvoice($organization, (int) $existing->getKey()), 'already_exists' => true];
            }

            $profile = $this->profiles->resolve($organization, $book);
            if ($direction === 'customer') {
                $source = SalesOrder::query()
                    ->where('organization_id', $organization->getKey())
                    ->lockForUpdate()->findOrFail($sourceId);
                if ($source->status !== 'confirmed') {
                    throw ValidationException::withMessages(['sales_order' => 'فقط سفارش فروش تأییدشده صورتحساب می‌شود.']);
                }
                [$invoice, $totalRial] = $this->createCustomerInvoiceLines(
                    $organization, $actor, $source, $bookId, $effectiveOn, $dueOn, $normalizedLines, $idempotencyKey, $hash,
                );
                $accountLines = [
                    ['account_id' => (int) $profile->customer_receivable_account_id, 'memo' => 'دریافتنی صورتحساب '.$invoice->code, 'debit_rial' => $totalRial, 'credit_rial' => '0'],
                    ['account_id' => (int) $profile->customer_revenue_account_id, 'memo' => 'درآمد صورتحساب '.$invoice->code, 'debit_rial' => '0', 'credit_rial' => $totalRial],
                ];
                $sourceReferenceType = 'p10.customer_invoice';
            } else {
                $source = PurchaseOrder::query()
                    ->where('organization_id', $organization->getKey())
                    ->lockForUpdate()->findOrFail($sourceId);
                [$invoice, $totalRial] = $this->createSupplierInvoiceLines(
                    $organization, $actor, $source, $bookId, $effectiveOn, $dueOn, $normalizedLines, $idempotencyKey, $hash,
                );
                $accountLines = [
                    ['account_id' => (int) $profile->supplier_debit_account_id, 'memo' => 'خرید صورتحساب '.$invoice->code, 'debit_rial' => $totalRial, 'credit_rial' => '0'],
                    ['account_id' => (int) $profile->supplier_payable_account_id, 'memo' => 'پرداختنی صورتحساب '.$invoice->code, 'debit_rial' => '0', 'credit_rial' => $totalRial],
                ];
                $sourceReferenceType = 'p10.supplier_invoice';
            }

            if ($totalRial === '0') {
                throw ValidationException::withMessages(['lines' => 'صورتحساب باید مبلغی مثبت داشته باشد.']);
            }

            $journal = $this->accounting->postBalancedLines(
                $organization,
                $actor,
                $bookId,
                $effectiveOn,
                ($direction === 'customer' ? 'ثبت صورتحساب مشتری ' : 'ثبت صورتحساب تأمین‌کننده ').$invoice->code,
                $accountLines,
                [
                    'organization_id' => (int) $organization->getKey(),
                    'type' => $sourceReferenceType,
                    'record_id' => (string) $invoice->getKey(),
                    'event_key' => 'post',
                ],
                (string) $invoice->posting_key,
            );

            $invoice->forceFill([
                'amount_rial' => $totalRial,
                'journal_id' => $journal['journal']->getKey(),
                'status' => 'posted',
                'posted_by' => $actor->getKey(),
                'posted_at' => now(),
            ])->save();
            P10OpenItem::query()->create([
                'organization_id' => $organization->getKey(),
                'book_id' => $bookId,
                'invoice_id' => $invoice->getKey(),
                'direction' => $direction,
                'party_id' => $invoice->party_id,
                'effective_on' => $effectiveOn,
                'due_on' => $dueOn,
                'currency_code' => 'IRR',
                'currency_scale' => 0,
                'original_amount_rial' => $totalRial,
            ]);

            return ['invoice' => $this->freshInvoice($organization, (int) $invoice->getKey()), 'already_exists' => false];
        }, 3);
    }

    /** @param array<int, array{sales_order_line_id: int, sales_order_delivery_id: int, quantity_milli: int}> $lines */
    private function createCustomerInvoiceLines(
        Organization $organization,
        User $actor,
        SalesOrder $order,
        int $bookId,
        string $effectiveOn,
        string $dueOn,
        array $lines,
        string $idempotencyKey,
        string $hash,
    ): array {
        $lineIds = array_values(array_unique(array_column($lines, 'sales_order_line_id')));
        $sourceLines = SalesOrderLine::query()
            ->where('organization_id', $organization->getKey())
            ->where('sales_order_id', $order->getKey())
            ->whereIn('id', $lineIds)
            ->orderBy('id')->lockForUpdate()->get()->keyBy('id');
        if ($sourceLines->count() !== count($lineIds)) {
            abort(404);
        }

        $invoice = $this->newInvoiceHeader(
            $organization, $actor, $bookId, 'customer', (int) $order->customer_party_id, $order->getKey(), null,
            $effectiveOn, $dueOn, $idempotencyKey, $hash,
        );
        $billedByLine = [];
        $amounts = [];
        $number = 0;

        foreach ($lines as $input) {
            /** @var SalesOrderLine|null $line */
            $line = $sourceLines->get($input['sales_order_line_id']);
            if ($line === null) {
                abort(404);
            }
            $delivery = SalesOrderDelivery::query()
                ->where('organization_id', $organization->getKey())
                ->where('sales_order_line_id', $line->getKey())
                ->lockForUpdate()->findOrFail($input['sales_order_delivery_id']);
            $alreadyOnDelivery = (int) P10InvoiceLine::query()
                ->where('organization_id', $organization->getKey())
                ->where('sales_order_delivery_id', $delivery->getKey())
                ->sum('quantity_milli');
            $deliveryRemaining = (int) $delivery->quantity_milli - $alreadyOnDelivery;
            if ($input['quantity_milli'] > $deliveryRemaining) {
                throw ValidationException::withMessages(['lines' => 'مقدار صورتحساب از تحویل باقی‌مانده بیشتر است.']);
            }

            if (! array_key_exists($line->getKey(), $billedByLine)) {
                $billedByLine[$line->getKey()] = (int) P10InvoiceLine::query()
                    ->where('organization_id', $organization->getKey())
                    ->where('sales_order_line_id', $line->getKey())
                    ->sum('quantity_milli');
            }
            $orderedMilli = StockService::quantityToMilli((string) $line->quantity);
            $itemAmount = $this->amounts->customerAmountRial(
                (string) $line->line_net_toman,
                $orderedMilli,
                $billedByLine[$line->getKey()],
                $input['quantity_milli'],
                'lines',
            );
            $billedByLine[$line->getKey()] += $input['quantity_milli'];
            $amounts[] = $itemAmount['amount_rial'];
            P10InvoiceLine::query()->create([
                'organization_id' => $organization->getKey(),
                'book_id' => $bookId,
                'invoice_id' => $invoice->getKey(),
                'line_number' => ++$number,
                'sales_order_line_id' => $line->getKey(),
                'sales_order_delivery_id' => $delivery->getKey(),
                'item_code_snapshot' => $line->product_code_snapshot,
                'item_name_snapshot' => $line->product_name_snapshot,
                'unit_name_snapshot' => $line->unit_name_snapshot,
                'quantity_milli' => $input['quantity_milli'],
                'amount_rial' => $itemAmount['amount_rial'],
                'source_amount_toman' => $itemAmount['source_amount_toman'],
            ]);
        }

        $totalRial = $this->money->sum($amounts, 'lines');
        if ($totalRial === '0') {
            throw ValidationException::withMessages(['lines' => 'صورتحساب باید مبلغی مثبت داشته باشد.']);
        }

        return [$invoice, $totalRial];
    }

    /** @param array<int, array{purchase_order_line_id: int, purchase_receipt_id: int, quantity_milli: int}> $lines */
    private function createSupplierInvoiceLines(
        Organization $organization,
        User $actor,
        PurchaseOrder $order,
        int $bookId,
        string $effectiveOn,
        string $dueOn,
        array $lines,
        string $idempotencyKey,
        string $hash,
    ): array {
        $lineIds = array_values(array_unique(array_column($lines, 'purchase_order_line_id')));
        $sourceLines = PurchaseOrderLine::query()
            ->where('organization_id', $organization->getKey())
            ->where('purchase_order_id', $order->getKey())
            ->whereIn('id', $lineIds)
            ->orderBy('id')->lockForUpdate()->get()->keyBy('id');
        if ($sourceLines->count() !== count($lineIds)) {
            abort(404);
        }

        $invoice = $this->newInvoiceHeader(
            $organization, $actor, $bookId, 'supplier', (int) $order->supplier_party_id, null, $order->getKey(),
            $effectiveOn, $dueOn, $idempotencyKey, $hash,
        );
        $amounts = [];
        $billedByLine = [];
        $number = 0;

        foreach ($lines as $input) {
            /** @var PurchaseOrderLine|null $line */
            $line = $sourceLines->get($input['purchase_order_line_id']);
            if ($line === null) {
                abort(404);
            }
            $receipt = PurchaseReceipt::query()
                ->where('organization_id', $organization->getKey())
                ->where('purchase_order_id', $order->getKey())
                ->where('purchase_order_line_id', $line->getKey())
                ->lockForUpdate()->findOrFail($input['purchase_receipt_id']);
            $alreadyOnReceipt = (int) P10InvoiceLine::query()
                ->where('organization_id', $organization->getKey())
                ->where('purchase_receipt_id', $receipt->getKey())
                ->sum('quantity_milli');
            if ($input['quantity_milli'] > (int) $receipt->quantity_milli - $alreadyOnReceipt) {
                throw ValidationException::withMessages(['lines' => 'مقدار صورتحساب از رسید انبار باقی‌مانده بیشتر است.']);
            }

            $billedByLine[$line->getKey()] ??= (int) P10InvoiceLine::query()
                ->where('organization_id', $organization->getKey())
                ->where('purchase_order_line_id', $line->getKey())
                ->sum('quantity_milli');
            $receivedMilli = (int) $line->received_quantity_milli;
            if ($billedByLine[$line->getKey()] > $receivedMilli - $input['quantity_milli']) {
                throw ValidationException::withMessages(['lines' => 'مقدار باقی‌ماندهٔ صورتحساب این سطر معتبر نیست.']);
            }
            $lineAmount = $this->amounts->supplierCumulativeAmountRial(
                $billedByLine[$line->getKey()], $input['quantity_milli'], (string) $line->unit_price_rial, 'lines',
            );
            $billedByLine[$line->getKey()] += $input['quantity_milli'];
            $amounts[] = $lineAmount;
            P10InvoiceLine::query()->create([
                'organization_id' => $organization->getKey(),
                'book_id' => $bookId,
                'invoice_id' => $invoice->getKey(),
                'line_number' => ++$number,
                'purchase_order_line_id' => $line->getKey(),
                'purchase_receipt_id' => $receipt->getKey(),
                'item_code_snapshot' => $line->product_code_snapshot,
                'item_name_snapshot' => $line->product_name_snapshot,
                'unit_name_snapshot' => $line->unit_name_snapshot,
                'quantity_milli' => $input['quantity_milli'],
                'amount_rial' => $lineAmount,
            ]);
        }

        $totalRial = $this->money->sum($amounts, 'lines');
        if ($totalRial === '0') {
            throw ValidationException::withMessages(['lines' => 'صورتحساب باید مبلغی مثبت داشته باشد.']);
        }

        return [$invoice, $totalRial];
    }

    private function newInvoiceHeader(
        Organization $organization,
        User $actor,
        int $bookId,
        string $direction,
        int $partyId,
        ?int $salesOrderId,
        ?int $purchaseOrderId,
        string $effectiveOn,
        string $dueOn,
        string $idempotencyKey,
        string $hash,
    ): P10Invoice {
        $invoice = P10Invoice::query()->create([
            'organization_id' => $organization->getKey(),
            'book_id' => $bookId,
            'direction' => $direction,
            'party_id' => $partyId,
            'sales_order_id' => $salesOrderId,
            'purchase_order_id' => $purchaseOrderId,
            'code' => 'TMP-'.Str::uuid(),
            'effective_on' => $effectiveOn,
            'due_on' => $dueOn,
            'currency_code' => 'IRR',
            'currency_scale' => 0,
            'amount_rial' => null,
            'status' => 'draft',
            'idempotency_key' => $idempotencyKey,
            'request_hash' => $hash,
            'posting_key' => (string) Str::uuid(),
            'created_by' => $actor->getKey(),
            'posted_by' => null,
            'posted_at' => null,
        ]);
        $prefix = $direction === 'customer' ? 'CINV-' : 'SINV-';
        $invoice->forceFill(['code' => $prefix.str_pad((string) $invoice->getKey(), 8, '0', STR_PAD_LEFT)])->save();

        return $invoice;
    }

    private function postSettlementJournal(
        Organization $organization,
        User $actor,
        P10Invoice $invoice,
        P10TreasuryMovement $movement,
        P10AccountingProfile $profile,
        string $amountRial,
    ): AccountingJournal {
        if ($invoice->direction === 'customer') {
            $lines = [
                ['account_id' => (int) $profile->customer_treasury_account_id, 'memo' => 'دریافت مشتری '.$movement->getKey(), 'debit_rial' => $amountRial, 'credit_rial' => '0'],
                ['account_id' => (int) $profile->customer_receivable_account_id, 'memo' => 'تسویه دریافتنی '.$invoice->code, 'debit_rial' => '0', 'credit_rial' => $amountRial],
            ];
            $sourceType = 'p10.customer_receipt';
            $description = 'دریافت از مشتری بابت '.$invoice->code;
        } else {
            $lines = [
                ['account_id' => (int) $profile->supplier_payable_account_id, 'memo' => 'تسویه پرداختنی '.$invoice->code, 'debit_rial' => $amountRial, 'credit_rial' => '0'],
                ['account_id' => (int) $profile->supplier_treasury_account_id, 'memo' => 'پرداخت تأمین‌کننده '.$movement->getKey(), 'debit_rial' => '0', 'credit_rial' => $amountRial],
            ];
            $sourceType = 'p10.supplier_payment';
            $description = 'پرداخت به تأمین‌کننده بابت '.$invoice->code;
        }

        $result = $this->accounting->postBalancedLines(
            $organization,
            $actor,
            (int) $invoice->book_id,
            $movement->effective_on->format('Y-m-d'),
            $description,
            $lines,
            [
                'organization_id' => (int) $organization->getKey(),
                'type' => $sourceType,
                'record_id' => (string) $movement->getKey(),
                'event_key' => 'post',
            ],
            (string) $movement->posting_key,
        );

        return $result['journal'];
    }

    /** @param array<int, array<string, mixed>> $inputLines @return array<int, array<string, mixed>> */
    private function normalizeInvoiceLines(string $direction, array $inputLines): array
    {
        $expected = $direction === 'customer'
            ? ['sales_order_line_id', 'sales_order_delivery_id']
            : ['purchase_order_line_id', 'purchase_receipt_id'];
        if ($inputLines === [] || count($inputLines) > 100) {
            throw ValidationException::withMessages(['lines' => 'صورتحساب باید دست‌کم یک و حداکثر ۱۰۰ منبع داشته باشد.']);
        }

        $normalized = [];
        $events = [];
        foreach ($inputLines as $index => $line) {
            $lineId = filter_var($line[$expected[0]] ?? null, FILTER_VALIDATE_INT);
            $eventId = filter_var($line[$expected[1]] ?? null, FILTER_VALIDATE_INT);
            if ($lineId === false || $lineId < 1 || $eventId === false || $eventId < 1) {
                throw ValidationException::withMessages(["lines.$index" => 'شناسهٔ سطر یا رویداد مبدأ معتبر نیست.']);
            }
            $quantity = $this->amounts->normalizeQuantityMilli($line['quantity_milli'] ?? null, "lines.$index.quantity_milli");
            if (isset($events[$eventId])) {
                throw ValidationException::withMessages(["lines.$index" => 'هر تحویل یا رسید فقط یک‌بار در صورتحساب می‌آید.']);
            }
            $events[$eventId] = true;
            $normalized[] = [$expected[0] => $lineId, $expected[1] => $eventId, 'quantity_milli' => $quantity];
        }

        usort($normalized, fn (array $left, array $right): int => $left[$expected[1]] <=> $right[$expected[1]]);

        return $normalized;
    }

    public function serializeInvoice(P10Invoice $invoice): array
    {
        $allocated = (int) $invoice->allocations->sum(fn (P10Allocation $allocation): int => (int) $allocation->amount_rial);
        $amount = (int) $invoice->amount_rial;
        $balance = $amount - $allocated;
        $journal = $invoice->journal;

        return [
            'id' => (int) $invoice->getKey(),
            'code' => $invoice->code,
            'direction' => $invoice->direction,
            'status' => $invoice->status,
            'currency' => ['code' => $invoice->currency_code, 'scale' => (int) $invoice->currency_scale],
            'amount_rial' => (string) $amount,
            'amount_toman' => $invoice->direction === 'customer' ? $this->rialAsToman($amount) : null,
            'allocated_rial' => (string) $allocated,
            'outstanding_rial' => (string) $balance,
            'outstanding_toman' => $invoice->direction === 'customer' ? $this->rialAsToman($balance) : null,
            'effective_on' => $invoice->effective_on->format('Y-m-d'),
            'due_on' => $invoice->due_on->format('Y-m-d'),
            'book' => ['id' => (int) $invoice->book_id, 'code' => $invoice->book?->code, 'name' => $invoice->book?->name],
            'party' => ['id' => (int) $invoice->party_id, 'name' => $invoice->party?->display_name],
            'source' => $invoice->direction === 'customer'
                ? ['type' => 'sales_order', 'id' => (int) $invoice->sales_order_id, 'code' => $invoice->salesOrder?->code]
                : ['type' => 'purchase_order', 'id' => (int) $invoice->purchase_order_id, 'code' => $invoice->purchaseOrder?->code],
            'journal' => $journal === null ? null : [
                'id' => (int) $journal->getKey(), 'code' => $journal->code, 'status' => $journal->status,
                'accounting_date' => $journal->accounting_date->format('Y-m-d'),
                'debit_total_rial' => (string) $journal->debit_total_rial,
                'credit_total_rial' => (string) $journal->credit_total_rial,
            ],
            'lines' => $invoice->lines->map(function (P10InvoiceLine $line): array {
                $source = $line->sales_order_delivery_id !== null
                    ? [
                        'type' => 'sales_delivery', 'id' => (int) $line->sales_order_delivery_id,
                        'operation_id' => $line->salesDelivery?->inventory_operation_id,
                        'movement_id' => $line->salesDelivery?->inventory_movement_id,
                    ]
                    : [
                        'type' => 'warehouse_receipt', 'id' => (int) $line->purchase_receipt_id,
                        'operation_id' => $line->purchaseReceipt?->inventory_operation_id,
                        'movement_id' => $line->purchaseReceipt?->inventory_movement_id,
                    ];

                return [
                    'id' => (int) $line->getKey(), 'line_number' => (int) $line->line_number,
                    'source_line_id' => (int) ($line->sales_order_line_id ?? $line->purchase_order_line_id),
                    'item_code' => $line->item_code_snapshot, 'item_name' => $line->item_name_snapshot,
                    'unit_name' => $line->unit_name_snapshot, 'quantity_milli' => (string) $line->quantity_milli,
                    'quantity' => StockService::milliToQuantity($line->quantity_milli),
                    'amount_rial' => (string) $line->amount_rial,
                    'source_amount_toman' => $line->source_amount_toman,
                    'source' => $source,
                ];
            })->all(),
            'allocations' => $invoice->allocations->map(fn (P10Allocation $allocation): array => [
                'id' => (int) $allocation->getKey(), 'amount_rial' => (string) $allocation->amount_rial,
                'effective_on' => $allocation->treasuryMovement?->effective_on->format('Y-m-d'),
                'open_item_id' => (int) $allocation->open_item_id,
                'treasury_movement' => $allocation->treasuryMovement === null ? null : [
                    'id' => (int) $allocation->treasuryMovement->getKey(),
                    'type' => $allocation->treasuryMovement->direction,
                    'amount_rial' => (string) $allocation->treasuryMovement->amount_rial,
                    'reference' => $allocation->treasuryMovement->reference,
                    'journal' => $allocation->journal === null ? null : [
                        'id' => (int) $allocation->journal->getKey(), 'code' => $allocation->journal->code,
                    ],
                ],
            ])->all(),
            'open_item' => $invoice->openItem === null ? null : [
                'id' => (int) $invoice->openItem->getKey(),
                'original_amount_rial' => (string) $invoice->openItem->original_amount_rial,
                'effective_on' => $invoice->openItem->effective_on->format('Y-m-d'),
                'due_on' => $invoice->openItem->due_on->format('Y-m-d'),
            ],
            'created_by' => (int) $invoice->created_by,
            'posted_by' => (int) $invoice->posted_by,
            'posted_at' => $invoice->posted_at?->toIso8601String(),
        ];
    }

    public function serializeSettlement(P10TreasuryMovement $movement, P10Allocation $allocation): array
    {
        $journal = $movement->journal;

        return [
            'movement' => [
                'id' => (int) $movement->getKey(), 'type' => $movement->direction,
                'amount_rial' => (string) $movement->amount_rial,
                'effective_on' => $movement->effective_on->format('Y-m-d'),
                'reference' => $movement->reference,
                'party' => ['id' => (int) $movement->party_id, 'name' => $movement->party?->display_name],
                'treasury_account' => ['id' => (int) $movement->treasury_account_id, 'code' => $movement->treasuryAccount?->code, 'name' => $movement->treasuryAccount?->name],
                'journal' => $journal === null ? null : ['id' => (int) $journal->getKey(), 'code' => $journal->code],
            ],
            'allocation' => [
                'id' => (int) $allocation->getKey(), 'invoice_id' => (int) $allocation->invoice_id,
                'open_item_id' => (int) $allocation->open_item_id, 'amount_rial' => (string) $allocation->amount_rial,
                'journal_id' => (int) $allocation->journal_id,
            ],
        ];
    }

    private function existingSettlement(Organization $organization, P10TreasuryMovement $movement): array
    {
        $allocation = P10Allocation::query()
            ->where('organization_id', $organization->getKey())
            ->where('book_id', $movement->book_id)
            ->where('treasury_movement_id', $movement->getKey())
            ->with(['invoice', 'openItem', 'journal'])
            ->firstOrFail();
        $movement->load(['party', 'treasuryAccount', 'journal']);

        return [
            'movement' => $movement,
            'allocation' => $allocation,
            'invoice' => $this->freshInvoice($organization, (int) $allocation->invoice_id),
            'already_exists' => true,
        ];
    }

    private function freshInvoice(Organization $organization, int $invoiceId): P10Invoice
    {
        return P10Invoice::query()
            ->where('organization_id', $organization->getKey())
            ->with([
                'book', 'party', 'salesOrder', 'purchaseOrder', 'journal', 'openItem', 'lines',
                'lines.salesDelivery', 'lines.purchaseReceipt',
                'allocations.treasuryMovement.party', 'allocations.treasuryMovement.treasuryAccount',
                'allocations.treasuryMovement.journal', 'allocations.journal',
            ])
            ->findOrFail($invoiceId);
    }

    private function customerSources(Organization $organization): array
    {
        $billed = P10InvoiceLine::query()
            ->where('organization_id', $organization->getKey())
            ->whereNotNull('sales_order_delivery_id')
            ->selectRaw('sales_order_delivery_id, SUM(quantity_milli) as billed_milli')
            ->groupBy('sales_order_delivery_id')->get()->keyBy('sales_order_delivery_id');

        return SalesOrder::query()
            ->where('organization_id', $organization->getKey())
            ->where('status', 'confirmed')
            ->with(['customer:id,code,display_name', 'lines.deliveries.operation', 'lines.deliveries.movement'])
            ->orderByDesc('confirmed_at')->orderByDesc('id')->get()
            ->map(function (SalesOrder $order) use ($billed): array {
                $lines = $order->lines->map(function (SalesOrderLine $line) use ($billed): array {
                    $deliveries = $line->deliveries->map(function (SalesOrderDelivery $delivery) use ($billed): array {
                        $already = (int) ($billed->get($delivery->getKey())?->billed_milli ?? 0);
                        $remaining = (int) $delivery->quantity_milli - $already;

                        return [
                            'id' => (int) $delivery->getKey(), 'quantity_milli' => (string) $delivery->quantity_milli,
                            'already_invoiced_milli' => (string) $already, 'available_milli' => (string) max(0, $remaining),
                            'available_quantity' => StockService::milliToQuantity(max(0, $remaining)),
                            'created_at' => $delivery->created_at?->toIso8601String(),
                            'operation_id' => (int) $delivery->inventory_operation_id,
                            'movement_id' => (int) $delivery->inventory_movement_id,
                        ];
                    })->filter(fn (array $delivery): bool => (int) $delivery['available_milli'] > 0)->values()->all();

                    return [
                        'id' => (int) $line->getKey(), 'item_code' => $line->product_code_snapshot,
                        'item_name' => $line->product_name_snapshot, 'unit_name' => $line->unit_name_snapshot,
                        'ordered_quantity' => (string) $line->quantity, 'line_net_toman' => (string) $line->line_net_toman,
                        'deliveries' => $deliveries,
                    ];
                })->filter(fn (array $line): bool => $line['deliveries'] !== [])->values()->all();

                return [
                    'id' => (int) $order->getKey(), 'code' => $order->code,
                    'party' => ['id' => (int) $order->customer_party_id, 'code' => $order->customer?->code, 'name' => $order->customer?->display_name],
                    'lines' => $lines,
                ];
            })->filter(fn (array $order): bool => $order['lines'] !== [])->values()->all();
    }

    private function supplierSources(Organization $organization): array
    {
        $billed = P10InvoiceLine::query()
            ->where('organization_id', $organization->getKey())
            ->whereNotNull('purchase_receipt_id')
            ->selectRaw('purchase_receipt_id, SUM(quantity_milli) as billed_milli')
            ->groupBy('purchase_receipt_id')->get()->keyBy('purchase_receipt_id');

        return PurchaseOrder::query()
            ->where('organization_id', $organization->getKey())
            ->with(['supplier:id,code,display_name', 'lines.receipts'])
            ->orderByDesc('ordered_at')->orderByDesc('id')->get()
            ->map(function (PurchaseOrder $order) use ($billed): array {
                $lines = $order->lines->map(function (PurchaseOrderLine $line) use ($billed): array {
                    $receipts = $line->receipts->map(function (PurchaseReceipt $receipt) use ($billed): array {
                        $already = (int) ($billed->get($receipt->getKey())?->billed_milli ?? 0);
                        $remaining = (int) $receipt->quantity_milli - $already;

                        return [
                            'id' => (int) $receipt->getKey(), 'quantity_milli' => (string) $receipt->quantity_milli,
                            'already_invoiced_milli' => (string) $already, 'available_milli' => (string) max(0, $remaining),
                            'available_quantity' => StockService::milliToQuantity(max(0, $remaining)),
                            'created_at' => $receipt->created_at?->toIso8601String(),
                            'inventory_operation_id' => (int) $receipt->inventory_operation_id,
                            'inventory_movement_id' => (int) $receipt->inventory_movement_id,
                        ];
                    })->filter(fn (array $receipt): bool => (int) $receipt['available_milli'] > 0)->values()->all();

                    return [
                        'id' => (int) $line->getKey(), 'item_code' => $line->product_code_snapshot,
                        'item_name' => $line->product_name_snapshot, 'unit_name' => $line->unit_name_snapshot,
                        'ordered_quantity_milli' => (string) $line->ordered_quantity_milli,
                        'received_quantity_milli' => (string) $line->received_quantity_milli,
                        'unit_price_rial' => (string) $line->unit_price_rial,
                        'line_total_rial' => (string) $line->line_total_rial,
                        'receipts' => $receipts,
                    ];
                })->filter(fn (array $line): bool => $line['receipts'] !== [])->values()->all();

                return [
                    'id' => (int) $order->getKey(), 'code' => $order->code,
                    'party' => ['id' => (int) $order->supplier_party_id, 'code' => $order->supplier?->code, 'name' => $order->supplier?->display_name],
                    'lines' => $lines,
                ];
            })->filter(fn (array $order): bool => $order['lines'] !== [])->values()->all();
    }

    private function profileReady(Organization $organization, AccountingBook $book): bool
    {
        try {
            $this->profiles->resolve($organization, $book);

            return true;
        } catch (HttpException) {
            return false;
        }
    }

    private function rialAsToman(int $rial): string
    {
        $whole = intdiv($rial, 10);
        $fraction = $rial % 10;

        return $fraction === 0 ? (string) $whole : $whole.'.'.$fraction;
    }

    private function lockBook(Organization $organization, int $bookId): void
    {
        AccountingBook::query()
            ->where('organization_id', $organization->getKey())
            ->lockForUpdate()->findOrFail($bookId);
    }

    private function validateIdempotencyKey(string $key): void
    {
        if (! preg_match('/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iD', $key)) {
            throw ValidationException::withMessages(['idempotency_key' => 'کلید تکرار باید UUID معتبر باشد.']);
        }
    }

    private function hash(array $payload): string
    {
        return hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR));
    }
}
