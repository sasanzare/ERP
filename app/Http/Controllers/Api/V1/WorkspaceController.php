<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrganizationRole;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WorkspaceController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $organization = $request->attributes->get('activeOrganization');
        $memberships = $request->user()->organizations()->orderBy('organizations.name')->get();
        $role = $organization->pivot->role;

        return response()->json([
            'active_organization' => [
                'id' => $organization->getKey(),
                'name' => $organization->name,
                'role' => $role,
            ],
            'organizations' => $memberships->map(fn ($membership): array => [
                'id' => $membership->getKey(),
                'name' => $membership->name,
                'role' => $membership->pivot->role,
            ])->values(),
            'capabilities' => [
                'master_data' => [
                    'manage' => $role === OrganizationRole::Editor->value,
                ],
                'products' => [
                    'update' => $role === OrganizationRole::Editor->value,
                ],
                'sales' => [
                    'manage' => $role === OrganizationRole::Editor->value,
                ],
            ],
        ]);
    }

    public function switchOrganization(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'organization_id' => ['required', 'integer', 'min:1'],
        ]);

        $organization = $request->user()->organizations()
            ->whereKey($validated['organization_id'])
            ->first();

        if ($organization === null) {
            return response()->json(['message' => 'این سازمان در فهرست دسترسی شما نیست.'], 403);
        }

        $request->session()->put('active_organization_id', $organization->getKey());
        $request->attributes->set('activeOrganization', $organization);
        $request->attributes->set('activeMembership', $organization->pivot);

        return response()->json([
            'active_organization' => [
                'id' => $organization->getKey(),
                'name' => $organization->name,
                'role' => $organization->pivot->role,
            ],
            'capabilities' => [
                'master_data' => [
                    'manage' => $organization->pivot->role === OrganizationRole::Editor->value,
                ],
                'products' => [
                    'update' => $organization->pivot->role === OrganizationRole::Editor->value,
                ],
                'sales' => [
                    'manage' => $organization->pivot->role === OrganizationRole::Editor->value,
                ],
            ],
        ]);
    }
}
