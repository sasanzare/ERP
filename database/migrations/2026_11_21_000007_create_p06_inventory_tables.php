<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_locks', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('location_id');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['organization_id', 'product_id', 'location_id'], 'stock_locks_key_unique');
            $table->foreign(['organization_id', 'product_id'], 'stock_locks_organization_product_fk')
                ->references(['organization_id', 'id'])->on('products')->restrictOnDelete();
            $table->foreign(['organization_id', 'location_id'], 'stock_locks_organization_location_fk')
                ->references(['organization_id', 'id'])->on('locations')->restrictOnDelete();
        });

        Schema::create('inventory_operations', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('base_unit_id');
            $table->string('operation_type', 16);
            $table->unsignedBigInteger('quantity_milli');
            $table->unsignedBigInteger('from_location_id')->nullable();
            $table->unsignedBigInteger('to_location_id')->nullable();
            $table->string('product_code_snapshot', 64);
            $table->string('product_name_snapshot', 255);
            $table->string('unit_code_snapshot', 64);
            $table->string('unit_name_snapshot', 160);
            $table->string('unit_symbol_snapshot', 32);
            $table->string('from_location_code_snapshot', 64)->nullable();
            $table->string('from_location_name_snapshot', 160)->nullable();
            $table->string('to_location_code_snapshot', 64)->nullable();
            $table->string('to_location_name_snapshot', 160)->nullable();
            $table->uuid('idempotency_key');
            $table->char('request_hash', 64);
            $table->unsignedBigInteger('actor_id');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['organization_id', 'id'], 'inventory_operations_organization_id_unique');
            $table->unique(['organization_id', 'idempotency_key'], 'inventory_operations_idempotency_unique');
            $table->index(['organization_id', 'product_id', 'operation_type', 'to_location_id'], 'inventory_operations_opening_lookup');
            $table->index(['organization_id', 'created_at'], 'inventory_operations_history_index');
            $table->foreign('organization_id')->references('id')->on('organizations')->restrictOnDelete();
            $table->foreign(['organization_id', 'product_id'], 'inventory_operations_organization_product_fk')
                ->references(['organization_id', 'id'])->on('products')->restrictOnDelete();
            $table->foreign(['organization_id', 'base_unit_id'], 'inventory_operations_organization_unit_fk')
                ->references(['organization_id', 'id'])->on('units')->restrictOnDelete();
            $table->foreign(['organization_id', 'from_location_id'], 'inventory_operations_from_location_fk')
                ->references(['organization_id', 'id'])->on('locations')->restrictOnDelete();
            $table->foreign(['organization_id', 'to_location_id'], 'inventory_operations_to_location_fk')
                ->references(['organization_id', 'id'])->on('locations')->restrictOnDelete();
            $table->foreign('actor_id')->references('id')->on('users')->restrictOnDelete();
        });

        Schema::create('inventory_movements', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('operation_id');
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('base_unit_id');
            $table->unsignedBigInteger('location_id');
            $table->string('direction', 8);
            $table->unsignedBigInteger('quantity_milli');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['operation_id', 'location_id', 'direction'], 'inventory_movements_operation_leg_unique');
            $table->index(['organization_id', 'product_id', 'location_id'], 'inventory_movements_stock_key_index');
            $table->foreign(['organization_id', 'operation_id'], 'inventory_movements_operation_fk')
                ->references(['organization_id', 'id'])->on('inventory_operations')->cascadeOnDelete();
            $table->foreign(['organization_id', 'product_id'], 'inventory_movements_product_fk')
                ->references(['organization_id', 'id'])->on('products')->restrictOnDelete();
            $table->foreign(['organization_id', 'base_unit_id'], 'inventory_movements_unit_fk')
                ->references(['organization_id', 'id'])->on('units')->restrictOnDelete();
            $table->foreign(['organization_id', 'location_id'], 'inventory_movements_location_fk')
                ->references(['organization_id', 'id'])->on('locations')->restrictOnDelete();
        });

        Schema::create('stock_reservations', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('base_unit_id');
            $table->unsignedBigInteger('location_id');
            $table->unsignedBigInteger('quantity_milli');
            $table->string('status', 12)->default('open');
            $table->string('product_code_snapshot', 64);
            $table->string('product_name_snapshot', 255);
            $table->string('unit_code_snapshot', 64);
            $table->string('unit_name_snapshot', 160);
            $table->string('unit_symbol_snapshot', 32);
            $table->string('location_code_snapshot', 64);
            $table->string('location_name_snapshot', 160);
            $table->uuid('idempotency_key');
            $table->char('request_hash', 64);
            $table->unsignedBigInteger('created_by');
            $table->timestamp('created_at')->useCurrent();
            $table->unsignedBigInteger('released_by')->nullable();
            $table->timestamp('released_at')->nullable();
            $table->unique(['organization_id', 'id'], 'stock_reservations_organization_id_unique');
            $table->unique(['organization_id', 'idempotency_key'], 'stock_reservations_idempotency_unique');
            $table->index(['organization_id', 'status', 'product_id', 'location_id'], 'stock_reservations_open_lookup');
            $table->foreign('organization_id')->references('id')->on('organizations')->restrictOnDelete();
            $table->foreign(['organization_id', 'product_id'], 'stock_reservations_product_fk')
                ->references(['organization_id', 'id'])->on('products')->restrictOnDelete();
            $table->foreign(['organization_id', 'base_unit_id'], 'stock_reservations_unit_fk')
                ->references(['organization_id', 'id'])->on('units')->restrictOnDelete();
            $table->foreign(['organization_id', 'location_id'], 'stock_reservations_location_fk')
                ->references(['organization_id', 'id'])->on('locations')->restrictOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->restrictOnDelete();
            $table->foreign('released_by')->references('id')->on('users')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_reservations');
        Schema::dropIfExists('inventory_movements');
        Schema::dropIfExists('inventory_operations');
        Schema::dropIfExists('stock_locks');
    }
};
