<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leads', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('party_id');
            $table->string('code', 40);
            $table->string('title', 200);
            $table->timestamps();
            $table->unique(['organization_id', 'id'], 'leads_organization_id_id_unique');
            $table->unique(['organization_id', 'code'], 'leads_organization_code_unique');
            $table->index(['organization_id', 'title'], 'leads_organization_title_index');
            $table->foreign('organization_id')->references('id')->on('organizations')->restrictOnDelete();
            $table->foreign(['organization_id', 'party_id'], 'leads_organization_party_fk')
                ->references(['organization_id', 'id'])->on('parties')->restrictOnDelete();
        });

        Schema::create('lead_activities', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('lead_id');
            $table->string('title', 200);
            $table->dateTime('due_at');
            $table->dateTime('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['organization_id', 'id'], 'lead_activities_organization_id_id_unique');
            $table->index(['organization_id', 'completed_at', 'due_at'], 'lead_activities_overdue_index');
            $table->foreign(['organization_id', 'lead_id'], 'lead_activities_organization_lead_fk')
                ->references(['organization_id', 'id'])->on('leads')->cascadeOnDelete();
        });

        Schema::create('sales_quotes', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('lead_id');
            $table->unsignedBigInteger('customer_party_id');
            $table->unsignedBigInteger('price_list_id');
            $table->string('code', 40);
            $table->string('status', 24)->default('draft');
            $table->string('lead_code_snapshot', 40);
            $table->string('lead_title_snapshot', 200);
            $table->string('customer_code_snapshot', 64);
            $table->string('customer_name_snapshot', 255);
            $table->string('price_list_code_snapshot', 64);
            $table->string('price_list_name_snapshot', 160);
            $table->unsignedBigInteger('total_toman')->default(0);
            $table->dateTime('confirmed_at')->nullable();
            $table->timestamps();
            $table->unique(['organization_id', 'id'], 'sales_quotes_organization_id_id_unique');
            $table->unique(['organization_id', 'code'], 'sales_quotes_organization_code_unique');
            $table->index(['organization_id', 'status', 'created_at'], 'sales_quotes_organization_status_index');
            $table->foreign('organization_id')->references('id')->on('organizations')->restrictOnDelete();
            $table->foreign(['organization_id', 'lead_id'], 'sales_quotes_organization_lead_fk')
                ->references(['organization_id', 'id'])->on('leads')->restrictOnDelete();
            $table->foreign(['organization_id', 'customer_party_id'], 'sales_quotes_organization_customer_fk')
                ->references(['organization_id', 'id'])->on('parties')->restrictOnDelete();
            $table->foreign(['organization_id', 'price_list_id'], 'sales_quotes_organization_price_list_fk')
                ->references(['organization_id', 'id'])->on('price_lists')->restrictOnDelete();
        });

        Schema::create('sales_quote_lines', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('quote_id');
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('unit_id');
            $table->string('product_code_snapshot', 64);
            $table->string('product_name_snapshot', 255);
            $table->string('unit_code_snapshot', 64);
            $table->string('unit_name_snapshot', 120);
            $table->string('unit_symbol_snapshot', 32);
            $table->decimal('quantity', 12, 3);
            $table->unsignedBigInteger('unit_price_toman_tenths');
            $table->unsignedSmallInteger('discount_basis_points');
            $table->unsignedBigInteger('line_net_toman');
            $table->timestamps();
            $table->unique(['organization_id', 'id'], 'sales_quote_lines_organization_id_id_unique');
            $table->index(['organization_id', 'quote_id', 'id'], 'sales_quote_lines_document_index');
            $table->foreign(['organization_id', 'quote_id'], 'sales_quote_lines_organization_quote_fk')
                ->references(['organization_id', 'id'])->on('sales_quotes')->cascadeOnDelete();
            $table->foreign(['organization_id', 'product_id'], 'sales_quote_lines_organization_product_fk')
                ->references(['organization_id', 'id'])->on('products')->restrictOnDelete();
            $table->foreign(['organization_id', 'unit_id'], 'sales_quote_lines_organization_unit_fk')
                ->references(['organization_id', 'id'])->on('units')->restrictOnDelete();
        });

        Schema::create('sales_orders', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('source_quote_id');
            $table->unsignedBigInteger('lead_id');
            $table->unsignedBigInteger('customer_party_id');
            $table->string('code', 40);
            $table->string('status', 24)->default('confirmed');
            $table->string('lead_code_snapshot', 40);
            $table->string('lead_title_snapshot', 200);
            $table->string('customer_code_snapshot', 64);
            $table->string('customer_name_snapshot', 255);
            $table->string('price_list_code_snapshot', 64);
            $table->string('price_list_name_snapshot', 160);
            $table->unsignedBigInteger('total_toman');
            $table->dateTime('confirmed_at');
            $table->timestamps();
            $table->unique(['organization_id', 'id'], 'sales_orders_organization_id_id_unique');
            $table->unique('source_quote_id', 'sales_orders_source_quote_unique');
            $table->unique(['organization_id', 'code'], 'sales_orders_organization_code_unique');
            $table->foreign('organization_id')->references('id')->on('organizations')->restrictOnDelete();
            $table->foreign(['organization_id', 'source_quote_id'], 'sales_orders_organization_quote_fk')
                ->references(['organization_id', 'id'])->on('sales_quotes')->restrictOnDelete();
            $table->foreign(['organization_id', 'lead_id'], 'sales_orders_organization_lead_fk')
                ->references(['organization_id', 'id'])->on('leads')->restrictOnDelete();
            $table->foreign(['organization_id', 'customer_party_id'], 'sales_orders_organization_customer_fk')
                ->references(['organization_id', 'id'])->on('parties')->restrictOnDelete();
        });

        Schema::create('sales_order_lines', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('sales_order_id');
            $table->unsignedBigInteger('source_quote_line_id');
            $table->unsignedBigInteger('product_id');
            $table->unsignedBigInteger('unit_id');
            $table->string('product_code_snapshot', 64);
            $table->string('product_name_snapshot', 255);
            $table->string('unit_code_snapshot', 64);
            $table->string('unit_name_snapshot', 120);
            $table->string('unit_symbol_snapshot', 32);
            $table->decimal('quantity', 12, 3);
            $table->unsignedBigInteger('unit_price_toman_tenths');
            $table->unsignedSmallInteger('discount_basis_points');
            $table->unsignedBigInteger('line_net_toman');
            $table->timestamps();
            $table->unique(['organization_id', 'id'], 'sales_order_lines_organization_id_id_unique');
            $table->unique('source_quote_line_id', 'sales_order_lines_source_quote_line_unique');
            $table->index(['organization_id', 'sales_order_id', 'id'], 'sales_order_lines_document_index');
            $table->foreign(['organization_id', 'sales_order_id'], 'sales_order_lines_organization_order_fk')
                ->references(['organization_id', 'id'])->on('sales_orders')->cascadeOnDelete();
            $table->foreign(['organization_id', 'source_quote_line_id'], 'sales_order_lines_source_quote_line_fk')
                ->references(['organization_id', 'id'])->on('sales_quote_lines')->restrictOnDelete();
            $table->foreign(['organization_id', 'product_id'], 'sales_order_lines_organization_product_fk')
                ->references(['organization_id', 'id'])->on('products')->restrictOnDelete();
            $table->foreign(['organization_id', 'unit_id'], 'sales_order_lines_organization_unit_fk')
                ->references(['organization_id', 'id'])->on('units')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_order_lines');
        Schema::dropIfExists('sales_orders');
        Schema::dropIfExists('sales_quote_lines');
        Schema::dropIfExists('sales_quotes');
        Schema::dropIfExists('lead_activities');
        Schema::dropIfExists('leads');
    }
};
