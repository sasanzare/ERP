<?php

namespace App\Services\Parties;

use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use OpenSpout\Common\Entity\Cell\EmptyCell;
use OpenSpout\Common\Entity\Cell\FormulaCell;
use OpenSpout\Common\Entity\Cell\StringCell;
use OpenSpout\Reader\XLSX\Options as XlsxOptions;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;
use Throwable;

class PartyImportParser
{
    public const array HEADERS = ['party_id', 'party_code', 'display_name', 'roles'];

    public const int MAX_ROWS = 1000;

    public function parse(UploadedFile $file): array
    {
        return match (mb_strtolower($file->getClientOriginalExtension())) {
            'csv' => ['format' => 'csv', 'rows' => $this->parseCsv($file)],
            'xlsx' => ['format' => 'xlsx', 'rows' => $this->parseXlsx($file)],
            default => throw ValidationException::withMessages([
                'file' => 'فقط فایل CSV یا XLSX پذیرفته می‌شود.',
            ]),
        };
    }

    private function parseCsv(UploadedFile $file): array
    {
        $content = file_get_contents($file->getRealPath());

        if ($content === false || ! mb_check_encoding($content, 'UTF-8')) {
            throw ValidationException::withMessages(['file' => 'فایل CSV باید با کدگذاری UTF-8 ذخیره شده باشد.']);
        }

        if (str_starts_with($content, "\xEF\xBB\xBF")) {
            $content = substr($content, 3);
        }

        $stream = fopen('php://temp', 'w+b');
        fwrite($stream, $content);
        rewind($stream);

        try {
            $header = fgetcsv($stream, null, ',', '"', '');

            if (! is_array($header)) {
                throw ValidationException::withMessages(['file' => 'سطر عنوان قالب در فایل پیدا نشد.']);
            }

            $header = array_map(fn ($value): string => trim((string) $value), $header);
            $this->assertHeader($header);

            $nextSourceRow = 1 + substr_count(substr($content, 0, (int) ftell($stream)), "\n");
            $rows = [];
            $offset = (int) ftell($stream);

            while (($values = fgetcsv($stream, null, ',', '"', '')) !== false) {
                $recordStart = $offset;
                $offset = (int) ftell($stream);
                $sourceRow = $nextSourceRow;
                $nextSourceRow += substr_count(substr($content, $recordStart, $offset - $recordStart), "\n");

                if ($this->isBlankCsvRow($values)) {
                    continue;
                }

                $rows[] = $this->csvRow($sourceRow, $values);
                $this->assertRowLimit(count($rows));
            }

            $this->assertHasRows($rows);

            return $rows;
        } finally {
            fclose($stream);
        }
    }

    private function parseXlsx(UploadedFile $file): array
    {
        $reader = new XlsxReader(new XlsxOptions(SHOULD_PRESERVE_EMPTY_ROWS: true));

        try {
            $reader->open($file->getRealPath());
            $selectedSheet = null;

            foreach ($reader->getSheetIterator() as $sheet) {
                if ($sheet->isVisible()) {
                    $selectedSheet = $sheet;
                    break;
                }
            }

            if ($selectedSheet === null) {
                throw ValidationException::withMessages(['file' => 'کاربرگ قابل‌مشاهده‌ای در فایل پیدا نشد.']);
            }

            $rows = [];
            $sourceRow = 0;

            foreach ($selectedSheet->getRowIterator() as $row) {
                $sourceRow++;

                foreach ($row->cells as $cell) {
                    if ($cell instanceof FormulaCell) {
                        throw ValidationException::withMessages([
                            'file' => "سلول فرمولی در سطر {$sourceRow} مجاز نیست؛ مقدار را به متن یا عدد ثابت تبدیل کنید.",
                        ]);
                    }
                }

                if ($sourceRow === 1) {
                    $this->assertHeader($this->headerValues($row->cells));

                    continue;
                }

                if ($row->isEmpty()) {
                    continue;
                }

                $rows[] = $this->xlsxRow($sourceRow, $row->cells);
                $this->assertRowLimit(count($rows));
            }

            $this->assertHasRows($rows);

            return $rows;
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable) {
            throw ValidationException::withMessages([
                'file' => 'ساختار فایل XLSX خوانده نشد. از یک فایل معتبر و بدون رمز استفاده کنید.',
            ]);
        } finally {
            $reader->close();
        }
    }

