<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Location;
use App\Models\Organization;
use App\Models\Warehouse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class LocationController extends MasterDataController
{
    public function index(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $validated = $request->validate([
            'warehouse_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
        ]);
        $query = Location::query()->where('organization_id', $organization->getKey());

        if (! empty($validated['warehouse_id'])) {
            Warehouse::query()->where('organization_id', $organization->getKey())->findOrFail($validated['warehouse_id']);
            $query->where('warehouse_id', $validated['warehouse_id']);
        }

        $this->applySearch($query, $request, $organization->getKey(), ['code', 'name']);
        $locations = $query->with('warehouse')->orderBy('name')->get();

        return response()->json(['data' => $locations->map(fn (Location $location): array => $this->serialize($location))->values()]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $location = Location::query()->where('organization_id', $organization->getKey())->with('warehouse')->findOrFail($id);

        return response()->json(['data' => $this->serialize($location)]);
    }

    public function store(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $validated = $this->validateLocation($request, $organization);
        $location = Location::query()->create(['organization_id' => $organization->getKey(), ...$validated]);

        return response()->json(['data' => $this->serialize($location->load('warehouse'))], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $scopedLocation = Location::query()->where('organization_id', $organization->getKey())->findOrFail($id);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $validated = $this->validateLocation($request, $organization, $scopedLocation->getKey());

        return DB::transaction(function () use ($organization, $id, $validated): JsonResponse {
            $location = Location::query()
                ->where('organization_id', $organization->getKey())
                ->lockForUpdate()
                ->findOrFail($id);

            if (
                (int) $location->warehouse_id !== (int) $validated['warehouse_id']
                && DB::table('stock_locks')->where('organization_id', $organization->getKey())->where('location_id', $id)->exists()
            ) {
                throw ValidationException::withMessages([
                    'warehouse_id' => 'پس از ثبت حرکت موجودی، انبارِ این مکان قابل تغییر نیست.',
                ]);
            }

            $location->update($validated);

            return response()->json(['data' => $this->serialize($location->fresh('warehouse'))]);
        });
    }

    public function validateSelection(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->rejectOrganizationOverride($request);
        $validated = $request->validate([
            'warehouse_id' => ['required', 'integer', 'min:1', Rule::exists('warehouses', 'id')->where('organization_id', $organization->getKey())],
            'location_id' => ['required', 'integer', 'min:1', Rule::exists('locations', 'id')->where('organization_id', $organization->getKey())],
        ]);

        $warehouse = Warehouse::query()->where('organization_id', $organization->getKey())->findOrFail($validated['warehouse_id']);
        $location = Location::query()->where('organization_id', $organization->getKey())->findOrFail($validated['location_id']);

        if ((int) $location->warehouse_id !== (int) $warehouse->getKey()) {
            throw ValidationException::withMessages([
                'location_id' => 'مکان انتخاب‌شده به انبار انتخاب‌شده تعلق ندارد.',
            ]);
        }

        return response()->json(['data' => ['warehouse_id' => $warehouse->getKey(), 'location_id' => $location->getKey()]]);
    }

    private function validateLocation(Request $request, Organization $organization, ?int $ignoreId = null): array
    {
        return $request->validate([
            'warehouse_id' => ['required', 'integer', 'min:1', Rule::exists('warehouses', 'id')->where('organization_id', $organization->getKey())],
            'code' => $this->codeRules('locations', $organization->getKey(), $ignoreId),
            'name' => ['required', 'string', 'max:160'],
        ]);
    }

    private function serialize(Location $location): array
    {
        return [
            'id' => $location->getKey(),
            'code' => $location->code,
            'name' => $location->name,
            'warehouse' => $location->warehouse === null ? null : [
                'id' => $location->warehouse->getKey(),
                'code' => $location->warehouse->code,
                'name' => $location->warehouse->name,
            ],
        ];
    }
}
