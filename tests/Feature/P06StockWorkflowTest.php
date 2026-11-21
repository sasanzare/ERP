<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\InventoryMovement;
use App\Models\InventoryOperation;
use App\Models\Location;
use App\Models\Organization;
use App\Models\Product;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\Stock\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class P06StockWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private Organization $foreignOrganization;

    private User $editor;

    private User $reader;

    private Unit $unit;

    private Unit $otherUnit;

    private Product $product;

    private Product $productWithoutUnit;

    private Product $foreignProduct;

    private Warehouse $warehouseA;

    private Warehouse $warehouseB;

    private Warehouse $foreignWarehouse;

    private Location $locationA;

    private Location $locationB;

    private Location $foreignLocation;

    protected function setUp(): void
    {
        parent::setUp();

        $this->organization = Organization::query()->create(['name' => 'سازمان انبار الف', 'slug' => 'p06-stock-a']);
        $this->foreignOrganization = Organization::query()->create(['name' => 'سازمان پنهان', 'slug' => 'p06-stock-b']);
        $this->editor = User::factory()->create();
        $this->reader = User::factory()->create();
        $this->editor->organizations()->attach($this->organization, ['role' => OrganizationRole::Editor->value]);
        $this->reader->organizations()->attach($this->organization, ['role' => OrganizationRole::Reader->value]);
        $this->unit = $this->makeUnit($this->organization, 'EA');
        $this->otherUnit = $this->makeUnit($this->organization, 'BOX');
        $foreignUnit = $this->makeUnit($this->foreignOrganization, 'EA');
        $this->product = $this->makeProduct($this->organization, $this->unit, 'P06-001');
        $this->productWithoutUnit = Product::query()->create([
            'organization_id' => $this->organization->getKey(), 'code' => 'P06-NOUNIT', 'name' => 'کالای بی‌واحد',
        ]);
        $this->foreignProduct = $this->makeProduct($this->foreignOrganization, $foreignUnit, 'P06-FOREIGN');
        $this->warehouseA = $this->makeWarehouse($this->organization, 'WH-A');
        $this->warehouseB = $this->makeWarehouse($this->organization, 'WH-B');
        $this->foreignWarehouse = $this->makeWarehouse($this->foreignOrganization, 'WH-FOREIGN');
        $this->locationA = $this->makeLocation($this->organization, $this->warehouseA, 'LOC-A');
        $this->locationB = $this->makeLocation($this->organization, $this->warehouseB, 'LOC-B');
        $this->foreignLocation = $this->makeLocation($this->foreignOrganization, $this->foreignWarehouse, 'LOC-FOREIGN');

        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organization->getKey()]);
    }

    public function test_opening_reservation_release_and_retries_keep_exact_balances(): void
    {
        $opening = $this->postOperation([
            'operation_type' => 'opening', 'product_id' => $this->product->getKey(), 'quantity' => '10.000',
            'warehouse_id' => $this->warehouseA->getKey(), 'location_id' => $this->locationA->getKey(),
        ], 'b48fb354-3dad-493b-91d4-76e89f5a1f01')->assertCreated()->json('data');
        self::assertSame('10.000', $opening['quantity']);
        self::assertCount(1, $opening['legs']);

        $this->postOperation([
            'operation_type' => 'opening', 'product_id' => $this->product->getKey(), 'quantity' => '10.000',
            'warehouse_id' => $this->warehouseA->getKey(), 'location_id' => $this->locationA->getKey(),
        ], 'b48fb354-3dad-493b-91d4-76e89f5a1f01')->assertOk()->assertJsonPath('already_exists', true);
        $this->assertDatabaseCount('inventory_operations', 1);
        $this->assertDatabaseCount('inventory_movements', 1);

        $reservationPayload = [
            'product_id' => $this->product->getKey(), 'quantity' => '3.000',
            'warehouse_id' => $this->warehouseA->getKey(), 'location_id' => $this->locationA->getKey(),
        ];
        $reservation = $this->postReservation($reservationPayload, 'd4c757e1-3bad-40a4-a327-62a27f58fb6f')
            ->assertCreated()->json('data');
        $this->postReservation($reservationPayload, 'd4c757e1-3bad-40a4-a327-62a27f58fb6f')
            ->assertOk()->assertJsonPath('data.id', $reservation['id'])->assertJsonPath('already_exists', true);
        self::assertSame(['10.000', '3.000', '7.000'], $this->balanceAt($this->locationA->getKey()));
        $this->assertDatabaseCount('stock_reservations', 1);

        $firstRelease = $this->postJson('/api/v1/stock/reservations/'.$reservation['id'].'/release', [], $this->csrfHeaders())
            ->assertOk()->json();
        $secondRelease = $this->postJson('/api/v1/stock/reservations/'.$reservation['id'].'/release', [], $this->csrfHeaders())
            ->assertOk()->assertJsonPath('already_released', true)->json();
        self::assertSame($firstRelease['data']['released_at'], $secondRelease['data']['released_at']);
        self::assertSame(['10.000', '0.000', '10.000'], $this->balanceAt($this->locationA->getKey()));
        $this->assertDatabaseCount('inventory_movements', 1);
        $this->assertDatabaseHas('stock_reservations', ['id' => $reservation['id'], 'status' => 'released']);
    }

    public function test_transfer_has_two_atomic_legs_and_controlled_failure_rolls_back(): void
    {
        $this->postOperation([
            'operation_type' => 'opening', 'product_id' => $this->product->getKey(), 'quantity' => '10.000',
            'warehouse_id' => $this->warehouseA->getKey(), 'location_id' => $this->locationA->getKey(),
        ])->assertCreated();
        $transferInput = [
            'operation_type' => 'transfer', 'product_id' => $this->product->getKey(), 'quantity' => '4.000',
            'warehouse_id' => $this->warehouseA->getKey(), 'location_id' => $this->locationA->getKey(),
            'destination_warehouse_id' => $this->warehouseB->getKey(), 'destination_location_id' => $this->locationB->getKey(),
        ];
        $transfer = $this->postOperation($transferInput)->assertCreated()->json('data');
        self::assertCount(2, $transfer['legs']);
        self::assertSame($this->locationA->getKey(), $transfer['from_location']['id']);
        self::assertSame($this->locationB->getKey(), $transfer['to_location']['id']);
        self::assertSame(['6.000', '0.000', '6.000'], $this->balanceAt($this->locationA->getKey()));
        self::assertSame(['4.000', '0.000', '4.000'], $this->balanceAt($this->locationB->getKey()));
        $this->assertDatabaseHas('inventory_movements', [
            'operation_id' => $transfer['id'], 'location_id' => $this->locationA->getKey(), 'direction' => 'outbound', 'quantity_milli' => 4000,
        ]);
        $this->assertDatabaseHas('inventory_movements', [
            'operation_id' => $transfer['id'], 'location_id' => $this->locationB->getKey(), 'direction' => 'inbound', 'quantity_milli' => 4000,
        ]);

        $failingService = new class extends StockService
        {
            protected function persistMovement(InventoryOperation $operation, array $attributes): InventoryMovement
            {
                if ($operation->operation_type === 'transfer' && $attributes['direction'] === 'inbound') {
                    throw new \RuntimeException('Controlled inbound leg failure.');
                }

                return parent::persistMovement($operation, $attributes);
            }
        };
        $this->app->instance(StockService::class, $failingService);
        $failedInput = [...$transferInput, 'quantity' => '1.000'];
        $this->postOperation($failedInput)->assertServerError();
        $this->app->forgetInstance(StockService::class);

        self::assertSame(['6.000', '0.000', '6.000'], $this->balanceAt($this->locationA->getKey()));
        self::assertSame(['4.000', '0.000', '4.000'], $this->balanceAt($this->locationB->getKey()));
        $this->assertDatabaseCount('inventory_operations', 2);
        $this->assertDatabaseCount('inventory_movements', 3);
        $this->assertDatabaseMissing('inventory_operations', ['quantity_milli' => 1000, 'operation_type' => 'transfer']);
    }

    public function test_issues_use_available_stock_and_quantities_remain_exact(): void
    {
        $this->postOperation([
            'operation_type' => 'opening', 'product_id' => $this->product->getKey(), 'quantity' => '10.000',
            'warehouse_id' => $this->warehouseA->getKey(), 'location_id' => $this->locationA->getKey(),
        ])->assertCreated();
        $this->postReservation([
            'product_id' => $this->product->getKey(), 'quantity' => '3.000',
            'warehouse_id' => $this->warehouseA->getKey(), 'location_id' => $this->locationA->getKey(),
        ]);

        $issue = [
            'operation_type' => 'issue', 'product_id' => $this->product->getKey(), 'quantity' => '8.000',
            'warehouse_id' => $this->warehouseA->getKey(), 'location_id' => $this->locationA->getKey(),
        ];
        $this->postOperation($issue)->assertUnprocessable()->assertJsonValidationErrors('quantity');
        $this->assertDatabaseCount('inventory_movements', 1);

        $this->postOperation([...$issue, 'quantity' => '2.500'])->assertCreated()->assertJsonPath('data.quantity', '2.500');
        self::assertSame(['7.500', '3.000', '4.500'], $this->balanceAt($this->locationA->getKey()));
        $this->postOperation([...$issue, 'quantity' => '0.0001'])->assertUnprocessable()->assertJsonValidationErrors('quantity');
        $this->postOperation([...$issue, 'quantity' => '1000000000.000'])->assertUnprocessable()->assertJsonValidationErrors('quantity');
        $this->postOperation([...$issue, 'product_id' => $this->productWithoutUnit->getKey(), 'quantity' => '1.000'])
            ->assertUnprocessable()->assertJsonValidationErrors('product_id')
            ->assertJsonFragment(['product_id' => ['برای ثبت موجودی، ابتدا واحد پایهٔ کالا را در اطلاعات کالا تعیین کنید.']]);
        $this->assertDatabaseCount('inventory_movements', 2);
    }

    public function test_scope_roles_csrf_and_warehouse_location_pair_rejections_leave_stock_unchanged(): void
    {
        $this->postOperation([
            'operation_type' => 'opening', 'product_id' => $this->product->getKey(), 'quantity' => '5.000',
            'warehouse_id' => $this->warehouseA->getKey(), 'location_id' => $this->locationA->getKey(),
        ])->assertCreated();
        $beforeOperations = InventoryOperation::query()->count();
        $beforeMovements = InventoryOperation::query()->withCount('movements')->get()->sum('movements_count');

        $this->postOperation([
            'operation_type' => 'receipt', 'product_id' => $this->product->getKey(), 'quantity' => '1.000',
            'warehouse_id' => $this->warehouseB->getKey(), 'location_id' => $this->locationA->getKey(),
        ])->assertUnprocessable()->assertJsonValidationErrors('location_id');
        $this->postOperation([
            'operation_type' => 'receipt', 'product_id' => $this->foreignProduct->getKey(), 'quantity' => '1.000',
            'warehouse_id' => $this->warehouseA->getKey(), 'location_id' => $this->locationA->getKey(),
        ])->assertNotFound();
        $this->postOperation([
            'operation_type' => 'receipt', 'product_id' => $this->product->getKey(), 'quantity' => '1.000',
            'warehouse_id' => $this->foreignWarehouse->getKey(), 'location_id' => $this->locationA->getKey(),
        ])->assertNotFound();
        $this->postOperation([
            'operation_type' => 'receipt', 'product_id' => $this->product->getKey(), 'quantity' => '1.000',
            'warehouse_id' => $this->warehouseA->getKey(), 'location_id' => $this->foreignLocation->getKey(),
        ])->assertNotFound();
        $this->postJson('/api/v1/stock/operations', [
            'organization_id' => $this->foreignOrganization->getKey(), 'operation_type' => 'receipt',
            'product_id' => $this->product->getKey(), 'quantity' => '1.000',
            'warehouse_id' => $this->warehouseA->getKey(), 'location_id' => $this->locationA->getKey(),
        ], $this->csrfHeaders() + ['Idempotency-Key' => Str::uuid()->toString()])->assertUnprocessable()->assertJsonValidationErrors('organization_id');
        $this->postJson('/api/v1/stock/operations', [
            'operation_type' => 'receipt', 'product_id' => $this->product->getKey(), 'quantity' => '1.000',
            'warehouse_id' => $this->warehouseA->getKey(), 'location_id' => $this->locationA->getKey(),
        ], [])->assertStatus(419);

        $this->actingAs($this->reader)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $this->getJson('/api/v1/stock/balances')->assertOk();
        $this->postOperation([
            'operation_type' => 'receipt', 'product_id' => $this->product->getKey(), 'quantity' => '1.000',
            'warehouse_id' => $this->warehouseA->getKey(), 'location_id' => $this->locationA->getKey(),
        ])->assertForbidden();

        self::assertSame($beforeOperations, InventoryOperation::query()->count());
        self::assertSame($beforeMovements, InventoryOperation::query()->withCount('movements')->get()->sum('movements_count'));
        self::assertSame(['5.000', '0.000', '5.000'], $this->balanceAt($this->locationA->getKey()));
        $this->assertDatabaseCount('stock_reservations', 0);
    }

    public function test_opening_rule_and_master_data_keys_are_immutable_after_stock_is_recorded(): void
    {
        $this->postOperation([
            'operation_type' => 'opening', 'product_id' => $this->product->getKey(), 'quantity' => '1.000',
            'warehouse_id' => $this->warehouseA->getKey(), 'location_id' => $this->locationA->getKey(),
        ])->assertCreated();
        $this->postOperation([
            'operation_type' => 'opening', 'product_id' => $this->product->getKey(), 'quantity' => '2.000',
            'warehouse_id' => $this->warehouseA->getKey(), 'location_id' => $this->locationA->getKey(),
        ])->assertUnprocessable()->assertJsonValidationErrors('operation_type');

        $this->patchJson('/api/v1/products/'.$this->product->getKey(), ['base_unit_id' => $this->otherUnit->getKey()], $this->csrfHeaders())
            ->assertUnprocessable()->assertJsonValidationErrors('base_unit_id');
        $this->assertDatabaseHas('products', ['id' => $this->product->getKey(), 'base_unit_id' => $this->unit->getKey()]);

        $this->patchJson('/api/v1/locations/'.$this->locationA->getKey(), [
            'warehouse_id' => $this->warehouseB->getKey(), 'code' => $this->locationA->code, 'name' => $this->locationA->name,
        ], $this->csrfHeaders())->assertUnprocessable()->assertJsonValidationErrors('warehouse_id');
        $this->assertDatabaseHas('locations', ['id' => $this->locationA->getKey(), 'warehouse_id' => $this->warehouseA->getKey()]);
        $this->assertDatabaseCount('inventory_operations', 1);
        $this->assertDatabaseCount('inventory_movements', 1);
    }

    private function postOperation(array $input, ?string $key = null)
    {
        return $this->postJson('/api/v1/stock/operations', $input, $this->csrfHeaders() + [
            'Idempotency-Key' => $key ?? Str::uuid()->toString(),
        ]);
    }

    private function postReservation(array $input, ?string $key = null)
    {
        return $this->postJson('/api/v1/stock/reservations', $input, $this->csrfHeaders() + [
            'Idempotency-Key' => $key ?? Str::uuid()->toString(),
        ]);
    }

    private function balanceAt(int $locationId): array
    {
        $row = $this->getJson('/api/v1/stock/balances')->assertOk()->json('data');
        $balance = collect($row)->first(fn (array $item): bool => $item['location']['id'] === $locationId && $item['product']['id'] === $this->product->getKey());
        self::assertNotNull($balance);

        return [$balance['physical_quantity'], $balance['reserved_quantity'], $balance['available_quantity']];
    }

    private function makeUnit(Organization $organization, string $code): Unit
    {
        return Unit::query()->create([
            'organization_id' => $organization->getKey(), 'code' => $code, 'name' => $code, 'symbol' => $code,
        ]);
    }

    private function makeProduct(Organization $organization, Unit $unit, string $code): Product
    {
        return Product::query()->create([
            'organization_id' => $organization->getKey(), 'code' => $code, 'name' => $code, 'base_unit_id' => $unit->getKey(),
        ]);
    }

    private function makeWarehouse(Organization $organization, string $code): Warehouse
    {
        return Warehouse::query()->create(['organization_id' => $organization->getKey(), 'code' => $code, 'name' => $code]);
    }

    private function makeLocation(Organization $organization, Warehouse $warehouse, string $code): Location
    {
        return Location::query()->create([
            'organization_id' => $organization->getKey(), 'warehouse_id' => $warehouse->getKey(), 'code' => $code, 'name' => $code,
        ]);
    }
}
