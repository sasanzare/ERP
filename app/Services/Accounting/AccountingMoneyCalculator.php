<?php

namespace App\Services\Accounting;

use Illuminate\Validation\ValidationException;

class AccountingMoneyCalculator
{
    public function normalizeRial(mixed $value, string $field = 'amount_rial', bool $allowZero = true): string
    {
        if (! is_string($value) || ! preg_match('/^[0-9]{1,20}$/D', $value)) {
            $this->invalid($field, 'مبلغ باید عدد صحیح و بدون اعشار برحسب ریال باشد.');
        }

        $canonical = ltrim($value, '0') ?: '0';
        if ($this->greaterThan($canonical, (string) PHP_INT_MAX)) {
            $this->invalid($field, 'مبلغ از بازهٔ محاسبات پشتیبانی‌شده بیشتر است.');
        }

        if (! $allowZero && $canonical === '0') {
            $this->invalid($field, 'مبلغ این طرف سند باید بزرگ‌تر از صفر باشد.');
        }

        return $canonical;
    }

    public function tomanToRial(mixed $value, string $field = 'amount_toman'): string
    {
        if (! is_string($value) || ! preg_match('/^[0-9]{1,20}$/D', $value)) {
            $this->invalid($field, 'مبلغ تومان باید عدد صحیح و بدون اعشار باشد.');
        }

        $canonical = ltrim($value, '0') ?: '0';
        if ($canonical === '0') {
            return '0';
        }

        $rial = $canonical.'0';
        if ($this->greaterThan($rial, (string) PHP_INT_MAX)) {
            $this->invalid($field, 'مبلغ تبدیل‌شده به ریال از بازهٔ پشتیبانی‌شده بیشتر است.');
        }

        return $rial;
    }

    /** @param iterable<string> $amounts */
    public function sum(iterable $amounts, string $field = 'lines'): string
    {
        $total = 0;

        foreach ($amounts as $amount) {
            $value = (int) $this->normalizeRial($amount, $field);
            if ($value > PHP_INT_MAX - $total) {
                $this->invalid($field, 'جمع مبالغ از بازهٔ پشتیبانی‌شده بیشتر است.');
            }
            $total += $value;
        }

        return (string) $total;
    }

    private function greaterThan(string $left, string $right): bool
    {
        return strlen($left) > strlen($right)
            || (strlen($left) === strlen($right) && strcmp($left, $right) > 0);
    }

    private function invalid(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
