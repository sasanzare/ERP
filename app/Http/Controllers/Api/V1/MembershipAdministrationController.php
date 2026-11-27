<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrganizationRole;
use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\OrganizationMembership;
use App\Models\OrganizationRoleAudit;
use App\Models\OrganizationRoleManager;
use App\Services\MembershipRoleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class MembershipAdministrationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        Gate::authorize('viewMembershipRoles', $organization);

        $roleManagerIds = OrganizationRoleManager::query()
            ->where('organization_id', $organization->getKey())
            ->pluck('user_id')
            ->map(fn ($id): int => (int) $id)
            ->all();

        $memberships = OrganizationMembership::query()
            ->where('organization_id', $organization->getKey())
            ->with('user')
            ->join('users', 'users.id', '=', 'organization_memberships.user_id')
            ->select('organization_memberships.*')
            ->orderBy('users.name')
            ->orderBy('users.email')
            ->get()
            ->map(fn (OrganizationMembership $membership): array => [
                'id' => $membership->getKey(),
                'user_id' => $membership->user->getKey(),
                'name' => $membership->user->name,
                'email' => $membership->user->email,
                'role' => $membership->role,
                'role_manager' => in_array((int) $membership->user_id, $roleManagerIds, true),
            ])
            ->values();

        return response()->json(['data' => $memberships]);
    }

    public function history(Request $request, int $membershipId): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $membership = OrganizationMembership::query()
            ->where('organization_id', $organization->getKey())
            ->findOrFail($membershipId);

        Gate::authorize('viewMembershipRoleHistory', $organization);

        $events = OrganizationRoleAudit::query()
            ->where('organization_id', $organization->getKey())
            ->where('membership_id', $membership->getKey())
            ->with('actor')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (OrganizationRoleAudit $event): array => [
                'id' => $event->getKey(),
                'actor' => $event->actor === null ? null : [
                    'id' => $event->actor->getKey(),
                    'name' => $event->actor->name,
                    'email' => $event->actor->email,
                ],
                'source' => $event->source,
                'prior_role' => $event->prior_role,
                'new_role' => $event->new_role,
                'created_at' => $event->created_at?->toISOString(),
            ])
            ->values();

        return response()->json([
            'membership' => [
                'id' => $membership->getKey(),
                'user_id' => $membership->user_id,
            ],
            'data' => $events,
        ]);
    }

    public function updateRole(Request $request, int $membershipId, MembershipRoleService $roles): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $membership = OrganizationMembership::query()
            ->where('organization_id', $organization->getKey())
            ->with('user')
            ->findOrFail($membershipId);

        Gate::authorize('manageMembershipRoles', $organization);

        if (array_key_exists('organization_id', $request->all())) {
            throw ValidationException::withMessages([
                'organization_id' => 'سازمان از نشست فعال تعیین می‌شود و از درخواست پذیرفته نمی‌شود.',
            ]);
        }

        $roleRule = ['required', 'string', Rule::in([OrganizationRole::Reader->value, OrganizationRole::Editor->value])];
        $validated = $request->validate([
            'role' => $roleRule,
            'expected_role' => $roleRule,
        ]);

        $updated = $roles->changeExisting(
            $organization,
            $membership,
            $request->user(),
            OrganizationRole::from($validated['expected_role']),
            OrganizationRole::from($validated['role']),
        );

        return response()->json([
            'data' => [
                'id' => $updated->getKey(),
                'user_id' => $updated->user_id,
                'name' => $updated->user->name,
                'email' => $updated->user->email,
                'role' => $updated->role,
            ],
            'changed' => $validated['expected_role'] !== $validated['role'],
        ]);
    }

    private function activeOrganization(Request $request): Organization
    {
        $organization = $request->attributes->get('activeOrganization');

        abort_unless($organization instanceof Organization, 403);

        return $organization;
    }
}
