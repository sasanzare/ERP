<?php

namespace Database\Seeders;

use App\Models\Organization;
use App\Models\Product;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    public function run(): void
    {
        $organization = Organization::query()->firstOrCreate(
            ['slug' => 'legacy-local'],
            ['name' => 'سازمان پیش‌فرض'],
        );

        Product::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'DEMO-001'],
            ['name' => 'کالای نمونه'],
        );
    }
}