    private function headerValues(array $cells): array
    {
        $values = [];

        foreach ($cells as $index => $cell) {
            if ($index >= count(self::HEADERS)) {
                if (! $cell instanceof EmptyCell) {
                    $values[] = 'unexpected-column';
                }

                continue;
            }

            $values[$index] = $cell instanceof StringCell ? trim($cell->getValue()) : '';
        }

        return array_values(array_pad($values, count(self::HEADERS), ''));
    }

    private function csvRow(int $sourceRow, array $values): array
    {
        $values = array_map(fn ($value): string => (string) ($value ?? ''), $values);
        $hasExtraColumns = count($values) > count(self::HEADERS)
            && count(array_filter(array_slice($values, count(self::HEADERS)), fn (string $value): bool => trim($value) !== '')) > 0;

        return [
            'source_row' => $sourceRow,
            'source_party_id' => trim($values[0] ?? ''),
            'party_code' => $values[1] ?? '',
            'display_name' => $values[2] ?? '',
            'roles_text' => $values[3] ?? '',
            'text_fields' => ['party_code' => true, 'display_name' => true, 'roles' => true],
            'extra_columns' => $hasExtraColumns,
        ];
    }

    private function xlsxRow(int $sourceRow, array $cells): array
    {
        $values = [];
        $textFields = ['party_code' => false, 'display_name' => false, 'roles' => false];
        $names = ['party_id', 'party_code', 'display_name', 'roles'];
        $hasExtraColumns = false;

        foreach ($cells as $index => $cell) {
            if ($index >= count(self::HEADERS)) {
                $hasExtraColumns = $hasExtraColumns || ! $cell instanceof EmptyCell;

                continue;
            }

            $field = $names[$index];
            $value = $cell instanceof EmptyCell ? '' : $cell->getValue();
            $values[$field] = is_string($value) ? $value : ($value === null ? '' : (string) $value);

            if (isset($textFields[$field])) {
                $textFields[$field] = $cell instanceof StringCell || $cell instanceof EmptyCell;
            }
        }

        return [
            'source_row' => $sourceRow,
            'source_party_id' => trim($values['party_id'] ?? ''),
            'party_code' => $values['party_code'] ?? '',
            'display_name' => $values['display_name'] ?? '',
            'roles_text' => $values['roles'] ?? '',
            'text_fields' => $textFields,
            'extra_columns' => $hasExtraColumns,
        ];
    }

    private function assertHeader(array $header): void
    {
        if ($header !== self::HEADERS) {
            throw ValidationException::withMessages([
                'file' => 'ستون‌های قالب باید دقیقاً و به‌ترتیب party_id, party_code, display_name, roles باشند.',
            ]);
        }
    }

    private function isBlankCsvRow(array $values): bool
    {
        foreach ($values as $value) {
            if (trim((string) $value) !== '') {
                return false;
            }
        }

        return true;
    }

    private function assertRowLimit(int $count): void
    {
        if ($count > self::MAX_ROWS) {
            throw ValidationException::withMessages([
                'file' => 'هر فایل حداکثر می‌تواند ۱۰۰۰ ردیف داده داشته باشد.',
            ]);
        }
    }

    private function assertHasRows(array $rows): void
    {
        if ($rows === []) {
            throw ValidationException::withMessages(['file' => 'فایل فقط عنوان دارد و ردیف داده‌ای در آن نیست.']);
        }
    }
}
