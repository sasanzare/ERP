<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WorkspaceEntryTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();

        $organization = Organization::query()->create(['name' => 'سازمان آزمون', 'slug' => 'workspace-test']);
        $this->user = User::factory()->create();
        $this->user->organizations()->attach($organization, ['role' => OrganizationRole::Reader->value]);
    }

    public function test_workspace_entry_routes_serve_the_react_shell(): void
    {
        $this->actingAs($this->user);

        foreach (['/', '/products', '/products/1'] as $path) {
            $this->get($path)
                ->assertOk()
                ->assertViewIs('products')
                ->assertSee('<div id="app" data-page="workspace"></div>', false);
        }
    }

    public function test_numeric_unknown_product_id_still_loads_the_workspace_entry(): void
    {
        $this->actingAs($this->user);

        $this->get('/products/999999')
            ->assertOk()
            ->assertViewIs('products');
    }

    public function test_non_numeric_product_path_is_not_a_workspace_entry_route(): void
    {
        $this->get('/products/not-an-id')->assertNotFound();
    }

    public function test_guest_workspace_navigation_redirects_to_sign_in(): void
    {
        $this->get('/products')->assertRedirect('/sign-in');
    }
}
