<?php

namespace Tests\Unit;

use App\Support\DatabaseTestSafetyGuard;
use LogicException;
use PHPUnit\Framework\TestCase;

class DatabaseTestSafetyGuardTest extends TestCase
{
    public function test_it_rejects_the_development_schema_without_connecting_to_a_database(): void
    {
        $this->expectException(LogicException::class);

        DatabaseTestSafetyGuard::assertSafe([
            'APP_ENV' => 'testing',
            'DB_CONNECTION' => 'mariadb',
            'DB_HOST' => '127.0.0.1',
            'DB_PORT' => '3307',
            'DB_FORWARD_PORT' => '3307',
            'DB_DATABASE' => 'erp_dev',
            'DB_USERNAME' => 'erp_app',
            'DB_URL' => '',
            'DB_SOCKET' => '',
        ]);
    }
}
