<?php

namespace App\Services\Parties;

use App\Models\Organization;
use App\Models\Party;
use Illuminate\Database\Eloquent\Builder;

class PartyRegisterQuery
{
    public function make(Organization $organization, string $search = '', ?string $role = null): Builder
    {
        $query = Party::query()->where('organization_id', $organization->getKey());
        $search = trim($search);

        if ($role !== null && $role !== '') {
            $query->whereHas('roles', fn (Builder $roles) => $roles
                ->where('organization_id', $organization->getKey())
                ->where('role', $role));
        }

        if ($search !== '') {
            $query->where(function (Builder $nested) use ($search): void {
                $nested->where('code', 'like', '%'.$search.'%')
                    ->orWhere('display_name', 'like', '%'.$search.'%');
            });
        }

        return $query;
    }
}
