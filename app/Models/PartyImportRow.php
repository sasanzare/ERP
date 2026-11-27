<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PartyImportRow extends Model
{
    protected $fillable = [
        'organization_id',
        'party_import_id',
        'source_row',
        'source_party_id',
        'party_code',
        'display_name',
        'roles',
        'classification',
        'outcome',
        'message',
        'party_id',
    ];

    protected function casts(): array
    {
        return ['roles' => 'array'];
    }

    public function import(): BelongsTo
    {
        return $this->belongsTo(PartyImport::class, 'party_import_id');
    }

    public function party(): BelongsTo
    {
        return $this->belongsTo(Party::class);
    }
}
