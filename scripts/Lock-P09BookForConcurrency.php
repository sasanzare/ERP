<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

$organizationId = filter_var($argv[1] ?? null, FILTER_VALIDATE_INT);
$bookId = filter_var($argv[2] ?? null, FILTER_VALIDATE_INT);

if ($organizationId === false || $organizationId < 1 || $bookId === false || $bookId < 1) {
    fwrite(STDERR, "Positive organization and accounting book IDs are required.\n");
    exit(2);
}

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

if (DB::connection()->getDatabaseName() !== 'erp_dev') {
    fwrite(STDERR, "The P09 browser contention lock only runs against erp_dev.\n");
    exit(3);
}

$connection = DB::connection();
$connection->beginTransaction();

try {
    $book = $connection->table('accounting_books')
        ->where('organization_id', $organizationId)
        ->where('id', $bookId)
        ->lockForUpdate()
        ->first();
    if ($book === null) {
        throw new RuntimeException('The accounting book lock row was not found.');
    }

    fwrite(STDOUT, "LOCKED\n");
    fflush(STDOUT);
    usleep(2_500_000);
    $connection->commit();
    fwrite(STDOUT, "RELEASED\n");
} catch (Throwable $exception) {
    if ($connection->transactionLevel() > 0) {
        $connection->rollBack();
    }

    fwrite(STDERR, $exception->getMessage()."\n");
    exit(1);
}
