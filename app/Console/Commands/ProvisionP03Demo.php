<?php

namespace App\Console\Commands;

use App\Models\User;
use Database\Seeders\P03DemoSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Str;
use JsonException;
use RuntimeException;

class ProvisionP03Demo extends Command
{
    protected $signature = 'p03:provision-demo';

    protected $description = 'Provision repeatable local P03–P05 synthetic organizations, master data, and sales pricing fixtures.';

    private const ACCOUNTS = [
        'editor' => ['email' => 'editor@erp.local', 'name' => 'ویرایشگر آزمایشی'],
        'reader' => ['email' => 'reader@erp.local', 'name' => 'کاربر فقط‌خواندنی'],
    ];

    public function handle(): int
    {
        $credentials = $this->loadOrCreateCredentials();

        app(P03DemoSeeder::class)->run($credentials);

        $this->info('P03 access, P04 master data, and P05 two-product sales pricing fixtures are provisioned.');
        $this->line('Local sign-in credentials are stored in the ignored private storage directory.');

        return self::SUCCESS;
    }

    /** @return array{editor: array{email: string, password: string}, reader: array{email: string, password: string}} */
    private function loadOrCreateCredentials(): array
    {
        $directory = storage_path('app/private');
        $path = $directory.DIRECTORY_SEPARATOR.'p03-demo-credentials.json';
        $lock = fopen($directory.DIRECTORY_SEPARATOR.'p03-demo-credentials.lock', 'c');

        if ($lock === false || ! flock($lock, LOCK_EX | LOCK_NB)) {
            if (is_resource($lock)) {
                fclose($lock);
            }

            throw new RuntimeException('Another P03 demo provisioning command is running.');
        }

        try {
            if (is_file($path)) {
                return $this->validateCredentials($path);
            }

            $emails = array_column(self::ACCOUNTS, 'email');
            if (User::query()->whereIn('email', $emails)->exists()) {
                throw new RuntimeException(
                    'A demo account already exists but its ignored local credential file is missing. '
                    .'Restore the file before provisioning; no password was changed.',
                );
            }

            $credentials = [];
            foreach (self::ACCOUNTS as $key => $account) {
                $credentials[$key] = [
                    'email' => $account['email'],
                    'password' => Str::password(48),
                ];
            }

            $json = json_encode($credentials, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $temporaryPath = $path.'.'.Str::uuid().'.tmp';

            if (file_put_contents($temporaryPath, $json."\n", LOCK_EX) === false || ! rename($temporaryPath, $path)) {
                @unlink($temporaryPath);
                throw new RuntimeException('Could not store the local P03 demo credentials file.');
            }

            return $credentials;
        } catch (JsonException $exception) {
            throw new RuntimeException('Could not encode the local P03 demo credential file.', previous: $exception);
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /** @return array{editor: array{email: string, password: string}, reader: array{email: string, password: string}} */
    private function validateCredentials(string $path): array
    {
        try {
            $credentials = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new RuntimeException('The local P03 demo credential file is not valid JSON.', previous: $exception);
        }

        foreach (self::ACCOUNTS as $key => $account) {
            if (
                ! is_array($credentials[$key] ?? null)
                || ($credentials[$key]['email'] ?? null) !== $account['email']
                || ! is_string($credentials[$key]['password'] ?? null)
                || strlen($credentials[$key]['password']) < 32
            ) {
                throw new RuntimeException('The local P03 demo credential file is incomplete or invalid.');
            }
        }

        return $credentials;
    }
}
