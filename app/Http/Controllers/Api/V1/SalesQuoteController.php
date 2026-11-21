<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Lead;
use App\Models\Organization;
use App\Models\PriceList;
use App\Models\PriceListEntry;
use App\Models\Product;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use App\Models\SalesQuote;
use App\Models\SalesQuoteLine;
use App\Services\Sales\SalesDocumentCalculator;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

class SalesQuoteController extends SalesController
{
    public function index(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $validated = $request->validate(['q' => ['sometimes', 'nullable', 'string', 'max:120']]);
        $search = trim((string) ($validated['q'] ?? ''));
        $query = SalesQuote::query()->where('organization_id', $organization->getKey())->with('order')->orderByDesc('id');

        if ($search !== '') {
            $query->where(fn ($nested) => $nested->where('code', 'like', '%'.$search.'%')
                ->orWhere('lead_title_snapshot', 'like', '%'.$search.'%')
                ->orWhere('customer_name_snapshot', 'like', '%'.$search.'%'));
        }

        return response()->json(['data' => $query->get()->map(fn (SalesQuote $quote): array => $this->serializeQuoteListItem($quote))->values()]);
    }

    public function show(Request $request, int $quote): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $record = SalesQuote::query()->where('organization_id', $organization->getKey())->with('order')->findOrFail($quote);

