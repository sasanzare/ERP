<?php

namespace App\Console\Commands;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\OrganizationMembership;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Str;
use JsonException;
use RuntimeException;

class ProvisionP08Approver extends Command
{
    protected $signature = 'p08:provision-approver';

    protected $description = 'Provision one local synthetic editor account for independent P08 purchase approval.';

    private const EMAIL = 'p08-approver@erp.local';

    public function handle(): int
    {
        $organization = Organization::query()->where('slug', 'legacy-local')->first();
        if ($organization === null) {
            throw new RuntimeException('The local default organization is missing; provision P03 demo data first.');
        }

        $credentials = $this->loadOrCreateCredentials();
        $user = User::query()->where('email', self::EMAIL)->first();

        if ($user === null) {
            $user = User::query()->create([
                'name' => 'ویرایشگر تأیید P08',
                'email' => self::EMAIL,
                'password' => $credentials['approver']['password'],
            ]);
        }

        $membership = OrganizationMembership::query()
            ->where('organization_id', $organization->getKey())
            ->where('user_id', $user->getKey())
            ->first();

        if ($membership === null) {
            OrganizationMembership::query()->create([
                'organization_id' => $organization->getKey(),
                'user_id' => $user->getKey(),
                'role' => OrganizationRole::Editor->value,
            ]);
        } elseif ($membership->role !== OrganizationRole::Editor->value) {
            throw new RuntimeException('The existing P08 approver membership is not an editor; no role was changed.');
        }

        $this->info('The synthetic P08 approver is available in the default local organization.');
        $this->line('Its sign-in credential is stored in the ignored private storage directory.');

        return self::SUCCESS;
    }

    /** @return array{approver: array{email: string, password: string}} */
    private function loadOrCreateCredentials(): array
    {
        $directory = storage_path('app/private');
        if (! is_dir($directory) && ! mkdir($directory, 0700, true) && ! is_dir($directory)) {
            throw new RuntimeException('Could not create the local private credential directory.');
        }

        $path = $directory.DIRECTORY_SEPARATOR.'p08-approver-credentials.json';
        $lock = fopen($directory.DIRECTORY_SEPARATOR.'p08-approver-credentials.lock', 'c');

        if ($lock === false || ! flock($lock, LOCK_EX | LOCK_NB)) {
            if (is_resource($lock)) {
                fclose($lock);
            }

            throw new RuntimeException('Another P08 approver provisioning command is running.');
        }

        try {
            if (is_file($path)) {
                return $this->validateCredentials($path);
            }

            if (User::query()->where('email', self::EMAIL)->exists()) {
                throw new RuntimeException(
                    'The P08 approver account already exists but its ignored local credential file is missing. '
                    .'Restore the file; no password or role was changed.',
                );
            }

            $credentials = ['approver' => ['email' => self::EMAIL, 'password' => Str::password(48)]];
            $json = json_encode($credentials, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $temporaryPath = $path.'.'.Str::uuid().'.tmp';

            if (file_put_contents($temporaryPath, $json."\n", LOCK_EX) === false || ! rename($temporaryPath, $path)) {
                @unlink($temporaryPath);
                throw new RuntimeException('Could not store the local P08 approver credential file.');
            }

            return $credentials;
        } catch (JsonException $exception) {
            throw new RuntimeException('Could not encode the local P08 approver credential file.', previous: $exception);
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /** @return array{approver: array{email: string, password: string}} */
    private function validateCredentials(string $path): array
    {
        try {
            $credentials = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new RuntimeException('The local P08 approver credential file is not valid JSON.', previous: $exception);
        }

        if (! is_array($credentials['approver'] ?? null)
            || ($credentials['approver']['email'] ?? null) !== self::EMAIL
            || ! is_string($credentials['approver']['password'] ?? null)
            || strlen($credentials['approver']['password']) < 32) {
            throw new RuntimeException('The local P08 approver credential file is incomplete or invalid.');
        }

        return $credentials;
    }
}
