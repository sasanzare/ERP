<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PartyRole extends Model
{
    protected $fillable = ['organization_id', 'party_id', 'role'];
}
