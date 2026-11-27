<?php

namespace App\Services\Parties;

use App\Models\Organization;
use App\Models\OrganizationMembership;
use App\Models\Party;
use App\Models\PartyImport;
use App\Models\PartyImportRow;
use App\Models\PartyRole;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class PartyImportService
{
    public function preview(Organization $organization, array $rawRows): array
    {
        $rows = [];

        foreach ($rawRows as $raw) {
            $row = $this->normalize($raw);
            $rows[] = $row;
        }

        $validIndexes = [];

        foreach ($rows as $index => $row) {
            if ($row['classification'] === 'valid') {
                $validIndexes[] = $index;
            }
        }

        if ($validIndexes !== []) {
            $validRows = array_map(fn (int $index): array => $rows[$index], $validIndexes);
            $databaseDuplicates = $this->duplicateRowsAgainstParties($organization, $validRows);
            $uploadDuplicates = $this->duplicateRowsWithinUpload($validRows);

            foreach ($validIndexes as $offset => $index) {
                $rowOffset = $offset;

                if (isset($databaseDuplicates[$rowOffset])) {
                    $rows[$index]['classification'] = 'duplicate';
                    $rows[$index]['message'] = 'این کد در سازمان فعال وجود دارد؛ نام و نقش‌های ثبت‌شده حفظ می‌شوند.';
                } elseif (isset($uploadDuplicates[$rowOffset])) {
                    $rows[$index]['classification'] = 'duplicate';
                    $rows[$index]['message'] = 'کد این ردیف در ردیف دادهٔ قبلی همین فایل آمده است.';
                }
            }
        }

        $hashPayload = [
            'organization_id' => $organization->getKey(),
            'rows' => array_map(fn (array $row): array => [
                'source_row' => $row['source_row'],
                'source_party_id' => $row['source_party_id'],
                'party_code' => $row['party_code'],
                'display_name' => $row['display_name'],
                'roles_text' => $row['roles_text'],
                'roles' => $row['roles'],
                'text_fields' => $row['text_fields'],
                'extra_columns' => $row['extra_columns'],
            ], $rows),
        ];

        return [
            'payload_hash' => hash('sha256', json_encode($hashPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)),
            'rows' => $rows,
            'counts' => $this->counts($rows, 'classification'),
        ];
    }

    public function apply(
        Organization $organization,
        User $actor,
        string $importKey,
        string $expectedPayloadHash,
        string $sourceFormat,
        array $rawRows,
        int $maxRows = PartyImportParser::MAX_ROWS,
    ): array {
        $preview = $this->preview($organization, $rawRows);

        if (! hash_equals($expectedPayloadHash, $preview['payload_hash'])) {
            throw new ConflictHttpException('محتوای فایل با پیش‌نمایش تأییدشده یکسان نیست؛ دوباره پیش‌نمایش بگیرید.');
        }

        $import = $this->startOrLoad($organization, $actor, $importKey, $sourceFormat, $preview);
        $pendingRows = $import->rows()->where('outcome', 'pending')->orderBy('source_row')->limit($maxRows)->get();

        foreach ($pendingRows as $pendingRow) {
            $this->applyOne($organization, $actor, $import, $pendingRow->getKey());
        }

        DB::transaction(function () use ($organization, $import): void {
            $locked = PartyImport::query()
                ->where('organization_id', $organization->getKey())
                ->whereKey($import->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            if (! $locked->rows()->where('outcome', 'pending')->exists()) {
                $locked->status = 'completed';
                $locked->save();
            }
        });

        return $this->result($organization, $import->fresh());
    }

    public function result(Organization $organization, PartyImport $import): array
    {
        $rows = $import->rows()
            ->where('organization_id', $organization->getKey())
            ->orderBy('source_row')
            ->get()
            ->map(fn (PartyImportRow $row): array => [
                'source_row' => $row->source_row,
                'party_id' => $row->party_id,
                'party_code' => $row->party_code,
                'display_name' => $row->display_name,
                'roles' => $row->roles ?? [],
                'classification' => $row->classification,
                'outcome' => $row->outcome,
                'message' => $row->message,
            ])
            ->values()
            ->all();

        return [
            'import_key' => $import->import_key,
            'payload_hash' => $import->payload_hash,
            'status' => $import->status,
            'counts' => $this->counts($rows, 'outcome'),
            'rows' => $rows,
        ];
    }

    private function startOrLoad(Organization $organization, User $actor, string $importKey, string $format, array $preview): PartyImport
    {
        return DB::transaction(function () use ($organization, $actor, $importKey, $format, $preview): PartyImport {
            Organization::query()->whereKey($organization->getKey())->lockForUpdate()->firstOrFail();
            $this->assertEditor($organization, $actor);

            DB::table('party_imports')->insertOrIgnore([
                'organization_id' => $organization->getKey(),
                'import_key' => $importKey,
                'payload_hash' => $preview['payload_hash'],
                'source_format' => $format,
                'status' => 'applying',
                'created_by_user_id' => $actor->getKey(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $import = PartyImport::query()
                ->where('organization_id', $organization->getKey())
                ->where('import_key', $importKey)
                ->lockForUpdate()
                ->firstOrFail();

            if (! hash_equals($import->payload_hash, $preview['payload_hash'])) {
                throw new ConflictHttpException('این شناسهٔ ورود قبلاً برای محتوای دیگری استفاده شده است.');
            }

            if (! $import->rows()->exists()) {
                foreach ($preview['rows'] as $row) {
                    PartyImportRow::query()->create([
                        'organization_id' => $organization->getKey(),
                        'party_import_id' => $import->getKey(),
                        'source_row' => $row['source_row'],
                        'source_party_id' => $row['source_party_id'] !== '' ? $row['source_party_id'] : null,
                        'party_code' => $row['party_code'] !== '' ? $row['party_code'] : null,
                        'display_name' => $row['display_name'] !== '' ? $row['display_name'] : null,
                        'roles' => $row['roles'],
                        'classification' => $row['classification'],
                        'outcome' => $row['classification'] === 'valid' ? 'pending' : $row['classification'],
                        'message' => $row['message'],
                    ]);
                }
            }

            return $import;
        });
    }

    private function applyOne(Organization $organization, User $actor, PartyImport $import, int $rowId): void
    {
        try {
            DB::transaction(function () use ($organization, $actor, $import, $rowId): void {
                Organization::query()->whereKey($organization->getKey())->lockForUpdate()->firstOrFail();
                $this->assertEditor($organization, $actor);

                $row = PartyImportRow::query()
                    ->where('organization_id', $organization->getKey())
                    ->where('party_import_id', $import->getKey())
                    ->whereKey($rowId)
                    ->where('outcome', 'pending')
                    ->lockForUpdate()
                    ->first();

                if ($row === null) {
                    return;
                }

                $existing = Party::query()
                    ->where('organization_id', $organization->getKey())
                    ->where('code', $row->party_code)
                    ->lockForUpdate()
                    ->first();

                if ($existing !== null) {
                    $row->outcome = 'duplicate';
                    $row->message = 'این کد پس از پیش‌نمایش در سازمان ثبت شد؛ دادهٔ موجود حفظ شد.';
                    $row->save();

                    return;
                }

                $party = Party::query()->create([
                    'organization_id' => $organization->getKey(),
                    'code' => $row->party_code,
                    'display_name' => $row->display_name,
                ]);

                foreach ($row->roles as $role) {
                    PartyRole::query()->create([
                        'organization_id' => $organization->getKey(),
                        'party_id' => $party->getKey(),
                        'role' => $role,
                    ]);
                }

                $row->party_id = $party->getKey();
                $row->outcome = 'created';
                $row->message = 'طرف تجاری و نقش‌های انتخاب‌شده ثبت شدند.';
                $row->save();
            });
        } catch (QueryException $exception) {
            if (! $this->isPartyCodeConstraintViolation($exception)) {
                throw $exception;
            }

            PartyImportRow::query()
                ->where('organization_id', $organization->getKey())
                ->where('party_import_id', $import->getKey())
                ->whereKey($rowId)
                ->where('outcome', 'pending')
                ->update([
                    'outcome' => 'duplicate',
                    'message' => 'کد با ثبت هم‌زمان دیگری برخورد کرد؛ دادهٔ موجود حفظ شد.',
                    'updated_at' => now(),
                ]);
        }
    }

    private function assertEditor(Organization $organization, User $actor): void
    {
        $membership = OrganizationMembership::query()
            ->where('organization_id', $organization->getKey())
            ->where('user_id', $actor->getKey())
            ->lockForUpdate()
            ->first();

        if ($membership?->role !== 'editor') {
            throw new AuthorizationException;
        }
    }

    private function normalize(array $raw): array
    {
        $code = trim((string) ($raw['party_code'] ?? ''));
        $name = trim((string) ($raw['display_name'] ?? ''));
        $rolesText = trim((string) ($raw['roles_text'] ?? ''));
        $roles = [];
        $message = null;
        $classification = 'valid';
        $textFields = $raw['text_fields'] ?? [];

        if (($textFields['party_code'] ?? true) !== true) {
            $message = 'کد باید در فایل XLSX به‌صورت متن ذخیره شود تا صفرهای ابتدایی حفظ شوند.';
        } elseif ($code === '' || mb_strlen($code) > 64) {
            $message = 'کد لازم است و حداکثر ۶۴ نویسه دارد.';
        } elseif (($textFields['display_name'] ?? true) !== true) {
            $message = 'نام نمایشی باید در فایل XLSX به‌صورت متن ذخیره شود.';
        } elseif ($name === '' || mb_strlen($name) > 255) {
            $message = 'نام نمایشی لازم است و حداکثر ۲۵۵ نویسه دارد.';
        } elseif (($textFields['roles'] ?? true) !== true) {
            $message = 'نقش‌ها باید در فایل XLSX به‌صورت متن وارد شوند.';
        } elseif (($raw['extra_columns'] ?? false) === true) {
            $message = 'ردیف شامل مقدار اضافی بیرون از چهار ستون قالب است.';
        } else {
            $tokens = array_map('trim', explode('|', $rolesText));
            $partyRoles = ['customer', 'supplier'];
            $roles = $tokens;

            if ($rolesText === '' || count(array_unique($tokens)) !== count($tokens) || count(array_diff($tokens, $partyRoles)) > 0) {
                $message = 'نقش‌ها باید customer، supplier یا customer|supplier باشند.';
            } else {
                $roles = array_values(array_intersect(['customer', 'supplier'], $tokens));
            }
        }

        if ($message !== null) {
            $classification = 'invalid';
            $roles = [];
        } else {
            $roles = array_values(array_intersect(['customer', 'supplier'], $roles));
            $message = 'این ردیف آمادهٔ ثبت است.';
        }

        return [
            'source_row' => (int) ($raw['source_row'] ?? 0),
            'source_party_id' => trim((string) ($raw['source_party_id'] ?? '')),
            'party_code' => $code,
            'display_name' => $name,
            'roles_text' => $rolesText,
            'roles' => $roles,
            'text_fields' => [
                'party_code' => ($textFields['party_code'] ?? true) === true,
                'display_name' => ($textFields['display_name'] ?? true) === true,
                'roles' => ($textFields['roles'] ?? true) === true,
            ],
            'extra_columns' => (bool) ($raw['extra_columns'] ?? false),
            'classification' => $classification,
            'message' => $message,
        ];
    }

    private function duplicateRowsAgainstParties(Organization $organization, array $rows): array
    {
        [$sourceSql, $bindings] = $this->incomingCodesSql($rows);
        $matches = DB::select(
            "SELECT incoming.row_index FROM ({$sourceSql}) AS incoming INNER JOIN parties AS existing "
            .'ON existing.organization_id = ? AND existing.code = incoming.party_code',
            [...$bindings, $organization->getKey()],
        );

        return array_fill_keys(array_map(fn (object $row): int => (int) $row->row_index, $matches), true);
    }

    private function duplicateRowsWithinUpload(array $rows): array
    {
        if (count($rows) < 2) {
            return [];
        }

        [$sourceSql, $bindings] = $this->incomingCodesSql($rows);
        $duplicates = DB::select(
            "SELECT incoming.row_index FROM ({$sourceSql}) AS incoming INNER JOIN "
            ."(SELECT party_code, MIN(row_index) AS first_row FROM ({$sourceSql}) AS grouped_codes GROUP BY party_code HAVING COUNT(*) > 1) AS duplicate_codes "
            .'ON duplicate_codes.party_code = incoming.party_code WHERE incoming.row_index > duplicate_codes.first_row',
            [...$bindings, ...$bindings],
        );

        return array_fill_keys(array_map(fn (object $row): int => (int) $row->row_index, $duplicates), true);
    }

    private function incomingCodesSql(array $rows): array
    {
        $collation = $this->partyCodeCollation();
        $selects = [];
        $bindings = [];

        foreach ($rows as $index => $row) {
            $selects[] = "SELECT ? AS row_index, CONVERT(? USING utf8mb4) COLLATE {$collation} AS party_code";
            $bindings[] = $index;
            $bindings[] = $row['party_code'];
        }

        return [implode(' UNION ALL ', $selects), $bindings];
    }

    private function partyCodeCollation(): string
    {
        $configured = (string) DB::connection()->getConfig('collation');
        $found = null;

        try {
            $found = DB::selectOne(
                'SELECT COLLATION_NAME AS collation_name FROM information_schema.COLUMNS '
                .'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
                ['parties', 'code'],
            )?->collation_name;
        } catch (\Throwable) {
            // Non-MySQL connections use the configured application collation below.
        }

        $collation = is_string($found) && $found !== '' ? $found : $configured;

        if (! preg_match('/\\Autf8mb4_[A-Za-z0-9_]+\\z/', $collation)) {
            throw new \RuntimeException('The party code column uses an unsupported collation.');
        }

        return $collation;
    }

    private function isPartyCodeConstraintViolation(QueryException $exception): bool
    {
        $errorInfo = $exception->errorInfo;
        $message = $exception->getMessage();
        $driverCode = is_array($errorInfo) ? (int) ($errorInfo[1] ?? 0) : 0;

        return str_contains($message, 'parties_organization_code_unique')
            || ($driverCode === 1062 && str_contains($message, 'parties'));
    }

    private function counts(array $rows, string $field): array
    {
        $valid = array_filter($rows, fn (array $row): bool => in_array($row[$field] ?? null, ['valid', 'pending', 'created'], true));

        return [
            'valid' => count($valid),
            'duplicate' => count(array_filter($rows, fn (array $row): bool => ($row[$field] ?? null) === 'duplicate')),
            'invalid' => count(array_filter($rows, fn (array $row): bool => ($row[$field] ?? null) === 'invalid')),
            'created' => count(array_filter($rows, fn (array $row): bool => ($row[$field] ?? null) === 'created')),
            'pending' => count(array_filter($rows, fn (array $row): bool => ($row[$field] ?? null) === 'pending')),
        ];
    }
}
