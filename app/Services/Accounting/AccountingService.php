<?php

namespace App\Services\Accounting;

use App\Models\AccountingAccount;
use App\Models\AccountingBook;
use App\Models\AccountingJournal;
use App\Models\AccountingJournalLine;
use App\Models\AccountingPeriod;
use App\Models\AccountingRequestKey;
use App\Models\Organization;
use App\Models\User;
use DateTimeZone;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

class AccountingService
{
    public function __construct(private readonly AccountingMoneyCalculator $money) {}

    public function options(Organization $organization, ?int $bookId = null): array
    {
        $books = AccountingBook::query()
            ->where('organization_id', $organization->getKey())
            ->orderBy('name')->orderBy('id')->get();

        if ($bookId === null) {
            $bookId = $books->first()?->getKey();
        }

        $book = $bookId === null ? null : $books->firstWhere('id', $bookId);
        if ($bookId !== null && $book === null) {
            abort(404);
        }

        return [
            'books' => $books->map(fn (AccountingBook $item): array => $this->serializeBook($item))->values()->all(),
            'selected_book_id' => $book?->getKey(),
            'accounts' => $book === null ? [] : AccountingAccount::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $book->getKey())
                ->with('parent:id,code,name')
                ->orderBy('code')->orderBy('id')->get()
                ->map(fn (AccountingAccount $account): array => $this->serializeAccount($account))->all(),
            'periods' => $book === null ? [] : AccountingPeriod::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $book->getKey())
                ->with('closedBy:id,name')
                ->orderByDesc('starts_on')->orderByDesc('id')->get()
                ->map(fn (AccountingPeriod $period): array => $this->serializePeriod($period))->all(),
        ];
    }

    public function journals(Organization $organization, ?int $bookId = null): array
    {
        $query = AccountingJournal::query()
            ->where('organization_id', $organization->getKey())
            ->with(['book', 'period', 'createdBy:id,name', 'postedBy:id,name', 'lines.account:id,code,name,category']);

        if ($bookId !== null) {
            $this->scopedBook($organization, $bookId);
            $query->where('book_id', $bookId);
        }

        return $query->orderByDesc('accounting_date')->orderByDesc('id')->limit(100)->get()
            ->map(fn (AccountingJournal $journal): array => $this->serializeJournal($journal))->all();
    }

    public function createBook(Organization $organization, string $code, string $name, string $timeZone): AccountingBook
    {
        if (! in_array($timeZone, DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC), true)) {
            throw ValidationException::withMessages(['time_zone' => 'منطقهٔ زمانی انتخاب‌شده معتبر نیست.']);
        }

        return DB::transaction(function () use ($organization, $code, $name, $timeZone): AccountingBook {
            $book = AccountingBook::query()->create([
                'organization_id' => $organization->getKey(),
                'code' => 'TMP-'.Str::uuid(),
                'name' => $name,
                'currency_code' => 'IRR',
                'currency_scale' => 0,
                'time_zone' => $timeZone,
            ]);
            $book->forceFill(['code' => $code])->save();

            return $book->refresh();
        }, 3);
    }

    public function createAccount(
        Organization $organization,
        int $bookId,
        string $code,
        string $name,
        string $category,
        bool $isPostable,
        ?int $parentAccountId,
    ): AccountingAccount {
        return DB::transaction(function () use ($organization, $bookId, $code, $name, $category, $isPostable, $parentAccountId): AccountingAccount {
            $this->lockBook($organization, $bookId);
            $parent = null;

            if ($parentAccountId !== null) {
                $parent = AccountingAccount::query()
                    ->where('organization_id', $organization->getKey())
                    ->where('book_id', $bookId)
                    ->lockForUpdate()
                    ->find($parentAccountId);

                if ($parent === null) {
                    $this->hideForeignAccount($organization, $parentAccountId);
                    throw ValidationException::withMessages(['parent_account_id' => 'حساب بالادستی باید در همین دفتر باشد.']);
                }

                if ($parent->is_postable) {
                    throw ValidationException::withMessages(['parent_account_id' => 'حساب ثبت‌پذیر نمی‌تواند حساب زیرمجموعه داشته باشد.']);
                }
            }

            return AccountingAccount::query()->create([
                'organization_id' => $organization->getKey(),
                'book_id' => $bookId,
                'parent_account_id' => $parent?->getKey(),
                'code' => $code,
                'name' => $name,
                'category' => $category,
                'is_postable' => $isPostable,
                'is_active' => true,
            ]);
        }, 3);
    }

    public function createPeriod(
        Organization $organization,
        int $bookId,
        string $code,
        string $name,
        string $startsOn,
        string $endsOn,
    ): AccountingPeriod {
        if ($startsOn > $endsOn) {
            throw ValidationException::withMessages(['ends_on' => 'پایان دوره باید هم‌روز یا پس از آغاز آن باشد.']);
        }

        return DB::transaction(function () use ($organization, $bookId, $code, $name, $startsOn, $endsOn): AccountingPeriod {
            $this->lockBook($organization, $bookId);
            $overlaps = AccountingPeriod::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $bookId)
                ->where('starts_on', '<=', $endsOn)
                ->where('ends_on', '>=', $startsOn)
                ->orderBy('starts_on')->orderBy('id')->lockForUpdate()->get();

            if ($overlaps->isNotEmpty()) {
                throw ValidationException::withMessages(['starts_on' => 'بازهٔ دوره با یک دورهٔ موجود هم‌پوشانی دارد.']);
            }

            return AccountingPeriod::query()->create([
                'organization_id' => $organization->getKey(),
                'book_id' => $bookId,
                'code' => $code,
                'name' => $name,
                'starts_on' => $startsOn,
                'ends_on' => $endsOn,
                'status' => 'open',
            ]);
        }, 3);
    }

    public function closePeriod(Organization $organization, User $actor, int $periodId): AccountingPeriod
    {
        $target = $this->scopedPeriod($organization, $periodId);

        return DB::transaction(function () use ($organization, $actor, $target): AccountingPeriod {
            $this->lockBook($organization, (int) $target->book_id);
            $period = AccountingPeriod::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $target->book_id)
                ->lockForUpdate()->findOrFail($target->getKey());

            if ($period->status === 'open') {
                $period->forceFill(['status' => 'closed', 'closed_by' => $actor->getKey(), 'closed_at' => now()])->save();
            }

            return $period->refresh()->load('closedBy:id,name');
        }, 3);
    }

    /** @param array<string, mixed> $input */
    public function createDraft(Organization $organization, User $actor, int $bookId, array $input): AccountingJournal
    {
        return DB::transaction(function () use ($organization, $actor, $bookId, $input): AccountingJournal {
            $this->lockBook($organization, $bookId);
            $lines = $this->normalizeLines($organization, $bookId, $input['lines'] ?? []);
            $journal = $this->createJournalHeader($organization, $actor, $bookId, $input);
            $this->saveLines($organization, $bookId, $journal, $lines);

            return $this->freshJournal($organization, (int) $journal->getKey());
        }, 3);
    }

    /** @param array<string, mixed> $input */
    public function updateDraft(Organization $organization, int $journalId, array $input): AccountingJournal
    {
        $target = $this->scopedJournal($organization, $journalId);

        return DB::transaction(function () use ($organization, $target, $input): AccountingJournal {
            $this->lockBook($organization, (int) $target->book_id);
            $journal = AccountingJournal::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $target->book_id)
                ->lockForUpdate()->findOrFail($target->getKey());

            if ($journal->status !== 'draft') {
                throw new HttpException(409, 'سند ثبت‌شده قابل ویرایش نیست.');
            }

            $lines = $this->normalizeLines($organization, (int) $journal->book_id, $input['lines'] ?? []);
            $journal->forceFill([
                'accounting_date' => $input['accounting_date'],
                'description' => $input['description'],
            ])->save();
            $journal->lines()->delete();
            $this->saveLines($organization, (int) $journal->book_id, $journal, $lines);

            return $this->freshJournal($organization, (int) $journal->getKey());
        }, 3);
    }

    /** @return array{journal: AccountingJournal, already_exists: bool} */
    public function postDraft(Organization $organization, User $actor, int $journalId, string $idempotencyKey): array
    {
        $target = $this->scopedJournal($organization, $journalId);
        $this->validateIdempotencyKey($idempotencyKey);

        return DB::transaction(function () use ($organization, $actor, $target, $idempotencyKey): array {
            $bookId = (int) $target->book_id;
            $this->lockBook($organization, $bookId);
            $journal = AccountingJournal::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $bookId)
                ->with('lines')
                ->lockForUpdate()->findOrFail($target->getKey());
            $requestHash = $this->draftHash($journal);

            $keyRecord = $this->requestKey($organization, $bookId, 'post', $idempotencyKey);
            if ($keyRecord !== null) {
                if (! hash_equals($keyRecord->request_hash, $requestHash) || (int) $keyRecord->journal_id !== (int) $journal->getKey()) {
                    throw new HttpException(409, 'کلید تکرار با این سند یا محتوای درخواست قبلاً استفاده شده است.');
                }

                return ['journal' => $this->freshJournal($organization, (int) $keyRecord->journal_id), 'already_exists' => true];
            }

            if ($journal->status !== 'draft') {
                throw new HttpException(409, 'این سند قبلاً ثبت شده است؛ برای بازیابی نتیجه همان کلید ثبت را بفرستید.');
            }

            $period = $this->matchingPeriod($organization, $bookId, $journal->accounting_date->format('Y-m-d'));
            if ($period->status !== 'open') {
                throw ValidationException::withMessages(['accounting_date' => 'ثبت سند در دورهٔ بسته مجاز نیست.']);
            }

            $lines = $journal->lines->map(fn (AccountingJournalLine $line): array => [
                'account_id' => (int) $line->account_id,
                'memo' => $line->memo,
                'debit_rial' => (string) $line->debit_rial,
                'credit_rial' => (string) $line->credit_rial,
            ])->all();
            $accounts = $this->lockedAccountsForLines($organization, $bookId, $lines);
            $totals = $this->balancedTotals($lines, $accounts);

            $journal->forceFill([
                'period_id' => $period->getKey(),
                'status' => 'posted',
                'debit_total_rial' => $totals['debit'],
                'credit_total_rial' => $totals['credit'],
                'posted_by' => $actor->getKey(),
                'posted_at' => now(),
                'posting_identity' => $idempotencyKey,
            ])->save();

            AccountingRequestKey::query()->create([
                'organization_id' => $organization->getKey(),
                'book_id' => $bookId,
                'operation' => 'post',
                'idempotency_key' => $idempotencyKey,
                'request_hash' => $requestHash,
                'journal_id' => $journal->getKey(),
                'created_by' => $actor->getKey(),
            ]);

            return ['journal' => $this->freshJournal($organization, (int) $journal->getKey()), 'already_exists' => false];
        }, 3);
    }

    /**
     * Application boundary for a future source-driven caller. P05/P06/P07/P08 must not call this
     * until their recognition, mapping, tax, and costing decisions are approved.
     *
     * @param  array<int, array{account_id: int, memo?: ?string, debit_rial: string, credit_rial: string}>  $lines
     * @param  array{organization_id: int, type: string, record_id: string, event_key: string}  $sourceReference
     * @return array{journal: AccountingJournal, already_exists: bool}
     */
    public function postBalancedLines(
        Organization $organization,
        User $actor,
        int $bookId,
        string $accountingDate,
        string $description,
        array $lines,
        array $sourceReference,
        string $idempotencyKey,
    ): array {
        return DB::transaction(function () use (
            $organization, $actor, $bookId, $accountingDate, $description, $lines, $sourceReference, $idempotencyKey,
        ): array {
            $this->lockBook($organization, $bookId);
            $this->validateIdempotencyKey($idempotencyKey);
            $this->validateSourceReference($organization, $sourceReference);
            $normalizedLines = $this->normalizeLines($organization, $bookId, $lines);
            $intendedHash = $this->manualPayloadHash($organization, $bookId, $accountingDate, $description, $normalizedLines, $sourceReference);
            $existing = AccountingJournal::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $bookId)
                ->where('source_type', $sourceReference['type'])
                ->where('source_record_id', $sourceReference['record_id'])
                ->where('source_event_key', $sourceReference['event_key'])
                ->lockForUpdate()->first();

            if ($existing !== null) {
                if ($existing->status !== 'posted' || ! hash_equals($this->sourcePayloadHash($existing), $intendedHash)) {
                    throw new HttpException(409, 'رویداد مبدأ قبلاً با محتوای متفاوت ثبت شده است.');
                }

                return ['journal' => $this->freshJournal($organization, (int) $existing->getKey()), 'already_exists' => true];
            }

            $input = [
                'accounting_date' => $accountingDate,
                'description' => $description,
                'source_reference' => $sourceReference,
                'lines' => $lines,
            ];
            $journal = $this->createJournalHeader($organization, $actor, $bookId, $input);
            $journal->forceFill([
                'source_type' => $sourceReference['type'],
                'source_record_id' => $sourceReference['record_id'],
                'source_event_key' => $sourceReference['event_key'],
            ])->save();
            $this->saveLines($organization, $bookId, $journal, $normalizedLines);

            return $this->postDraft($organization, $actor, (int) $journal->getKey(), $idempotencyKey);
        }, 3);
    }

    /** @return array{journal: AccountingJournal, already_exists: bool} */
    public function reverse(
        Organization $organization,
        User $actor,
        int $journalId,
        string $reversalDate,
        string $reason,
        string $idempotencyKey,
    ): array {
        $target = $this->scopedJournal($organization, $journalId);
        $this->validateIdempotencyKey($idempotencyKey);

        return DB::transaction(function () use (
            $organization, $actor, $target, $reversalDate, $reason, $idempotencyKey,
        ): array {
            $bookId = (int) $target->book_id;
            $this->lockBook($organization, $bookId);
            $original = AccountingJournal::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $bookId)
                ->with(['lines' => fn ($query) => $query->orderBy('line_number')])
                ->lockForUpdate()->findOrFail($target->getKey());

            if ($original->status !== 'posted' || $original->reversal_of_journal_id !== null) {
                throw new HttpException(409, 'فقط سند ثبت‌شدهٔ اصلی و بدون برگشت قابل برگشت‌زدن است.');
            }

            $originalHash = $this->draftHash($original);
            $requestHash = $this->hash([
                'operation' => 'reverse',
                'organization_id' => (int) $organization->getKey(),
                'book_id' => $bookId,
                'original_journal_id' => (int) $original->getKey(),
                'original_hash' => $originalHash,
                'accounting_date' => $reversalDate,
                'reason' => $reason,
            ]);
            $keyRecord = $this->requestKey($organization, $bookId, 'reverse', $idempotencyKey);

            if ($keyRecord !== null) {
                if (! hash_equals($keyRecord->request_hash, $requestHash)
                    || (int) $keyRecord->journal->reversal_of_journal_id !== (int) $original->getKey()) {
                    throw new HttpException(409, 'کلید برگشت با این سند یا محتوای درخواست قبلاً استفاده شده است.');
                }

                return ['journal' => $this->freshJournal($organization, (int) $keyRecord->journal_id), 'already_exists' => true];
            }

            $existingReversal = AccountingJournal::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $bookId)
                ->where('reversal_of_journal_id', $original->getKey())
                ->lockForUpdate()->first();

            if ($existingReversal !== null) {
                if (! is_string($existingReversal->reversal_request_hash)
                    || ! hash_equals($existingReversal->reversal_request_hash, $requestHash)) {
                    throw new HttpException(409, 'این سند با تاریخ یا دلیل دیگری برگشت خورده است.');
                }

                $this->recordRequestKey($organization, $actor, $bookId, 'reverse', $idempotencyKey, $requestHash, $existingReversal);

                return ['journal' => $this->freshJournal($organization, (int) $existingReversal->getKey()), 'already_exists' => true];
            }

            $period = $this->matchingPeriod($organization, $bookId, $reversalDate);
            if ($period->status !== 'open') {
                throw ValidationException::withMessages(['accounting_date' => 'برگشت باید در یک دورهٔ باز ثبت شود.']);
            }

            $originalLines = $original->lines->map(fn (AccountingJournalLine $line): array => [
                'account_id' => (int) $line->account_id,
                'memo' => $line->memo,
                'debit_rial' => (string) $line->credit_rial,
                'credit_rial' => (string) $line->debit_rial,
            ])->all();
            $accounts = $this->lockedAccountsForLines($organization, $bookId, $originalLines);
            $totals = $this->balancedTotals($originalLines, $accounts);
            $description = 'برگشت سند '.$original->code.' — '.$reason;
            $input = [
                'accounting_date' => $reversalDate,
                'description' => $description,
                'source_reference' => [
                    'type' => 'accounting_reversal',
                    'record_id' => (string) $original->getKey(),
                    'event_key' => 'reverse',
                ],
            ];
            $reversal = $this->createJournalHeader($organization, $actor, $bookId, $input);
            $reversal->forceFill([
                'period_id' => $period->getKey(),
                'reversal_of_journal_id' => $original->getKey(),
                'reversal_request_hash' => $requestHash,
                'status' => 'posted',
                'debit_total_rial' => $totals['debit'],
                'credit_total_rial' => $totals['credit'],
                'posted_by' => $actor->getKey(),
                'posted_at' => now(),
                'posting_identity' => $idempotencyKey,
            ])->save();
            $this->saveLines($organization, $bookId, $reversal, $originalLines);
            $this->recordRequestKey($organization, $actor, $bookId, 'reverse', $idempotencyKey, $requestHash, $reversal);

            return ['journal' => $this->freshJournal($organization, (int) $reversal->getKey()), 'already_exists' => false];
        }, 3);
    }

    public function serializeBook(AccountingBook $book): array
    {
        return [
            'id' => (int) $book->getKey(),
            'code' => $book->code,
            'name' => $book->name,
            'currency' => ['code' => $book->currency_code, 'scale' => (int) $book->currency_scale],
            'time_zone' => $book->time_zone,
        ];
    }

    public function serializeAccount(AccountingAccount $account): array
    {
        $account->loadMissing('parent:id,code,name');

        return [
            'id' => (int) $account->getKey(),
            'book_id' => (int) $account->book_id,
            'parent' => $account->parent === null ? null : [
                'id' => (int) $account->parent->getKey(), 'code' => $account->parent->code, 'name' => $account->parent->name,
            ],
            'code' => $account->code,
            'name' => $account->name,
            'category' => $account->category,
            'is_postable' => (bool) $account->is_postable,
            'is_active' => (bool) $account->is_active,
        ];
    }

    public function serializePeriod(AccountingPeriod $period): array
    {
        $period->loadMissing('closedBy:id,name');

        return [
            'id' => (int) $period->getKey(),
            'book_id' => (int) $period->book_id,
            'code' => $period->code,
            'name' => $period->name,
            'starts_on' => $period->starts_on->format('Y-m-d'),
            'ends_on' => $period->ends_on->format('Y-m-d'),
            'status' => $period->status,
            'closed_by' => $period->closedBy?->name,
            'closed_at' => $period->closed_at?->toIso8601String(),
        ];
    }

    public function serializeJournal(AccountingJournal $journal): array
    {
        $journal->loadMissing([
            'book', 'period', 'createdBy:id,name', 'postedBy:id,name', 'lines.account:id,code,name,category',
            'reversalOf:id,code', 'reversal:id,code,accounting_date,reversal_of_journal_id',
        ]);
        $debit = $journal->debit_total_rial ?? $this->money->sum($journal->lines->pluck('debit_rial')->map(fn ($value): string => (string) $value));
        $credit = $journal->credit_total_rial ?? $this->money->sum($journal->lines->pluck('credit_rial')->map(fn ($value): string => (string) $value));
        $reversal = $journal->reversal->first();

        return [
            'id' => (int) $journal->getKey(),
            'code' => $journal->code,
            'status' => $journal->status,
            'accounting_date' => $journal->accounting_date->format('Y-m-d'),
            'description' => $journal->description,
            'book' => $this->serializeBook($journal->book),
            'period' => $journal->period === null ? null : $this->serializePeriod($journal->period),
            'lines' => $journal->lines->map(fn (AccountingJournalLine $line): array => [
                'id' => (int) $line->getKey(),
                'line_number' => (int) $line->line_number,
                'account' => [
                    'id' => (int) $line->account->getKey(),
                    'code' => $line->account->code,
                    'name' => $line->account->name,
                    'category' => $line->account->category,
                ],
                'memo' => $line->memo,
                'debit_rial' => (string) $line->debit_rial,
                'credit_rial' => (string) $line->credit_rial,
            ])->all(),
            'debit_total_rial' => (string) $debit,
            'credit_total_rial' => (string) $credit,
            'created_by' => $journal->createdBy?->name,
            'posted_by' => $journal->postedBy?->name,
            'posted_at' => $journal->posted_at?->toIso8601String(),
            'posting_identity' => $journal->posting_identity,
            'source_reference' => $journal->source_type === null ? null : [
                'type' => $journal->source_type,
                'record_id' => $journal->source_record_id,
                'event_key' => $journal->source_event_key,
            ],
            'reversal_of' => $journal->reversalOf === null ? null : [
                'id' => (int) $journal->reversalOf->getKey(), 'code' => $journal->reversalOf->code,
            ],
            'reversal' => $reversal === null ? null : [
                'id' => (int) $reversal->getKey(), 'code' => $reversal->code,
                'accounting_date' => $reversal->accounting_date->format('Y-m-d'),
            ],
        ];
    }

    private function createJournalHeader(Organization $organization, User $actor, int $bookId, array $input): AccountingJournal
    {
        $journal = AccountingJournal::query()->create([
            'organization_id' => $organization->getKey(),
            'book_id' => $bookId,
            'code' => 'TMP-'.Str::uuid(),
            'accounting_date' => $input['accounting_date'],
            'description' => $input['description'],
            'status' => 'draft',
            'source_type' => $input['source_reference']['type'] ?? null,
            'source_record_id' => $input['source_reference']['record_id'] ?? null,
            'source_event_key' => $input['source_reference']['event_key'] ?? null,
            'created_by' => $actor->getKey(),
        ]);
        $journal->forceFill(['code' => 'JRN-'.str_pad((string) $journal->getKey(), 8, '0', STR_PAD_LEFT)])->save();

        return $journal;
    }

    /** @return array<int, array{account_id: int, memo: ?string, debit_rial: string, credit_rial: string}> */
    private function normalizeLines(Organization $organization, int $bookId, mixed $inputLines): array
    {
        if (! is_array($inputLines) || count($inputLines) < 1 || count($inputLines) > 200) {
            throw ValidationException::withMessages(['lines' => 'سند باید دست‌کم یک و حداکثر ۲۰۰ سطر داشته باشد.']);
        }

        $ids = [];
        foreach ($inputLines as $index => $line) {
            if (! is_array($line)) {
                throw ValidationException::withMessages(["lines.{$index}" => 'ساختار سطر معتبر نیست.']);
            }
            $accountId = filter_var($line['account_id'] ?? null, FILTER_VALIDATE_INT);
            if ($accountId === false || $accountId < 1) {
                throw ValidationException::withMessages(["lines.{$index}.account_id" => 'حساب را انتخاب کنید.']);
            }
            $ids[] = (int) $accountId;
        }

        $ids = array_values(array_unique($ids));
        sort($ids, SORT_NUMERIC);
        $organizationAccounts = AccountingAccount::query()
            ->where('organization_id', $organization->getKey())
            ->whereIn('id', $ids)
            ->get(['id', 'book_id']);
        if ($organizationAccounts->count() !== count($ids)) {
            abort(404);
        }

        $wrongBookIds = $organizationAccounts->filter(fn (AccountingAccount $account): bool => (int) $account->book_id !== $bookId)->pluck('id')->all();
        if ($wrongBookIds !== []) {
            throw ValidationException::withMessages(['lines' => 'همهٔ حساب‌ها باید به همان دفتر سند تعلق داشته باشند.']);
        }

        $accounts = AccountingAccount::query()
            ->where('organization_id', $organization->getKey())
            ->where('book_id', $bookId)
            ->whereIn('id', $ids)
            ->orderBy('id')->lockForUpdate()->get()->keyBy('id');

        $lines = [];
        foreach (array_values($inputLines) as $index => $line) {
            $account = $accounts->get((int) $line['account_id']);
            if ($account === null) {
                abort(404);
            }
            if (! $account->is_active || ! $account->is_postable || $account->children()->exists()) {
                throw ValidationException::withMessages(["lines.{$index}.account_id" => 'این حساب فعال و ثبت‌پذیر نیست.']);
            }

            $memo = $line['memo'] ?? null;
            if ($memo !== null && (! is_string($memo) || mb_strlen($memo) > 255)) {
                throw ValidationException::withMessages(["lines.{$index}.memo" => 'شرح سطر باید حداکثر ۲۵۵ نویسه باشد.']);
            }
            $debit = $this->money->normalizeRial($line['debit_rial'] ?? null, "lines.{$index}.debit_rial");
            $credit = $this->money->normalizeRial($line['credit_rial'] ?? null, "lines.{$index}.credit_rial");
            if (($debit === '0') === ($credit === '0')) {
                throw ValidationException::withMessages(["lines.{$index}" => 'هر سطر باید فقط یک بدهکار یا یک بستانکار مثبت داشته باشد.']);
            }

            $lines[] = [
                'account_id' => (int) $account->getKey(),
                'memo' => $memo === null ? null : trim($memo),
                'debit_rial' => $debit,
                'credit_rial' => $credit,
            ];
        }

        return $lines;
    }

    /** @param array<int, array{account_id: int, memo: ?string, debit_rial: string, credit_rial: string}> $lines */
    private function saveLines(Organization $organization, int $bookId, AccountingJournal $journal, array $lines): void
    {
        foreach ($lines as $index => $line) {
            AccountingJournalLine::query()->create([
                'organization_id' => $organization->getKey(),
                'book_id' => $bookId,
                'journal_id' => $journal->getKey(),
                'account_id' => $line['account_id'],
                'line_number' => $index + 1,
                'memo' => $line['memo'],
                'debit_rial' => $line['debit_rial'],
                'credit_rial' => $line['credit_rial'],
            ]);
        }
    }

    /** @param array<int, array{account_id: int, memo: ?string, debit_rial: string, credit_rial: string}> $lines
     * @return array{debit: string, credit: string}
     */
    private function balancedTotals(array $lines, Collection $accounts): array
    {
        $debit = $this->money->sum(array_column($lines, 'debit_rial'));
        $credit = $this->money->sum(array_column($lines, 'credit_rial'));
        $hasDebit = false;
        $hasCredit = false;

        foreach ($lines as $index => $line) {
            $account = $accounts->get($line['account_id']);
            if ($account === null) {
                abort(404);
            }
            if (! $account->is_active || ! $account->is_postable || $account->children()->exists()) {
                throw ValidationException::withMessages(["lines.{$index}.account_id" => 'این حساب فعال و ثبت‌پذیر نیست.']);
            }
            $hasDebit = $hasDebit || $line['debit_rial'] !== '0';
            $hasCredit = $hasCredit || $line['credit_rial'] !== '0';
        }

        if (! $hasDebit || ! $hasCredit || $debit === '0' || $credit === '0') {
            throw ValidationException::withMessages(['lines' => 'ثبت سند به دست‌کم یک مبلغ بدهکار و یک مبلغ بستانکار نیاز دارد.']);
        }
        if ($debit !== $credit) {
            throw ValidationException::withMessages(['lines' => 'جمع بدهکار و بستانکار باید دقیقاً برابر باشد.']);
        }

        return ['debit' => $debit, 'credit' => $credit];
    }

    /** @param array<int, array{account_id: int}> $lines */
    private function lockedAccountsForLines(Organization $organization, int $bookId, array $lines): Collection
    {
        $ids = array_values(array_unique(array_map(fn (array $line): int => (int) $line['account_id'], $lines)));
        sort($ids, SORT_NUMERIC);
        $accounts = AccountingAccount::query()
            ->where('organization_id', $organization->getKey())
            ->where('book_id', $bookId)
            ->whereIn('id', $ids)
            ->orderBy('id')->lockForUpdate()->get()->keyBy('id');

        if ($accounts->count() !== count($ids)) {
            abort(404);
        }

        return $accounts;
    }

    private function matchingPeriod(Organization $organization, int $bookId, string $date): AccountingPeriod
    {
        $matches = AccountingPeriod::query()
            ->where('organization_id', $organization->getKey())
            ->where('book_id', $bookId)
            ->where('starts_on', '<=', $date)
            ->where('ends_on', '>=', $date)
            ->orderBy('starts_on')->orderBy('id')->lockForUpdate()->get();

        if ($matches->count() > 1) {
            throw new HttpException(409, 'تاریخ سند در بیش از یک دوره قرار می‌گیرد؛ دوره‌های هم‌پوشان را اصلاح کنید.');
        }
        if ($matches->isEmpty()) {
            throw ValidationException::withMessages(['accounting_date' => 'برای تاریخ سند دورهٔ مالی تعریف نشده است.']);
        }

        return $matches->first();
    }

    private function requestKey(Organization $organization, int $bookId, string $operation, string $key): ?AccountingRequestKey
    {
        return AccountingRequestKey::query()
            ->where('organization_id', $organization->getKey())
            ->where('book_id', $bookId)
            ->where('operation', $operation)
            ->where('idempotency_key', $key)
            ->with('journal:id,organization_id,book_id,reversal_of_journal_id')
            ->lockForUpdate()->first();
    }

    private function recordRequestKey(
        Organization $organization,
        User $actor,
        int $bookId,
        string $operation,
        string $key,
        string $hash,
        AccountingJournal $journal,
    ): void {
        AccountingRequestKey::query()->create([
            'organization_id' => $organization->getKey(),
            'book_id' => $bookId,
            'operation' => $operation,
            'idempotency_key' => $key,
            'request_hash' => $hash,
            'journal_id' => $journal->getKey(),
            'created_by' => $actor->getKey(),
        ]);
    }

    private function scopedBook(Organization $organization, int $bookId): AccountingBook
    {
        return AccountingBook::query()->where('organization_id', $organization->getKey())->findOrFail($bookId);
    }

    private function lockBook(Organization $organization, int $bookId): AccountingBook
    {
        return AccountingBook::query()
            ->where('organization_id', $organization->getKey())
            ->lockForUpdate()->findOrFail($bookId);
    }

    private function scopedPeriod(Organization $organization, int $periodId): AccountingPeriod
    {
        return AccountingPeriod::query()->where('organization_id', $organization->getKey())->findOrFail($periodId);
    }

    private function scopedJournal(Organization $organization, int $journalId): AccountingJournal
    {
        return AccountingJournal::query()->where('organization_id', $organization->getKey())->findOrFail($journalId);
    }

    private function hideForeignAccount(Organization $organization, int $accountId): void
    {
        if (AccountingAccount::query()->where('id', $accountId)->where('organization_id', '!=', $organization->getKey())->exists()) {
            abort(404);
        }
    }

    private function freshJournal(Organization $organization, int $journalId): AccountingJournal
    {
        return AccountingJournal::query()
            ->where('organization_id', $organization->getKey())
            ->with([
                'book', 'period.closedBy:id,name', 'createdBy:id,name', 'postedBy:id,name',
                'lines.account:id,code,name,category', 'reversalOf:id,code', 'reversal:id,code,accounting_date,reversal_of_journal_id',
            ])
            ->findOrFail($journalId);
    }

    private function draftHash(AccountingJournal $journal): string
    {
        $journal->loadMissing(['lines' => fn ($query) => $query->orderBy('line_number')]);

        return $this->hash([
            'organization_id' => (int) $journal->organization_id,
            'book_id' => (int) $journal->book_id,
            'journal_id' => (int) $journal->getKey(),
            'accounting_date' => $journal->accounting_date->format('Y-m-d'),
            'description' => $journal->description,
            'source_type' => $journal->source_type,
            'source_record_id' => $journal->source_record_id,
            'source_event_key' => $journal->source_event_key,
            'lines' => $journal->lines->map(fn (AccountingJournalLine $line): array => [
                'line_number' => (int) $line->line_number,
                'account_id' => (int) $line->account_id,
                'memo' => $line->memo,
                'debit_rial' => (string) $line->debit_rial,
                'credit_rial' => (string) $line->credit_rial,
            ])->values()->all(),
        ]);
    }

    /** @param array<int, array{account_id: int, memo: ?string, debit_rial: string, credit_rial: string}> $lines */
    private function manualPayloadHash(
        Organization $organization,
        int $bookId,
        string $date,
        string $description,
        array $lines,
        array $sourceReference,
    ): string {
        return $this->hash([
            'organization_id' => (int) $organization->getKey(),
            'book_id' => $bookId,
            'accounting_date' => $date,
            'description' => $description,
            'source_type' => $sourceReference['type'],
            'source_record_id' => $sourceReference['record_id'],
            'source_event_key' => $sourceReference['event_key'],
            'lines' => array_map(fn (array $line, int $index): array => [
                'line_number' => $index + 1,
                'account_id' => $line['account_id'],
                'memo' => $line['memo'],
                'debit_rial' => $line['debit_rial'],
                'credit_rial' => $line['credit_rial'],
            ], $lines, array_keys($lines)),
        ]);
    }

    private function sourcePayloadHash(AccountingJournal $journal): string
    {
        $journal->loadMissing(['lines' => fn ($query) => $query->orderBy('line_number')]);
        $lines = $journal->lines->map(fn (AccountingJournalLine $line): array => [
            'account_id' => (int) $line->account_id,
            'memo' => $line->memo,
            'debit_rial' => (string) $line->debit_rial,
            'credit_rial' => (string) $line->credit_rial,
        ])->values()->all();

        return $this->manualPayloadHash(
            Organization::query()->findOrFail($journal->organization_id),
            (int) $journal->book_id,
            $journal->accounting_date->format('Y-m-d'),
            $journal->description,
            $lines,
            [
                'organization_id' => (int) $journal->organization_id,
                'type' => $journal->source_type,
                'record_id' => $journal->source_record_id,
                'event_key' => $journal->source_event_key,
            ],
        );
    }

    private function validateIdempotencyKey(string $key): void
    {
        if (! preg_match('/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iD', $key)) {
            throw ValidationException::withMessages(['idempotency_key' => 'کلید تکرار باید UUID معتبر باشد.']);
        }
    }

    private function validateSourceReference(Organization $organization, array $sourceReference): void
    {
        $sourceOrganizationId = filter_var($sourceReference['organization_id'] ?? null, FILTER_VALIDATE_INT);
        if ($sourceOrganizationId === false || (int) $sourceOrganizationId !== (int) $organization->getKey()) {
            throw ValidationException::withMessages(['source_reference' => 'رویداد مبدأ باید به سازمان فعال تعلق داشته باشد.']);
        }

        foreach (['type', 'record_id', 'event_key'] as $key) {
            if (! isset($sourceReference[$key]) || ! is_string($sourceReference[$key]) || trim($sourceReference[$key]) === '') {
                throw ValidationException::withMessages(["source_reference.{$key}" => 'ارجاع رویداد مبدأ کامل نیست.']);
            }
        }
        if (mb_strlen($sourceReference['type']) > 80 || mb_strlen($sourceReference['record_id']) > 120 || mb_strlen($sourceReference['event_key']) > 120) {
            throw ValidationException::withMessages(['source_reference' => 'ارجاع رویداد مبدأ از طول پشتیبانی‌شده بیشتر است.']);
        }
    }

    private function hash(array $payload): string
    {
        return hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
}
