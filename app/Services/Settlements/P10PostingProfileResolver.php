<?php

namespace App\Services\Settlements;

use App\Models\AccountingAccount;
use App\Models\AccountingBook;
use App\Models\Organization;
use App\Models\P10AccountingProfile;
use Symfony\Component\HttpKernel\Exception\HttpException;

class P10PostingProfileResolver
{
    public function resolve(Organization $organization, AccountingBook $book): P10AccountingProfile
    {
        if ($book->currency_code !== 'IRR' || (int) $book->currency_scale !== 0) {
            throw new HttpException(409, 'P10 فقط در دفتر با واحد صحیح ریال قابل ثبت است.');
        }

        $profile = P10AccountingProfile::query()
            ->where('organization_id', $organization->getKey())
            ->where('book_id', $book->getKey())
            ->first();

        if ($profile === null || ! $this->isEnabled($profile, $book)) {
            throw new HttpException(409, 'ثبت P10 در این دفتر غیرفعال است؛ قواعد و نگاشت حسابداری باید تأیید شوند.');
        }

        $accountIds = collect([
            $profile->customer_receivable_account_id,
            $profile->customer_revenue_account_id,
            $profile->supplier_payable_account_id,
            $profile->supplier_debit_account_id,
            $profile->customer_treasury_account_id,
            $profile->supplier_treasury_account_id,
        ])->unique()->values();
        $accounts = AccountingAccount::query()
            ->where('organization_id', $organization->getKey())
            ->where('book_id', $book->getKey())
            ->whereIn('id', $accountIds)
            ->where('is_active', true)
            ->where('is_postable', true)
            ->get()->keyBy('id');

        if ($accounts->count() !== $accountIds->count()) {
            throw new HttpException(409, 'حساب‌های نگاشت‌شدهٔ P10 باید فعال، ثبت‌پذیر و متعلق به همین دفتر باشند.');
        }

        $expected = [
            [$profile->customer_receivable_account_id, 'asset'],
            [$profile->customer_revenue_account_id, 'revenue'],
            [$profile->supplier_payable_account_id, 'liability'],
            [$profile->customer_treasury_account_id, 'asset'],
            [$profile->supplier_treasury_account_id, 'asset'],
        ];
        foreach ($expected as [$id, $category]) {
            if ($accounts->get($id)?->category !== $category) {
                throw new HttpException(409, 'دسته‌بندی حساب‌های نگاشت‌شده با جهت ثبت P10 سازگار نیست.');
            }
        }

        return $profile;
    }

    private function isEnabled(P10AccountingProfile $profile, AccountingBook $book): bool
    {
        if ($profile->status === 'approved') {
            return is_string($profile->approval_reference) && trim($profile->approval_reference) !== ''
                && $profile->approved_by !== null && $profile->approved_at !== null;
        }

        return $profile->status === 'synthetic_test'
            && str_starts_with((string) $book->code, 'P10-SYNTH-')
            && app()->environment(['local', 'testing']);
    }
}
