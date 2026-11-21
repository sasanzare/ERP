<?php

namespace App\Services\Stock;

use App\Models\InventoryMovement;
use App\Models\InventoryOperation;
use App\Models\Location;
use App\Models\Organization;
use App\Models\Product;
use App\Models\StockReservation;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

class StockService
{
    public const MAX_QUANTITY_MILLI = 999_999_999_999;

    public function postOperation(Organization $organization, User $actor, array $input): array
    {
        $quantityMilli = self::quantityToMilli($input['quantity']);
        $locations = $input['operation_type'] === 'transfer'
            ? [(int) $input['location_id'], (int) $input['destination_location_id']]
            : [(int) $input['location_id']];
        $locationIds = array_values(array_unique($locations));
        sort($locationIds, SORT_NUMERIC);
        $requestHash = $this->requestHash([
            'operation_type' => $input['operation_type'],
            'product_id' => (int) $input['product_id'],
            'quantity_milli' => $quantityMilli,
            'warehouse_id' => (int) $input['warehouse_id'],
            'location_id' => (int) $input['location_id'],
            'destination_warehouse_id' => isset($input['destination_warehouse_id']) ? (int) $input['destination_warehouse_id'] : null,
            'destination_location_id' => isset($input['destination_location_id']) ? (int) $input['destination_location_id'] : null,
        ]);

        try {
            return DB::transaction(function () use ($organization, $actor, $input, $quantityMilli, $locationIds, $requestHash): array {
                $existing = InventoryOperation::query()
                    ->where('organization_id', $organization->getKey())
                    ->where('idempotency_key', $input['idempotency_key'])
                    ->first();

                if ($existing !== null) {
                    return $this->existingResult($existing, $requestHash);
                }

                $product = Product::query()
                    ->where('organization_id', $organization->getKey())
                    ->lockForUpdate()
                    ->findOrFail($input['product_id']);

                $existing = InventoryOperation::query()
                    ->where('organization_id', $organization->getKey())
                    ->where('idempotency_key', $input['idempotency_key'])
                    ->lockForUpdate()
                    ->first();

                if ($existing !== null) {
                    return $this->existingResult($existing, $requestHash);
                }

                if ($product->base_unit_id === null) {
                    $this->invalid('product_id', 'برای ثبت موجودی، ابتدا واحد پایهٔ کالا را در اطلاعات کالا تعیین کنید.');
                }

                [$selectedSource, $selectedDestination] = $this->lockSelectedLocations($organization, $input, $locationIds);
                $this->lockStockKeys($organization, (int) $product->getKey(), $locationIds);
                $balances = [];

                foreach ($locationIds as $locationId) {
                    $balances[$locationId] = $this->lockedBalance($organization, $product, $locationId);
                }

                $type = $input['operation_type'];
                $source = $type === 'issue' || $type === 'transfer' ? $selectedSource : null;
                $destination = $type === 'opening' || $type === 'receipt' ? $selectedSource : $selectedDestination;
                $sourceId = $source?->getKey();
                $destinationId = $destination?->getKey();
                $sourceBalance = $sourceId === null ? null : $balances[$sourceId];
                $destinationBalance = $destinationId === null ? null : $balances[$destinationId];

                if ($type === 'opening' && $destinationBalance['movement_count'] > 0) {
                    $this->invalid('operation_type', 'موجودی افتتاحیه باید نخستین حرکت این کالا در این مکان باشد؛ اصلاح را با رسید یا حواله ثبت کنید.');
                }

                if (($type === 'issue' || $type === 'transfer') && $quantityMilli > $sourceBalance['available_milli']) {
                    $this->invalid('quantity', 'مقدار از موجودی قابل‌دسترس این مکان بیشتر است.');
                }

                if ($destinationBalance !== null && $destinationBalance['physical_milli'] + $quantityMilli > self::MAX_QUANTITY_MILLI) {
                    $this->invalid('quantity', 'موجودی فیزیکی از بیشینهٔ پشتیبانی‌شده بیشتر می‌شود.');
                }

                $now = now();
                $operation = InventoryOperation::query()->create([
                    'organization_id' => $organization->getKey(),
                    'product_id' => $product->getKey(),
                    'base_unit_id' => $product->base_unit_id,
                    'operation_type' => $type,
                    'quantity_milli' => $quantityMilli,
                    'from_location_id' => $sourceId,
                    'to_location_id' => $destinationId,
                    'product_code_snapshot' => $product->code,
                    'product_name_snapshot' => $product->name,
                    'unit_code_snapshot' => $product->baseUnit()->value('code'),
                    'unit_name_snapshot' => $product->baseUnit()->value('name'),
                    'unit_symbol_snapshot' => $product->baseUnit()->value('symbol'),
                    'from_location_code_snapshot' => $source?->code,
                    'from_location_name_snapshot' => $source?->name,
                    'to_location_code_snapshot' => $destination?->code,
                    'to_location_name_snapshot' => $destination?->name,
                    'idempotency_key' => $input['idempotency_key'],
                    'request_hash' => $requestHash,
                    'actor_id' => $actor->getKey(),
                    'created_at' => $now,
                ]);

                if ($type === 'opening' || $type === 'receipt') {
                    $this->persistMovement($operation, [
                        'organization_id' => $organization->getKey(),
                        'product_id' => $product->getKey(),
                        'base_unit_id' => $product->base_unit_id,
                        'location_id' => $destination->getKey(),
                        'direction' => 'inbound',
                        'quantity_milli' => $quantityMilli,
                        'created_at' => $now,
                    ]);
                } elseif ($type === 'issue') {
                    $this->persistMovement($operation, [
                        'organization_id' => $organization->getKey(),
                        'product_id' => $product->getKey(),
                        'base_unit_id' => $product->base_unit_id,
                        'location_id' => $source->getKey(),
                        'direction' => 'outbound',
                        'quantity_milli' => $quantityMilli,
                        'created_at' => $now,
                    ]);
                } else {
                    $this->persistMovement($operation, [
                        'organization_id' => $organization->getKey(),
                        'product_id' => $product->getKey(),
                        'base_unit_id' => $product->base_unit_id,
                        'location_id' => $source->getKey(),
                        'direction' => 'outbound',
                        'quantity_milli' => $quantityMilli,
                        'created_at' => $now,
                    ]);
                    $this->persistMovement($operation, [
                        'organization_id' => $organization->getKey(),
                        'product_id' => $product->getKey(),
                        'base_unit_id' => $product->base_unit_id,
                        'location_id' => $destination->getKey(),
                        'direction' => 'inbound',
                        'quantity_milli' => $quantityMilli,
                        'created_at' => $now,
                    ]);
                }

                return ['record' => $operation->load(['actor', 'movements']), 'already_exists' => false];
            }, 3);
        } catch (QueryException $exception) {
            if (! $this->isDuplicateKey($exception)) {
                throw $exception;
            }

            $existing = InventoryOperation::query()
                ->where('organization_id', $organization->getKey())
                ->where('idempotency_key', $input['idempotency_key'])
                ->first();

            if ($existing === null) {
                throw $exception;
            }

            return $this->existingResult($existing, $requestHash);
        }
    }

