<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Organization;
use App\Models\Unit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UnitController extends MasterDataController
{
    public function index(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $query = Unit::query()->where('organization_id', $organization->getKey());
        $this->applySearch($query, $request, $organization->getKey(), ['code', 'name', 'symbol']);

        return response()->json(['data' => $query->orderBy('name')->get(['id', 'code', 'name', 'symbol', 'is_active'])]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $unit = Unit::query()->where('organization_id', $organization->getKey())->findOrFail($id);

        return response()->json(['data' => $unit->only(['id', 'code', 'name', 'symbol', 'is_active'])]);
    }

    public function store(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $validated = $this->validateUnit($request, $organization);
        $validated['is_active'] ??= true;
        $unit = Unit::query()->create(['organization_id' => $organization->getKey(), ...$validated]);

        return response()->json(['data' => $unit->only(['id', 'code', 'name', 'symbol', 'is_active'])], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $unit = Unit::query()->where('organization_id', $organization->getKey())->findOrFail($id);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $unit->update($this->validateUnit($request, $organization, $unit->getKey()));

        return response()->json(['data' => $unit->fresh()->only(['id', 'code', 'name', 'symbol', 'is_active'])]);
    }

    private function validateUnit(Request $request, Organization $organization, ?int $ignoreId = null): array
    {
        return $request->validate([
            'code' => $this->codeRules('units', $organization->getKey(), $ignoreId),
            'name' => ['required', 'string', 'max:120'],
            'symbol' => ['required', 'string', 'max:32'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }
}
