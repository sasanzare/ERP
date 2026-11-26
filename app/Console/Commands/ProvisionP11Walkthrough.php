<?php

namespace App\Console\Commands;

use App\Http\Controllers\Api\V1\LeadController;
use App\Http\Controllers\Api\V1\SalesQuoteController;
use App\Models\AccountingAccount;
use App\Models\AccountingBook;
use App\Models\Lead;
use App\Models\Location;
use App\Models\Organization;
use App\Models\OrganizationMembership;
use App\Models\P10AccountingProfile;
use App\Models\P10Invoice;
use App\Models\P10TreasuryMovement;
use App\Models\Party;
use App\Models\PriceList;
use App\Models\PriceListEntry;
use App\Models\Product;
use App\Models\PurchaseRequest;
use App\Models\SalesOrder;
use App\Models\SalesQuote;
use App\Models\Unit;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\Purchasing\PurchasingService;
use App\Services\Sales\SalesFulfillmentService;
use App\Services\Settlements\P10SettlementService;
use App\Services\Stock\StockService;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

class ProvisionP11Walkthrough extends Command
{
    protected $signature = 'p11:provision-walkthrough {--organization-id= : Testing only: existing synthetic organization ID} {--book-id= : Testing only: existing synthetic book ID}';

    protected $description = 'Provision the repeatable local P11 synthetic sale, purchase, settlement, and dashboard fixtures.';

    private const BASELINE_KEY = 'a11f1100-0000-4000-8000-000000000101';

    private const RESERVATION_KEY = 'a11f1100-0000-4000-8000-000000000102';

    private const DELIVERY_KEY = 'a11f1100-0000-4000-8000-000000000103';

    private const PURCHASE_RECEIPT_KEY = 'a11f1100-0000-4000-8000-000000000104';

    private const CUSTOMER_INVOICE_KEY = 'a11f1100-0000-4000-8000-000000000105';

    private const CUSTOMER_RECEIPT_KEY = 'a11f1100-0000-4000-8000-000000000106';

    private const SUPPLIER_INVOICE_KEY = 'a11f1100-0000-4000-8000-000000000107';

    private const SUPPLIER_PAYMENT_KEY = 'a11f1100-0000-4000-8000-000000000108';

    public function handle(
        StockService $stock,
        SalesFulfillmentService $fulfillment,
        PurchasingService $purchasing,
        P10SettlementService $settlements,
    ): int {
        try {
            [$organization, $book] = $this->resolveTarget();
            $this->assertSyntheticPostingBoundary($organization, $book);
            $reportDate = CarbonImmutable::now($book->time_zone)->toDateString();
            $existingCustomerInvoice = P10Invoice::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $book->getKey())
                ->where('idempotency_key', self::CUSTOMER_INVOICE_KEY)
                ->first();
            $customerEffectiveOn = $existingCustomerInvoice?->effective_on->format('Y-m-d')
                ?? CarbonImmutable::parse($reportDate, $book->time_zone)->subDays(4)->toDateString();
            $customerDueOn = $existingCustomerInvoice?->due_on->format('Y-m-d')
                ?? CarbonImmutable::parse($reportDate, $book->time_zone)->subDays(2)->toDateString();
            $existingSupplierInvoice = P10Invoice::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $book->getKey())
                ->where('idempotency_key', self::SUPPLIER_INVOICE_KEY)
                ->first();
            $supplierEffectiveOn = $existingSupplierInvoice?->effective_on->format('Y-m-d')
                ?? CarbonImmutable::parse($reportDate, $book->time_zone)->subDays(4)->toDateString();
            $supplierDueOn = $existingSupplierInvoice?->due_on->format('Y-m-d')
                ?? CarbonImmutable::parse($reportDate, $book->time_zone)->addDays(30)->toDateString();
            if ($existingCustomerInvoice === null) {
                $this->assertOpenPeriodCovers($book, $customerEffectiveOn);
            }
            if ($existingSupplierInvoice === null) {
                $this->assertOpenPeriodCovers($book, $supplierEffectiveOn);
            }

