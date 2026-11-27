<?php

namespace App\Services;

use App\Exceptions\LastOrganizationRoleManagerException;
use App\Models\Organization;
use App\Models\OrganizationMembership;
use App\Models\OrganizationRoleManager;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class OrganizationRoleManagerService
{
    public function grant(Organization $organization, User $user, ?User $actor = null): OrganizationRoleManager
    {
        return DB::transaction(function () use ($organization, $user, $actor): OrganizationRoleManager {
            Organization::query()->whereKey($organization->getKey())->lockForUpdate()->firstOrFail();

            OrganizationMembership::query()
                ->where('organization_id', $organization->getKey())
                ->where('user_id', $user->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            return OrganizationRoleManager::query()->firstOrCreate(
                ['organization_id' => $organization->getKey(), 'user_id' => $user->getKey()],
                ['granted_by_user_id' => $actor?->getKey(), 'source' => 'cli'],
            );
        });
    }

    public function revoke(Organization $organization, User $user): bool
    {
        return DB::transaction(function () use ($organization, $user): bool {
            Organization::query()->whereKey($organization->getKey())->lockForUpdate()->firstOrFail();

            $manager = OrganizationRoleManager::query()
                ->where('organization_id', $organization->getKey())
                ->where('user_id', $user->getKey())
                ->lockForUpdate()
                ->first();

            if ($manager === null) {
                return false;
            }

            $managerCount = OrganizationRoleManager::query()
                ->where('organization_id', $organization->getKey())
                ->count();

            if ($managerCount <= 1) {
                throw new LastOrganizationRoleManagerException;
            }

            $manager->delete();

            return true;
        });
    }
}
