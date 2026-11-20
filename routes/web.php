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
});
