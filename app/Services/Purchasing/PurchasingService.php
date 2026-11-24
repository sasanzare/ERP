<?php

namespace App\Services\Purchasing;

use App\Models\InventoryMovement;
use App\Models\InventoryOperation;
use App\Models\Location;
use App\Models\Organization;
use App\Models\Party;
use App\Models\PartyRole;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderLine;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestLine;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\Stock\StockService;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

class PurchasingService
{
    public function __construct(
        private readonly StockService $stock,
        private readonly PurchaseMoneyCalculator $money,
    ) {}

    public function options(Organization $organization): array
    {
        return [
            'suppliers' => Party::query()
                ->where('organization_id', $organization->getKey())
                ->whereHas('roles', fn ($query) => $query
                    ->where('organization_id', $organization->getKey())
                    ->where('role', 'supplier'))
                ->orderBy('display_name')
                ->get(['id', 'code', 'display_name'])
                ->map(fn (Party $party): array => [
                    'id' => $party->getKey(), 'code' => $party->code, 'name' => $party->display_name,
                ])->values(),
            'products' => Product::query()
                ->where('organization_id', $organization->getKey())
                ->whereNotNull('base_unit_id')
                ->with(['baseUnit' => fn ($query) => $query->where('is_active', true)])
                ->orderBy('name')
                ->get()
                ->filter(fn (Product $product): bool => $product->baseUnit !== null)
                ->map(fn (Product $product): array => [
                    'id' => $product->getKey(),
                    'code' => $product->code,
                    'name' => $product->name,
                    'base_unit' => [
                        'id' => $product->baseUnit->getKey(),
                        'code' => $product->baseUnit->code,
                        'name' => $product->baseUnit->name,
                        'symbol' => $product->baseUnit->symbol,
                    ],
                ])->values(),
            'warehouses' => Warehouse::query()
                ->where('organization_id', $organization->getKey())
                ->with(['locations' => fn ($query) => $query->orderBy('name')])
                ->orderBy('name')
                ->get()
                ->map(fn (Warehouse $warehouse): array => [
                    'id' => $warehouse->getKey(),
                    'code' => $warehouse->code,
                    'name' => $warehouse->name,
                    'locations' => $warehouse->locations->map(fn (Location $location): array => [
                        'id' => $location->getKey(), 'code' => $location->code, 'name' => $location->name,
                    ])->values(),
                ])->values(),
        ];
    }

    public function createDraft(Organization $organization, User $actor, string $title, array $lines): PurchaseRequest
    {
        return DB::transaction(function () use ($organization, $actor, $title, $lines): PurchaseRequest {
            $productIds = array_values(array_unique(array_map(
                fn (array $line): int => (int) $line['product_id'],
                $lines,
            )));
            sort($productIds, SORT_NUMERIC);

            $products = Product::query()
                ->where('organization_id', $organization->getKey())
                ->whereIn('id', $productIds)
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            if ($products->count() !== count($productIds)) {
                abort(404);
            }

            $unitIds = $products->pluck('base_unit_id')->filter()->unique()->map(fn ($id): int => (int) $id)->sort()->values()->all();
            $units = Unit::query()
                ->where('organization_id', $organization->getKey())
                ->whereIn('id', $unitIds)
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            $request = PurchaseRequest::query()->create([
                'organization_id' => $organization->getKey(),
                'code' => 'TMP-'.Str::uuid(),
                'title' => $title,
                'status' => 'draft',
                'requester_id' => $actor->getKey(),
            ]);
            $request->forceFill(['code' => 'PR-'.str_pad((string) $request->getKey(), 6, '0', STR_PAD_LEFT)])->save();

            foreach ($lines as $index => $input) {
                /** @var Product $product */
                $product = $products->get((int) $input['product_id']);
                $unit = $units->get((int) $product->base_unit_id);

                if ($unit === null || ! $unit->is_active) {
                    throw ValidationException::withMessages([
                        "lines.{$index}.product_id" => 'برای درخواست خرید، واحد پایهٔ فعال کالا لازم است.',
                    ]);
                }

                $quantityMilli = StockService::quantityToMilli($input['quantity']);
                PurchaseRequestLine::query()->create([
                    'organization_id' => $organization->getKey(),
                    'purchase_request_id' => $request->getKey(),
                    'product_id' => $product->getKey(),
                    'unit_id' => $unit->getKey(),
                    'quantity_milli' => $quantityMilli,
                    'product_code_snapshot' => $product->code,
                    'product_name_snapshot' => $product->name,
                    'unit_code_snapshot' => $unit->code,
                    'unit_name_snapshot' => $unit->name,
                    'unit_symbol_snapshot' => $unit->symbol,
                ]);
            }

            return $this->freshRequest($organization, (int) $request->getKey());
        }, 3);
    }

