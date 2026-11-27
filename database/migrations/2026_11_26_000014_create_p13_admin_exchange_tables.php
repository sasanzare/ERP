<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organization_role_managers', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('user_id');
            $table->foreignId('granted_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('source', 16)->default('cli');
            $table->timestamps();
            $table->unique(['organization_id', 'user_id'], 'organization_role_managers_org_user_unique');
            $table->foreign(['organization_id', 'user_id'], 'organization_role_managers_org_user_membership_fk')
                ->references(['organization_id', 'user_id'])->on('organization_memberships')->cascadeOnDelete();
        });

        Schema::create('party_imports', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('import_key', 36);
            $table->string('payload_hash', 64);
            $table->string('source_format', 8);
            $table->string('status', 16)->default('applying');
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['organization_id', 'import_key'], 'party_imports_org_key_unique');
            $table->unique(['organization_id', 'id'], 'party_imports_org_id_unique');
            $table->index(['organization_id', 'status'], 'party_imports_org_status_index');
        });

        Schema::create('party_import_rows', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('party_import_id');
            $table->unsignedInteger('source_row');
            $table->string('source_party_id', 64)->nullable();
            $table->string('party_code', 64)->nullable();
            $table->string('display_name', 255)->nullable();
            $table->json('roles')->nullable();
            $table->string('classification', 16);
            $table->string('outcome', 16);
            $table->text('message')->nullable();
            $table->foreignId('party_id')->nullable()->constrained('parties')->nullOnDelete();
            $table->timestamps();
            $table->unique(['party_import_id', 'source_row'], 'party_import_rows_request_row_unique');
            $table->index(['organization_id', 'party_code'], 'party_import_rows_org_code_index');
            $table->foreign(['organization_id', 'party_import_id'], 'party_import_rows_org_request_fk')
                ->references(['organization_id', 'id'])->on('party_imports')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('party_import_rows');
        Schema::dropIfExists('party_imports');
        Schema::dropIfExists('organization_role_managers');
    }
};
