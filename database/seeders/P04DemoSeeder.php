<?php

namespace Database\Seeders;

use App\Models\Location;
use App\Models\Organization;
use App\Models\Party;
use App\Models\PartyRole;
use App\Models\PriceList;
use App\Models\PriceListEntry;
use App\Models\Product;
use App\Models\Unit;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;

class P04DemoSeeder extends Seeder
{
    public function run(Organization $organization): void
    {
        $each = Unit::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'EA'],
            ['name' => 'عدد', 'symbol' => 'عدد', 'is_active' => true],
        );
        Unit::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'KG'],
            ['name' => 'کیلوگرم', 'symbol' => 'kg', 'is_active' => true],
        );

        $otherOrganization = Organization::query()->where('slug', 'demo-organization-b')->first();
        if ($otherOrganization !== null) {
            Unit::query()->firstOrCreate(
                ['organization_id' => $otherOrganization->getKey(), 'code' => 'EA'],
                ['name' => 'عدد', 'symbol' => 'عدد', 'is_active' => true],
            );
        }

        $priceableProduct = Product::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'DEMO-002'],
            ['name' => 'کالای قیمت‌پذیر نمونه', 'base_unit_id' => $each->getKey()],
        );

        $party = Party::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'DEMO-PARTY-001'],
            ['display_name' => 'طرف مشترک آزمایشی'],
        );
        foreach (['customer', 'supplier'] as $role) {
            PartyRole::query()->firstOrCreate([
                'organization_id' => $organization->getKey(),
                'party_id' => $party->getKey(),
                'role' => $role,
            ]);
        }

        $mainWarehouse = Warehouse::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'WH-MAIN'],
            ['name' => 'انبار اصلی نمونه'],
        );
        $secondaryWarehouse = Warehouse::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'WH-SECOND'],
            ['name' => 'انبار دوم نمونه'],
        );
        Location::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'LOC-A-01'],
            ['warehouse_id' => $mainWarehouse->getKey(), 'name' => 'قفسه A-01'],
        );
        Location::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'LOC-B-01'],
            ['warehouse_id' => $secondaryWarehouse->getKey(), 'name' => 'قفسه B-01'],
        );

        $firstList = PriceList::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'RETAIL-A'],
            ['name' => 'خرده‌فروشی الف'],
        );
        $secondList = PriceList::query()->firstOrCreate(
            ['organization_id' => $organization->getKey(), 'code' => 'RETAIL-B'],
            ['name' => 'خرده‌فروشی ب'],
        );

        if ($priceableProduct->base_unit_id !== null) {
            foreach ([[$firstList, '120000'], [$secondList, '135000']] as [$list, $amount]) {
                PriceListEntry::query()->firstOrCreate(
                    [
                        'organization_id' => $organization->getKey(),
                        'price_list_id' => $list->getKey(),
                        'product_id' => $priceableProduct->getKey(),
                    ],
                    ['amount_rial' => $amount],
                );
            }
        }
    }
}
