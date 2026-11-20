<?php

namespace Database\Seeders;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\Product;
use App\Models\User;
use App\Services\MembershipRoleService;
use Illuminate\Database\Seeder;

class P03DemoSeeder extends Seeder
{
    /** @param array{editor: array{email: string, password: string}, reader: array{email: string, password: string}} $credentials */
    public function run(array $credentials): void
    {
        $organizationA = Organization::query()->firstOrCreate(
            ['slug' => 'legacy-local'],
            ['name' => 'سازمان پیش‌فرض'],
        );
        $organizationB = Organization::query()->firstOrCreate(
            ['slug' => 'demo-organization-b'],
            ['name' => 'سازمان آزمایشی ب'],
        );

        $this->call(ProductSeeder::class);

        Product::query()->firstOrCreate(
            ['organization_id' => $organizationB->getKey(), 'code' => 'DEMO-001'],
            ['name' => 'کالای نمونه سازمان ب'],
        );

        $editor = User::query()->firstOrCreate(
            ['email' => $credentials['editor']['email']],
            ['name' => 'ویرایشگر آزمایشی', 'password' => $credentials['editor']['password']],
        );
        $reader = User::query()->firstOrCreate(
            ['email' => $credentials['reader']['email']],
            ['name' => 'کاربر فقط‌خواندنی', 'password' => $credentials['reader']['password']],
        );

        $roleService = app(MembershipRoleService::class);
        $roleService->assign($organizationA, $editor, OrganizationRole::Editor);
        $roleService->assign($organizationB, $editor, OrganizationRole::Reader);
        $roleService->assign($organizationA, $reader, OrganizationRole::Reader);
    }
}
