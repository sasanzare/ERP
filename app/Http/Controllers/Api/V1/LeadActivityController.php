<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Lead;
use App\Models\LeadActivity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class LeadActivityController extends SalesController
{
    public function show(Request $request, int $activity): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $record = LeadActivity::query()->where('organization_id', $organization->getKey())->with('lead')->findOrFail($activity);

        return response()->json(['data' => $this->serializeActivity($record)]);
    }

    public function overdue(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $activities = LeadActivity::query()->where('organization_id', $organization->getKey())
            ->whereNull('completed_at')->where('due_at', '<', now())
            ->with('lead')->orderBy('due_at')->get();

        return response()->json(['data' => $activities->map(fn (LeadActivity $activity): array => $this->serializeActivity($activity))->values()]);
    }

    public function store(Request $request, int $lead): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $record = Lead::query()->where('organization_id', $organization->getKey())->findOrFail($lead);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:200'],
            'due_at' => ['required', 'date'],
        ], [
            'title.required' => 'عنوان پیگیری را وارد کنید.',
            'due_at.required' => 'زمان پیگیری را مشخص کنید.',
            'due_at.date' => 'زمان پیگیری معتبر نیست.',
        ]);

        $activity = LeadActivity::query()->create([
            'organization_id' => $organization->getKey(),
            'lead_id' => $record->getKey(),
            'title' => $validated['title'],
            'due_at' => Carbon::parse($validated['due_at']),
        ]);

        return response()->json(['data' => $this->serializeActivity($activity)], 201);
    }

    public function complete(Request $request, int $activity): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $record = LeadActivity::query()->where('organization_id', $organization->getKey())->findOrFail($activity);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);

        $record = DB::transaction(function () use ($organization, $record): LeadActivity {
            $locked = LeadActivity::query()->where('organization_id', $organization->getKey())
                ->lockForUpdate()->findOrFail($record->getKey());
            if ($locked->completed_at === null) {
                $locked->completed_at = now();
                $locked->save();
            }

            return $locked->fresh('lead');
        });

        return response()->json(['data' => $this->serializeActivity($record)]);
    }
}
