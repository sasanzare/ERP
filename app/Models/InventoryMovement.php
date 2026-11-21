<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryMovement extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'organization_id', 'operation_id', 'product_id', 'base_unit_id', 'location_id',
        'direction', 'quantity_milli', 'created_at',
    ];

    protected function casts(): array
    {
        return ['created_at' => 'immutable_datetime'];
    }

    public function operation(): BelongsTo
    {
        return $this->belongsTo(InventoryOperation::class, 'operation_id');
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }
}
