<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\AccountingAccount;
use App\Models\AccountingBook;
use App\Models\AccountingJournal;
use App\Models\AccountingJournalLine;
use App\Models\AccountingPeriod;
use App\Models\AccountingRequestKey;
use App\Models\Organization;
use App\Models\User;
use App\Services\Accounting\AccountingMoneyCalculator;
use App\Services\Accounting\AccountingService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class P09AccountingTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private Organization $foreignOrganization;

    private User $editor;

    private User $reader;

    private AccountingBook $book;

    private AccountingAccount $receivable;

    private AccountingAccount $revenue;

    private AccountingAccount $heading;

    private AccountingPeriod $period;

    protected function setUp(): void
    {
        parent::setUp();

        $this->organization = Organization::query()->create(['name' => 'سازمان حسابداری الف', 'slug' => 'p09-accounting-a']);
        $this->foreignOrganization = Organization::query()->create(['name' => 'سازمان حسابداری ب', 'slug' => 'p09-accounting-b']);
        $this->editor = User::factory()->create();
        $this->reader = User::factory()->create();
        $this->editor->organizations()->attach($this->organization, ['role' => OrganizationRole::Editor->value]);
        $this->reader->organizations()->attach($this->organization, ['role' => OrganizationRole::Reader->value]);
        $this->editor->organizations()->attach($this->foreignOrganization, ['role' => OrganizationRole::Reader->value]);
        $this->book = $this->makeBook($this->organization, 'P09-IRR');
        $this->receivable = $this->makeAccount($this->organization, $this->book, '1100', 'دریافتنی fixture', 'asset');
        $this->revenue = $this->makeAccount($this->organization, $this->book, '4100', 'درآمد fixture', 'revenue');
        $this->heading = $this->makeAccount($this->organization, $this->book, '1000', 'سرگروه fixture', 'asset', false);
        $this->period = $this->makePeriod($this->organization, $this->book, 'P09-2026', 'دورهٔ آزمایشی', '2026-01-01', '2026-12-31');

        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->organization->getKey()]);
    }

    public function test_editor_setup_uses_scoped_books_and_rejects_overlapping_periods(): void
    {
        $this->postJson('/api/v1/accounting/books/'.$this->book->getKey().'/periods', [
            'code' => 'P09-OVERLAP', 'name' => 'هم‌پوشان', 'starts_on' => '2026-12-31', 'ends_on' => '2027-01-31',
        ], $this->csrfHeaders())->assertUnprocessable()->assertJsonValidationErrors('starts_on');

        $created = $this->postJson('/api/v1/accounting/books', [
            'code' => 'P09-SECOND', 'name' => 'دفتر دوم', 'time_zone' => 'Asia/Tehran',
        ], $this->csrfHeaders())->assertCreated()->json('data');
        self::assertSame('IRR', $created['currency']['code']);
        self::assertSame('Asia/Tehran', $created['time_zone']);

        $this->postJson('/api/v1/accounting/books/'.$created['id'].'/periods', [
            'code' => 'P09-2027', 'name' => 'دورهٔ مرزی', 'starts_on' => '2027-01-01', 'ends_on' => '2027-12-31',
        ], $this->csrfHeaders())->assertCreated();
        $this->postJson('/api/v1/accounting/books/999999/accounts', [
            'code' => 'FOREIGN', 'name' => 'نباید ساخته شود', 'category' => 'asset', 'is_postable' => true,
        ], $this->csrfHeaders())->assertNotFound();
    }

    public function test_balanced_posting_is_exact_retryable_after_close_and_immutable(): void
    {
        $journal = $this->createDraft();
        $key = (string) Str::uuid();
        $path = '/api/v1/accounting/journals/'.$journal['id'].'/post';

        $posted = $this->postJson($path, [], $this->csrfHeaders() + ['Idempotency-Key' => $key])
            ->assertCreated()->assertJsonPath('data.status', 'posted')->assertJsonPath('data.debit_total_rial', '1000000')->json('data');
        self::assertSame('1000000', $posted['credit_total_rial']);
        self::assertSame($this->editor->name, $posted['posted_by']);
        self::assertNotNull($posted['posted_at']);

        $this->postJson('/api/v1/accounting/periods/'.$this->period->getKey().'/close', [], $this->csrfHeaders())
            ->assertOk()->assertJsonPath('data.status', 'closed');
        $retry = $this->postJson($path, [], $this->csrfHeaders() + ['Idempotency-Key' => $key])
            ->assertOk()->assertJsonPath('already_exists', true)->json('data');
        self::assertSame($posted['id'], $retry['id']);
        self::assertSame(1, AccountingJournal::query()->where('status', 'posted')->count());
        self::assertSame(2, AccountingJournalLine::query()->where('journal_id', $posted['id'])->count());

        $this->putJson('/api/v1/accounting/journals/'.$posted['id'], [
            'accounting_date' => '2026-11-22', 'description' => 'تغییر مستقیم', 'lines' => [],
        ], $this->csrfHeaders())->assertStatus(409);
        self::assertSame('Synthetic sale on account', AccountingJournal::query()->findOrFail($posted['id'])->description);

        $secondJournal = $this->createDraft();
        $this->postJson('/api/v1/accounting/journals/'.$secondJournal['id'].'/post', [], $this->csrfHeaders() + ['Idempotency-Key' => $key])
            ->assertStatus(409);
    }

    public function test_unbalanced_invalid_nonpostable_and_closed_period_requests_leave_drafts_unchanged(): void
    {
        $unbalanced = $this->createDraft([
            ['account_id' => $this->receivable->getKey(), 'memo' => '', 'debit_rial' => '1000000', 'credit_rial' => '0'],
            ['account_id' => $this->revenue->getKey(), 'memo' => '', 'debit_rial' => '0', 'credit_rial' => '999999'],
        ]);
        $this->postJson('/api/v1/accounting/journals/'.$unbalanced['id'].'/post', [], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])
            ->assertUnprocessable()->assertJsonValidationErrors('lines');
        $fresh = AccountingJournal::query()->with('lines')->findOrFail($unbalanced['id']);
        self::assertSame('draft', $fresh->status);
        self::assertCount(2, $fresh->lines);
        self::assertSame(0, AccountingRequestKey::query()->count());

        $this->postJson('/api/v1/accounting/journals', [
            'book_id' => $this->book->getKey(), 'accounting_date' => '2026-11-22', 'description' => 'صفر',
            'lines' => [['account_id' => $this->receivable->getKey(), 'debit_rial' => '0', 'credit_rial' => '0']],
        ], $this->csrfHeaders())->assertUnprocessable()->assertJsonValidationErrors('lines.0');

        $this->postJson('/api/v1/accounting/journals', [
            'book_id' => $this->book->getKey(), 'accounting_date' => '2026-11-22', 'description' => 'سرگروه',
            'lines' => [['account_id' => $this->heading->getKey(), 'debit_rial' => '1', 'credit_rial' => '0']],
        ], $this->csrfHeaders())->assertUnprocessable()->assertJsonValidationErrors('lines.0.account_id');

        $closed = $this->createDraft();
        $this->period->forceFill(['status' => 'closed'])->save();
        $this->postJson('/api/v1/accounting/journals/'.$closed['id'].'/post', [], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])
            ->assertUnprocessable()->assertJsonValidationErrors('accounting_date');
        self::assertSame('draft', AccountingJournal::query()->findOrFail($closed['id'])->status);
        self::assertSame(2, AccountingJournal::query()->count());
    }

    public function test_period_date_boundaries_are_inclusive(): void
    {
        foreach (['2026-01-01', '2026-12-31'] as $date) {
            $journal = $this->createDraft($this->saleLines(), $date);
            $this->postJson('/api/v1/accounting/journals/'.$journal['id'].'/post', [], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])
                ->assertCreated()->assertJsonPath('data.accounting_date', $date);
        }
    }

    public function test_all_synthetic_source_examples_post_as_exact_balanced_rial_journals(): void
    {
        $inventory = $this->makeAccount($this->organization, $this->book, '1300', 'خرید/موجودی fixture', 'asset');
        $payable = $this->makeAccount($this->organization, $this->book, '2100', 'پرداختنی fixture', 'liability');
        $cash = $this->makeAccount($this->organization, $this->book, '1010', 'وجه نقد/بانک fixture', 'asset');
        $examples = [
            ['Synthetic sale on account', $this->saleLines(), '1000000'],
            ['Synthetic purchase on account', [
                ['account_id' => $inventory->getKey(), 'debit_rial' => '500000', 'credit_rial' => '0'],
                ['account_id' => $payable->getKey(), 'debit_rial' => '0', 'credit_rial' => '500000'],
            ], '500000'],
            ['Synthetic customer collection', [
                ['account_id' => $cash->getKey(), 'debit_rial' => '400000', 'credit_rial' => '0'],
                ['account_id' => $this->receivable->getKey(), 'debit_rial' => '0', 'credit_rial' => '400000'],
            ], '400000'],
            ['Synthetic supplier payment', [
                ['account_id' => $payable->getKey(), 'debit_rial' => '200000', 'credit_rial' => '0'],
                ['account_id' => $cash->getKey(), 'debit_rial' => '0', 'credit_rial' => '200000'],
            ], '200000'],
        ];

        foreach ($examples as [$description, $lines, $amount]) {
            $draft = $this->createDraft($lines, '2026-11-22', $description);
            $this->postJson('/api/v1/accounting/journals/'.$draft['id'].'/post', [], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])
                ->assertCreated()->assertJsonPath('data.debit_total_rial', $amount)->assertJsonPath('data.credit_total_rial', $amount);
        }

        self::assertSame(4, AccountingJournal::query()->where('status', 'posted')->count());
        self::assertSame('1788310', app(AccountingMoneyCalculator::class)->tomanToRial('178831'));
        self::assertSame('500000', (string) app(AccountingMoneyCalculator::class)->normalizeRial('500000'));
    }

    public function test_internal_source_posting_is_scoped_stable_and_payload_bound(): void
    {
        $service = app(AccountingService::class);
        $source = ['organization_id' => (int) $this->organization->getKey(), 'type' => 'synthetic_sale', 'record_id' => 'fixture-1', 'event_key' => 'recognized'];
        $first = $service->postBalancedLines(
            $this->organization, $this->editor, (int) $this->book->getKey(), '2026-11-22', 'Source fixture',
            $this->saleLines(), $source, (string) Str::uuid(),
        );
        self::assertFalse($first['already_exists']);

        $retry = $service->postBalancedLines(
            $this->organization, $this->editor, (int) $this->book->getKey(), '2026-11-22', 'Source fixture',
            $this->saleLines(), $source, (string) Str::uuid(),
        );
        self::assertTrue($retry['already_exists']);
        self::assertSame($first['journal']->getKey(), $retry['journal']->getKey());

        try {
            $service->postBalancedLines(
                $this->organization, $this->editor, (int) $this->book->getKey(), '2026-11-22', 'Source fixture',
                [
                    ['account_id' => $this->receivable->getKey(), 'debit_rial' => '1000001', 'credit_rial' => '0'],
                    ['account_id' => $this->revenue->getKey(), 'debit_rial' => '0', 'credit_rial' => '1000001'],
                ],
                $source,
                (string) Str::uuid(),
            );
            self::fail('Expected the changed source payload to conflict.');
        } catch (HttpException $exception) {
            self::assertSame(409, $exception->getStatusCode());
        }

        $foreignSource = [...$source, 'organization_id' => (int) $this->foreignOrganization->getKey()];
        try {
            $service->postBalancedLines(
                $this->organization, $this->editor, (int) $this->book->getKey(), '2026-11-22', 'Foreign source',
                $this->saleLines(), $foreignSource, (string) Str::uuid(),
            );
            self::fail('Expected a foreign source organization to be rejected.');
        } catch (ValidationException) {
            self::assertTrue(true);
        }
        self::assertSame(1, AccountingJournal::query()->where('status', 'posted')->count());
    }

    public function test_database_rejects_a_line_with_two_zero_sides(): void
    {
        $draft = $this->createDraft();
        try {
            AccountingJournalLine::query()->create([
                'organization_id' => $this->organization->getKey(),
                'book_id' => $this->book->getKey(),
                'journal_id' => $draft['id'],
                'account_id' => $this->receivable->getKey(),
                'line_number' => 3,
                'memo' => 'Invalid direct row',
                'debit_rial' => '0',
                'credit_rial' => '0',
            ]);
            self::fail('Expected the one-sided line constraint to reject a zero line.');
        } catch (QueryException) {
            self::assertSame(2, AccountingJournalLine::query()->where('journal_id', $draft['id'])->count());
        }
    }

    public function test_large_balanced_amounts_return_as_exact_decimal_strings(): void
    {
        $maximum = (string) PHP_INT_MAX;
        $draft = $this->createDraft([
            ['account_id' => $this->receivable->getKey(), 'debit_rial' => $maximum, 'credit_rial' => '0'],
            ['account_id' => $this->revenue->getKey(), 'debit_rial' => '0', 'credit_rial' => $maximum],
        ]);

        $posted = $this->postJson('/api/v1/accounting/journals/'.$draft['id'].'/post', [], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])
            ->assertCreated()->json('data');
        self::assertSame($maximum, $posted['debit_total_rial']);
        self::assertSame($maximum, $posted['credit_total_rial']);
        self::assertIsString($posted['lines'][0]['debit_rial']);
    }

    public function test_reversal_swaps_lines_and_retries_once_in_an_open_period(): void
    {
        $original = $this->createDraft();
        $postKey = (string) Str::uuid();
        $this->postJson('/api/v1/accounting/journals/'.$original['id'].'/post', [], $this->csrfHeaders() + ['Idempotency-Key' => $postKey])
            ->assertCreated();
        $this->postJson('/api/v1/accounting/periods/'.$this->period->getKey().'/close', [], $this->csrfHeaders())->assertOk();
        $nextPeriod = $this->makePeriod($this->organization, $this->book, 'P09-2027', 'دورهٔ برگشت', '2027-01-01', '2027-12-31');

        $reversePath = '/api/v1/accounting/journals/'.$original['id'].'/reverse';
        $reverseInput = ['accounting_date' => '2027-01-01', 'reason' => 'اصلاح synthetic'];
        $reverseKey = (string) Str::uuid();
        $reversal = $this->postJson($reversePath, $reverseInput, $this->csrfHeaders() + ['Idempotency-Key' => $reverseKey])
            ->assertCreated()->assertJsonPath('data.reversal_of.id', $original['id'])->json('data');
        self::assertSame((string) $this->receivable->getKey(), (string) $reversal['lines'][0]['account']['id']);
        self::assertSame('1000000', $reversal['lines'][0]['credit_rial']);
        self::assertSame((string) $this->revenue->getKey(), (string) $reversal['lines'][1]['account']['id']);
        self::assertSame('1000000', $reversal['lines'][1]['debit_rial']);
        $this->getJson('/api/v1/accounting/journals/'.$original['id'])->assertOk()->assertJsonPath('data.reversal.id', $reversal['id']);

        $this->postJson('/api/v1/accounting/periods/'.$nextPeriod->getKey().'/close', [], $this->csrfHeaders())->assertOk();
        $replayed = $this->postJson($reversePath, $reverseInput, $this->csrfHeaders() + ['Idempotency-Key' => $reverseKey])
            ->assertOk()->assertJsonPath('already_exists', true)->json('data');
        self::assertSame($reversal['id'], $replayed['id']);
        $aliasReplay = $this->postJson($reversePath, $reverseInput, $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])
            ->assertOk()->assertJsonPath('already_exists', true)->json('data');
        self::assertSame($reversal['id'], $aliasReplay['id']);
        $this->postJson($reversePath, ['accounting_date' => '2027-01-02', 'reason' => 'تاریخ دیگر'], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])
            ->assertStatus(409);

        foreach ([$this->receivable, $this->revenue] as $account) {
            $lines = AccountingJournalLine::query()->where('account_id', $account->getKey())->get();
            $net = $lines->sum(fn (AccountingJournalLine $line): int => (int) $line->debit_rial - (int) $line->credit_rial);
            self::assertSame(0, $net);
        }
        self::assertSame(1, AccountingJournal::query()->whereNotNull('reversal_of_journal_id')->count());
        self::assertSame(2, AccountingRequestKey::query()->where('operation', 'reverse')->count());
        self::assertSame('posted', AccountingJournal::query()->findOrFail($original['id'])->status);
    }

    public function test_foreign_records_read_only_role_csrf_and_account_scope_are_enforced(): void
    {
        $foreignBook = $this->makeBook($this->foreignOrganization, 'P09-X');
        $foreignAccount = $this->makeAccount($this->foreignOrganization, $foreignBook, '1100', 'حساب بیرونی', 'asset');
        $this->getJson('/api/v1/accounting/options')->assertOk();
        $this->postJson('/api/v1/accounting/books', ['code' => 'NO-CSRF', 'name' => 'ردشده'])->assertStatus(419);

        $this->postJson('/api/v1/accounting/journals', [
            'book_id' => $foreignBook->getKey(), 'accounting_date' => 'bad-date', 'description' => '', 'lines' => [],
        ], $this->csrfHeaders())->assertNotFound();

        $this->postJson('/api/v1/accounting/journals', [
            'book_id' => $this->book->getKey(), 'accounting_date' => '2026-11-22', 'description' => 'foreign line',
            'lines' => [['account_id' => $foreignAccount->getKey(), 'debit_rial' => 1.25, 'credit_rial' => '0']],
        ], $this->csrfHeaders())->assertNotFound();

        $journal = $this->createDraft();
        $this->actingAs($this->reader)->withSession(['active_organization_id' => $this->organization->getKey()]);
        $this->getJson('/api/v1/accounting/journals/'.$journal['id'])->assertOk();
        $this->postJson('/api/v1/accounting/journals/'.$journal['id'].'/post', [], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()])
            ->assertForbidden();
        $this->actingAs($this->editor)->withSession(['active_organization_id' => $this->foreignOrganization->getKey()]);
        $this->getJson('/api/v1/accounting/journals/'.$journal['id'])->assertNotFound();
    }

    public function test_post_status_and_idempotency_key_roll_back_together_on_storage_failure(): void
    {
        $journal = $this->createDraft();
        AccountingRequestKey::creating(static function (): void {
            throw new RuntimeException('Forced accounting request-key failure.');
        });

        try {
            $this->withoutExceptionHandling();
            $this->postJson('/api/v1/accounting/journals/'.$journal['id'].'/post', [], $this->csrfHeaders() + ['Idempotency-Key' => (string) Str::uuid()]);
            self::fail('Expected the controlled write failure.');
        } catch (RuntimeException $exception) {
            self::assertSame('Forced accounting request-key failure.', $exception->getMessage());
        } finally {
            AccountingRequestKey::flushEventListeners();
        }

        $fresh = AccountingJournal::query()->with('lines')->findOrFail($journal['id']);
        self::assertSame('draft', $fresh->status);
        self::assertNull($fresh->posted_at);
        self::assertNull($fresh->posting_identity);
        self::assertCount(2, $fresh->lines);
        self::assertSame(0, AccountingRequestKey::query()->count());
    }

    private function makeBook(Organization $organization, string $code): AccountingBook
    {
        return AccountingBook::query()->create([
            'organization_id' => $organization->getKey(), 'code' => $code, 'name' => 'دفتر '.$code,
            'currency_code' => 'IRR', 'currency_scale' => 0, 'time_zone' => 'Asia/Tehran',
        ]);
    }

    private function makeAccount(Organization $organization, AccountingBook $book, string $code, string $name, string $category, bool $postable = true): AccountingAccount
    {
        return AccountingAccount::query()->create([
            'organization_id' => $organization->getKey(), 'book_id' => $book->getKey(), 'code' => $code,
            'name' => $name, 'category' => $category, 'is_postable' => $postable, 'is_active' => true,
        ]);
    }

    private function makePeriod(Organization $organization, AccountingBook $book, string $code, string $name, string $startsOn, string $endsOn): AccountingPeriod
    {
        return AccountingPeriod::query()->create([
            'organization_id' => $organization->getKey(), 'book_id' => $book->getKey(), 'code' => $code,
            'name' => $name, 'starts_on' => $startsOn, 'ends_on' => $endsOn, 'status' => 'open',
        ]);
    }

    private function saleLines(): array
    {
        return [
            ['account_id' => $this->receivable->getKey(), 'memo' => 'Accounts receivable fixture', 'debit_rial' => '1000000', 'credit_rial' => '0'],
            ['account_id' => $this->revenue->getKey(), 'memo' => 'Sales revenue fixture', 'debit_rial' => '0', 'credit_rial' => '1000000'],
        ];
    }

    private function createDraft(?array $lines = null, string $date = '2026-11-22', string $description = 'Synthetic sale on account'): array
    {
        return $this->postJson('/api/v1/accounting/journals', [
            'book_id' => $this->book->getKey(),
            'accounting_date' => $date,
            'description' => $description,
            'lines' => $lines ?? $this->saleLines(),
        ], $this->csrfHeaders())->assertCreated()->json('data');
    }
}
