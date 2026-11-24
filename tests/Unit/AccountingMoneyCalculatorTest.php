<?php

namespace Tests\Unit;

use App\Services\Accounting\AccountingMoneyCalculator;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AccountingMoneyCalculatorTest extends TestCase
{
    public function test_toman_snapshots_convert_to_rial_without_float_arithmetic(): void
    {
        $calculator = new AccountingMoneyCalculator;

        self::assertSame('1788310', $calculator->tomanToRial('178831'));
        self::assertSame('500000', $calculator->normalizeRial('500000'));
        self::assertSame((string) PHP_INT_MAX, $calculator->normalizeRial((string) PHP_INT_MAX));
    }

    #[DataProvider('invalidAmounts')]
    public function test_invalid_or_overflowing_amounts_are_rejected(mixed $value): void
    {
        $this->expectException(ValidationException::class);
        (new AccountingMoneyCalculator)->normalizeRial($value);
    }

    public static function invalidAmounts(): array
    {
        return [
            'decimal string' => ['10.5'],
            'negative' => ['-1'],
            'float' => [10.0],
            'overflow' => ['9223372036854775808'],
        ];
    }

    public function test_toman_conversion_and_aggregate_reject_signed_integer_overflow(): void
    {
        $calculator = new AccountingMoneyCalculator;

        try {
            $calculator->tomanToRial((string) PHP_INT_MAX);
            self::fail('Expected Toman conversion overflow to be rejected.');
        } catch (ValidationException) {
            self::assertTrue(true);
        }

        $this->expectException(ValidationException::class);
        $calculator->sum([(string) PHP_INT_MAX, '1']);
    }
}
