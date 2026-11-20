<?php

namespace Tests;

use App\Support\DatabaseTestSafetyGuard;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function csrfHeaders(): array
    {
        return ['X-CSRF-TOKEN' => $this->app['session']->driver()->token()];
    }

    protected function setUp(): void
    {
        DatabaseTestSafetyGuard::assertCurrentEnvironmentIsSafe();

        parent::setUp();
    }
}
