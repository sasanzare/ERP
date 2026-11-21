<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('parties', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->restrictOnDelete();
            $table->string('code', 64);
            $table->string('display_name', 255);
            $table->timestamps();
            $table->unique(['organization_id', 'id'], 'parties_organization_id_id_unique');
            $table->unique(['organization_id', 'code'], 'parties_organization_code_unique');
            $table->index(['organization_id', 'display_name'], 'parties_organization_name_index');
        });

        Schema::create('party_roles', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('party_id');
            $table->string('role', 24);
            $table->timestamps();
            $table->unique(['organization_id', 'party_id', 'role'], 'party_roles_organization_party_role_unique');
            $table->index(['organization_id', 'role', 'party_id'], 'party_roles_organization_role_party_index');
            $table->foreign(['organization_id', 'party_id'], 'party_roles_organization_party_fk')
                ->references(['organization_id', 'id'])->on('parties')->cascadeOnDelete();
        });

        Schema::create('units', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->restrictOnDelete();
            $table->string('code', 64);
            $table->string('name', 120);
            $table->string('symbol', 32);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['organization_id', 'id'], 'units_organization_id_id_unique');
            $table->unique(['organization_id', 'code'], 'units_organization_code_unique');
            $table->index(['organization_id', 'name'], 'units_organization_name_index');
        });

        Schema::create('warehouses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->restrictOnDelete();
            $table->string('code', 64);
            $table->string('name', 160);
            $table->timestamps();
            $table->unique(['organization_id', 'id'], 'warehouses_organization_id_id_unique');
            $table->unique(['organization_id', 'code'], 'warehouses_organization_code_unique');
            $table->index(['organization_id', 'name'], 'warehouses_organization_name_index');
        });

        Schema::create('locations', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('warehouse_id');
            $table->string('code', 64);
            $table->string('name', 160);
            $table->timestamps();
            $table->unique(['organization_id', 'id'], 'locations_organization_id_id_unique');
            $table->unique(['organization_id', 'code'], 'locations_organization_code_unique');
            $table->index(['organization_id', 'warehouse_id', 'name'], 'locations_organization_warehouse_name_index');
            $table->foreign(['organization_id', 'warehouse_id'], 'locations_organization_warehouse_fk')
                ->references(['organization_id', 'id'])->on('warehouses')->restrictOnDelete();
        });

        Schema::table('products', function (Blueprint $table): void {
            // P03 products have no known unit. Keep that state explicit until a user assigns one.
            $table->unsignedBigInteger('base_unit_id')->nullable()->after('organization_id');
            $table->unique(['organization_id', 'id'], 'products_organization_id_id_unique');
            $table->foreign(['organization_id', 'base_unit_id'], 'products_organization_base_unit_fk')
                ->references(['organization_id', 'id'])->on('units')->restrictOnDelete();
        });

        Schema::create('price_lists', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->restrictOnDelete();
            $table->string('code', 64);
            $table->string('name', 160);
            $table->timestamps();
            $table->unique(['organization_id', 'id'], 'price_lists_organization_id_id_unique');
            $table->unique(['organization_id', 'code'], 'price_lists_organization_code_unique');
            $table->index(['organization_id', 'name'], 'price_lists_organization_name_index');
        });

        Schema::create('price_list_entries', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('price_list_id');
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('amount_rial');
            $table->timestamps();
            $table->unique(['organization_id', 'price_list_id', 'product_id'], 'price_entries_organization_list_product_unique');
            $table->index(['organization_id', 'product_id'], 'price_entries_organization_product_index');
            $table->foreign(['organization_id', 'price_list_id'], 'price_entries_organization_list_fk')
                ->references(['organization_id', 'id'])->on('price_lists')->cascadeOnDelete();
            $table->foreign(['organization_id', 'product_id'], 'price_entries_organization_product_fk')
                ->references(['organization_id', 'id'])->on('products')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('price_list_entries');
        Schema::dropIfExists('price_lists');

        Schema::table('products', function (Blueprint $table): void {
            $table->dropForeign('products_organization_base_unit_fk');
            $table->dropUnique('products_organization_id_id_unique');
            $table->dropColumn('base_unit_id');
        });

        Schema::dropIfExists('locations');
        Schema::dropIfExists('warehouses');
        Schema::dropIfExists('units');
        Schema::dropIfExists('party_roles');
        Schema::dropIfExists('parties');
    }
};