    public function submitRequest(Organization $organization, User $actor, int $requestId): PurchaseRequest
    {
        return DB::transaction(function () use ($organization, $actor, $requestId): PurchaseRequest {
            $request = $this->lockRequest($organization, $requestId);

            if ($request->status !== 'draft') {
                throw new HttpException(409, 'فقط پیش‌نویس درخواست خرید قابل ارسال برای تأیید است.');
            }

            if (! $request->lines()->exists()) {
                throw ValidationException::withMessages(['lines' => 'برای ارسال درخواست، دست‌کم یک سطر کالا لازم است.']);
            }

            $request->forceFill([
                'status' => 'submitted',
                'submitted_by' => $actor->getKey(),
                'submitted_at' => now(),
            ])->save();

            return $this->freshRequest($organization, $requestId);
        }, 3);
    }

    public function approveRequest(Organization $organization, User $actor, int $requestId): PurchaseRequest
    {
        return DB::transaction(function () use ($organization, $actor, $requestId): PurchaseRequest {
            $request = $this->lockRequest($organization, $requestId);

            if ($request->status !== 'submitted') {
                throw new HttpException(409, 'فقط درخواست ارسال‌شده قابل تأیید است.');
            }

            if ((int) $request->requester_id === (int) $actor->getKey()) {
                abort(403, 'درخواست‌دهنده نمی‌تواند درخواست خودش را تأیید کند.');
            }

            $request->forceFill([
                'status' => 'approved',
                'approved_by' => $actor->getKey(),
                'approved_at' => now(),
            ])->save();

            return $this->freshRequest($organization, $requestId);
        }, 3);
    }

