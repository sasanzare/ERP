<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesOrderLine extends Model
{
    protected $fillable = [
        'organization_id', 'sales_order_id', 'source_quote_line_id', 'product_id', 'unit_id',
        'product_code_snapshot', 'product_name_snapshot', 'unit_code_snapshot', 'unit_name_snapshot',
        'unit_symbol_snapshot', 'quantity', 'unit_price_toman_tenths', 'discount_basis_points', 'line_net_toman',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:3',
            'unit_price_toman_tenths' => 'string',
            'discount_basis_points' => 'integer',
            'line_net_toman' => 'string',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(SalesOrder::class, 'sales_order_id');
    }

    public function sourceQuoteLine(): BelongsTo
    {
        return $this->belongsTo(SalesQuoteLine::class, 'source_quote_line_id');
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
