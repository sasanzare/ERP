<?php

namespace App\Services\Purchasing;

use Illuminate\Validation\ValidationException;

class PurchaseMoneyCalculator
{
    public function normalizeUnitPriceRial(mixed $value, string $field = 'unit_price_rial'): string
    {
        if (! is_string($value) || ! preg_match('/^[0-9]{1,20}$/D', $value)) {
            $this->invalid($field, 'قیمت توافقی باید مبلغی صحیح برحسب ریال باشد.');
        }

        $canonical = ltrim($value, '0') ?: '0';
        $maximum = (string) PHP_INT_MAX;

        if (strlen($canonical) > strlen($maximum)
            || (strlen($canonical) === strlen($maximum) && strcmp($canonical, $maximum) > 0)) {
            $this->invalid($field, 'قیمت از بازهٔ محاسبات پشتیبانی‌شده بیشتر است.');
        }

        return $canonical;
    }

    public function lineTotalRial(int $quantityMilli, string $unitPriceRial, string $field = 'unit_price_rial'): string
    {
        $unitPrice = (int) $this->normalizeUnitPriceRial($unitPriceRial, $field);

        if ($unitPrice !== 0 && $quantityMilli > intdiv(PHP_INT_MAX, $unitPrice)) {
            $this->invalid($field, 'مبلغ این سطر از بازهٔ محاسبات پشتیبانی‌شده بیشتر است.');
        }

        $quantityPrice = $quantityMilli * $unitPrice;
        $wholeRial = intdiv($quantityPrice, 1000);
        $fractionMilliRial = $quantityPrice % 1000;

        if ($fractionMilliRial >= 500) {
            if ($wholeRial === PHP_INT_MAX) {
                $this->invalid($field, 'مبلغ این سطر از بازهٔ محاسبات پشتیبانی‌شده بیشتر است.');
            }

            $wholeRial++;
        }

        return (string) $wholeRial;
    }

    /** @param iterable<string> $amounts */
    public function sum(iterable $amounts): string
    {
        $total = 0;

        foreach ($amounts as $amount) {
            $value = (int) $this->normalizeUnitPriceRial($amount, 'lines');

            if ($value > PHP_INT_MAX - $total) {
                $this->invalid('lines', 'جمع مبلغ سطرها از بازهٔ محاسبات پشتیبانی‌شده بیشتر است.');
            }

            $total += $value;
        }

        return (string) $total;
    }

    private function invalid(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