    /** @param array<int, array{source_request_line_id: int, unit_price_rial: string}> $lines */
    public function convertRequest(
        Organization $organization,
        User $actor,
        int $requestId,
        int $supplierPartyId,
        array $lines,
    ): array {
        try {
            return DB::transaction(function () use ($organization, $actor, $requestId, $supplierPartyId, $lines): array {
                $request = $this->lockRequest($organization, $requestId);
                $sourceLines = PurchaseRequestLine::query()
                    ->where('organization_id', $organization->getKey())
                    ->where('purchase_request_id', $request->getKey())
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get()
                    ->keyBy('id');

                $pricesByLine = [];
                foreach ($lines as $line) {
                    $lineId = (int) $line['source_request_line_id'];
                    if (! $sourceLines->has($lineId)) {
                        abort(404);
                    }
                    $pricesByLine[$lineId] = $this->money->normalizeUnitPriceRial($line['unit_price_rial'], 'lines');
                }
                ksort($pricesByLine, SORT_NUMERIC);

                if (count($pricesByLine) !== $sourceLines->count() || $sourceLines->count() === 0) {
                    throw ValidationException::withMessages(['lines' => 'برای هر سطر درخواست باید دقیقاً یک قیمت توافقی ثبت شود.']);
                }

                $hashLines = [];
                foreach ($sourceLines as $sourceLine) {
                    $lineId = (int) $sourceLine->getKey();
                    if (! array_key_exists($lineId, $pricesByLine)) {
                        throw ValidationException::withMessages(['lines' => 'همهٔ سطرهای درخواست باید در سفارش خرید باشند.']);
                    }
                    $hashLines[] = [
                        'source_request_line_id' => $lineId,
                        'product_id' => (int) $sourceLine->product_id,
                        'unit_id' => (int) $sourceLine->unit_id,
                        'quantity_milli' => (int) $sourceLine->quantity_milli,
                        'unit_price_rial' => $pricesByLine[$lineId],
                    ];
                }
                $conversionHash = $this->hash([
                    'organization_id' => (int) $organization->getKey(),
                    'purchase_request_id' => (int) $request->getKey(),
                    'supplier_party_id' => $supplierPartyId,
                    'lines' => $hashLines,
                ]);

                $existing = PurchaseOrder::query()
                    ->where('organization_id', $organization->getKey())
                    ->where('source_request_id', $request->getKey())
                    ->lockForUpdate()
                    ->first();

                if ($existing !== null) {
                    return $this->existingOrderResult($organization, $existing, $conversionHash);
                }

                if ($request->status !== 'approved') {
                    throw new HttpException(409, 'برای ساخت سفارش خرید، درخواست باید تأیید شده باشد.');
                }

                $supplier = Party::query()
                    ->where('organization_id', $organization->getKey())
                    ->lockForUpdate()
                    ->findOrFail($supplierPartyId);
                $supplierRole = PartyRole::query()
                    ->where('organization_id', $organization->getKey())
                    ->where('party_id', $supplier->getKey())
                    ->where('role', 'supplier')
                    ->lockForUpdate()
                    ->first();

                if ($supplierRole === null) {
                    throw ValidationException::withMessages(['supplier_party_id' => 'طرف انتخاب‌شده نقش تأمین‌کننده ندارد.']);
                }

                $lineTotals = [];
                $calculatedLines = [];
                foreach ($sourceLines as $sourceLine) {
                    $lineId = (int) $sourceLine->getKey();
                    $price = $pricesByLine[$lineId];
                    $lineTotal = $this->money->lineTotalRial((int) $sourceLine->quantity_milli, $price, 'lines');
                    $lineTotals[] = $lineTotal;
                    $calculatedLines[] = [$sourceLine, $price, $lineTotal];
                }
                $orderTotal = $this->money->sum($lineTotals);

                $order = PurchaseOrder::query()->create([
                    'organization_id' => $organization->getKey(),
                    'source_request_id' => $request->getKey(),
                    'supplier_party_id' => $supplier->getKey(),
                    'code' => 'TMP-'.Str::uuid(),
                    'status' => 'open',
                    'supplier_code_snapshot' => $supplier->code,
                    'supplier_name_snapshot' => $supplier->display_name,
                    'currency_code' => 'IRR',
                    'currency_scale' => 0,
                    'rounding_rule' => 'per_line_half_up',
                    'total_rial' => $orderTotal,
                    'conversion_hash' => $conversionHash,
                    'created_by' => $actor->getKey(),
                    'ordered_at' => now(),
                ]);
                $order->forceFill(['code' => 'PO-'.str_pad((string) $order->getKey(), 6, '0', STR_PAD_LEFT)])->save();

                foreach ($calculatedLines as [$sourceLine, $price, $lineTotal]) {
                    PurchaseOrderLine::query()->create([
                        'organization_id' => $organization->getKey(),
                        'purchase_order_id' => $order->getKey(),
                        'source_request_line_id' => $sourceLine->getKey(),
                        'product_id' => $sourceLine->product_id,
                        'unit_id' => $sourceLine->unit_id,
                        'ordered_quantity_milli' => $sourceLine->quantity_milli,
                        'received_quantity_milli' => 0,
                        'product_code_snapshot' => $sourceLine->product_code_snapshot,
                        'product_name_snapshot' => $sourceLine->product_name_snapshot,
                        'unit_code_snapshot' => $sourceLine->unit_code_snapshot,
                        'unit_name_snapshot' => $sourceLine->unit_name_snapshot,
                        'unit_symbol_snapshot' => $sourceLine->unit_symbol_snapshot,
                        'unit_price_rial' => $price,
                        'line_total_rial' => $lineTotal,
                    ]);
                }

                return ['order' => $this->freshOrder($organization, (int) $order->getKey()), 'already_exists' => false];
            }, 3);
        } catch (QueryException $exception) {
            if (! $this->isDuplicateKey($exception)) {
                throw $exception;
            }

            $existing = PurchaseOrder::query()
                ->where('organization_id', $organization->getKey())
                ->where('source_request_id', $requestId)
                ->first();

            if ($existing === null) {
                throw $exception;
            }

            return $this->existingOrderResult($organization, $existing, $this->conversionHashForRetry(
                $organization,
                $requestId,
                $supplierPartyId,
                $lines,
            ));
        }
    }

