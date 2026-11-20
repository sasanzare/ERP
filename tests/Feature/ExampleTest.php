<?php

namespace Tests\Feature;

// use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * A basic test example.
     */
    public function test_workspace_navigation_requires_a_session(): void
    {
        $response = $this->get('/');

        $response->assertRedirect('/sign-in');
    }
}
