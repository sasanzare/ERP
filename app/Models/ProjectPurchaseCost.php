<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectPurchaseCost extends Model
{
    protected $fillable = [
        'organization_id', 'project_id', 'purchase_order_id', 'purchase_order_line_id', 'amount_rial',
        'purchase_order_code_snapshot', 'supplier_name_snapshot', 'product_code_snapshot',
        'product_name_snapshot', 'unit_name_snapshot', 'unit_symbol_snapshot', 'linked_by', 'linked_at',
    ];

    protected function casts(): array
    {
        return ['amount_rial' => 'string', 'linked_at' => 'immutable_datetime'];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(WorkProject::class, 'project_id');
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class, 'purchase_order_id');
    }

    public function purchaseOrderLine(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrderLine::class, 'purchase_order_line_id');
    }

    public function linkedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'linked_by');
    }
}