    public function receiveLine(
        Organization $organization,
        User $actor,
        int $orderId,
        int $lineId,
        int $warehouseId,
        int $locationId,
        string $quantity,
        string $idempotencyKey,
    ): array {
        $quantityMilli = StockService::quantityToMilli($quantity);
        $requestHash = $this->hash([
            'organization_id' => (int) $organization->getKey(),
            'purchase_order_id' => $orderId,
            'purchase_order_line_id' => $lineId,
            'warehouse_id' => $warehouseId,
            'location_id' => $locationId,
            'quantity_milli' => $quantityMilli,
        ]);

        try {
            return DB::transaction(function () use (
                $organization,
                $actor,
                $orderId,
                $lineId,
                $warehouseId,
                $locationId,
                $quantity,
                $quantityMilli,
                $idempotencyKey,
                $requestHash,
            ): array {
                $order = PurchaseOrder::query()
                    ->where('organization_id', $organization->getKey())
                    ->lockForUpdate()
                    ->findOrFail($orderId);
                $line = PurchaseOrderLine::query()
                    ->where('organization_id', $organization->getKey())
                    ->where('purchase_order_id', $order->getKey())
                    ->lockForUpdate()
                    ->findOrFail($lineId);

                $existing = PurchaseReceipt::query()
                    ->where('organization_id', $organization->getKey())
                    ->where('idempotency_key', $idempotencyKey)
                    ->first();

                if ($existing !== null) {
                    return $this->existingReceiptResult($organization, $existing, $requestHash, $orderId, $lineId);
                }

                if ($order->status !== 'open') {
                    throw new HttpException(409, 'این سفارش خرید دیگر برای دریافت کالا باز نیست.');
                }

                $remainingMilli = (int) $line->ordered_quantity_milli - (int) $line->received_quantity_milli;
                if ($quantityMilli > $remainingMilli) {
                    throw ValidationException::withMessages(['quantity' => 'مقدار رسید از باقیماندهٔ سطر سفارش بیشتر است.']);
                }

                $product = Product::query()
                    ->where('organization_id', $organization->getKey())
                    ->lockForUpdate()
                    ->findOrFail($line->product_id);
                $this->assertCompatibleBaseUnit($line, $product);

                $warehouse = Warehouse::query()
                    ->where('organization_id', $organization->getKey())
                    ->lockForUpdate()
                    ->findOrFail($warehouseId);
                $location = Location::query()
                    ->where('organization_id', $organization->getKey())
                    ->lockForUpdate()
                    ->findOrFail($locationId);

                if ((int) $location->warehouse_id !== (int) $warehouse->getKey()) {
                    throw ValidationException::withMessages(['location_id' => 'مکان انتخاب‌شده به انبار انتخاب‌شده تعلق ندارد.']);
                }

                $beforePersist = function () use ($organization, $orderId, $lineId, $quantityMilli): void {
                    $lockedOrder = PurchaseOrder::query()
                        ->where('organization_id', $organization->getKey())
                        ->lockForUpdate()
                        ->findOrFail($orderId);
                    $lockedLine = PurchaseOrderLine::query()
                        ->where('organization_id', $organization->getKey())
                        ->where('purchase_order_id', $lockedOrder->getKey())
                        ->lockForUpdate()
                        ->findOrFail($lineId);
                    $lockedProduct = Product::query()
                        ->where('organization_id', $organization->getKey())
                        ->lockForUpdate()
                        ->findOrFail($lockedLine->product_id);

                    if ($lockedOrder->status !== 'open') {
                        throw new HttpException(409, 'این سفارش خرید دیگر برای دریافت کالا باز نیست.');
                    }
                    $remaining = (int) $lockedLine->ordered_quantity_milli - (int) $lockedLine->received_quantity_milli;
                    if ($quantityMilli > $remaining) {
                        throw ValidationException::withMessages(['quantity' => 'مقدار رسید از باقیماندهٔ سطر سفارش بیشتر است.']);
                    }
                    $this->assertCompatibleBaseUnit($lockedLine, $lockedProduct);
                };

                $stockResult = $this->stock->postOperation($organization, $actor, [
                    'operation_type' => 'receipt',
                    'product_id' => (int) $line->product_id,
                    'quantity' => $quantity,
                    'warehouse_id' => $warehouseId,
                    'location_id' => $locationId,
                    'idempotency_key' => $idempotencyKey,
                    'source_scope' => [
                        'type' => 'purchase_order_line',
                        'purchase_order_id' => $orderId,
                        'purchase_order_line_id' => $lineId,
                    ],
                ], $beforePersist);

                if ($stockResult['already_exists']) {
                    throw new HttpException(409, 'کلید رسید به حرکت موجودی بدون ردّ خرید تعلق دارد.');
                }

                /** @var InventoryOperation $operation */
                $operation = $stockResult['record'];
                $movement = $operation->movements->first();
                if (! $movement instanceof InventoryMovement
                    || $movement->direction !== 'inbound'
                    || (int) $movement->quantity_milli !== $quantityMilli
                    || (int) $movement->location_id !== $locationId) {
                    throw new \RuntimeException('P06 did not return the expected inbound movement for the purchase receipt.');
                }

                $receipt = PurchaseReceipt::query()->create([
                    'organization_id' => $organization->getKey(),
                    'purchase_order_id' => $order->getKey(),
                    'purchase_order_line_id' => $line->getKey(),
                    'warehouse_id' => $warehouse->getKey(),
                    'location_id' => $location->getKey(),
                    'warehouse_code_snapshot' => $warehouse->code,
                    'warehouse_name_snapshot' => $warehouse->name,
                    'location_code_snapshot' => $location->code,
                    'location_name_snapshot' => $location->name,
                    'inventory_operation_id' => $operation->getKey(),
                    'inventory_movement_id' => $movement->getKey(),
                    'quantity_milli' => $quantityMilli,
                    'idempotency_key' => $idempotencyKey,
                    'request_hash' => $requestHash,
                    'actor_id' => $actor->getKey(),
                    'created_at' => now(),
                ]);

                $line->forceFill(['received_quantity_milli' => (int) $line->received_quantity_milli + $quantityMilli])->save();
                $hasOutstanding = PurchaseOrderLine::query()
                    ->where('organization_id', $organization->getKey())
                    ->where('purchase_order_id', $order->getKey())
                    ->whereColumn('received_quantity_milli', '<', 'ordered_quantity_milli')
                    ->exists();

                if (! $hasOutstanding) {
                    $order->forceFill(['status' => 'closed', 'closed_at' => now()])->save();
                }

                return [
                    'receipt' => $receipt->load(['operation', 'movement', 'actor']),
                    'order' => $this->freshOrder($organization, $orderId),
                    'already_exists' => false,
                ];
            }, 3);
        } catch (QueryException $exception) {
            if (! $this->isDuplicateKey($exception)) {
                throw $exception;
            }

            $existing = PurchaseReceipt::query()
                ->where('organization_id', $organization->getKey())
                ->where('idempotency_key', $idempotencyKey)
                ->first();

            if ($existing === null) {
                throw $exception;
            }

            return $this->existingReceiptResult($organization, $existing, $requestHash, $orderId, $lineId);
        }
    }

