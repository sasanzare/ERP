<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class P10Allocation extends Model
{
    public $timestamps = false;

    protected $table = 'p10_allocations';

    protected $fillable = [
        'organization_id', 'book_id', 'invoice_id', 'open_item_id', 'treasury_movement_id', 'direction',
        'amount_rial', 'journal_id',
    ];

    protected function casts(): array
    {
        return ['amount_rial' => 'string'];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(P10Invoice::class, 'invoice_id');
    }

    public function openItem(): BelongsTo
    {
        return $this->belongsTo(P10OpenItem::class, 'open_item_id');
    }

    public function treasuryMovement(): BelongsTo
    {
        return $this->belongsTo(P10TreasuryMovement::class, 'treasury_movement_id');
    }

    public function journal(): BelongsTo
    {
        return $this->belongsTo(AccountingJournal::class, 'journal_id');
    }
}
