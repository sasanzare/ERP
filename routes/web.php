<?php

use App\Http\Controllers\Auth\SessionController;
use App\Http\Middleware\RequireExplicitCsrfToken;
use App\Http\Middleware\ResolveActiveOrganization;
use Illuminate\Support\Facades\Route;

Route::middleware('guest')->group(function (): void {
    Route::get('/sign-in', [SessionController::class, 'create'])
        ->name('login');
    Route::post('/login', [SessionController::class, 'store'])
        ->middleware(['throttle:login', RequireExplicitCsrfToken::class])
        ->name('login.store');
});

Route::post('/logout', [SessionController::class, 'destroy'])
    ->middleware(['auth', RequireExplicitCsrfToken::class])
    ->name('logout');

Route::view('/access-denied', 'products', ['page' => 'denied'])
    ->middleware('auth')
    ->name('access.denied');

Route::middleware(['auth', ResolveActiveOrganization::class])->group(function (): void {
    Route::view('/', 'products')->name('workspace.home');
    Route::view('/products', 'products')->name('products.index');
    Route::view('/products/{id}', 'products')
        ->whereNumber('id')
        ->name('products.show');
    Route::view('/stock', 'products')->name('stock.balances');
    Route::view('/stock/movements', 'products')->name('stock.movements');
    Route::view('/stock/reservations', 'products')->name('stock.reservations');
    Route::view('/accounting/journals', 'products')->name('accounting.journals');
    Route::view('/accounting/journals/new', 'products')->name('accounting.journals.create');
    Route::view('/accounting/journals/{journalId}', 'products')->whereNumber('journalId')->name('accounting.journals.show');
    Route::get('/{resource}/{record?}', function (string $resource, ?string $record = null) {
        abort_unless(in_array($resource, ['parties', 'units', 'warehouses', 'locations', 'price-lists', 'leads', 'follow-ups', 'quotes', 'orders', 'purchase-requests', 'purchase-orders'], true), 404);
        abort_if($record !== null && $record !== 'new' && ! ctype_digit($record), 404);

        return view('products');
    })->where('record', '[0-9]+|new')->name('master-data.workspace');
});