    public function freshRequest(Organization $organization, int $requestId): PurchaseRequest
    {
        return PurchaseRequest::query()
            ->where('organization_id', $organization->getKey())
            ->with([
                'requester', 'submittedBy', 'approvedBy', 'purchaseOrder',
                'lines' => fn ($query) => $query->orderBy('id'),
            ])
            ->findOrFail($requestId);
    }

    public function freshOrder(Organization $organization, int $orderId): PurchaseOrder
    {
        return PurchaseOrder::query()
            ->where('organization_id', $organization->getKey())
            ->with([
                'sourceRequest', 'supplier', 'createdBy',
                'lines' => fn ($query) => $query->orderBy('id')->with([
                    'receipts' => fn ($receipts) => $receipts->orderBy('id')->with(['operation', 'movement', 'actor']),
                ]),
            ])
            ->findOrFail($orderId);
    }

    public function serializeRequest(PurchaseRequest $request): array
    {
        $request->loadMissing(['requester', 'submittedBy', 'approvedBy', 'purchaseOrder', 'lines']);

        return [
            'id' => $request->getKey(),
            'code' => $request->code,
            'title' => $request->title,
            'status' => $request->status,
            'requester' => ['id' => $request->requester_id, 'name' => $request->requester?->name],
            'submitted_by' => $request->submittedBy?->name,
            'submitted_at' => $request->submitted_at?->toIso8601String(),
            'approved_by' => $request->approvedBy?->name,
            'approved_at' => $request->approved_at?->toIso8601String(),
            'created_at' => $request->created_at?->toIso8601String(),
            'purchase_order' => $request->purchaseOrder === null ? null : [
                'id' => $request->purchaseOrder->getKey(), 'code' => $request->purchaseOrder->code,
            ],
            'lines' => $request->lines->map(fn (PurchaseRequestLine $line): array => [
                'id' => $line->getKey(),
                'product_id' => $line->product_id,
                'product_code' => $line->product_code_snapshot,
                'product_name' => $line->product_name_snapshot,
                'unit' => [
                    'id' => $line->unit_id,
                    'code' => $line->unit_code_snapshot,
                    'name' => $line->unit_name_snapshot,
                    'symbol' => $line->unit_symbol_snapshot,
                ],
                'quantity' => StockService::milliToQuantity($line->quantity_milli),
            ])->values(),
        ];
    }

