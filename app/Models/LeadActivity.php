<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeadActivity extends Model
{
    protected $fillable = ['organization_id', 'lead_id', 'title', 'due_at', 'completed_at'];

    protected function casts(): array
    {
        return ['due_at' => 'immutable_datetime', 'completed_at' => 'immutable_datetime'];
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }
}