    public function reserve(Organization $organization, User $actor, array $input): array
    {
        $quantityMilli = self::quantityToMilli($input['quantity']);
        $requestHash = $this->requestHash([
            'product_id' => (int) $input['product_id'],
            'quantity_milli' => $quantityMilli,
            'warehouse_id' => (int) $input['warehouse_id'],
            'location_id' => (int) $input['location_id'],
        ]);

        try {
            return DB::transaction(function () use ($organization, $actor, $input, $quantityMilli, $requestHash): array {
                $existing = StockReservation::query()
                    ->where('organization_id', $organization->getKey())
                    ->where('idempotency_key', $input['idempotency_key'])
                    ->first();

                if ($existing !== null) {
                    return $this->existingReservationResult($existing, $requestHash);
                }

                $product = Product::query()
                    ->where('organization_id', $organization->getKey())
                    ->lockForUpdate()
                    ->findOrFail($input['product_id']);

                $existing = StockReservation::query()
                    ->where('organization_id', $organization->getKey())
                    ->where('idempotency_key', $input['idempotency_key'])
                    ->lockForUpdate()
                    ->first();

                if ($existing !== null) {
                    return $this->existingReservationResult($existing, $requestHash);
                }

                if ($product->base_unit_id === null) {
                    $this->invalid('product_id', 'برای رزرو موجودی، ابتدا واحد پایهٔ کالا را در اطلاعات کالا تعیین کنید.');
                }

                $locationIds = [(int) $input['location_id']];
                [$location] = $this->lockSelectedLocations($organization, $input, $locationIds);
                $this->lockStockKeys($organization, (int) $product->getKey(), $locationIds);
                $balance = $this->lockedBalance($organization, $product, (int) $location->getKey());

                if ($quantityMilli > $balance['available_milli']) {
                    $this->invalid('quantity', 'مقدار رزرو از موجودی قابل‌دسترس این مکان بیشتر است.');
                }

                $reservation = StockReservation::query()->create([
                    'organization_id' => $organization->getKey(),
                    'product_id' => $product->getKey(),
                    'base_unit_id' => $product->base_unit_id,
                    'location_id' => $location->getKey(),
                    'quantity_milli' => $quantityMilli,
                    'status' => 'open',
                    'product_code_snapshot' => $product->code,
                    'product_name_snapshot' => $product->name,
                    'unit_code_snapshot' => $product->baseUnit()->value('code'),
                    'unit_name_snapshot' => $product->baseUnit()->value('name'),
                    'unit_symbol_snapshot' => $product->baseUnit()->value('symbol'),
                    'location_code_snapshot' => $location->code,
                    'location_name_snapshot' => $location->name,
                    'idempotency_key' => $input['idempotency_key'],
                    'request_hash' => $requestHash,
                    'created_by' => $actor->getKey(),
                    'created_at' => now(),
                ]);

                return ['record' => $reservation->load(['createdBy', 'releasedBy']), 'already_exists' => false];
            }, 3);
        } catch (QueryException $exception) {
            if (! $this->isDuplicateKey($exception)) {
                throw $exception;
            }

            $existing = StockReservation::query()
                ->where('organization_id', $organization->getKey())
                ->where('idempotency_key', $input['idempotency_key'])
                ->first();

            if ($existing === null) {
                throw $exception;
            }

            return $this->existingReservationResult($existing, $requestHash);
        }
    }

