<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountingRequestKey extends Model
{
    protected $fillable = [
        'organization_id', 'book_id', 'operation', 'idempotency_key', 'request_hash', 'journal_id', 'created_by',
    ];

    public function journal(): BelongsTo
    {
        return $this->belongsTo(AccountingJournal::class, 'journal_id');
    }
}
