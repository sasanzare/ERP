<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccountingJournal extends Model
{
    protected $fillable = [
        'organization_id', 'book_id', 'period_id', 'reversal_of_journal_id', 'code', 'accounting_date', 'description',
        'status', 'source_type', 'source_record_id', 'source_event_key', 'reversal_request_hash', 'posting_identity',
        'debit_total_rial', 'credit_total_rial', 'created_by', 'posted_by', 'posted_at',
    ];

    protected function casts(): array
    {
        return [
            'accounting_date' => 'immutable_date',
            'debit_total_rial' => 'string',
            'credit_total_rial' => 'string',
            'posted_at' => 'immutable_datetime',
        ];
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(AccountingBook::class, 'book_id');
    }

    public function period(): BelongsTo
    {
        return $this->belongsTo(AccountingPeriod::class, 'period_id');
    }

    public function reversalOf(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reversal_of_journal_id');
    }

    public function reversal(): HasMany
    {
        return $this->hasMany(self::class, 'reversal_of_journal_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(AccountingJournalLine::class, 'journal_id')->orderBy('line_number');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function postedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'posted_by');
    }
}
