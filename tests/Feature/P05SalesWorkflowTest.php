<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\Party;
use App\Models\PartyRole;
use App\Models\PriceList;
use App\Models\PriceListEntry;
use App\Models\Product;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use App\Models\SalesQuote;
use App\Models\SalesQuoteLine;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class P05SalesWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organizationA;

    private Organization $organizationB;

    private User $editor;

    private User $reader;

    private Party $customer;

    private Party $supplierOnly;

    private Party $foreignCustomer;

    private Unit $unitA;

    private PriceList $priceList;

    private Product $product120;

    private Product $product135;

    private Product $productWithoutUnit;

    private Product $productWithoutPrice;

    private Product $productZeroPrice;

    private Product $foreignProduct;

    private PriceList $foreignPriceList;

    protected function setUp(): void
    {
        parent::setUp();

        $this->organizationA = Organization::query()->create(['name' => 'سازمان فروش الف', 'slug' => 'p05-sales-a']);
        $this->organizationB = Organization::query()->create(['name' => 'سازمان فروش ب', 'slug' => 'p05-sales-b']);
        $this->editor = User::factory()->create();
        $this->reader = User::factory()->create();
        $this->editor->organizations()->attach($this->organizationA, ['role' => OrganizationRole::Editor->value]);
        $this->editor->organizations()->attach($this->organizationB, ['role' => OrganizationRole::Reader->value]);
        $this->reader->organizations()->attach($this->organizationA, ['role' => OrganizationRole::Reader->value]);

        $this->unitA = Unit::query()->create([
            'organization_id' => $this->organizationA->getKey(), 'code' => 'EA', 'name' => 'عدد', 'symbol' => 'عدد',
        ]);
        $unitB = Unit::query()->create([
            'organization_id' => $this->organizationB->getKey(), 'code' => 'EA', 'name' => 'عدد ب', 'symbol' => 'EA',
        ]);
        $this->customer = $this->party($this->organizationA, 'CUSTOMER-A', 'مشتری الف', ['customer']);
        $this->supplierOnly = $this->party($this->organizationA, 'SUPPLIER-A', 'تأمین‌کننده الف', ['supplier']);
        $this->foreignCustomer = $this->party($this->organizationB, 'CUSTOMER-B', 'مشتری سازمان دیگر', ['customer']);
        $this->priceList = PriceList::query()->create([
            'organization_id' => $this->organizationA->getKey(), 'code' => 'SALES-A', 'name' => 'فهرست فروش الف',
        ]);
        $this->foreignPriceList = PriceList::query()->create([
            'organization_id' => $this->organizationB->getKey(), 'code' => 'SALES-B', 'name' => 'فهرست پنهان ب',
        ]);
        $this->product120 = $this->product($this->organizationA, $this->unitA, 'SALE-120', 'کالای ۱۲۰');
        $this->product135 = $this->product($this->organizationA, $this->unitA, 'SALE-135', 'کالای ۱۳۵');
        $this->productWithoutUnit = Product::query()->create([
            'organization_id' => $this->organizationA->getKey(), 'code' => 'SALE-NOUNIT', 'name' => 'کالای بی‌واحد',
        ]);
        $this->productWithoutPrice = $this->product($this->organizationA, $this->unitA, 'SALE-NOPRICE', 'کالای بی‌قیمت');
        $this->productZeroPrice = $this->product($this->organizationA, $this->unitA, 'SALE-ZERO', 'کالای رایگان');
        $this->foreignProduct = $this->product($this->organizationB, $unitB, 'SALE-FOREIGN', 'کالای پنهان ب');
        foreach ([[$this->product120, '1200000'], [$this->product135, '1350000'], [$this->productWithoutUnit, '700']] as [$product, $amount]) {
            PriceListEntry::query()->create([
                'organization_id' => $this->organizationA->getKey(), 'price_list_id' => $this->priceList->getKey(),
                'product_id' => $product->getKey(), 'amount_rial' => $amount,
            ]);
        }
        PriceListEntry::query()->create([
            'organization_id' => $this->organizationA->getKey(), 'price_list_id' => $this->priceList->getKey(),
            'product_id' => $this->productZeroPrice->getKey(), 'amount_rial' => '0',
        ]);

        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organizationA->getKey()]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_lead_follow_up_cutoff_and_completion_retry_use_the_application_clock(): void
    {
        $cutoff = Carbon::parse('2026-11-21T08:30:00Z');
        Carbon::setTestNow($cutoff);
        $lead = $this->createLead();
        $overdue = $this->postJson('/api/v1/leads/'.$lead['id'].'/activities', [
            'title' => 'تماس پیگیری', 'due_at' => '2026-11-21T08:29:59Z',
        ], $this->csrfHeaders())->assertCreated()->json('data');
        $atCutoff = $this->postJson('/api/v1/leads/'.$lead['id'].'/activities', [
            'title' => 'درست روی مرز', 'due_at' => '2026-11-21T08:30:00Z',
        ], $this->csrfHeaders())->assertCreated()->json('data');

        $this->getJson('/api/v1/lead-activities/overdue')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $overdue['id']);

        $completed = $this->postJson('/api/v1/lead-activities/'.$overdue['id'].'/complete', [], $this->csrfHeaders())
            ->assertOk()->json('data');
        self::assertTrue(Carbon::parse($completed['completed_at'])->equalTo($cutoff));

        Carbon::setTestNow('2026-11-21T08:35:00Z');
        $retried = $this->postJson('/api/v1/lead-activities/'.$overdue['id'].'/complete', [], $this->csrfHeaders())
            ->assertOk()->json('data');
        self::assertSame($completed['completed_at'], $retried['completed_at']);
        $queue = $this->getJson('/api/v1/lead-activities/overdue')->assertOk()->json('data');
        self::assertSame([$atCutoff['id']], array_column($queue, 'id'));
        $this->assertDatabaseHas('lead_activities', ['id' => $overdue['id'], 'completed_at' => '2026-11-21 08:30:00']);
    }

    public function test_quote_confirmation_conversion_and_master_data_edits_preserve_exact_snapshots(): void
    {
        $lead = $this->createLead();
        $quote = $this->createQuote($lead['id']);
        $first = $this->addLine($quote['id'], $this->product120, '1.250', '10.00')->assertCreated()->json('data');
        $second = $this->addLine($quote['id'], $this->product135, '0.333', '2.50')->assertCreated()->json('data');

        self::assertSame('135000', $first['line_net_toman']);
        self::assertSame('43831', $second['line_net_toman']);
        $quoteDetails = $this->getJson('/api/v1/quotes/'.$quote['id'])->assertOk()->json('data');
        self::assertSame('178831', $quoteDetails['total_toman']);

        $this->postJson('/api/v1/quotes/'.$quote['id'].'/confirm', [], $this->csrfHeaders())
            ->assertOk()->assertJsonPath('data.status', 'confirmed')->assertJsonPath('data.total_toman', '178831');

        $this->postJson('/api/v1/price-lists/'.$this->priceList->getKey().'/entries', [
            'product_id' => $this->product120->getKey(), 'amount_rial' => '9999990',
        ], $this->csrfHeaders())->assertCreated();
        $this->patchJson('/api/v1/products/'.$this->product120->getKey(), ['name' => 'نام تازهٔ کالا'], $this->csrfHeaders())->assertOk();
        $this->patchJson('/api/v1/units/'.$this->unitA->getKey(), [
            'code' => 'EA', 'name' => 'واحد تازه', 'symbol' => 'جدید',
        ], $this->csrfHeaders())->assertOk();
        $this->patchJson('/api/v1/parties/'.$this->customer->getKey(), [
            'code' => 'CUSTOMER-A', 'display_name' => 'نام تازهٔ مشتری', 'roles' => ['customer'],
        ], $this->csrfHeaders())->assertOk();
        $this->patchJson('/api/v1/price-lists/'.$this->priceList->getKey(), [
            'code' => 'SALES-A', 'name' => 'فهرست تازه',
        ], $this->csrfHeaders())->assertOk();

        $converted = $this->postJson('/api/v1/quotes/'.$quote['id'].'/convert', [], $this->csrfHeaders())
            ->assertCreated()->assertJsonPath('data.total_toman', '178831')->json('data');
        $retry = $this->postJson('/api/v1/quotes/'.$quote['id'].'/convert', [], $this->csrfHeaders())
            ->assertOk()->assertJsonPath('already_exists', true)->json('data');
        self::assertSame($converted['id'], $retry['id']);
        self::assertSame($quote['id'], $converted['source_quote']['id']);
        self::assertSame($lead['id'], $converted['lead']['id']);
        self::assertSame($this->customer->getKey(), $converted['customer']['id']);
        self::assertSame('CUSTOMER-A', $converted['customer']['code']);
        self::assertSame('مشتری الف', $converted['customer']['name']);
        self::assertSame('فهرست فروش الف', $converted['price_list']['name']);
        self::assertSame('SALE-120', $converted['lines'][0]['product_code']);
        self::assertSame('کالای ۱۲۰', $converted['lines'][0]['product_name']);
        self::assertSame('عدد', $converted['lines'][0]['unit']['name']);
        self::assertSame('120000.0', $converted['lines'][0]['unit_price_toman']);
        self::assertSame('135000', $converted['lines'][0]['line_net_toman']);
        self::assertSame('43831', $converted['lines'][1]['line_net_toman']);
        self::assertSame($first['id'], $converted['lines'][0]['source_quote_line_id']);
        self::assertSame($second['id'], $converted['lines'][1]['source_quote_line_id']);

        $this->getJson('/api/v1/quotes/'.$quote['id'])->assertOk()
            ->assertJsonPath('data.lines.0.unit_price_toman', '120000.0')
            ->assertJsonPath('data.lines.0.product_name', 'کالای ۱۲۰')
            ->assertJsonPath('data.price_list.name', 'فهرست فروش الف')
            ->assertJsonPath('data.order.id', $converted['id']);
        $this->getJson('/api/v1/sales-orders/'.$converted['id'])->assertOk()
            ->assertJsonPath('data.lines.0.unit_price_toman', '120000.0')
            ->assertJsonPath('data.total_toman', '178831');
        $this->assertDatabaseCount('sales_orders', 1);
        $this->assertDatabaseCount('sales_order_lines', 2);
        $this->assertDatabaseHas('sales_orders', ['source_quote_id' => $quote['id'], 'id' => $converted['id']]);
    }

    public function test_draft_quantity_edits_keep_the_saved_price_until_explicit_repricing(): void
    {
        $lead = $this->createLead();
        $quote = $this->createQuote($lead['id']);
        $line = $this->addLine($quote['id'], $this->product120, '1.000', '0.00')->assertCreated()->json('data');
        $this->postJson('/api/v1/price-lists/'.$this->priceList->getKey().'/entries', [
            'product_id' => $this->product120->getKey(), 'amount_rial' => '2000000',
        ], $this->csrfHeaders())->assertCreated();

        $edited = $this->patchJson('/api/v1/quotes/'.$quote['id'].'/lines/'.$line['id'], [
            'quantity' => '2.000', 'discount' => '0.00',
        ], $this->csrfHeaders())->assertOk()->json('data');
        self::assertSame('120000.0', $edited['unit_price_toman']);
        self::assertSame('240000', $edited['line_net_toman']);

        $repriced = $this->postJson('/api/v1/quotes/'.$quote['id'].'/lines/'.$line['id'].'/reprice', [], $this->csrfHeaders())
            ->assertOk()->json('data');
        self::assertSame('200000.0', $repriced['unit_price_toman']);
        self::assertSame('400000', $repriced['line_net_toman']);
    }

    public function test_zero_missing_and_foreign_references_are_distinguished_and_reader_writes_are_denied(): void
    {
        $lead = $this->createLead();
        $quote = $this->createQuote($lead['id']);
        $zero = $this->addLine($quote['id'], $this->productZeroPrice, '1.000', '0.00')->assertCreated()->json('data');
        self::assertSame('0.0', $zero['unit_price_toman']);
        self::assertSame('0', $zero['line_net_toman']);

        $this->addLine($quote['id'], $this->productWithoutPrice, '1.000', '0.00')->assertUnprocessable()
            ->assertJsonValidationErrors('product_id')->assertDontSee('کالای بی‌قیمت');
        $this->addLine($quote['id'], $this->productWithoutUnit, '1.000', '0.00')->assertUnprocessable()
            ->assertJsonValidationErrors('product_id')->assertDontSee('کالای بی‌واحد');
        $this->addLine($quote['id'], $this->product120, '1.2345', '0.00')->assertUnprocessable()->assertJsonValidationErrors('quantity');
        $this->addLine($quote['id'], $this->foreignProduct, '1.000', '0.00')->assertUnprocessable()
            ->assertJsonValidationErrors('product_id')->assertDontSee('کالای پنهان ب');

        $this->postJson('/api/v1/leads', ['title' => 'سرنخ با مشتری غیرمجاز', 'party_id' => $this->supplierOnly->getKey()], $this->csrfHeaders())
            ->assertUnprocessable()->assertJsonValidationErrors('party_id');
        $this->postJson('/api/v1/leads', ['title' => 'سرنخ سازمان دیگر', 'party_id' => $this->foreignCustomer->getKey()], $this->csrfHeaders())
            ->assertUnprocessable()->assertJsonValidationErrors('party_id')->assertDontSee('مشتری سازمان دیگر');
        $this->postJson('/api/v1/leads/'.$lead['id'].'/quotes', ['price_list_id' => $this->foreignPriceList->getKey()], $this->csrfHeaders())
            ->assertUnprocessable()->assertJsonValidationErrors('price_list_id')->assertDontSee('فهرست پنهان ب');
        $leadWithoutCustomerRole = $this->createLead();
        PartyRole::query()->where('organization_id', $this->organizationA->getKey())
            ->where('party_id', $this->customer->getKey())->where('role', 'customer')->delete();
        $this->postJson('/api/v1/leads/'.$leadWithoutCustomerRole['id'].'/quotes', [
            'price_list_id' => $this->priceList->getKey(),
        ], $this->csrfHeaders())->assertUnprocessable()->assertJsonValidationErrors('party_id');

        $foreignLead = Lead::query()->create([
            'organization_id' => $this->organizationB->getKey(), 'party_id' => $this->foreignCustomer->getKey(), 'code' => 'LD-FOREIGN', 'title' => 'سرنخ پنهان',
        ]);
        $this->getJson('/api/v1/leads/'.$foreignLead->getKey())->assertNotFound()->assertDontSee('سرنخ پنهان');
        $this->getJson('/api/v1/price-lists/'.$this->foreignPriceList->getKey())->assertNotFound()->assertDontSee('فهرست پنهان ب');
        $this->getJson('/api/v1/products/'.$this->foreignProduct->getKey())->assertNotFound()->assertDontSee('کالای پنهان ب');
        $options = $this->getJson('/api/v1/sales/options')->assertOk()->json('data');
        self::assertNotContains($this->foreignCustomer->getKey(), array_column($options['customers'], 'id'));
        self::assertNotContains($this->foreignProduct->getKey(), array_column($options['products'], 'id'));
        $this->getJson('/api/v1/price-lists/'.$this->foreignPriceList->getKey().'/products/'.$this->foreignProduct->getKey())
            ->assertNotFound()->assertDontSee('کالای پنهان ب')->assertDontSee('فهرست پنهان ب');

        $foreignQuote = SalesQuote::query()->create([
            'organization_id' => $this->organizationB->getKey(), 'lead_id' => $foreignLead->getKey(),
            'customer_party_id' => $this->foreignCustomer->getKey(), 'price_list_id' => $this->foreignPriceList->getKey(),
            'code' => 'QT-FOREIGN', 'status' => 'draft', 'lead_code_snapshot' => $foreignLead->code,
            'lead_title_snapshot' => $foreignLead->title, 'customer_code_snapshot' => $this->foreignCustomer->code,
            'customer_name_snapshot' => $this->foreignCustomer->display_name, 'price_list_code_snapshot' => $this->foreignPriceList->code,
            'price_list_name_snapshot' => $this->foreignPriceList->name, 'total_toman' => '0',
        ]);
        $foreignOrder = SalesOrder::query()->create([
            'organization_id' => $this->organizationB->getKey(), 'source_quote_id' => $foreignQuote->getKey(),
            'lead_id' => $foreignLead->getKey(), 'customer_party_id' => $this->foreignCustomer->getKey(),
            'code' => 'SO-FOREIGN', 'status' => 'confirmed', 'lead_code_snapshot' => $foreignLead->code,
            'lead_title_snapshot' => $foreignLead->title, 'customer_code_snapshot' => $this->foreignCustomer->code,
            'customer_name_snapshot' => $this->foreignCustomer->display_name, 'price_list_code_snapshot' => $this->foreignPriceList->code,
            'price_list_name_snapshot' => $this->foreignPriceList->name, 'total_toman' => '0', 'confirmed_at' => now(),
        ]);
        $this->getJson('/api/v1/quotes/'.$foreignQuote->getKey())->assertNotFound()->assertDontSee('QT-FOREIGN');
        $this->postJson('/api/v1/quotes/'.$foreignQuote->getKey().'/confirm', [], $this->csrfHeaders())->assertNotFound();
        $this->getJson('/api/v1/sales-orders/'.$foreignOrder->getKey())->assertNotFound()->assertDontSee('SO-FOREIGN');

        $this->actingAs($this->reader)->withSession(['active_organization_id' => $this->organizationA->getKey()]);
        $this->getJson('/api/v1/leads')->assertOk();
        $this->postJson('/api/v1/leads', ['title' => 'نوشتن خواننده', 'party_id' => $this->customer->getKey()], $this->csrfHeaders())
            ->assertForbidden();
        $this->postJson('/api/v1/leads/'.$lead['id'].'/activities', [
            'title' => 'نوشتن خواننده', 'due_at' => '2026-11-22T08:30:00Z',
        ], $this->csrfHeaders())->assertForbidden();
        $this->postJson('/api/v1/quotes/'.$quote['id'].'/confirm', [], $this->csrfHeaders())->assertForbidden();
    }

    public function test_invalid_transitions_and_failed_conversion_leave_no_partial_order(): void
    {
        $lead = $this->createLead();
        $emptyQuote = $this->createQuote($lead['id']);
        $this->postJson('/api/v1/quotes/'.$emptyQuote['id'].'/confirm', [], $this->csrfHeaders())
            ->assertUnprocessable()->assertJsonValidationErrors('lines');
        $this->assertDatabaseHas('sales_quotes', ['id' => $emptyQuote['id'], 'status' => 'draft']);
        $this->postJson('/api/v1/quotes/'.$emptyQuote['id'].'/convert', [], $this->csrfHeaders())->assertStatus(409);

        $quote = $this->createQuote($lead['id']);
        $line = $this->addLine($quote['id'], $this->product120, '1.000', '0.00')->assertCreated()->json('data');
        $this->postJson('/api/v1/quotes/'.$quote['id'].'/confirm', [], $this->csrfHeaders())->assertOk();
        $this->patchJson('/api/v1/quotes/'.$quote['id'].'/lines/'.$line['id'], ['quantity' => '2', 'discount' => '0'], $this->csrfHeaders())
            ->assertStatus(409);

        $otherQuote = $this->createQuote($lead['id']);
        $sentinelOrder = SalesOrder::query()->create([
            'organization_id' => $this->organizationA->getKey(),
            'source_quote_id' => $otherQuote['id'], 'lead_id' => $lead['id'], 'customer_party_id' => $this->customer->getKey(),
            'code' => 'SO-SENTINEL', 'status' => 'confirmed', 'lead_code_snapshot' => $lead['code'],
            'lead_title_snapshot' => $lead['title'], 'customer_code_snapshot' => $this->customer->code,
            'customer_name_snapshot' => $this->customer->display_name, 'price_list_code_snapshot' => $this->priceList->code,
            'price_list_name_snapshot' => $this->priceList->name, 'total_toman' => '120000', 'confirmed_at' => now(),
        ]);
        $sourceLine = SalesQuoteLine::query()->findOrFail($line['id']);
        SalesOrderLine::query()->create([
            'organization_id' => $this->organizationA->getKey(), 'sales_order_id' => $sentinelOrder->getKey(),
            'source_quote_line_id' => $sourceLine->getKey(), 'product_id' => $sourceLine->product_id, 'unit_id' => $sourceLine->unit_id,
            'product_code_snapshot' => $sourceLine->product_code_snapshot, 'product_name_snapshot' => $sourceLine->product_name_snapshot,
            'unit_code_snapshot' => $sourceLine->unit_code_snapshot, 'unit_name_snapshot' => $sourceLine->unit_name_snapshot,
            'unit_symbol_snapshot' => $sourceLine->unit_symbol_snapshot, 'quantity' => $sourceLine->quantity,
            'unit_price_toman_tenths' => $sourceLine->unit_price_toman_tenths, 'discount_basis_points' => $sourceLine->discount_basis_points,
            'line_net_toman' => $sourceLine->line_net_toman,
        ]);

        $this->postJson('/api/v1/quotes/'.$quote['id'].'/convert', [], $this->csrfHeaders())->assertServerError();
        $this->assertDatabaseMissing('sales_orders', ['source_quote_id' => $quote['id']]);
        $this->assertDatabaseCount('sales_orders', 1);
        $this->assertDatabaseCount('sales_order_lines', 1);
    }

    private function createLead(): array
    {
        return $this->postJson('/api/v1/leads', [
            'title' => 'پروژهٔ فروش آزمایشی', 'party_id' => $this->customer->getKey(),
        ], $this->csrfHeaders())->assertCreated()->json('data');
    }

    private function createQuote(int $leadId): array
    {
        return $this->postJson('/api/v1/leads/'.$leadId.'/quotes', [
            'price_list_id' => $this->priceList->getKey(),
        ], $this->csrfHeaders())->assertCreated()->json('data');
    }

    private function addLine(int $quoteId, Product $product, string $quantity, string $discount)
    {
        return $this->postJson('/api/v1/quotes/'.$quoteId.'/lines', [
            'product_id' => $product->getKey(), 'quantity' => $quantity, 'discount' => $discount,
        ], $this->csrfHeaders());
    }

    /** @param list<string> $roles */
    private function party(Organization $organization, string $code, string $name, array $roles): Party
    {
        $party = Party::query()->create(['organization_id' => $organization->getKey(), 'code' => $code, 'display_name' => $name]);
        foreach ($roles as $role) {
            PartyRole::query()->create(['organization_id' => $organization->getKey(), 'party_id' => $party->getKey(), 'role' => $role]);
        }

        return $party;
    }

    private function product(Organization $organization, Unit $unit, string $code, string $name): Product
    {
        return Product::query()->create([
            'organization_id' => $organization->getKey(), 'base_unit_id' => $unit->getKey(), 'code' => $code, 'name' => $name,
        ]);
    }
}
