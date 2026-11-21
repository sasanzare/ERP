<?php

namespace App\Services\Sales;

use App\Models\Organization;
use App\Models\Product;
use App\Models\SalesOrder;
use App\Models\SalesOrderDelivery;
use App\Models\SalesOrderLine;
use App\Models\StockReservation;
use App\Models\User;
use App\Services\Stock\StockService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SalesFulfillmentService
{
    public function __construct(private readonly StockService $stock) {}

    public function reserveLine(Organization $organization, User $actor, int $orderId, int $lineId, array $input): array
    {
        return DB::transaction(function () use ($organization, $actor, $orderId, $lineId, $input): array {
            $line = $this->lockLine($organization, $orderId, $lineId);
            $this->assertConfirmed($line);

            $idempotencyKey = $input['idempotency_key'];
            $existing = StockReservation::query()
                ->where('organization_id', $organization->getKey())
                ->where('idempotency_key', $idempotencyKey)
                ->first();

            if ($existing !== null) {
                return $this->stock->reserve($organization, $actor, [
                    ...$input,
                    'product_id' => (int) $line->product_id,
                    'sales_order_line_id' => (int) $line->getKey(),
                ]);
            }

            $product = Product::query()
                ->where('organization_id', $organization->getKey())
                ->lockForUpdate()
                ->findOrFail($line->product_id);

            $this->assertCompatibleBaseUnit($line, $product);
            $quantityMilli = StockService::quantityToMilli($input['quantity']);
            $state = $this->lineQuantities($organization, $line);
            $reservableMilli = $state['pending_milli'] - $state['reserved_milli'];

            if ($quantityMilli > $reservableMilli) {
                throw ValidationException::withMessages([
                    'quantity' => 'مقدار رزرو از باقیماندهٔ رزرو‌نشدهٔ سطر سفارش بیشتر است.',
                ]);
            }

            return $this->stock->reserve($organization, $actor, [
                ...$input,
                'product_id' => (int) $line->product_id,
                'sales_order_line_id' => (int) $line->getKey(),
            ]);
        }, 3);
    }

    public function deliverLine(
        Organization $organization,
        User $actor,
        int $orderId,
        int $lineId,
        int $reservationId,
        string $quantity,
        string $idempotencyKey,
    ): array {
        return $this->stock->deliverFromReservation(
            $organization,
            $actor,
            $orderId,
            $lineId,
            $reservationId,
            $quantity,
            $idempotencyKey,
        );
    }

    public function cancelRemainder(Organization $organization, User $actor, int $orderId, int $lineId): array
    {
        return DB::transaction(function () use ($organization, $actor, $orderId, $lineId): array {
            $line = $this->lockLine($organization, $orderId, $lineId);
            $this->assertConfirmed($line);
            $state = $this->lineQuantities($organization, $line);

            if ($state['pending_milli'] === 0) {
                return ['line' => $line->fresh(), 'already_cancelled' => (int) $line->cancelled_quantity_milli > 0];
            }

            $reservations = StockReservation::query()
                ->where('organization_id', $organization->getKey())
                ->where('sales_order_line_id', $line->getKey())
                ->where('status', 'open')
                ->orderBy('location_id')
                ->orderBy('id')
                ->get();

            foreach ($reservations as $reservation) {
                $this->stock->releaseSalesReservation(
                    $organization,
                    $actor,
                    (int) $line->getKey(),
                    (int) $reservation->getKey(),
                );
            }

            $line->forceFill([
                'cancelled_quantity_milli' => (int) $line->cancelled_quantity_milli + $state['pending_milli'],
                'cancelled_by' => $actor->getKey(),
                'cancelled_at' => now(),
            ])->save();

            return ['line' => $line->fresh(), 'already_cancelled' => false];
        }, 3);
    }

    public function serializeLine(SalesOrderLine $line): array
    {
        $organizationId = (int) $line->organization_id;
        $state = $this->lineQuantities(Organization::findOrFail($organizationId), $line);
        $product = Product::query()
            ->where('organization_id', $organizationId)
            ->with('baseUnit')
            ->findOrFail($line->product_id);
        $reservations = StockReservation::query()
            ->where('organization_id', $organizationId)
            ->where('sales_order_line_id', $line->getKey())
            ->with(['createdBy', 'releasedBy', 'location.warehouse'])
            ->orderBy('id')
            ->get();
        $deliveries = SalesOrderDelivery::query()
            ->where('organization_id', $organizationId)
            ->where('sales_order_line_id', $line->getKey())
            ->with(['reservation', 'operation', 'movement', 'actor'])
            ->orderBy('id')
            ->get();

        $status = match (true) {
            $state['pending_milli'] === 0 && $state['cancelled_milli'] === 0 => 'delivered',
            $state['pending_milli'] === 0 && $state['delivered_milli'] === 0 => 'cancelled',
            $state['pending_milli'] === 0 => 'partially_cancelled',
            $state['delivered_milli'] > 0 || $state['cancelled_milli'] > 0 => 'partial',
            default => 'pending',
        };

        return [
            'ordered_quantity' => StockService::milliToQuantity($state['ordered_milli']),
            'reserved_quantity' => StockService::milliToQuantity($state['reserved_milli']),
            'delivered_quantity' => StockService::milliToQuantity($state['delivered_milli']),
            'cancelled_quantity' => StockService::milliToQuantity($state['cancelled_milli']),
            'pending_quantity' => StockService::milliToQuantity($state['pending_milli']),
            'status' => $status,
            'unit_compatible' => $product->base_unit_id !== null && (int) $product->base_unit_id === (int) $line->unit_id,
            'current_base_unit' => $product->baseUnit === null ? null : [
                'id' => $product->baseUnit->getKey(),
                'code' => $product->baseUnit->code,
                'name' => $product->baseUnit->name,
                'symbol' => $product->baseUnit->symbol,
            ],
            'cancelled_at' => $line->cancelled_at?->toIso8601String(),
            'cancelled_by' => $line->cancelledBy?->name,
            'reservations' => $reservations->map(fn (StockReservation $reservation): array => [
                'id' => $reservation->getKey(),
                'status' => $reservation->status,
                'quantity' => StockService::milliToQuantity($reservation->quantity_milli),
                'consumed_quantity' => StockService::milliToQuantity($reservation->consumed_quantity_milli),
                'released_quantity' => StockService::milliToQuantity($reservation->released_quantity_milli),
                'remaining_quantity' => StockService::milliToQuantity($this->reservationOutstanding($reservation)),
                'location' => [
                    'id' => $reservation->location_id,
                    'code' => $reservation->location_code_snapshot,
                    'name' => $reservation->location_name_snapshot,
                    'warehouse' => $reservation->location?->warehouse === null ? null : [
                        'id' => $reservation->location->warehouse->getKey(),
                        'code' => $reservation->location->warehouse->code,
                        'name' => $reservation->location->warehouse->name,
                    ],
                ],
                'created_at' => $reservation->created_at?->toIso8601String(),
                'created_by' => $reservation->createdBy?->name,
                'released_at' => $reservation->released_at?->toIso8601String(),
                'released_by' => $reservation->releasedBy?->name,
            ])->values(),
            'deliveries' => $deliveries->map(fn (SalesOrderDelivery $delivery): array => [
                'id' => $delivery->getKey(),
                'quantity' => StockService::milliToQuantity($delivery->quantity_milli),
                'created_at' => $delivery->created_at?->toIso8601String(),
                'actor' => $delivery->actor?->name,
                'reservation' => ['id' => $delivery->stock_reservation_id],
                'operation' => $delivery->operation === null ? null : [
                    'id' => $delivery->operation->getKey(),
                    'reference' => 'STK-'.str_pad((string) $delivery->operation->getKey(), 6, '0', STR_PAD_LEFT),
                    'operation_type' => $delivery->operation->operation_type,
                ],
                'movement' => $delivery->movement === null ? null : [
                    'id' => $delivery->movement->getKey(),
                    'direction' => $delivery->movement->direction,
                    'quantity' => StockService::milliToQuantity($delivery->movement->quantity_milli),
                ],
            ])->values(),
        ];
    }

    private function lockLine(Organization $organization, int $orderId, int $lineId): SalesOrderLine
    {
        $order = SalesOrder::query()
            ->where('organization_id', $organization->getKey())
            ->findOrFail($orderId);

        return SalesOrderLine::query()
            ->where('organization_id', $organization->getKey())
            ->where('sales_order_id', $order->getKey())
            ->lockForUpdate()
            ->findOrFail($lineId);
    }

    private function assertConfirmed(SalesOrderLine $line): void
    {
        if ($line->order()->value('status') !== 'confirmed') {
            throw ValidationException::withMessages(['order' => 'فقط سفارش تأییدشده قابل پردازش است.']);
        }
    }

    private function assertCompatibleBaseUnit(SalesOrderLine $line, Product $product): void
    {
        if ($product->base_unit_id === null || (int) $line->unit_id !== (int) $product->base_unit_id) {
            throw ValidationException::withMessages([
                'product_id' => 'واحد پایهٔ فعلی کالا با واحد ثبت‌شده در سطر سفارش سازگار نیست.',
            ]);
        }
    }

    private function lineQuantities(Organization $organization, SalesOrderLine $line): array
    {
        $orderedMilli = StockService::quantityToMilli((string) $line->quantity);
        $deliveredMilli = (int) SalesOrderDelivery::query()
            ->where('organization_id', $organization->getKey())
            ->where('sales_order_line_id', $line->getKey())
            ->sum('quantity_milli');
        $cancelledMilli = (int) $line->cancelled_quantity_milli;
        $pendingMilli = $orderedMilli - $deliveredMilli - $cancelledMilli;
        $reservedMilli = (int) StockReservation::query()
            ->where('organization_id', $organization->getKey())
            ->where('sales_order_line_id', $line->getKey())
            ->where('status', 'open')
            ->get(['quantity_milli', 'consumed_quantity_milli', 'released_quantity_milli'])
            ->sum(fn (StockReservation $reservation): int => $this->reservationOutstanding($reservation));

        if ($pendingMilli < 0 || $reservedMilli > $pendingMilli) {
            throw new \RuntimeException('The sales order fulfillment quantities are inconsistent.');
        }

        return [
            'ordered_milli' => $orderedMilli,
            'delivered_milli' => $deliveredMilli,
            'cancelled_milli' => $cancelledMilli,
            'pending_milli' => $pendingMilli,
            'reserved_milli' => $reservedMilli,
        ];
    }

    private function reservationOutstanding(StockReservation $reservation): int
    {
        return (int) $reservation->quantity_milli
            - (int) $reservation->consumed_quantity_milli
            - (int) $reservation->released_quantity_milli;
    }
}
