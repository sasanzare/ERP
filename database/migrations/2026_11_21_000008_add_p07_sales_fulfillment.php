<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_order_lines', function (Blueprint $table): void {
            $table->unsignedBigInteger('cancelled_quantity_milli')->default(0)->after('line_net_toman');
            $table->unsignedBigInteger('cancelled_by')->nullable()->after('cancelled_quantity_milli');
            $table->dateTime('cancelled_at')->nullable()->after('cancelled_by');
            $table->foreign('cancelled_by', 'sales_order_lines_cancelled_by_fk')
                ->references('id')->on('users')->restrictOnDelete();
        });

        Schema::table('stock_reservations', function (Blueprint $table): void {
            $table->unsignedBigInteger('sales_order_line_id')->nullable()->after('location_id');
            $table->unsignedBigInteger('consumed_quantity_milli')->default(0)->after('quantity_milli');
            $table->unsignedBigInteger('released_quantity_milli')->default(0)->after('consumed_quantity_milli');
            $table->index(['organization_id', 'sales_order_line_id', 'status'], 'stock_reservations_sales_line_status_index');
            $table->foreign(['organization_id', 'sales_order_line_id'], 'stock_reservations_sales_line_fk')
                ->references(['organization_id', 'id'])->on('sales_order_lines')->restrictOnDelete();
        });

        Schema::table('inventory_movements', function (Blueprint $table): void {
            $table->unique(['organization_id', 'operation_id', 'id'], 'inventory_movements_org_operation_id_unique');
        });

        Schema::create('sales_order_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('sales_order_line_id');
            $table->unsignedBigInteger('stock_reservation_id');
            $table->unsignedBigInteger('inventory_operation_id');
            $table->unsignedBigInteger('inventory_movement_id');
            $table->unsignedBigInteger('quantity_milli');
            $table->uuid('idempotency_key');
            $table->char('request_hash', 64);
            $table->unsignedBigInteger('actor_id');
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['organization_id', 'id'], 'sales_order_deliveries_organization_id_unique');
            $table->unique(['organization_id', 'idempotency_key'], 'sales_order_deliveries_idempotency_unique');
            $table->unique(['organization_id', 'inventory_operation_id'], 'sales_order_deliveries_operation_unique');
            $table->unique(['organization_id', 'inventory_movement_id'], 'sales_order_deliveries_movement_unique');
            $table->index(['organization_id', 'sales_order_line_id', 'id'], 'sales_order_deliveries_line_index');

            $table->foreign('organization_id')->references('id')->on('organizations')->restrictOnDelete();
            $table->foreign(['organization_id', 'sales_order_line_id'], 'sales_order_deliveries_line_fk')
                ->references(['organization_id', 'id'])->on('sales_order_lines')->restrictOnDelete();
            $table->foreign(['organization_id', 'stock_reservation_id'], 'sales_order_deliveries_reservation_fk')
                ->references(['organization_id', 'id'])->on('stock_reservations')->restrictOnDelete();
            $table->foreign(['organization_id', 'inventory_operation_id'], 'sales_order_deliveries_operation_fk')
                ->references(['organization_id', 'id'])->on('inventory_operations')->restrictOnDelete();
            $table->foreign(['organization_id', 'inventory_operation_id', 'inventory_movement_id'], 'sales_order_deliveries_operation_movement_fk')
                ->references(['organization_id', 'operation_id', 'id'])->on('inventory_movements')->restrictOnDelete();
            $table->foreign('actor_id')->references('id')->on('users')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_order_deliveries');

        Schema::table('inventory_movements', function (Blueprint $table): void {
            // The P07 triple-key index may become the child index for P06's
            // organization/operation foreign key. Restore that FK's support
            // index before leaving the P06 schema behind.
            $table->dropForeign('inventory_movements_operation_fk');
            $table->dropUnique('inventory_movements_org_operation_id_unique');
        });

        $operationSupportIndexExists = DB::selectOne(
            'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
            ['inventory_movements', 'inventory_movements_operation_support_index'],
        ) !== null;

        if (! $operationSupportIndexExists) {
            Schema::table('inventory_movements', function (Blueprint $table): void {
                $table->index(['organization_id', 'operation_id'], 'inventory_movements_operation_support_index');
            });
        }

        Schema::table('inventory_movements', function (Blueprint $table): void {
            $table->foreign(['organization_id', 'operation_id'], 'inventory_movements_operation_fk')
                ->references(['organization_id', 'id'])->on('inventory_operations')->cascadeOnDelete();
        });

        Schema::table('stock_reservations', function (Blueprint $table): void {
            $table->dropForeign('stock_reservations_sales_line_fk');
            $table->dropIndex('stock_reservations_sales_line_status_index');
            $table->dropColumn(['sales_order_line_id', 'consumed_quantity_milli', 'released_quantity_milli']);
        });

        Schema::table('sales_order_lines', function (Blueprint $table): void {
            $table->dropForeign('sales_order_lines_cancelled_by_fk');
            $table->dropColumn(['cancelled_quantity_milli', 'cancelled_by', 'cancelled_at']);
        });
    }
};
