<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseRequestLine extends Model
{
    protected $fillable = [
        'organization_id', 'purchase_request_id', 'product_id', 'unit_id', 'quantity_milli',
        'product_code_snapshot', 'product_name_snapshot', 'unit_code_snapshot', 'unit_name_snapshot',
        'unit_symbol_snapshot',
    ];

    protected function casts(): array
    {
        return ['quantity_milli' => 'integer'];
    }

    public function request(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class, 'purchase_request_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }
}
