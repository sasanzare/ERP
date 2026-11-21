<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalesOrderLine extends Model
{
    protected $fillable = [
        'organization_id', 'sales_order_id', 'source_quote_line_id', 'product_id', 'unit_id',
        'product_code_snapshot', 'product_name_snapshot', 'unit_code_snapshot', 'unit_name_snapshot',
        'unit_symbol_snapshot', 'quantity', 'unit_price_toman_tenths', 'discount_basis_points', 'line_net_toman',
        'cancelled_quantity_milli', 'cancelled_by', 'cancelled_at',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:3',
            'unit_price_toman_tenths' => 'string',
            'discount_basis_points' => 'integer',
            'line_net_toman' => 'string',
            'cancelled_quantity_milli' => 'integer',
            'cancelled_at' => 'immutable_datetime',
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

    public function reservations(): HasMany
    {
        return $this->hasMany(StockReservation::class, 'sales_order_line_id');
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(SalesOrderDelivery::class, 'sales_order_line_id')->orderBy('id');
    }

    public function cancelledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }
}
