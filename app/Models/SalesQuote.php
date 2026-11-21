<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class SalesQuote extends Model
{
    protected $fillable = [
        'organization_id', 'lead_id', 'customer_party_id', 'price_list_id', 'code', 'status',
        'lead_code_snapshot', 'lead_title_snapshot', 'customer_code_snapshot', 'customer_name_snapshot',
        'price_list_code_snapshot', 'price_list_name_snapshot', 'total_toman', 'confirmed_at',
    ];

    protected function casts(): array
    {
        return ['total_toman' => 'string', 'confirmed_at' => 'immutable_datetime'];
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Party::class, 'customer_party_id');
    }

    public function priceList(): BelongsTo
    {
        return $this->belongsTo(PriceList::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(SalesQuoteLine::class, 'quote_id');
    }

    public function order(): HasOne
    {
        return $this->hasOne(SalesOrder::class, 'source_quote_id');
    }
}
