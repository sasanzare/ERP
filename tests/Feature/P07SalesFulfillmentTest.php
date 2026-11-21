<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\InventoryMovement;
use App\Models\InventoryOperation;
use App\Models\Lead;
use App\Models\Location;
use App\Models\Organization;
use App\Models\Party;
use App\Models\PartyRole;
use App\Models\PriceList;
use App\Models\Product;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use App\Models\SalesQuote;
use App\Models\SalesQuoteLine;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\Stock\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class P07SalesFulfillmentTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private Organization $foreignOrganization;

    private User $editor;

    private User $reader;

    private Unit $unit;

    private Product $product;

    private Warehouse $warehouse;

    private Location $location;

    private SalesOrder $order;

    private SalesOrderLine $line;

    protected function setUp(): void
    {
        parent::setUp();

        $this->organization = Organization::query()->create(['name' => 'سازمان تحویل الف', 'slug' => 'p07-sales-a']);
        $this->foreignOrganization = Organization::query()->create(['name' => 'سازمان تحویل ب', 'slug' => 'p07-sales-b']);
        $this->editor = User::factory()->create();
        $this->reader = User::factory()->create();
        $this->editor->organizations()->attach($this->organization, ['role' => OrganizationRole::Editor->value]);
        $this->editor->organizations()->attach($this->foreignOrganization, ['role' => OrganizationRole::Reader->value]);
        $this->reader->organizations()->attach($this->organization, ['role' => OrganizationRole::Reader->value]);
        $this->unit = $this->makeUnit($this->organization, 'EA');
        $this->product = $this->makeProduct($this->organization, $this->unit, 'P07-001');
        $this->warehouse = Warehouse::query()->create([
            'organization_id' => $this->organization->getKey(), 'code' => 'P07-WH', 'name' => 'انبار تحویل',
        ]);
        $this->location = Location::query()->create([
            'organization_id' => $this->organization->getKey(), 'warehouse_id' => $this->warehouse->getKey(),
            'code' => 'P07-LOC', 'name' => 'مکان تحویل',
        ]);
        [$this->order, $this->line] = $this->makeOrder($this->organization, $this->product, $this->unit, 'SO-P07-001', '3.000');

        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organization->getKey()]);
    }

    public function test_canonical_reserve_deliver_cancel_history_and_retries_preserve_order_snapshots(): void
    {
        $this->opening('10.000');
        self::assertSame(['10.000', '0.000', '10.000'], $this->balance());
        $this->reserve('3.001', '2e3f6741-ef4e-4d02-8689-a7cb647d0100')
            ->assertUnprocessable()->assertJsonValidationErrors('quantity');

        $reservationKey = '8cc9a1b8-8db6-460d-8a34-41a6dca01d00';
        $reserved = $this->reserve('3.000', $reservationKey)->assertCreated()->json('data');
        self::assertSame(['10.000', '3.000', '7.000'], $this->balance());
        $this->reserve('3.000', $reservationKey)->assertOk()->assertJsonPath('already_exists', true);
        $this->reserve('2.000', $reservationKey)->assertStatus(409);
        $this->postJson($this->deliverPath(), [], [])->assertStatus(419);
        $line = $reserved['lines'][0];
        self::assertSame(['3.000', '3.000', '0.000', '0.000', '3.000'], [
            $line['fulfillment']['ordered_quantity'], $line['fulfillment']['reserved_quantity'],
            $line['fulfillment']['delivered_quantity'], $line['fulfillment']['cancelled_quantity'],
            $line['fulfillment']['pending_quantity'],
        ]);
        $reservationId = $line['fulfillment']['reservations'][0]['id'];

        $headers = $this->csrfHeaders() + ['Idempotency-Key' => '6b6d3bb2-b47f-4efc-9fb5-74d005000101'];
        $deliveryResponse = $this->postJson($this->deliverPath(), [
            'reservation_id' => $reservationId, 'quantity' => '2.000',
        ], $headers)->assertCreated();
        $afterDelivery = $deliveryResponse->json('data');
        self::assertSame(['8.000', '1.000', '7.000'], $this->balance());
        $line = $afterDelivery['lines'][0];
        self::assertSame(['3.000', '1.000', '2.000', '0.000', '1.000'], [
            $line['fulfillment']['ordered_quantity'], $line['fulfillment']['reserved_quantity'],
            $line['fulfillment']['delivered_quantity'], $line['fulfillment']['cancelled_quantity'],
            $line['fulfillment']['pending_quantity'],
        ]);
        self::assertCount(1, $line['fulfillment']['deliveries']);
        $delivery = $line['fulfillment']['deliveries'][0];
        self::assertSame('2.000', $delivery['quantity']);
        self::assertSame($reservationId, $delivery['reservation']['id']);
        self::assertNotNull($delivery['operation']['id']);
        self::assertSame('issue', $delivery['operation']['operation_type']);
        self::assertNotNull($delivery['movement']['id']);
        self::assertSame('outbound', $delivery['movement']['direction']);
        $this->assertDatabaseHas('sales_order_deliveries', [
            'id' => $delivery['id'], 'sales_order_line_id' => $this->line->getKey(),
            'stock_reservation_id' => $reservationId, 'inventory_operation_id' => $delivery['operation']['id'],
            'inventory_movement_id' => $delivery['movement']['id'], 'quantity_milli' => 2000,
        ]);

        $this->postJson($this->deliverPath(), ['reservation_id' => $reservationId, 'quantity' => '2.000'], $headers)
            ->assertOk()->assertJsonPath('already_exists', true)
            ->assertJsonPath('data.lines.0.fulfillment.deliveries.0.id', $delivery['id']);
        $this->assertDatabaseCount('sales_order_deliveries', 1);
        $this->assertDatabaseCount('inventory_operations', 2);
        $this->assertDatabaseCount('inventory_movements', 2);
        $this->postJson($this->deliverPath(), ['reservation_id' => $reservationId, 'quantity' => '1.999'], $headers)
            ->assertStatus(409);

        $this->postJson('/api/v1/stock/reservations/'.$reservationId.'/release', [], $this->csrfHeaders())
            ->assertStatus(409);
        $this->assertDatabaseHas('stock_reservations', ['id' => $reservationId, 'consumed_quantity_milli' => 2000, 'released_quantity_milli' => 0]);

        $cancelPath = $this->cancelPath();
        $cancelled = $this->postJson($cancelPath, [], $this->csrfHeaders())->assertOk()->json('data');
        self::assertSame(['8.000', '0.000', '8.000'], $this->balance());
        $line = $cancelled['lines'][0];
        self::assertSame(['3.000', '0.000', '2.000', '1.000', '0.000'], [
            $line['fulfillment']['ordered_quantity'], $line['fulfillment']['reserved_quantity'],
            $line['fulfillment']['delivered_quantity'], $line['fulfillment']['cancelled_quantity'],
            $line['fulfillment']['pending_quantity'],
        ]);
        self::assertSame(1, $line['fulfillment']['reservations'][0]['status'] === 'released' ? 1 : 0);
        self::assertSame('1.000', $line['fulfillment']['reservations'][0]['released_quantity']);
        self::assertSame(1, count($line['fulfillment']['deliveries']));
        self::assertSame($this->order->total_toman, $cancelled['total_toman']);
        self::assertSame('300000', $line['line_net_toman']);
        $cancelledAt = $line['fulfillment']['cancelled_at'];

        $this->postJson($cancelPath, [], $this->csrfHeaders())->assertOk()->assertJsonPath('already_cancelled', true)
            ->assertJsonPath('data.lines.0.fulfillment.cancelled_at', $cancelledAt);
        $this->assertDatabaseCount('inventory_operations', 2);
        $this->assertDatabaseCount('inventory_movements', 2);
        $this->assertDatabaseHas('sales_order_lines', ['id' => $this->line->getKey(), 'cancelled_quantity_milli' => 1000]);
        $this->assertDatabaseHas('stock_reservations', [
            'id' => $reservationId, 'quantity_milli' => 3000, 'consumed_quantity_milli' => 2000,
            'released_quantity_milli' => 1000, 'status' => 'released',
        ]);
        $this->assertDatabaseHas('sales_order_lines', [
            'id' => $this->line->getKey(), 'unit_price_toman_tenths' => 1000000, 'line_net_toman' => 300000,
        ]);
        $this->actingAs($this->reader)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $this->getJson('/api/v1/sales-orders/'.$this->order->getKey())->assertOk()
            ->assertJsonPath('data.lines.0.fulfillment.deliveries.0.movement.direction', 'outbound');
    }

    public function test_reserved_delivery_works_with_zero_unreserved_availability_and_rejects_overdelivery(): void
    {
        $this->opening('3.000');
        $reserve = $this->reserve('3.000', 'b1c64587-45b1-4962-93a1-221d5401d002')->assertCreated()->json('data');
        $reservationId = $reserve['lines'][0]['fulfillment']['reservations'][0]['id'];
        self::assertSame(['3.000', '3.000', '0.000'], $this->balance());

        $headers = $this->csrfHeaders() + ['Idempotency-Key' => '7d2d6c2e-5cc9-46bd-b97d-1aa3a46d0102'];
        $this->postJson($this->deliverPath(), ['reservation_id' => $reservationId, 'quantity' => '2.000'], $headers)->assertCreated();
        self::assertSame(['1.000', '1.000', '0.000'], $this->balance());
        $this->postJson($this->deliverPath(), [
            'reservation_id' => $reservationId, 'quantity' => '1.001',
        ], $this->csrfHeaders() + ['Idempotency-Key' => '35a08639-8bb6-4677-9e8b-7ca68ba50103'])
            ->assertUnprocessable()->assertJsonValidationErrors('quantity');

        $this->postJson($this->deliverPath(), [
            'reservation_id' => $reservationId, 'quantity' => '1.000',
        ], $this->csrfHeaders() + ['Idempotency-Key' => 'c27671a9-e7ed-485a-83d8-e82dfe2d0104'])->assertCreated();
        self::assertSame(['0.000', '0.000', '0.000'], $this->balance());
        $this->assertDatabaseHas('stock_reservations', ['id' => $reservationId, 'status' => 'consumed', 'quantity_milli' => 3000]);
        $this->postJson($this->deliverPath(), [
            'reservation_id' => $reservationId, 'quantity' => '0.001',
        ], $this->csrfHeaders() + ['Idempotency-Key' => 'd277720a-26d7-4cc9-9913-5eef4da50105'])
            ->assertUnprocessable()->assertJsonValidationErrors('quantity');
        $this->assertDatabaseCount('sales_order_deliveries', 2);
    }

    public function test_atomic_failure_unrelated_reservations_and_foreign_orders_are_rejected(): void
    {
        $this->opening('10.000');
        $reserved = $this->reserve('3.000', 'f2fa0cfb-4239-4a8f-9398-293fb4fa0106')->assertCreated()->json('data');
        $linkedReservationId = $reserved['lines'][0]['fulfillment']['reservations'][0]['id'];
        $unrelated = $this->postJson('/api/v1/stock/reservations', [
            'product_id' => $this->product->getKey(), 'quantity' => '1.000',
            'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->location->getKey(),
        ], $this->csrfHeaders() + ['Idempotency-Key' => '41e03d3e-48e0-4996-9e59-a8bbdc1d0107'])->assertCreated()->json('data');

        $this->postJson($this->deliverPath(), ['reservation_id' => $unrelated['id'], 'quantity' => '1.000'],
            $this->csrfHeaders() + ['Idempotency-Key' => '5ea70f4e-a1c1-4bd9-9eaf-b9c3ceab0108'])->assertNotFound();

        $failingService = new class extends StockService
        {
            protected function persistMovement(InventoryOperation $operation, array $attributes): InventoryMovement
            {
                if ($operation->operation_type === 'issue' && $attributes['direction'] === 'outbound') {
                    throw new \RuntimeException('Controlled P07 delivery failure.');
                }

                return parent::persistMovement($operation, $attributes);
            }
        };
        $this->app->instance(StockService::class, $failingService);
        $this->postJson($this->deliverPath(), ['reservation_id' => $linkedReservationId, 'quantity' => '2.000'],
            $this->csrfHeaders() + ['Idempotency-Key' => '2647ab25-1d35-451e-a369-dd8d81050109'])->assertServerError();
        $this->app->forgetInstance(StockService::class);

        self::assertSame(['10.000', '4.000', '6.000'], $this->balance());
        $this->assertDatabaseCount('inventory_operations', 1);
        $this->assertDatabaseCount('inventory_movements', 1);
        $this->assertDatabaseCount('sales_order_deliveries', 0);
        $this->assertDatabaseHas('stock_reservations', [
            'id' => $linkedReservationId, 'consumed_quantity_milli' => 0, 'released_quantity_milli' => 0,
        ]);

        $foreignUnit = $this->makeUnit($this->foreignOrganization, 'EA');
        $foreignProduct = $this->makeProduct($this->foreignOrganization, $foreignUnit, 'P07-FOREIGN');
        [$foreignOrder, $foreignLine] = $this->makeOrder(
            $this->foreignOrganization, $foreignProduct, $foreignUnit, 'SO-P07-FOREIGN', '3.000',
        );
        // The foreign order and its lines are hidden before secondary request fields are validated.
        $this->postJson('/api/v1/sales-orders/'.$foreignOrder->getKey().'/lines/'.$foreignLine->getKey().'/reservations', [], $this->csrfHeaders())
            ->assertNotFound();
    }

    public function test_reader_cannot_write_and_foreign_line_ids_are_hidden(): void
    {
        $foreignUnit = $this->makeUnit($this->foreignOrganization, 'EA');
        $foreignProduct = $this->makeProduct($this->foreignOrganization, $foreignUnit, 'P07-HIDDEN');
        [$foreignOrder, $foreignLine] = $this->makeOrder($this->foreignOrganization, $foreignProduct, $foreignUnit, 'SO-P07-HIDDEN', '3.000');

        $this->postJson('/api/v1/sales-orders/'.$this->order->getKey().'/lines/'.$foreignLine->getKey().'/cancel-remainder', [], $this->csrfHeaders())
            ->assertNotFound();
        $this->actingAs($this->reader)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $this->postJson('/api/v1/sales-orders/'.$this->order->getKey().'/lines/'.$this->line->getKey().'/cancel-remainder', [], $this->csrfHeaders())
            ->assertForbidden();
        $this->assertDatabaseHas('sales_orders', ['id' => $foreignOrder->getKey(), 'code' => 'SO-P07-HIDDEN']);
    }

    public function test_current_product_unit_must_match_the_order_line_snapshot(): void
    {
        $replacementUnit = $this->makeUnit($this->organization, 'BOX');
        $this->product->forceFill(['base_unit_id' => $replacementUnit->getKey()])->save();

        $this->reserve('1.000', 'db6e0441-8c88-4692-a2f1-56d0ba040110')
            ->assertUnprocessable()->assertJsonValidationErrors('product_id')
            ->assertJsonFragment(['product_id' => ['واحد پایهٔ فعلی کالا با واحد ثبت‌شده در سطر سفارش سازگار نیست.']]);
        $this->assertDatabaseCount('stock_reservations', 0);
        $this->assertDatabaseCount('stock_locks', 0);
    }

    private function opening(string $quantity): void
    {
        $this->postJson('/api/v1/stock/operations', [
            'operation_type' => 'opening', 'product_id' => $this->product->getKey(), 'quantity' => $quantity,
            'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->location->getKey(),
        ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertCreated();
    }

    private function reserve(string $quantity, string $key)
    {
        return $this->postJson('/api/v1/sales-orders/'.$this->order->getKey().'/lines/'.$this->line->getKey().'/reservations', [
            'quantity' => $quantity, 'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->location->getKey(),
        ], $this->csrfHeaders() + ['Idempotency-Key' => $key]);
    }

    private function deliverPath(): string
    {
        return '/api/v1/sales-orders/'.$this->order->getKey().'/lines/'.$this->line->getKey().'/deliveries';
    }

    private function cancelPath(): string
    {
        return '/api/v1/sales-orders/'.$this->order->getKey().'/lines/'.$this->line->getKey().'/cancel-remainder';
    }

    private function balance(): array
    {
        $row = $this->getJson('/api/v1/stock/balances')->assertOk()->json('data');
        $balance = collect($row)->first(fn (array $item): bool => $item['location']['id'] === $this->location->getKey()
            && $item['product']['id'] === $this->product->getKey());
        self::assertNotNull($balance);

        return [$balance['physical_quantity'], $balance['reserved_quantity'], $balance['available_quantity']];
    }

    /** @return array{SalesOrder, SalesOrderLine} */
    private function makeOrder(Organization $organization, Product $product, Unit $unit, string $code, string $quantity): array
    {
        $customer = Party::query()->create([
            'organization_id' => $organization->getKey(), 'code' => $code.'-C', 'display_name' => 'مشتری '.$code,
        ]);
        PartyRole::query()->create(['organization_id' => $organization->getKey(), 'party_id' => $customer->getKey(), 'role' => 'customer']);
        $lead = Lead::query()->create([
            'organization_id' => $organization->getKey(), 'party_id' => $customer->getKey(), 'code' => $code.'-L', 'title' => 'سرنخ '.$code,
        ]);
        $priceList = PriceList::query()->create([
            'organization_id' => $organization->getKey(), 'code' => $code.'-P', 'name' => 'فهرست '.$code,
        ]);
        $quote = SalesQuote::query()->create([
            'organization_id' => $organization->getKey(), 'lead_id' => $lead->getKey(),
            'customer_party_id' => $customer->getKey(), 'price_list_id' => $priceList->getKey(),
            'code' => $code.'-Q', 'status' => 'confirmed', 'lead_code_snapshot' => $lead->code,
            'lead_title_snapshot' => $lead->title, 'customer_code_snapshot' => $customer->code,
            'customer_name_snapshot' => $customer->display_name, 'price_list_code_snapshot' => $priceList->code,
            'price_list_name_snapshot' => $priceList->name, 'total_toman' => '300000', 'confirmed_at' => now(),
        ]);
        $sourceLine = SalesQuoteLine::query()->create([
            'organization_id' => $organization->getKey(), 'quote_id' => $quote->getKey(),
            'product_id' => $product->getKey(), 'unit_id' => $unit->getKey(),
            'product_code_snapshot' => $product->code, 'product_name_snapshot' => $product->name,
            'unit_code_snapshot' => $unit->code, 'unit_name_snapshot' => $unit->name, 'unit_symbol_snapshot' => $unit->symbol,
            'quantity' => $quantity, 'unit_price_toman_tenths' => '1000000', 'discount_basis_points' => 0,
            'line_net_toman' => '300000',
        ]);
        $order = SalesOrder::query()->create([
            'organization_id' => $organization->getKey(), 'source_quote_id' => $quote->getKey(),
            'lead_id' => $lead->getKey(), 'customer_party_id' => $customer->getKey(),
            'code' => $code, 'status' => 'confirmed', 'lead_code_snapshot' => $lead->code,
            'lead_title_snapshot' => $lead->title, 'customer_code_snapshot' => $customer->code,
            'customer_name_snapshot' => $customer->display_name, 'price_list_code_snapshot' => $priceList->code,
            'price_list_name_snapshot' => $priceList->name, 'total_toman' => '300000', 'confirmed_at' => now(),
        ]);
        $line = SalesOrderLine::query()->create([
            'organization_id' => $organization->getKey(), 'sales_order_id' => $order->getKey(),
            'source_quote_line_id' => $sourceLine->getKey(), 'product_id' => $product->getKey(), 'unit_id' => $unit->getKey(),
            'product_code_snapshot' => $product->code, 'product_name_snapshot' => $product->name,
            'unit_code_snapshot' => $unit->code, 'unit_name_snapshot' => $unit->name, 'unit_symbol_snapshot' => $unit->symbol,
            'quantity' => $quantity, 'unit_price_toman_tenths' => '1000000', 'discount_basis_points' => 0,
            'line_net_toman' => '300000',
        ]);

        return [$order, $line];
    }

    private function makeUnit(Organization $organization, string $code): Unit
    {
        return Unit::query()->create([
            'organization_id' => $organization->getKey(), 'code' => $code, 'name' => 'عدد', 'symbol' => 'عدد',
        ]);
    }

    private function makeProduct(Organization $organization, Unit $unit, string $code): Product
    {
        return Product::query()->create([
            'organization_id' => $organization->getKey(), 'base_unit_id' => $unit->getKey(), 'code' => $code, 'name' => 'کالای '.$code,
        ]);
    }
}
