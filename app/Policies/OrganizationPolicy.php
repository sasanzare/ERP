<?php

namespace App\Policies;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\OrganizationRoleManager;
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

    public function viewPurchasing(User $user, Organization $organization): bool
    {
        return $organization->memberships()
            ->where('user_id', $user->getKey())
            ->exists();
    }

    public function managePurchasing(User $user, Organization $organization): bool
    {
        return $organization->memberships()
            ->where('user_id', $user->getKey())
            ->where('role', OrganizationRole::Editor->value)
            ->exists();
    }

    public function viewAccounting(User $user, Organization $organization): bool
    {
        return $organization->memberships()
            ->where('user_id', $user->getKey())
            ->exists();
    }

    public function manageAccounting(User $user, Organization $organization): bool
    {
        return $organization->memberships()
            ->where('user_id', $user->getKey())
            ->where('role', OrganizationRole::Editor->value)
            ->exists();
    }

    public function viewWork(User $user, Organization $organization): bool
    {
        return $organization->memberships()
            ->where('user_id', $user->getKey())
            ->exists();
    }

    public function manageWork(User $user, Organization $organization): bool
    {
        return $organization->memberships()
            ->where('user_id', $user->getKey())
            ->where('role', OrganizationRole::Editor->value)
            ->exists();
    }

    public function viewMembershipRoles(User $user, Organization $organization): bool
    {
        return OrganizationRoleManager::query()
            ->where('organization_id', $organization->getKey())
            ->where('user_id', $user->getKey())
            ->exists();
    }

    public function manageMembershipRoles(User $user, Organization $organization): bool
    {
        return $this->viewMembershipRoles($user, $organization);
    }

    public function viewMembershipRoleHistory(User $user, Organization $organization): bool
    {
        return $this->viewMembershipRoles($user, $organization);
    }
}
