<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderLine;
use App\Models\PurchaseRequest;
use App\Services\Purchasing\PurchasingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class PurchasingController extends Controller
{
    public function options(Request $request, PurchasingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);

        return response()->json([
            'data' => $service->options($organization),
            'current_user_id' => (int) $request->user()->getKey(),
            'can_manage' => Gate::allows('managePurchasing', $organization) && Gate::allows('manageStock', $organization),
        ]);
    }

    public function requestIndex(Request $request, PurchasingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $validated = $request->validate(['q' => ['sometimes', 'nullable', 'string', 'max:120']]);
        $search = trim((string) ($validated['q'] ?? ''));
        $query = PurchaseRequest::query()
            ->where('organization_id', $organization->getKey())
            ->with(['requester', 'submittedBy', 'approvedBy', 'purchaseOrder', 'lines'])
            ->orderByDesc('id');

        if ($search !== '') {
            $query->where(fn ($nested) => $nested
                ->where('code', 'like', '%'.$search.'%')
                ->orWhere('title', 'like', '%'.$search.'%'));
        }

        return response()->json(['data' => $query->get()->map(
            fn (PurchaseRequest $record): array => $service->serializeRequest($record),
        )->values()]);
    }

    public function requestShow(Request $request, int $purchaseRequest, PurchasingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $record = $service->freshRequest($organization, $purchaseRequest);

        return response()->json(['data' => $service->serializeRequest($record)]);
    }

    public function requestStore(Request $request, PurchasingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManagePurchasing($organization);
        $this->rejectUnsupportedFields($request, ['title', 'lines']);
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:200'],
            'lines' => ['required', 'array', 'min:1', 'max:100'],
            'lines.*' => ['required', 'array:product_id,quantity'],
            'lines.*.product_id' => ['required', 'integer', 'min:1'],
            'lines.*.quantity' => ['required', 'string', 'regex:/^\d+(?:\.\d{1,3})?$/D'],
        ]);
        $record = $service->createDraft($organization, $request->user(), $validated['title'], $validated['lines']);

        return response()->json(['data' => $service->serializeRequest($record)], 201);
    }

    public function requestSubmit(Request $request, int $purchaseRequest, PurchasingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->scopedRequest($organization, $purchaseRequest);
        $this->authorizeManagePurchasing($organization);
        $this->rejectUnsupportedFields($request, []);
        $record = $service->submitRequest($organization, $request->user(), $purchaseRequest);

        return response()->json(['data' => $service->serializeRequest($record)]);
    }

    public function requestApprove(Request $request, int $purchaseRequest, PurchasingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->scopedRequest($organization, $purchaseRequest);
        $this->authorizeManagePurchasing($organization);
        $this->rejectUnsupportedFields($request, []);
        $record = $service->approveRequest($organization, $request->user(), $purchaseRequest);

        return response()->json(['data' => $service->serializeRequest($record)]);
    }

    public function requestConvert(Request $request, int $purchaseRequest, PurchasingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->scopedRequest($organization, $purchaseRequest);
        $this->authorizeManagePurchasing($organization);
        $this->rejectUnsupportedFields($request, ['supplier_party_id', 'lines']);
        $validated = $request->validate([
            'supplier_party_id' => ['required', 'integer', 'min:1'],
            'lines' => ['required', 'array', 'min:1', 'max:100'],
            'lines.*' => ['required', 'array:source_request_line_id,unit_price_rial'],
            'lines.*.source_request_line_id' => ['required', 'integer', 'min:1', 'distinct'],
            'lines.*.unit_price_rial' => ['required', 'string', 'regex:/^\d{1,20}$/D'],
        ]);
        $result = $service->convertRequest(
            $organization,
            $request->user(),
            $purchaseRequest,
            (int) $validated['supplier_party_id'],
            $validated['lines'],
        );

        return response()->json([
            'data' => $service->serializeOrder($result['order']),
            'already_exists' => $result['already_exists'],
        ], $result['already_exists'] ? 200 : 201);
    }

    public function orderIndex(Request $request, PurchasingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $validated = $request->validate(['q' => ['sometimes', 'nullable', 'string', 'max:120']]);
        $search = trim((string) ($validated['q'] ?? ''));
        $query = PurchaseOrder::query()
            ->where('organization_id', $organization->getKey())
            ->with([
                'sourceRequest', 'supplier', 'createdBy',
                'lines' => fn ($lines) => $lines->orderBy('id')->with('receipts'),
            ])
            ->orderByDesc('id');

        if ($search !== '') {
            $query->where(fn ($nested) => $nested
                ->where('code', 'like', '%'.$search.'%')
                ->orWhere('supplier_name_snapshot', 'like', '%'.$search.'%')
                ->orWhereHas('sourceRequest', fn ($requestQuery) => $requestQuery->where('code', 'like', '%'.$search.'%')));
        }

        return response()->json(['data' => $query->get()->map(
            fn (PurchaseOrder $record): array => $service->serializeOrder($record),
        )->values()]);
    }

    public function orderShow(Request $request, int $purchaseOrder, PurchasingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $record = $service->freshOrder($organization, $purchaseOrder);

        return response()->json(['data' => $service->serializeOrder($record)]);
    }

    public function receiveLine(
        Request $request,
        int $purchaseOrder,
        int $line,
        PurchasingService $service,
    ): JsonResponse {
        $organization = $this->activeOrganization($request);
        $this->scopedOrderLine($organization, $purchaseOrder, $line);
        $this->authorizeManagePurchasing($organization);
        Gate::authorize('manageStock', $organization);
        $this->rejectUnsupportedFields($request, ['warehouse_id', 'location_id', 'quantity']);
        $validated = $request->validate([
            'warehouse_id' => ['required', 'integer', 'min:1'],
            'location_id' => ['required', 'integer', 'min:1'],
            'quantity' => ['required', 'string', 'regex:/^\d+(?:\.\d{1,3})?$/D'],
        ]);
        $idempotencyKey = Validator::make(['idempotency_key' => $request->header('Idempotency-Key')], [
            'idempotency_key' => ['required', 'uuid'],
        ])->validate()['idempotency_key'];
        $result = $service->receiveLine(
            $organization,
            $request->user(),
            $purchaseOrder,
            $line,
            (int) $validated['warehouse_id'],
            (int) $validated['location_id'],
            $validated['quantity'],
            $idempotencyKey,
        );

        return response()->json([
            'data' => $service->serializeOrder($result['order']),
            'already_exists' => $result['already_exists'],
        ], $result['already_exists'] ? 200 : 201);
    }

    private function activeOrganization(Request $request): Organization
    {
        $organization = $request->attributes->get('activeOrganization');
        abort_unless($organization instanceof Organization, 403);
        Gate::authorize('viewPurchasing', $organization);

        return $organization;
    }

    private function authorizeManagePurchasing(Organization $organization): void
    {
        Gate::authorize('managePurchasing', $organization);
    }

    private function scopedRequest(Organization $organization, int $requestId): PurchaseRequest
    {
        return PurchaseRequest::query()
            ->where('organization_id', $organization->getKey())
            ->findOrFail($requestId);
    }

    private function scopedOrderLine(Organization $organization, int $orderId, int $lineId): PurchaseOrderLine
    {
        $order = PurchaseOrder::query()
            ->where('organization_id', $organization->getKey())
            ->findOrFail($orderId);

        return PurchaseOrderLine::query()
            ->where('organization_id', $organization->getKey())
            ->where('purchase_order_id', $order->getKey())
            ->findOrFail($lineId);
    }

    private function rejectUnsupportedFields(Request $request, array $allowed): void
    {
        $unsupported = array_diff(array_keys($request->all()), $allowed);

        if (in_array('organization_id', $unsupported, true)) {
            throw ValidationException::withMessages([
                'organization_id' => 'سازمان از نشست فعال تعیین می‌شود و از درخواست پذیرفته نمی‌شود.',
            ]);
        }

        if ($unsupported !== []) {
            throw ValidationException::withMessages(['request' => 'درخواست شامل مشخصهٔ پشتیبانی‌نشده است.']);
        }
    }
}
