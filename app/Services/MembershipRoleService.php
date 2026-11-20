<?php

namespace App\Services;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\OrganizationMembership;
use App\Models\OrganizationRoleAudit;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class MembershipRoleService
{
    public function assign(
        Organization $organization,
        User $subject,
        OrganizationRole $role,
        ?User $actor = null,
    ): OrganizationMembership {
        return DB::transaction(function () use ($organization, $subject, $role, $actor): OrganizationMembership {
            $membership = OrganizationMembership::query()->firstOrNew([
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
}
