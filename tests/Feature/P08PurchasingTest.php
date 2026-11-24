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
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

class P08PurchasingTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private Organization $foreignOrganization;

    private User $editor;

    private User $approver;

    private User $reader;

    private Unit $unit;

    private Unit $alternateUnit;

    private Product $product;

    private Product $secondProduct;

    private Party $supplier;

    private Party $nonSupplier;

    private Party $foreignSupplier;

    private Warehouse $warehouse;

    private Warehouse $secondWarehouse;

    private Warehouse $foreignWarehouse;

    private Location $location;

    private Location $secondLocation;

    private Location $foreignLocation;

    protected function setUp(): void
    {
        parent::setUp();

        $this->organization = Organization::query()->create(['name' => 'سازمان خرید الف', 'slug' => 'p08-purchase-a']);
        $this->foreignOrganization = Organization::query()->create(['name' => 'سازمان خرید ب', 'slug' => 'p08-purchase-b']);
        $this->editor = User::factory()->create();
        $this->approver = User::factory()->create();
        $this->reader = User::factory()->create();
        $this->editor->organizations()->attach($this->organization, ['role' => OrganizationRole::Editor->value]);
        $this->approver->organizations()->attach($this->organization, ['role' => OrganizationRole::Editor->value]);
        $this->reader->organizations()->attach($this->organization, ['role' => OrganizationRole::Reader->value]);
        $this->editor->organizations()->attach($this->foreignOrganization, ['role' => OrganizationRole::Reader->value]);

        $this->unit = $this->makeUnit($this->organization, 'EA');
        $this->alternateUnit = $this->makeUnit($this->organization, 'BOX');
        $this->product = $this->makeProduct($this->organization, $this->unit, 'P08-001', 'کالای خرید یک');
        $this->secondProduct = $this->makeProduct($this->organization, $this->unit, 'P08-002', 'کالای خرید دو');
        $this->supplier = $this->makeParty($this->organization, 'SUP-P08', 'تأمین‌کنندهٔ خرید', 'supplier');
        $this->nonSupplier = $this->makeParty($this->organization, 'CUS-P08', 'طرف بدون نقش تأمین‌کننده', 'customer');
        $this->foreignSupplier = $this->makeParty($this->foreignOrganization, 'SUP-FOREIGN', 'تأمین‌کنندهٔ بیرونی', 'supplier');

        $this->warehouse = $this->makeWarehouse($this->organization, 'P08-WH');
        $this->secondWarehouse = $this->makeWarehouse($this->organization, 'P08-WH-2');
        $this->foreignWarehouse = $this->makeWarehouse($this->foreignOrganization, 'P08-WH-X');
        $this->location = $this->makeLocation($this->organization, $this->warehouse, 'P08-LOC');
        $this->secondLocation = $this->makeLocation($this->organization, $this->secondWarehouse, 'P08-LOC-2');
        $this->foreignLocation = $this->makeLocation($this->foreignOrganization, $this->foreignWarehouse, 'P08-LOC-X');

        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organization->getKey()]);
    }

    public function test_requester_cannot_approve_reader_is_denied_and_another_editor_approves_once(): void
    {
        $this->postJson('/api/v1/purchase-requests', [
            'title' => 'نباید بدون CSRF ساخته شود',
            'lines' => [['product_id' => $this->product->getKey(), 'quantity' => '1.000']],
        ])->assertStatus(419);
        $created = $this->createRequest([
            ['product_id' => $this->product->getKey(), 'quantity' => '5.000'],
            ['product_id' => $this->secondProduct->getKey(), 'quantity' => '2.500'],
        ])->assertCreated()->json('data');

        self::assertSame('draft', $created['status']);
        self::assertSame($this->editor->getKey(), $created['requester']['id']);
        self::assertSame(['5.000', '2.500'], array_column($created['lines'], 'quantity'));
        self::assertNotNull($created['lines'][0]['unit']['symbol']);
        $this->postJson('/api/v1/purchase-requests/'.$created['id'].'/submit', [], $this->csrfHeaders())
            ->assertOk()->assertJsonPath('data.status', 'submitted');
        $submitted = PurchaseRequest::query()->findOrFail($created['id']);
        self::assertSame($this->editor->getKey(), (int) $submitted->submitted_by);
        self::assertNotNull($submitted->submitted_at);

        $this->postJson('/api/v1/purchase-requests/'.$created['id'].'/approve', [], $this->csrfHeaders())
            ->assertForbidden();
        $this->actingAs($this->reader)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $this->postJson('/api/v1/purchase-requests/'.$created['id'].'/approve', [], $this->csrfHeaders())
            ->assertForbidden();
        $this->getJson('/api/v1/purchases/options')->assertOk()
            ->assertJsonPath('can_manage', false)
            ->assertJsonMissing(['id' => $this->foreignSupplier->getKey()]);

        $this->actingAs($this->approver)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $approved = $this->postJson('/api/v1/purchase-requests/'.$created['id'].'/approve', [], $this->csrfHeaders())
            ->assertOk()->assertJsonPath('data.status', 'approved')->json('data');
        self::assertSame($this->approver->getKey(), PurchaseRequest::query()->findOrFail($created['id'])->approved_by);
        self::assertSame($this->approver->name, $approved['approved_by']);
        self::assertNotNull($approved['approved_at']);
        $this->postJson('/api/v1/purchase-requests/'.$created['id'].'/approve', [], $this->csrfHeaders())->assertStatus(409);

        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->foreignOrganization->getKey()]);
        $this->getJson('/api/v1/purchase-requests/'.$created['id'])->assertNotFound();
    }

    public function test_conversion_is_unique_payload_bound_and_keeps_historical_rial_snapshots(): void
    {
        $request = $this->approvedRequest([
            ['product_id' => $this->product->getKey(), 'quantity' => '5.000'],
        ]);
        $lineId = $request['lines'][0]['id'];
        $priceList = PriceList::query()->create([
            'organization_id' => $this->organization->getKey(), 'code' => 'P08-LIST', 'name' => 'فهرست آزمایشی P08',
        ]);
        $entry = PriceListEntry::query()->create([
            'organization_id' => $this->organization->getKey(), 'price_list_id' => $priceList->getKey(),
            'product_id' => $this->product->getKey(), 'amount_rial' => '120000',
        ]);
        $payload = [
            'supplier_party_id' => $this->supplier->getKey(),
            'lines' => [['source_request_line_id' => $lineId, 'unit_price_rial' => '100000']],
        ];

        $first = $this->postJson('/api/v1/purchase-requests/'.$request['id'].'/convert', $payload, $this->csrfHeaders())
            ->assertCreated()->assertJsonPath('data.total_rial', '500000')->json();
        $order = $first['data'];
        self::assertSame('IRR', $order['currency']['code']);
        self::assertSame('0', (string) $order['currency']['scale']);
        self::assertSame('100000', $order['lines'][0]['unit_price_rial']);
        self::assertSame('500000', $order['lines'][0]['line_total_rial']);
        self::assertSame($request['id'], $order['source_request']['id']);
        self::assertSame($this->supplier->display_name, $order['supplier']['name']);

        $retry = $this->postJson('/api/v1/purchase-requests/'.$request['id'].'/convert', $payload, $this->csrfHeaders())
            ->assertOk()->assertJsonPath('already_exists', true)->json();
        self::assertSame($order['id'], $retry['data']['id']);
        self::assertSame(1, PurchaseOrder::query()->where('source_request_id', $request['id'])->count());
        $this->postJson('/api/v1/purchase-requests/'.$request['id'].'/convert', [
            ...$payload, 'lines' => [['source_request_line_id' => $lineId, 'unit_price_rial' => '100001']],
        ], $this->csrfHeaders())->assertStatus(409);

        $this->product->forceFill(['name' => 'نام تغییرکردهٔ کالا'])->save();
        $entry->forceFill(['amount_rial' => '990000'])->save();
        $this->getJson('/api/v1/purchase-orders/'.$order['id'])
            ->assertOk()
            ->assertJsonPath('data.lines.0.product_name', 'کالای خرید یک')
            ->assertJsonPath('data.lines.0.unit_price_rial', '100000')
            ->assertJsonPath('data.lines.0.line_total_rial', '500000')
            ->assertJsonPath('data.total_rial', '500000');

        $otherRequest = $this->approvedRequest([
            ['product_id' => $this->secondProduct->getKey(), 'quantity' => '1.000'],
        ]);
        $this->postJson('/api/v1/purchase-requests/'.$otherRequest['id'].'/convert', [
            'supplier_party_id' => $this->nonSupplier->getKey(),
            'lines' => [['source_request_line_id' => $otherRequest['lines'][0]['id'], 'unit_price_rial' => '1']],
        ], $this->csrfHeaders())->assertUnprocessable()->assertJsonValidationErrors('supplier_party_id');
        $this->postJson('/api/v1/purchase-requests/'.$otherRequest['id'].'/convert', [
            'supplier_party_id' => $this->foreignSupplier->getKey(),
            'lines' => [['source_request_line_id' => $otherRequest['lines'][0]['id'], 'unit_price_rial' => '1']],
        ], $this->csrfHeaders())->assertNotFound();
    }

    public function test_partial_receipts_close_only_after_all_lines_and_replay_without_extra_stock(): void
    {
        $request = $this->approvedRequest([
            ['product_id' => $this->product->getKey(), 'quantity' => '5.000'],
            ['product_id' => $this->secondProduct->getKey(), 'quantity' => '1.000'],
        ]);
        $order = $this->convertApprovedRequest($request, [
            ['source_request_line_id' => $request['lines'][0]['id'], 'unit_price_rial' => '100000'],
            ['source_request_line_id' => $request['lines'][1]['id'], 'unit_price_rial' => '200000'],
        ]);
        $lineOne = $order['lines'][0];
        $lineTwo = $order['lines'][1];
        $this->opening($this->product, '10.000', $this->location);
        $this->reserve($this->product, '4.000', $this->warehouse, $this->location);

        $this->postJson($this->receiptPath($order['id'], $lineOne['id']), [
            'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->location->getKey(), 'quantity' => '6.000',
        ], $this->receiptHeaders('c4843d5a-37a2-4ce8-8c9b-080000000101'))->assertUnprocessable()->assertJsonValidationErrors('quantity');
        $this->postJson($this->receiptPath($order['id'], $lineOne['id']), [
            'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->secondLocation->getKey(), 'quantity' => '1.000',
        ], $this->receiptHeaders('c4843d5a-37a2-4ce8-8c9b-080000000102'))->assertUnprocessable()->assertJsonValidationErrors('location_id');

        $firstKey = 'c4843d5a-37a2-4ce8-8c9b-080000000103';
        $first = $this->receive($order['id'], $lineOne['id'], '3.000', $firstKey)->assertCreated()->json('data');
        self::assertSame('open', $first['status']);
        self::assertSame('2.000', $first['lines'][0]['remaining_quantity']);
        self::assertSame(['13.000', '4.000', '9.000'], $this->balanceTuple($this->product, $this->location));

        $finalLineOneKey = 'c4843d5a-37a2-4ce8-8c9b-080000000104';
        $afterFive = $this->receive($order['id'], $lineOne['id'], '2.000', $finalLineOneKey)->assertCreated()->json('data');
        self::assertSame('open', $afterFive['status'], 'Completing one line must leave the multi-line order open.');
        self::assertSame('0.000', $afterFive['lines'][0]['remaining_quantity']);
        self::assertSame('1.000', $afterFive['lines'][1]['remaining_quantity']);
        self::assertSame(['15.000', '4.000', '11.000'], $this->balanceTuple($this->product, $this->location));
        self::assertCount(2, $afterFive['lines'][0]['receipts']);
        self::assertSame('receipt', $afterFive['lines'][0]['receipts'][1]['operation']['operation_type']);
        self::assertSame('inbound', $afterFive['lines'][0]['receipts'][1]['movement']['direction']);

        $lastKey = 'c4843d5a-37a2-4ce8-8c9b-080000000105';
        $closed = $this->receive($order['id'], $lineTwo['id'], '1.000', $lastKey)->assertCreated()->json('data');
        self::assertSame('closed', $closed['status']);
        self::assertNotNull($closed['closed_at']);
        $lastReceipt = $closed['lines'][1]['receipts'][0];
        $this->receive($order['id'], $lineTwo['id'], '1.000', $lastKey)
            ->assertOk()->assertJsonPath('already_exists', true)
            ->assertJsonPath('data.lines.1.receipts.0.id', $lastReceipt['id'])
            ->assertJsonPath('data.lines.1.receipts.0.operation.id', $lastReceipt['operation']['id'])
            ->assertJsonPath('data.lines.1.receipts.0.movement.id', $lastReceipt['movement']['id']);
        self::assertSame(['15.000', '4.000', '11.000'], $this->balanceTuple($this->product, $this->location));
        $this->receive($order['id'], $lineTwo['id'], '0.999', $lastKey)->assertStatus(409);
        $this->assertDatabaseCount('purchase_receipts', 3);
        $this->assertDatabaseCount('inventory_operations', 4);
        $this->assertDatabaseCount('inventory_movements', 4);
        $this->assertDatabaseHas('purchase_receipts', [
            'id' => $lastReceipt['id'],
            'purchase_order_id' => $order['id'],
            'purchase_order_line_id' => $lineTwo['id'],
            'inventory_operation_id' => $lastReceipt['operation']['id'],
            'inventory_movement_id' => $lastReceipt['movement']['id'],
            'quantity_milli' => 1000,
        ]);
    }

    public function test_reader_foreign_records_unit_mismatch_atomic_failure_and_standalone_p06_receipt(): void
    {
        $request = $this->approvedRequest([
            ['product_id' => $this->product->getKey(), 'quantity' => '2.000'],
        ]);
        $order = $this->convertApprovedRequest($request, [
            ['source_request_line_id' => $request['lines'][0]['id'], 'unit_price_rial' => '5000'],
        ]);
        $line = $order['lines'][0];
        $this->opening($this->product, '10.000', $this->location);

        $this->actingAs($this->reader)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $this->postJson($this->receiptPath($order['id'], $line['id']), [
            'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->location->getKey(), 'quantity' => '1.000',
        ], $this->receiptHeaders('e7347407-d291-43fd-a87d-4f8000000101'))->assertForbidden();
        $this->getJson('/api/v1/purchase-orders/999999')->assertNotFound();
        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $this->getJson('/api/v1/purchase-orders/'.$order['id'])->assertOk();
        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->foreignOrganization->getKey()]);
        $this->getJson('/api/v1/purchase-orders/'.$order['id'])->assertNotFound();
        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organization->getKey()]);

        $foreignWarehouseId = (int) $this->foreignWarehouse->getKey();
        $this->postJson($this->receiptPath($order['id'], $line['id']), [
            'warehouse_id' => $foreignWarehouseId, 'location_id' => $this->foreignLocation->getKey(), 'quantity' => '1.000',
        ], $this->receiptHeaders('e7347407-d291-43fd-a87d-4f8000000102'))->assertNotFound();

        $this->product->forceFill(['base_unit_id' => $this->alternateUnit->getKey()])->save();
        $this->postJson($this->receiptPath($order['id'], $line['id']), [
            'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->location->getKey(), 'quantity' => '1.000',
        ], $this->receiptHeaders('e7347407-d291-43fd-a87d-4f8000000103'))->assertUnprocessable()->assertJsonValidationErrors('product_id');
        self::assertSame('10.000', $this->balance($this->product, $this->location)['physical_quantity']);
        $this->product->forceFill(['base_unit_id' => $this->unit->getKey()])->save();

        PurchaseReceipt::creating(static function (): never {
            throw new RuntimeException('P08 controlled receipt persistence failure.');
        });
        $this->withoutExceptionHandling();
        try {
            $this->postJson($this->receiptPath($order['id'], $line['id']), [
                'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->location->getKey(), 'quantity' => '1.000',
            ], $this->receiptHeaders('e7347407-d291-43fd-a87d-4f8000000104'));
            self::fail('The controlled P08 persistence failure was not raised.');
        } catch (RuntimeException $exception) {
            self::assertSame('P08 controlled receipt persistence failure.', $exception->getMessage());
        }

        self::assertDatabaseCount('purchase_receipts', 0);
        self::assertDatabaseCount('inventory_operations', 1);
        self::assertDatabaseCount('inventory_movements', 1);
        self::assertDatabaseHas('purchase_order_lines', ['id' => $line['id'], 'received_quantity_milli' => 0]);
        self::assertDatabaseHas('purchase_orders', ['id' => $order['id'], 'status' => 'open', 'closed_at' => null]);
        self::assertSame('10.000', $this->balance($this->product, $this->location)['physical_quantity']);

        $this->withExceptionHandling();
        $this->postJson('/api/v1/stock/operations', [
            'operation_type' => 'receipt',
            'product_id' => $this->product->getKey(),
            'quantity' => '0.500',
            'warehouse_id' => $this->warehouse->getKey(),
            'location_id' => $this->location->getKey(),
        ], $this->receiptHeaders('e7347407-d291-43fd-a87d-4f8000000105'))->assertCreated();
        self::assertSame('10.500', $this->balance($this->product, $this->location)['physical_quantity']);
    }

    private function createRequest(array $lines)
    {
        return $this->postJson('/api/v1/purchase-requests', [
            'title' => 'نیاز خرید آزمایشی',
            'lines' => $lines,
        ], $this->csrfHeaders());
    }

    private function approvedRequest(array $lines): array
    {
        $request = $this->createRequest($lines)->assertCreated()->json('data');
        $this->postJson('/api/v1/purchase-requests/'.$request['id'].'/submit', [], $this->csrfHeaders())->assertOk();
        $this->actingAs($this->approver)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $this->postJson('/api/v1/purchase-requests/'.$request['id'].'/approve', [], $this->csrfHeaders())->assertOk();
        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organization->getKey()]);

        return $request;
    }

    private function convertApprovedRequest(array $request, array $lines): array
    {
        return $this->postJson('/api/v1/purchase-requests/'.$request['id'].'/convert', [
            'supplier_party_id' => $this->supplier->getKey(),
            'lines' => $lines,
        ], $this->csrfHeaders())->assertCreated()->json('data');
    }

    private function receive(int $orderId, int $lineId, string $quantity, string $key)
    {
        return $this->postJson($this->receiptPath($orderId, $lineId), [
            'warehouse_id' => $this->warehouse->getKey(),
            'location_id' => $this->location->getKey(),
            'quantity' => $quantity,
        ], $this->receiptHeaders($key));
    }

    private function receiptPath(int $orderId, int $lineId): string
    {
        return '/api/v1/purchase-orders/'.$orderId.'/lines/'.$lineId.'/receipts';
    }

    private function receiptHeaders(string $key): array
    {
        return $this->csrfHeaders() + ['Idempotency-Key' => $key];
    }

    private function opening(Product $product, string $quantity, Location $location): void
    {
        $warehouse = Warehouse::query()->findOrFail($location->warehouse_id);
        $this->postJson('/api/v1/stock/operations', [
            'operation_type' => 'opening', 'product_id' => $product->getKey(), 'quantity' => $quantity,
            'warehouse_id' => $warehouse->getKey(), 'location_id' => $location->getKey(),
        ], $this->receiptHeaders((string) Str::uuid()))->assertCreated();
    }

    private function reserve(Product $product, string $quantity, Warehouse $warehouse, Location $location): void
    {
        $this->postJson('/api/v1/stock/reservations', [
            'product_id' => $product->getKey(), 'quantity' => $quantity,
            'warehouse_id' => $warehouse->getKey(), 'location_id' => $location->getKey(),
        ], $this->receiptHeaders((string) Str::uuid()))->assertCreated();
    }

    private function balance(Product $product, Location $location): array
    {
        $response = $this->getJson('/api/v1/stock/balances')->assertOk();
        $row = collect($response->json('data'))->first(
            fn (array $item): bool => (int) $item['product']['id'] === (int) $product->getKey()
                && (int) $item['location']['id'] === (int) $location->getKey(),
        );
        self::assertNotNull($row);

        return $row;
    }

    private function balanceTuple(Product $product, Location $location): array
    {
        $row = $this->balance($product, $location);

        return [$row['physical_quantity'], $row['reserved_quantity'], $row['available_quantity']];
    }

    private function makeUnit(Organization $organization, string $code): Unit
    {
        return Unit::query()->create([
            'organization_id' => $organization->getKey(), 'code' => $code, 'name' => $code, 'symbol' => $code, 'is_active' => true,
        ]);
    }

    private function makeProduct(Organization $organization, Unit $unit, string $code, string $name): Product
    {
        return Product::query()->create([
            'organization_id' => $organization->getKey(), 'code' => $code, 'name' => $name, 'base_unit_id' => $unit->getKey(),
        ]);
    }

    private function makeParty(Organization $organization, string $code, string $name, string $role): Party
    {
        $party = Party::query()->create([
            'organization_id' => $organization->getKey(), 'code' => $code, 'display_name' => $name,
        ]);
        PartyRole::query()->create([
            'organization_id' => $organization->getKey(), 'party_id' => $party->getKey(), 'role' => $role,
        ]);

        return $party;
    }

    private function makeWarehouse(Organization $organization, string $code): Warehouse
    {
        return Warehouse::query()->create([
            'organization_id' => $organization->getKey(), 'code' => $code, 'name' => $code,
        ]);
    }

    private function makeLocation(Organization $organization, Warehouse $warehouse, string $code): Location
    {
        return Location::query()->create([
            'organization_id' => $organization->getKey(), 'warehouse_id' => $warehouse->getKey(), 'code' => $code, 'name' => $code,
        ]);
    }
}