    public function release(Organization $organization, User $actor, int $reservationId): array
    {
        $initial = StockReservation::query()
            ->where('organization_id', $organization->getKey())
            ->findOrFail($reservationId);

        return DB::transaction(function () use ($organization, $actor, $initial, $reservationId): array {
            $product = Product::query()
                ->where('organization_id', $organization->getKey())
                ->lockForUpdate()
                ->findOrFail($initial->product_id);
            $locationIds = [(int) $initial->location_id];
            $locations = Location::query()
                ->where('organization_id', $organization->getKey())
                ->whereIn('id', $locationIds)
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');
            $location = $locations->get($initial->location_id);

            if ($location === null) {
                abort(404);
            }

            $this->lockStockKeys($organization, (int) $product->getKey(), $locationIds);
            $reservation = StockReservation::query()
                ->where('organization_id', $organization->getKey())
                ->lockForUpdate()
                ->findOrFail($reservationId);

            if ($reservation->status === 'released') {
                return ['record' => $reservation->load(['createdBy', 'releasedBy']), 'already_exists' => true];
            }

            $this->lockedBalance($organization, $product, (int) $location->getKey());
            $reservation->forceFill([
                'status' => 'released',
                'released_by' => $actor->getKey(),
                'released_at' => now(),
            ])->save();

            return ['record' => $reservation->load(['createdBy', 'releasedBy']), 'already_exists' => false];
        }, 3);
    }

    public static function quantityToMilli(string $quantity): int
    {
        if (! preg_match('/^(\d+)(?:\.(\d{1,3}))?$/D', $quantity, $parts)) {
            self::invalid('quantity', 'مقدار باید رشته‌ای ده‌دهی با حداکثر سه رقم اعشار باشد.');
        }

        $whole = ltrim($parts[1], '0');
        $whole = $whole === '' ? '0' : $whole;
        $fraction = str_pad($parts[2] ?? '', 3, '0');

        if (strlen($whole) > 9 || (strlen($whole) === 9 && $whole > '999999999')) {
            self::invalid('quantity', 'مقدار از بیشینهٔ 999999999.999 بیشتر است.');
        }

        $quantityMilli = ((int) $whole * 1000) + (int) $fraction;

        if ($quantityMilli <= 0) {
            self::invalid('quantity', 'مقدار باید بزرگ‌تر از صفر باشد.');
        }

        return $quantityMilli;
    }

    public static function milliToQuantity(int|string $quantityMilli): string
    {
        $value = (int) $quantityMilli;

        return intdiv($value, 1000).'.'.str_pad((string) ($value % 1000), 3, '0', STR_PAD_LEFT);
    }

