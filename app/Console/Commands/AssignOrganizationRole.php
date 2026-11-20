<?php

namespace App\Console\Commands;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Services\MembershipRoleService;
use Illuminate\Console\Command;

class AssignOrganizationRole extends Command
{
    protected $signature = 'organization:assign-role {organization} {email} {role} {--actor=}';

    protected $description = 'Assign or change one membership role and write its audit record.';

    public function handle(MembershipRoleService $roles): int
    {
        $organization = Organization::query()->where('slug', $this->argument('organization'))->first();
        $subject = User::query()->where('email', mb_strtolower((string) $this->argument('email')))->first();
        $role = OrganizationRole::tryFrom((string) $this->argument('role'));
        $actorEmail = $this->option('actor');
        $actor = $actorEmail === null ? null : User::query()->where('email', mb_strtolower($actorEmail))->first();

        if ($organization === null || $subject === null || $role === null || ($actorEmail !== null && $actor === null)) {
            $this->error('Organization, user, role, or actor was not found.');

            return self::INVALID;
        }

        $roles->assign($organization, $subject, $role, $actor);
        $this->info('Membership role assignment is current; unchanged assignments do not add audit entries.');

        return self::SUCCESS;
    }
}
