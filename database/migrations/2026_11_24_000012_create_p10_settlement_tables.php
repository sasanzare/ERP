<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_order_deliveries', function (Blueprint $table): void {
            $table->unique(['organization_id', 'sales_order_line_id', 'id'], 'sales_deliveries_org_line_id_unique');
        });

        Schema::table('purchase_receipts', function (Blueprint $table): void {
            $table->unique(['organization_id', 'purchase_order_line_id', 'id'], 'purchase_receipts_org_line_id_unique');
        });

        Schema::create('p10_accounting_profiles', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('book_id');
            $table->string('status', 24);
            $table->unsignedBigInteger('customer_receivable_account_id');
            $table->unsignedBigInteger('customer_revenue_account_id');
            $table->unsignedBigInteger('supplier_payable_account_id');
            $table->unsignedBigInteger('supplier_debit_account_id');
            $table->unsignedBigInteger('customer_treasury_account_id');
            $table->unsignedBigInteger('supplier_treasury_account_id');
            $table->string('approval_reference', 255)->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->dateTime('approved_at')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'id'], 'p10_profiles_org_id_unique');
            $table->unique(['organization_id', 'book_id'], 'p10_profiles_org_book_unique');
            $table->foreign(['organization_id', 'book_id'], 'p10_profiles_book_fk')
                ->references(['organization_id', 'id'])->on('accounting_books')->restrictOnDelete();
            foreach ([
                'customer_receivable_account_id', 'customer_revenue_account_id', 'supplier_payable_account_id',
                'supplier_debit_account_id', 'customer_treasury_account_id', 'supplier_treasury_account_id',
            ] as $column) {
                $table->foreign(['organization_id', 'book_id', $column], 'p10_profile_'.substr($column, 0, 22).'_fk')
                    ->references(['organization_id', 'book_id', 'id'])->on('accounting_accounts')->restrictOnDelete();
            }
            $table->foreign('approved_by')->references('id')->on('users')->restrictOnDelete();
        });

        Schema::create('p10_invoices', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('book_id');
            $table->string('direction', 16);
            $table->unsignedBigInteger('party_id');
            $table->unsignedBigInteger('sales_order_id')->nullable();
            $table->unsignedBigInteger('purchase_order_id')->nullable();
            $table->string('code', 40);
            $table->date('effective_on');
            $table->date('due_on');
            $table->char('currency_code', 3)->default('IRR');
            $table->unsignedTinyInteger('currency_scale')->default(0);
            $table->unsignedBigInteger('amount_rial')->nullable();
            $table->string('status', 16)->default('draft');
            $table->char('idempotency_key', 36);
            $table->char('request_hash', 64);
            $table->char('posting_key', 36);
            $table->unsignedBigInteger('journal_id')->nullable();
            $table->unsignedBigInteger('created_by');
            $table->unsignedBigInteger('posted_by')->nullable();
            $table->dateTime('posted_at')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'book_id', 'id'], 'p10_invoices_org_book_id_unique');
            $table->unique(['organization_id', 'direction', 'code'], 'p10_invoices_org_direction_code_unique');
            $table->unique(['organization_id', 'book_id', 'direction', 'idempotency_key'], 'p10_invoices_retry_unique');
            $table->unique(['organization_id', 'book_id', 'journal_id'], 'p10_invoices_journal_unique');
            $table->index(['organization_id', 'book_id', 'direction', 'effective_on', 'id'], 'p10_invoices_reporting_index');
            $table->index(['organization_id', 'party_id', 'due_on', 'id'], 'p10_invoices_party_due_index');
            $table->foreign(['organization_id', 'book_id'], 'p10_invoices_book_fk')
                ->references(['organization_id', 'id'])->on('accounting_books')->restrictOnDelete();
            $table->foreign(['organization_id', 'party_id'], 'p10_invoices_party_fk')
                ->references(['organization_id', 'id'])->on('parties')->restrictOnDelete();
            $table->foreign(['organization_id', 'sales_order_id'], 'p10_invoices_sales_order_fk')
                ->references(['organization_id', 'id'])->on('sales_orders')->restrictOnDelete();
            $table->foreign(['organization_id', 'purchase_order_id'], 'p10_invoices_purchase_order_fk')
                ->references(['organization_id', 'id'])->on('purchase_orders')->restrictOnDelete();
            $table->foreign(['organization_id', 'book_id', 'journal_id'], 'p10_invoices_journal_fk')
                ->references(['organization_id', 'book_id', 'id'])->on('accounting_journals')->restrictOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->restrictOnDelete();
            $table->foreign('posted_by')->references('id')->on('users')->restrictOnDelete();
        });

        Schema::create('p10_invoice_lines', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('book_id');
            $table->unsignedBigInteger('invoice_id');
            $table->unsignedSmallInteger('line_number');
            $table->unsignedBigInteger('sales_order_line_id')->nullable();
            $table->unsignedBigInteger('sales_order_delivery_id')->nullable();
            $table->unsignedBigInteger('purchase_order_line_id')->nullable();
            $table->unsignedBigInteger('purchase_receipt_id')->nullable();
            $table->string('item_code_snapshot', 64);
            $table->string('item_name_snapshot', 255);
            $table->string('unit_name_snapshot', 120);
            $table->unsignedBigInteger('quantity_milli');
            $table->unsignedBigInteger('amount_rial');
            $table->unsignedBigInteger('source_amount_toman')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'book_id', 'invoice_id', 'line_number'], 'p10_invoice_lines_number_unique');
            $table->unique(['organization_id', 'book_id', 'id'], 'p10_invoice_lines_org_book_id_unique');
            $table->index(['organization_id', 'sales_order_line_id', 'id'], 'p10_invoice_lines_sales_line_index');
            $table->index(['organization_id', 'purchase_order_line_id', 'id'], 'p10_invoice_lines_purchase_line_index');
            $table->foreign(['organization_id', 'book_id', 'invoice_id'], 'p10_invoice_lines_invoice_fk')
                ->references(['organization_id', 'book_id', 'id'])->on('p10_invoices')->restrictOnDelete();
            $table->foreign(['organization_id', 'sales_order_line_id'], 'p10_invoice_lines_sales_line_fk')
                ->references(['organization_id', 'id'])->on('sales_order_lines')->restrictOnDelete();
            $table->foreign(['organization_id', 'sales_order_line_id', 'sales_order_delivery_id'], 'p10_invoice_lines_sales_delivery_fk')
                ->references(['organization_id', 'sales_order_line_id', 'id'])->on('sales_order_deliveries')->restrictOnDelete();
            $table->foreign(['organization_id', 'purchase_order_line_id'], 'p10_invoice_lines_purchase_line_fk')
                ->references(['organization_id', 'id'])->on('purchase_order_lines')->restrictOnDelete();
            $table->foreign(['organization_id', 'purchase_order_line_id', 'purchase_receipt_id'], 'p10_invoice_lines_purchase_receipt_fk')
                ->references(['organization_id', 'purchase_order_line_id', 'id'])->on('purchase_receipts')->restrictOnDelete();
        });

        Schema::create('p10_open_items', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('book_id');
            $table->unsignedBigInteger('invoice_id');
            $table->string('direction', 16);
            $table->unsignedBigInteger('party_id');
            $table->date('effective_on');
            $table->date('due_on');
            $table->char('currency_code', 3)->default('IRR');
            $table->unsignedTinyInteger('currency_scale')->default(0);
            $table->unsignedBigInteger('original_amount_rial');
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['organization_id', 'book_id', 'id'], 'p10_open_items_org_book_id_unique');
            $table->unique(['organization_id', 'book_id', 'invoice_id'], 'p10_open_items_invoice_unique');
            $table->index(['organization_id', 'book_id', 'direction', 'effective_on', 'due_on', 'id'], 'p10_open_items_reporting_index');
            $table->foreign(['organization_id', 'book_id', 'invoice_id'], 'p10_open_items_invoice_fk')
                ->references(['organization_id', 'book_id', 'id'])->on('p10_invoices')->restrictOnDelete();
            $table->foreign(['organization_id', 'party_id'], 'p10_open_items_party_fk')
                ->references(['organization_id', 'id'])->on('parties')->restrictOnDelete();
        });

        Schema::create('p10_treasury_movements', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('book_id');
            $table->string('direction', 24);
            $table->unsignedBigInteger('party_id');
            $table->unsignedBigInteger('treasury_account_id');
            $table->date('effective_on');
            $table->char('currency_code', 3)->default('IRR');
            $table->unsignedTinyInteger('currency_scale')->default(0);
            $table->unsignedBigInteger('amount_rial');
            $table->string('reference', 120)->nullable();
            $table->char('idempotency_key', 36);
            $table->char('request_hash', 64);
            $table->char('posting_key', 36);
            $table->unsignedBigInteger('journal_id')->nullable();
            $table->unsignedBigInteger('created_by');
            $table->dateTime('posted_at')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['organization_id', 'book_id', 'id'], 'p10_treasury_org_book_id_unique');
            $table->unique(['organization_id', 'book_id', 'direction', 'idempotency_key'], 'p10_treasury_retry_unique');
            $table->unique(['organization_id', 'book_id', 'journal_id'], 'p10_treasury_journal_unique');
            $table->index(['organization_id', 'book_id', 'direction', 'effective_on', 'id'], 'p10_treasury_date_index');
            $table->foreign(['organization_id', 'book_id'], 'p10_treasury_book_fk')
                ->references(['organization_id', 'id'])->on('accounting_books')->restrictOnDelete();
            $table->foreign(['organization_id', 'party_id'], 'p10_treasury_party_fk')
                ->references(['organization_id', 'id'])->on('parties')->restrictOnDelete();
            $table->foreign(['organization_id', 'book_id', 'treasury_account_id'], 'p10_treasury_account_fk')
                ->references(['organization_id', 'book_id', 'id'])->on('accounting_accounts')->restrictOnDelete();
            $table->foreign(['organization_id', 'book_id', 'journal_id'], 'p10_treasury_journal_fk')
                ->references(['organization_id', 'book_id', 'id'])->on('accounting_journals')->restrictOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->restrictOnDelete();
        });

        Schema::create('p10_allocations', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('book_id');
            $table->unsignedBigInteger('invoice_id');
            $table->unsignedBigInteger('open_item_id');
            $table->unsignedBigInteger('treasury_movement_id');
            $table->string('direction', 16);
            $table->unsignedBigInteger('amount_rial');
            $table->unsignedBigInteger('journal_id');
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['organization_id', 'book_id', 'id'], 'p10_allocations_org_book_id_unique');
            $table->unique(['organization_id', 'book_id', 'treasury_movement_id', 'open_item_id'], 'p10_allocations_movement_item_unique');
            $table->index(['organization_id', 'book_id', 'invoice_id', 'id'], 'p10_allocations_invoice_index');
            $table->foreign(['organization_id', 'book_id', 'invoice_id'], 'p10_allocations_invoice_fk')
                ->references(['organization_id', 'book_id', 'id'])->on('p10_invoices')->restrictOnDelete();
            $table->foreign(['organization_id', 'book_id', 'open_item_id'], 'p10_allocations_open_item_fk')
                ->references(['organization_id', 'book_id', 'id'])->on('p10_open_items')->restrictOnDelete();
            $table->foreign(['organization_id', 'book_id', 'treasury_movement_id'], 'p10_allocations_treasury_fk')
                ->references(['organization_id', 'book_id', 'id'])->on('p10_treasury_movements')->restrictOnDelete();
            $table->foreign(['organization_id', 'book_id', 'journal_id'], 'p10_allocations_journal_fk')
                ->references(['organization_id', 'book_id', 'id'])->on('accounting_journals')->restrictOnDelete();
        });

        DB::statement("ALTER TABLE p10_accounting_profiles ADD CONSTRAINT p10_profiles_status_check CHECK (status IN ('synthetic_test', 'approved'))");
        DB::statement("ALTER TABLE p10_invoices ADD CONSTRAINT p10_invoices_direction_source_check CHECK ((direction = 'customer' AND sales_order_id IS NOT NULL AND purchase_order_id IS NULL) OR (direction = 'supplier' AND purchase_order_id IS NOT NULL AND sales_order_id IS NULL))");
        DB::statement('ALTER TABLE p10_invoice_lines ADD CONSTRAINT p10_invoice_lines_source_check CHECK ((sales_order_line_id IS NOT NULL AND sales_order_delivery_id IS NOT NULL AND purchase_order_line_id IS NULL AND purchase_receipt_id IS NULL) OR (purchase_order_line_id IS NOT NULL AND purchase_receipt_id IS NOT NULL AND sales_order_line_id IS NULL AND sales_order_delivery_id IS NULL))');
        DB::statement('ALTER TABLE p10_invoice_lines ADD CONSTRAINT p10_invoice_lines_quantity_check CHECK (quantity_milli > 0)');
        DB::statement('ALTER TABLE p10_invoices ADD CONSTRAINT p10_invoices_positive_check CHECK (amount_rial IS NULL OR amount_rial > 0)');
        DB::statement("ALTER TABLE p10_invoices ADD CONSTRAINT p10_invoices_posting_state_check CHECK ((status = 'draft' AND amount_rial IS NULL AND journal_id IS NULL AND posted_by IS NULL AND posted_at IS NULL) OR (status = 'posted' AND amount_rial > 0 AND journal_id IS NOT NULL AND posted_by IS NOT NULL AND posted_at IS NOT NULL))");
        DB::statement('ALTER TABLE p10_open_items ADD CONSTRAINT p10_open_items_positive_check CHECK (original_amount_rial > 0)');
        DB::statement("ALTER TABLE p10_treasury_movements ADD CONSTRAINT p10_treasury_direction_check CHECK (direction IN ('customer_receipt', 'supplier_payment'))");
        DB::statement('ALTER TABLE p10_treasury_movements ADD CONSTRAINT p10_treasury_positive_check CHECK (amount_rial > 0)');
        DB::statement('ALTER TABLE p10_treasury_movements ADD CONSTRAINT p10_treasury_journal_state_check CHECK ((journal_id IS NULL AND posted_at IS NULL) OR (journal_id IS NOT NULL AND posted_at IS NOT NULL))');
        DB::statement("ALTER TABLE p10_allocations ADD CONSTRAINT p10_allocations_direction_check CHECK (direction IN ('customer', 'supplier'))");
        DB::statement('ALTER TABLE p10_allocations ADD CONSTRAINT p10_allocations_positive_check CHECK (amount_rial > 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('p10_allocations');
        Schema::dropIfExists('p10_treasury_movements');
        Schema::dropIfExists('p10_open_items');
        Schema::dropIfExists('p10_invoice_lines');
        Schema::dropIfExists('p10_invoices');
        Schema::dropIfExists('p10_accounting_profiles');

        Schema::table('purchase_receipts', function (Blueprint $table): void {
            $table->dropUnique('purchase_receipts_org_line_id_unique');
        });

        Schema::table('sales_order_deliveries', function (Blueprint $table): void {
            $table->dropUnique('sales_deliveries_org_line_id_unique');
        });
    }
};
