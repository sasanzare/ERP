<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            'ALTER TABLE accounting_journal_lines ADD CONSTRAINT accounting_journal_lines_one_sided_amount '
            .'CHECK ((debit_rial > 0 AND credit_rial = 0) OR (debit_rial = 0 AND credit_rial > 0))'
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE accounting_journal_lines DROP CONSTRAINT accounting_journal_lines_one_sided_amount');
    }
};