    private function lockSelectedLocations(Organization $organization, array $input, array $locationIds): array
    {
        $warehouseIds = [(int) $input['warehouse_id']];

        if (isset($input['destination_warehouse_id'])) {
            $warehouseIds[] = (int) $input['destination_warehouse_id'];
        }

        $warehouseIds = array_values(array_unique($warehouseIds));
        sort($warehouseIds, SORT_NUMERIC);
        $warehouses = Warehouse::query()
            ->where('organization_id', $organization->getKey())
            ->whereIn('id', $warehouseIds)
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        foreach ($warehouseIds as $warehouseId) {
            if (! $warehouses->has($warehouseId)) {
                abort(404);
            }
        }

        $locations = Location::query()
            ->where('organization_id', $organization->getKey())
            ->whereIn('id', $locationIds)
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        foreach ($locationIds as $locationId) {
            if (! $locations->has($locationId)) {
                abort(404);
            }
        }

        $source = $locations->get((int) $input['location_id']);
        $sourceWarehouseId = (int) $input['warehouse_id'];

        if ((int) $source->warehouse_id !== $sourceWarehouseId) {
            $this->invalid('location_id', 'مکان انتخاب‌شده به انبار انتخاب‌شده تعلق ندارد.');
        }

        $destination = null;

        if (isset($input['destination_location_id'])) {
            $destination = $locations->get((int) $input['destination_location_id']);
            $destinationWarehouseId = (int) $input['destination_warehouse_id'];

            if ((int) $destination->warehouse_id !== $destinationWarehouseId) {
                $this->invalid('destination_location_id', 'مکان مقصد به انبار مقصد انتخاب‌شده تعلق ندارد.');
            }

            if ((int) $destination->getKey() === (int) $source->getKey()) {
                $this->invalid('destination_location_id', 'مکان مبدأ و مقصد باید متفاوت باشند.');
            }
        }

        return [$source, $destination];
    }

    private function lockStockKeys(Organization $organization, int $productId, array $locationIds): void
    {
        $locationIds = array_values(array_unique(array_map('intval', $locationIds)));
        sort($locationIds, SORT_NUMERIC);
        $rows = array_map(fn (int $locationId): array => [
            'organization_id' => $organization->getKey(),
            'product_id' => $productId,
            'location_id' => $locationId,
        ], $locationIds);

        DB::table('stock_locks')->insertOrIgnore($rows);

        $locks = DB::table('stock_locks')
            ->where('organization_id', $organization->getKey())
            ->where('product_id', $productId)
            ->whereIn('location_id', $locationIds)
            ->orderBy('location_id')
            ->lockForUpdate()
            ->get(['id', 'location_id']);

        if ($locks->count() !== count($locationIds)) {
            throw new \RuntimeException('The requested stock lock rows could not be acquired.');
        }
    }

    private function lockedBalance(Organization $organization, Product $product, int $locationId): array
    {
        $movementRows = InventoryMovement::query()
            ->where('organization_id', $organization->getKey())
            ->where('product_id', $product->getKey())
            ->where('location_id', $locationId)
            ->orderBy('id')
            ->lockForUpdate()
            ->get(['direction', 'quantity_milli']);
        $physicalMilli = 0;

        foreach ($movementRows as $movement) {
            $quantity = (int) $movement->quantity_milli;
            $physicalMilli += $movement->direction === 'inbound' ? $quantity : -$quantity;
        }

        $reservationRows = StockReservation::query()
            ->where('organization_id', $organization->getKey())
            ->where('product_id', $product->getKey())
            ->where('location_id', $locationId)
            ->where('status', 'open')
            ->orderBy('id')
            ->lockForUpdate()
            ->get(['quantity_milli']);
        $reservedMilli = (int) $reservationRows->sum(fn (StockReservation $reservation): int => (int) $reservation->quantity_milli);

        if ($physicalMilli < 0 || $physicalMilli > self::MAX_QUANTITY_MILLI || $reservedMilli > $physicalMilli) {
            throw new \RuntimeException('The stock ledger and open reservations are inconsistent.');
        }

        return [
            'physical_milli' => $physicalMilli,
            'reserved_milli' => $reservedMilli,
            'available_milli' => $physicalMilli - $reservedMilli,
            'movement_count' => $movementRows->count(),
        ];
    }

    protected function persistMovement(InventoryOperation $operation, array $attributes): InventoryMovement
    {
        return $operation->movements()->create($attributes);
    }

    private function existingResult(InventoryOperation $existing, string $requestHash): array
    {
        if (! hash_equals($existing->request_hash, $requestHash)) {
            throw new HttpException(409, 'این کلید درخواست قبلاً برای عملیات دیگری استفاده شده است.');
        }

        return ['record' => $existing->load(['actor', 'movements']), 'already_exists' => true];
    }

    private function existingReservationResult(StockReservation $existing, string $requestHash): array
    {
        if (! hash_equals($existing->request_hash, $requestHash)) {
            throw new HttpException(409, 'این کلید درخواست قبلاً برای رزرو دیگری استفاده شده است.');
        }

        return ['record' => $existing->load(['createdBy', 'releasedBy']), 'already_exists' => true];
    }

    private function requestHash(array $payload): string
    {
        return hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR));
    }

    private function isDuplicateKey(QueryException $exception): bool
    {
        return (int) ($exception->errorInfo[1] ?? 0) === 1062;
    }

    private static function invalid(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
