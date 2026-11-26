<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AccountingBook;
use App\Models\Organization;
use App\Services\Reporting\P11DashboardService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class DashboardController extends Controller
{
    public function __construct(private readonly P11DashboardService $dashboard) {}

    public function options(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeRead($organization);

        return response()->json(['data' => $this->dashboard->books($organization)]);
    }

    public function summary(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeRead($organization);
        $validated = $request->validate([
            'book_id' => ['required', 'integer', 'min:1'],
            'as_of_date' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'currency' => ['sometimes', 'in:IRR,TOMAN'],
        ]);
        $book = $this->bookForOrganization($organization, (int) $validated['book_id']);
        $asOfDate = $validated['as_of_date'] ?? CarbonImmutable::now($book->time_zone)->toDateString();
        $currency = $validated['currency'] ?? 'IRR';

        return response()->json([
            'data' => $this->dashboard->summary($organization, $book, $asOfDate, $currency),
        ]);
    }

    public function records(Request $request, string $metric): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeRead($organization);

        abort_unless(in_array($metric, [
            'net-sales', 'overdue-receivables', 'available-stock', 'pending-purchase-approvals',
        ], true), 404);

        $validated = $request->validate([
            'book_id' => ['required', 'integer', 'min:1'],
            'as_of_date' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'currency' => ['sometimes', 'in:IRR,TOMAN'],
            'page' => ['sometimes', 'integer', 'min:1', 'max:1000000'],
        ]);
        $book = $this->bookForOrganization($organization, (int) $validated['book_id']);
        $asOfDate = $validated['as_of_date'] ?? CarbonImmutable::now($book->time_zone)->toDateString();
        $currency = $validated['currency'] ?? 'IRR';

        return response()->json([
            'data' => $this->dashboard->records(
                $organization,
                $book,
                $asOfDate,
                $currency,
                $metric,
                (int) ($validated['page'] ?? 1),
            ),
        ]);
    }

    private function activeOrganization(Request $request): Organization
    {
        $organization = $request->attributes->get('activeOrganization');
        abort_unless($organization instanceof Organization, 403);

        return $organization;
    }

    private function authorizeRead(Organization $organization): void
    {
        Gate::authorize('viewSales', $organization);
        Gate::authorize('viewStock', $organization);
        Gate::authorize('viewPurchasing', $organization);
        Gate::authorize('viewAccounting', $organization);
    }

    private function bookForOrganization(Organization $organization, int $bookId): AccountingBook
    {
        return AccountingBook::query()
            ->where('organization_id', $organization->getKey())
            ->findOrFail($bookId);
    }
}
