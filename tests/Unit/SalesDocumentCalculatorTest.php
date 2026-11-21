<?php

namespace Tests\Unit;

use App\Services\Sales\SalesDocumentCalculator;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class SalesDocumentCalculatorTest extends TestCase
{
    public function test_fractional_discounted_lines_round_once_to_whole_tomans(): void
    {
        $calculator = new SalesDocumentCalculator;

        self::assertSame('135000', $calculator->lineNetToman('1.250', '1200000', 1000));
        self::assertSame('43831', $calculator->lineNetToman('0.333', '1350000', 250));
    }

    public function test_exact_half_toman_rounds_up(): void
    {
        $calculator = new SalesDocumentCalculator;

        self::assertSame('1', $calculator->lineNetToman('0.001', '5000', 0));
        self::assertSame('0', $calculator->lineNetToman('0.001', '4990', 0));
    }

    public function test_unsupported_quantity_precision_and_overflow_are_rejected(): void
    {
        $calculator = new SalesDocumentCalculator;

        try {
            $calculator->normalizeQuantity('1.2345');
            self::fail('The fourth fractional digit must be rejected.');
        } catch (ValidationException $exception) {
            self::assertArrayHasKey('quantity', $exception->errors());
        }

        try {
            $calculator->lineNetToman('999999999.999', (string) PHP_INT_MAX, 0);
            self::fail('An overflowing line intermediate must be rejected.');
        } catch (ValidationException $exception) {
            self::assertArrayHasKey('quantity', $exception->errors());
        }
    }

    public function test_discount_precision_is_exact_and_bounded(): void
    {
        $calculator = new SalesDocumentCalculator;

        self::assertSame(250, $calculator->discountBasisPoints('2.5'));
        self::assertSame(10_000, $calculator->discountBasisPoints('100.00'));

        $this->expectException(ValidationException::class);
        $calculator->discountBasisPoints('100.01');
    }
}
