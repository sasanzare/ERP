<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkProject extends Model
{
    protected $fillable = ['organization_id', 'title', 'description', 'created_by'];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(WorkTask::class, 'project_id');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(WorkComment::class, 'project_id');
    }

    public function purchaseCosts(): HasMany
    {
        return $this->hasMany(ProjectPurchaseCost::class, 'project_id');
    }
}
