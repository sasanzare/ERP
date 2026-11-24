<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_requests', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->string('code', 40);
            $table->string('title', 200);
            $table->string('status', 24)->default('draft');
            $table->unsignedBigInteger('requester_id');
            $table->unsignedBigInteger('submitted_by')->nullable();
            $table->dateTime('submitted_at')->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->dateTime('approved_at')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'id'], 'purchase_requests_org_id_unique');
            $table->unique(['organization_id', 'code'], 'purchase_requests_org_code_unique');
            $table->index(['organization_id', 'status', 'id'], 'purchase_requests_status_index');
            $table->foreign('organization_id')->references('id')->on('organizations')->restrictOnDelete();
            $table->foreign('requester_id')->references('id')->on('users')->restrictOnDelete();
            $table->foreign('submitted_by')->references('id')->on('users')->restrictOnDelete();
            $table->foreign('approved_by')->references('id')->on('users')->restrictOnDelete();
        });

        Schema::create('purchase_request_lines', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('purchase_request_id');
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('unit_id');
            $table->unsignedBigInteger('quantity_milli');
            $table->string('product_code_snapshot', 64);
            $table->string('product_name_snapshot', 255);
            $table->string('unit_code_snapshot', 64);
            $table->string('unit_name_snapshot', 120);
            $table->string('unit_symbol_snapshot', 32);
            $table->timestamps();

            $table->unique(['organization_id', 'id'], 'purchase_request_lines_org_id_unique');
            $table->index(['organization_id', 'purchase_request_id', 'id'], 'purchase_request_lines_document_index');
            $table->foreign(['organization_id', 'purchase_request_id'], 'purchase_request_lines_request_fk')
                ->references(['organization_id', 'id'])->on('purchase_requests')->restrictOnDelete();
            $table->foreign(['organization_id', 'product_id'], 'purchase_request_lines_product_fk')
                ->references(['organization_id', 'id'])->on('products')->restrictOnDelete();
            $table->foreign(['organization_id', 'unit_id'], 'purchase_request_lines_unit_fk')
                ->references(['organization_id', 'id'])->on('units')->restrictOnDelete();
        });

        Schema::create('purchase_orders', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('source_request_id');
            $table->unsignedBigInteger('supplier_party_id');
            $table->string('code', 40);
            $table->string('status', 16)->default('open');
            $table->string('supplier_code_snapshot', 64);
            $table->string('supplier_name_snapshot', 255);
            $table->char('currency_code', 3)->default('IRR');
            $table->unsignedTinyInteger('currency_scale')->default(0);
            $table->string('rounding_rule', 32)->default('per_line_half_up');
            $table->unsignedBigInteger('total_rial');
            $table->char('conversion_hash', 64);
            $table->unsignedBigInteger('created_by');
            $table->dateTime('ordered_at');
            $table->dateTime('closed_at')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'id'], 'purchase_orders_org_id_unique');
            $table->unique(['organization_id', 'source_request_id'], 'purchase_orders_request_unique');
            $table->unique(['organization_id', 'code'], 'purchase_orders_org_code_unique');
            $table->index(['organization_id', 'status', 'id'], 'purchase_orders_status_index');
            $table->foreign(['organization_id', 'source_request_id'], 'purchase_orders_request_fk')
                ->references(['organization_id', 'id'])->on('purchase_requests')->restrictOnDelete();
            $table->foreign(['organization_id', 'supplier_party_id'], 'purchase_orders_supplier_fk')
                ->references(['organization_id', 'id'])->on('parties')->restrictOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->restrictOnDelete();
        });

        Schema::create('purchase_order_lines', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('purchase_order_id');
            $table->unsignedBigInteger('source_request_line_id');
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('unit_id');
            $table->unsignedBigInteger('ordered_quantity_milli');
            $table->unsignedBigInteger('received_quantity_milli')->default(0);
            $table->string('product_code_snapshot', 64);
            $table->string('product_name_snapshot', 255);
            $table->string('unit_code_snapshot', 64);
            $table->string('unit_name_snapshot', 120);
            $table->string('unit_symbol_snapshot', 32);
            $table->unsignedBigInteger('unit_price_rial');
            $table->unsignedBigInteger('line_total_rial');
            $table->timestamps();

            $table->unique(['organization_id', 'id'], 'purchase_order_lines_org_id_unique');
            $table->unique(['organization_id', 'purchase_order_id', 'source_request_line_id'], 'purchase_order_lines_source_unique');
            $table->index(['organization_id', 'purchase_order_id', 'id'], 'purchase_order_lines_document_index');
            $table->foreign(['organization_id', 'purchase_order_id'], 'purchase_order_lines_order_fk')
                ->references(['organization_id', 'id'])->on('purchase_orders')->restrictOnDelete();
            $table->foreign(['organization_id', 'source_request_line_id'], 'purchase_order_lines_request_line_fk')
                ->references(['organization_id', 'id'])->on('purchase_request_lines')->restrictOnDelete();
            $table->foreign(['organization_id', 'product_id'], 'purchase_order_lines_product_fk')
                ->references(['organization_id', 'id'])->on('products')->restrictOnDelete();
            $table->foreign(['organization_id', 'unit_id'], 'purchase_order_lines_unit_fk')
                ->references(['organization_id', 'id'])->on('units')->restrictOnDelete();
        });

        Schema::create('purchase_receipts', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('purchase_order_id');
            $table->unsignedBigInteger('purchase_order_line_id');
            $table->unsignedBigInteger('warehouse_id');
            $table->unsignedBigInteger('location_id');
            $table->string('warehouse_code_snapshot', 64);
            $table->string('warehouse_name_snapshot', 160);
            $table->string('location_code_snapshot', 64);
            $table->string('location_name_snapshot', 160);
            $table->unsignedBigInteger('inventory_operation_id');
            $table->unsignedBigInteger('inventory_movement_id');
            $table->unsignedBigInteger('quantity_milli');
            $table->uuid('idempotency_key');
            $table->char('request_hash', 64);
            $table->unsignedBigInteger('actor_id');
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['organization_id', 'id'], 'purchase_receipts_org_id_unique');
            $table->unique(['organization_id', 'idempotency_key'], 'purchase_receipts_idempotency_unique');
            $table->unique(['organization_id', 'inventory_operation_id'], 'purchase_receipts_operation_unique');
            $table->unique(['organization_id', 'inventory_movement_id'], 'purchase_receipts_movement_unique');
            $table->index(['organization_id', 'purchase_order_line_id', 'id'], 'purchase_receipts_line_index');
            $table->foreign(['organization_id', 'purchase_order_id'], 'purchase_receipts_order_fk')
                ->references(['organization_id', 'id'])->on('purchase_orders')->restrictOnDelete();
            $table->foreign(['organization_id', 'purchase_order_line_id'], 'purchase_receipts_order_line_fk')
                ->references(['organization_id', 'id'])->on('purchase_order_lines')->restrictOnDelete();
            $table->foreign(['organization_id', 'warehouse_id'], 'purchase_receipts_warehouse_fk')
                ->references(['organization_id', 'id'])->on('warehouses')->restrictOnDelete();
            $table->foreign(['organization_id', 'location_id'], 'purchase_receipts_location_fk')
                ->references(['organization_id', 'id'])->on('locations')->restrictOnDelete();
            $table->foreign(['organization_id', 'inventory_operation_id'], 'purchase_receipts_operation_fk')
                ->references(['organization_id', 'id'])->on('inventory_operations')->restrictOnDelete();
            $table->foreign(['organization_id', 'inventory_operation_id', 'inventory_movement_id'], 'purchase_receipts_operation_movement_fk')
                ->references(['organization_id', 'operation_id', 'id'])->on('inventory_movements')->restrictOnDelete();
            $table->foreign('actor_id')->references('id')->on('users')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_receipts');
        Schema::dropIfExists('purchase_order_lines');
        Schema::dropIfExists('purchase_orders');
        Schema::dropIfExists('purchase_request_lines');
        Schema::dropIfExists('purchase_requests');
    }
};
