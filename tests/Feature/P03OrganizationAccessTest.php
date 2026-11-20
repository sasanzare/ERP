<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\OrganizationMembership;
use App\Models\OrganizationRoleAudit;
use App\Models\Product;
use App\Models\User;
use App\Services\MembershipRoleService;
use Database\Seeders\P03DemoSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class P03OrganizationAccessTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organizationA;

    private Organization $organizationB;

    private User $editor;

    private User $reader;

    private Product $productA;

    private Product $productB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->organizationA = Organization::query()->create(['name' => 'سازمان الف', 'slug' => 'p03-a']);
        $this->organizationB = Organization::query()->create(['name' => 'سازمان ب', 'slug' => 'p03-b']);
        $this->editor = User::factory()->create();
        $this->reader = User::factory()->create();

        $this->editor->organizations()->attach($this->organizationA, ['role' => OrganizationRole::Editor->value]);
        $this->editor->organizations()->attach($this->organizationB, ['role' => OrganizationRole::Reader->value]);
        $this->reader->organizations()->attach($this->organizationA, ['role' => OrganizationRole::Reader->value]);

        $this->productA = Product::query()->create([
            'organization_id' => $this->organizationA->getKey(),
            'code' => 'DEMO-001',
            'name' => 'کالای الف',
        ]);
        $this->productB = Product::query()->create([
            'organization_id' => $this->organizationB->getKey(),
            'code' => 'DEMO-001',
            'name' => 'کالای ب',
        ]);
    }

    public function test_guest_api_gets_json_401(): void
    {
        $this->getJson('/api/v1/products')->assertUnauthorized();
    }

    public function test_editor_can_update_owned_product_and_reader_cannot(): void
    {
        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organizationA->getKey()]);

        $this->patchJson('/api/v1/products/'.$this->productA->getKey(), ['name' => 'نام ویرایش‌شده'], $this->csrfHeaders())
            ->assertOk()
            ->assertJsonPath('data.name', 'نام ویرایش‌شده');

        $this->assertDatabaseHas('products', ['id' => $this->productA->getKey(), 'name' => 'نام ویرایش‌شده']);

        $this->actingAs($this->reader)->withSession(['active_organization_id' => $this->organizationA->getKey()]);

        $this->patchJson('/api/v1/products/'.$this->productA->getKey(), ['name' => 'نباید ذخیره شود'], $this->csrfHeaders())
            ->assertForbidden();

        $this->assertDatabaseHas('products', ['id' => $this->productA->getKey(), 'name' => 'نام ویرایش‌شده']);
    }

    public function test_foreign_product_is_indistinguishable_from_unknown_product_for_update(): void
    {
        $this->actingAs($this->reader)->withSession(['active_organization_id' => $this->organizationA->getKey()]);

        $this->patchJson('/api/v1/products/'.$this->productB->getKey(), ['name' => 'تلاش تغییر'], $this->csrfHeaders())
            ->assertNotFound();
        $this->patchJson('/api/v1/products/999999', ['name' => 'تلاش تغییر'], $this->csrfHeaders())
            ->assertNotFound();

        $this->assertDatabaseHas('products', ['id' => $this->productB->getKey(), 'name' => 'کالای ب']);
    }

    public function test_client_cannot_change_ownership_or_role_fields(): void
    {
        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organizationA->getKey()]);

        $this->patchJson('/api/v1/products/'.$this->productA->getKey(), [
            'name' => 'نام جدید',
            'organization_id' => $this->organizationB->getKey(),
            'role' => OrganizationRole::Editor->value,
        ], $this->csrfHeaders())->assertUnprocessable();

        $this->assertDatabaseHas('products', [
            'id' => $this->productA->getKey(),
            'organization_id' => $this->organizationA->getKey(),
            'name' => 'کالای الف',
        ]);
    }

    public function test_user_can_switch_between_allowed_organizations_and_role_is_membership_scoped(): void
    {
        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organizationA->getKey()]);

        $this->getJson('/api/v1/products')->assertJsonPath('data.0.name', 'کالای الف');
        $this->getJson('/api/v1/workspace')
            ->assertJsonPath('active_organization.role', OrganizationRole::Editor->value)
            ->assertJsonPath('capabilities.products.update', true);

        $this->postJson('/api/v1/active-organization', ['organization_id' => $this->organizationB->getKey()], $this->csrfHeaders())
            ->assertOk()
            ->assertJsonPath('active_organization.role', OrganizationRole::Reader->value)
            ->assertJsonPath('capabilities.products.update', false);

        $this->getJson('/api/v1/products')->assertJsonPath('data.0.name', 'کالای ب');
    }

    public function test_database_rejects_a_duplicate_user_organization_membership(): void
    {
        $this->expectException(QueryException::class);

        $this->editor->organizations()->attach($this->organizationA, ['role' => OrganizationRole::Reader->value]);
    }

    public function test_unowned_and_stale_organization_selections_are_denied(): void
    {
        $this->actingAs($this->reader)->withSession(['active_organization_id' => $this->organizationA->getKey()]);

        $this->postJson('/api/v1/active-organization', ['organization_id' => $this->organizationB->getKey()], $this->csrfHeaders())
            ->assertForbidden();
        $this->getJson('/api/v1/products')->assertJsonPath('data.0.name', 'کالای الف');

        $this->withSession(['active_organization_id' => $this->organizationB->getKey()]);
        $this->getJson('/api/v1/products')->assertForbidden();
    }

    public function test_product_write_requires_an_explicit_matching_csrf_token(): void
    {
        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organizationA->getKey()]);

        $this->patchJson('/api/v1/products/'.$this->productA->getKey(), ['name' => 'بدون توکن'])
            ->assertStatus(419);
        $this->patchJson('/api/v1/products/'.$this->productA->getKey(), ['name' => 'توکن نامعتبر'], ['X-CSRF-TOKEN' => 'invalid-token'])
            ->assertStatus(419);

        $this->assertDatabaseHas('products', ['id' => $this->productA->getKey(), 'name' => 'کالای الف']);
    }

    public function test_revoked_membership_is_rechecked_on_each_protected_request(): void
    {
        $this->actingAs($this->reader)->withSession(['active_organization_id' => $this->organizationA->getKey()]);
        $this->getJson('/api/v1/products')->assertOk();

        $this->reader->organizations()->detach($this->organizationA);

        $this->getJson('/api/v1/products')->assertForbidden();
    }

    public function test_role_changes_are_audited_transactionally_and_unchanged_assignments_are_idempotent(): void
    {
        $roles = app(MembershipRoleService::class);

        $membership = $roles->assign($this->organizationA, $this->reader, OrganizationRole::Editor);
        $this->assertDatabaseCount('organization_role_audits', 1);

        $roles->assign($this->organizationA, $this->reader, OrganizationRole::Editor);
        $this->assertDatabaseCount('organization_role_audits', 1);

        $roles->assign($this->organizationA, $this->reader, OrganizationRole::Reader, $this->editor);

        $this->assertDatabaseCount('organization_role_audits', 2);
        $audit = OrganizationRoleAudit::query()->latest('id')->firstOrFail();
        $this->assertSame($this->organizationA->getKey(), $audit->organization_id);
        $this->assertSame($membership->getKey(), $audit->membership_id);
        $this->assertSame($this->editor->getKey(), $audit->actor_user_id);
        $this->assertSame('user', $audit->source);
        $this->assertSame(OrganizationRole::Editor->value, $audit->prior_role);
        $this->assertSame(OrganizationRole::Reader->value, $audit->new_role);
        $this->assertNotNull($audit->created_at);
    }

    public function test_repeat_demo_provisioning_preserves_counts_and_role_audit_history(): void
    {
        $credentials = [
            'editor' => ['email' => 'p03-editor@erp.test', 'password' => 'test-editor-password'],
            'reader' => ['email' => 'p03-reader@erp.test', 'password' => 'test-reader-password'],
        ];
        $seeder = app(P03DemoSeeder::class);

        $seeder->run($credentials);
        $counts = [
            Organization::query()->count(),
            OrganizationMembership::query()->count(),
            Product::query()->count(),
            OrganizationRoleAudit::query()->count(),
        ];
        $seeder->run($credentials);

        $this->assertSame($counts, [
            Organization::query()->count(),
            OrganizationMembership::query()->count(),
            Product::query()->count(),
            OrganizationRoleAudit::query()->count(),
        ]);
    }

    public function test_global_uniqueness_rollback_stops_before_dropping_the_organization_index(): void
    {
        try {
            $migration = require database_path('migrations/2026_11_20_000004_scope_product_code_uniqueness_to_organization.php');
            $migration->down();
            $this->fail('Rollback should be refused while organization-scoped duplicate codes exist.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('share a code', $exception->getMessage());
        }

        $indexes = collect(Schema::getIndexes('products'))->pluck('name');
        $this->assertTrue($indexes->contains('products_organization_code_unique'));
        $this->assertTrue(Schema::hasTable('products'));
    }
}
