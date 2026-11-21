<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Organization;
use App\Models\PriceList;
use App\Models\PriceListEntry;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PriceListController extends MasterDataController
{
    public function index(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $query = PriceList::query()->where('organization_id', $organization->getKey());
        $this->applySearch($query, $request, $organization->getKey(), ['code', 'name']);
        $lists = $query->withCount('entries')->orderBy('name')->get();

        return response()->json(['data' => $lists->map(fn (PriceList $list): array => [
            'id' => $list->getKey(),
            'code' => $list->code,
            'name' => $list->name,
            'entry_count' => $list->entries_count,
            'currency' => 'IRR',
        ])->values()]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $list = PriceList::query()->where('organization_id', $organization->getKey())
            ->with(['entries.product.baseUnit'])->findOrFail($id);

        return response()->json(['data' => $this->serialize($list)]);
    }

    public function store(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $list = PriceList::query()->create([
            'organization_id' => $organization->getKey(),
            ...$this->validatePriceList($request, $organization),
        ]);

        return response()->json(['data' => $this->serialize($list->load('entries.product.baseUnit'))], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $list = PriceList::query()->where('organization_id', $organization->getKey())->findOrFail($id);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $list->update($this->validatePriceList($request, $organization, $list->getKey()));

        return response()->json(['data' => $this->serialize($list->fresh('entries.product.baseUnit'))]);
    }

    public function resolvePrice(Request $request, int $priceListId, int $productId): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $list = PriceList::query()->where('organization_id', $organization->getKey())->findOrFail($priceListId);
        $product = Product::query()->where('organization_id', $organization->getKey())->with('baseUnit')->findOrFail($productId);
        $entry = PriceListEntry::query()->where('organization_id', $organization->getKey())
            ->where('price_list_id', $list->getKey())
            ->where('product_id', $product->getKey())
            ->first();

        return response()->json(['data' => [
            'price_list' => ['id' => $list->getKey(), 'code' => $list->code, 'name' => $list->name],
            'product' => ['id' => $product->getKey(), 'code' => $product->code, 'name' => $product->name],
            'priced' => $entry !== null,
            'amount_rial' => $entry === null ? null : (string) $entry->amount_rial,
            'unit' => $product->baseUnit === null ? null : [
                'id' => $product->baseUnit->getKey(),
                'code' => $product->baseUnit->code,
                'name' => $product->baseUnit->name,
                'symbol' => $product->baseUnit->symbol,
            ],
        ]]);
    }

    public function saveEntry(Request $request, int $priceListId): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $list = PriceList::query()->where('organization_id', $organization->getKey())->findOrFail($priceListId);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $validated = $request->validate([
            'product_id' => ['required', 'integer', 'min:1', Rule::exists('products', 'id')->where('organization_id', $organization->getKey())],
            'amount_rial' => ['required', 'string', 'regex:/^\d{1,20}$/'],
        ]);

        $product = Product::query()->where('organization_id', $organization->getKey())->findOrFail($validated['product_id']);

        if ($product->base_unit_id === null) {
            throw ValidationException::withMessages([
                'product_id' => 'پیش از قیمت‌گذاری، واحد پایهٔ کالا را تعیین کنید.',
            ]);
        }

        $amount = ltrim($validated['amount_rial'], '0') ?: '0';
        if (strlen($amount) > 20 || (strlen($amount) === 20 && strcmp($amount, '18446744073709551615') > 0)) {
            throw ValidationException::withMessages(['amount_rial' => 'مبلغ از ظرفیت ذخیرهٔ ریالی بیشتر است.']);
        }

        $entry = DB::transaction(fn (): PriceListEntry => PriceListEntry::query()->updateOrCreate(
            [
                'organization_id' => $organization->getKey(),
                'price_list_id' => $list->getKey(),
                'product_id' => $product->getKey(),
            ],
            ['amount_rial' => $amount],
        ));

        return response()->json(['data' => $this->serializeEntry($entry->load('product.baseUnit'))], 201);
    }

    public function removeEntry(Request $request, int $priceListId, int $productId): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $list = PriceList::query()->where('organization_id', $organization->getKey())->findOrFail($priceListId);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        Product::query()->where('organization_id', $organization->getKey())->findOrFail($productId);

        $entry = PriceListEntry::query()->where('organization_id', $organization->getKey())
            ->where('price_list_id', $list->getKey())->where('product_id', $productId)->firstOrFail();
        $entry->delete();

        return response()->json(['data' => ['removed' => true]]);
    }

    private function validatePriceList(Request $request, Organization $organization, ?int $ignoreId = null): array
    {
        return $request->validate([
            'code' => $this->codeRules('price_lists', $organization->getKey(), $ignoreId),
            'name' => ['required', 'string', 'max:160'],
        ]);
    }

    private function serialize(PriceList $list): array
    {
        return [
            'id' => $list->getKey(),
            'code' => $list->code,
            'name' => $list->name,
            'currency' => 'IRR',
            'entries' => $list->entries->map(fn (PriceListEntry $entry): array => $this->serializeEntry($entry))->values(),
        ];
    }

    private function serializeEntry(PriceListEntry $entry): array
    {
        return [
            'product' => [
                'id' => $entry->product->getKey(),
                'code' => $entry->product->code,
                'name' => $entry->product->name,
                'base_unit' => $entry->product->baseUnit === null ? null : [
                    'id' => $entry->product->baseUnit->getKey(),
                    'code' => $entry->product->baseUnit->code,
                    'name' => $entry->product->baseUnit->name,
                    'symbol' => $entry->product->baseUnit->symbol,
                ],
            ],
            'amount_rial' => (string) $entry->amount_rial,
        ];
    }
}
