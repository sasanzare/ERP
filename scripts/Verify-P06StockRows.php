<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

$organizationId = filter_var($argv[1] ?? null, FILTER_VALIDATE_INT);
$productId = filter_var($argv[2] ?? null, FILTER_VALIDATE_INT);
$locationId = filter_var($argv[3] ?? null, FILTER_VALIDATE_INT);

if ($organizationId === false || $organizationId < 1 || $productId === false || $productId < 1 || $locationId === false || $locationId < 1) {
    fwrite(STDERR, "Positive organization, product, and location IDs are required.\n");
    exit(2);
}

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

if (DB::connection()->getDatabaseName() !== 'erp_dev') {
    fwrite(STDERR, "The P06 row verification helper only runs against erp_dev.\n");
    exit(3);
}

$movements = DB::table('inventory_movements')
    ->where('organization_id', $organizationId)
    ->where('product_id', $productId)
    ->where('location_id', $locationId)
    ->selectRaw("SUM(CASE WHEN direction = 'inbound' THEN quantity_milli ELSE 0 END) AS inbound_milli")
    ->selectRaw("SUM(CASE WHEN direction = 'outbound' THEN quantity_milli ELSE 0 END) AS outbound_milli")
    ->first();
$reservations = DB::table('stock_reservations')
    ->where('organization_id', $organizationId)
    ->where('product_id', $productId)
    ->where('location_id', $locationId)
    ->where('status', 'open')
    ->selectRaw('COUNT(*) AS open_count, SUM(quantity_milli) AS reserved_milli')
    ->first();
$legs = DB::table('inventory_movements')
    ->join('inventory_operations', function ($join): void {
        $join->on('inventory_operations.organization_id', '=', 'inventory_movements.organization_id')
            ->on('inventory_operations.id', '=', 'inventory_movements.operation_id');
    })
    ->where('inventory_movements.organization_id', $organizationId)
    ->where('inventory_movements.product_id', $productId)
    ->where('inventory_movements.location_id', $locationId)
    ->select(['inventory_movements.id', 'inventory_movements.operation_id', 'inventory_movements.direction', 'inventory_movements.quantity_milli', 'inventory_operations.operation_type'])
    ->orderBy('inventory_movements.id')
    ->get();

$physicalMilli = (int) ($movements->inbound_milli ?? 0) - (int) ($movements->outbound_milli ?? 0);
$reservedMilli = (int) ($reservations->reserved_milli ?? 0);
$summary = [
    'database' => DB::connection()->getDatabaseName(),
    'organization_id' => $organizationId,
    'product_id' => $productId,
    'location_id' => $locationId,
    'physical_milli' => $physicalMilli,
    'open_reservation_count' => (int) ($reservations->open_count ?? 0),
    'reserved_milli' => $reservedMilli,
    'available_milli' => $physicalMilli - $reservedMilli,
    'movement_legs' => $legs->map(fn ($leg): array => [
        'id' => (int) $leg->id,
        'operation_id' => (int) $leg->operation_id,
        'operation_type' => $leg->operation_type,
        'direction' => $leg->direction,
        'quantity_milli' => (int) $leg->quantity_milli,
    ])->all(),
];

fwrite(STDOUT, json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)."\n");
