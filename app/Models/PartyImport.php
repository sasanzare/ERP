<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PartyImport extends Model
{
    protected $fillable = [
        'organization_id',
        'import_key',
        'payload_hash',
        'source_format',
        'status',
        'created_by_user_id',
    ];

    public function rows(): HasMany
    {
        return $this->hasMany(PartyImportRow::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }
}
