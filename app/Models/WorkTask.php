<?php

namespace App\Models;

use App\Enums\WorkTaskStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkTask extends Model
{
    protected $fillable = [
        'organization_id', 'project_id', 'title', 'status', 'due_on', 'assignee_user_id',
        'assignment_version', 'completed_by', 'completed_at', 'created_by', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'status' => WorkTaskStatus::class,
            'due_on' => 'immutable_date',
            'assignment_version' => 'integer',
            'completed_at' => 'immutable_datetime',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(WorkProject::class, 'project_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_user_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function completedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'completed_by');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(WorkComment::class, 'task_id');
    }

    public function reminders(): HasMany
    {
        return $this->hasMany(WorkTaskReminder::class, 'task_id');
    }
}
