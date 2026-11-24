<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class PurchaseRequest extends Model
{
    protected $fillable = [
        'organization_id', 'code', 'title', 'status', 'requester_id', 'submitted_by',
        'submitted_at', 'approved_by', 'approved_at',
    ];

    protected function casts(): array
    {
        return ['submitted_at' => 'immutable_datetime', 'approved_at' => 'immutable_datetime'];
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requester_id');
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PurchaseRequestLine::class, 'purchase_request_id');
    }

    public function purchaseOrder(): HasOne
    {
        return $this->hasOne(PurchaseOrder::class, 'source_request_id');
    }
}
