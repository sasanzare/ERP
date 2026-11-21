<?php

use App\Http\Controllers\Api\V1\LocationController;
use App\Http\Controllers\Api\V1\PartyController;
use App\Http\Controllers\Api\V1\PriceListController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\UnitController;
use App\Http\Controllers\Api\V1\WarehouseController;
use App\Http\Controllers\Api\V1\WorkspaceController;
use App\Http\Middleware\RequireExplicitCsrfToken;
use App\Http\Middleware\ResolveActiveOrganization;
use Illuminate\Support\Facades\Route;

Route::middleware('web')->prefix('v1')->group(function (): void {
    Route::middleware(['auth', ResolveActiveOrganization::class])->group(function (): void {
        Route::get('/products', [ProductController::class, 'index']);
        Route::get('/products/{id}', [ProductController::class, 'show'])->whereNumber('id');
        Route::get('/parties', [PartyController::class, 'index']);
        Route::get('/parties/{id}', [PartyController::class, 'show'])->whereNumber('id');
        Route::get('/units', [UnitController::class, 'index']);
        Route::get('/units/{id}', [UnitController::class, 'show'])->whereNumber('id');
        Route::get('/warehouses', [WarehouseController::class, 'index']);
        Route::get('/warehouses/{id}', [WarehouseController::class, 'show'])->whereNumber('id');
        Route::get('/locations', [LocationController::class, 'index']);
        Route::get('/locations/{id}', [LocationController::class, 'show'])->whereNumber('id');
        Route::get('/price-lists', [PriceListController::class, 'index']);
        Route::get('/price-lists/{priceList}', [PriceListController::class, 'show'])->whereNumber('priceList');
        Route::get('/price-lists/{priceList}/products/{productId}', [PriceListController::class, 'resolvePrice'])
            ->whereNumber('priceList')->whereNumber('productId');
        Route::get('/workspace', [WorkspaceController::class, 'show']);

        Route::middleware(RequireExplicitCsrfToken::class)->group(function (): void {
            Route::post('/products', [ProductController::class, 'store']);
            Route::patch('/products/{id}', [ProductController::class, 'update'])->whereNumber('id');
            Route::post('/parties', [PartyController::class, 'store']);
            Route::patch('/parties/{id}', [PartyController::class, 'update'])->whereNumber('id');
            Route::post('/units', [UnitController::class, 'store']);
            Route::patch('/units/{id}', [UnitController::class, 'update'])->whereNumber('id');
            Route::post('/warehouses', [WarehouseController::class, 'store']);
            Route::patch('/warehouses/{id}', [WarehouseController::class, 'update'])->whereNumber('id');
            Route::post('/locations', [LocationController::class, 'store']);
            Route::patch('/locations/{id}', [LocationController::class, 'update'])->whereNumber('id');
            Route::post('/locations/validate-selection', [LocationController::class, 'validateSelection']);
            Route::post('/price-lists', [PriceListController::class, 'store']);
            Route::patch('/price-lists/{priceList}', [PriceListController::class, 'update'])->whereNumber('priceList');
            Route::post('/price-lists/{priceList}/entries', [PriceListController::class, 'saveEntry'])->whereNumber('priceList');
            Route::delete('/price-lists/{priceList}/entries/{productId}', [PriceListController::class, 'removeEntry'])
                ->whereNumber('priceList')->whereNumber('productId');
            Route::post('/active-organization', [WorkspaceController::class, 'switchOrganization']);
        });
    });
});
