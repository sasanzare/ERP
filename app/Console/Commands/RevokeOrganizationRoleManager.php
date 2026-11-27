<?php

namespace App\Console\Commands;

use App\Exceptions\LastOrganizationRoleManagerException;
use App\Models\Organization;
use App\Models\User;
use App\Services\OrganizationRoleManagerService;
use Illuminate\Console\Command;

class RevokeOrganizationRoleManager extends Command
{
    protected $signature = 'organization:revoke-role-manager {organization} {email}';

    protected $description = 'Remove a local membership-role manager when another manager remains.';

    public function handle(OrganizationRoleManagerService $managers): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('Role manager provisioning is limited to local and testing environments.');

            return self::FAILURE;
        }

        $organization = Organization::query()->where('slug', $this->argument('organization'))->first();
        $user = User::query()->where('email', mb_strtolower((string) $this->argument('email')))->first();

        if ($organization === null || $user === null) {
            $this->error('Organization or user was not found.');

            return self::INVALID;
        }

        try {
            $removed = $managers->revoke($organization, $user);
        } catch (LastOrganizationRoleManagerException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $this->info($removed ? 'Role manager was removed.' : 'No role-manager assignment existed.');

        return self::SUCCESS;
    }
}
