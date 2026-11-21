<?php

use App\Http\Controllers\Api\V1\LeadActivityController;
use App\Http\Controllers\Api\V1\LeadController;
use App\Http\Controllers\Api\V1\LocationController;
use App\Http\Controllers\Api\V1\PartyController;
use App\Http\Controllers\Api\V1\PriceListController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\SalesOrderController;
use App\Http\Controllers\Api\V1\SalesQuoteController;
use App\Http\Controllers\Api\V1\SalesWorkspaceController;
use App\Http\Controllers\Api\V1\StockController;
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
        Route::get('/sales/options', [SalesWorkspaceController::class, 'options']);
        Route::get('/leads', [LeadController::class, 'index']);
        Route::get('/leads/{lead}', [LeadController::class, 'show'])->whereNumber('lead');
        Route::get('/lead-activities/overdue', [LeadActivityController::class, 'overdue']);
        Route::get('/lead-activities/{activity}', [LeadActivityController::class, 'show'])->whereNumber('activity');
        Route::get('/quotes', [SalesQuoteController::class, 'index']);
        Route::get('/quotes/{quote}', [SalesQuoteController::class, 'show'])->whereNumber('quote');
        Route::get('/sales-orders', [SalesOrderController::class, 'index']);
        Route::get('/sales-orders/{order}', [SalesOrderController::class, 'show'])->whereNumber('order');
        Route::get('/stock/options', [StockController::class, 'options']);
        Route::get('/stock/balances', [StockController::class, 'balances']);
        Route::get('/stock/movements', [StockController::class, 'movements']);
        Route::get('/stock/reservations', [StockController::class, 'reservations']);

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
            Route::post('/leads', [LeadController::class, 'store']);
            Route::post('/leads/{lead}/activities', [LeadActivityController::class, 'store'])->whereNumber('lead');
            Route::post('/lead-activities/{activity}/complete', [LeadActivityController::class, 'complete'])->whereNumber('activity');
            Route::post('/leads/{lead}/quotes', [SalesQuoteController::class, 'store'])->whereNumber('lead');
            Route::post('/quotes/{quote}/lines', [SalesQuoteController::class, 'addLine'])->whereNumber('quote');
            Route::patch('/quotes/{quote}/lines/{line}', [SalesQuoteController::class, 'updateLine'])->whereNumber('quote')->whereNumber('line');
            Route::post('/quotes/{quote}/lines/{line}/reprice', [SalesQuoteController::class, 'repriceLine'])->whereNumber('quote')->whereNumber('line');
            Route::delete('/quotes/{quote}/lines/{line}', [SalesQuoteController::class, 'removeLine'])->whereNumber('quote')->whereNumber('line');
            Route::post('/quotes/{quote}/confirm', [SalesQuoteController::class, 'confirm'])->whereNumber('quote');
            Route::post('/quotes/{quote}/convert', [SalesQuoteController::class, 'convert'])->whereNumber('quote');
            Route::post('/sales-orders/{order}/lines/{line}/reservations', [SalesOrderController::class, 'reserveLine'])
                ->whereNumber('order')->whereNumber('line');
            Route::post('/sales-orders/{order}/lines/{line}/deliveries', [SalesOrderController::class, 'deliverLine'])
                ->whereNumber('order')->whereNumber('line');
            Route::post('/sales-orders/{order}/lines/{line}/cancel-remainder', [SalesOrderController::class, 'cancelRemainder'])
                ->whereNumber('order')->whereNumber('line');
            Route::post('/stock/operations', [StockController::class, 'postOperation']);
            Route::post('/stock/reservations', [StockController::class, 'reserve']);
            Route::post('/stock/reservations/{reservation}/release', [StockController::class, 'release'])->whereNumber('reservation');
        });
    });
});
