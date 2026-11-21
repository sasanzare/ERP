<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Organization;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use App\Services\Sales\SalesFulfillmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class SalesOrderController extends SalesController
{
    public function index(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $validated = $request->validate(['q' => ['sometimes', 'nullable', 'string', 'max:120']]);
        $search = trim((string) ($validated['q'] ?? ''));
        $query = SalesOrder::query()->where('organization_id', $organization->getKey())->with('sourceQuote')->orderByDesc('id');

        if ($search !== '') {
            $query->where(fn ($nested) => $nested->where('code', 'like', '%'.$search.'%')
                ->orWhere('lead_title_snapshot', 'like', '%'.$search.'%')
                ->orWhere('customer_name_snapshot', 'like', '%'.$search.'%'));
        }

        return response()->json(['data' => $query->get()->map(fn (SalesOrder $order): array => [
            'id' => $order->getKey(),
            'code' => $order->code,
            'status' => $order->status,
            'total_toman' => (string) $order->total_toman,
            'confirmed_at' => $order->confirmed_at->toIso8601String(),
            'source_quote' => ['id' => $order->source_quote_id, 'code' => $order->sourceQuote?->code],
            'lead' => ['id' => $order->lead_id, 'code' => $order->lead_code_snapshot, 'title' => $order->lead_title_snapshot],
            'customer' => ['id' => $order->customer_party_id, 'code' => $order->customer_code_snapshot, 'name' => $order->customer_name_snapshot],
        ])->values()]);
    }

    public function show(Request $request, int $order): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $record = SalesOrder::query()->where('organization_id', $organization->getKey())
            ->with(['sourceQuote', 'lines' => fn ($query) => $query->orderBy('id')])->findOrFail($order);

        return response()->json(['data' => $this->serializeOrder($record)]);
    }

    public function reserveLine(Request $request, int $order, int $line, SalesFulfillmentService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->scopedOrderLine($organization, $order, $line);
        $this->authorizeFulfillment($organization);
        $this->rejectUnsupportedFields($request, ['quantity', 'warehouse_id', 'location_id']);
        $validated = $request->validate([
            'quantity' => ['required', 'string', 'regex:/^\d+(?:\.\d{1,3})?$/D'],
            'warehouse_id' => ['required', 'integer', 'min:1'],
            'location_id' => ['required', 'integer', 'min:1'],
        ]);
        $result = $service->reserveLine($organization, $request->user(), $order, $line, [
            ...$validated,
            'idempotency_key' => $this->idempotencyKey($request),
        ]);

        return response()->json([
            'data' => $this->freshOrder($organization, $order),
            'already_exists' => $result['already_exists'],
        ], $result['already_exists'] ? 200 : 201);
    }

    public function deliverLine(Request $request, int $order, int $line, SalesFulfillmentService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->scopedOrderLine($organization, $order, $line);
        $this->authorizeFulfillment($organization);
        $this->rejectUnsupportedFields($request, ['reservation_id', 'quantity']);
        $validated = $request->validate([
            'reservation_id' => ['required', 'integer', 'min:1'],
            'quantity' => ['required', 'string', 'regex:/^\d+(?:\.\d{1,3})?$/D'],
        ]);
        $result = $service->deliverLine(
            $organization,
            $request->user(),
            $order,
            $line,
            (int) $validated['reservation_id'],
            $validated['quantity'],
            $this->idempotencyKey($request),
        );

        return response()->json([
            'data' => $this->freshOrder($organization, $order),
            'already_exists' => $result['already_exists'],
        ], $result['already_exists'] ? 200 : 201);
    }

    public function cancelRemainder(Request $request, int $order, int $line, SalesFulfillmentService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->scopedOrderLine($organization, $order, $line);
        $this->authorizeFulfillment($organization);
        $this->rejectUnsupportedFields($request, []);
        $result = $service->cancelRemainder($organization, $request->user(), $order, $line);

        return response()->json([
            'data' => $this->freshOrder($organization, $order),
            'already_cancelled' => $result['already_cancelled'],
        ]);
    }

    private function scopedOrderLine(Organization $organization, int $orderId, int $lineId): SalesOrderLine
    {
        $order = SalesOrder::query()
            ->where('organization_id', $organization->getKey())
            ->findOrFail($orderId);

        return SalesOrderLine::query()
            ->where('organization_id', $organization->getKey())
            ->where('sales_order_id', $order->getKey())
            ->findOrFail($lineId);
    }

    private function authorizeFulfillment(Organization $organization): void
    {
        $this->authorizeManage($organization);
        Gate::authorize('manageStock', $organization);
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

    private function idempotencyKey(Request $request): string
    {
        return Validator::make(['idempotency_key' => $request->header('Idempotency-Key')], [
            'idempotency_key' => ['required', 'uuid'],
        ])->validate()['idempotency_key'];
    }

    private function freshOrder(Organization $organization, int $orderId): array
    {
        $record = SalesOrder::query()->where('organization_id', $organization->getKey())
            ->with(['sourceQuote', 'lines' => fn ($query) => $query->orderBy('id')])
            ->findOrFail($orderId);

        return $this->serializeOrder($record);
    }
}
