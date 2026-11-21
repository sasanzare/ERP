<?php

namespace Database\Seeders;

use App\Models\Organization;
use App\Models\PriceList;
use App\Models\PriceListEntry;
use App\Models\Product;
use App\Models\Unit;
use Illuminate\Database\Seeder;

class P05DemoSeeder extends Seeder
{
    public function run(Organization $organization): void
    {
        $unit = Unit::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'EA'],
            ['name' => 'عدد', 'symbol' => 'عدد', 'is_active' => true],
        );

        $firstProduct = Product::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'P05-DEMO-001'],
            ['name' => 'کالای فروش نمونه ۱', 'base_unit_id' => $unit->getKey()],
        );
        $secondProduct = Product::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'P05-DEMO-002'],
            ['name' => 'کالای فروش نمونه ۲', 'base_unit_id' => $unit->getKey()],
        );
        $list = PriceList::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'P05-QUOTE'],
            ['name' => 'فهرست پیش‌فاکتور نمونه'],
        );

        if ($firstProduct->base_unit_id !== null) {
            PriceListEntry::query()->firstOrCreate(
                ['organization_id' => $organization->getKey(), 'price_list_id' => $list->getKey(), 'product_id' => $firstProduct->getKey()],
                ['amount_rial' => '1200000'],
            );
        }
        if ($secondProduct->base_unit_id !== null) {
            PriceListEntry::query()->firstOrCreate(
                ['organization_id' => $organization->getKey(), 'price_list_id' => $list->getKey(), 'product_id' => $secondProduct->getKey()],
                ['amount_rial' => '1350000'],
            );
        }
    }
}
