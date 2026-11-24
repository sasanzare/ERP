<?php

namespace App\Services\Settlements;

use App\Services\Accounting\AccountingMoneyCalculator;
use App\Services\Purchasing\PurchaseMoneyCalculator;
use Illuminate\Validation\ValidationException;

class P10AmountCalculator
{
    public function __construct(
        private readonly AccountingMoneyCalculator $accountingMoney,
        private readonly PurchaseMoneyCalculator $purchaseMoney,
    ) {}

    public function normalizeQuantityMilli(mixed $value, string $field): int
    {
        if (! is_string($value) || ! preg_match('/^[0-9]{1,12}$/D', $value)) {
            $this->invalid($field, 'مقدار باید عدد صحیح هزارم واحد باشد.');
        }

        $canonical = ltrim($value, '0') ?: '0';
        if ($canonical === '0' || (int) $canonical > 999_999_999_999) {
            $this->invalid($field, 'مقدار باید بزرگ‌تر از صفر و در بازهٔ پشتیبانی‌شده باشد.');
        }

        return (int) $canonical;
    }

    public function customerAmountRial(
        string $sourceLineAmountToman,
        int $orderedQuantityMilli,
        int $previousBilledQuantityMilli,
        int $quantityMilli,
        string $field,
    ): array {
        if ($orderedQuantityMilli < 1 || $previousBilledQuantityMilli < 0 || $quantityMilli < 1
            || $previousBilledQuantityMilli > $orderedQuantityMilli - $quantityMilli) {
            $this->invalid($field, 'مقدار قابل‌صورتحساب این سطر معتبر نیست.');
        }

        $totalToman = $this->normalizeUnsigned($sourceLineAmountToman, $field);
        $priorToman = $this->roundedRatio($totalToman, $previousBilledQuantityMilli, $orderedQuantityMilli, $field);
        $newToman = $this->roundedRatio($totalToman, $previousBilledQuantityMilli + $quantityMilli, $orderedQuantityMilli, $field);
        $lineToman = (string) ($newToman - $priorToman);

        return [
            'source_amount_toman' => $lineToman,
            'amount_rial' => $this->accountingMoney->tomanToRial($lineToman, $field),
        ];
    }

    public function supplierCumulativeAmountRial(
        int $previousBilledQuantityMilli,
        int $quantityMilli,
        string $unitPriceRial,
        string $field,
    ): string {
        if ($previousBilledQuantityMilli < 0 || $quantityMilli < 1
            || $previousBilledQuantityMilli > PHP_INT_MAX - $quantityMilli) {
            $this->invalid($field, 'مقدار قابل‌صورتحساب این سطر معتبر نیست.');
        }

        $before = $this->purchaseMoney->lineTotalRial($previousBilledQuantityMilli, $unitPriceRial, $field);
        $after = $this->purchaseMoney->lineTotalRial($previousBilledQuantityMilli + $quantityMilli, $unitPriceRial, $field);

        return (string) ((int) $after - (int) $before);
    }

    private function roundedRatio(int $amount, int $numerator, int $denominator, string $field): int
    {
        if ($numerator === 0 || $amount === 0) {
            return 0;
        }

        $whole = intdiv($amount, $denominator);
        $remainder = $amount % $denominator;
        if ($whole !== 0 && $numerator > intdiv(PHP_INT_MAX, $whole)) {
            $this->invalid($field, 'مبلغ این سطر از بازهٔ محاسبات پشتیبانی‌شده بیشتر است.');
        }

        if ($remainder !== 0 && $numerator > intdiv(PHP_INT_MAX - intdiv($denominator, 2), $remainder)) {
            $this->invalid($field, 'مبلغ این سطر از بازهٔ محاسبات پشتیبانی‌شده بیشتر است.');
        }

        $scaledWhole = $whole * $numerator;
        $fraction = intdiv(($remainder * $numerator) + intdiv($denominator, 2), $denominator);
        if ($fraction > PHP_INT_MAX - $scaledWhole) {
            $this->invalid($field, 'مبلغ این سطر از بازهٔ محاسبات پشتیبانی‌شده بیشتر است.');
        }

        return $scaledWhole + $fraction;
    }

    private function normalizeUnsigned(string $value, string $field): int
    {
        if (! preg_match('/^[0-9]{1,20}$/D', $value)) {
            $this->invalid($field, 'مبلغ مبدا معتبر نیست.');
        }

        $canonical = ltrim($value, '0') ?: '0';
        if (strlen($canonical) > strlen((string) PHP_INT_MAX)
            || (strlen($canonical) === strlen((string) PHP_INT_MAX) && strcmp($canonical, (string) PHP_INT_MAX) > 0)) {
            $this->invalid($field, 'مبلغ مبدا از بازهٔ محاسبات پشتیبانی‌شده بیشتر است.');
        }

        return (int) $canonical;
    }

    private function invalid(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
