<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class P10InvoiceLine extends Model
{
    protected $table = 'p10_invoice_lines';

    protected $fillable = [
        'organization_id', 'book_id', 'invoice_id', 'line_number', 'sales_order_line_id', 'sales_order_delivery_id',
        'purchase_order_line_id', 'purchase_receipt_id', 'item_code_snapshot', 'item_name_snapshot', 'unit_name_snapshot',
        'quantity_milli', 'amount_rial', 'source_amount_toman',
    ];

    protected function casts(): array
    {
        return [
            'line_number' => 'integer', 'quantity_milli' => 'integer', 'amount_rial' => 'string',
            'source_amount_toman' => 'string',
        ];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(P10Invoice::class, 'invoice_id');
    }

    public function salesOrderLine(): BelongsTo
    {
        return $this->belongsTo(SalesOrderLine::class, 'sales_order_line_id');
    }

    public function salesDelivery(): BelongsTo
    {
        return $this->belongsTo(SalesOrderDelivery::class, 'sales_order_delivery_id');
    }

    public function purchaseOrderLine(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrderLine::class, 'purchase_order_line_id');
    }

    public function purchaseReceipt(): BelongsTo
    {
        return $this->belongsTo(PurchaseReceipt::class, 'purchase_receipt_id');
    }
}
