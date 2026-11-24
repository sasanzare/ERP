<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccountingBook extends Model
{
    protected $fillable = ['organization_id', 'code', 'name', 'currency_code', 'currency_scale', 'time_zone'];

    protected function casts(): array
    {
        return ['currency_scale' => 'integer'];
    }

    public function accounts(): HasMany
    {
        return $this->hasMany(AccountingAccount::class, 'book_id');
    }

    public function periods(): HasMany
    {
        return $this->hasMany(AccountingPeriod::class, 'book_id');
    }

    public function journals(): HasMany
    {
        return $this->hasMany(AccountingJournal::class, 'book_id');
    }
}
