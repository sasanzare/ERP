<?php

namespace App\Services\ProjectWork;

use App\Enums\WorkTaskStatus;
use App\Models\Organization;
use App\Models\User;
use App\Models\WorkTask;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class DueReminderService
{
    public function processDueFor(Organization $organization, User $recipient): int
    {
        $today = CarbonImmutable::today(config('app.timezone'))->toDateString();
        $now = CarbonImmutable::now(config('app.timezone'))->toDateTimeString();
        $tasks = WorkTask::query()
            ->where('organization_id', $organization->getKey())
            ->where('assignee_user_id', $recipient->getKey())
            ->whereIn('status', [WorkTaskStatus::Open->value, WorkTaskStatus::InProgress->value])
            ->whereNotNull('due_on')
            ->whereDate('due_on', '<=', $today)
            ->get(['id', 'organization_id', 'assignee_user_id', 'assignment_version', 'due_on']);

        $rows = $tasks->map(fn (WorkTask $task): array => [
            'organization_id' => $task->organization_id,
            'task_id' => $task->getKey(),
            'recipient_user_id' => $task->assignee_user_id,
            'assignment_version' => $task->assignment_version,
            'reminder_type' => 'due',
            'identity' => hash('sha256', implode('|', [
                'work-task-due',
                $task->organization_id,
                $task->getKey(),
                $task->assignment_version,
                $task->assignee_user_id,
                $task->due_on->toDateString(),
            ])),
            'due_on_snapshot' => $task->due_on->toDateString(),
            'delivered_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ])->all();

        return $rows === [] ? 0 : DB::table('work_task_reminders')->insertOrIgnore($rows);
    }

    public function inbox(Organization $organization, User $recipient, ProjectWorkService $service): array
    {
        $tasks = WorkTask::query()
            ->where('organization_id', $organization->getKey())
            ->where('assignee_user_id', $recipient->getKey())
            ->whereIn('status', [WorkTaskStatus::Open->value, WorkTaskStatus::InProgress->value])
            ->with(['project', 'assignee', 'completedBy'])
            ->orderByRaw('due_on IS NULL')
            ->orderBy('due_on')
            ->orderBy('id')
            ->get();
        $taskIds = $tasks->pluck('id');
        $reminders = $taskIds->isEmpty() ? collect() : DB::table('work_task_reminders')
            ->where('organization_id', $organization->getKey())
            ->where('recipient_user_id', $recipient->getKey())
            ->where('reminder_type', 'due')
            ->whereIn('task_id', $taskIds)
            ->get()
            ->keyBy(fn (object $reminder): string => implode(':', [
                $reminder->task_id,
                $reminder->assignment_version,
                $reminder->due_on_snapshot,
            ]));

        $data = $tasks->map(function (WorkTask $task) use ($reminders, $service): array {
            $dueOn = $task->due_on?->toDateString();
            $reminder = $dueOn === null ? null : $reminders->get(implode(':', [
                $task->getKey(),
                $task->assignment_version,
                $dueOn,
            ]));

            return [
                ...$service->serializeTask($task),
                'due_reminder' => $reminder === null ? null : [
                    'identity' => $reminder->identity,
                    'due_on' => $reminder->due_on_snapshot,
                    'delivered_at' => CarbonImmutable::parse($reminder->delivered_at, config('app.timezone'))->toIso8601String(),
                ],
            ];
        })->values();

        return [
            'data' => $data,
            'open_count' => $data->count(),
            'due_reminder_count' => $data->filter(fn (array $item): bool => $item['due_reminder'] !== null)->count(),
            'today' => $service->today(),
            'time_zone' => config('app.timezone'),
        ];
    }
}
