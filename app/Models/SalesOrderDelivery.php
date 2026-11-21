<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesOrderDelivery extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'organization_id', 'sales_order_line_id', 'stock_reservation_id', 'inventory_operation_id',
        'inventory_movement_id', 'quantity_milli', 'idempotency_key', 'request_hash', 'actor_id', 'created_at',
    ];

    protected function casts(): array
    {
        return ['quantity_milli' => 'integer', 'created_at' => 'immutable_datetime'];
    }

    public function line(): BelongsTo
    {
        return $this->belongsTo(SalesOrderLine::class, 'sales_order_line_id');
    }

    public function reservation(): BelongsTo
    {
        return $this->belongsTo(StockReservation::class, 'stock_reservation_id');
    }

    public function operation(): BelongsTo
    {
        return $this->belongsTo(InventoryOperation::class, 'inventory_operation_id');
    }

    public function movement(): BelongsTo
    {
        return $this->belongsTo(InventoryMovement::class, 'inventory_movement_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
