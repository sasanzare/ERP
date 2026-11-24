<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountingJournalLine extends Model
{
    protected $fillable = [
        'organization_id', 'book_id', 'journal_id', 'account_id', 'line_number', 'memo', 'debit_rial', 'credit_rial',
    ];

    protected function casts(): array
    {
        return [
            'line_number' => 'integer',
            'debit_rial' => 'string',
            'credit_rial' => 'string',
        ];
    }

    public function journal(): BelongsTo
    {
        return $this->belongsTo(AccountingJournal::class, 'journal_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(AccountingAccount::class, 'account_id');
    }
}