    public function serializeOrder(PurchaseOrder $order): array
    {
        $order->loadMissing(['sourceRequest', 'supplier', 'createdBy', 'lines.receipts.operation', 'lines.receipts.movement', 'lines.receipts.actor']);

        return [
            'id' => $order->getKey(),
            'code' => $order->code,
            'status' => $order->status,
            'source_request' => [
                'id' => $order->source_request_id,
                'code' => $order->sourceRequest?->code,
                'title' => $order->sourceRequest?->title,
            ],
            'supplier' => [
                'id' => $order->supplier_party_id,
                'code' => $order->supplier_code_snapshot,
                'name' => $order->supplier_name_snapshot,
            ],
            'currency' => ['code' => $order->currency_code, 'scale' => (int) $order->currency_scale, 'label' => 'ریال'],
            'rounding_rule' => $order->rounding_rule,
            'total_rial' => (string) $order->total_rial,
            'ordered_at' => $order->ordered_at?->toIso8601String(),
            'closed_at' => $order->closed_at?->toIso8601String(),
            'created_by' => $order->createdBy?->name,
            'lines' => $order->lines->map(fn (PurchaseOrderLine $line): array => [
                'id' => $line->getKey(),
                'source_request_line_id' => $line->source_request_line_id,
                'product_id' => $line->product_id,
                'product_code' => $line->product_code_snapshot,
                'product_name' => $line->product_name_snapshot,
                'unit' => [
                    'id' => $line->unit_id,
                    'code' => $line->unit_code_snapshot,
                    'name' => $line->unit_name_snapshot,
                    'symbol' => $line->unit_symbol_snapshot,
                ],
                'ordered_quantity' => StockService::milliToQuantity($line->ordered_quantity_milli),
                'received_quantity' => StockService::milliToQuantity($line->received_quantity_milli),
                'remaining_quantity' => StockService::milliToQuantity(
                    (int) $line->ordered_quantity_milli - (int) $line->received_quantity_milli,
                ),
                'unit_price_rial' => (string) $line->unit_price_rial,
                'line_total_rial' => (string) $line->line_total_rial,
                'receipts' => $line->receipts->map(fn (PurchaseReceipt $receipt): array => $this->serializeReceipt($receipt))->values(),
            ])->values(),
        ];
    }

    private function serializeReceipt(PurchaseReceipt $receipt): array
    {
        $operation = $receipt->operation;
        $movement = $receipt->movement;

        return [
            'id' => $receipt->getKey(),
            'quantity' => StockService::milliToQuantity($receipt->quantity_milli),
            'created_at' => $receipt->created_at?->toIso8601String(),
            'actor' => $receipt->actor?->name,
            'warehouse' => [
                'id' => $receipt->warehouse_id,
                'code' => $receipt->warehouse_code_snapshot,
                'name' => $receipt->warehouse_name_snapshot,
            ],
            'location' => [
                'id' => $receipt->location_id,
                'code' => $receipt->location_code_snapshot,
                'name' => $receipt->location_name_snapshot,
            ],
            'operation' => $operation === null ? null : [
                'id' => $operation->getKey(),
                'reference' => 'STK-'.str_pad((string) $operation->getKey(), 6, '0', STR_PAD_LEFT),
                'operation_type' => $operation->operation_type,
            ],
            'movement' => $movement === null ? null : [
                'id' => $movement->getKey(),
                'direction' => $movement->direction,
                'quantity' => StockService::milliToQuantity($movement->quantity_milli),
            ],
        ];
    }

