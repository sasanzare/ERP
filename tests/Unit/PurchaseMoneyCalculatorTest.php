<?php

namespace Tests\Unit;

use App\Services\Purchasing\PurchaseMoneyCalculator;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class PurchaseMoneyCalculatorTest extends TestCase
{
    public function test_line_totals_round_half_up_to_whole_rial_and_sum_exactly(): void
    {
        $calculator = new PurchaseMoneyCalculator;

        self::assertSame('1', $calculator->lineTotalRial(1, '500'));
        self::assertSame('0', $calculator->lineTotalRial(1, '499'));
        self::assertSame('150000', $calculator->lineTotalRial(1500, '100000'));
        self::assertSame('150001', $calculator->sum(['1', '150000']));
    }

    public function test_unit_price_and_line_total_reject_values_outside_exact_integer_range(): void
    {
        $calculator = new PurchaseMoneyCalculator;

        try {
            $calculator->normalizeUnitPriceRial((string) PHP_INT_MAX.'0');
            self::fail('A price above the signed integer range was accepted.');
        } catch (ValidationException $exception) {
            self::assertArrayHasKey('unit_price_rial', $exception->errors());
        }

        $this->expectException(ValidationException::class);
        $calculator->lineTotalRial(999_999_999_999, (string) PHP_INT_MAX);
    }
}
