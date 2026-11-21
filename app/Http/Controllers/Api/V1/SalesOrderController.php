<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\SalesOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
}
