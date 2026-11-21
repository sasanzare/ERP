<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PriceListEntry extends Model
{
    protected $fillable = ['organization_id', 'price_list_id', 'product_id', 'amount_rial'];

    protected function casts(): array
    {
        return ['amount_rial' => 'string'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function priceList(): BelongsTo
    {
        return $this->belongsTo(PriceList::class);
    }
}
