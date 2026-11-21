<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Organization;
use App\Models\Warehouse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WarehouseController extends MasterDataController
{
    public function index(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $query = Warehouse::query()->where('organization_id', $organization->getKey());
        $this->applySearch($query, $request, $organization->getKey(), ['code', 'name']);

        return response()->json(['data' => $query->orderBy('name')->get(['id', 'code', 'name'])]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $warehouse = Warehouse::query()->where('organization_id', $organization->getKey())->findOrFail($id);

        return response()->json(['data' => $warehouse->only(['id', 'code', 'name'])]);
    }

    public function store(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $validated = $this->validateWarehouse($request, $organization);
        $warehouse = Warehouse::query()->create(['organization_id' => $organization->getKey(), ...$validated]);

        return response()->json(['data' => $warehouse->only(['id', 'code', 'name'])], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $warehouse = Warehouse::query()->where('organization_id', $organization->getKey())->findOrFail($id);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $warehouse->update($this->validateWarehouse($request, $organization, $warehouse->getKey()));

        return response()->json(['data' => $warehouse->fresh()->only(['id', 'code', 'name'])]);
    }

    private function validateWarehouse(Request $request, Organization $organization, ?int $ignoreId = null): array
    {
        return $request->validate([
            'code' => $this->codeRules('warehouses', $organization->getKey(), $ignoreId),
            'name' => ['required', 'string', 'max:160'],
        ]);
    }
}
