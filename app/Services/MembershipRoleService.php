<?php

namespace App\Services;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\OrganizationMembership;
use App\Models\OrganizationRoleAudit;
use App\Models\OrganizationRoleManager;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class MembershipRoleService
{
    public function assign(
        Organization $organization,
        User $subject,
        OrganizationRole $role,
        ?User $actor = null,
    ): OrganizationMembership {
        return DB::transaction(function () use ($organization, $subject, $role, $actor): OrganizationMembership {
            Organization::query()->whereKey($organization->getKey())->lockForUpdate()->firstOrFail();

            $membership = OrganizationMembership::query()
                ->where('organization_id', $organization->getKey())
                ->where('user_id', $subject->getKey())
                ->lockForUpdate()
                ->first();
            $membership ??= new OrganizationMembership([
                'organization_id' => $organization->getKey(),
                'user_id' => $subject->getKey(),
            ]);
            $priorRole = $membership->exists ? $membership->role : null;

            if ($priorRole === $role->value) {
                return $membership;
            }

            if ($priorRole !== null && OrganizationRole::tryFrom($priorRole) === null) {
                throw new InvalidArgumentException('The stored membership role is not recognized.');
            }

            $membership->role = $role->value;
            $membership->save();

            OrganizationRoleAudit::query()->create([
                'organization_id' => $organization->getKey(),
                'membership_id' => $membership->getKey(),
                'actor_user_id' => $actor?->getKey(),
                'source' => $actor === null ? 'system' : 'user',
                'prior_role' => $priorRole,
                'new_role' => $role->value,
            ]);

            return $membership;
        });
    }

    public function changeExisting(
        Organization $organization,
        OrganizationMembership $target,
        User $actor,
        OrganizationRole $expectedRole,
        OrganizationRole $newRole,
    ): OrganizationMembership {
        return DB::transaction(function () use ($organization, $target, $actor, $expectedRole, $newRole): OrganizationMembership {
            Organization::query()->whereKey($organization->getKey())->lockForUpdate()->firstOrFail();

            $authorized = OrganizationRoleManager::query()
                ->where('organization_id', $organization->getKey())
                ->where('user_id', $actor->getKey())
                ->lockForUpdate()
                ->exists();

            if (! $authorized) {
                throw new AuthorizationException;
            }

            $membership = OrganizationMembership::query()
                ->where('organization_id', $organization->getKey())
                ->whereKey($target->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            $currentRole = OrganizationRole::tryFrom((string) $membership->role);

            if ($currentRole === null) {
                throw new InvalidArgumentException('The stored membership role is not recognized.');
            }

            if ($currentRole !== $expectedRole) {
                throw new ConflictHttpException('The membership role changed after it was loaded. Refresh and retry.');
            }

            if ($currentRole === $newRole) {
                return $membership;
            }

            $membership->role = $newRole->value;
            $membership->save();

            OrganizationRoleAudit::query()->create([
                'organization_id' => $organization->getKey(),
                'membership_id' => $membership->getKey(),
                'actor_user_id' => $actor->getKey(),
                'source' => 'user',
                'prior_role' => $currentRole->value,
                'new_role' => $newRole->value,
            ]);

            return $membership;
        });
    }
}
