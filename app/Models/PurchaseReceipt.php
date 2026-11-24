<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseReceipt extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'organization_id', 'purchase_order_id', 'purchase_order_line_id', 'warehouse_id', 'location_id',
        'warehouse_code_snapshot', 'warehouse_name_snapshot', 'location_code_snapshot', 'location_name_snapshot',
        'inventory_operation_id', 'inventory_movement_id', 'quantity_milli', 'idempotency_key',
        'request_hash', 'actor_id', 'created_at',
    ];

    protected function casts(): array
    {
        return ['quantity_milli' => 'integer', 'created_at' => 'immutable_datetime'];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class, 'purchase_order_id');
    }

    public function orderLine(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrderLine::class, 'purchase_order_line_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
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
