<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Services\ProjectWork\DueReminderService;
use App\Services\ProjectWork\ProjectWorkService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class WorkInboxController extends Controller
{
    public function index(Request $request, DueReminderService $reminders, ProjectWorkService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $inbox = $reminders->inbox($organization, $request->user(), $service);

        return response()->json($inbox);
    }

    public function processDueReminders(Request $request, DueReminderService $reminders): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $unsupported = array_diff(array_keys($request->all()), []);
        if ($unsupported !== []) {
            throw ValidationException::withMessages(array_fill_keys($unsupported, 'این درخواست ورودی نمی‌پذیرد.'));
        }

        return response()->json([
            'created' => $reminders->processDueFor($organization, $request->user()),
            'today' => now(config('app.timezone'))->toDateString(),
            'time_zone' => config('app.timezone'),
        ]);
    }

    private function activeOrganization(Request $request): Organization
    {
        $organization = $request->attributes->get('activeOrganization');
        abort_unless($organization instanceof Organization, 403);
        Gate::authorize('viewWork', $organization);

        return $organization;
    }
}
