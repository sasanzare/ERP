<?php

namespace App\Services\ProjectWork;

use App\Enums\WorkTaskStatus;
use App\Models\Organization;
use App\Models\OrganizationMembership;
use App\Models\ProjectPurchaseCost;
use App\Models\PurchaseOrderLine;
use App\Models\WorkComment;
use App\Models\WorkProject;
use App\Models\WorkTask;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class ProjectWorkService
{
    public function today(): string
    {
        return CarbonImmutable::today(config('app.timezone'))->toDateString();
    }

    public function options(Organization $organization): array
    {
        return [
            'members' => OrganizationMembership::query()
                ->where('organization_id', $organization->getKey())
                ->with('user:id,name')
                ->orderBy('id')
                ->get()
                ->map(fn (OrganizationMembership $membership): array => [
                    'id' => (int) $membership->user_id,
                    'name' => $membership->user->name,
                    'role' => $membership->role,
                ])
                ->values(),
            'eligible_purchase_lines' => PurchaseOrderLine::query()
                ->where('organization_id', $organization->getKey())
                ->whereHas('order', fn (Builder $orders) => $orders->whereIn('status', ['open', 'closed']))
                ->with('order')
                ->orderByDesc('id')
                ->get()
                ->map(fn (PurchaseOrderLine $line): array => [
                    'id' => $line->getKey(),
                    'purchase_order_id' => (int) $line->purchase_order_id,
                    'purchase_order_code' => $line->order->code,
                    'supplier_name' => $line->order->supplier_name_snapshot,
                    'product_code' => $line->product_code_snapshot,
                    'product_name' => $line->product_name_snapshot,
                    'unit_symbol' => $line->unit_symbol_snapshot,
                    'amount_rial' => (string) $line->line_total_rial,
                ])
                ->values(),
            'time_zone' => config('app.timezone'),
            'today' => $this->today(),
        ];
    }

    public function projectIndex(Organization $organization, string $search): Collection
    {
        $today = $this->today();
        $query = WorkProject::query()
            ->where('organization_id', $organization->getKey())
            ->withCount([
                'tasks as open_task_count' => fn (Builder $tasks) => $tasks->whereIn('status', [
                    WorkTaskStatus::Open->value,
                    WorkTaskStatus::InProgress->value,
                ]),
                'tasks as in_progress_task_count' => fn (Builder $tasks) => $tasks->where('status', WorkTaskStatus::InProgress->value),
                'tasks as completed_task_count' => fn (Builder $tasks) => $tasks->where('status', WorkTaskStatus::Completed->value),
                'tasks as overdue_task_count' => fn (Builder $tasks) => $tasks
                    ->whereIn('status', [WorkTaskStatus::Open->value, WorkTaskStatus::InProgress->value])
                    ->whereNotNull('due_on')
                    ->whereDate('due_on', '<', $today),
            ])
            ->withSum('purchaseCosts as committed_purchase_rial', 'amount_rial')
            ->orderByDesc('id');

        if ($search !== '') {
            $query->where(function (Builder $projects) use ($search): void {
                $projects->where('title', 'like', '%'.$search.'%')
                    ->orWhere('description', 'like', '%'.$search.'%')
                    ->orWhereHas('tasks', fn (Builder $tasks) => $tasks->where('title', 'like', '%'.$search.'%'));
            });
        }

        return $query->get()->map(fn (WorkProject $project): array => $this->serializeProjectSummary($project));
    }

    public function serializeProjectSummary(WorkProject $project): array
    {
        return [
            'id' => $project->getKey(),
            'title' => $project->title,
            'description' => $project->description,
            'created_at' => $project->created_at?->toIso8601String(),
            'task_counts' => [
                'open' => max(0, (int) $project->open_task_count - (int) $project->in_progress_task_count),
                'in_progress' => (int) $project->in_progress_task_count,
                'completed' => (int) $project->completed_task_count,
                'open_total' => (int) $project->open_task_count,
            ],
            'overdue_count' => (int) $project->overdue_task_count,
            'committed_purchase_rial' => (string) ($project->committed_purchase_rial ?? '0'),
        ];
    }

    public function serializeProject(WorkProject $project): array
    {
        $project->loadMissing([
            'tasks' => fn ($tasks) => $tasks->orderBy('id'),
            'tasks.assignee',
            'tasks.completedBy',
            'comments' => fn ($comments) => $comments->whereNull('task_id')->orderBy('id'),
            'comments.author',
            'purchaseCosts' => fn ($costs) => $costs->orderBy('id'),
        ]);

        $taskStats = $this->taskStats($project->tasks);

        return [
            'id' => $project->getKey(),
            'title' => $project->title,
            'description' => $project->description,
            'created_at' => $project->created_at?->toIso8601String(),
            'today' => $this->today(),
            'time_zone' => config('app.timezone'),
            'task_counts' => $taskStats['status_counts'] + ['open_total' => $taskStats['open_count']],
            'overdue_count' => $taskStats['overdue_count'],
            'open_task_count' => $taskStats['open_count'],
            'tasks' => $project->tasks->map(fn (WorkTask $task): array => $this->serializeTask($task))->values(),
            'comments' => $project->comments
                ->whereNull('task_id')
                ->map(fn (WorkComment $comment): array => $this->serializeComment($comment))
                ->values(),
            'purchase_costs' => $project->purchaseCosts
                ->map(fn (ProjectPurchaseCost $cost): array => $this->serializePurchaseCost($cost))
                ->values(),
            'committed_purchase_rial' => $this->sumRialStrings($project->purchaseCosts->pluck('amount_rial')),
        ];
    }

    public function serializeTask(WorkTask $task): array
    {
        $dueOn = $task->due_on?->toDateString();

        return [
            'id' => $task->getKey(),
            'project_id' => (int) $task->project_id,
            'project' => $task->relationLoaded('project') && $task->project !== null ? [
                'id' => $task->project->getKey(),
                'title' => $task->project->title,
            ] : null,
            'title' => $task->title,
            'status' => $task->status->value,
            'due_on' => $dueOn,
            'is_overdue' => $task->status !== WorkTaskStatus::Completed && $dueOn !== null && $dueOn < $this->today(),
            'assignee' => $task->assignee === null ? null : [
                'id' => $task->assignee->getKey(),
                'name' => $task->assignee->name,
            ],
            'completed_by' => $task->completedBy === null ? null : [
                'id' => $task->completedBy->getKey(),
                'name' => $task->completedBy->name,
            ],
            'completed_at' => $task->completed_at?->toIso8601String(),
            'created_at' => $task->created_at?->toIso8601String(),
        ];
    }

    public function serializeComment(WorkComment $comment): array
    {
        return [
            'id' => $comment->getKey(),
            'body' => $comment->body,
            'author' => [
                'id' => $comment->author->getKey(),
                'name' => $comment->author->name,
            ],
            'created_at' => $comment->created_at?->toIso8601String(),
        ];
    }

    public function serializePurchaseCost(ProjectPurchaseCost $cost): array
    {
        return [
            'id' => $cost->getKey(),
            'purchase_order_id' => (int) $cost->purchase_order_id,
            'purchase_order_line_id' => (int) $cost->purchase_order_line_id,
            'purchase_order_code' => $cost->purchase_order_code_snapshot,
            'supplier_name' => $cost->supplier_name_snapshot,
            'product_code' => $cost->product_code_snapshot,
            'product_name' => $cost->product_name_snapshot,
            'unit_name' => $cost->unit_name_snapshot,
            'unit_symbol' => $cost->unit_symbol_snapshot,
            'amount_rial' => (string) $cost->amount_rial,
            'source_url' => '/purchase-orders/'.$cost->purchase_order_id.'?line='.$cost->purchase_order_line_id,
        ];
    }

    public function taskDetail(WorkTask $task): array
    {
        $task->loadMissing(['project', 'assignee', 'completedBy']);
        $comments = WorkComment::query()
            ->where('organization_id', $task->organization_id)
            ->where('project_id', $task->project_id)
            ->where('task_id', $task->getKey())
            ->with('author')
            ->orderBy('id')
            ->get();

        return [
            'task' => $this->serializeTask($task),
            'comments' => $comments->map(fn (WorkComment $comment): array => $this->serializeComment($comment))->values(),
            'today' => $this->today(),
            'time_zone' => config('app.timezone'),
        ];
    }

    public function taskStats(Collection $tasks): array
    {
        $statusCounts = [
            WorkTaskStatus::Open->value => 0,
            WorkTaskStatus::InProgress->value => 0,
            WorkTaskStatus::Completed->value => 0,
        ];
        $openCount = 0;
        $overdueCount = 0;
        $today = $this->today();

        foreach ($tasks as $task) {
            $statusCounts[$task->status->value]++;
            if ($task->status !== WorkTaskStatus::Completed) {
                $openCount++;
                if ($task->due_on !== null && $task->due_on->toDateString() < $today) {
                    $overdueCount++;
                }
            }
        }

        return [
            'status_counts' => $statusCounts,
            'open_count' => $openCount,
            'overdue_count' => $overdueCount,
        ];
    }

    private function sumRialStrings(Collection $amounts): string
    {
        $total = '0';

        foreach ($amounts as $amount) {
            $digits = (string) $amount;
            $left = strrev($total);
            $right = strrev($digits);
            $length = max(strlen($left), strlen($right));
            $carry = 0;
            $sum = '';

            for ($index = 0; $index < $length; $index++) {
                $value = ($index < strlen($left) ? (int) $left[$index] : 0)
                    + ($index < strlen($right) ? (int) $right[$index] : 0)
                    + $carry;
                $sum .= (string) ($value % 10);
                $carry = intdiv($value, 10);
            }

            if ($carry > 0) {
                $sum .= (string) $carry;
            }

            $total = strrev($sum);
        }

        return $total;
    }
}
