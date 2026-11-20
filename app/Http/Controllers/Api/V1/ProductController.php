<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
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

    public function update(Request $request, int $id): JsonResponse
    {
        $unsupportedFields = array_diff(array_keys($request->all()), ['name']);

        if ($unsupportedFields !== []) {
            throw ValidationException::withMessages([
                'request' => 'فقط نام نمایشی کالا قابل تغییر است.',
            ]);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $organization = $request->attributes->get('activeOrganization');
        $product = Product::query()
            ->where('organization_id', $organization->getKey())
            ->findOrFail($id);

        Gate::authorize('update', $product);

        $product->name = $validated['name'];
        $product->save();

        return response()->json([
            'data' => $product->only(['id', 'code', 'name']),
        ]);
    }
}
