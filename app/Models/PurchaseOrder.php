<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseOrder extends Model
{
    protected $fillable = [
        'organization_id', 'source_request_id', 'supplier_party_id', 'code', 'status',
        'supplier_code_snapshot', 'supplier_name_snapshot', 'currency_code', 'currency_scale',
        'rounding_rule', 'total_rial', 'conversion_hash', 'created_by', 'ordered_at', 'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'currency_scale' => 'integer',
            'total_rial' => 'string',
            'ordered_at' => 'immutable_datetime',
            'closed_at' => 'immutable_datetime',
        ];
    }

    public function sourceRequest(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class, 'source_request_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Party::class, 'supplier_party_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PurchaseOrderLine::class, 'purchase_order_id');
    }
}