            $editorIds = OrganizationMembership::query()
                ->where('organization_id', $organization->getKey())
                ->where('role', 'editor')
                ->orderBy('user_id')
                ->pluck('user_id');
            $editors = User::query()->whereIn('id', $editorIds)->orderBy('id')->get();

            if ($editors->count() < 2) {
                throw new RuntimeException('P11 walkthrough requires two organization editors for independent purchase approval.');
            }

            $requester = $editors[0];
            $approver = $editors[1];
            $customer = $this->firstPartyWithRole($organization, 'customer');
            $supplier = $this->firstPartyWithRole($organization, 'supplier');
            $unit = Unit::query()->where('organization_id', $organization->getKey())->where('code', 'EA')->first()
                ?? Unit::query()->where('organization_id', $organization->getKey())->where('is_active', true)->orderBy('id')->first();

            if ($unit === null || ! $unit->is_active) {
                throw new RuntimeException('P11 walkthrough requires an active organization-owned EA base unit.');
            }

            $product = $this->firstOrCreateWalkthroughProduct($organization, $unit);
            $warehouse = $this->firstOrCreateWalkthroughWarehouse($organization);
            $location = $this->firstOrCreateWalkthroughLocation($organization, $warehouse);
            $priceList = $this->firstOrCreateWalkthroughPriceList($organization, $product);

            $saleOrder = $this->provisionSalesOrder($organization, $requester, $customer, $product, $priceList);
            $salesLine = $saleOrder->lines()->orderBy('id')->firstOrFail();
            $baseline = $stock->postOperation($organization, $requester, [
                'operation_type' => 'opening',
                'product_id' => (int) $product->getKey(),
                'quantity' => '10.000',
                'warehouse_id' => (int) $warehouse->getKey(),
                'location_id' => (int) $location->getKey(),
                'idempotency_key' => self::BASELINE_KEY,
            ]);

            $reservation = $fulfillment->reserveLine($organization, $requester, (int) $saleOrder->getKey(), (int) $salesLine->getKey(), [
                'quantity' => '1.000',
                'warehouse_id' => (int) $warehouse->getKey(),
                'location_id' => (int) $location->getKey(),
                'idempotency_key' => self::RESERVATION_KEY,
            ]);
            $reservationId = (int) $reservation['record']->getKey();
            $delivery = $fulfillment->deliverLine(
                $organization,
                $requester,
                (int) $saleOrder->getKey(),
                (int) $salesLine->getKey(),
                $reservationId,
                '1.000',
                self::DELIVERY_KEY,
            );
            $deliveryId = (int) $delivery['record']->getKey();

