<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

$quoteId = filter_var($argv[1] ?? null, FILTER_VALIDATE_INT);
if ($quoteId === false || $quoteId < 1) {
    fwrite(STDERR, "A positive quote ID is required.\n");
    exit(2);
}

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

if (DB::connection()->getDatabaseName() !== 'erp_dev') {
    fwrite(STDERR, "The browser concurrency lock only runs against erp_dev.\n");
    exit(3);
}

$connection = DB::connection();
$connection->beginTransaction();

try {
    $quote = $connection->table('sales_quotes')->where('id', $quoteId)->lockForUpdate()->first();
    if ($quote === null || $quote->status !== 'confirmed') {
        throw new RuntimeException('The confirmed local quote was not found.');
    }

    fwrite(STDOUT, "LOCKED\n");
    fflush(STDOUT);
    usleep(2_000_000);
    $connection->commit();
    fwrite(STDOUT, "RELEASED\n");
} catch (Throwable $exception) {
    if ($connection->transactionLevel() > 0) {
        $connection->rollBack();
    }
    fwrite(STDERR, $exception->getMessage()."\n");
    exit(1);
}
