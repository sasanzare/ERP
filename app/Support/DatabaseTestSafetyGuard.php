<?php

namespace App\Support;

use LogicException;

final class DatabaseTestSafetyGuard
{
    /**
     * @param array<string, string|null> $environment
     */
    public static function assertSafe(array $environment): void
    {
        $expected = [
            'APP_ENV' => 'testing',
            'DB_CONNECTION' => 'mariadb',
            'DB_HOST' => '127.0.0.1',
            'DB_DATABASE' => 'erp_test',
            'DB_USERNAME' => 'erp_test',
        ];

        foreach ($expected as $key => $value) {
            if (($environment[$key] ?? null) !== $value) {
                throw new LogicException("Refusing database tests: {$key} must be configured for the local erp_test schema.");
            }
        }

        $port = $environment['DB_PORT'] ?? null;
        $forwardPort = $environment['DB_FORWARD_PORT'] ?? null;

        if (! is_string($port) || ! ctype_digit($port) || (int) $port < 1 || (int) $port > 65535 || $port !== $forwardPort) {
            throw new LogicException('Refusing database tests: DB_PORT must match the configured local DB_FORWARD_PORT.');
        }

        if (($environment['DB_URL'] ?? '') !== '' || ($environment['DB_SOCKET'] ?? '') !== '') {
            throw new LogicException('Refusing database tests: URL and socket overrides are not allowed.');
        }
    }

    public static function assertCurrentEnvironmentIsSafe(): void
    {
        $keys = [
            'APP_ENV',
            'DB_CONNECTION',
            'DB_HOST',
            'DB_PORT',
            'DB_FORWARD_PORT',
            'DB_DATABASE',
            'DB_USERNAME',
            'DB_URL',
            'DB_SOCKET',
        ];
        $testingEnvironment = dirname(__DIR__, 2).'/.env.testing';

        if (! is_file($testingEnvironment)) {
            throw new LogicException('Refusing database tests: .env.testing is required.');
        }

        $fileValues = \Dotenv\Dotenv::parse((string) file_get_contents($testingEnvironment));
        $environment = [];

        foreach ($keys as $key) {
            $value = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);

            if ($value === false || $value === null) {
                $value = $fileValues[$key] ?? null;
            }

            $environment[$key] = $value === false ? null : (string) $value;
        }

        self::assertSafe($environment);

        foreach ($fileValues as $key => $value) {
            if (array_key_exists($key, $_ENV) || array_key_exists($key, $_SERVER) || getenv($key) !== false) {
                continue;
            }

            putenv("{$key}={$value}");
            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;
        }
    }
}
