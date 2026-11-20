<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ResolveActiveOrganization
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $organizations = $user?->organizations()->orderBy('organizations.name')->get();

        if ($user === null || $organizations === null || $organizations->isEmpty()) {
            return $this->denied($request);
        }

        $activeId = $request->session()->get('active_organization_id');

        if ($activeId === null) {
            $organization = $organizations->first();
            $request->session()->put('active_organization_id', $organization->getKey());
        } else {
            $organization = $organizations->firstWhere('id', (int) $activeId);

            if ($organization === null) {
                $request->session()->forget('active_organization_id');

                return $this->denied($request);
            }
        }

        $request->attributes->set('activeOrganization', $organization);
        $request->attributes->set('activeMembership', $organization->pivot);

        return $next($request);
    }

    private function denied(Request $request): Response
    {
        if ($request->expectsJson()) {
            return response()->json(['message' => 'برای این سازمان دسترسی فعالی ندارید.'], 403);
        }

        return redirect()->route('access.denied');
    }
}
