<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockReservation extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'organization_id', 'product_id', 'base_unit_id', 'location_id', 'quantity_milli', 'status',
        'product_code_snapshot', 'product_name_snapshot', 'unit_code_snapshot', 'unit_name_snapshot',
        'unit_symbol_snapshot', 'location_code_snapshot', 'location_name_snapshot', 'idempotency_key',
        'request_hash', 'created_by', 'created_at', 'released_by', 'released_at',
    ];

    protected function casts(): array
    {
        return ['created_at' => 'immutable_datetime', 'released_at' => 'immutable_datetime'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function releasedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'released_by');
    }
}
