<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Party;
use App\Models\PriceList;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SalesWorkspaceController extends SalesController
{
    public function options(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $customers = Party::query()
            ->where('organization_id', $organization->getKey())
            ->whereHas('roles', fn ($query) => $query->where('organization_id', $organization->getKey())->where('role', 'customer'))
            ->orderBy('display_name')->get(['id', 'code', 'display_name']);
        $products = Product::query()->where('organization_id', $organization->getKey())
            ->with('baseUnit')->orderBy('name')->get();
        $priceLists = PriceList::query()->where('organization_id', $organization->getKey())->orderBy('name')->get(['id', 'code', 'name']);

        return response()->json(['data' => [
            'customers' => $customers->map(fn (Party $party): array => [
                'id' => $party->getKey(), 'code' => $party->code, 'name' => $party->display_name,
            ])->values(),
            'products' => $products->map(fn (Product $product): array => [
                'id' => $product->getKey(), 'code' => $product->code, 'name' => $product->name,
                'base_unit' => $product->baseUnit === null ? null : [
                    'id' => $product->baseUnit->getKey(), 'code' => $product->baseUnit->code,
                    'name' => $product->baseUnit->name, 'symbol' => $product->baseUnit->symbol,
                ],
            ])->values(),
            'price_lists' => $priceLists->map(fn (PriceList $list): array => [
                'id' => $list->getKey(), 'code' => $list->code, 'name' => $list->name,
            ])->values(),
        ]]);
    }
}
