<?php

namespace App\Policies;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;

class OrganizationPolicy
{
    public function viewMasterData(User $user, Organization $organization): bool
    {
        return $organization->memberships()
            ->where('user_id', $user->getKey())
            ->exists();
    }

    public function manageMasterData(User $user, Organization $organization): bool
    {
        return $organization->memberships()
            ->where('user_id', $user->getKey())
            ->where('role', OrganizationRole::Editor->value)
            ->exists();
    }

    public function viewSales(User $user, Organization $organization): bool
    {
        return $organization->memberships()
            ->where('user_id', $user->getKey())
            ->exists();
    }

    public function manageSales(User $user, Organization $organization): bool
    {
        return $organization->memberships()
            ->where('user_id', $user->getKey())
            ->where('role', OrganizationRole::Editor->value)
            ->exists();
    }

    public function viewStock(User $user, Organization $organization): bool
    {
        return $organization->memberships()
            ->where('user_id', $user->getKey())
            ->exists();
    }

    public function manageStock(User $user, Organization $organization): bool
    {
        return $organization->memberships()
            ->where('user_id', $user->getKey())
            ->where('role', OrganizationRole::Editor->value)
            ->exists();
    }
}
