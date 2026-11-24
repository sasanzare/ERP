<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccountingAccount extends Model
{
    protected $fillable = [
        'organization_id', 'book_id', 'parent_account_id', 'code', 'name', 'category', 'is_postable', 'is_active',
    ];

    protected function casts(): array
    {
        return ['is_postable' => 'boolean', 'is_active' => 'boolean'];
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(AccountingBook::class, 'book_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_account_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_account_id');
    }
}
