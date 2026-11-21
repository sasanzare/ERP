<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PriceList extends Model
{
    protected $fillable = ['organization_id', 'code', 'name'];

    public function entries(): HasMany
    {
        return $this->hasMany(PriceListEntry::class);
    }
}