        return response()->json(['data' => $this->serializeQuote($record)]);
    }

    public function store(Request $request, int $lead): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $record = Lead::query()->where('organization_id', $organization->getKey())->with('customer')->findOrFail($lead);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        if (! $record->customer->roles()->where('organization_id', $organization->getKey())->where('role', 'customer')->exists()) {
            throw ValidationException::withMessages(['party_id' => 'مشتری سرنخ دیگر نقش مشتری فعال ندارد.']);
        }
        $validated = $request->validate(['price_list_id' => ['required', 'integer', 'min:1']], [
            'price_list_id.required' => 'برای پیش‌نویس، فهرست قیمت را انتخاب کنید.',
        ]);
        $list = PriceList::query()->where('organization_id', $organization->getKey())->find($validated['price_list_id']);
        if ($list === null) {
            throw ValidationException::withMessages(['price_list_id' => 'فهرست قیمت انتخاب‌شده برای سازمان فعال در دسترس نیست.']);
        }

        $quote = SalesQuote::query()->create([
            'organization_id' => $organization->getKey(),
            'lead_id' => $record->getKey(),
            'customer_party_id' => $record->customer->getKey(),
            'price_list_id' => $list->getKey(),
            'code' => 'QT-'.Str::upper((string) Str::ulid()),
            'status' => 'draft',
            'lead_code_snapshot' => $record->code,
            'lead_title_snapshot' => $record->title,
            'customer_code_snapshot' => $record->customer->code,
            'customer_name_snapshot' => $record->customer->display_name,
            'price_list_code_snapshot' => $list->code,
            'price_list_name_snapshot' => $list->name,
            'total_toman' => '0',
        ]);

        return response()->json(['data' => $this->serializeQuote($quote)], 201);
    }

    public function addLine(Request $request, int $quote): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $record = $this->scopedQuote($organization, $quote);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $validated = $request->validate([
            'product_id' => ['required', 'integer', 'min:1'],
            'quantity' => ['required', 'string'],
            'discount' => ['required', 'string'],
        ], [
            'product_id.required' => 'یک کالا انتخاب کنید.',
            'quantity.required' => 'مقدار کالا را وارد کنید.',
            'discount.required' => 'درصد تخفیف را وارد کنید.',
        ]);
        $calculator = app(SalesDocumentCalculator::class);
        $quantity = $calculator->normalizeQuantity($validated['quantity']);
        $discount = $calculator->discountBasisPoints($validated['discount']);

        $line = DB::transaction(function () use ($organization, $record, $validated, $quantity, $discount, $calculator): SalesQuoteLine {
            $lockedQuote = $this->lockDraftQuote($organization, $record->getKey());
            $product = Product::query()->where('organization_id', $organization->getKey())
                ->lockForUpdate()->find($validated['product_id']);
            if ($product === null) {
                throw ValidationException::withMessages(['product_id' => 'کالای انتخاب‌شده برای سازمان فعال در دسترس نیست.']);
            }
            $product->load('baseUnit');
            if ($product->baseUnit === null) {
                throw ValidationException::withMessages(['product_id' => 'برای این کالا واحد پایه تعریف نشده است.']);
            }

            $price = PriceListEntry::query()->where('organization_id', $organization->getKey())
                ->where('price_list_id', $lockedQuote->price_list_id)->where('product_id', $product->getKey())
                ->lockForUpdate()->first();
            if ($price === null) {
                throw ValidationException::withMessages(['product_id' => 'برای این کالا در فهرست قیمت انتخاب‌شده قیمتی ثبت نشده است.']);
            }

            // P04 stores whole rials; each stored rial is one tenth of a toman.
            $net = $calculator->lineNetToman($quantity, (string) $price->amount_rial, $discount);
            $line = $lockedQuote->lines()->create([
                'organization_id' => $organization->getKey(),
                'product_id' => $product->getKey(),
                'unit_id' => $product->baseUnit->getKey(),
                'product_code_snapshot' => $product->code,
                'product_name_snapshot' => $product->name,
                'unit_code_snapshot' => $product->baseUnit->code,
                'unit_name_snapshot' => $product->baseUnit->name,
                'unit_symbol_snapshot' => $product->baseUnit->symbol,
                'quantity' => $quantity,
                'unit_price_toman_tenths' => (string) $price->amount_rial,
                'discount_basis_points' => $discount,
                'line_net_toman' => $net,
            ]);
            $this->refreshQuoteTotal($lockedQuote, $calculator);

            return $line;
        });

        return response()->json(['data' => $this->serializeQuoteLine($line)], 201);
    }

    public function updateLine(Request $request, int $quote, int $line): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $record = $this->scopedQuote($organization, $quote);
        $lineRecord = SalesQuoteLine::query()->where('organization_id', $organization->getKey())
            ->where('quote_id', $record->getKey())->findOrFail($line);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $validated = $request->validate([
            'quantity' => ['required', 'string'],
            'discount' => ['required', 'string'],
        ]);
        $calculator = app(SalesDocumentCalculator::class);
        $quantity = $calculator->normalizeQuantity($validated['quantity']);
        $discount = $calculator->discountBasisPoints($validated['discount']);

        $updated = DB::transaction(function () use ($organization, $record, $lineRecord, $quantity, $discount, $calculator): SalesQuoteLine {
            $lockedQuote = $this->lockDraftQuote($organization, $record->getKey());
            $lockedLine = SalesQuoteLine::query()->where('organization_id', $organization->getKey())
                ->where('quote_id', $lockedQuote->getKey())->lockForUpdate()->findOrFail($lineRecord->getKey());
            $lockedLine->quantity = $quantity;
            $lockedLine->discount_basis_points = $discount;
            $lockedLine->line_net_toman = $calculator->lineNetToman($quantity, (string) $lockedLine->unit_price_toman_tenths, $discount);
            $lockedLine->save();
            $this->refreshQuoteTotal($lockedQuote, $calculator);

            return $lockedLine->fresh();
        });

        return response()->json(['data' => $this->serializeQuoteLine($updated)]);
    }

    public function repriceLine(Request $request, int $quote, int $line): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $record = $this->scopedQuote($organization, $quote);
        $lineRecord = SalesQuoteLine::query()->where('organization_id', $organization->getKey())
            ->where('quote_id', $record->getKey())->findOrFail($line);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $calculator = app(SalesDocumentCalculator::class);

        $updated = DB::transaction(function () use ($organization, $record, $lineRecord, $calculator): SalesQuoteLine {
            $lockedQuote = $this->lockDraftQuote($organization, $record->getKey());
            $lockedLine = SalesQuoteLine::query()->where('organization_id', $organization->getKey())
                ->where('quote_id', $lockedQuote->getKey())->lockForUpdate()->findOrFail($lineRecord->getKey());
            $product = Product::query()->where('organization_id', $organization->getKey())
                ->lockForUpdate()->findOrFail($lockedLine->product_id)->load('baseUnit');
            if ($product->baseUnit === null) {
                throw ValidationException::withMessages(['product_id' => 'برای این کالا واحد پایه تعریف نشده است.']);
            }
            $price = PriceListEntry::query()->where('organization_id', $organization->getKey())
                ->where('price_list_id', $lockedQuote->price_list_id)->where('product_id', $product->getKey())
                ->lockForUpdate()->first();
            if ($price === null) {
                throw ValidationException::withMessages(['product_id' => 'برای این کالا در فهرست قیمت انتخاب‌شده قیمتی ثبت نشده است.']);
            }

            $lockedLine->fill([
                'unit_id' => $product->baseUnit->getKey(),
                'product_code_snapshot' => $product->code,
                'product_name_snapshot' => $product->name,
                'unit_code_snapshot' => $product->baseUnit->code,
                'unit_name_snapshot' => $product->baseUnit->name,
                'unit_symbol_snapshot' => $product->baseUnit->symbol,
                'unit_price_toman_tenths' => (string) $price->amount_rial,
            ]);
            $lockedLine->line_net_toman = $calculator->lineNetToman(
                (string) $lockedLine->quantity,
                (string) $lockedLine->unit_price_toman_tenths,
                (int) $lockedLine->discount_basis_points,
            );
            $lockedLine->save();
            $this->refreshQuoteTotal($lockedQuote, $calculator);

            return $lockedLine->fresh();
        });

        return response()->json(['data' => $this->serializeQuoteLine($updated)]);
    }

    public function removeLine(Request $request, int $quote, int $line): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $record = $this->scopedQuote($organization, $quote);
        $lineRecord = SalesQuoteLine::query()->where('organization_id', $organization->getKey())
            ->where('quote_id', $record->getKey())->findOrFail($line);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $calculator = app(SalesDocumentCalculator::class);

        DB::transaction(function () use ($organization, $record, $lineRecord, $calculator): void {
            $lockedQuote = $this->lockDraftQuote($organization, $record->getKey());
            SalesQuoteLine::query()->where('organization_id', $organization->getKey())
                ->where('quote_id', $lockedQuote->getKey())->lockForUpdate()->findOrFail($lineRecord->getKey())->delete();
            $this->refreshQuoteTotal($lockedQuote, $calculator);
        });

        return response()->json(['data' => ['removed' => true]]);
    }

    public function confirm(Request $request, int $quote): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $record = $this->scopedQuote($organization, $quote);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $calculator = app(SalesDocumentCalculator::class);

        $confirmed = DB::transaction(function () use ($organization, $record, $calculator): SalesQuote {
            $lockedQuote = $this->lockDraftQuote($organization, $record->getKey());
            $lines = $lockedQuote->lines()->orderBy('id')->lockForUpdate()->get();
            if ($lines->isEmpty()) {
                throw ValidationException::withMessages(['lines' => 'برای تأیید، دست‌کم یک سطر معتبر لازم است.']);
            }
            $calculation = $calculator->calculatePersistedLines($lines);
            foreach ($lines as $line) {
                $line->line_net_toman = $calculation['line_amounts'][$line->getKey()];
                $line->save();
            }
            $lockedQuote->total_toman = $calculation['total_toman'];
            $lockedQuote->status = 'confirmed';
            $lockedQuote->confirmed_at = now();
            $lockedQuote->save();

            return $lockedQuote->fresh();
        });

        return response()->json(['data' => $this->serializeQuote($confirmed)]);
    }

    public function convert(Request $request, int $quote): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $record = $this->scopedQuote($organization, $quote);
        $this->authorizeManage($organization);
        $this->rejectOrganizationOverride($request);
        $calculator = app(SalesDocumentCalculator::class);
        $alreadyExists = false;

        try {
            $order = DB::transaction(function () use ($organization, $record, $calculator, &$alreadyExists): SalesOrder {
                $lockedQuote = SalesQuote::query()->where('organization_id', $organization->getKey())
                    ->lockForUpdate()->findOrFail($record->getKey());
                $existing = SalesOrder::query()->where('organization_id', $organization->getKey())
                    ->where('source_quote_id', $lockedQuote->getKey())->first();
                if ($existing !== null) {
                    $alreadyExists = true;

                    return $existing;
                }
                if ($lockedQuote->status !== 'confirmed') {
                    throw new HttpException(409, 'فقط پیش‌فاکتور تأییدشده به سفارش فروش تبدیل می‌شود.');
                }

                $lines = $lockedQuote->lines()->orderBy('id')->lockForUpdate()->get();
                if ($lines->isEmpty()) {
                    throw ValidationException::withMessages(['lines' => 'پیش‌فاکتور تأییدشده سطر قابل انتقال ندارد.']);
                }
                $calculation = $calculator->calculatePersistedLines($lines);
                if ($calculation['total_toman'] !== (string) $lockedQuote->total_toman) {
                    throw ValidationException::withMessages(['quote' => 'جمع ذخیره‌شده با سطرهای پیش‌فاکتور مطابقت ندارد.']);
                }
                foreach ($lines as $line) {
                    if ($calculation['line_amounts'][$line->getKey()] !== (string) $line->line_net_toman) {
                        throw ValidationException::withMessages(['quote' => 'مبلغ ذخیره‌شدهٔ یکی از سطرها معتبر نیست.']);
                    }
                }

                $order = SalesOrder::query()->create([
                    'organization_id' => $organization->getKey(),
                    'source_quote_id' => $lockedQuote->getKey(),
                    'lead_id' => $lockedQuote->lead_id,
                    'customer_party_id' => $lockedQuote->customer_party_id,
                    'code' => 'SO-'.Str::upper((string) Str::ulid()),
                    'status' => 'confirmed',
                    'lead_code_snapshot' => $lockedQuote->lead_code_snapshot,
                    'lead_title_snapshot' => $lockedQuote->lead_title_snapshot,
                    'customer_code_snapshot' => $lockedQuote->customer_code_snapshot,
                    'customer_name_snapshot' => $lockedQuote->customer_name_snapshot,
                    'price_list_code_snapshot' => $lockedQuote->price_list_code_snapshot,
                    'price_list_name_snapshot' => $lockedQuote->price_list_name_snapshot,
                    'total_toman' => $calculation['total_toman'],
                    'confirmed_at' => $lockedQuote->confirmed_at,
                ]);

                foreach ($lines as $line) {
                    SalesOrderLine::query()->create([
                        'organization_id' => $organization->getKey(),
                        'sales_order_id' => $order->getKey(),
                        'source_quote_line_id' => $line->getKey(),
                        'product_id' => $line->product_id,
                        'unit_id' => $line->unit_id,
                        'product_code_snapshot' => $line->product_code_snapshot,
                        'product_name_snapshot' => $line->product_name_snapshot,
                        'unit_code_snapshot' => $line->unit_code_snapshot,
                        'unit_name_snapshot' => $line->unit_name_snapshot,
                        'unit_symbol_snapshot' => $line->unit_symbol_snapshot,
                        'quantity' => $line->quantity,
                        'unit_price_toman_tenths' => (string) $line->unit_price_toman_tenths,
                        'discount_basis_points' => $line->discount_basis_points,
                        'line_net_toman' => $calculation['line_amounts'][$line->getKey()],
                    ]);
                }

                return $order;
            }, 3);
        } catch (QueryException $exception) {
            $order = SalesOrder::query()->where('organization_id', $organization->getKey())
                ->where('source_quote_id', $record->getKey())->first();
            if ($order === null) {
                throw $exception;
            }
            $alreadyExists = true;
        }

        return response()->json(['data' => $this->serializeOrder($order), 'already_exists' => $alreadyExists], $alreadyExists ? 200 : 201);
    }

    private function scopedQuote(Organization $organization, int $id): SalesQuote
    {
        return SalesQuote::query()->where('organization_id', $organization->getKey())->findOrFail($id);
    }

    private function lockDraftQuote(Organization $organization, int $id): SalesQuote
    {
        $quote = SalesQuote::query()->where('organization_id', $organization->getKey())->lockForUpdate()->findOrFail($id);
        if ($quote->status !== 'draft') {
            throw new HttpException(409, 'فقط پیش‌نویس قابل ویرایش است.');
        }

        return $quote;
    }

    private function refreshQuoteTotal(SalesQuote $quote, SalesDocumentCalculator $calculator): void
    {
        $lines = $quote->lines()->orderBy('id')->get();
        $calculation = $calculator->calculatePersistedLines($lines);
        foreach ($lines as $line) {
            $line->line_net_toman = $calculation['line_amounts'][$line->getKey()];
            $line->save();
        }
        $quote->total_toman = $calculation['total_toman'];
        $quote->save();
    }

    private function serializeQuoteListItem(SalesQuote $quote): array
    {
        return [
            ...$this->serializeQuoteSummary($quote),
            'lead' => ['id' => $quote->lead_id, 'code' => $quote->lead_code_snapshot, 'title' => $quote->lead_title_snapshot],
            'customer' => ['id' => $quote->customer_party_id, 'code' => $quote->customer_code_snapshot, 'name' => $quote->customer_name_snapshot],
        ];
    }
}
