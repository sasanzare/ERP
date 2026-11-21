<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesQuoteLine extends Model
{
    protected $fillable = [
        'organization_id', 'quote_id', 'product_id', 'unit_id', 'product_code_snapshot',
        'product_name_snapshot', 'unit_code_snapshot', 'unit_name_snapshot', 'unit_symbol_snapshot',
        'quantity', 'unit_price_toman_tenths', 'discount_basis_points', 'line_net_toman',
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

    public function quote(): BelongsTo
    {
        return $this->belongsTo(SalesQuote::class, 'quote_id');
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
