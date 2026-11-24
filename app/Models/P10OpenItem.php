<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class P10OpenItem extends Model
{
    public $timestamps = false;

    protected $table = 'p10_open_items';

    protected $fillable = [
        'organization_id', 'book_id', 'invoice_id', 'direction', 'party_id', 'effective_on', 'due_on',
        'currency_code', 'currency_scale', 'original_amount_rial',
    ];

    protected function casts(): array
    {
        return [
            'effective_on' => 'immutable_date', 'due_on' => 'immutable_date', 'currency_scale' => 'integer',
            'original_amount_rial' => 'string',
        ];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(P10Invoice::class, 'invoice_id');
    }

    public function party(): BelongsTo
    {
        return $this->belongsTo(Party::class, 'party_id');
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(P10Allocation::class, 'open_item_id');
    }
}
