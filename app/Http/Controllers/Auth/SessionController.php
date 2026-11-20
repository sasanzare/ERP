<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;

class SessionController extends Controller
{
    public function create(): View
    {
        return view('products', ['page' => 'sign-in']);
    }

    public function store(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string', 'max:255'],
        ]);

        $credentials['email'] = mb_strtolower(trim($credentials['email']));

        if (! Auth::attempt($credentials, false)) {
            return response()->json([
                'message' => 'ایمیل یا گذرواژه معتبر نیست.',
            ], 422);
        }

        $request->session()->regenerate();

        return response()->json(['redirect' => '/products']);
    }

    public function destroy(Request $request): JsonResponse
    {
        Auth::logout();
        $request->session()->forget('active_organization_id');
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['redirect' => '/sign-in']);
    }
}