    private function lockRequest(Organization $organization, int $requestId): PurchaseRequest
    {
        return PurchaseRequest::query()
            ->where('organization_id', $organization->getKey())
            ->lockForUpdate()
            ->findOrFail($requestId);
    }

    private function assertCompatibleBaseUnit(PurchaseOrderLine $line, Product $product): void
    {
        if ($product->base_unit_id === null || (int) $product->base_unit_id !== (int) $line->unit_id) {
            throw ValidationException::withMessages([
                'product_id' => 'واحد پایهٔ فعلی کالا با واحد ذخیره‌شده در سفارش خرید یکسان نیست.',
            ]);
        }
    }

    private function existingOrderResult(Organization $organization, PurchaseOrder $existing, string $conversionHash): array
    {
        if (! hash_equals($existing->conversion_hash, $conversionHash)) {
            throw new HttpException(409, 'درخواست خرید قبلاً با تأمین‌کننده یا قیمت دیگری به سفارش تبدیل شده است.');
        }

        return ['order' => $this->freshOrder($organization, (int) $existing->getKey()), 'already_exists' => true];
    }

    private function existingReceiptResult(
        Organization $organization,
        PurchaseReceipt $existing,
        string $requestHash,
        int $orderId,
        int $lineId,
    ): array {
        if (! hash_equals($existing->request_hash, $requestHash)
            || (int) $existing->purchase_order_id !== $orderId
            || (int) $existing->purchase_order_line_id !== $lineId) {
            throw new HttpException(409, 'این کلید درخواست قبلاً برای رسید دیگری استفاده شده است.');
        }

        return [
            'receipt' => $existing->load(['operation', 'movement', 'actor']),
            'order' => $this->freshOrder($organization, $orderId),
            'already_exists' => true,
        ];
    }

    private function conversionHashForRetry(
        Organization $organization,
        int $requestId,
        int $supplierPartyId,
        array $lines,
    ): string {
        $sourceLines = PurchaseRequestLine::query()
            ->where('organization_id', $organization->getKey())
            ->where('purchase_request_id', $requestId)
            ->orderBy('id')
            ->get()
            ->keyBy('id');
        $pricesByLine = [];
        foreach ($lines as $line) {
            $lineId = (int) $line['source_request_line_id'];
            if (! $sourceLines->has($lineId)) {
                abort(404);
            }
            $pricesByLine[$lineId] = $this->money->normalizeUnitPriceRial($line['unit_price_rial'], 'lines');
        }
        ksort($pricesByLine, SORT_NUMERIC);
        $hashLines = [];
        foreach ($sourceLines as $sourceLine) {
            $lineId = (int) $sourceLine->getKey();
            if (! array_key_exists($lineId, $pricesByLine)) {
                throw new HttpException(409, 'درخواست تبدیل با سطرهای سفارش موجود تطبیق ندارد.');
            }
            $hashLines[] = [
                'source_request_line_id' => $lineId,
                'product_id' => (int) $sourceLine->product_id,
                'unit_id' => (int) $sourceLine->unit_id,
                'quantity_milli' => (int) $sourceLine->quantity_milli,
                'unit_price_rial' => $pricesByLine[$lineId],
            ];
        }

        return $this->hash([
            'organization_id' => (int) $organization->getKey(),
            'purchase_request_id' => $requestId,
            'supplier_party_id' => $supplierPartyId,
            'lines' => $hashLines,
        ]);
    }

    private function hash(array $payload): string
    {
        return hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR));
    }

    private function isDuplicateKey(QueryException $exception): bool
    {
        return (int) ($exception->errorInfo[1] ?? 0) === 1062;
    }
}
