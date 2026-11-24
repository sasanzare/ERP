<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Organization;
use App\Models\P10Invoice;
use App\Models\PurchaseOrder;
use App\Models\SalesOrder;
use App\Models\User;
use App\Services\Settlements\P10SettlementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class SettlementController
{
    public function __construct(private readonly P10SettlementService $settlements) {}

    public function options(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        Gate::authorize('viewAccounting', $organization);

        return response()->json([
            'data' => $this->settlements->options($organization),
            'can_manage' => Gate::allows('manageAccounting', $organization),
        ]);
    }

    public function invoiceIndex(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        Gate::authorize('viewAccounting', $organization);
        $direction = $request->query('direction');

        if ($direction !== null && ! in_array($direction, ['customer', 'supplier'], true)) {
            throw ValidationException::withMessages(['direction' => 'جهت صورتحساب معتبر نیست.']);
        }

        return response()->json(['data' => $this->settlements->invoices($organization, $direction)]);
    }

    public function customerInvoiceStore(Request $request, int $salesOrder): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        Gate::authorize('manageAccounting', $organization);
        SalesOrder::query()->where('organization_id', $organization->getKey())->findOrFail($salesOrder);

        $input = $request->validate([
            'book_id' => ['required', 'integer', 'min:1'],
            'effective_on' => ['required', 'date_format:Y-m-d'],
            'due_on' => ['required', 'date_format:Y-m-d', 'after_or_equal:effective_on'],
            'lines' => ['required', 'array', 'min:1', 'max:100'],
            'lines.*.sales_order_line_id' => ['required', 'integer', 'min:1'],
            'lines.*.sales_order_delivery_id' => ['required', 'integer', 'min:1'],
            'lines.*.quantity_milli' => ['required', 'string', 'regex:/^[0-9]{1,12}$/D'],
        ]);
        $key = $this->idempotencyKey($request);
        $result = $this->settlements->postCustomerInvoice(
            $organization,
            $this->actor($request),
            $salesOrder,
            (int) $input['book_id'],
            $input['effective_on'],
            $input['due_on'],
            $input['lines'],
            $key,
        );

        return response()->json([
            'data' => $this->settlements->serializeInvoice($result['invoice']),
            'already_exists' => $result['already_exists'],
        ], $result['already_exists'] ? 200 : 201);
    }

    public function supplierInvoiceStore(Request $request, int $purchaseOrder): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        Gate::authorize('manageAccounting', $organization);
        PurchaseOrder::query()->where('organization_id', $organization->getKey())->findOrFail($purchaseOrder);

        $input = $request->validate([
            'book_id' => ['required', 'integer', 'min:1'],
            'effective_on' => ['required', 'date_format:Y-m-d'],
            'due_on' => ['required', 'date_format:Y-m-d', 'after_or_equal:effective_on'],
            'lines' => ['required', 'array', 'min:1', 'max:100'],
            'lines.*.purchase_order_line_id' => ['required', 'integer', 'min:1'],
            'lines.*.purchase_receipt_id' => ['required', 'integer', 'min:1'],
            'lines.*.quantity_milli' => ['required', 'string', 'regex:/^[0-9]{1,12}$/D'],
        ]);
        $key = $this->idempotencyKey($request);
        $result = $this->settlements->postSupplierInvoice(
            $organization,
            $this->actor($request),
            $purchaseOrder,
            (int) $input['book_id'],
            $input['effective_on'],
            $input['due_on'],
            $input['lines'],
            $key,
        );

        return response()->json([
            'data' => $this->settlements->serializeInvoice($result['invoice']),
            'already_exists' => $result['already_exists'],
        ], $result['already_exists'] ? 200 : 201);
    }

    public function customerReceiptStore(Request $request, int $invoice): JsonResponse
    {
        return $this->settle($request, $invoice, 'customer');
    }

    public function supplierPaymentStore(Request $request, int $invoice): JsonResponse
    {
        return $this->settle($request, $invoice, 'supplier');
    }

    private function settle(Request $request, int $invoiceId, string $direction): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        Gate::authorize('manageAccounting', $organization);
        P10Invoice::query()
            ->where('organization_id', $organization->getKey())
            ->where('direction', $direction)
            ->findOrFail($invoiceId);

        $input = $request->validate([
            'amount_rial' => ['required', 'string', 'regex:/^[0-9]{1,20}$/D'],
            'effective_on' => ['required', 'date_format:Y-m-d'],
            'reference' => ['nullable', 'string', 'max:120'],
        ]);
        $result = $this->settlements->settleInvoice(
            $organization,
            $this->actor($request),
            $invoiceId,
            $direction,
            $input['amount_rial'],
            $input['effective_on'],
            $input['reference'] ?? null,
            $this->idempotencyKey($request),
        );

        return response()->json([
            'data' => $this->settlements->serializeSettlement($result['movement'], $result['allocation']),
            'invoice' => $this->settlements->serializeInvoice($result['invoice']),
            'already_exists' => $result['already_exists'],
        ], $result['already_exists'] ? 200 : 201);
    }

    private function activeOrganization(Request $request): Organization
    {
        /** @var Organization $organization */
        $organization = $request->attributes->get('activeOrganization');

        return $organization;
    }

    private function actor(Request $request): User
    {
        /** @var User $actor */
        $actor = $request->user();

        return $actor;
    }

    private function idempotencyKey(Request $request): string
    {
        $key = $request->header('Idempotency-Key');
        if (! is_string($key) || $key === '') {
            throw ValidationException::withMessages(['idempotency_key' => 'سرآیند Idempotency-Key الزامی است.']);
        }

        return $key;
    }
}
