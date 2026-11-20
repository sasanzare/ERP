<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class SessionAuthenticationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
    }

    public function test_sign_in_page_is_available_and_bad_credentials_use_a_generic_message(): void
    {
        $this->get('/sign-in')->assertOk()->assertSee('data-page="sign-in"', false);

        $this->postJson('/login', ['email' => 'nobody@example.test', 'password' => 'incorrect'], $this->csrfHeaders())
            ->assertUnprocessable()
            ->assertExactJson(['message' => 'ایمیل یا گذرواژه معتبر نیست.']);
    }

    public function test_successful_login_opens_the_workspace_and_logout_invalidates_access(): void
    {
        $organization = Organization::query()->create(['name' => 'سازمان ورود', 'slug' => 'auth-test']);
        $user = User::factory()->create(['password' => 'local-test-password']);
        $user->organizations()->attach($organization, ['role' => OrganizationRole::Reader->value]);

        $this->get('/sign-in')->assertOk();
        $sessionIdBeforeLogin = $this->app['session']->driver()->getId();

        $this->postJson('/login', ['email' => $user->email, 'password' => 'local-test-password'], $this->csrfHeaders())
            ->assertOk()
            ->assertJsonPath('redirect', '/products');

        $this->assertNotSame($sessionIdBeforeLogin, $this->app['session']->driver()->getId());

        $this->get('/products')->assertOk();
        $this->getJson('/api/v1/products')->assertOk();

        $this->postJson('/logout', [], $this->csrfHeaders())->assertOk()->assertJsonPath('redirect', '/sign-in');
        $this->get('/products')->assertRedirect('/sign-in');
        $this->getJson('/api/v1/products')->assertUnauthorized();
    }

    public function test_authenticated_user_without_memberships_sees_the_denied_state(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->get('/products')->assertRedirect('/access-denied');
        $this->actingAs($user)->get('/access-denied')->assertOk()->assertSee('data-page="denied"', false);
        $this->actingAs($user)->getJson('/api/v1/products')->assertForbidden();
    }

    public function test_login_throttles_repeated_failures(): void
    {
        RateLimiter::clear(hash('sha256', 'missing@example.test|127.0.0.1'));
        $this->get('/sign-in')->assertOk();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/login', ['email' => 'missing@example.test', 'password' => 'incorrect'], $this->csrfHeaders())
                ->assertUnprocessable();
        }

        $this->postJson('/login', ['email' => 'missing@example.test', 'password' => 'incorrect'], $this->csrfHeaders())
            ->assertTooManyRequests();
    }
}
