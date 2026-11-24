<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

$organizationId = filter_var($argv[1] ?? null, FILTER_VALIDATE_INT);
$orderId = filter_var($argv[2] ?? null, FILTER_VALIDATE_INT);
$lineId = filter_var($argv[3] ?? null, FILTER_VALIDATE_INT);

if ($organizationId === false || $organizationId < 1 || $orderId === false || $orderId < 1 || $lineId === false || $lineId < 1) {
    fwrite(STDERR, "Positive organization, purchase order, and order line IDs are required.\n");
    exit(2);
}

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

if (DB::connection()->getDatabaseName() !== 'erp_dev') {
    fwrite(STDERR, "The P08 browser contention lock only runs against erp_dev.\n");
    exit(3);
}

$connection = DB::connection();
$connection->beginTransaction();

try {
    $order = $connection->table('purchase_orders')
        ->where('organization_id', $organizationId)
        ->where('id', $orderId)
        ->lockForUpdate()
        ->first();
    if ($order === null) {
        throw new RuntimeException('The purchase order lock row was not found.');
    }

    $line = $connection->table('purchase_order_lines')
        ->where('organization_id', $organizationId)
        ->where('purchase_order_id', $orderId)
        ->where('id', $lineId)
        ->lockForUpdate()
        ->first();
    if ($line === null) {
        throw new RuntimeException('The purchase order line lock row was not found.');
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
