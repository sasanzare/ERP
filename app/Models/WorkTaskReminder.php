<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkTaskReminder extends Model
{
    protected $fillable = [
        'organization_id', 'task_id', 'recipient_user_id', 'assignment_version', 'reminder_type',
        'identity', 'due_on_snapshot', 'delivered_at',
    ];

    protected function casts(): array
    {
        return [
            'assignment_version' => 'integer',
            'due_on_snapshot' => 'immutable_date',
            'delivered_at' => 'immutable_datetime',
        ];
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(WorkTask::class, 'task_id');
    }

    public function recipient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recipient_user_id');
    }
}
