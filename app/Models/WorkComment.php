<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkComment extends Model
{
    protected $fillable = ['organization_id', 'project_id', 'task_id', 'author_id', 'body'];

    public function project(): BelongsTo
    {
        return $this->belongsTo(WorkProject::class, 'project_id');
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(WorkTask::class, 'task_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }
}
