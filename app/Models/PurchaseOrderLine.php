<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseOrderLine extends Model
{
    protected $fillable = [
        'organization_id', 'purchase_order_id', 'source_request_line_id', 'product_id', 'unit_id',
        'ordered_quantity_milli', 'received_quantity_milli', 'product_code_snapshot', 'product_name_snapshot',
        'unit_code_snapshot', 'unit_name_snapshot', 'unit_symbol_snapshot', 'unit_price_rial', 'line_total_rial',
    ];

    protected function casts(): array
    {
        return [
            'ordered_quantity_milli' => 'integer',
            'received_quantity_milli' => 'integer',
            'unit_price_rial' => 'string',
            'line_total_rial' => 'string',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class, 'purchase_order_id');
    }

    public function sourceRequestLine(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequestLine::class, 'source_request_line_id');
    }

    public function receipts(): HasMany
    {
        return $this->hasMany(PurchaseReceipt::class, 'purchase_order_line_id');
    }
}
