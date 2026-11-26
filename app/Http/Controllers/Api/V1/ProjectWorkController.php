<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\WorkTaskStatus;
use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\OrganizationMembership;
use App\Models\ProjectPurchaseCost;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderLine;
use App\Models\WorkComment;
use App\Models\WorkProject;
use App\Models\WorkTask;
use App\Services\ProjectWork\ProjectWorkService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProjectWorkController extends Controller
{
    public function options(Request $request, ProjectWorkService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);

        return response()->json([
            'data' => $service->options($organization),
            'current_user_id' => (int) $request->user()->getKey(),
            'can_manage' => Gate::allows('manageWork', $organization),
        ]);
    }

    public function projectIndex(Request $request, ProjectWorkService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $validated = $request->validate(['q' => ['sometimes', 'nullable', 'string', 'max:120']]);

        return response()->json([
            'data' => $service->projectIndex($organization, trim((string) ($validated['q'] ?? ''))),
            'can_manage' => Gate::allows('manageWork', $organization),
            'today' => $service->today(),
            'time_zone' => config('app.timezone'),
        ]);
    }

    public function projectShow(Request $request, int $project, ProjectWorkService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $record = $this->scopedProject($organization, $project);

        return response()->json([
            'data' => $service->serializeProject($record),
            'can_manage' => Gate::allows('manageWork', $organization),
        ]);
    }

    public function projectStore(Request $request, ProjectWorkService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManageWork($organization);
        $this->rejectUnsupportedFields($request, ['title', 'description']);
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:200'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ]);
        $record = WorkProject::query()->create([
            'organization_id' => $organization->getKey(),
            'title' => trim($validated['title']),
            'description' => isset($validated['description']) ? trim($validated['description']) : null,
            'created_by' => $request->user()->getKey(),
        ]);

        return response()->json(['data' => $service->serializeProject($record)], 201);
    }

    public function taskShow(Request $request, int $project, int $task, ProjectWorkService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->scopedProject($organization, $project);
        $record = $this->scopedTask($organization, $project, $task);

        return response()->json([
            'data' => $service->taskDetail($record),
            'can_manage' => Gate::allows('manageWork', $organization),
        ]);
    }

    public function taskStore(Request $request, int $project, ProjectWorkService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $projectRecord = $this->scopedProject($organization, $project);
        $this->authorizeManageWork($organization);
        $this->rejectUnsupportedFields($request, ['title', 'due_on', 'assignee_user_id']);
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:200'],
            'due_on' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'assignee_user_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
        ]);
        $assigneeId = $validated['assignee_user_id'] ?? null;
        if ($assigneeId !== null) {
            $this->scopedMember($organization, (int) $assigneeId);
        }

        $record = WorkTask::query()->create([
            'organization_id' => $organization->getKey(),
            'project_id' => $projectRecord->getKey(),
            'title' => trim($validated['title']),
            'status' => WorkTaskStatus::Open,
            'due_on' => $validated['due_on'] ?? null,
            'assignee_user_id' => $assigneeId,
            'assignment_version' => $assigneeId === null ? 0 : 1,
            'created_by' => $request->user()->getKey(),
            'updated_by' => $request->user()->getKey(),
        ]);
        $record->load(['project', 'assignee', 'completedBy']);

        return response()->json(['data' => $service->taskDetail($record)['task']], 201);
    }

    public function taskUpdate(Request $request, int $project, int $task, ProjectWorkService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->scopedProject($organization, $project);
        $this->scopedTask($organization, $project, $task);
        $this->authorizeManageWork($organization);
        $this->rejectUnsupportedFields($request, ['title', 'due_on', 'assignee_user_id']);
        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:200'],
            'due_on' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'assignee_user_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
        ]);
        if ($validated === []) {
            throw ValidationException::withMessages(['title' => 'برای به‌روزرسانی، دست‌کم یک مقدار لازم است.']);
        }

        $record = DB::transaction(function () use ($organization, $project, $task, $request, $validated): WorkTask {
            $locked = WorkTask::query()
                ->where('organization_id', $organization->getKey())
                ->where('project_id', $project)
                ->lockForUpdate()
                ->findOrFail($task);

            if (array_key_exists('assignee_user_id', $validated)) {
                $assigneeId = $validated['assignee_user_id'] === null ? null : (int) $validated['assignee_user_id'];
                if ($assigneeId !== null) {
                    $this->scopedMember($organization, $assigneeId);
                }
                if ((int) ($locked->assignee_user_id ?? 0) !== (int) ($assigneeId ?? 0)) {
                    $locked->assignment_version++;
                }
                $locked->assignee_user_id = $assigneeId;
            }

            if (array_key_exists('title', $validated)) {
                $locked->title = trim($validated['title']);
            }
            if (array_key_exists('due_on', $validated)) {
                $locked->due_on = $validated['due_on'];
            }
            $locked->updated_by = $request->user()->getKey();
            $locked->save();

            return $locked->load(['project', 'assignee', 'completedBy']);
        });

        return response()->json(['data' => $service->taskDetail($record)['task']]);
    }

    public function taskTransition(Request $request, int $project, int $task, ProjectWorkService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->scopedProject($organization, $project);
        $this->scopedTask($organization, $project, $task);
        $this->authorizeManageWork($organization);
        $this->rejectUnsupportedFields($request, ['status']);
        $allowedStatuses = array_map(fn (WorkTaskStatus $status): string => $status->value, WorkTaskStatus::cases());
        $validated = $request->validate(['status' => ['required', 'string', Rule::in($allowedStatuses)]]);
        $target = WorkTaskStatus::from($validated['status']);

        [$record, $alreadyThere] = DB::transaction(function () use ($organization, $project, $task, $request, $target): array {
            $locked = WorkTask::query()
                ->where('organization_id', $organization->getKey())
                ->where('project_id', $project)
                ->lockForUpdate()
                ->findOrFail($task);
            $current = $locked->status;
            abort_unless($current->allows($target), 409, 'این تغییر وضعیت مجاز نیست.');

            if ($current !== $target) {
                $locked->status = $target;
                $locked->updated_by = $request->user()->getKey();
                if ($target === WorkTaskStatus::Completed) {
                    $locked->completed_by = $request->user()->getKey();
                    $locked->completed_at = CarbonImmutable::now(config('app.timezone'));
                } else {
                    $locked->completed_by = null;
                    $locked->completed_at = null;
                }
                $locked->save();
            }

            return [$locked->load(['project', 'assignee', 'completedBy']), $current === $target];
        });

        return response()->json([
            'data' => $service->taskDetail($record)['task'],
            'already_in_status' => $alreadyThere,
        ]);
    }

    public function projectCommentStore(Request $request, int $project, ProjectWorkService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $projectRecord = $this->scopedProject($organization, $project);
        $this->authorizeManageWork($organization);
        $this->rejectUnsupportedFields($request, ['body']);
        $validated = $request->validate(['body' => ['required', 'string', 'max:2000']]);
        $record = $this->createComment($organization, $projectRecord, null, $request, $validated['body']);

        return response()->json(['data' => $service->serializeComment($record)], 201);
    }

    public function taskCommentStore(Request $request, int $project, int $task, ProjectWorkService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $projectRecord = $this->scopedProject($organization, $project);
        $taskRecord = $this->scopedTask($organization, $project, $task);
        $this->authorizeManageWork($organization);
        $this->rejectUnsupportedFields($request, ['body']);
        $validated = $request->validate(['body' => ['required', 'string', 'max:2000']]);
        $record = $this->createComment($organization, $projectRecord, $taskRecord, $request, $validated['body']);

        return response()->json(['data' => $service->serializeComment($record)], 201);
    }

    public function purchaseCostStore(Request $request, int $project, ProjectWorkService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $projectRecord = $this->scopedProject($organization, $project);
        $this->authorizeManageWork($organization);
        $this->rejectUnsupportedFields($request, ['purchase_order_line_id']);
        $validated = $request->validate(['purchase_order_line_id' => ['required', 'integer', 'min:1']]);
        $lineId = (int) $validated['purchase_order_line_id'];

        [$cost, $alreadyLinked] = DB::transaction(function () use ($organization, $projectRecord, $lineId, $request): array {
            $lineReference = PurchaseOrderLine::query()
                ->where('organization_id', $organization->getKey())
                ->findOrFail($lineId);
            $order = PurchaseOrder::query()
                ->where('organization_id', $organization->getKey())
                ->whereIn('status', ['open', 'closed'])
                ->lockForUpdate()
                ->findOrFail($lineReference->purchase_order_id);
            $line = PurchaseOrderLine::query()
                ->where('organization_id', $organization->getKey())
                ->where('purchase_order_id', $order->getKey())
                ->lockForUpdate()
                ->findOrFail($lineId);
            $existing = ProjectPurchaseCost::query()
                ->where('organization_id', $organization->getKey())
                ->where('purchase_order_line_id', $line->getKey())
                ->lockForUpdate()
                ->first();

            if ($existing !== null) {
                abort_unless((int) $existing->project_id === (int) $projectRecord->getKey(), 409, 'این ردیف خرید به پروژهٔ دیگری متصل است.');

                return [$existing, true];
            }

            return [ProjectPurchaseCost::query()->create([
                'organization_id' => $organization->getKey(),
                'project_id' => $projectRecord->getKey(),
                'purchase_order_id' => $order->getKey(),
                'purchase_order_line_id' => $line->getKey(),
                'amount_rial' => (string) $line->line_total_rial,
                'purchase_order_code_snapshot' => $order->code,
                'supplier_name_snapshot' => $order->supplier_name_snapshot,
                'product_code_snapshot' => $line->product_code_snapshot,
                'product_name_snapshot' => $line->product_name_snapshot,
                'unit_name_snapshot' => $line->unit_name_snapshot,
                'unit_symbol_snapshot' => $line->unit_symbol_snapshot,
                'linked_by' => $request->user()->getKey(),
                'linked_at' => CarbonImmutable::now(config('app.timezone')),
            ]), false];
        });

        return response()->json([
            'data' => $service->serializePurchaseCost($cost),
            'already_linked' => $alreadyLinked,
        ], $alreadyLinked ? 200 : 201);
    }

    private function activeOrganization(Request $request): Organization
    {
        $organization = $request->attributes->get('activeOrganization');
        abort_unless($organization instanceof Organization, 403);
        Gate::authorize('viewWork', $organization);

        return $organization;
    }

    private function authorizeManageWork(Organization $organization): void
    {
        Gate::authorize('manageWork', $organization);
    }

    private function scopedProject(Organization $organization, int $project): WorkProject
    {
        return WorkProject::query()
            ->where('organization_id', $organization->getKey())
            ->findOrFail($project);
    }

    private function scopedTask(Organization $organization, int $project, int $task): WorkTask
    {
        return WorkTask::query()
            ->where('organization_id', $organization->getKey())
            ->where('project_id', $project)
            ->findOrFail($task);
    }

    private function scopedMember(Organization $organization, int $userId): OrganizationMembership
    {
        return OrganizationMembership::query()
            ->where('organization_id', $organization->getKey())
            ->where('user_id', $userId)
            ->firstOrFail();
    }

    private function createComment(
        Organization $organization,
        WorkProject $project,
        ?WorkTask $task,
        Request $request,
        string $body,
    ): WorkComment {
        $body = trim($body);
        if ($body === '') {
            throw ValidationException::withMessages(['body' => 'متن دیدگاه نمی‌تواند خالی باشد.']);
        }

        return WorkComment::query()->create([
            'organization_id' => $organization->getKey(),
            'project_id' => $project->getKey(),
            'task_id' => $task?->getKey(),
            'author_id' => $request->user()->getKey(),
            'body' => $body,
        ])->load('author');
    }

    private function rejectUnsupportedFields(Request $request, array $allowed): void
    {
        $unsupported = array_diff(array_keys($request->all()), $allowed);
        if ($unsupported !== []) {
            throw ValidationException::withMessages(array_fill_keys($unsupported, 'این مقدار در این درخواست پشتیبانی نمی‌شود.'));
        }
    }
}
