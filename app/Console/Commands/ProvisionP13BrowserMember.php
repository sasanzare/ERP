<?php

namespace App\Console\Commands;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\OrganizationMembership;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class ProvisionP13BrowserMember extends Command
{
    protected $signature = 'p13:provision-browser-member {organization} {email}';

    protected $description = 'Provision one local synthetic reader membership for P13 browser acceptance.';

    public function handle(): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('P13 browser fixtures are limited to local and testing environments.');

            return self::FAILURE;
        }

        $organization = Organization::query()->where('slug', $this->argument('organization'))->first();
        $email = mb_strtolower((string) $this->argument('email'));

        if ($organization === null || filter_var($email, FILTER_VALIDATE_EMAIL) === false || ! str_ends_with($email, '.test')) {
            $this->error('Use an existing organization and a synthetic .test email address.');

            return self::INVALID;
        }

        $user = User::query()->firstOrCreate(
            ['email' => $email],
            ['name' => 'عضو آزمایشی P13', 'password' => Hash::make(Str::random(64))],
        );

        OrganizationMembership::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'user_id' => $user->getKey()],
            ['role' => OrganizationRole::Reader->value],
        );

        $this->info('Synthetic P13 member is ready; existing membership roles were preserved.');

        return self::SUCCESS;
    }
}
