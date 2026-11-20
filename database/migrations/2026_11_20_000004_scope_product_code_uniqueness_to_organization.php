<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->dropUnique('products_code_unique');
            $table->unique(['organization_id', 'code'], 'products_organization_code_unique');
        });
    }

    public function down(): void
    {
        $duplicateCode = DB::table('products')
            ->select('code')
            ->groupBy('code')
            ->havingRaw('COUNT(*) > 1')
            ->value('code');

        if ($duplicateCode !== null) {
            throw new RuntimeException(
                'Cannot restore global product code uniqueness while separate organizations share a code. '
                .'Move or rename the duplicate products before rolling back this migration.',
            );
        }

        Schema::table('products', function (Blueprint $table): void {
            $table->dropUnique('products_organization_code_unique');
            $table->unique('code', 'products_code_unique');
        });
    }
};
