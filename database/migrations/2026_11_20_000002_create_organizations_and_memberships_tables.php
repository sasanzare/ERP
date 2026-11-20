<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organizations', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 160);
            $table->string('slug', 80)->unique();
            $table->timestamps();
        });

        Schema::create('organization_memberships', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role', 32);
            $table->timestamps();
            $table->unique(['organization_id', 'user_id'], 'organization_memberships_org_user_unique');
            $table->index(['user_id', 'organization_id'], 'organization_memberships_user_org_index');
        });

        Schema::create('organization_role_audits', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('membership_id')->constrained('organization_memberships')->cascadeOnDelete();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('source', 16);
            $table->string('prior_role', 32)->nullable();
            $table->string('new_role', 32);
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_role_audits');
        Schema::dropIfExists('organization_memberships');
        Schema::dropIfExists('organizations');
    }
};
