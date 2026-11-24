<?php

namespace Tests\Unit;

use App\Services\Accounting\AccountingMoneyCalculator;
use App\Services\Purchasing\PurchaseMoneyCalculator;
use App\Services\Settlements\P10AmountCalculator;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class P10AmountCalculatorTest extends TestCase
{
    public function test_customer_partial_toman_rounding_sums_back_to_the_persisted_line_snapshot(): void
    {
        $calculator = $this->calculator();
        $first = $calculator->customerAmountRial('100000', 3000, 0, 1000, 'line');
        $second = $calculator->customerAmountRial('100000', 3000, 1000, 1000, 'line');
        $third = $calculator->customerAmountRial('100000', 3000, 2000, 1000, 'line');

        self::assertSame(['33333', '33334', '33333'], [
            $first['source_amount_toman'], $second['source_amount_toman'], $third['source_amount_toman'],
        ]);
        self::assertSame('1000000', (string) array_sum(array_map(
            fn (array $amount): int => (int) $amount['amount_rial'], [$first, $second, $third],
        )));
    }

    public function test_supplier_cumulative_rounding_does_not_overstate_a_split_receipt(): void
    {
        $calculator = $this->calculator();
        $first = $calculator->supplierCumulativeAmountRial(0, 500, '1', 'line');
        $second = $calculator->supplierCumulativeAmountRial(500, 500, '1', 'line');

        self::assertSame('1', $first);
        self::assertSame('0', $second);
        self::assertSame('1', (string) ((int) $first + (int) $second));
    }

    public function test_unsupported_quantity_precision_and_amount_overflow_are_rejected(): void
    {
        $calculator = $this->calculator();

        try {
            $calculator->normalizeQuantityMilli('1.0001', 'quantity');
            self::fail('Four decimal places should be rejected.');
        } catch (ValidationException $exception) {
            self::assertArrayHasKey('quantity', $exception->errors());
        }

        try {
            $calculator->customerAmountRial((string) PHP_INT_MAX, 1000, 0, 1000, 'line');
            self::fail('Toman-to-rial multiplication overflow should be rejected.');
        } catch (ValidationException $exception) {
            self::assertArrayHasKey('line', $exception->errors());
        }
    }

    private function calculator(): P10AmountCalculator
    {
        return new P10AmountCalculator(new AccountingMoneyCalculator, new PurchaseMoneyCalculator);
    }
}
