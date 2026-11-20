<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Symfony\Component\HttpFoundation\Response;

class RequireExplicitCsrfToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->input('_token') ?: $request->header('X-CSRF-TOKEN');

        if (
            ! is_string($token)
            || ! is_string($request->session()->token())
            || ! hash_equals($request->session()->token(), $token)
        ) {
            throw new TokenMismatchException('CSRF token mismatch.');
        }

        return $next($request);
    }
}
