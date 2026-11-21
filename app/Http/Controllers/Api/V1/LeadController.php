<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Lead;
use App\Models\Party;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LeadController extends SalesController
{
    public function index(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $validated = $request->validate(['q' => ['sometimes', 'nullable', 'string', 'max:120']]);
        $search = trim((string) ($validated['q'] ?? ''));
        $query = Lead::query()->where('organization_id', $organization->getKey())->with('customer')->orderByDesc('id');

        if ($search !== '') {
            $query->where(fn ($nested) => $nested->where('code', 'like', '%'.$search.'%')
                ->orWhere('title', 'like', '%'.$search.'%')
                ->orWhereHas('customer', fn ($party) => $party->where('display_name', 'like', '%'.$search.'%')));
        }

        return response()->json(['data' => $query->get()->map(fn (Lead $lead): array => $this->serializeLeadSummary($lead))->values()]);
    }

    public function show(Request $request, int $lead): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $record = Lead::query()->where('organization_id', $organization->getKey())
            ->with(['customer', 'activities' => fn ($query) => $query->orderByDesc('due_at'), 'quotes.order'])
            ->findOrFail($lead);

        return response()->json(['data' => [
            ...$this->serializeLeadSummary($record),
            'activities' => $record->activities->map(fn ($activity): array => $this->serializeActivity($activity))->values(),
            'quotes' => $record->quotes->map(fn ($quote): array => $this->serializeQuoteSummary($quote))->values(),
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:200'],
            'party_id' => ['required', 'integer', 'min:1'],
        ], [
            'title.required' => 'عنوان سرنخ را وارد کنید.',
            'party_id.required' => 'یک مشتری برای سرنخ انتخاب کنید.',
        ]);

        $party = Party::query()->where('organization_id', $organization->getKey())->find($validated['party_id']);
        if ($party === null || ! $party->roles()->where('organization_id', $organization->getKey())->where('role', 'customer')->exists()) {
            throw ValidationException::withMessages(['party_id' => 'مشتری انتخاب‌شده برای سازمان فعال در دسترس نیست.']);
        }

        $lead = Lead::query()->create([
            'organization_id' => $organization->getKey(),
            'party_id' => $party->getKey(),
            'code' => 'LD-'.Str::upper((string) Str::ulid()),
            'title' => $validated['title'],
        ])->load('customer');

        return response()->json(['data' => $this->serializeLeadSummary($lead)], 201);
    }
}
