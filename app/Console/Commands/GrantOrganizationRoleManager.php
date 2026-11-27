<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Models\User;
use App\Services\OrganizationRoleManagerService;
use Illuminate\Console\Command;

class GrantOrganizationRoleManager extends Command
{
    protected $signature = 'organization:grant-role-manager {organization} {email} {--actor=}';

    protected $description = 'Explicitly provision local authority to manage membership roles for one organization.';

    public function handle(OrganizationRoleManagerService $managers): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('Role manager provisioning is limited to local and testing environments.');

            return self::FAILURE;
        }

        $organization = Organization::query()->where('slug', $this->argument('organization'))->first();
        $email = mb_strtolower((string) $this->argument('email'));
        $user = User::query()->where('email', $email)->first();
        $actorEmail = $this->option('actor');
        $actor = $actorEmail === null ? null : User::query()->where('email', mb_strtolower((string) $actorEmail))->first();

        if ($organization === null || $user === null || ($actorEmail !== null && $actor === null)) {
            $this->error('Organization, user, or optional actor was not found.');

            return self::INVALID;
        }

        $managers->grant($organization, $user, $actor);
        $this->info('Role management is provisioned for this organization; repeated grants are unchanged.');

        return self::SUCCESS;
    }
}
