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
use App\Models\P10Invoice;
use App\Models\P10TreasuryMovement;
use App\Models\Party;
use App\Models\PartyRole;
use App\Models\PriceList;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use App\Models\SalesQuote;
use App\Models\SalesQuoteLine;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\Purchasing\PurchasingService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class P11DashboardTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private Organization $foreignOrganization;

    private User $editor;

    private User $approver;

    private Unit $unit;

    private Product $product;

    private Party $supplier;

    private Warehouse $warehouse;

    private Location $location;

    private AccountingBook $book;

    private AccountingAccount $receivable;

    private AccountingAccount $revenue;

    private AccountingAccount $payable;

    private AccountingAccount $purchaseDebit;

    private AccountingAccount $customerTreasury;

    private AccountingAccount $supplierTreasury;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-24 19:00:00', 'UTC'));

        $this->organization = Organization::query()->create(['name' => 'سازمان گزارش الف', 'slug' => 'p11-report-a']);
        $this->foreignOrganization = Organization::query()->create(['name' => 'سازمان گزارش ب', 'slug' => 'p11-report-b']);
        $this->editor = User::factory()->create();
        $this->approver = User::factory()->create();
        $this->editor->organizations()->attach($this->organization, ['role' => OrganizationRole::Editor->value]);
        $this->approver->organizations()->attach($this->organization, ['role' => OrganizationRole::Editor->value]);
        $this->editor->organizations()->attach($this->foreignOrganization, ['role' => OrganizationRole::Reader->value]);

        $this->unit = $this->makeUnit($this->organization, 'EA');
        $this->product = $this->makeProduct($this->organization, $this->unit, 'P11-ITEM');
        $this->makeParty($this->organization, 'P11-CUSTOMER', 'مشتری پایهٔ گزارش', 'customer');
        $this->supplier = $this->makeParty($this->organization, 'P11-SUP', 'تأمین‌کنندهٔ گزارش', 'supplier');
        $this->warehouse = Warehouse::query()->create([
            'organization_id' => $this->organization->getKey(), 'code' => 'P11-WH', 'name' => 'انبار گزارش',
        ]);
        $this->location = Location::query()->create([
            'organization_id' => $this->organization->getKey(), 'warehouse_id' => $this->warehouse->getKey(),
            'code' => 'P11-LOC', 'name' => 'مکان گزارش',
        ]);

        $this->book = AccountingBook::query()->create([
            'organization_id' => $this->organization->getKey(), 'code' => 'P10-SYNTH-P11',
            'name' => 'دفتر synthetic گزارش', 'currency_code' => 'IRR', 'currency_scale' => 0,
            'time_zone' => 'Asia/Tehran',
        ]);
        $this->receivable = $this->makeAccount('1100', 'دریافتنی گزارش', 'asset');
        $this->revenue = $this->makeAccount('4100', 'درآمد گزارش', 'revenue');
        $this->payable = $this->makeAccount('2100', 'پرداختنی گزارش', 'liability');
        $this->purchaseDebit = $this->makeAccount('5100', 'هزینهٔ خرید گزارش', 'expense');
        $this->customerTreasury = $this->makeAccount('1010', 'خزانهٔ دریافت گزارش', 'asset');
        $this->supplierTreasury = $this->makeAccount('1020', 'خزانهٔ پرداخت گزارش', 'asset');
        AccountingPeriod::query()->create([
            'organization_id' => $this->organization->getKey(), 'book_id' => $this->book->getKey(),
            'code' => 'P11-2026', 'name' => 'دورهٔ گزارش',
            'starts_on' => '2026-01-01', 'ends_on' => '2026-12-31', 'status' => 'open',
        ]);
        P10AccountingProfile::query()->create([
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

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_financial_metrics_reconcile_posted_customer_invoices_and_dated_posted_allocations(): void
    {
        [$customerInvoice] = $this->createCustomerInvoice('P11-CUSTOMER-OPEN', '100000', '2026-11-20', '2026-11-23');
        $beforeCutoff = $this->settleCustomerInvoice($customerInvoice['id'], '399999', '2026-11-23');
        $this->settleCustomerInvoice($customerInvoice['id'], '100000', '2026-11-25');

        [$dueOnCutoff] = $this->createCustomerInvoice('P11-DUE-ON-CUTOFF', '20000', '2026-11-20', '2026-11-24');
        [$futureInvoice] = $this->createCustomerInvoice('P11-FUTURE-EFFECTIVE', '30000', '2026-11-25', '2026-11-26');

        [$paidInvoice] = $this->createCustomerInvoice('P11-FULLY-SETTLED', '20000', '2026-11-18', '2026-11-22');
        $this->settleCustomerInvoice($paidInvoice['id'], '200000', '2026-11-23');

        [$unpostedSettlementInvoice] = $this->createCustomerInvoice('P11-UNPOSTED-ALLOCATION', '30000', '2026-11-18', '2026-11-22');
        $unpostedSettlement = $this->settleCustomerInvoice($unpostedSettlementInvoice['id'], '300000', '2026-11-23');
        DB::table('accounting_journals')->where('id', $unpostedSettlement['data']['movement']['journal']['id'])->update(['status' => 'draft']);

        $this->createSupplierInvoice('P11-SUPPLIER-INVOICE', '2026-11-20', '2026-11-22');

        $manual = $this->postJson('/api/v1/accounting/journals', [
            'book_id' => $this->book->getKey(), 'accounting_date' => '2026-11-24', 'description' => 'Standalone manual sale journal',
            'lines' => [
                ['account_id' => $this->receivable->getKey(), 'debit_rial' => '700000', 'credit_rial' => '0'],
                ['account_id' => $this->revenue->getKey(), 'debit_rial' => '0', 'credit_rial' => '700000'],
            ],
        ], $this->csrfHeaders())->assertCreated()->json('data');
        $this->postJson('/api/v1/accounting/journals/'.$manual['id'].'/post', [], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])
            ->assertCreated();

        $date = '2026-11-24';
        $independentSales = DB::table('p10_invoices AS invoices')
            ->join('accounting_journals AS journals', function ($join): void {
                $join->on('journals.organization_id', '=', 'invoices.organization_id')
                    ->on('journals.book_id', '=', 'invoices.book_id')
                    ->on('journals.id', '=', 'invoices.journal_id');
            })
            ->where('invoices.organization_id', $this->organization->getKey())
            ->where('invoices.book_id', $this->book->getKey())
            ->where('invoices.direction', 'customer')->where('invoices.status', 'posted')
            ->where('journals.status', 'posted')->where('invoices.effective_on', '<=', $date)
            ->sum('invoices.amount_rial');

        $eligibleInvoices = DB::table('p10_invoices AS invoices')
            ->join('accounting_journals AS invoice_journals', function ($join): void {
                $join->on('invoice_journals.organization_id', '=', 'invoices.organization_id')
                    ->on('invoice_journals.book_id', '=', 'invoices.book_id')
                    ->on('invoice_journals.id', '=', 'invoices.journal_id');
            })
            ->where('invoices.organization_id', $this->organization->getKey())
            ->where('invoices.book_id', $this->book->getKey())
            ->where('invoices.direction', 'customer')->where('invoices.status', 'posted')
            ->where('invoice_journals.status', 'posted')->where('invoices.effective_on', '<=', $date)
            ->where('invoices.due_on', '<', $date)
            ->get(['invoices.id', 'invoices.amount_rial']);
        $independentOverdue = 0;
        foreach ($eligibleInvoices as $invoice) {
            $postedAllocations = DB::table('p10_allocations AS allocations')
                ->join('p10_treasury_movements AS movements', function ($join): void {
                    $join->on('movements.organization_id', '=', 'allocations.organization_id')
                        ->on('movements.book_id', '=', 'allocations.book_id')
                        ->on('movements.id', '=', 'allocations.treasury_movement_id');
                })
                ->join('accounting_journals AS journals', function ($join): void {
                    $join->on('journals.organization_id', '=', 'allocations.organization_id')
                        ->on('journals.book_id', '=', 'allocations.book_id')
                        ->on('journals.id', '=', 'allocations.journal_id');
                })
                ->where('allocations.organization_id', $this->organization->getKey())
                ->where('allocations.book_id', $this->book->getKey())
                ->where('allocations.invoice_id', $invoice->id)
                ->where('allocations.direction', 'customer')->where('movements.direction', 'customer_receipt')
                ->where('movements.effective_on', '<=', $date)->where('journals.status', 'posted')
                ->sum('allocations.amount_rial');
            $balance = (int) $invoice->amount_rial - (int) $postedAllocations;
            if ($balance > 0) {
                $independentOverdue += $balance;
            }
        }

        $summary = $this->getJson('/api/v1/dashboard?book_id='.$this->book->getKey().'&as_of_date='.$date.'&currency=IRR')
            ->assertOk()->json('data');

        self::assertSame((string) $independentSales, $summary['metrics']['net_sales']['total_rial']);
        self::assertSame('1700000', $summary['metrics']['net_sales']['total_rial']);
        self::assertSame((string) $independentOverdue, $summary['metrics']['overdue_receivables']['total_rial']);
        self::assertSame('900001', $summary['metrics']['overdue_receivables']['total_rial']);
        self::assertSame('2026-11-24 23:59:59 +03:30 Asia/Tehran', $summary['cutoff_local']);
        self::assertSame((string) $customerInvoice['id'], (string) $beforeCutoff['invoice']['id']);
        self::assertSame('2026-11-24', $dueOnCutoff['due_on']);
        self::assertSame('2026-11-25', $futureInvoice['effective_on']);

        $toman = $this->getJson('/api/v1/dashboard?book_id='.$this->book->getKey().'&as_of_date='.$date.'&currency=TOMAN')
            ->assertOk()->json('data');
        self::assertSame('170000', $toman['metrics']['net_sales']['display_amount']);
        self::assertSame('90000.1', $toman['metrics']['overdue_receivables']['display_amount']);

        $salesDetails = $this->getJson('/api/v1/dashboard/metrics/net-sales?book_id='.$this->book->getKey().'&as_of_date='.$date.'&currency=IRR')
            ->assertOk()->json('data');
        self::assertSame(4, $salesDetails['pagination']['total_records']);
        self::assertSame('1700000', $salesDetails['reconciliation']['total_rial']);
        self::assertSame('1700000', (string) array_sum(array_map(fn (array $row): int => (int) $row['amount_rial'], $salesDetails['records'])));

        $overdueDetails = $this->getJson('/api/v1/dashboard/metrics/overdue-receivables?book_id='.$this->book->getKey().'&as_of_date='.$date.'&currency=TOMAN')
            ->assertOk()->json('data');
        self::assertSame(2, $overdueDetails['pagination']['total_records']);
        self::assertSame('900001', $overdueDetails['reconciliation']['total_rial']);
        self::assertSame('90000.1', $overdueDetails['reconciliation']['display_amount']);
        self::assertTrue(collect($overdueDetails['records'])->every(fn (array $row): bool => (int) $row['outstanding_rial'] > 0));
    }

    public function test_stock_and_approval_tiles_reconstruct_end_of_day_state_and_paginate_every_source_row(): void
    {
        $this->postJson('/api/v1/stock/operations', [
            'operation_type' => 'opening', 'product_id' => $this->product->getKey(), 'quantity' => '10.000',
            'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->location->getKey(),
        ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertCreated();
        [$order, $line] = $this->makeSalesOrder('P11-STOCK-HISTORY', '100000', '4.000');
        $reserved = $this->postJson('/api/v1/sales-orders/'.$order->getKey().'/lines/'.$line->getKey().'/reservations', [
            'quantity' => '4.000', 'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->location->getKey(),
        ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertCreated()->json('data');
        $reservationId = $reserved['lines'][0]['fulfillment']['reservations'][0]['id'];

        Carbon::setTestNow(Carbon::parse('2026-11-24 20:30:00', 'UTC'));
        $delivered = $this->postJson('/api/v1/sales-orders/'.$order->getKey().'/lines/'.$line->getKey().'/deliveries', [
            'reservation_id' => $reservationId, 'quantity' => '2.000',
        ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertCreated()->json('data');
        $this->postJson('/api/v1/sales-orders/'.$order->getKey().'/lines/'.$line->getKey().'/cancel-remainder', [], $this->csrfHeaders())->assertOk();
        $this->postJson('/api/v1/stock/operations', [
            'operation_type' => 'receipt', 'product_id' => $this->product->getKey(), 'quantity' => '3.000',
            'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->location->getKey(),
        ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertCreated();

        Carbon::setTestNow(Carbon::parse('2026-11-24 19:10:00', 'UTC'));
        $stillPending = $this->createPurchaseRequest('P11 still awaiting approval');

        Carbon::setTestNow(Carbon::parse('2026-11-24 20:10:00', 'UTC'));
        $approvedAfterCutoff = $this->createPurchaseRequest('P11 approval after cutoff');
        Carbon::setTestNow(Carbon::parse('2026-11-24 20:30:00', 'UTC'));
        $this->asApprover();
        $this->postJson('/api/v1/purchase-requests/'.$approvedAfterCutoff['id'].'/approve', [], $this->csrfHeaders())->assertOk();
        $this->asEditor();
        $submittedAfterCutoff = $this->createPurchaseDraft('P11 submitted after cutoff');
        $this->postJson('/api/v1/purchase-requests/'.$submittedAfterCutoff['id'].'/submit', [], $this->csrfHeaders())->assertOk();

        Carbon::setTestNow(Carbon::parse('2026-11-24 19:30:00', 'UTC'));
        $approvedBeforeCutoff = $this->createPurchaseRequest('P11 approved before cutoff');
        $this->asApprover();
        $this->postJson('/api/v1/purchase-requests/'.$approvedBeforeCutoff['id'].'/approve', [], $this->csrfHeaders())->assertOk();
        $this->asEditor();

        Carbon::setTestNow(Carbon::parse('2026-11-24 19:00:00', 'UTC'));
        $purchasing = app(PurchasingService::class);
        for ($index = 1; $index <= 27; $index++) {
            $draft = $purchasing->createDraft($this->organization, $this->editor, 'P11 pagination '.$index, [
                ['product_id' => $this->product->getKey(), 'quantity' => '1.000'],
            ]);
            $purchasing->submitRequest($this->organization, $this->editor, (int) $draft->getKey());
        }

        $timestampCutoff = '2026-11-24 20:29:59';
        $expectedPending = DB::table('purchase_requests')
            ->where('organization_id', $this->organization->getKey())
            ->whereIn('status', ['submitted', 'approved', 'converted'])
            ->whereNotNull('submitted_at')->where('submitted_at', '<=', $timestampCutoff)
            ->where(fn ($query) => $query->whereNull('approved_at')->orWhere('approved_at', '>', $timestampCutoff))
            ->count();
        $summary = $this->getJson('/api/v1/dashboard?book_id='.$this->book->getKey().'&as_of_date=2026-11-24')
            ->assertOk()->json('data');

        self::assertSame('2026-11-24 23:59:59 +03:30 Asia/Tehran', $summary['cutoff_local']);
        self::assertSame('6.000', $summary['metrics']['available_stock']['unit_totals'][0]['quantity']);
        self::assertSame(1, $summary['metrics']['available_stock']['record_count']);
        self::assertSame($expectedPending, $summary['metrics']['pending_purchase_approvals']['count']);
        self::assertSame(29, $summary['metrics']['pending_purchase_approvals']['count']);
        self::assertSame($reservationId, $delivered['lines'][0]['fulfillment']['reservations'][0]['id']);
        self::assertSame('2.000', $delivered['lines'][0]['fulfillment']['deliveries'][0]['quantity']);

        $stockDetails = $this->getJson('/api/v1/dashboard/metrics/available-stock?book_id='.$this->book->getKey().'&as_of_date=2026-11-24')
            ->assertOk()->json('data');
        self::assertSame(1, $stockDetails['pagination']['total_records']);
        self::assertSame('6.000', $stockDetails['records'][0]['available_quantity']);
        self::assertSame('10.000', $stockDetails['records'][0]['physical_quantity']);
        self::assertSame('4.000', $stockDetails['records'][0]['reserved_quantity']);

        $firstPage = $this->getJson('/api/v1/dashboard/metrics/pending-purchase-approvals?book_id='.$this->book->getKey().'&as_of_date=2026-11-24&page=1')
            ->assertOk()->json('data');
        $secondPage = $this->getJson('/api/v1/dashboard/metrics/pending-purchase-approvals?book_id='.$this->book->getKey().'&as_of_date=2026-11-24&page=2')
            ->assertOk()->json('data');
        self::assertSame(29, $firstPage['pagination']['total_records']);
        self::assertCount(25, $firstPage['records']);
        self::assertCount(4, $secondPage['records']);
        self::assertCount(29, [...$firstPage['records'], ...$secondPage['records']]);
        self::assertTrue(collect([...$firstPage['records'], ...$secondPage['records']])->contains(
            fn (array $record): bool => $record['id'] === $stillPending['id'],
        ));
    }

    public function test_dashboard_books_and_records_are_scoped_to_the_active_organization(): void
    {
        $emptyLocalBook = AccountingBook::query()->create([
            'organization_id' => $this->organization->getKey(), 'code' => 'P11-EMPTY-BOOK',
            'name' => 'دفتر خالی سازمان فعال', 'currency_code' => 'IRR', 'currency_scale' => 0, 'time_zone' => 'Asia/Tehran',
        ]);
        $foreignBook = AccountingBook::query()->create([
            'organization_id' => $this->foreignOrganization->getKey(), 'code' => 'P11-FOREIGN',
            'name' => 'دفتر بیرونی', 'currency_code' => 'IRR', 'currency_scale' => 0, 'time_zone' => 'Asia/Tehran',
        ]);

        $options = $this->getJson('/api/v1/dashboard/options')->assertOk()->json('data');
        self::assertTrue(collect($options['books'])->contains(fn (array $candidate): bool => $candidate['id'] === $this->book->getKey()));
        $emptyBookSummary = $this->getJson('/api/v1/dashboard?book_id='.$emptyLocalBook->getKey().'&as_of_date=2026-11-24')
            ->assertOk()->json('data');
        self::assertSame('0', $emptyBookSummary['metrics']['net_sales']['total_rial']);
        self::assertSame('0', $emptyBookSummary['metrics']['overdue_receivables']['total_rial']);
        $this->getJson('/api/v1/dashboard?book_id='.$foreignBook->getKey().'&as_of_date=2026-11-24')->assertNotFound();

        $this->postJson('/api/v1/active-organization', ['organization_id' => $this->foreignOrganization->getKey()], $this->csrfHeaders())
            ->assertOk()->assertJsonPath('active_organization.id', $this->foreignOrganization->getKey());
        $summary = $this->getJson('/api/v1/dashboard?book_id='.$foreignBook->getKey().'&as_of_date=2026-11-24')->assertOk()->json('data');
        self::assertSame($this->foreignOrganization->getKey(), $summary['organization_id']);
        self::assertSame('0', $summary['metrics']['net_sales']['total_rial']);
        self::assertSame(0, $summary['metrics']['pending_purchase_approvals']['count']);
        $this->getJson('/api/v1/dashboard?book_id='.$this->book->getKey().'&as_of_date=2026-11-24')->assertNotFound();
    }

    public function test_dashboard_denies_an_authenticated_user_without_an_active_organization_membership(): void
    {
        $outsider = User::factory()->create();
        $this->actingAs($outsider)->withSession([]);

        $this->getJson('/api/v1/dashboard/options')->assertForbidden();
        $this->get('/dashboard')->assertRedirect(route('access.denied'));
        $this->get('/access-denied')->assertOk()->assertSee('data-page="denied"', false);
    }

    public function test_walkthrough_provisioning_replays_without_duplicating_workflow_records(): void
    {
        $arguments = [
            '--organization-id' => (string) $this->organization->getKey(),
            '--book-id' => (string) $this->book->getKey(),
        ];

        $this->runWalkthroughProvisioner($arguments);
        $first = $this->walkthroughSnapshot();
        $this->runWalkthroughProvisioner($arguments);
        $second = $this->walkthroughSnapshot();

        self::assertSame($first, $second);
        self::assertSame(1, $first['sale_orders']);
        self::assertSame(1, $first['sales_deliveries']);
        self::assertSame(1, $first['purchase_orders']);
        self::assertSame(1, $first['purchase_receipts']);
        self::assertSame(2, $first['p10_invoices']);
        self::assertSame(2, $first['p10_settlements']);
        self::assertSame(2, $first['purchase_requests']);
        self::assertSame(['inbound' => 11000, 'outbound' => 1000, 'movements' => 3], $first['stock']);

        $summary = $this->getJson('/api/v1/dashboard?book_id='.$this->book->getKey().'&as_of_date=2026-11-24&currency=IRR')
            ->assertOk()->json('data');
        self::assertSame('1000000', $summary['metrics']['net_sales']['total_rial']);
        self::assertSame('600000', $summary['metrics']['overdue_receivables']['total_rial']);
        self::assertSame(1, $summary['metrics']['pending_purchase_approvals']['count']);
        self::assertSame('10.000', $summary['metrics']['available_stock']['unit_totals'][0]['quantity']);
    }

    /** @return array{array<string, mixed>, SalesOrder, SalesOrderLine, array<string, mixed>} */
    private function createCustomerInvoice(string $code, string $amountToman, string $effectiveOn, string $dueOn): array
    {
        [$order, $line, $delivery] = $this->deliveredSalesOrder($code, $amountToman);
        $invoice = $this->postJson('/api/v1/settlements/sales-orders/'.$order->getKey().'/customer-invoices', [
            'book_id' => $this->book->getKey(), 'effective_on' => $effectiveOn, 'due_on' => $dueOn,
            'lines' => [[
                'sales_order_line_id' => $line->getKey(), 'sales_order_delivery_id' => $delivery['id'], 'quantity_milli' => '1000',
            ]],
        ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertCreated()->json('data');

        return [$invoice, $order, $line, $delivery];
    }

    /** @return array<string, mixed> */
    private function settleCustomerInvoice(int $invoiceId, string $amountRial, string $effectiveOn): array
    {
        return $this->postJson('/api/v1/settlements/customer-invoices/'.$invoiceId.'/receipts', [
            'amount_rial' => $amountRial, 'effective_on' => $effectiveOn, 'reference' => 'P11 synthetic report test',
        ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertCreated()->json();
    }

    private function createSupplierInvoice(string $code, string $effectiveOn, string $dueOn): void
    {
        $request = $this->createPurchaseDraft($code.' request');
        $this->postJson('/api/v1/purchase-requests/'.$request['id'].'/submit', [], $this->csrfHeaders())->assertOk();
        $this->asApprover();
        $this->postJson('/api/v1/purchase-requests/'.$request['id'].'/approve', [], $this->csrfHeaders())->assertOk();
        $this->asEditor();
        $order = $this->postJson('/api/v1/purchase-requests/'.$request['id'].'/convert', [
            'supplier_party_id' => $this->supplier->getKey(),
            'lines' => [['source_request_line_id' => $request['lines'][0]['id'], 'unit_price_rial' => '500000']],
        ], $this->csrfHeaders())->assertCreated()->json('data');
        $receipt = $this->postJson('/api/v1/purchase-orders/'.$order['id'].'/lines/'.$order['lines'][0]['id'].'/receipts', [
            'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->location->getKey(), 'quantity' => '1.000',
        ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertCreated()->json('data');
        $this->postJson('/api/v1/settlements/purchase-orders/'.$order['id'].'/supplier-invoices', [
            'book_id' => $this->book->getKey(), 'effective_on' => $effectiveOn, 'due_on' => $dueOn,
            'lines' => [[
                'purchase_order_line_id' => $order['lines'][0]['id'],
                'purchase_receipt_id' => $receipt['lines'][0]['receipts'][0]['id'],
                'quantity_milli' => '1000',
            ]],
        ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertCreated();
    }

    /** @return array<string, mixed> */
    private function createPurchaseRequest(string $title): array
    {
        $request = $this->createPurchaseDraft($title);
        $this->postJson('/api/v1/purchase-requests/'.$request['id'].'/submit', [], $this->csrfHeaders())->assertOk();

        return $request;
    }

    /** @return array<string, mixed> */
    private function createPurchaseDraft(string $title): array
    {
        return $this->postJson('/api/v1/purchase-requests', [
            'title' => $title, 'lines' => [['product_id' => $this->product->getKey(), 'quantity' => '1.000']],
        ], $this->csrfHeaders())->assertCreated()->json('data');
    }

    private function asApprover(): void
    {
        $this->actingAs($this->approver)->withSession(['active_organization_id' => $this->organization->getKey()]);
    }

    private function asEditor(): void
    {
        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organization->getKey()]);
    }

    /** @return array{SalesOrder, SalesOrderLine, array<string, mixed>} */
    private function deliveredSalesOrder(string $code, string $amountToman, string $quantity = '1.000'): array
    {
        [$order, $line] = $this->makeSalesOrder($code, $amountToman, $quantity);
        $operationType = DB::table('inventory_movements')
            ->where('organization_id', $this->organization->getKey())
            ->where('product_id', $this->product->getKey())
            ->where('location_id', $this->location->getKey())
            ->exists() ? 'receipt' : 'opening';
        $this->postJson('/api/v1/stock/operations', [
            'operation_type' => $operationType, 'product_id' => $this->product->getKey(), 'quantity' => '2.000',
            'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->location->getKey(),
        ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertCreated();
        $reserved = $this->postJson('/api/v1/sales-orders/'.$order->getKey().'/lines/'.$line->getKey().'/reservations', [
            'quantity' => $quantity, 'warehouse_id' => $this->warehouse->getKey(), 'location_id' => $this->location->getKey(),
        ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertCreated()->json('data');
        $reservationId = $reserved['lines'][0]['fulfillment']['reservations'][0]['id'];
        $delivered = $this->postJson('/api/v1/sales-orders/'.$order->getKey().'/lines/'.$line->getKey().'/deliveries', [
            'reservation_id' => $reservationId, 'quantity' => $quantity,
        ], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])->assertCreated()->json('data');

        return [$order, $line, $delivered['lines'][0]['fulfillment']['deliveries'][0]];
    }

    /** @return array{SalesOrder, SalesOrderLine} */
    private function makeSalesOrder(string $code, string $totalToman, string $quantity = '1.000'): array
    {
        $customer = $this->makeParty($this->organization, $code.'-CUS', 'مشتری '.$code, 'customer');
        $lead = Lead::query()->create([
            'organization_id' => $this->organization->getKey(), 'party_id' => $customer->getKey(), 'code' => $code.'-LEAD', 'title' => 'سرنخ '.$code,
        ]);
        $priceList = PriceList::query()->create(['organization_id' => $this->organization->getKey(), 'code' => $code.'-PRICE', 'name' => 'فهرست '.$code]);
        $quote = SalesQuote::query()->create([
            'organization_id' => $this->organization->getKey(), 'lead_id' => $lead->getKey(), 'customer_party_id' => $customer->getKey(),
            'price_list_id' => $priceList->getKey(), 'code' => $code.'-QUOTE', 'status' => 'confirmed',
            'lead_code_snapshot' => $lead->code, 'lead_title_snapshot' => $lead->title,
            'customer_code_snapshot' => $customer->code, 'customer_name_snapshot' => $customer->display_name,
            'price_list_code_snapshot' => $priceList->code, 'price_list_name_snapshot' => $priceList->name,
            'total_toman' => $totalToman, 'confirmed_at' => now(),
        ]);
        $unitPriceTenths = $quantity === '1.000' ? $totalToman.'0' : '250000';
        $quoteLine = SalesQuoteLine::query()->create([
            'organization_id' => $this->organization->getKey(), 'quote_id' => $quote->getKey(),
            'product_id' => $this->product->getKey(), 'unit_id' => $this->unit->getKey(),
            'product_code_snapshot' => $this->product->code, 'product_name_snapshot' => $this->product->name,
            'unit_code_snapshot' => $this->unit->code, 'unit_name_snapshot' => $this->unit->name, 'unit_symbol_snapshot' => $this->unit->symbol,
            'quantity' => $quantity, 'unit_price_toman_tenths' => $unitPriceTenths, 'discount_basis_points' => 0,
            'line_net_toman' => $totalToman,
        ]);
        $order = SalesOrder::query()->create([
            'organization_id' => $this->organization->getKey(), 'source_quote_id' => $quote->getKey(),
            'lead_id' => $lead->getKey(), 'customer_party_id' => $customer->getKey(), 'code' => $code, 'status' => 'confirmed',
            'lead_code_snapshot' => $lead->code, 'lead_title_snapshot' => $lead->title,
            'customer_code_snapshot' => $customer->code, 'customer_name_snapshot' => $customer->display_name,
            'price_list_code_snapshot' => $priceList->code, 'price_list_name_snapshot' => $priceList->name,
            'total_toman' => $totalToman, 'confirmed_at' => now(),
        ]);
        $line = SalesOrderLine::query()->create([
            'organization_id' => $this->organization->getKey(), 'sales_order_id' => $order->getKey(),
            'source_quote_line_id' => $quoteLine->getKey(), 'product_id' => $this->product->getKey(), 'unit_id' => $this->unit->getKey(),
            'product_code_snapshot' => $this->product->code, 'product_name_snapshot' => $this->product->name,
            'unit_code_snapshot' => $this->unit->code, 'unit_name_snapshot' => $this->unit->name, 'unit_symbol_snapshot' => $this->unit->symbol,
            'quantity' => $quantity, 'unit_price_toman_tenths' => $unitPriceTenths, 'discount_basis_points' => 0,
            'line_net_toman' => $totalToman,
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

    private function walkthroughSnapshot(): array
    {
        $product = Product::query()->where('organization_id', $this->organization->getKey())->where('code', 'P11-WALKTHROUGH-ITEM')->firstOrFail();
        $lead = Lead::query()->where('organization_id', $this->organization->getKey())->where('title', 'P11 walkthrough sale')->firstOrFail();
        $quote = SalesQuote::query()->where('organization_id', $this->organization->getKey())->where('lead_id', $lead->getKey())->firstOrFail();
        $order = SalesOrder::query()->where('organization_id', $this->organization->getKey())->where('source_quote_id', $quote->getKey())->firstOrFail();
        $line = SalesOrderLine::query()->where('organization_id', $this->organization->getKey())->where('sales_order_id', $order->getKey())->firstOrFail();
        $purchase = PurchaseRequest::query()->where('organization_id', $this->organization->getKey())->where('title', 'P11 walkthrough purchase')->firstOrFail();
        $purchaseOrder = PurchaseOrder::query()->where('organization_id', $this->organization->getKey())->where('source_request_id', $purchase->getKey())->firstOrFail();
        $stock = DB::table('inventory_movements')->where('organization_id', $this->organization->getKey())->where('product_id', $product->getKey())
            ->selectRaw('COALESCE(SUM(CASE WHEN direction = "inbound" THEN quantity_milli ELSE 0 END), 0) AS inbound_milli')
            ->selectRaw('COALESCE(SUM(CASE WHEN direction = "outbound" THEN quantity_milli ELSE 0 END), 0) AS outbound_milli')
            ->selectRaw('COUNT(*) AS movement_count')->first();

        return [
            'sale_orders' => SalesOrder::query()->where('organization_id', $this->organization->getKey())->where('source_quote_id', $quote->getKey())->count(),
            'sales_deliveries' => DB::table('sales_order_deliveries')->where('organization_id', $this->organization->getKey())->where('sales_order_line_id', $line->getKey())->count(),
            'purchase_orders' => PurchaseOrder::query()->where('organization_id', $this->organization->getKey())->where('source_request_id', $purchase->getKey())->count(),
            'purchase_receipts' => DB::table('purchase_receipts')->where('organization_id', $this->organization->getKey())->where('purchase_order_id', $purchaseOrder->getKey())->count(),
            'p10_invoices' => P10Invoice::query()->where('organization_id', $this->organization->getKey())->whereIn('idempotency_key', [
                'a11f1100-0000-4000-8000-000000000105', 'a11f1100-0000-4000-8000-000000000107',
            ])->count(),
            'p10_settlements' => P10TreasuryMovement::query()->where('organization_id', $this->organization->getKey())->whereIn('idempotency_key', [
                'a11f1100-0000-4000-8000-000000000106', 'a11f1100-0000-4000-8000-000000000108',
            ])->count(),
            'purchase_requests' => PurchaseRequest::query()->where('organization_id', $this->organization->getKey())->whereIn('title', [
                'P11 walkthrough purchase', 'P11 dashboard pending approval',
            ])->count(),
            'stock' => [
                'inbound' => (int) $stock->inbound_milli,
                'outbound' => (int) $stock->outbound_milli,
                'movements' => (int) $stock->movement_count,
            ],
        ];
    }

    private function runWalkthroughProvisioner(array $arguments): void
    {
        $exitCode = Artisan::call('p11:provision-walkthrough', $arguments);
        self::assertSame(0, $exitCode, Artisan::output());
    }
}
