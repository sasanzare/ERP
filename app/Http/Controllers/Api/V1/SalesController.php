<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\Organization;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use App\Models\SalesQuote;
use App\Models\SalesQuoteLine;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

abstract class SalesController extends Controller
{
    protected function activeOrganization(Request $request): Organization
    {
        $organization = $request->attributes->get('activeOrganization');
        abort_unless($organization instanceof Organization, 403);
        Gate::authorize('viewSales', $organization);

        return $organization;
    }

    protected function authorizeManage(Organization $organization): void
    {
        Gate::authorize('manageSales', $organization);
    }

    protected function rejectOrganizationOverride(Request $request): void
    {
        if (array_key_exists('organization_id', $request->all())) {
            throw ValidationException::withMessages([
                'organization_id' => 'سازمان از نشست فعال تعیین می‌شود و از درخواست پذیرفته نمی‌شود.',
            ]);
        }
    }

    protected function serializeActivity(LeadActivity $activity): array
    {
        return [
            'id' => $activity->getKey(),
            'lead_id' => $activity->lead_id,
            'lead' => $activity->relationLoaded('lead') && $activity->lead !== null ? [
                'id' => $activity->lead->getKey(),
                'code' => $activity->lead->code,
                'title' => $activity->lead->title,
            ] : null,
            'title' => $activity->title,
            'due_at' => $activity->due_at->toIso8601String(),
            'completed_at' => $activity->completed_at?->toIso8601String(),
            'is_overdue' => $activity->completed_at === null && $activity->due_at->lt(now()),
        ];
    }

    protected function serializeLeadSummary(Lead $lead): array
    {
        return [
            'id' => $lead->getKey(),
            'code' => $lead->code,
            'title' => $lead->title,
            'customer' => [
                'id' => $lead->customer->getKey(),
                'code' => $lead->customer->code,
                'name' => $lead->customer->display_name,
            ],
        ];
    }

    protected function serializeQuoteSummary(SalesQuote $quote): array
    {
        return [
            'id' => $quote->getKey(),
            'code' => $quote->code,
            'status' => $quote->status,
            'total_toman' => (string) $quote->total_toman,
            'created_at' => $quote->created_at->toIso8601String(),
            'order' => $quote->relationLoaded('order') && $quote->order !== null ? [
                'id' => $quote->order->getKey(),
                'code' => $quote->order->code,
            ] : null,
        ];
    }

    protected function serializeQuote(SalesQuote $quote): array
    {
        $quote->loadMissing(['lines' => fn ($query) => $query->orderBy('id'), 'order']);

        return [
            ...$this->serializeQuoteSummary($quote),
            'lead' => [
                'id' => $quote->lead_id,
                'code' => $quote->lead_code_snapshot,
                'title' => $quote->lead_title_snapshot,
            ],
            'customer' => [
                'id' => $quote->customer_party_id,
                'code' => $quote->customer_code_snapshot,
                'name' => $quote->customer_name_snapshot,
            ],
            'price_list' => [
                'id' => $quote->price_list_id,
                'code' => $quote->price_list_code_snapshot,
                'name' => $quote->price_list_name_snapshot,
            ],
            'confirmed_at' => $quote->confirmed_at?->toIso8601String(),
            'lines' => $quote->lines->map(fn (SalesQuoteLine $line): array => $this->serializeQuoteLine($line))->values(),
        ];
    }

    protected function serializeQuoteLine(SalesQuoteLine $line): array
    {
        return [
            'id' => $line->getKey(),
            'product_id' => $line->product_id,
            'unit_id' => $line->unit_id,
            'product_code' => $line->product_code_snapshot,
            'product_name' => $line->product_name_snapshot,
            'unit' => [
                'id' => $line->unit_id,
                'code' => $line->unit_code_snapshot,
                'name' => $line->unit_name_snapshot,
                'symbol' => $line->unit_symbol_snapshot,
            ],
            'quantity' => (string) $line->quantity,
            'unit_price_toman' => $this->formatTomanPrice((string) $line->unit_price_toman_tenths),
            'discount_basis_points' => (int) $line->discount_basis_points,
            'discount_percent' => $this->formatDiscount((int) $line->discount_basis_points),
            'line_net_toman' => (string) $line->line_net_toman,
        ];
    }

    protected function serializeOrder(SalesOrder $order): array
    {
        $order->loadMissing(['lines' => fn ($query) => $query->orderBy('id')]);

        return [
            'id' => $order->getKey(),
            'code' => $order->code,
            'status' => $order->status,
            'total_toman' => (string) $order->total_toman,
            'confirmed_at' => $order->confirmed_at->toIso8601String(),
            'source_quote' => [
                'id' => $order->source_quote_id,
                'code' => $order->sourceQuote?->code,
            ],
            'lead' => [
                'id' => $order->lead_id,
                'code' => $order->lead_code_snapshot,
                'title' => $order->lead_title_snapshot,
            ],
            'customer' => [
                'id' => $order->customer_party_id,
                'code' => $order->customer_code_snapshot,
                'name' => $order->customer_name_snapshot,
            ],
            'price_list' => [
                'code' => $order->price_list_code_snapshot,
                'name' => $order->price_list_name_snapshot,
            ],
            'lines' => $order->lines->map(fn (SalesOrderLine $line): array => [
                ...$this->serializeQuoteLine($this->quoteLineView($line)),
                'source_quote_line_id' => $line->source_quote_line_id,
            ])->values(),
        ];
    }

    protected function formatDiscount(int $basisPoints): string
    {
        return intdiv($basisPoints, 100).'.'.str_pad((string) ($basisPoints % 100), 2, '0', STR_PAD_LEFT);
    }

    protected function formatTomanPrice(string $tenths): string
    {
        $value = (int) $tenths;

        return intdiv($value, 10).'.'.($value % 10);
    }

    private function quoteLineView(SalesOrderLine $line): SalesQuoteLine
    {
        $view = new SalesQuoteLine;
        $view->setRawAttributes([
            'id' => $line->getKey(),
            'product_id' => $line->product_id,
            'unit_id' => $line->unit_id,
            'product_code_snapshot' => $line->product_code_snapshot,
            'product_name_snapshot' => $line->product_name_snapshot,
            'unit_code_snapshot' => $line->unit_code_snapshot,
            'unit_name_snapshot' => $line->unit_name_snapshot,
            'unit_symbol_snapshot' => $line->unit_symbol_snapshot,
            'quantity' => $line->quantity,
            'unit_price_toman_tenths' => $line->unit_price_toman_tenths,
            'discount_basis_points' => $line->discount_basis_points,
            'line_net_toman' => $line->line_net_toman,
        ], true);

        return $view;
    }
}
