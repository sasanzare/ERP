<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accounting_books', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->string('code', 64);
            $table->string('name', 160);
            $table->char('currency_code', 3)->default('IRR');
            $table->unsignedTinyInteger('currency_scale')->default(0);
            $table->string('time_zone', 80)->default('Asia/Tehran');
            $table->timestamps();

            $table->unique(['organization_id', 'id'], 'accounting_books_org_id_unique');
            $table->unique(['organization_id', 'code'], 'accounting_books_org_code_unique');
            $table->foreign('organization_id')->references('id')->on('organizations')->restrictOnDelete();
        });

        Schema::create('accounting_accounts', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('book_id');
            $table->unsignedBigInteger('parent_account_id')->nullable();
            $table->string('code', 64);
            $table->string('name', 160);
            $table->string('category', 16);
            $table->boolean('is_postable')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['organization_id', 'id'], 'accounting_accounts_org_id_unique');
            $table->unique(['organization_id', 'book_id', 'id'], 'accounting_accounts_org_book_id_unique');
            $table->unique(['organization_id', 'book_id', 'code'], 'accounting_accounts_org_book_code_unique');
            $table->index(['organization_id', 'book_id', 'is_active', 'code'], 'accounting_accounts_active_index');
            $table->foreign(['organization_id', 'book_id'], 'accounting_accounts_book_fk')
                ->references(['organization_id', 'id'])->on('accounting_books')->restrictOnDelete();
            $table->foreign(['organization_id', 'book_id', 'parent_account_id'], 'accounting_accounts_parent_fk')
                ->references(['organization_id', 'book_id', 'id'])->on('accounting_accounts')->restrictOnDelete();
        });

        Schema::create('accounting_periods', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('book_id');
            $table->string('code', 40);
            $table->string('name', 160);
            $table->date('starts_on');
            $table->date('ends_on');
            $table->string('status', 16)->default('open');
            $table->unsignedBigInteger('closed_by')->nullable();
            $table->dateTime('closed_at')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'id'], 'accounting_periods_org_id_unique');
            $table->unique(['organization_id', 'book_id', 'id'], 'accounting_periods_org_book_id_unique');
            $table->unique(['organization_id', 'book_id', 'code'], 'accounting_periods_org_book_code_unique');
            $table->index(['organization_id', 'book_id', 'starts_on', 'ends_on'], 'accounting_periods_date_index');
            $table->foreign(['organization_id', 'book_id'], 'accounting_periods_book_fk')
                ->references(['organization_id', 'id'])->on('accounting_books')->restrictOnDelete();
            $table->foreign('closed_by')->references('id')->on('users')->restrictOnDelete();
        });

        Schema::create('accounting_journals', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('book_id');
            $table->unsignedBigInteger('period_id')->nullable();
            $table->unsignedBigInteger('reversal_of_journal_id')->nullable();
            $table->string('code', 40);
            $table->date('accounting_date');
            $table->string('description', 500);
            $table->string('status', 16)->default('draft');
            $table->string('source_type', 80)->nullable();
            $table->string('source_record_id', 120)->nullable();
            $table->string('source_event_key', 120)->nullable();
            $table->char('reversal_request_hash', 64)->nullable();
            $table->char('posting_identity', 36)->nullable();
            $table->unsignedBigInteger('debit_total_rial')->nullable();
            $table->unsignedBigInteger('credit_total_rial')->nullable();
            $table->unsignedBigInteger('created_by');
            $table->unsignedBigInteger('posted_by')->nullable();
            $table->dateTime('posted_at')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'book_id', 'id'], 'accounting_journals_org_book_id_unique');
            $table->unique(['organization_id', 'book_id', 'code'], 'accounting_journals_org_book_code_unique');
            $table->unique(['organization_id', 'book_id', 'reversal_of_journal_id'], 'accounting_journals_one_reversal_unique');
            $table->unique([
                'organization_id', 'book_id', 'source_type', 'source_record_id', 'source_event_key',
            ], 'accounting_journals_source_event_unique');
            $table->unique(['organization_id', 'book_id', 'posting_identity'], 'accounting_journals_posting_identity_unique');
            $table->index(['organization_id', 'book_id', 'accounting_date', 'id'], 'accounting_journals_date_index');
            $table->index(['organization_id', 'book_id', 'status', 'id'], 'accounting_journals_status_index');
            $table->foreign(['organization_id', 'book_id'], 'accounting_journals_book_fk')
                ->references(['organization_id', 'id'])->on('accounting_books')->restrictOnDelete();
            $table->foreign(['organization_id', 'book_id', 'period_id'], 'accounting_journals_period_fk')
                ->references(['organization_id', 'book_id', 'id'])->on('accounting_periods')->restrictOnDelete();
            $table->foreign(['organization_id', 'book_id', 'reversal_of_journal_id'], 'accounting_journals_reversal_fk')
                ->references(['organization_id', 'book_id', 'id'])->on('accounting_journals')->restrictOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->restrictOnDelete();
            $table->foreign('posted_by')->references('id')->on('users')->restrictOnDelete();
        });

        Schema::create('accounting_journal_lines', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('book_id');
            $table->unsignedBigInteger('journal_id');
            $table->unsignedBigInteger('account_id');
            $table->unsignedSmallInteger('line_number');
            $table->string('memo', 255)->nullable();
            $table->unsignedBigInteger('debit_rial')->default(0);
            $table->unsignedBigInteger('credit_rial')->default(0);
            $table->timestamps();

            $table->unique(['organization_id', 'book_id', 'journal_id', 'line_number'], 'accounting_journal_lines_number_unique');
            $table->index(['organization_id', 'book_id', 'account_id', 'journal_id'], 'accounting_journal_lines_account_index');
            $table->foreign(['organization_id', 'book_id', 'journal_id'], 'accounting_journal_lines_journal_fk')
                ->references(['organization_id', 'book_id', 'id'])->on('accounting_journals')->restrictOnDelete();
            $table->foreign(['organization_id', 'book_id', 'account_id'], 'accounting_journal_lines_account_fk')
                ->references(['organization_id', 'book_id', 'id'])->on('accounting_accounts')->restrictOnDelete();
        });

        Schema::create('accounting_request_keys', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('book_id');
            $table->string('operation', 16);
            $table->char('idempotency_key', 36);
            $table->char('request_hash', 64);
            $table->unsignedBigInteger('journal_id');
            $table->unsignedBigInteger('created_by');
            $table->timestamps();

            $table->unique(['organization_id', 'book_id', 'operation', 'idempotency_key'], 'accounting_request_keys_identity_unique');
            $table->index(['organization_id', 'book_id', 'journal_id'], 'accounting_request_keys_journal_index');
            $table->foreign(['organization_id', 'book_id'], 'accounting_request_keys_book_fk')
                ->references(['organization_id', 'id'])->on('accounting_books')->restrictOnDelete();
            $table->foreign(['organization_id', 'book_id', 'journal_id'], 'accounting_request_keys_journal_fk')
                ->references(['organization_id', 'book_id', 'id'])->on('accounting_journals')->restrictOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->restrictOnDelete();
        });

    }

    public function down(): void
    {
        Schema::dropIfExists('accounting_request_keys');
        Schema::dropIfExists('accounting_journal_lines');
        Schema::dropIfExists('accounting_journals');
        Schema::dropIfExists('accounting_periods');
        Schema::dropIfExists('accounting_accounts');
        Schema::dropIfExists('accounting_books');
    }
};
