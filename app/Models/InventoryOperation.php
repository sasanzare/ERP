<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryOperation extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'organization_id', 'product_id', 'base_unit_id', 'operation_type', 'quantity_milli',
        'from_location_id', 'to_location_id', 'product_code_snapshot', 'product_name_snapshot',
        'unit_code_snapshot', 'unit_name_snapshot', 'unit_symbol_snapshot',
        'from_location_code_snapshot', 'from_location_name_snapshot',
        'to_location_code_snapshot', 'to_location_name_snapshot', 'idempotency_key',
        'request_hash', 'actor_id', 'created_at',
    ];

    protected function casts(): array
    {
        return ['created_at' => 'immutable_datetime'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function baseUnit(): BelongsTo
    {
        return $this->belongsTo(Unit::class, 'base_unit_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public function movements(): HasMany
    {
        return $this->hasMany(InventoryMovement::class, 'operation_id');
    }

    public function salesOrderDeliveries(): HasMany
    {
        return $this->hasMany(SalesOrderDelivery::class, 'inventory_operation_id');
    }
}
