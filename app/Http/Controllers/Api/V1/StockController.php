<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\InventoryOperation;
use App\Models\Location;
use App\Models\Organization;
use App\Models\Product;
use App\Models\StockReservation;
use App\Models\Warehouse;
use App\Services\Stock\StockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class StockController extends Controller
{
    public function options(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $products = Product::query()
            ->where('organization_id', $organization->getKey())
            ->with('baseUnit')
            ->orderBy('name')
            ->get()
            ->map(fn (Product $product): array => [
                'id' => $product->getKey(),
                'code' => $product->code,
                'name' => $product->name,
                'base_unit' => $product->baseUnit === null ? null : [
                    'id' => $product->baseUnit->getKey(),
                    'code' => $product->baseUnit->code,
                    'name' => $product->baseUnit->name,
                    'symbol' => $product->baseUnit->symbol,
                ],
            ])->values();
        $warehouses = Warehouse::query()
            ->where('organization_id', $organization->getKey())
            ->with(['locations' => fn ($query) => $query->orderBy('name')])
            ->orderBy('name')
            ->get()
            ->map(fn (Warehouse $warehouse): array => [
                'id' => $warehouse->getKey(),
                'code' => $warehouse->code,
                'name' => $warehouse->name,
                'locations' => $warehouse->locations->map(fn (Location $location): array => [
                    'id' => $location->getKey(),
                    'code' => $location->code,
                    'name' => $location->name,
                ])->values(),
            ])->values();

        return response()->json(['data' => ['products' => $products, 'warehouses' => $warehouses]]);
    }

    public function balances(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $movementRows = DB::table('inventory_movements')
            ->where('organization_id', $organization->getKey())
            ->select(['product_id', 'base_unit_id', 'location_id'])
            ->selectRaw("SUM(CASE WHEN direction = 'inbound' THEN quantity_milli ELSE 0 END) AS inbound_milli")
            ->selectRaw("SUM(CASE WHEN direction = 'outbound' THEN quantity_milli ELSE 0 END) AS outbound_milli")
            ->groupBy('product_id', 'base_unit_id', 'location_id')
            ->get();
        $totals = [];

        foreach ($movementRows as $movement) {
            $key = $this->stockKey((int) $movement->product_id, (int) $movement->location_id);
            $totals[$key] = [
                'product_id' => (int) $movement->product_id,
                'base_unit_id' => (int) $movement->base_unit_id,
                'location_id' => (int) $movement->location_id,
                'physical_milli' => (int) $movement->inbound_milli - (int) $movement->outbound_milli,
                'reserved_milli' => 0,
            ];
        }

        $reservationRows = DB::table('stock_reservations')
            ->where('organization_id', $organization->getKey())
            ->where('status', 'open')
            ->select(['product_id', 'base_unit_id', 'location_id'])
            ->selectRaw('SUM(quantity_milli - consumed_quantity_milli - released_quantity_milli) AS reserved_milli')
            ->groupBy('product_id', 'base_unit_id', 'location_id')
            ->get();

        foreach ($reservationRows as $reservation) {
            $key = $this->stockKey((int) $reservation->product_id, (int) $reservation->location_id);
            $totals[$key] ??= [
                'product_id' => (int) $reservation->product_id,
                'base_unit_id' => (int) $reservation->base_unit_id,
                'location_id' => (int) $reservation->location_id,
                'physical_milli' => 0,
                'reserved_milli' => 0,
            ];
            $totals[$key]['reserved_milli'] = (int) $reservation->reserved_milli;
        }

        $productIds = array_values(array_unique(array_column($totals, 'product_id')));
        $locationIds = array_values(array_unique(array_column($totals, 'location_id')));
        $products = Product::query()->where('organization_id', $organization->getKey())->whereIn('id', $productIds)->with('baseUnit')->get()->keyBy('id');
        $locations = Location::query()->where('organization_id', $organization->getKey())->whereIn('id', $locationIds)->with('warehouse')->get()->keyBy('id');

        $balances = collect($totals)->map(function (array $total) use ($products, $locations): array {
            $product = $products->get($total['product_id']);
            $location = $locations->get($total['location_id']);
            abort_if($product === null || $location === null, 500, 'A stock record references unavailable master data.');
            $availableMilli = $total['physical_milli'] - $total['reserved_milli'];

            if ($total['physical_milli'] < 0 || $availableMilli < 0) {
                throw new \RuntimeException('The stock ledger and open reservations are inconsistent.');
            }

            return [
                'product' => ['id' => $product->getKey(), 'code' => $product->code, 'name' => $product->name],
                'base_unit' => [
                    'id' => $total['base_unit_id'],
                    'code' => $product->baseUnit?->code,
                    'name' => $product->baseUnit?->name,
                    'symbol' => $product->baseUnit?->symbol,
                ],
                'location' => [
                    'id' => $location->getKey(),
                    'code' => $location->code,
                    'name' => $location->name,
                    'warehouse' => [
                        'id' => $location->warehouse->getKey(),
                        'code' => $location->warehouse->code,
                        'name' => $location->warehouse->name,
                    ],
                ],
                'physical_quantity' => StockService::milliToQuantity($total['physical_milli']),
                'reserved_quantity' => StockService::milliToQuantity($total['reserved_milli']),
                'available_quantity' => StockService::milliToQuantity($availableMilli),
            ];
        })->values();

        return response()->json(['data' => $balances]);
    }

    public function movements(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $operations = InventoryOperation::query()
            ->where('organization_id', $organization->getKey())
            ->with(['actor', 'movements' => fn ($query) => $query->orderBy('id')])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        return response()->json(['data' => $operations->map(fn (InventoryOperation $operation): array => $this->serializeOperation($operation))->values()]);
    }

    public function reservations(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $reservations = StockReservation::query()
            ->where('organization_id', $organization->getKey())
            ->with(['createdBy', 'releasedBy', 'salesOrderLine.order'])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        return response()->json(['data' => $reservations->map(fn (StockReservation $reservation): array => $this->serializeReservation($reservation))->values()]);
    }

    public function postOperation(Request $request, StockService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $this->rejectUnsupportedFields($request, [
            'operation_type', 'product_id', 'quantity', 'warehouse_id', 'location_id',
            'destination_warehouse_id', 'destination_location_id',
        ]);
        $validated = $request->validate([
            'operation_type' => ['required', 'string', Rule::in(['opening', 'receipt', 'issue', 'transfer'])],
            'product_id' => ['required', 'integer', 'min:1'],
            'quantity' => ['required', 'string', 'regex:/^\d+(?:\.\d{1,3})?$/D'],
            'warehouse_id' => ['required', 'integer', 'min:1'],
            'location_id' => ['required', 'integer', 'min:1'],
            'destination_warehouse_id' => ['required_if:operation_type,transfer', 'prohibited_unless:operation_type,transfer', 'integer', 'min:1'],
            'destination_location_id' => ['required_if:operation_type,transfer', 'prohibited_unless:operation_type,transfer', 'integer', 'min:1'],
        ]);
        $validated['idempotency_key'] = $this->idempotencyKey($request);
        $result = $service->postOperation($organization, $request->user(), $validated);

        return response()->json([
            'data' => $this->serializeOperation($result['record']),
            'already_exists' => $result['already_exists'],
        ], $result['already_exists'] ? 200 : 201);
    }

    public function reserve(Request $request, StockService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $this->rejectUnsupportedFields($request, ['product_id', 'quantity', 'warehouse_id', 'location_id']);
        $validated = $request->validate([
            'product_id' => ['required', 'integer', 'min:1'],
            'quantity' => ['required', 'string', 'regex:/^\d+(?:\.\d{1,3})?$/D'],
            'warehouse_id' => ['required', 'integer', 'min:1'],
            'location_id' => ['required', 'integer', 'min:1'],
        ]);
        $validated['idempotency_key'] = $this->idempotencyKey($request);
        $result = $service->reserve($organization, $request->user(), $validated);

        return response()->json([
            'data' => $this->serializeReservation($result['record']),
            'already_exists' => $result['already_exists'],
        ], $result['already_exists'] ? 200 : 201);
    }

    public function release(Request $request, int $reservation, StockService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $this->rejectUnsupportedFields($request, []);
        $result = $service->release($organization, $request->user(), $reservation);

        return response()->json([
            'data' => $this->serializeReservation($result['record']),
            'already_released' => $result['already_exists'],
        ]);
    }

    private function activeOrganization(Request $request): Organization
    {
        $organization = $request->attributes->get('activeOrganization');
        abort_unless($organization instanceof Organization, 403);
        Gate::authorize('viewStock', $organization);

        return $organization;
    }

    private function authorizeManage(Organization $organization): void
    {
        Gate::authorize('manageStock', $organization);
    }

    private function rejectUnsupportedFields(Request $request, array $allowed): void
    {
        $unsupported = array_diff(array_keys($request->all()), $allowed);

        if (in_array('organization_id', $unsupported, true)) {
            throw ValidationException::withMessages(['organization_id' => 'سازمان از نشست فعال تعیین می‌شود.']);
        }

        if ($unsupported !== []) {
            throw ValidationException::withMessages(['request' => 'درخواست شامل مشخصهٔ پشتیبانی‌نشده است.']);
        }
    }

    private function idempotencyKey(Request $request): string
    {
        $value = $request->header('Idempotency-Key');
        $validated = Validator::make(['idempotency_key' => $value], [
            'idempotency_key' => ['required', 'uuid'],
        ])->validate();

        return $validated['idempotency_key'];
    }

    private function serializeOperation(InventoryOperation $operation): array
    {
        $operation->loadMissing(['actor', 'movements']);

        return [
            'id' => $operation->getKey(),
            'reference' => 'STK-'.str_pad((string) $operation->getKey(), 6, '0', STR_PAD_LEFT),
            'operation_type' => $operation->operation_type,
            'quantity' => StockService::milliToQuantity($operation->quantity_milli),
            'product' => [
                'id' => $operation->product_id,
                'code' => $operation->product_code_snapshot,
                'name' => $operation->product_name_snapshot,
            ],
            'base_unit' => [
                'id' => $operation->base_unit_id,
                'code' => $operation->unit_code_snapshot,
                'name' => $operation->unit_name_snapshot,
                'symbol' => $operation->unit_symbol_snapshot,
            ],
            'from_location' => $operation->from_location_id === null ? null : [
                'id' => $operation->from_location_id,
                'code' => $operation->from_location_code_snapshot,
                'name' => $operation->from_location_name_snapshot,
            ],
            'to_location' => $operation->to_location_id === null ? null : [
                'id' => $operation->to_location_id,
                'code' => $operation->to_location_code_snapshot,
                'name' => $operation->to_location_name_snapshot,
            ],
            'legs' => $operation->movements->map(fn ($movement): array => [
                'id' => $movement->getKey(),
                'location_id' => $movement->location_id,
                'direction' => $movement->direction,
                'quantity' => StockService::milliToQuantity($movement->quantity_milli),
            ])->values(),
            'actor' => ['id' => $operation->actor?->getKey(), 'name' => $operation->actor?->name],
            'created_at' => $operation->created_at?->toIso8601String(),
        ];
    }

    private function serializeReservation(StockReservation $reservation): array
    {
        $reservation->loadMissing(['createdBy', 'releasedBy', 'salesOrderLine.order']);

        return [
            'id' => $reservation->getKey(),
            'product' => [
                'id' => $reservation->product_id,
                'code' => $reservation->product_code_snapshot,
                'name' => $reservation->product_name_snapshot,
            ],
            'base_unit' => [
                'id' => $reservation->base_unit_id,
                'code' => $reservation->unit_code_snapshot,
                'name' => $reservation->unit_name_snapshot,
                'symbol' => $reservation->unit_symbol_snapshot,
            ],
            'location' => [
                'id' => $reservation->location_id,
                'code' => $reservation->location_code_snapshot,
                'name' => $reservation->location_name_snapshot,
            ],
            'quantity' => StockService::milliToQuantity($reservation->quantity_milli),
            'consumed_quantity' => StockService::milliToQuantity($reservation->consumed_quantity_milli),
            'released_quantity' => StockService::milliToQuantity($reservation->released_quantity_milli),
            'remaining_quantity' => StockService::milliToQuantity(
                (int) $reservation->quantity_milli - (int) $reservation->consumed_quantity_milli - (int) $reservation->released_quantity_milli,
            ),
            'sales_order_line_id' => $reservation->sales_order_line_id === null ? null : (int) $reservation->sales_order_line_id,
            'sales_order' => $reservation->salesOrderLine?->order === null ? null : [
                'id' => $reservation->salesOrderLine->order->getKey(),
                'code' => $reservation->salesOrderLine->order->code,
            ],
            'status' => $reservation->status,
            'created_by' => ['id' => $reservation->createdBy?->getKey(), 'name' => $reservation->createdBy?->name],
            'created_at' => $reservation->created_at?->toIso8601String(),
            'released_by' => $reservation->releasedBy === null ? null : [
                'id' => $reservation->releasedBy->getKey(), 'name' => $reservation->releasedBy->name,
            ],
            'released_at' => $reservation->released_at?->toIso8601String(),
        ];
    }

    private function stockKey(int $productId, int $locationId): string
    {
        return $productId.':'.$locationId;
    }
}
