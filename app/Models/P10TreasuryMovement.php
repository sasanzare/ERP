<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class P10TreasuryMovement extends Model
{
    public $timestamps = false;

    protected $table = 'p10_treasury_movements';

    protected $fillable = [
        'organization_id', 'book_id', 'direction', 'party_id', 'treasury_account_id', 'effective_on', 'currency_code',
        'currency_scale', 'amount_rial', 'reference', 'idempotency_key', 'request_hash', 'posting_key', 'journal_id',
        'created_by', 'posted_at',
    ];

    protected function casts(): array
    {
        return [
            'effective_on' => 'immutable_date', 'currency_scale' => 'integer', 'amount_rial' => 'string',
            'posted_at' => 'immutable_datetime',
        ];
    }

    public function party(): BelongsTo
    {
        return $this->belongsTo(Party::class, 'party_id');
    }

    public function treasuryAccount(): BelongsTo
    {
        return $this->belongsTo(AccountingAccount::class, 'treasury_account_id');
    }

    public function journal(): BelongsTo
    {
        return $this->belongsTo(AccountingJournal::class, 'journal_id');
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(P10Allocation::class, 'treasury_movement_id');
    }
}
