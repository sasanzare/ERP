<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccountingPeriod extends Model
{
    protected $fillable = [
        'organization_id', 'book_id', 'code', 'name', 'starts_on', 'ends_on', 'status', 'closed_by', 'closed_at',
    ];

    protected function casts(): array
    {
        return ['starts_on' => 'immutable_date', 'ends_on' => 'immutable_date', 'closed_at' => 'immutable_datetime'];
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(AccountingBook::class, 'book_id');
    }

    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    public function journals(): HasMany
    {
        return $this->hasMany(AccountingJournal::class, 'period_id');
    }
}
