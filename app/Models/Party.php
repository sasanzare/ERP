<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Party extends Model
{
    protected $fillable = ['organization_id', 'code', 'display_name'];

    public function roles(): HasMany
    {
        return $this->hasMany(PartyRole::class);
    }
}
