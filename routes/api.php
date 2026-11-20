<?php

use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\WorkspaceController;
use App\Http\Middleware\RequireExplicitCsrfToken;
use App\Http\Middleware\ResolveActiveOrganization;
use Illuminate\Support\Facades\Route;

Route::middleware('web')->prefix('v1')->group(function (): void {
    Route::middleware(['auth', ResolveActiveOrganization::class])->group(function (): void {
        Route::get('/products', [ProductController::class, 'index']);
        Route::get('/workspace', [WorkspaceController::class, 'show']);

        Route::middleware(RequireExplicitCsrfToken::class)->group(function (): void {
            Route::patch('/products/{id}', [ProductController::class, 'update'])->whereNumber('id');
            Route::post('/active-organization', [WorkspaceController::class, 'switchOrganization']);
        });
    });
});
