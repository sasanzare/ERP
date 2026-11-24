<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\AccountingAccount;
use App\Models\AccountingBook;
use App\Models\AccountingPeriod;
use App\Models\Lead;
use App\Models\Location;
use App\Models\Organization;
use App\Models\P10AccountingProfile;
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
use App\Services\Accounting\AccountingMoneyCalculator;
use App\Services\Accounting\AccountingService;
use App\Services\Settlements\P10AmountCalculator;
use App\Services\Settlements\P10PostingProfileResolver;
use App\Services\Settlements\P10SettlementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class P10SettlementTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private Organization $foreignOrganization;

    private User $editor;

    private User $approver;

    private User $reader;

    private Unit $unit;

    private Product $product;

    private Party $supplier;

    private Warehouse $warehouse;

    private Location $location;

    private AccountingBook $book;

    private AccountingPeriod $period;

    private P10AccountingProfile $profile;

    private AccountingAccount $receivable;

    private AccountingAccount $revenue;

    private AccountingAccount $payable;

    private AccountingAccount $purchaseDebit;

    private AccountingAccount $customerTreasury;

    private AccountingAccount $supplierTreasury;

    protected function setUp(): void
    {
        parent::setUp();

        $this->organization = Organization::query()->create(['name' => 'سازمان تسویه الف', 'slug' => 'p10-settlement-a']);
        $this->foreignOrganization = Organization::query()->create(['name' => 'سازمان تسویه ب', 'slug' => 'p10-settlement-b']);
        $this->editor = User::factory()->create();
        $this->approver = User::factory()->create();
        $this->reader = User::factory()->create();
        $this->editor->organizations()->attach($this->organization, ['role' => OrganizationRole::Editor->value]);
        $this->approver->organizations()->attach($this->organization, ['role' => OrganizationRole::Editor->value]);
        $this->reader->organizations()->attach($this->organization, ['role' => OrganizationRole::Reader->value]);
        $this->editor->organizations()->attach($this->foreignOrganization, ['role' => OrganizationRole::Reader->value]);

        $this->unit = $this->makeUnit($this->organization, 'EA');
        $this->product = $this->makeProduct($this->organization, $this->unit, 'P10-ITEM');
        $this->supplier = $this->makeParty($this->organization, 'P10-SUP', 'تأمین‌کنندهٔ آزمایشی', 'supplier');
        $this->warehouse = Warehouse::query()->create([
            'organization_id' => $this->organization->getKey(), 'code' => 'P10-WH', 'name' => 'انبار تسویه',
        ]);
        $this->location = Location::query()->create([
            'organization_id' => $this->organization->getKey(), 'warehouse_id' => $this->warehouse->getKey(),
            'code' => 'P10-LOC', 'name' => 'مکان تسویه',
        ]);

        $this->book = AccountingBook::query()->create([
            'organization_id' => $this->organization->getKey(), 'code' => 'P10-SYNTH-TEST',
            'name' => 'دفتر synthetic تسویه', 'currency_code' => 'IRR', 'currency_scale' => 0,
            'time_zone' => 'Asia/Tehran',
        ]);
        $this->receivable = $this->makeAccount('1100', 'دریافتنی آزمایشی', 'asset');
        $this->revenue = $this->makeAccount('4100', 'درآمد آزمایشی', 'revenue');
        $this->payable = $this->makeAccount('2100', 'پرداختنی آزمایشی', 'liability');
        $this->purchaseDebit = $this->makeAccount('5100', 'هزینهٔ خرید آزمایشی', 'expense');
        $this->customerTreasury = $this->makeAccount('1010', 'خزانهٔ دریافت آزمایشی', 'asset');
        $this->supplierTreasury = $this->makeAccount('1020', 'خزانهٔ پرداخت آزمایشی', 'asset');
        $this->period = AccountingPeriod::query()->create([
            'organization_id' => $this->organization->getKey(), 'book_id' => $this->book->getKey(),
            'code' => 'P10-2026', 'name' => 'دورهٔ آزمایشی P10',
            'starts_on' => '2026-01-01', 'ends_on' => '2026-12-31', 'status' => 'open',
        ]);
        $this->profile = P10AccountingProfile::query()->create([
            'organization_id' => $this->organization->getKey(),
            'book_id' => $this->book->getKey(),
            'status' => 'synthetic_test',
            'customer_receivable_account_id' => $this->receivable->getKey(),
            'customer_revenue_account_id' => $this->revenue->getKey(),
            'supplier_payable_account_id' => $this->payable->getKey(),
            'supplier_debit_account_id' => $this->purchaseDebit->getKey(),
            'customer_treasury_account_id' => $this->customerTreasury->getKey(),
            'supplier_treasury_account_id' => $this->supplierTreasury->getKey(),
        ]);

        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organization->getKey()]);
    }

    public function test_customer_invoice_receipt_trace_exact_rial_balance_and_retries(): void
    {
        [$order, $line, $delivery] = $this->deliveredSalesOrder();
        $key = '54a75d42-83dc-4b33-9cab-111111111101';
        $path = '/api/v1/settlements/sales-orders/'.$order->getKey().'/customer-invoices';
        $input = [
            'book_id' => $this->book->getKey(), 'effective_on' => '2026-11-24', 'due_on' => '2026-12-24',
            'lines' => [[
                'sales_order_line_id' => $line->getKey(), 'sales_order_delivery_id' => $delivery['id'], 'quantity_milli' => '1000',
            ]],
        ];

        $invoice = $this->postJson($path, $input, $this->csrfHeaders() + ['Idempotency-Key' => $key])
            ->assertCreated()->assertJsonPath('data.amount_rial', '1000000')->assertJsonPath('data.amount_toman', '100000')
            ->assertJsonPath('data.outstanding_rial', '1000000')->json('data');
        self::assertSame($order->code, $invoice['source']['code']);
        self::assertSame($line->getKey(), $invoice['lines'][0]['source_line_id']);
        self::assertSame($delivery['id'], $invoice['lines'][0]['source']['id']);
        self::assertSame($delivery['operation']['id'], $invoice['lines'][0]['source']['operation_id']);
        self::assertSame($delivery['movement']['id'], $invoice['lines'][0]['source']['movement_id']);
        self::assertSame('1000000', $invoice['journal']['debit_total_rial']);
        self::assertSame($invoice['journal']['debit_total_rial'], $invoice['journal']['credit_total_rial']);
        self::assertSame([
            '1100' => ['debit_rial' => '1000000', 'credit_rial' => '0'],
            '4100' => ['debit_rial' => '0', 'credit_rial' => '1000000'],
        ], $this->journalAmountsByAccount($this->readJournal($invoice['journal']['id'])));

        $retry = $this->postJson($path, $input, $this->csrfHeaders() + ['Idempotency-Key' => $key])
            ->assertOk()->assertJsonPath('already_exists', true)->json('data');
        self::assertSame($invoice['id'], $retry['id']);
        $this->postJson($path, [...$input, 'due_on' => '2026-12-25'], $this->csrfHeaders() + ['Idempotency-Key' => $key])
            ->assertStatus(409);
        $this->postJson($path, [...$input, 'lines' => [[
            'sales_order_line_id' => $line->getKey(), 'sales_order_delivery_id' => $delivery['id'], 'quantity_milli' => '1',
        ]]], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertUnprocessable();

        $receiptKey = '54a75d42-83dc-4b33-9cab-111111111102';
        $receiptPath = '/api/v1/settlements/customer-invoices/'.$invoice['id'].'/receipts';
        $receiptInput = ['amount_rial' => '400000', 'effective_on' => '2026-11-24', 'reference' => 'P10 synthetic receipt'];
        $receipt = $this->postJson($receiptPath, $receiptInput, $this->csrfHeaders() + ['Idempotency-Key' => $receiptKey])
            ->assertCreated()->assertJsonPath('invoice.outstanding_rial', '600000')
            ->assertJsonPath('invoice.outstanding_toman', '60000')->json();
        $movementId = $receipt['data']['movement']['id'];
        $allocationId = $receipt['data']['allocation']['id'];
        $receiptJournalId = $receipt['data']['movement']['journal']['id'];
        self::assertSame($invoice['id'], $receipt['data']['allocation']['invoice_id']);
        self::assertSame($invoice['open_item']['id'], $receipt['data']['allocation']['open_item_id']);
        self::assertSame($receipt['data']['allocation']['journal_id'], $receiptJournalId);
        self::assertSame('1000000', $receipt['invoice']['journal']['debit_total_rial']);
        self::assertSame([
            '1010' => ['debit_rial' => '400000', 'credit_rial' => '0'],
            '1100' => ['debit_rial' => '0', 'credit_rial' => '400000'],
        ], $this->journalAmountsByAccount($this->readJournal($receiptJournalId)));

        $readback = $this->getJson('/api/v1/settlements/invoices?direction=customer')->assertOk()
            ->assertJsonPath('data.0.id', $invoice['id'])->assertJsonPath('data.0.outstanding_rial', '600000')
            ->assertJsonPath('data.0.outstanding_toman', '60000')->json('data.0');
        self::assertSame($delivery['id'], $readback['lines'][0]['source']['id']);
        self::assertSame($movementId, $readback['allocations'][0]['treasury_movement']['id']);
        self::assertSame($receiptJournalId, $readback['allocations'][0]['treasury_movement']['journal']['id']);

        $finalKey = '54a75d42-83dc-4b33-9cab-111111111104';
        $final = $this->postJson($receiptPath, ['amount_rial' => '600000', 'effective_on' => '2026-11-24', 'reference' => 'close customer balance'],
            $this->csrfHeaders() + ['Idempotency-Key' => $finalKey])->assertCreated()
            ->assertJsonPath('invoice.outstanding_rial', '0')->json();
        self::assertSame('0', $final['invoice']['outstanding_toman']);
        $this->postJson($receiptPath, $receiptInput, $this->csrfHeaders() + ['Idempotency-Key' => $receiptKey])
            ->assertOk()->assertJsonPath('already_exists', true)
            ->assertJsonPath('data.movement.id', $movementId)->assertJsonPath('data.allocation.id', $allocationId)
            ->assertJsonPath('invoice.outstanding_rial', '0');
        $this->postJson($receiptPath, [...$receiptInput, 'amount_rial' => '300000'], $this->csrfHeaders() + ['Idempotency-Key' => $receiptKey])
            ->assertStatus(409);
        $this->postJson($receiptPath, [...$receiptInput, 'amount_rial' => '600001'], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])
            ->assertUnprocessable()->assertJsonValidationErrors('amount_rial');

        $this->postJson('/api/v1/accounting/journals/'.$receiptJournalId.'/reverse', [
            'accounting_date' => '2026-11-25', 'reason' => 'تلاش برای برگشت مستقل',
        ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertStatus(409);
        $this->assertDatabaseCount('p10_invoices', 1);
        $this->assertDatabaseCount('p10_open_items', 1);
        $this->assertDatabaseCount('p10_treasury_movements', 2);
        $this->assertDatabaseCount('p10_allocations', 2);
        $this->assertDatabaseHas('accounting_journals', [
            'id' => $receiptJournalId, 'status' => 'posted', 'source_type' => 'p10.customer_receipt',
            'debit_total_rial' => 400000, 'credit_total_rial' => 400000,
        ]);
    }

    public function test_supplier_invoice_payment_and_closed_period_retry_keep_receipt_trace(): void
    {
        $order = $this->receivedPurchaseOrder();
        $line = $order['data']['lines'][0];
        $receipt = $line['receipts'][0];
        $invoiceKey = '54a75d42-83dc-4b33-9cab-111111111201';
        $invoicePath = '/api/v1/settlements/purchase-orders/'.$order['data']['id'].'/supplier-invoices';
        $invoiceInput = [
            'book_id' => $this->book->getKey(), 'effective_on' => '2026-11-24', 'due_on' => '2026-12-24',
            'lines' => [[
                'purchase_order_line_id' => $line['id'], 'purchase_receipt_id' => $receipt['id'], 'quantity_milli' => '1000',
            ]],
        ];

        $invoice = $this->postJson($invoicePath, $invoiceInput, $this->csrfHeaders() + ['Idempotency-Key' => $invoiceKey])
            ->assertCreated()->assertJsonPath('data.amount_rial', '500000')->assertJsonPath('data.source.code', $order['data']['code'])
            ->json('data');
        self::assertSame('warehouse_receipt', $invoice['lines'][0]['source']['type']);
        self::assertSame($receipt['id'], $invoice['lines'][0]['source']['id']);
        self::assertSame($receipt['operation']['id'], $invoice['lines'][0]['source']['operation_id']);
        self::assertSame($receipt['movement']['id'], $invoice['lines'][0]['source']['movement_id']);
        self::assertSame('500000', $invoice['journal']['debit_total_rial']);
        self::assertSame('500000', $invoice['journal']['credit_total_rial']);
        self::assertSame([
            '5100' => ['debit_rial' => '500000', 'credit_rial' => '0'],
            '2100' => ['debit_rial' => '0', 'credit_rial' => '500000'],
        ], $this->journalAmountsByAccount($this->readJournal($invoice['journal']['id'])));

        $paymentKey = '54a75d42-83dc-4b33-9cab-111111111202';
        $paymentPath = '/api/v1/settlements/supplier-invoices/'.$invoice['id'].'/payments';
        $paymentInput = ['amount_rial' => '200000', 'effective_on' => '2026-11-24', 'reference' => 'P10 synthetic payment'];
        $payment = $this->postJson($paymentPath, $paymentInput, $this->csrfHeaders() + ['Idempotency-Key' => $paymentKey])
            ->assertCreated()->assertJsonPath('invoice.outstanding_rial', '300000')->json();
        $movementId = $payment['data']['movement']['id'];
        $allocationId = $payment['data']['allocation']['id'];
        $journalId = $payment['data']['movement']['journal']['id'];
        self::assertSame($invoice['id'], $payment['data']['allocation']['invoice_id']);
        self::assertSame($invoice['open_item']['id'], $payment['data']['allocation']['open_item_id']);
        self::assertSame($payment['data']['allocation']['journal_id'], $journalId);
        self::assertSame([
            '2100' => ['debit_rial' => '200000', 'credit_rial' => '0'],
            '1020' => ['debit_rial' => '0', 'credit_rial' => '200000'],
        ], $this->journalAmountsByAccount($this->readJournal($journalId)));

        $this->postJson('/api/v1/accounting/periods/'.$this->period->getKey().'/close', [], $this->csrfHeaders())
            ->assertOk()->assertJsonPath('data.status', 'closed');
        $this->postJson($paymentPath, ['amount_rial' => '100000', 'effective_on' => '2026-11-25', 'reference' => 'late'],
            $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertUnprocessable()->assertJsonValidationErrors('accounting_date');
        $this->postJson($paymentPath, $paymentInput, $this->csrfHeaders() + ['Idempotency-Key' => $paymentKey])
            ->assertOk()->assertJsonPath('already_exists', true)
            ->assertJsonPath('data.movement.id', $movementId)->assertJsonPath('data.allocation.id', $allocationId);
        $invoiceReplay = $this->postJson($invoicePath, $invoiceInput, $this->csrfHeaders() + ['Idempotency-Key' => $invoiceKey])
            ->assertOk()->assertJsonPath('already_exists', true)->json('data');
        self::assertSame($invoice['id'], $invoiceReplay['id']);
        self::assertSame($invoice['journal']['id'], $invoiceReplay['journal']['id']);

        foreach ([$invoice['journal']['id'], $journalId] as $linkedJournalId) {
            $this->postJson('/api/v1/accounting/journals/'.$linkedJournalId.'/reverse', [
                'accounting_date' => '2026-11-25', 'reason' => 'P10 closed-period correction boundary',
            ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertStatus(409);
        }

        $this->assertDatabaseCount('p10_invoices', 1);
        $this->assertDatabaseCount('accounting_journals', 2);
        $this->assertDatabaseCount('p10_treasury_movements', 1);
        $this->assertDatabaseCount('p10_allocations', 1);
        $this->assertDatabaseHas('accounting_journals', [
            'id' => $journalId, 'source_type' => 'p10.supplier_payment', 'debit_total_rial' => 200000, 'credit_total_rial' => 200000,
        ]);
    }

    public function test_unapproved_book_reader_foreign_ids_and_csrf_keep_writes_blocked(): void
    {
        [$order, $line, $delivery] = $this->deliveredSalesOrder();
        $unapprovedBook = AccountingBook::query()->create([
            'organization_id' => $this->organization->getKey(), 'code' => 'P09-UNAPPROVED', 'name' => 'دفتر بدون تأیید',
            'currency_code' => 'IRR', 'currency_scale' => 0, 'time_zone' => 'Asia/Tehran',
        ]);
        $bookOptions = collect($this->getJson('/api/v1/settlements/options')->assertOk()->json('data.books'))->keyBy('id');
        self::assertTrue($bookOptions->get($this->book->getKey())['posting_ready']);
        self::assertSame('synthetic_test', $bookOptions->get($this->book->getKey())['posting_mode']);
        self::assertFalse($bookOptions->get($unapprovedBook->getKey())['posting_ready']);
        self::assertSame(null, $bookOptions->get($unapprovedBook->getKey())['posting_mode']);
        $path = '/api/v1/settlements/sales-orders/'.$order->getKey().'/customer-invoices';
        $input = [
            'book_id' => $unapprovedBook->getKey(), 'effective_on' => '2026-11-24', 'due_on' => '2026-12-24',
            'lines' => [['sales_order_line_id' => $line->getKey(), 'sales_order_delivery_id' => $delivery['id'], 'quantity_milli' => '1000']],
        ];
        $this->postJson($path, $input)->assertStatus(419);
        $this->postJson($path, $input, $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertStatus(409);
        $this->assertDatabaseCount('p10_invoices', 0);

        $foreignUnit = $this->makeUnit($this->foreignOrganization, 'EA');
        $foreignProduct = $this->makeProduct($this->foreignOrganization, $foreignUnit, 'P10-FOREIGN');
        [$foreignOrder] = $this->makeSalesOrder($this->foreignOrganization, $foreignProduct, $foreignUnit, 'SO-P10-FOREIGN', '100000');
        $this->postJson('/api/v1/settlements/sales-orders/'.$foreignOrder->getKey().'/customer-invoices', [], $this->csrfHeaders())
            ->assertNotFound();

        $this->actingAs($this->reader)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $this->getJson('/api/v1/settlements/options')->assertOk()->assertJsonPath('can_manage', false);
        $this->postJson($path, $input, $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertForbidden();
        $this->assertDatabaseCount('p10_invoices', 0);
    }

    public function test_controlled_journal_failure_rolls_back_invoice_and_settlement_rows(): void
    {
        [$order, $line, $delivery] = $this->deliveredSalesOrder();
        $input = [[
            'sales_order_line_id' => (int) $line->getKey(),
            'sales_order_delivery_id' => (int) $delivery['id'], 'quantity_milli' => '1000',
        ]];
        $failingAccounting = Mockery::mock(AccountingService::class);
        $failingAccounting->shouldReceive('postBalancedLines')->once()->andThrow(new RuntimeException('P10 controlled posting failure.'));
        $service = $this->settlementService($failingAccounting);

        try {
            $service->postCustomerInvoice($this->organization, $this->editor, (int) $order->getKey(), (int) $this->book->getKey(),
                '2026-11-24', '2026-12-24', $input, '54a75d42-83dc-4b33-9cab-111111111301');
            self::fail('The controlled P10 journal failure was not raised.');
        } catch (RuntimeException $exception) {
            self::assertSame('P10 controlled posting failure.', $exception->getMessage());
        }
        $this->assertDatabaseCount('p10_invoices', 0);
        $this->assertDatabaseCount('p10_invoice_lines', 0);
        $this->assertDatabaseCount('p10_open_items', 0);

        $invoice = $this->postJson('/api/v1/settlements/sales-orders/'.$order->getKey().'/customer-invoices', [
            'book_id' => $this->book->getKey(), 'effective_on' => '2026-11-24', 'due_on' => '2026-12-24',
            'lines' => $input,
        ], $this->csrfHeaders() + ['Idempotency-Key' => '54a75d42-83dc-4b33-9cab-111111111302'])
            ->assertCreated()->json('data');

        $failingSettlementAccounting = Mockery::mock(AccountingService::class);
        $failingSettlementAccounting->shouldReceive('postBalancedLines')->once()->andThrow(new RuntimeException('P10 controlled settlement failure.'));
        $service = $this->settlementService($failingSettlementAccounting);
        try {
            $service->settleInvoice($this->organization, $this->editor, (int) $invoice['id'], 'customer', '400000',
                '2026-11-24', 'controlled failure', '54a75d42-83dc-4b33-9cab-111111111303');
            self::fail('The controlled P10 settlement failure was not raised.');
        } catch (RuntimeException $exception) {
            self::assertSame('P10 controlled settlement failure.', $exception->getMessage());
        }

        $this->assertDatabaseCount('p10_treasury_movements', 0);
        $this->assertDatabaseCount('p10_allocations', 0);
        $this->getJson('/api/v1/settlements/invoices?direction=customer')->assertOk()
            ->assertJsonPath('data.0.outstanding_rial', '1000000');
    }

    /** @return array{SalesOrder, SalesOrderLine, array<string, mixed>} */
    private function deliveredSalesOrder(): array
    {
        [$order, $line] = $this->makeSalesOrder($this->organization, $this->product, $this->unit, 'SO-P10-CUSTOMER', '100000');
        $headers = $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()];
        $this->postJson('/api/v1/stock/operations', [
            'operation_type' => 'opening', 'product_id' => $this->product->getKey(), 'quantity' => '2.000',
            'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->location->getKey(),
        ], $headers)->assertCreated();
        $reserved = $this->postJson('/api/v1/sales-orders/'.$order->getKey().'/lines/'.$line->getKey().'/reservations', [
            'quantity' => '1.000', 'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->location->getKey(),
        ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertCreated()->json('data');
        $reservationId = $reserved['lines'][0]['fulfillment']['reservations'][0]['id'];
        $delivered = $this->postJson('/api/v1/sales-orders/'.$order->getKey().'/lines/'.$line->getKey().'/deliveries', [
            'reservation_id' => $reservationId, 'quantity' => '1.000',
        ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertCreated()->json('data');

        return [$order, $line, $delivered['lines'][0]['fulfillment']['deliveries'][0]];
    }

    /** @return array<string, mixed> */
    private function receivedPurchaseOrder(): array
    {
        $request = $this->postJson('/api/v1/purchase-requests', [
            'title' => 'سفارش خرید آزمایشی P10', 'lines' => [['product_id' => $this->product->getKey(), 'quantity' => '1.000']],
        ], $this->csrfHeaders())->assertCreated()->json('data');
        $this->postJson('/api/v1/purchase-requests/'.$request['id'].'/submit', [], $this->csrfHeaders())->assertOk();
        $this->actingAs($this->approver)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $this->postJson('/api/v1/purchase-requests/'.$request['id'].'/approve', [], $this->csrfHeaders())->assertOk();
        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $order = $this->postJson('/api/v1/purchase-requests/'.$request['id'].'/convert', [
            'supplier_party_id' => $this->supplier->getKey(),
            'lines' => [['source_request_line_id' => $request['lines'][0]['id'], 'unit_price_rial' => '500000']],
        ], $this->csrfHeaders())->assertCreated()->json('data');
        $receipt = $this->postJson('/api/v1/purchase-orders/'.$order['id'].'/lines/'.$order['lines'][0]['id'].'/receipts', [
            'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->location->getKey(), 'quantity' => '1.000',
        ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertCreated()->json('data');

        return ['data' => $receipt];
    }

    /** @return array{SalesOrder, SalesOrderLine} */
    private function makeSalesOrder(Organization $organization, Product $product, Unit $unit, string $code, string $lineAmountToman): array
    {
        $customer = $this->makeParty($organization, $code.'-CUS', 'مشتری '.$code, 'customer');
        $lead = Lead::query()->create([
            'organization_id' => $organization->getKey(), 'party_id' => $customer->getKey(), 'code' => $code.'-LEAD', 'title' => 'سرنخ '.$code,
        ]);
        $priceList = PriceList::query()->create(['organization_id' => $organization->getKey(), 'code' => $code.'-PRICE', 'name' => 'فهرست '.$code]);
        $quote = SalesQuote::query()->create([
            'organization_id' => $organization->getKey(), 'lead_id' => $lead->getKey(), 'customer_party_id' => $customer->getKey(),
            'price_list_id' => $priceList->getKey(), 'code' => $code.'-QUOTE', 'status' => 'confirmed',
            'lead_code_snapshot' => $lead->code, 'lead_title_snapshot' => $lead->title,
            'customer_code_snapshot' => $customer->code, 'customer_name_snapshot' => $customer->display_name,
            'price_list_code_snapshot' => $priceList->code, 'price_list_name_snapshot' => $priceList->name,
            'total_toman' => $lineAmountToman, 'confirmed_at' => now(),
        ]);
        $quoteLine = SalesQuoteLine::query()->create([
            'organization_id' => $organization->getKey(), 'quote_id' => $quote->getKey(),
            'product_id' => $product->getKey(), 'unit_id' => $unit->getKey(),
            'product_code_snapshot' => $product->code, 'product_name_snapshot' => $product->name,
            'unit_code_snapshot' => $unit->code, 'unit_name_snapshot' => $unit->name, 'unit_symbol_snapshot' => $unit->symbol,
            'quantity' => '1.000', 'unit_price_toman_tenths' => $lineAmountToman.'0', 'discount_basis_points' => 0,
            'line_net_toman' => $lineAmountToman,
        ]);
        $order = SalesOrder::query()->create([
            'organization_id' => $organization->getKey(), 'source_quote_id' => $quote->getKey(),
            'lead_id' => $lead->getKey(), 'customer_party_id' => $customer->getKey(), 'code' => $code, 'status' => 'confirmed',
            'lead_code_snapshot' => $lead->code, 'lead_title_snapshot' => $lead->title,
            'customer_code_snapshot' => $customer->code, 'customer_name_snapshot' => $customer->display_name,
            'price_list_code_snapshot' => $priceList->code, 'price_list_name_snapshot' => $priceList->name,
            'total_toman' => $lineAmountToman, 'confirmed_at' => now(),
        ]);
        $line = SalesOrderLine::query()->create([
            'organization_id' => $organization->getKey(), 'sales_order_id' => $order->getKey(),
            'source_quote_line_id' => $quoteLine->getKey(), 'product_id' => $product->getKey(), 'unit_id' => $unit->getKey(),
            'product_code_snapshot' => $product->code, 'product_name_snapshot' => $product->name,
            'unit_code_snapshot' => $unit->code, 'unit_name_snapshot' => $unit->name, 'unit_symbol_snapshot' => $unit->symbol,
            'quantity' => '1.000', 'unit_price_toman_tenths' => $lineAmountToman.'0', 'discount_basis_points' => 0,
            'line_net_toman' => $lineAmountToman,
        ]);

        return [$order, $line];
    }

    private function makeUnit(Organization $organization, string $code): Unit
    {
        return Unit::query()->create(['organization_id' => $organization->getKey(), 'code' => $code, 'name' => 'عدد', 'symbol' => 'عدد']);
    }

    private function makeProduct(Organization $organization, Unit $unit, string $code): Product
    {
        return Product::query()->create([
            'organization_id' => $organization->getKey(), 'base_unit_id' => $unit->getKey(), 'code' => $code, 'name' => 'کالای '.$code,
        ]);
    }

    private function makeParty(Organization $organization, string $code, string $name, string $role): Party
    {
        $party = Party::query()->create(['organization_id' => $organization->getKey(), 'code' => $code, 'display_name' => $name]);
        PartyRole::query()->create(['organization_id' => $organization->getKey(), 'party_id' => $party->getKey(), 'role' => $role]);

        return $party;
    }

    private function makeAccount(string $code, string $name, string $category): AccountingAccount
    {
        return AccountingAccount::query()->create([
            'organization_id' => $this->organization->getKey(), 'book_id' => $this->book->getKey(),
            'code' => $code, 'name' => $name, 'category' => $category, 'is_postable' => true, 'is_active' => true,
        ]);
    }

    /**
     * @param  array<string, mixed>  $journal
     * @return array<string, array{debit_rial: string, credit_rial: string}>
     */
    private function journalAmountsByAccount(array $journal): array
    {
        return collect($journal['lines'])->mapWithKeys(fn (array $line): array => [
            $line['account']['code'] => [
                'debit_rial' => $line['debit_rial'],
                'credit_rial' => $line['credit_rial'],
            ],
        ])->all();
    }

    private function readJournal(int $journalId): array
    {
        return $this->getJson('/api/v1/accounting/journals/'.$journalId)->assertOk()->json('data');
    }

    private function settlementService(AccountingService $accounting): P10SettlementService
    {
        return new P10SettlementService(
            app(AccountingMoneyCalculator::class),
            $accounting,
            app(P10AmountCalculator::class),
            app(P10PostingProfileResolver::class),
        );
    }
}
