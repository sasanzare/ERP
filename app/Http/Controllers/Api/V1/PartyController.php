<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Organization;
use App\Models\Party;
use App\Models\PartyRole;
use App\Services\Parties\PartyRegisterQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PartyController extends MasterDataController
{
    public function index(Request $request, PartyRegisterQuery $register): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $validated = $request->validate([
            'role' => ['sometimes', 'nullable', 'in:customer,supplier'],
            'q' => ['sometimes', 'nullable', 'string', 'max:120'],
        ]);
        $query = $register->make($organization, (string) ($validated['q'] ?? ''), $validated['role'] ?? null)
            ->with(['roles' => fn ($roles) => $roles->orderBy('role')])
            ->orderBy('display_name')
            ->orderBy('id');

        return response()->json([
            'data' => $query->get()
                ->map(fn (Party $party): array => $this->serialize($party))
                ->values(),
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $party = Party::query()->where('organization_id', $organization->getKey())->with('roles')->findOrFail($id);

        return response()->json(['data' => $this->serialize($party)]);
    }

    public function store(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $validated = $this->validateParty($request, $organization);

        $party = DB::transaction(function () use ($validated, $organization): Party {
            $party = Party::query()->create([
                'organization_id' => $organization->getKey(),
                'code' => $validated['code'],
                'display_name' => $validated['display_name'],
            ]);
            $this->syncRoles($party, $organization, $validated['roles']);

            return $party->load('roles');
        });

        return response()->json(['data' => $this->serialize($party)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $party = Party::query()->where('organization_id', $organization->getKey())->findOrFail($id);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $validated = $this->validateParty($request, $organization, $party->getKey());

        DB::transaction(function () use ($party, $organization, $validated): void {
            $party->update([
                'code' => $validated['code'],
                'display_name' => $validated['display_name'],
            ]);
            $this->syncRoles($party, $organization, $validated['roles']);
        });

        return response()->json(['data' => $this->serialize($party->fresh('roles'))]);
    }

    private function validateParty(Request $request, Organization $organization, ?int $ignoreId = null): array
    {
        $code = $this->codeRules('parties', $organization->getKey(), $ignoreId);

        return $request->validate([
            'code' => $code,
            'display_name' => ['required', 'string', 'max:255'],
            'roles' => ['required', 'array', 'min:1'],
            'roles.*' => ['required', 'string', 'distinct', Rule::in(['customer', 'supplier'])],
        ]);
    }

    private function syncRoles(Party $party, Organization $organization, array $roles): void
    {
        PartyRole::query()->where('organization_id', $organization->getKey())
            ->where('party_id', $party->getKey())->delete();

        foreach (array_unique($roles) as $role) {
            PartyRole::query()->create([
                'organization_id' => $organization->getKey(),
                'party_id' => $party->getKey(),
                'role' => $role,
            ]);
        }
    }

    private function serialize(Party $party): array
    {
        return [
            'id' => $party->getKey(),
            'code' => $party->code,
            'display_name' => $party->display_name,
            'roles' => $party->roles->pluck('role')->values(),
        ];
    }
}
