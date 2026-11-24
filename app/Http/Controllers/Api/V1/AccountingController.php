<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AccountingAccount;
use App\Models\AccountingBook;
use App\Models\AccountingJournal;
use App\Models\Organization;
use App\Services\Accounting\AccountingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AccountingController extends Controller
{
    public function options(Request $request, AccountingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $bookId = $request->query('book_id');
        if ($bookId !== null && (! ctype_digit((string) $bookId) || (int) $bookId < 1)) {
            throw ValidationException::withMessages(['book_id' => 'دفتر انتخاب‌شده معتبر نیست.']);
        }

        return response()->json([
            'data' => $service->options($organization, $bookId === null ? null : (int) $bookId),
            'current_user_id' => (int) $request->user()->getKey(),
            'can_manage' => Gate::allows('manageAccounting', $organization),
        ]);
    }

    public function bookStore(Request $request, AccountingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $this->rejectUnsupported($request, ['code', 'name', 'time_zone']);
        $data = $request->validate([
            'code' => ['required', 'string', 'max:64', Rule::unique('accounting_books', 'code')->where('organization_id', $organization->getKey())],
            'name' => ['required', 'string', 'max:160'],
            'time_zone' => ['sometimes', 'string', 'max:80'],
        ]);
        $book = $service->createBook($organization, trim($data['code']), trim($data['name']), $data['time_zone'] ?? 'Asia/Tehran');

        return response()->json(['data' => $service->serializeBook($book)], 201);
    }

    public function accountStore(Request $request, int $bookId, AccountingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $this->scopedBook($organization, $bookId);
        $this->rejectUnsupported($request, ['parent_account_id', 'code', 'name', 'category', 'is_postable']);
        $parentId = $request->input('parent_account_id');
        if ($parentId !== null) {
            $parentId = $this->inputId($parentId, 'parent_account_id');
            $this->scopedAccountForBook($organization, $bookId, $parentId);
        }

        $data = $request->validate([
            'code' => ['required', 'string', 'max:64', Rule::unique('accounting_accounts', 'code')->where('organization_id', $organization->getKey())->where('book_id', $bookId)],
            'name' => ['required', 'string', 'max:160'],
            'category' => ['required', Rule::in(['asset', 'liability', 'equity', 'revenue', 'expense'])],
            'is_postable' => ['required', 'boolean'],
            'parent_account_id' => ['nullable', 'integer', 'min:1'],
        ]);
        $account = $service->createAccount(
            $organization,
            $bookId,
            trim($data['code']),
            trim($data['name']),
            $data['category'],
            (bool) $data['is_postable'],
            $parentId === null ? null : (int) $parentId,
        );

        return response()->json(['data' => $service->serializeAccount($account)], 201);
    }

    public function periodStore(Request $request, int $bookId, AccountingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $this->scopedBook($organization, $bookId);
        $this->rejectUnsupported($request, ['code', 'name', 'starts_on', 'ends_on']);
        $data = $request->validate([
            'code' => ['required', 'string', 'max:40', Rule::unique('accounting_periods', 'code')->where('organization_id', $organization->getKey())->where('book_id', $bookId)],
            'name' => ['required', 'string', 'max:160'],
            'starts_on' => ['required', 'date_format:Y-m-d'],
            'ends_on' => ['required', 'date_format:Y-m-d'],
        ]);
        $period = $service->createPeriod($organization, $bookId, trim($data['code']), trim($data['name']), $data['starts_on'], $data['ends_on']);

        return response()->json(['data' => $service->serializePeriod($period)], 201);
    }

    public function periodClose(Request $request, int $periodId, AccountingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $this->rejectUnsupported($request, []);
        $period = $service->closePeriod($organization, $request->user(), $periodId);

        return response()->json(['data' => $service->serializePeriod($period)]);
    }

    public function journalIndex(Request $request, AccountingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $bookId = $request->query('book_id');
        if ($bookId !== null) {
            if (! ctype_digit((string) $bookId) || (int) $bookId < 1) {
                throw ValidationException::withMessages(['book_id' => 'دفتر انتخاب‌شده معتبر نیست.']);
            }
            $this->scopedBook($organization, (int) $bookId);
        }

        return response()->json(['data' => $service->journals($organization, $bookId === null ? null : (int) $bookId)]);
    }

    public function journalShow(Request $request, int $journalId, AccountingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $journal = $this->scopedJournal($organization, $journalId);

        return response()->json(['data' => $service->serializeJournal($journal->load([
            'book', 'period.closedBy:id,name', 'createdBy:id,name', 'postedBy:id,name',
            'lines.account:id,code,name,category', 'reversalOf:id,code', 'reversal:id,code,accounting_date,reversal_of_journal_id',
        ]))]);
    }

    public function journalStore(Request $request, AccountingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $this->rejectUnsupported($request, ['book_id', 'accounting_date', 'description', 'lines']);
        $bookId = $this->inputId($request->input('book_id'), 'book_id');
        $this->scopedBook($organization, $bookId);
        $data = $request->validate([
            'accounting_date' => ['required', 'date_format:Y-m-d'],
            'description' => ['required', 'string', 'max:500'],
            'lines' => ['required', 'array', 'min:1', 'max:200'],
        ]);
        $journal = $service->createDraft($organization, $request->user(), $bookId, [
            ...$data,
            'description' => trim($data['description']),
            'lines' => $request->input('lines'),
        ]);

        return response()->json(['data' => $service->serializeJournal($journal)], 201);
    }

    public function journalUpdate(Request $request, int $journalId, AccountingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $journal = $this->scopedJournal($organization, $journalId);
        if ($journal->status !== 'draft') {
            abort(409, 'سند ثبت‌شده قابل ویرایش نیست.');
        }
        $this->rejectUnsupported($request, ['accounting_date', 'description', 'lines']);
        $data = $request->validate([
            'accounting_date' => ['required', 'date_format:Y-m-d'],
            'description' => ['required', 'string', 'max:500'],
            'lines' => ['required', 'array', 'min:1', 'max:200'],
        ]);
        $updated = $service->updateDraft($organization, (int) $journal->getKey(), [
            ...$data,
            'description' => trim($data['description']),
            'lines' => $request->input('lines'),
        ]);

        return response()->json(['data' => $service->serializeJournal($updated)]);
    }

    public function journalPost(Request $request, int $journalId, AccountingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $journal = $this->scopedJournal($organization, $journalId);
        $this->rejectUnsupported($request, []);
        $key = Validator::make(['key' => $request->header('Idempotency-Key')], ['key' => ['required', 'uuid']])->validate()['key'];
        $result = $service->postDraft($organization, $request->user(), (int) $journal->getKey(), $key);

        return response()->json([
            'data' => $service->serializeJournal($result['journal']),
            'already_exists' => $result['already_exists'],
        ], $result['already_exists'] ? 200 : 201);
    }

    public function journalReverse(Request $request, int $journalId, AccountingService $service): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        $this->authorizeManage($organization);
        $journal = $this->scopedJournal($organization, $journalId);
        $this->rejectUnsupported($request, ['accounting_date', 'reason']);
        $data = $request->validate([
            'accounting_date' => ['required', 'date_format:Y-m-d'],
            'reason' => ['required', 'string', 'max:255'],
        ]);
        $key = Validator::make(['key' => $request->header('Idempotency-Key')], ['key' => ['required', 'uuid']])->validate()['key'];
        $result = $service->reverse(
            $organization,
            $request->user(),
            (int) $journal->getKey(),
            $data['accounting_date'],
            trim($data['reason']),
            $key,
        );

        return response()->json([
            'data' => $service->serializeJournal($result['journal']),
            'already_exists' => $result['already_exists'],
        ], $result['already_exists'] ? 200 : 201);
    }

    private function activeOrganization(Request $request): Organization
    {
        $organization = $request->attributes->get('activeOrganization');
        abort_unless($organization instanceof Organization, 403);
        Gate::authorize('viewAccounting', $organization);

        return $organization;
    }

    private function authorizeManage(Organization $organization): void
    {
        Gate::authorize('manageAccounting', $organization);
    }

    private function scopedBook(Organization $organization, int $bookId): AccountingBook
    {
        return AccountingBook::query()->where('organization_id', $organization->getKey())->findOrFail($bookId);
    }

    private function scopedAccountForBook(Organization $organization, int $bookId, int $accountId): AccountingAccount
    {
        $account = AccountingAccount::query()
            ->where('organization_id', $organization->getKey())
            ->where('book_id', $bookId)
            ->find($accountId);
        if ($account !== null) {
            return $account;
        }

        if (AccountingAccount::query()->where('organization_id', $organization->getKey())->find($accountId) !== null) {
            throw ValidationException::withMessages(['parent_account_id' => 'حساب بالادستی باید به همان دفتر تعلق داشته باشد.']);
        }

        abort(404);
    }

    private function scopedJournal(Organization $organization, int $journalId): AccountingJournal
    {
        return AccountingJournal::query()->where('organization_id', $organization->getKey())->findOrFail($journalId);
    }

    private function inputId(mixed $value, string $field): int
    {
        $id = filter_var($value, FILTER_VALIDATE_INT);
        if ($id === false || $id < 1) {
            throw ValidationException::withMessages([$field => 'شناسهٔ انتخاب‌شده معتبر نیست.']);
        }

        return (int) $id;
    }

    private function rejectUnsupported(Request $request, array $allowed): void
    {
        $unsupported = array_diff(array_keys($request->all()), $allowed);
        if (in_array('organization_id', $unsupported, true)) {
            throw ValidationException::withMessages([
                'organization_id' => 'سازمان از نشست فعال تعیین می‌شود و از درخواست پذیرفته نمی‌شود.',
            ]);
        }
        if ($unsupported !== []) {
            throw ValidationException::withMessages(['request' => 'درخواست شامل مشخصهٔ پشتیبانی‌نشده است.']);
        }
    }
}
