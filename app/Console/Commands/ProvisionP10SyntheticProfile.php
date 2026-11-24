<?php

namespace App\Console\Commands;

use App\Models\AccountingAccount;
use App\Models\AccountingBook;
use App\Models\AccountingPeriod;
use App\Models\Organization;
use App\Models\P10AccountingProfile;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class ProvisionP10SyntheticProfile extends Command
{
    protected $signature = 'p10:provision-synthetic-profile {organizationId : Existing local organization ID} {bookCode : Unique code beginning P10-SYNTH-}';

    protected $description = 'Create an isolated local-only P10 synthetic book, accounts, period, and posting profile.';

    public function handle(): int
    {
        if (! app()->environment('local') || ! config('app.debug')) {
            $this->error('This synthetic P10 profile command is allowed only in a local debug environment.');

            return self::FAILURE;
        }

        $organizationId = filter_var($this->argument('organizationId'), FILTER_VALIDATE_INT);
        $bookCode = (string) $this->argument('bookCode');
        if ($organizationId === false || $organizationId < 1
            || ! preg_match('/^P10-SYNTH-[A-Z0-9-]{1,40}$/D', $bookCode)) {
            $this->error('Provide a positive organization ID and a book code matching P10-SYNTH-*.');

            return self::INVALID;
        }

        $result = DB::transaction(function () use ($organizationId, $bookCode): array {
            $organization = Organization::query()->lockForUpdate()->findOrFail($organizationId);
            $book = AccountingBook::query()
                ->where('organization_id', $organization->getKey())
                ->where('code', $bookCode)
                ->lockForUpdate()->first();

            if ($book === null) {
                $book = AccountingBook::query()->create([
                    'organization_id' => $organization->getKey(),
                    'code' => $bookCode,
                    'name' => 'P10 synthetic settlement book',
                    'currency_code' => 'IRR',
                    'currency_scale' => 0,
                    'time_zone' => 'Asia/Tehran',
                ]);
            } elseif ($book->currency_code !== 'IRR' || (int) $book->currency_scale !== 0) {
                throw new RuntimeException('The existing synthetic book is not a whole-Rial book; no profile was changed.');
            }

            $accountDefinitions = [
                'customer_receivable' => ['1100', 'P10 fixture customer receivable', 'asset'],
                'customer_revenue' => ['4100', 'P10 fixture customer revenue', 'revenue'],
                'supplier_payable' => ['2100', 'P10 fixture supplier payable', 'liability'],
                'supplier_debit' => ['5100', 'P10 fixture purchase expense', 'expense'],
                'customer_treasury' => ['1010', 'P10 fixture customer treasury', 'asset'],
                'supplier_treasury' => ['1020', 'P10 fixture supplier treasury', 'asset'],
            ];
            $accounts = [];
            foreach ($accountDefinitions as $key => [$code, $name, $category]) {
                $account = AccountingAccount::query()
                    ->where('organization_id', $organization->getKey())
                    ->where('book_id', $book->getKey())
                    ->where('code', $code)
                    ->lockForUpdate()->first();
                if ($account === null) {
                    $account = AccountingAccount::query()->create([
                        'organization_id' => $organization->getKey(),
                        'book_id' => $book->getKey(),
                        'code' => $code,
                        'name' => $name,
                        'category' => $category,
                        'is_postable' => true,
                        'is_active' => true,
                    ]);
                } elseif (! $account->is_active || ! $account->is_postable || $account->category !== $category) {
                    throw new RuntimeException("Existing synthetic account {$code} has an incompatible category or state.");
                }
                $accounts[$key] = $account;
            }

            $period = AccountingPeriod::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $book->getKey())
                ->where('code', 'P10-SYNTH-2026-2027')
                ->lockForUpdate()->first();
            if ($period === null) {
                $period = AccountingPeriod::query()->create([
                    'organization_id' => $organization->getKey(),
                    'book_id' => $book->getKey(),
                    'code' => 'P10-SYNTH-2026-2027',
                    'name' => 'P10 synthetic open period',
                    'starts_on' => '2026-01-01',
                    'ends_on' => '2027-12-31',
                    'status' => 'open',
                ]);
            } elseif ($period->status !== 'open'
                || $period->starts_on->format('Y-m-d') !== '2026-01-01'
                || $period->ends_on->format('Y-m-d') !== '2027-12-31') {
                throw new RuntimeException('The existing P10 synthetic period is incompatible; no period was reopened or changed.');
            }

            $profile = P10AccountingProfile::query()
                ->where('organization_id', $organization->getKey())
                ->where('book_id', $book->getKey())
                ->lockForUpdate()->first();
            $mapping = [
                'customer_receivable_account_id' => $accounts['customer_receivable']->getKey(),
                'customer_revenue_account_id' => $accounts['customer_revenue']->getKey(),
                'supplier_payable_account_id' => $accounts['supplier_payable']->getKey(),
                'supplier_debit_account_id' => $accounts['supplier_debit']->getKey(),
                'customer_treasury_account_id' => $accounts['customer_treasury']->getKey(),
                'supplier_treasury_account_id' => $accounts['supplier_treasury']->getKey(),
            ];
            if ($profile === null) {
                $profile = P10AccountingProfile::query()->create([
                    'organization_id' => $organization->getKey(),
                    'book_id' => $book->getKey(),
                    'status' => 'synthetic_test',
                    ...$mapping,
                ]);
            } elseif ($profile->status !== 'synthetic_test') {
                throw new RuntimeException('An existing approved profile will not be replaced with a synthetic profile.');
            } else {
                foreach ($mapping as $column => $accountId) {
                    if ((int) $profile->{$column} !== (int) $accountId) {
                        throw new RuntimeException('The existing synthetic profile uses a different account mapping; no profile was changed.');
                    }
                }
            }

            return ['book' => $book, 'period' => $period, 'profile' => $profile];
        }, 3);

        $this->info('P10 synthetic profile is ready in the selected local organization.');
        $this->line('Book: '.$result['book']->code.' (ID '.$result['book']->getKey().')');
        $this->line('Period: '.$result['period']->code.' (ID '.$result['period']->getKey().')');
        $this->line('Profile status: '.$result['profile']->status.'; it is not an approved live mapping.');

        return self::SUCCESS;
    }
}
