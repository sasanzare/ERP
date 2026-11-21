<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

abstract class MasterDataController extends Controller
{
    protected function activeOrganization(Request $request): Organization
    {
        $organization = $request->attributes->get('activeOrganization');

        abort_unless($organization instanceof Organization, 403);
        Gate::authorize('viewMasterData', $organization);

        return $organization;
    }

    protected function authorizeManage(Organization $organization): void
    {
        Gate::authorize('manageMasterData', $organization);
    }

    protected function rejectOrganizationOverride(Request $request): void
    {
        if (array_key_exists('organization_id', $request->all())) {
            throw ValidationException::withMessages([
                'organization_id' => 'سازمان از نشست فعال تعیین می‌شود و از درخواست پذیرفته نمی‌شود.',
            ]);
        }
    }

    protected function codeRules(string $table, int $organizationId, ?int $ignoreId = null): array
    {
        $unique = Rule::unique($table, 'code')->where('organization_id', $organizationId);

        if ($ignoreId !== null) {
            $unique->ignore($ignoreId);
        }

        return ['required', 'string', 'max:64', $unique];
    }

    /** @param Builder<Model> $query */
    protected function applySearch(Builder $query, Request $request, int $organizationId, array $columns): Builder
    {
        $validated = $request->validate([
            'q' => ['sometimes', 'nullable', 'string', 'max:120'],
        ]);
        $search = trim((string) ($validated['q'] ?? ''));

        if ($search === '') {
            return $query;
        }

        return $query->where(function (Builder $nested) use ($search, $columns): void {
            foreach ($columns as $column) {
                $nested->orWhere($column, 'like', '%'.$search.'%');
            }
        })->where('organization_id', $organizationId);
    }
}
