<?php

namespace App\Policies;

use App\Enums\OrganizationRole;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class ProductPolicy
{
    public function update(User $user, Product $product): bool
    {
        return DB::table('organization_memberships')
            ->where('organization_id', $product->organization_id)
            ->where('user_id', $user->getKey())
            ->where('role', OrganizationRole::Editor->value)
            ->exists();
    }
}
