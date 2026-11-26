<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\Party;
use App\Models\Product;
use App\Models\ProjectPurchaseCost;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderLine;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestLine;
use App\Models\Unit;
use App\Models\User;
use App\Models\WorkComment;
use App\Models\WorkProject;
use App\Models\WorkTask;
use App\Models\WorkTaskReminder;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class P12ProjectWorkTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private Organization $foreignOrganization;

    private User $editor;

    private User $assignedEditor;

    private User $otherEditor;

    private User $reader;

    private User $foreignEditor;

    protected function setUp(): void
    {
        parent::setUp();

        $this->organization = Organization::query()->create(['name' => 'سازمان کار الف', 'slug' => 'p12-work-a']);
        $this->foreignOrganization = Organization::query()->create(['name' => 'سازمان کار ب', 'slug' => 'p12-work-b']);
        $this->editor = User::factory()->create();
        $this->assignedEditor = User::factory()->create();
        $this->otherEditor = User::factory()->create();
        $this->reader = User::factory()->create();
        $this->foreignEditor = User::factory()->create();

        $this->editor->organizations()->attach($this->organization, ['role' => OrganizationRole::Editor->value]);
        $this->assignedEditor->organizations()->attach($this->organization, ['role' => OrganizationRole::Editor->value]);
        $this->otherEditor->organizations()->attach($this->organization, ['role' => OrganizationRole::Editor->value]);
        $this->reader->organizations()->attach($this->organization, ['role' => OrganizationRole::Reader->value]);
        $this->foreignEditor->organizations()->attach($this->foreignOrganization, ['role' => OrganizationRole::Editor->value]);

        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organization->getKey()]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_task_counts_status_transitions_and_completion_replay_share_one_project_record(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-26 14:00:00', 'UTC'));

        $project = $this->createProject('برنامهٔ تحویل');
        $task = $this->createTask($project['id'], [
            'title' => 'آماده‌سازی تحویل',
            'due_on' => '2026-11-27',
            'assignee_user_id' => $this->assignedEditor->getKey(),
        ]);
        $this->postJson("/api/v1/projects/{$project['id']}/tasks/{$task['id']}/transition", [
            'status' => 'in_progress',
        ], $this->csrfHeaders())->assertOk()->assertJsonPath('data.status', 'in_progress');

        $completedAt = '2026-11-26 14:30:00';
        Carbon::setTestNow(Carbon::parse($completedAt, 'UTC'));
        $this->postJson("/api/v1/projects/{$project['id']}/tasks/{$task['id']}/transition", [
            'status' => 'completed',
        ], $this->csrfHeaders())
            ->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.completed_by.id', $this->editor->getKey())
            ->assertJsonPath('already_in_status', false);

        $record = WorkTask::query()->findOrFail($task['id']);
        self::assertSame($this->editor->getKey(), (int) $record->completed_by);
        self::assertSame($completedAt, $record->completed_at?->format('Y-m-d H:i:s'));

        Carbon::setTestNow(Carbon::parse('2026-11-26 15:10:00', 'UTC'));
        $this->postJson("/api/v1/projects/{$project['id']}/tasks/{$task['id']}/transition", [
            'status' => 'completed',
        ], $this->csrfHeaders())->assertOk()->assertJsonPath('already_in_status', true);
        self::assertSame($completedAt, $record->fresh()->completed_at?->format('Y-m-d H:i:s'));

        $this->getJson('/api/v1/projects?q=تحویل')
            ->assertOk()
            ->assertJsonPath('data.0.task_counts.open_total', 0)
            ->assertJsonPath('data.0.task_counts.completed', 1);
        $this->getJson("/api/v1/projects/{$project['id']}")
            ->assertOk()
            ->assertJsonPath('data.open_task_count', 0)
            ->assertJsonPath('data.task_counts.completed', 1)
            ->assertJsonPath('data.overdue_count', 0)
            ->assertJsonPath('data.tasks.0.completed_at', $record->fresh()->completed_at?->toIso8601String());

        $this->postJson("/api/v1/projects/{$project['id']}/tasks/{$task['id']}/transition", [
            'status' => 'open',
        ], $this->csrfHeaders())->assertOk()->assertJsonPath('data.completed_at', null);
        self::assertNull($record->fresh()->completed_by);
    }

    public function test_date_only_overdue_cutoff_uses_the_application_time_zone(): void
    {
        $project = $this->createProject('مرز سررسید');
        $task = $this->createTask($project['id'], [
            'title' => 'وظیفهٔ سررسید امروز',
            'due_on' => '2026-11-27',
        ]);

        Carbon::setTestNow(Carbon::parse('2026-11-27 23:59:59', 'UTC'));
        $this->getJson("/api/v1/projects/{$project['id']}")
            ->assertOk()->assertJsonPath('data.overdue_count', 0)->assertJsonPath('data.tasks.0.is_overdue', false);

        Carbon::setTestNow(Carbon::parse('2026-11-28 00:00:00', 'UTC'));
        $this->getJson("/api/v1/projects/{$project['id']}")
            ->assertOk()->assertJsonPath('data.overdue_count', 1)->assertJsonPath('data.tasks.0.is_overdue', true);
        self::assertSame('UTC', config('app.timezone'));

        Carbon::setTestNow();
    }

    public function test_members_can_read_scoped_comments_but_reader_writes_and_foreign_parents_are_denied(): void
    {
        $project = $this->createProject('گفت‌وگوی کار');
        $task = $this->createTask($project['id'], ['title' => 'بررسی یادداشت']);
        $projectComment = 'یادداشت متنی <strong>خام</strong>';
        $taskComment = "نکتهٔ وظیفه\nخط دوم";

        $this->postJson("/api/v1/projects/{$project['id']}/comments", ['body' => $projectComment], $this->csrfHeaders())
            ->assertCreated()->assertJsonPath('data.body', $projectComment)->assertJsonPath('data.author.id', $this->editor->getKey());
        $this->postJson("/api/v1/projects/{$project['id']}/tasks/{$task['id']}/comments", ['body' => $taskComment], $this->csrfHeaders())
            ->assertCreated()->assertJsonPath('data.body', $taskComment);

        $foreignProject = WorkProject::query()->create([
            'organization_id' => $this->foreignOrganization->getKey(),
            'title' => 'پروژهٔ بیرونی',
            'created_by' => $this->foreignEditor->getKey(),
        ]);
        $foreignTask = WorkTask::query()->create([
            'organization_id' => $this->foreignOrganization->getKey(),
            'project_id' => $foreignProject->getKey(),
            'title' => 'وظیفهٔ بیرونی',
            'status' => 'open',
            'created_by' => $this->foreignEditor->getKey(),
            'updated_by' => $this->foreignEditor->getKey(),
        ]);
        $foreignComment = WorkComment::query()->create([
            'organization_id' => $this->foreignOrganization->getKey(),
            'project_id' => $foreignProject->getKey(),
            'task_id' => $foreignTask->getKey(),
            'author_id' => $this->foreignEditor->getKey(),
            'body' => 'این محتوا نباید دیده شود.',
        ]);

        $this->actingAs($this->reader)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $this->getJson("/api/v1/projects/{$project['id']}")
            ->assertOk()
            ->assertJsonPath('data.comments.0.body', $projectComment);
        $this->getJson("/api/v1/projects/{$project['id']}/tasks/{$task['id']}")
            ->assertOk()
            ->assertJsonPath('data.comments.0.body', $taskComment);
        $this->getJson("/api/v1/projects/{$foreignProject->getKey()}")->assertNotFound();
        $this->getJson("/api/v1/projects/{$project['id']}/tasks/{$foreignTask->getKey()}")->assertNotFound();
        $this->getJson("/api/v1/projects/{$foreignProject->getKey()}/tasks/{$foreignTask->getKey()}")->assertNotFound();
        $this->postJson("/api/v1/projects/{$project['id']}/tasks/{$foreignTask->getKey()}/comments", [
            'body' => 'نباید ذخیره شود.',
        ], $this->csrfHeaders())->assertNotFound();
        $this->getJson("/api/v1/work/comments/{$foreignComment->getKey()}")->assertNotFound();

        $this->postJson("/api/v1/projects/{$project['id']}/tasks/{$task['id']}/transition", [
            'status' => 'completed',
        ], $this->csrfHeaders())->assertForbidden();
        $this->postJson("/api/v1/projects/{$project['id']}/tasks/{$task['id']}/comments", [
            'body' => 'خواننده نمی‌تواند دیدگاه بنویسد.',
        ], $this->csrfHeaders())->assertForbidden();
        self::assertSame('open', $task['status']);
        self::assertSame(2, WorkComment::query()->where('organization_id', $this->organization->getKey())->count());
        self::assertNull(WorkTask::query()->findOrFail($task['id'])->completed_at);
    }

    public function test_assignment_accepts_only_members_of_the_active_organization(): void
    {
        $project = $this->createProject('انتساب سازمانی');
        $readerAssigned = $this->postJson("/api/v1/projects/{$project['id']}/tasks", [
            'title' => 'وظیفه برای خواننده',
            'assignee_user_id' => $this->reader->getKey(),
        ], $this->csrfHeaders())->assertCreated()->json('data');
        self::assertSame($this->reader->getKey(), $readerAssigned['assignee']['id']);

        $this->postJson("/api/v1/projects/{$project['id']}/tasks", [
            'title' => 'وظیفه برای سازمان دیگر',
            'assignee_user_id' => $this->foreignEditor->getKey(),
        ], $this->csrfHeaders())->assertNotFound();
        $this->postJson("/api/v1/projects/{$project['id']}/tasks", [
            'title' => 'وظیفه برای شناسهٔ ناشناخته',
            'assignee_user_id' => 999999,
        ], $this->csrfHeaders())->assertNotFound();

        self::assertSame(1, WorkTask::query()->where('project_id', $project['id'])->count());
    }

    public function test_due_reminder_is_persisted_once_and_follows_the_current_assignee(): void
    {
        $project = $this->createProject('یادآور محلی');
        $task = $this->createTask($project['id'], [
            'title' => 'آمادهٔ پیگیری',
            'due_on' => '2026-11-27',
            'assignee_user_id' => $this->assignedEditor->getKey(),
        ]);

        Carbon::setTestNow(Carbon::parse('2026-11-26 23:59:59', 'UTC'));
        $this->actingAs($this->assignedEditor)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $this->postJson('/api/v1/work/inbox/process-due-reminders', [], $this->csrfHeaders())
            ->assertOk()->assertJsonPath('created', 0)->assertJsonPath('time_zone', 'UTC');
        $this->getJson('/api/v1/work/inbox')->assertOk()->assertJsonPath('open_count', 1)
            ->assertJsonPath('due_reminder_count', 0)->assertJsonPath('data.0.due_reminder', null);
        self::assertSame(0, WorkTaskReminder::query()->count());

        Carbon::setTestNow(Carbon::parse('2026-11-27 00:00:00', 'UTC'));
        $first = $this->postJson('/api/v1/work/inbox/process-due-reminders', [], $this->csrfHeaders())
            ->assertOk()->assertJsonPath('created', 1)->json();
        self::assertSame('2026-11-27', $first['today']);
        $this->postJson('/api/v1/work/inbox/process-due-reminders', [], $this->csrfHeaders())
            ->assertOk()->assertJsonPath('created', 0);
        $oldInbox = $this->getJson('/api/v1/work/inbox')
            ->assertOk()->assertJsonPath('open_count', 1)->assertJsonPath('due_reminder_count', 1)->json();
        $oldIdentity = $oldInbox['data'][0]['due_reminder']['identity'];
        self::assertSame(1, WorkTaskReminder::query()->count());

        Carbon::setTestNow(Carbon::parse('2026-11-27 23:59:59', 'UTC'));
        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $this->getJson("/api/v1/projects/{$project['id']}")
            ->assertOk()->assertJsonPath('data.overdue_count', 0)->assertJsonPath('data.tasks.0.is_overdue', false);

        Carbon::setTestNow(Carbon::parse('2026-11-28 00:00:00', 'UTC'));
        $this->getJson("/api/v1/projects/{$project['id']}")
            ->assertOk()->assertJsonPath('data.overdue_count', 1)->assertJsonPath('data.tasks.0.is_overdue', true);

        $this->patchJson("/api/v1/projects/{$project['id']}/tasks/{$task['id']}", [
            'assignee_user_id' => $this->otherEditor->getKey(),
        ], $this->csrfHeaders())->assertOk()->assertJsonPath('data.assignee.id', $this->otherEditor->getKey());
        $this->actingAs($this->assignedEditor)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $this->postJson('/api/v1/work/inbox/process-due-reminders', [], $this->csrfHeaders())
            ->assertOk()->assertJsonPath('created', 0);
        $this->getJson('/api/v1/work/inbox')->assertOk()->assertJsonPath('open_count', 0)->assertJsonPath('due_reminder_count', 0);

        $this->actingAs($this->otherEditor)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $this->postJson('/api/v1/work/inbox/process-due-reminders', [], $this->csrfHeaders())
            ->assertOk()->assertJsonPath('created', 1);
        $newInbox = $this->getJson('/api/v1/work/inbox')
            ->assertOk()->assertJsonPath('open_count', 1)->assertJsonPath('due_reminder_count', 1)->json();
        self::assertNotSame($oldIdentity, $newInbox['data'][0]['due_reminder']['identity']);
        self::assertSame(2, WorkTaskReminder::query()->count());

        $this->postJson("/api/v1/projects/{$project['id']}/tasks/{$task['id']}/transition", [
            'status' => 'completed',
        ], $this->csrfHeaders())->assertOk()->assertJsonPath('data.completed_by.id', $this->otherEditor->getKey());
        $this->getJson('/api/v1/work/inbox')->assertOk()->assertJsonPath('open_count', 0)->assertJsonPath('due_reminder_count', 0);
        self::assertSame(2, WorkTaskReminder::query()->count());

        Carbon::setTestNow();
    }

    public function test_purchase_line_link_is_unique_exact_and_preserves_its_snapshots(): void
    {
        $project = $this->createProject('پروژهٔ خرید');
        $line = $this->makePurchaseLine($this->organization, $this->editor, '500000');
        $foreignLine = $this->makePurchaseLine($this->foreignOrganization, $this->foreignEditor, '750000');

        $first = $this->postJson("/api/v1/projects/{$project['id']}/purchase-costs", [
            'purchase_order_line_id' => $line->getKey(),
        ], $this->csrfHeaders())
            ->assertCreated()
            ->assertJsonPath('data.amount_rial', '500000')
            ->assertJsonPath('data.source_url', '/purchase-orders/'.$line->purchase_order_id.'?line='.$line->getKey())
            ->assertJsonPath('already_linked', false)
            ->json('data');

        $retry = $this->postJson("/api/v1/projects/{$project['id']}/purchase-costs", [
            'purchase_order_line_id' => $line->getKey(),
        ], $this->csrfHeaders())
            ->assertOk()->assertJsonPath('already_linked', true)->json('data');
        self::assertSame($first['id'], $retry['id']);
        $projectCostCount = ProjectPurchaseCost::query()->count();
        self::assertSame(1, $projectCostCount);

        $otherProject = $this->createProject('پروژهٔ دوم');
        $this->postJson("/api/v1/projects/{$otherProject['id']}/purchase-costs", [
            'purchase_order_line_id' => $line->getKey(),
        ], $this->csrfHeaders())->assertStatus(409);
        $this->postJson("/api/v1/projects/{$project['id']}/purchase-costs", [
            'purchase_order_line_id' => $foreignLine->getKey(),
        ], $this->csrfHeaders())->assertNotFound();

        $product = Product::query()->findOrFail($line->product_id);
        $supplier = Party::query()->findOrFail(PurchaseOrder::query()->findOrFail($line->purchase_order_id)->supplier_party_id);
        $product->forceFill(['name' => 'نام روزآمد کالا'])->save();
        $supplier->forceFill(['display_name' => 'نام روزآمد تأمین‌کننده'])->save();

        $detail = $this->getJson("/api/v1/projects/{$project['id']}")
            ->assertOk()
            ->assertJsonPath('data.committed_purchase_rial', '500000')
            ->assertJsonPath('data.purchase_costs.0.amount_rial', '500000')
            ->assertJsonPath('data.purchase_costs.0.product_name', $line->product_name_snapshot)
            ->assertJsonPath('data.purchase_costs.0.supplier_name', 'تأمین‌کنندهٔ P12')
            ->json('data.purchase_costs.0');
        self::assertSame($first['source_url'], $detail['source_url']);
        self::assertSame($projectCostCount, ProjectPurchaseCost::query()->count());

        $this->actingAs($this->reader)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $this->postJson("/api/v1/projects/{$project['id']}/purchase-costs", [
            'purchase_order_line_id' => $line->getKey(),
        ], $this->csrfHeaders())->assertForbidden();
        self::assertSame($projectCostCount, ProjectPurchaseCost::query()->count());
    }

    public function test_mutations_require_explicit_csrf_and_unknown_task_ids_remain_hidden(): void
    {
        $project = $this->createProject('مرز CSRF');
        $this->postJson('/api/v1/projects', ['title' => 'بدون نشانه'])->assertStatus(419);
        $this->postJson("/api/v1/projects/{$project['id']}/tasks", ['title' => 'بدون نشانه'])->assertStatus(419);
        $task = $this->createTask($project['id'], ['title' => 'محدودیت مسیر']);
        $this->postJson("/api/v1/projects/{$project['id']}/tasks/999999/transition", ['status' => 'completed'], $this->csrfHeaders())
            ->assertNotFound();
        $this->postJson('/api/v1/work/inbox/process-due-reminders')->assertStatus(419);
        self::assertSame('open', WorkTask::query()->findOrFail($task['id'])->status->value);
    }

    private function createProject(string $title): array
    {
        return $this->postJson('/api/v1/projects', ['title' => $title], $this->csrfHeaders())
            ->assertCreated()
            ->json('data');
    }

    private function createTask(int $projectId, array $fields = []): array
    {
        return $this->postJson("/api/v1/projects/{$projectId}/tasks", [
            'title' => $fields['title'] ?? 'وظیفهٔ P12',
            ...array_diff_key($fields, ['title' => true]),
        ], $this->csrfHeaders())
            ->assertCreated()
            ->json('data');
    }

    private function makePurchaseLine(Organization $organization, User $actor, string $amount): PurchaseOrderLine
    {
        $suffix = Str::lower(Str::random(8));
        $unit = Unit::query()->create([
            'organization_id' => $organization->getKey(),
            'code' => 'P12-U-'.$suffix,
            'name' => 'واحد P12',
            'symbol' => 'EA',
            'is_active' => true,
        ]);
        $product = Product::query()->create([
            'organization_id' => $organization->getKey(),
            'base_unit_id' => $unit->getKey(),
            'code' => 'P12-P-'.$suffix,
            'name' => 'کالای P12 '.$suffix,
        ]);
        $supplier = Party::query()->create([
            'organization_id' => $organization->getKey(),
            'code' => 'P12-S-'.$suffix,
            'display_name' => 'تأمین‌کنندهٔ P12',
        ]);
        $request = PurchaseRequest::query()->create([
            'organization_id' => $organization->getKey(),
            'code' => 'P12-PR-'.$suffix,
            'title' => 'درخواست آزمون P12',
            'status' => 'approved',
            'requester_id' => $actor->getKey(),
            'submitted_by' => $actor->getKey(),
            'submitted_at' => now(),
            'approved_by' => $actor->getKey(),
            'approved_at' => now(),
        ]);
        $requestLine = PurchaseRequestLine::query()->create([
            'organization_id' => $organization->getKey(),
            'purchase_request_id' => $request->getKey(),
            'product_id' => $product->getKey(),
            'unit_id' => $unit->getKey(),
            'quantity_milli' => 1000,
            'product_code_snapshot' => $product->code,
            'product_name_snapshot' => $product->name,
            'unit_code_snapshot' => $unit->code,
            'unit_name_snapshot' => $unit->name,
            'unit_symbol_snapshot' => $unit->symbol,
        ]);
        $order = PurchaseOrder::query()->create([
            'organization_id' => $organization->getKey(),
            'source_request_id' => $request->getKey(),
            'supplier_party_id' => $supplier->getKey(),
            'code' => 'P12-PO-'.$suffix,
            'status' => 'closed',
            'supplier_code_snapshot' => $supplier->code,
            'supplier_name_snapshot' => $supplier->display_name,
            'currency_code' => 'IRR',
            'currency_scale' => 0,
            'rounding_rule' => 'per_line_half_up',
            'total_rial' => $amount,
            'conversion_hash' => hash('sha256', 'P12-'.$suffix),
            'created_by' => $actor->getKey(),
            'ordered_at' => now(),
            'closed_at' => now(),
        ]);

        return PurchaseOrderLine::query()->create([
            'organization_id' => $organization->getKey(),
            'purchase_order_id' => $order->getKey(),
            'source_request_line_id' => $requestLine->getKey(),
            'product_id' => $product->getKey(),
            'unit_id' => $unit->getKey(),
            'ordered_quantity_milli' => 1000,
            'received_quantity_milli' => 1000,
            'product_code_snapshot' => $product->code,
            'product_name_snapshot' => $product->name,
            'unit_code_snapshot' => $unit->code,
            'unit_name_snapshot' => $unit->name,
            'unit_symbol_snapshot' => $unit->symbol,
            'unit_price_rial' => $amount,
            'line_total_rial' => $amount,
        ]);
    }
}
