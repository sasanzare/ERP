<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        DB::table('organizations')->updateOrInsert(
            ['slug' => 'legacy-local'],
            ['name' => 'سازمان پیش‌فرض', 'updated_at' => $now, 'created_at' => $now],
        );

        $startingOrganizationId = DB::table('organizations')
            ->where('slug', 'legacy-local')
            ->value('id');

        Schema::table('products', function (Blueprint $table): void {
            $table->foreignId('organization_id')
                ->nullable()
                ->after('id')
                ->constrained()
                ->restrictOnDelete();
        });

        DB::table('products')->whereNull('organization_id')->update([
            'organization_id' => $startingOrganizationId,
        ]);

        Schema::table('products', function (Blueprint $table): void {
            $table->unsignedBigInteger('organization_id')->nullable(false)->change();
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->dropForeign(['organization_id']);
            $table->dropColumn('organization_id');
        });

        DB::table('organizations')->where('slug', 'legacy-local')->delete();
    }
};
