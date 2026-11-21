<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProductController extends Controller
{
    public function index(): JsonResponse
    {
        $organization = request()->attributes->get('activeOrganization');

        return response()->json([
            'data' => Product::query()
                ->where('organization_id', $organization->getKey())
                ->orderBy('id')
                ->get(['id', 'code', 'name']),
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $organization = $request->attributes->get('activeOrganization');
        Gate::authorize('viewMasterData', $organization);
        $product = Product::query()->where('organization_id', $organization->getKey())->with('baseUnit')->findOrFail($id);

        return response()->json(['data' => $this->serializeDetail($product)]);
    }

    public function store(Request $request): JsonResponse
    {
        $organization = $request->attributes->get('activeOrganization');
        Gate::authorize('manageMasterData', $organization);
        if (array_key_exists('organization_id', $request->all())) {
            throw ValidationException::withMessages(['organization_id' => 'سازمان از نشست فعال تعیین می‌شود.']);
        }
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:64', Rule::unique('products', 'code')->where('organization_id', $organization->getKey())],
            'name' => ['required', 'string', 'max:255'],
            'base_unit_id' => ['sometimes', 'nullable', 'integer', 'min:1', Rule::exists('units', 'id')->where('organization_id', $organization->getKey())],
        ]);
        $product = Product::query()->create(['organization_id' => $organization->getKey(), ...$validated]);

        return response()->json(['data' => $product->only(['id', 'code', 'name'])], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $unsupportedFields = array_diff(array_keys($request->all()), ['name', 'code', 'base_unit_id']);

        if ($unsupportedFields !== []) {
            throw ValidationException::withMessages([
                'request' => 'فقط کد، نام و واحد پایهٔ کالا قابل تغییر است.',
            ]);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'code' => ['sometimes', 'required', 'string', 'max:64'],
            'base_unit_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
        ]);

        $organization = $request->attributes->get('activeOrganization');
        $product = Product::query()
            ->where('organization_id', $organization->getKey())
            ->findOrFail($id);

        Gate::authorize('update', $product);

        if ($validated === []) {
            throw ValidationException::withMessages(['request' => 'حداقل یک مشخصهٔ کالا را تغییر دهید.']);
        }

        if (array_key_exists('code', $validated)) {
            $request->validate([
                'code' => [Rule::unique('products', 'code')->where('organization_id', $organization->getKey())->ignore($product->getKey())],
            ]);
        }

        if (array_key_exists('base_unit_id', $validated) && $validated['base_unit_id'] !== null) {
            $request->validate([
                'base_unit_id' => [Rule::exists('units', 'id')->where('organization_id', $organization->getKey())],
            ]);
        }

        $product->fill($validated);
        $product->save();

        return response()->json([
            'data' => $product->only(['id', 'code', 'name']),
        ]);
    }

    private function serializeDetail(Product $product): array
    {
        return [
            'id' => $product->getKey(),
            'code' => $product->code,
            'name' => $product->name,
            'base_unit' => $product->baseUnit === null ? null : [
                'id' => $product->baseUnit->getKey(),
                'code' => $product->baseUnit->code,
                'name' => $product->baseUnit->name,
                'symbol' => $product->baseUnit->symbol,
            ],
        ];
    }
}
