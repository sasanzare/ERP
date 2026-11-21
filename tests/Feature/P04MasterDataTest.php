<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Location;
use App\Models\Organization;
use App\Models\Party;
use App\Models\PartyRole;
use App\Models\PriceList;
use App\Models\PriceListEntry;
use App\Models\Product;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use Database\Seeders\P04DemoSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class P04MasterDataTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organizationA;

    private Organization $organizationB;

    private User $editor;

    private User $reader;

    private Unit $unitA;

    private Product $productA;

    protected function setUp(): void
    {
        parent::setUp();

        $this->organizationA = Organization::query()->create(['name' => 'سازمان الف', 'slug' => 'p04-a']);
        $this->organizationB = Organization::query()->create(['name' => 'سازمان ب', 'slug' => 'p04-b']);
        $this->editor = User::factory()->create();
        $this->reader = User::factory()->create();
        $this->editor->organizations()->attach($this->organizationA, ['role' => OrganizationRole::Editor->value]);
        $this->editor->organizations()->attach($this->organizationB, ['role' => OrganizationRole::Reader->value]);
        $this->reader->organizations()->attach($this->organizationA, ['role' => OrganizationRole::Reader->value]);

        $this->unitA = Unit::query()->create([
            'organization_id' => $this->organizationA->getKey(),
            'code' => 'EA',
            'name' => 'عدد',
            'symbol' => 'عدد',
        ]);
        $this->productA = Product::query()->create([
            'organization_id' => $this->organizationA->getKey(),
            'code' => 'DEMO-001',
            'name' => 'کالای الف',
        ]);

        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organizationA->getKey()]);
    }

    public function test_one_party_can_have_both_roles_and_name_edits_are_shared(): void
    {
        $created = $this->postJson('/api/v1/parties', [
            'code' => 'BOTH-001',
            'display_name' => 'طرف مشترک',
            'roles' => ['customer', 'supplier'],
        ], $this->csrfHeaders())->assertCreated();
        $id = $created->json('data.id');

        $this->getJson('/api/v1/parties?role=customer')->assertOk()->assertJsonPath('data.0.id', $id);
        $this->getJson('/api/v1/parties?role=supplier')->assertOk()->assertJsonPath('data.0.id', $id);

        $this->patchJson('/api/v1/parties/'.$id, [
            'code' => 'BOTH-001',
            'display_name' => 'طرف مشترک ویرایش‌شده',
            'roles' => ['customer', 'supplier'],
        ], $this->csrfHeaders())->assertOk()->assertJsonPath('data.id', $id);

        $this->getJson('/api/v1/parties?role=customer')->assertJsonPath('data.0.display_name', 'طرف مشترک ویرایش‌شده');
        $this->getJson('/api/v1/parties?role=supplier')->assertJsonPath('data.0.display_name', 'طرف مشترک ویرایش‌شده');
        $this->assertDatabaseCount('parties', 1);
        $this->assertDatabaseCount('party_roles', 2);
    }

    public function test_product_base_unit_and_selected_price_list_resolve_exact_rials(): void
    {
        $this->patchJson('/api/v1/products/'.$this->productA->getKey(), ['name' => 'نام سازگار'], $this->csrfHeaders())
            ->assertOk()->assertJsonPath('data.name', 'نام سازگار');

        $this->patchJson('/api/v1/products/'.$this->productA->getKey(), ['base_unit_id' => $this->unitA->getKey()], $this->csrfHeaders())
            ->assertOk();
        $this->getJson('/api/v1/products/'.$this->productA->getKey())
            ->assertOk()->assertJsonPath('data.base_unit.id', $this->unitA->getKey());

        $productB = Product::query()->create([
            'organization_id' => $this->organizationA->getKey(),
            'code' => 'UNPRICED-01',
            'name' => 'کالای بدون قیمت',
            'base_unit_id' => $this->unitA->getKey(),
        ]);
        $listA = PriceList::query()->create(['organization_id' => $this->organizationA->getKey(), 'code' => 'LIST-A', 'name' => 'فهرست الف']);
        $listB = PriceList::query()->create(['organization_id' => $this->organizationA->getKey(), 'code' => 'LIST-B', 'name' => 'فهرست ب']);

        $this->postJson('/api/v1/price-lists/'.$listA->getKey().'/entries', [
            'product_id' => $this->productA->getKey(), 'amount_rial' => '120000',
        ], $this->csrfHeaders())->assertCreated();
        $this->postJson('/api/v1/price-lists/'.$listB->getKey().'/entries', [
            'product_id' => $this->productA->getKey(), 'amount_rial' => '135000',
        ], $this->csrfHeaders())->assertCreated();

        $this->getJson('/api/v1/price-lists/'.$listA->getKey().'/products/'.$this->productA->getKey())
            ->assertOk()->assertJsonPath('data.priced', true)->assertJsonPath('data.amount_rial', '120000');
        $this->getJson('/api/v1/price-lists/'.$listB->getKey().'/products/'.$this->productA->getKey())
            ->assertOk()->assertJsonPath('data.priced', true)->assertJsonPath('data.amount_rial', '135000');
        $this->getJson('/api/v1/price-lists/'.$listA->getKey().'/products/'.$productB->getKey())
            ->assertOk()->assertJsonPath('data.priced', false)->assertJsonPath('data.amount_rial', null);

        $this->assertDatabaseHas('price_list_entries', ['amount_rial' => 120000, 'product_id' => $this->productA->getKey()]);
        $this->assertDatabaseHas('price_list_entries', ['amount_rial' => 135000, 'product_id' => $this->productA->getKey()]);
    }

    public function test_duplicate_code_is_validated_and_database_scope_allows_another_organization(): void
    {
        $this->postJson('/api/v1/parties', [
            'code' => 'DUP-01', 'display_name' => 'طرف اول', 'roles' => ['customer'],
        ], $this->csrfHeaders())->assertCreated();
        $this->postJson('/api/v1/parties', [
            'code' => 'DUP-01', 'display_name' => 'تکراری', 'roles' => ['supplier'],
        ], $this->csrfHeaders())->assertUnprocessable()->assertJsonValidationErrors('code');

        Party::query()->create([
            'organization_id' => $this->organizationB->getKey(),
            'code' => 'DUP-01',
            'display_name' => 'طرف سازمان ب',
        ]);
        $this->assertDatabaseCount('parties', 2);

        try {
            Party::query()->create([
                'organization_id' => $this->organizationA->getKey(),
                'code' => 'DUP-01',
                'display_name' => 'تکراری پایگاه داده',
            ]);
            $this->fail('The organization-scoped party code index accepted a duplicate.');
        } catch (QueryException) {
            $this->assertDatabaseCount('parties', 2);
        }

        $this->postJson('/api/v1/products', ['code' => 'PRODUCT-DUP', 'name' => 'کالای اول'], $this->csrfHeaders())
            ->assertCreated();
        $this->postJson('/api/v1/products', ['code' => 'PRODUCT-DUP', 'name' => 'کالای تکراری'], $this->csrfHeaders())
            ->assertUnprocessable()->assertJsonValidationErrors('code');
        Product::query()->create([
            'organization_id' => $this->organizationB->getKey(), 'code' => 'PRODUCT-DUP', 'name' => 'کالای سازمان ب',
        ]);
    }

    public function test_foreign_units_and_foreign_records_are_hidden_and_leave_values_unchanged(): void
    {
        $foreignUnit = Unit::query()->create([
            'organization_id' => $this->organizationB->getKey(), 'code' => 'EA', 'name' => 'واحد خارجی', 'symbol' => 'عدد',
        ]);
        $foreignProduct = Product::query()->create([
            'organization_id' => $this->organizationB->getKey(), 'code' => 'DEMO-001', 'name' => 'کالای مخفی', 'base_unit_id' => $foreignUnit->getKey(),
        ]);
        $foreignParty = Party::query()->create([
            'organization_id' => $this->organizationB->getKey(), 'code' => 'FOREIGN-P', 'display_name' => 'طرف مخفی',
        ]);
        PartyRole::query()->create(['organization_id' => $this->organizationB->getKey(), 'party_id' => $foreignParty->getKey(), 'role' => 'customer']);
        $foreignWarehouse = Warehouse::query()->create([
            'organization_id' => $this->organizationB->getKey(), 'code' => 'WH-FOREIGN', 'name' => 'انبار مخفی',
        ]);
        $foreignLocation = Location::query()->create([
            'organization_id' => $this->organizationB->getKey(), 'warehouse_id' => $foreignWarehouse->getKey(), 'code' => 'LOC-FOREIGN', 'name' => 'مکان مخفی',
        ]);
        $foreignList = PriceList::query()->create([
            'organization_id' => $this->organizationB->getKey(), 'code' => 'PL-FOREIGN', 'name' => 'فهرست مخفی',
        ]);
        $ownedList = PriceList::query()->create([
            'organization_id' => $this->organizationA->getKey(), 'code' => 'PL-OWN', 'name' => 'فهرست خودی',
        ]);

        $this->patchJson('/api/v1/products/'.$this->productA->getKey(), ['base_unit_id' => $foreignUnit->getKey()], $this->csrfHeaders())
            ->assertUnprocessable()->assertJsonValidationErrors('base_unit_id');
        $this->assertDatabaseHas('products', ['id' => $this->productA->getKey(), 'base_unit_id' => null]);
        $this->getJson('/api/v1/products/'.$foreignProduct->getKey())->assertNotFound()->assertDontSee('کالای مخفی');
        $this->patchJson('/api/v1/products/'.$foreignProduct->getKey(), ['name' => 'تغییر ممنوع'], $this->csrfHeaders())->assertNotFound();

        foreach ([
            ['/api/v1/parties', $foreignParty->getKey(), ['code' => 'NEW', 'display_name' => 'تغییر', 'roles' => ['customer']]],
            ['/api/v1/units', $foreignUnit->getKey(), ['code' => 'NEW', 'name' => 'تغییر', 'symbol' => 'x']],
            ['/api/v1/warehouses', $foreignWarehouse->getKey(), ['code' => 'NEW', 'name' => 'تغییر']],
            ['/api/v1/locations', $foreignLocation->getKey(), ['code' => 'NEW', 'name' => 'تغییر', 'warehouse_id' => $foreignWarehouse->getKey()]],
            ['/api/v1/price-lists', $foreignList->getKey(), ['code' => 'NEW', 'name' => 'تغییر']],
        ] as [$base, $id, $payload]) {
            $this->getJson($base.'/'.$id)->assertNotFound();
            $this->patchJson($base.'/'.$id, $payload, $this->csrfHeaders())->assertNotFound();
        }

        $this->postJson('/api/v1/locations', [
            'warehouse_id' => $foreignWarehouse->getKey(), 'code' => 'LOC-LEAK', 'name' => 'نباید ثبت شود',
        ], $this->csrfHeaders())->assertUnprocessable()->assertJsonValidationErrors('warehouse_id');
        $this->getJson('/api/v1/price-lists/'.$foreignList->getKey().'/products/'.$foreignProduct->getKey())->assertNotFound();
        $this->postJson('/api/v1/price-lists/'.$foreignList->getKey().'/entries', [
            'product_id' => $foreignProduct->getKey(), 'amount_rial' => '1000',
        ], $this->csrfHeaders())->assertNotFound();
        $this->postJson('/api/v1/price-lists/'.$ownedList->getKey().'/entries', [
            'product_id' => $foreignProduct->getKey(), 'amount_rial' => '1000',
        ], $this->csrfHeaders())->assertUnprocessable()->assertJsonValidationErrors('product_id');
        $this->postJson('/api/v1/parties', [
            'organization_id' => $this->organizationB->getKey(),
            'code' => 'ORG-OVERRIDE',
            'display_name' => 'نباید ساخته شود',
            'roles' => ['customer'],
        ], $this->csrfHeaders())->assertUnprocessable()->assertJsonValidationErrors('organization_id');
        $this->assertDatabaseHas('parties', ['id' => $foreignParty->getKey(), 'display_name' => 'طرف مخفی']);
        $this->assertDatabaseHas('warehouses', ['id' => $foreignWarehouse->getKey(), 'name' => 'انبار مخفی']);
        $this->assertDatabaseMissing('locations', ['code' => 'LOC-LEAK']);
    }

    public function test_location_selectors_filter_by_warehouse_and_server_rejects_a_mismatched_pair(): void
    {
        $firstWarehouse = Warehouse::query()->create(['organization_id' => $this->organizationA->getKey(), 'code' => 'WH-A', 'name' => 'انبار الف']);
        $secondWarehouse = Warehouse::query()->create(['organization_id' => $this->organizationA->getKey(), 'code' => 'WH-B', 'name' => 'انبار ب']);
        $location = Location::query()->create([
            'organization_id' => $this->organizationA->getKey(), 'warehouse_id' => $secondWarehouse->getKey(), 'code' => 'LOC-B', 'name' => 'مکان انبار ب',
        ]);

        $this->getJson('/api/v1/locations?warehouse_id='.$firstWarehouse->getKey())->assertOk()->assertExactJson(['data' => []]);
        $this->getJson('/api/v1/locations?warehouse_id='.$secondWarehouse->getKey())->assertOk()->assertJsonPath('data.0.id', $location->getKey());
        $this->postJson('/api/v1/locations/validate-selection', [
            'warehouse_id' => $firstWarehouse->getKey(), 'location_id' => $location->getKey(),
        ], $this->csrfHeaders())->assertUnprocessable()->assertJsonValidationErrors('location_id')->assertDontSee('مکان انبار ب');
    }

    public function test_readers_can_read_registers_and_details_but_cannot_write(): void
    {
        $party = Party::query()->create([
            'organization_id' => $this->organizationA->getKey(), 'code' => 'READ-01', 'display_name' => 'طرف قابل مشاهده',
        ]);
        PartyRole::query()->create(['organization_id' => $this->organizationA->getKey(), 'party_id' => $party->getKey(), 'role' => 'customer']);
        $warehouse = Warehouse::query()->create(['organization_id' => $this->organizationA->getKey(), 'code' => 'READ-WH', 'name' => 'انبار قابل مشاهده']);
        $location = Location::query()->create([
            'organization_id' => $this->organizationA->getKey(), 'warehouse_id' => $warehouse->getKey(), 'code' => 'READ-LOC', 'name' => 'مکان قابل مشاهده',
        ]);
        $list = PriceList::query()->create(['organization_id' => $this->organizationA->getKey(), 'code' => 'READ-PL', 'name' => 'فهرست قابل مشاهده']);

        $this->actingAs($this->reader)->withSession(['active_organization_id' => $this->organizationA->getKey()]);
        $this->getJson('/api/v1/parties')->assertOk();
        $this->getJson('/api/v1/parties/'.$party->getKey())->assertOk()->assertJsonPath('data.display_name', 'طرف قابل مشاهده');
        $this->getJson('/api/v1/units')->assertOk();
        $this->getJson('/api/v1/warehouses')->assertOk();
        $this->getJson('/api/v1/locations/'.$location->getKey())->assertOk();
        $this->getJson('/api/v1/price-lists/'.$list->getKey())->assertOk();

        $this->postJson('/api/v1/parties', [
            'code' => 'NO-WRITE', 'display_name' => 'ممنوع', 'roles' => ['customer'],
        ], $this->csrfHeaders())->assertForbidden();
        $this->patchJson('/api/v1/parties/'.$party->getKey(), [
            'code' => 'READ-01', 'display_name' => 'نباید تغییر کند', 'roles' => ['customer'],
        ], $this->csrfHeaders())->assertForbidden();
        $this->patchJson('/api/v1/products/'.$this->productA->getKey(), ['name' => 'تغییر ممنوع'], $this->csrfHeaders())->assertForbidden();
        $this->assertDatabaseHas('parties', ['id' => $party->getKey(), 'display_name' => 'طرف قابل مشاهده']);
        $this->assertDatabaseMissing('parties', ['code' => 'NO-WRITE']);
    }

    public function test_organization_switch_changes_master_data_lists_and_selector_results(): void
    {
        Party::query()->create(['organization_id' => $this->organizationA->getKey(), 'code' => 'ORG-A', 'display_name' => 'طرف الف']);
        $partyB = Party::query()->create(['organization_id' => $this->organizationB->getKey(), 'code' => 'ORG-B', 'display_name' => 'طرف ب']);

        $this->getJson('/api/v1/parties')->assertOk()->assertJsonPath('data.0.code', 'ORG-A')->assertDontSee('طرف ب');
        $this->postJson('/api/v1/active-organization', ['organization_id' => $this->organizationB->getKey()], $this->csrfHeaders())->assertOk();
        $this->getJson('/api/v1/parties')->assertOk()->assertJsonPath('data.0.id', $partyB->getKey())->assertDontSee('طرف الف');
        $this->getJson('/api/v1/units')->assertExactJson(['data' => []]);
    }

    public function test_p04_provisioning_is_repeatable_and_preserves_unrelated_master_data(): void
    {
        Party::query()->create([
            'organization_id' => $this->organizationA->getKey(), 'code' => 'OWNER-ROW', 'display_name' => 'کاربر مالک',
        ]);
        $seeder = app(P04DemoSeeder::class);
        $seeder->run($this->organizationA);
        $counts = [
            Party::query()->where('organization_id', $this->organizationA->getKey())->count(),
            PartyRole::query()->where('organization_id', $this->organizationA->getKey())->count(),
            Unit::query()->where('organization_id', $this->organizationA->getKey())->count(),
            Product::query()->where('organization_id', $this->organizationA->getKey())->count(),
            Warehouse::query()->where('organization_id', $this->organizationA->getKey())->count(),
            Location::query()->where('organization_id', $this->organizationA->getKey())->count(),
            PriceList::query()->where('organization_id', $this->organizationA->getKey())->count(),
            PriceListEntry::query()->where('organization_id', $this->organizationA->getKey())->count(),
        ];
        $seeder->run($this->organizationA);

        $this->assertSame($counts, [
            Party::query()->where('organization_id', $this->organizationA->getKey())->count(),
            PartyRole::query()->where('organization_id', $this->organizationA->getKey())->count(),
            Unit::query()->where('organization_id', $this->organizationA->getKey())->count(),
            Product::query()->where('organization_id', $this->organizationA->getKey())->count(),
            Warehouse::query()->where('organization_id', $this->organizationA->getKey())->count(),
            Location::query()->where('organization_id', $this->organizationA->getKey())->count(),
            PriceList::query()->where('organization_id', $this->organizationA->getKey())->count(),
            PriceListEntry::query()->where('organization_id', $this->organizationA->getKey())->count(),
        ]);
        $this->assertDatabaseHas('parties', ['organization_id' => $this->organizationA->getKey(), 'code' => 'OWNER-ROW']);
        $this->assertDatabaseCount('organization_role_audits', 0);
    }

    public function test_fresh_p04_schema_has_scoped_constraints_and_unknown_legacy_units_are_nullable(): void
    {
        $indexes = collect(Schema::getIndexes('products'))->pluck('name');
        $unitForeignKey = collect(Schema::getForeignKeys('products'))->firstWhere('name', 'products_organization_base_unit_fk');
        $foreignKeys = [
            'party_roles' => ['party_roles_organization_party_fk'],
            'locations' => ['locations_organization_warehouse_fk'],
            'price_list_entries' => ['price_entries_organization_list_fk', 'price_entries_organization_product_fk'],
        ];
        $scopedIndexes = [
            'parties' => 'parties_organization_code_unique',
            'party_roles' => 'party_roles_organization_party_role_unique',
            'units' => 'units_organization_code_unique',
            'warehouses' => 'warehouses_organization_code_unique',
            'locations' => 'locations_organization_code_unique',
            'price_lists' => 'price_lists_organization_code_unique',
            'price_list_entries' => 'price_entries_organization_list_product_unique',
        ];

        $this->assertTrue(Schema::hasColumn('products', 'base_unit_id'));
        $this->assertTrue($indexes->contains('products_organization_id_id_unique'));
        $this->assertNotNull($unitForeignKey);
        $this->assertDatabaseHas('products', ['id' => $this->productA->getKey(), 'base_unit_id' => null]);

        foreach ($foreignKeys as $table => $names) {
            $actual = collect(Schema::getForeignKeys($table))->pluck('name');
            foreach ($names as $name) {
                $this->assertTrue($actual->contains($name), "Missing {$name} on {$table}.");
            }
        }
        foreach ($scopedIndexes as $table => $name) {
            $actual = collect(Schema::getIndexes($table))->pluck('name');
            $this->assertTrue($actual->contains($name), "Missing {$name} on {$table}.");
        }

        $otherWarehouse = Warehouse::query()->create([
            'organization_id' => $this->organizationB->getKey(), 'code' => 'FK-WH-B', 'name' => 'انبار خارجی',
        ]);
        $otherProduct = Product::query()->create([
            'organization_id' => $this->organizationB->getKey(), 'code' => 'FK-P-B', 'name' => 'کالای خارجی',
        ]);
        $party = Party::query()->create([
            'organization_id' => $this->organizationA->getKey(), 'code' => 'FK-PARTY-A', 'display_name' => 'طرف الف',
        ]);
        $list = PriceList::query()->create([
            'organization_id' => $this->organizationA->getKey(), 'code' => 'FK-LIST-A', 'name' => 'فهرست الف',
        ]);

        $this->assertDatabaseRejects(fn () => PartyRole::query()->create([
            'organization_id' => $this->organizationB->getKey(), 'party_id' => $party->getKey(), 'role' => 'customer',
        ]), 'Party roles must not cross organizations.');
        $this->assertDatabaseRejects(fn () => Location::query()->create([
            'organization_id' => $this->organizationA->getKey(), 'warehouse_id' => $otherWarehouse->getKey(), 'code' => 'FK-LOC-A', 'name' => 'مکان الف',
        ]), 'A location must use a warehouse in its organization.');
        $this->assertDatabaseRejects(fn () => PriceListEntry::query()->create([
            'organization_id' => $this->organizationA->getKey(), 'price_list_id' => $list->getKey(), 'product_id' => $otherProduct->getKey(), 'amount_rial' => '1',
        ]), 'A price entry must use a product in its organization.');
    }

    private function assertDatabaseRejects(callable $create, string $failureMessage): void
    {
        try {
            $create();
            $this->fail($failureMessage);
        } catch (QueryException) {
            $this->assertTrue(true);
        }
    }
}
