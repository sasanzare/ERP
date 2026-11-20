<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductIndexTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private User $reader;

    protected function setUp(): void
    {
        parent::setUp();

        $this->organization = Organization::query()->create(['name' => 'سازمان آزمون', 'slug' => 'product-index-test']);
        $this->reader = User::factory()->create();
        $this->reader->organizations()->attach($this->organization, ['role' => OrganizationRole::Reader->value]);
        $this->actingAs($this->reader)->withSession(['active_organization_id' => $this->organization->getKey()]);
    }

    public function test_it_returns_an_empty_data_array_when_no_products_exist(): void
    {
        $this->getJson('/api/v1/products')
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    public function test_it_returns_products_from_the_test_database(): void
    {
        $product = Product::query()->create([
            'organization_id' => $this->organization->getKey(),
            'code' => 'DEMO-001',
            'name' => 'کالای نمونه',
        ]);

        $this->getJson('/api/v1/products')
            ->assertOk()
            ->assertExactJson([
                'data' => [
                    [
                        'id' => $product->getKey(),
                        'code' => 'DEMO-001',
                        'name' => 'کالای نمونه',
                    ],
                ],
            ]);
    }

    public function test_products_are_scoped_to_the_active_organization_before_serialization(): void
    {
        $otherOrganization = Organization::query()->create(['name' => 'سازمان دیگر', 'slug' => 'product-index-other']);
        $visible = Product::query()->create([
            'organization_id' => $this->organization->getKey(),
            'code' => 'DEMO-001',
            'name' => 'کالای سازمان من',
        ]);
        Product::query()->create([
            'organization_id' => $otherOrganization->getKey(),
            'code' => 'DEMO-001',
            'name' => 'اطلاعات محرمانهٔ سازمان دیگر',
        ]);

        $this->getJson('/api/v1/products')
            ->assertOk()
            ->assertExactJson(['data' => [[
                'id' => $visible->getKey(),
                'code' => 'DEMO-001',
                'name' => 'کالای سازمان من',
            ]]])
            ->assertDontSee('اطلاعات محرمانهٔ سازمان دیگر');
    }

    public function test_database_allows_same_code_in_other_organizations_but_rejects_same_org_duplicates(): void
    {
        $otherOrganization = Organization::query()->create(['name' => 'سازمان دوم', 'slug' => 'product-index-unique']);

        Product::query()->create([
            'organization_id' => $this->organization->getKey(),
            'code' => 'DUPLICATE-01',
            'name' => 'کالای اول',
        ]);

        Product::query()->create([
            'organization_id' => $otherOrganization->getKey(),
            'code' => 'DUPLICATE-01',
            'name' => 'کالای دوم',
        ]);

        $this->expectException(QueryException::class);

        Product::query()->create([
            'organization_id' => $this->organization->getKey(),
            'code' => 'DUPLICATE-01',
            'name' => 'کالای تکراری',
        ]);
    }
}
