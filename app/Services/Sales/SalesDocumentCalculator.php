<?php

namespace App\Services\Sales;

use Illuminate\Validation\ValidationException;

class SalesDocumentCalculator
{
    private const MAX_QUANTITY_MILLI = 999_999_999_999;

    private const LINE_DENOMINATOR = 100_000_000;

    public function normalizeQuantity(mixed $value, string $field = 'quantity'): string
    {
        if (! is_string($value) || ! preg_match('/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,3})?$/D', $value)) {
            $this->invalid($field, 'مقدار باید مثبت و حداکثر با سه رقم اعشار باشد.');
        }

        [$whole, $fraction] = array_pad(explode('.', $value, 2), 2, '');
        if (strlen($whole) > 9 || (strlen($whole) === 9 && strcmp($whole, '999999999') > 0)) {
            $this->invalid($field, 'مقدار از بازهٔ پشتیبانی‌شده بیشتر است.');
        }

        $milli = ((int) $whole * 1000) + (int) str_pad($fraction, 3, '0');
        if ($milli < 1 || $milli > self::MAX_QUANTITY_MILLI) {
            $this->invalid($field, 'مقدار باید بزرگ‌تر از صفر و در بازهٔ پشتیبانی‌شده باشد.');
        }

        return $whole.'.'.str_pad($fraction, 3, '0');
    }

    public function discountBasisPoints(mixed $value, string $field = 'discount'): int
    {
        if (! is_string($value) || ! preg_match('/^(?:0|[1-9][0-9]?|100)(?:\.[0-9]{1,2})?$/D', $value)) {
            $this->invalid($field, 'تخفیف باید بین ۰ و ۱۰۰ درصد و حداکثر با دو رقم اعشار باشد.');
        }

        [$whole, $fraction] = array_pad(explode('.', $value, 2), 2, '');
        $basisPoints = ((int) $whole * 100) + (int) str_pad($fraction, 2, '0');
        if ($basisPoints > 10_000) {
            $this->invalid($field, 'تخفیف باید بین ۰ و ۱۰۰ درصد باشد.');
        }

        return $basisPoints;
    }

    public function lineNetToman(string $quantity, string $unitPriceTomanTenths, int $discountBasisPoints, string $field = 'quantity'): string
    {
        $normalized = $this->normalizeQuantity($quantity, $field);
        $quantityMilli = (int) str_replace('.', '', $normalized);
        $unitPrice = $this->supportedTomanTenths($unitPriceTomanTenths, $field);

        if ($discountBasisPoints < 0 || $discountBasisPoints > 10_000) {
            $this->invalid($field, 'درصد تخفیف ذخیره‌شده معتبر نیست.');
        }

        if ($unitPrice !== 0 && $quantityMilli > intdiv(PHP_INT_MAX, $unitPrice)) {
            $this->invalid($field, 'مبلغ این سطر از بازهٔ محاسبات پشتیبانی‌شده بیشتر است.');
        }

        $quantityPrice = $quantityMilli * $unitPrice;
        $undiscountedFraction = 10_000 - $discountBasisPoints;
        $whole = intdiv($quantityPrice, self::LINE_DENOMINATOR);
        $remainder = $quantityPrice % self::LINE_DENOMINATOR;
        $net = ($whole * $undiscountedFraction)
            + intdiv(($remainder * $undiscountedFraction) + intdiv(self::LINE_DENOMINATOR, 2), self::LINE_DENOMINATOR);

        return (string) $net;
    }

    /** @param iterable<object> $lines @return array{line_amounts: array<int, string>, total_toman: string} */
    public function calculatePersistedLines(iterable $lines): array
    {
        $total = 0;
        $lineAmounts = [];

        foreach ($lines as $line) {
            $net = $this->lineNetToman(
                (string) $line->quantity,
                (string) $line->unit_price_toman_tenths,
                (int) $line->discount_basis_points,
                'lines.'.$line->getKey().'.quantity',
            );
            $amount = (int) $net;

            if ($amount > PHP_INT_MAX - $total) {
                $this->invalid('lines', 'جمع مبلغ سطرها از بازهٔ پشتیبانی‌شده بیشتر است.');
            }

            $total += $amount;
            $lineAmounts[$line->getKey()] = $net;
        }

        return ['line_amounts' => $lineAmounts, 'total_toman' => (string) $total];
    }

    private function supportedTomanTenths(string $amount, string $field): int
    {
        $maximum = (string) PHP_INT_MAX;
        if (! preg_match('/^[0-9]{1,20}$/D', $amount)) {
            $this->invalid($field, 'قیمت ذخیره‌شده معتبر نیست.');
        }

        $canonical = ltrim($amount, '0') ?: '0';
        if (strlen($canonical) > strlen($maximum) || (strlen($canonical) === strlen($maximum) && strcmp($canonical, $maximum) > 0)) {
            $this->invalid($field, 'قیمت از بازهٔ محاسبات پشتیبانی‌شده بیشتر است.');
        }

        return (int) $canonical;
    }

    private function invalid(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