            $customerInvoice = $settlements->postCustomerInvoice(
                $organization,
                $requester,
                (int) $saleOrder->getKey(),
                (int) $book->getKey(),
                $customerEffectiveOn,
                $customerDueOn,
                [[
                    'sales_order_line_id' => (int) $salesLine->getKey(),
                    'sales_order_delivery_id' => $deliveryId,
                    'quantity_milli' => '1000',
                ]],
                self::CUSTOMER_INVOICE_KEY,
            );
            $existingCustomerReceipt = P10TreasuryMovement::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $book->getKey())
                ->where('direction', 'customer_receipt')
                ->where('idempotency_key', self::CUSTOMER_RECEIPT_KEY)
                ->first();
            $customerReceiptEffectiveOn = $existingCustomerReceipt?->effective_on->format('Y-m-d') ?? $reportDate;
            $customerReceipt = $settlements->settleInvoice(
                $organization,
                $requester,
                (int) $customerInvoice['invoice']->getKey(),
                'customer',
                '400000',
                (string) $customerReceiptEffectiveOn,
                'P11 walkthrough customer collection',
                self::CUSTOMER_RECEIPT_KEY,
            );

            $purchaseRequest = $this->provisionPurchaseJourney($organization, $requester, $approver, $product, $supplier, $purchasing);
            $purchaseOrder = $purchaseRequest->purchaseOrder()->firstOrFail();
            $purchaseLine = $purchaseOrder->lines()->orderBy('id')->firstOrFail();
            $purchaseReceipt = $purchasing->receiveLine(
                $organization,
                $approver,
                (int) $purchaseOrder->getKey(),
                (int) $purchaseLine->getKey(),
                (int) $warehouse->getKey(),
                (int) $location->getKey(),
                '1.000',
                self::PURCHASE_RECEIPT_KEY,
            );
            $purchaseReceiptRecord = $purchaseReceipt['receipt'];

            $supplierInvoice = $settlements->postSupplierInvoice(
                $organization,
                $approver,
                (int) $purchaseOrder->getKey(),
                (int) $book->getKey(),
                $supplierEffectiveOn,
                $supplierDueOn,
                [[
                    'purchase_order_line_id' => (int) $purchaseLine->getKey(),
                    'purchase_receipt_id' => (int) $purchaseReceiptRecord->getKey(),
                    'quantity_milli' => '1000',
                ]],
                self::SUPPLIER_INVOICE_KEY,
            );
            $existingSupplierPayment = P10TreasuryMovement::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $book->getKey())
                ->where('direction', 'supplier_payment')
                ->where('idempotency_key', self::SUPPLIER_PAYMENT_KEY)
                ->first();
            $supplierPaymentEffectiveOn = $existingSupplierPayment?->effective_on->format('Y-m-d') ?? $reportDate;
            $supplierPayment = $settlements->settleInvoice(
                $organization,
                $approver,
                (int) $supplierInvoice['invoice']->getKey(),
                'supplier',
                '200000',
                (string) $supplierPaymentEffectiveOn,
                'P11 walkthrough supplier payment',
                self::SUPPLIER_PAYMENT_KEY,
            );

            $pendingRequest = $this->provisionPendingRequest($organization, $requester, $product, $purchasing);

            $this->info('P11 synthetic walkthrough is ready; every retry reused the same source and idempotency keys.');
            $this->line('Organization: '.$organization->slug.' (ID '.$organization->getKey().')');
            $this->line('Book: '.$book->code.' (ID '.$book->getKey().') · '.$book->time_zone.' · synthetic_test');
            $this->line('Report date: '.$reportDate.'; customer invoice: 1000000 IRR; collection: 400000 IRR; open: 600000 IRR / 60000 Toman.');
            $this->line('Supplier invoice: 500000 IRR; payment: 200000 IRR; open: 300000 IRR.');
            $this->line('Sale order: '.$saleOrder->code.'; issue movement: '.$delivery['record']->movement->getKey().'; baseline operation: '.$baseline['record']->getKey().'.');
            $this->line('Purchase request: '.$purchaseRequest->code.'; order: '.$purchaseOrder->code.'; receipt: '.$purchaseReceiptRecord->getKey().'.');
            $this->line('Pending request: '.$pendingRequest->code.'; available stock for '.$product->code.' at '.$location->code.' after both journeys: 10.000 EA.');
            $this->line('Settlement links: customer movement '.$customerReceipt['movement']->getKey().'; supplier movement '.$supplierPayment['movement']->getKey().'.');

            return self::SUCCESS;
        } catch (Throwable $exception) {
            $this->error('P11 walkthrough provisioning stopped: '.$exception->getMessage());

            return self::FAILURE;
        }
    }

    /** @return array{Organization, AccountingBook} */
    private function resolveTarget(): array
    {
        $environment = app()->environment();
        $database = DB::connection()->getDatabaseName();

        if ($environment === 'local') {
            if (! config('app.debug') || $database !== 'erp_dev') {
                throw new RuntimeException('Local provisioning requires APP_DEBUG=true and the exact erp_dev schema.');
            }

            $organization = Organization::query()->where('slug', 'legacy-local')->firstOrFail();
            $book = AccountingBook::query()
                ->where('organization_id', $organization->getKey())
                ->where('code', 'P10-SYNTH-BROWSER')
                ->firstOrFail();
            if (($this->option('organization-id') !== null && (int) $this->option('organization-id') !== (int) $organization->getKey())
                || ($this->option('book-id') !== null && (int) $this->option('book-id') !== (int) $book->getKey())) {
                throw new RuntimeException('Local provisioning is restricted to legacy-local / P10-SYNTH-BROWSER.');
            }

            return [$organization, $book];
        }

        if ($environment !== 'testing' || $database !== 'erp_test') {
            throw new RuntimeException('P11 walkthrough provisioning is allowed only in local erp_dev or guarded testing erp_test.');
        }

        $organizationId = filter_var($this->option('organization-id'), FILTER_VALIDATE_INT);
        $bookId = filter_var($this->option('book-id'), FILTER_VALIDATE_INT);
        if ($organizationId === false || $organizationId < 1 || $bookId === false || $bookId < 1) {
            throw new RuntimeException('Testing requires explicit existing --organization-id and --book-id options.');
        }

        $organization = Organization::query()->findOrFail($organizationId);
        $book = AccountingBook::query()
            ->where('organization_id', $organization->getKey())
            ->findOrFail($bookId);

        return [$organization, $book];
    }

    private function assertSyntheticPostingBoundary(Organization $organization, AccountingBook $book): void
    {
        if (! str_starts_with($book->code, 'P10-SYNTH-') || $book->currency_code !== 'IRR' || (int) $book->currency_scale !== 0) {
            throw new RuntimeException('P11 provisioning requires an existing P10-SYNTH whole-Rial book.');
        }

        $profile = P10AccountingProfile::query()
            ->where('organization_id', $organization->getKey())
            ->where('book_id', $book->getKey())
            ->firstOrFail();
        if ($profile->status !== 'synthetic_test'
            || $profile->approval_reference !== null
            || $profile->approved_by !== null
            || $profile->approved_at !== null) {
            throw new RuntimeException('P11 provisioning will only use an unapproved synthetic_test profile.');
        }

        $accountMapping = [
            'customer_receivable_account_id' => ['1100', 'asset'],
            'customer_revenue_account_id' => ['4100', 'revenue'],
            'supplier_payable_account_id' => ['2100', 'liability'],
            'supplier_debit_account_id' => ['5100', 'expense'],
            'customer_treasury_account_id' => ['1010', 'asset'],
            'supplier_treasury_account_id' => ['1020', 'asset'],
        ];
        foreach ($accountMapping as $column => [$code, $category]) {
            $account = AccountingAccount::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $book->getKey())
                ->whereKey($profile->{$column})
                ->first();
            if ($account === null || $account->code !== $code || $account->category !== $category || ! $account->is_active || ! $account->is_postable) {
                throw new RuntimeException('The existing P10 synthetic profile no longer matches its verified ADR-008 account mapping.');
            }
        }

    }

    private function firstPartyWithRole(Organization $organization, string $role): Party
    {
        return Party::query()
            ->where('organization_id', $organization->getKey())
            ->whereHas('roles', fn ($query) => $query->where('organization_id', $organization->getKey())->where('role', $role))
            ->orderBy('id')
            ->firstOrFail();
    }

    private function firstOrCreateWalkthroughProduct(Organization $organization, Unit $unit): Product
    {
        $product = Product::query()->where('organization_id', $organization->getKey())->where('code', 'P11-WALKTHROUGH-ITEM')->first();
        if ($product === null) {
            return Product::query()->create([
                'organization_id' => $organization->getKey(), 'base_unit_id' => $unit->getKey(),
                'code' => 'P11-WALKTHROUGH-ITEM', 'name' => 'کالای نمایشی P11',
            ]);
        }

        if ((int) $product->base_unit_id !== (int) $unit->getKey()) {
            throw new RuntimeException('The existing P11 walkthrough product uses another base unit; it was left unchanged.');
        }

        return $product;
    }

    private function firstOrCreateWalkthroughWarehouse(Organization $organization): Warehouse
    {
        return Warehouse::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'P11-WALKTHROUGH-WH'],
            ['name' => 'انبار نمایشی P11'],
        );
    }

    private function firstOrCreateWalkthroughLocation(Organization $organization, Warehouse $warehouse): Location
    {
        $location = Location::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'P11-WALKTHROUGH-LOC'],
            ['warehouse_id' => $warehouse->getKey(), 'name' => 'مکان نمایشی P11'],
        );
        if ((int) $location->warehouse_id !== (int) $warehouse->getKey()) {
            throw new RuntimeException('The existing P11 walkthrough location belongs to another warehouse; it was left unchanged.');
        }

        return $location;
    }

    private function firstOrCreateWalkthroughPriceList(Organization $organization, Product $product): PriceList
    {
        $priceList = PriceList::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'P11-WALKTHROUGH-PRICE'],
            ['name' => 'فهرست قیمت نمایشی P11'],
        );
        $entry = PriceListEntry::query()->where('organization_id', $organization->getKey())
            ->where('price_list_id', $priceList->getKey())->where('product_id', $product->getKey())->first();

        if ($entry === null) {
            $entry = PriceListEntry::query()->create([
                'organization_id' => $organization->getKey(), 'price_list_id' => $priceList->getKey(),
                'product_id' => $product->getKey(), 'amount_rial' => '1000000',
            ]);
        } elseif ((string) $entry->amount_rial !== '1000000') {
            throw new RuntimeException('The P11 walkthrough price-list entry differs from its fixed synthetic amount; it was left unchanged.');
        }

        return $priceList;
    }

    private function provisionSalesOrder(
        Organization $organization,
        User $actor,
        Party $customer,
        Product $product,
        PriceList $priceList,
    ): SalesOrder {
        $lead = Lead::query()->where('organization_id', $organization->getKey())->where('title', 'P11 walkthrough sale')->first();
        if ($lead === null) {
            $this->invokeController(app(LeadController::class), 'store', $organization, $actor, [
                'title' => 'P11 walkthrough sale', 'party_id' => (int) $customer->getKey(),
            ]);
            $lead = Lead::query()->where('organization_id', $organization->getKey())->where('title', 'P11 walkthrough sale')->firstOrFail();
        } elseif ((int) $lead->party_id !== (int) $customer->getKey()) {
            throw new RuntimeException('The existing P11 sale lead uses another customer; it was left unchanged.');
        }

        $quote = SalesQuote::query()->where('organization_id', $organization->getKey())->where('lead_id', $lead->getKey())->orderBy('id')->first();
        if ($quote === null) {
            $this->invokeController(app(SalesQuoteController::class), 'store', $organization, $actor, [
                'price_list_id' => (int) $priceList->getKey(),
            ], [(int) $lead->getKey()]);
            $quote = SalesQuote::query()->where('organization_id', $organization->getKey())->where('lead_id', $lead->getKey())->orderBy('id')->firstOrFail();
        }

        if ((int) $quote->price_list_id !== (int) $priceList->getKey()) {
            throw new RuntimeException('The existing P11 sale quote uses another price list; it was left unchanged.');
        }

        if ($quote->status === 'draft' && ! $quote->lines()->exists()) {
            $this->invokeController(app(SalesQuoteController::class), 'addLine', $organization, $actor, [
                'product_id' => (int) $product->getKey(), 'quantity' => '1.000', 'discount' => '0.00',
            ], [(int) $quote->getKey()]);
        }

        if ($quote->status === 'draft') {
            $this->invokeController(app(SalesQuoteController::class), 'confirm', $organization, $actor, [], [(int) $quote->getKey()]);
            $quote->refresh();
        }

        if ($quote->status !== 'confirmed') {
            throw new RuntimeException('The P11 walkthrough quote is not in the expected confirmed state.');
        }

        if (! SalesOrder::query()->where('organization_id', $organization->getKey())->where('source_quote_id', $quote->getKey())->exists()) {
            $this->invokeController(app(SalesQuoteController::class), 'convert', $organization, $actor, [], [(int) $quote->getKey()]);
        }

        $order = SalesOrder::query()
            ->where('organization_id', $organization->getKey())
            ->where('source_quote_id', $quote->getKey())
            ->with('lines')
            ->firstOrFail();
        if ($order->lines->count() !== 1 || (int) $order->lines[0]->product_id !== (int) $product->getKey()) {
            throw new RuntimeException('The P11 sale order no longer matches its one-line synthetic fixture.');
        }

        return $order;
    }

    private function invokeController(
        object $controller,
        string $method,
        Organization $organization,
        User $actor,
        array $input,
        array $routeParameters = [],
    ): array {
        $request = Request::create('/api/v1/p11-provisioner', 'POST', $input);
        $request->setUserResolver(fn (): User => $actor);
        $request->attributes->set('activeOrganization', $organization);
        $guard = Auth::guard('web');
        $previousUser = $guard->user();
        $guard->setUser($actor);

        try {
            $response = $controller->{$method}($request, ...$routeParameters);
        } finally {
            if ($previousUser !== null) {
                $guard->setUser($previousUser);
            }
        }

        if (! $response instanceof JsonResponse || $response->getStatusCode() >= 400) {
            $status = $response instanceof JsonResponse ? $response->getStatusCode() : 500;
            throw new RuntimeException("P11 source workflow action {$method} failed with HTTP {$status}.");
        }

        $payload = $response->getData(true);
        if (! isset($payload['data']) || ! is_array($payload['data'])) {
            throw new RuntimeException("P11 source workflow action {$method} returned an invalid record response.");
        }

        return $payload['data'];
    }

    private function provisionPurchaseJourney(
        Organization $organization,
        User $requester,
        User $approver,
        Product $product,
        Party $supplier,
        PurchasingService $purchasing,
    ): PurchaseRequest {
        if ((int) $requester->getKey() === (int) $approver->getKey()) {
            throw new RuntimeException('The P11 purchase fixture must be approved by an independent editor.');
        }

        $request = PurchaseRequest::query()
            ->where('organization_id', $organization->getKey())
            ->where('title', 'P11 walkthrough purchase')
            ->orderBy('id')
            ->first();
        if ($request === null) {
            $request = $purchasing->createDraft($organization, $requester, 'P11 walkthrough purchase', [
                ['product_id' => (int) $product->getKey(), 'quantity' => '1.000'],
            ]);
        }

        if ($request->status === 'draft') {
            $request = $purchasing->submitRequest($organization, $requester, (int) $request->getKey());
        }
        if ($request->status === 'submitted') {
            $request = $purchasing->approveRequest($organization, $approver, (int) $request->getKey());
        }
        if ($request->status === 'approved') {
            $lines = $request->lines()->orderBy('id')->get();
            $purchasing->convertRequest(
                $organization,
                $approver,
                (int) $request->getKey(),
                (int) $supplier->getKey(),
                $lines->map(fn ($line): array => [
                    'source_request_line_id' => (int) $line->getKey(),
                    'unit_price_rial' => '500000',
                ])->all(),
            );
            $request = $request->fresh();
        }

        if ($request->status !== 'approved' || $request->purchaseOrder()->doesntExist()) {
            throw new RuntimeException('The P11 approved purchase request does not have its one converted order.');
        }

        return $request;
    }

    private function provisionPendingRequest(
        Organization $organization,
        User $requester,
        Product $product,
        PurchasingService $purchasing,
    ): PurchaseRequest {
        $request = PurchaseRequest::query()
            ->where('organization_id', $organization->getKey())
            ->where('title', 'P11 dashboard pending approval')
            ->orderBy('id')
            ->first();
        if ($request === null) {
            $request = $purchasing->createDraft($organization, $requester, 'P11 dashboard pending approval', [
                ['product_id' => (int) $product->getKey(), 'quantity' => '1.000'],
            ]);
        }
        if ($request->status === 'draft') {
            $request = $purchasing->submitRequest($organization, $requester, (int) $request->getKey());
        }
        if ($request->status !== 'submitted') {
            throw new RuntimeException('The P11 pending-approval fixture was approved or converted; it was not reset.');
        }

        return $request;
    }

    private function assertOpenPeriodCovers(AccountingBook $book, string $date): void
    {
        if (! $book->periods()->where('status', 'open')->where('starts_on', '<=', $date)->where('ends_on', '>=', $date)->exists()) {
            throw new RuntimeException('No existing open accounting period covers '.$date.'.');
        }
    }
}
