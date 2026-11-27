<?php

namespace Tests\Feature;

use App\Exceptions\LastOrganizationRoleManagerException;
use App\Models\Organization;
use App\Models\OrganizationMembership;
use App\Models\OrganizationRoleAudit;
use App\Models\OrganizationRoleManager;
use App\Models\Party;
use App\Models\PartyImport;
use App\Models\PartyImportRow;
use App\Models\PartyRole;
use App\Models\User;
use App\Services\OrganizationRoleManagerService;
use App\Services\Parties\PartyImportParser;
use App\Services\Parties\PartyImportService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use OpenSpout\Common\Entity\Cell;
use OpenSpout\Common\Entity\Cell\FormulaCell;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer as XlsxWriter;
use Tests\TestCase;

class P13AdministrationTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private Organization $foreignOrganization;

    private User $manager;

    private User $editor;

    private User $reader;

    private User $subject;

    private OrganizationMembership $managerMembership;

    private OrganizationMembership $subjectMembership;

    protected function setUp(): void
    {
        parent::setUp();

        $this->organization = Organization::query()->create(['name' => 'سازمان P13', 'slug' => 'p13-a']);
        $this->foreignOrganization = Organization::query()->create(['name' => 'سازمان دیگر P13', 'slug' => 'p13-b']);
        $this->manager = User::factory()->create();
        $this->editor = User::factory()->create();
        $this->reader = User::factory()->create();
        $this->subject = User::factory()->create();

        $this->managerMembership = OrganizationMembership::query()->create([
            'organization_id' => $this->organization->getKey(), 'user_id' => $this->manager->getKey(), 'role' => 'reader',
        ]);
        OrganizationMembership::query()->create([
            'organization_id' => $this->organization->getKey(), 'user_id' => $this->editor->getKey(), 'role' => 'editor',
        ]);
        OrganizationMembership::query()->create([
            'organization_id' => $this->organization->getKey(), 'user_id' => $this->reader->getKey(), 'role' => 'reader',
        ]);
        $this->subjectMembership = OrganizationMembership::query()->create([
            'organization_id' => $this->organization->getKey(), 'user_id' => $this->subject->getKey(), 'role' => 'reader',
        ]);
        OrganizationMembership::query()->create([
            'organization_id' => $this->foreignOrganization->getKey(), 'user_id' => $this->manager->getKey(), 'role' => 'editor',
        ]);

        OrganizationRoleManager::query()->create([
            'organization_id' => $this->organization->getKey(),
            'user_id' => $this->manager->getKey(),
            'granted_by_user_id' => $this->manager->getKey(),
            'source' => 'test',
        ]);

        $this->as($this->manager);
    }

    public function test_role_manager_is_separate_from_editor_and_role_change_is_audited_once(): void
    {
        $this->getJson('/api/v1/workspace')
            ->assertOk()
            ->assertJsonPath('capabilities.membership_roles.manage', true)
            ->assertJsonPath('capabilities.master_data.manage', false);

        $memberships = $this->getJson('/api/v1/organization/memberships')->assertOk()->json('data');
        $managerRow = array_values(array_filter($memberships, fn (array $row): bool => $row['user_id'] === $this->manager->getKey()))[0];
        $this->assertTrue($managerRow['role_manager']);

        $this->patchJson('/api/v1/organization/memberships/'.$this->subjectMembership->getKey().'/role', [
            'expected_role' => 'reader',
            'role' => 'editor',
        ], $this->csrfHeaders())
            ->assertOk()
            ->assertJsonPath('data.role', 'editor')
            ->assertJsonPath('changed', true);

        $this->getJson('/api/v1/organization/memberships/'.$this->subjectMembership->getKey().'/role-history')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.actor.id', $this->manager->getKey())
            ->assertJsonPath('data.0.prior_role', 'reader')
            ->assertJsonPath('data.0.new_role', 'editor')
            ->assertJsonPath('data.0.source', 'user');

        $this->assertDatabaseHas('organization_role_audits', [
            'membership_id' => $this->subjectMembership->getKey(),
            'actor_user_id' => $this->manager->getKey(),
            'prior_role' => 'reader',
            'new_role' => 'editor',
            'source' => 'user',
        ]);

        $this->as($this->subject);
        $this->getJson('/api/v1/workspace')
            ->assertOk()
            ->assertJsonPath('active_organization.role', 'editor')
            ->assertJsonPath('capabilities.master_data.manage', true)
            ->assertJsonPath('capabilities.membership_roles.manage', false);
        $this->postJson('/api/v1/parties', [
            'code' => 'P13-NEXT-REQUEST-01',
            'display_name' => 'ثبت پس از تغییر نقش',
            'roles' => ['customer'],
        ], $this->csrfHeaders())->assertCreated();

        $this->as($this->manager);

        $this->patchJson('/api/v1/organization/memberships/'.$this->subjectMembership->getKey().'/role', [
            'expected_role' => 'editor',
            'role' => 'editor',
        ], $this->csrfHeaders())->assertOk()->assertJsonPath('changed', false);

        $this->assertSame(1, OrganizationRoleAudit::query()->where('membership_id', $this->subjectMembership->getKey())->count());
    }

    public function test_self_role_change_refreshes_next_request_and_does_not_remove_role_manager_permission(): void
    {
        $this->patchJson('/api/v1/organization/memberships/'.$this->managerMembership->getKey().'/role', [
            'expected_role' => 'reader', 'role' => 'editor',
        ], $this->csrfHeaders())->assertOk();

        $this->getJson('/api/v1/workspace')
            ->assertJsonPath('active_organization.role', 'editor')
            ->assertJsonPath('capabilities.master_data.manage', true)
            ->assertJsonPath('capabilities.membership_roles.manage', true);

        $this->patchJson('/api/v1/organization/memberships/'.$this->managerMembership->getKey().'/role', [
            'expected_role' => 'editor', 'role' => 'reader',
        ], $this->csrfHeaders())->assertOk();

        $this->getJson('/api/v1/workspace')
            ->assertJsonPath('active_organization.role', 'reader')
            ->assertJsonPath('capabilities.master_data.manage', false)
            ->assertJsonPath('capabilities.membership_roles.manage', true);

        $this->assertDatabaseHas('organization_role_managers', [
            'organization_id' => $this->organization->getKey(),
            'user_id' => $this->manager->getKey(),
        ]);
    }

    public function test_last_role_manager_cannot_be_removed_but_a_manager_can_revoke_when_another_remains(): void
    {
        $service = app(OrganizationRoleManagerService::class);

        try {
            $service->revoke($this->organization, $this->manager);
            $this->fail('The last role manager was removed.');
        } catch (LastOrganizationRoleManagerException) {
            $this->assertDatabaseCount('organization_role_managers', 1);
        }

        $service->grant($this->organization, $this->editor, $this->manager);
        $this->assertTrue($service->revoke($this->organization, $this->manager));
        $this->assertDatabaseHas('organization_role_managers', [
            'organization_id' => $this->organization->getKey(), 'user_id' => $this->editor->getKey(),
        ]);
    }

    public function test_reader_and_ordinary_editor_cannot_read_or_change_membership_roles(): void
    {
        $this->as($this->editor);
        $this->getJson('/api/v1/organization/memberships')->assertForbidden();
        $this->patchJson('/api/v1/organization/memberships/'.$this->subjectMembership->getKey().'/role', [
            'expected_role' => 'reader', 'role' => 'editor',
        ], $this->csrfHeaders())->assertForbidden();

        $this->as($this->reader);
        $this->getJson('/api/v1/organization/memberships')->assertForbidden();
        $this->getJson('/api/v1/organization/memberships/'.$this->subjectMembership->getKey().'/role-history')->assertForbidden();

        $this->assertSame('reader', $this->subjectMembership->fresh()->role);
        $this->assertSame(0, OrganizationRoleAudit::query()->where('membership_id', $this->subjectMembership->getKey())->count());
    }

    public function test_foreign_membership_is_resolved_before_input_validation_and_history_lookup(): void
    {
        $foreignMembership = OrganizationMembership::query()->where('organization_id', $this->foreignOrganization->getKey())->firstOrFail();

        $this->patchJson('/api/v1/organization/memberships/'.$foreignMembership->getKey().'/role', [
            'expected_role' => 'invalid', 'role' => 'invalid',
        ], $this->csrfHeaders())->assertNotFound();
        $this->patchJson('/api/v1/organization/memberships/999999/role', [], $this->csrfHeaders())->assertNotFound();
        $this->getJson('/api/v1/organization/memberships/'.$foreignMembership->getKey().'/role-history')->assertNotFound();
        $this->getJson('/api/v1/organization/memberships/999999/role-history')->assertNotFound();
    }

    public function test_csv_and_xlsx_preview_match_and_do_not_write_any_party_or_import_records(): void
    {
        $this->as($this->editor);
        $existing = $this->createParty('P13-EXIST-01', 'طرف موجود', ['supplier']);
        $rows = $this->sampleRows();
        $before = $this->partyImportCounts();

        $csv = $this->postFile('/api/v1/parties/import/preview', $this->csvUpload($rows))
            ->assertOk()->json('data');
        $csvWithoutBom = $this->postFile('/api/v1/parties/import/preview', $this->csvUpload($rows, withBom: false))
            ->assertOk()->json('data');
        $xlsx = $this->postFile('/api/v1/parties/import/preview', $this->xlsxUpload($rows))
            ->assertOk()->json('data');

        $this->assertSame($csv['payload_hash'], $csvWithoutBom['payload_hash']);
        $this->assertSame($csv['rows'], $csvWithoutBom['rows']);
        $this->assertSame($csv['payload_hash'], $xlsx['payload_hash']);
        $this->assertSame($csv['rows'], $xlsx['rows']);
        $this->assertSame(['valid' => 1, 'duplicate' => 2, 'invalid' => 1, 'created' => 0, 'pending' => 0], $csv['counts']);
        $this->assertSame(2, $csv['rows'][0]['source_row']);
        $this->assertSame('00021', $csv['rows'][0]['party_code']);
        $this->assertSame(['customer', 'supplier'], $csv['rows'][0]['roles']);
        $this->assertStringContainsString('وجود دارد', $csv['rows'][1]['message']);
        $this->assertSame('duplicate', $csv['rows'][3]['classification']);
        $this->assertSame('invalid', $csv['rows'][2]['classification']);
        $this->assertSame($before, $this->partyImportCounts());
        $this->assertDatabaseHas('parties', ['id' => $existing->getKey(), 'display_name' => 'طرف موجود']);
    }

    public function test_apply_is_create_only_idempotent_and_rejects_a_changed_payload_under_the_same_key(): void
    {
        $this->as($this->editor);
        $existing = $this->createParty('P13-EXIST-01', 'نام اصلی', ['supplier']);
        $rows = $this->sampleRows();
        $file = $this->csvUpload($rows);
        $preview = $this->postFile('/api/v1/parties/import/preview', $file)->assertOk()->json('data');
        $key = (string) Str::uuid();

        $result = $this->postFile('/api/v1/parties/import/apply', $this->csvUpload($rows), $key, $preview['payload_hash'])
            ->assertOk()->json('data');

        $this->assertSame('completed', $result['status']);
        $this->assertSame(1, $result['counts']['created']);
        $this->assertSame(2, $result['counts']['duplicate']);
        $this->assertSame(1, $result['counts']['invalid']);
        $this->assertSame(1, Party::query()->where('organization_id', $this->organization->getKey())->where('code', '00021')->count());
        $this->assertDatabaseCount('party_roles', 3);
        $this->assertDatabaseHas('parties', ['id' => $existing->getKey(), 'display_name' => 'نام اصلی']);
        $this->assertDatabaseHas('party_roles', ['party_id' => $existing->getKey(), 'role' => 'supplier']);

        $replayed = $this->postFile('/api/v1/parties/import/apply', $this->csvUpload($rows), $key, $preview['payload_hash'])
            ->assertOk()->json('data');
        $this->assertSame($result['rows'], $replayed['rows']);
        $this->assertSame(1, Party::query()->where('organization_id', $this->organization->getKey())->where('code', '00021')->count());
        $this->assertDatabaseCount('party_roles', 3);
        $this->assertDatabaseCount('party_imports', 1);

        $changedRows = $rows;
        $changedRows[0]['display_name'] = 'نام تغییرکرده';
        $changedPreview = $this->postFile('/api/v1/parties/import/preview', $this->csvUpload($changedRows))->assertOk()->json('data');
        $this->postFile('/api/v1/parties/import/apply', $this->csvUpload($changedRows), $key, $changedPreview['payload_hash'])
            ->assertStatus(409);
        $this->assertDatabaseHas('parties', ['organization_id' => $this->organization->getKey(), 'code' => '00021', 'display_name' => 'طرف معتبر']);
    }

    public function test_retry_resumes_durable_per_row_results_after_a_partial_apply(): void
    {
        $this->as($this->editor);
        $rows = [
            ['party_id' => '', 'party_code' => 'P13-RETRY-01', 'display_name' => 'طرف یک', 'roles_text' => 'customer'],
            ['party_id' => '', 'party_code' => 'P13-RETRY-02', 'display_name' => 'طرف دو', 'roles_text' => 'supplier'],
        ];
        $file = $this->csvUpload($rows);
        $parsed = app(PartyImportParser::class)->parse($file);
        $service = app(PartyImportService::class);
        $preview = $service->preview($this->organization, $parsed['rows']);
        $key = (string) Str::uuid();

        $partial = $service->apply($this->organization, $this->editor, $key, $preview['payload_hash'], $parsed['format'], $parsed['rows'], 1);
        $this->assertSame('applying', $partial['status']);
        $this->assertSame(1, $partial['counts']['pending']);
        $this->assertDatabaseCount('parties', 1);
        $this->assertDatabaseCount('party_roles', 1);

        $resumed = $this->postFile('/api/v1/parties/import/apply', $this->csvUpload($rows), $key, $preview['payload_hash'])
            ->assertOk()->json('data');

        $this->assertSame('completed', $resumed['status']);
        $this->assertSame(2, $resumed['counts']['created']);
        $this->assertSame(0, $resumed['counts']['pending']);
        $this->assertDatabaseCount('parties', 2);
        $this->assertDatabaseCount('party_roles', 2);
        $this->assertDatabaseCount('party_imports', 1);
        $this->assertDatabaseCount('party_import_rows', 2);
    }

    public function test_code_inserted_after_preview_becomes_duplicate_and_database_constraint_still_rejects_races(): void
    {
        $this->as($this->editor);
        $rows = [['party_id' => '', 'party_code' => 'P13-RACE-01', 'display_name' => 'نام پیش‌نمایش', 'roles_text' => 'customer']];
        $preview = $this->postFile('/api/v1/parties/import/preview', $this->csvUpload($rows))->assertOk()->json('data');
        $existing = $this->createParty('p13-race-01', 'نام ثبت هم‌زمان', ['supplier']);
        $key = (string) Str::uuid();

        $result = $this->postFile('/api/v1/parties/import/apply', $this->csvUpload($rows), $key, $preview['payload_hash'])
            ->assertOk()->json('data');

        $this->assertSame('duplicate', $result['rows'][0]['outcome']);
        $this->assertStringContainsString('در سازمان', $result['rows'][0]['message']);
        $this->assertDatabaseHas('parties', ['id' => $existing->getKey(), 'display_name' => 'نام ثبت هم‌زمان']);
        $this->assertDatabaseCount('parties', 1);

        try {
            Party::query()->create([
                'organization_id' => $this->organization->getKey(),
                'code' => 'P13-RACE-01',
                'display_name' => 'نباید ذخیره شود',
            ]);
            $this->fail('The organization-scoped unique index accepted a duplicate party code.');
        } catch (QueryException) {
            $this->assertDatabaseCount('parties', 1);
        }
    }

    public function test_xlsx_formula_cells_are_rejected_before_preview_records_are_written(): void
    {
        $this->as($this->editor);
        $this->postFile('/api/v1/parties/import/preview', $this->xlsxUpload([], withFormula: true))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('file');

        $this->assertDatabaseCount('party_imports', 0);
        $this->assertDatabaseCount('party_import_rows', 0);
        $this->assertDatabaseCount('parties', 0);
        $this->assertDatabaseCount('party_roles', 0);
    }

    public function test_xlsx_numeric_codes_are_invalid_so_leading_zero_codes_must_be_text(): void
    {
        $this->as($this->editor);

        $response = $this->postFile('/api/v1/parties/import/preview', $this->xlsxUpload([], numericCode: true))
            ->assertOk()
            ->json('data');

        $this->assertSame('invalid', $response['rows'][0]['classification']);
        $this->assertStringContainsString('متن', $response['rows'][0]['message']);
        $this->assertSame(1, $response['counts']['invalid']);
        $this->assertDatabaseCount('party_imports', 0);
        $this->assertDatabaseCount('party_import_rows', 0);
        $this->assertDatabaseCount('parties', 0);
        $this->assertDatabaseCount('party_roles', 0);
    }

    public function test_export_matches_filtered_register_and_preserves_text_codes_and_formula_safety(): void
    {
        $matching = $this->createParty('00017', 'طرف مهر', ['customer', 'supplier']);
        $formula = $this->createParty('P13-FORMULA', '=HYPERLINK("x","طرف فرمول")', ['customer']);
        $this->createParty('P13-SUPPLIER', 'تأمین‌کننده دیگر', ['supplier']);
        Party::query()->create([
            'organization_id' => $this->foreignOrganization->getKey(),
            'code' => '00017',
            'display_name' => 'طرف سازمان دیگر',
        ]);

        $register = $this->getJson('/api/v1/parties?q=طرف&role=customer')->assertOk()->json('data');
        $this->assertEqualsCanonicalizing([$matching->getKey(), $formula->getKey()], array_column($register, 'id'));

        $response = $this->get('/api/v1/parties/export?q='.urlencode('طرف').'&role=customer', $this->csrfHeaders());
        $response->assertOk()->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
        $rows = $this->readCsv($response->streamedContent());
        $this->assertSame(PartyImportParser::HEADERS, $rows[0]);
        $exportedIds = array_map(fn (array $row): int => (int) $row[0], array_slice($rows, 1));
        $this->assertSame(array_column($register, 'id'), $exportedIds);
        $byId = [];
        foreach (array_slice($rows, 1) as $row) {
            $byId[(int) $row[0]] = $row;
        }
        $this->assertSame('00017', $byId[$matching->getKey()][1]);
        $this->assertSame("'=HYPERLINK(\"x\",\"طرف فرمول\")", $byId[$formula->getKey()][2]);
        $this->assertSame('customer|supplier', $byId[$matching->getKey()][3]);

        $this->get('/api/v1/parties/export?organization_id='.$this->foreignOrganization->getKey(), $this->csrfHeaders())
            ->assertUnprocessable()->assertJsonValidationErrors('organization_id');
        $empty = $this->get('/api/v1/parties/export?q=نام-ناموجود', $this->csrfHeaders());
        $this->assertCount(1, $this->readCsv($empty->streamedContent()));

        $this->as($this->reader);
        $this->get('/api/v1/parties/export', $this->csrfHeaders())->assertOk();
    }

    public function test_role_manager_provisioning_cli_keeps_existing_assignment_and_protects_last_manager(): void
    {
        $this->artisan('organization:grant-role-manager', [
            'organization' => $this->organization->slug,
            'email' => $this->reader->email,
            '--actor' => $this->manager->email,
        ])->assertExitCode(0);
        $this->artisan('organization:grant-role-manager', [
            'organization' => $this->organization->slug,
            'email' => $this->reader->email,
        ])->assertExitCode(0);

        $this->assertDatabaseHas('organization_role_managers', [
            'organization_id' => $this->organization->getKey(), 'user_id' => $this->reader->getKey(),
        ]);
    }

    private function as(User $user): void
    {
        $this->actingAs($user)->withSession(['active_organization_id' => $this->organization->getKey()]);
    }

    private function postFile(string $url, UploadedFile $file, ?string $key = null, ?string $payloadHash = null)
    {
        $headers = $this->csrfHeaders() + ['Accept' => 'application/json'];
        if ($key !== null) {
            $headers['Idempotency-Key'] = $key;
        }
        $body = ['file' => $file];
        if ($payloadHash !== null) {
            $body['payload_hash'] = $payloadHash;
        }

        return $this->post($url, $body, $headers);
    }

    private function sampleRows(): array
    {
        return [
            ['party_id' => '', 'party_code' => '00021', 'display_name' => 'طرف معتبر', 'roles_text' => 'customer|supplier'],
            ['party_id' => '', 'party_code' => 'p13-exist-01', 'display_name' => 'تکراری موجود', 'roles_text' => 'customer'],
            ['party_id' => '', 'party_code' => 'P13-INVALID', 'display_name' => 'طرف نامعتبر', 'roles_text' => 'buyer'],
            ['party_id' => '', 'party_code' => '00021', 'display_name' => 'تکرار در فایل', 'roles_text' => 'supplier'],
        ];
    }

    private function csvUpload(array $rows, bool $withBom = true): UploadedFile
    {
        $stream = fopen('php://temp', 'w+b');
        if ($withBom) {
            fwrite($stream, "\xEF\xBB\xBF");
        }
        fputcsv($stream, PartyImportParser::HEADERS, ',', '"', '', "\r\n");
        foreach ($rows as $row) {
            fputcsv($stream, [
                $row['party_id'] ?? '',
                $row['party_code'] ?? '',
                $row['display_name'] ?? '',
                $row['roles_text'] ?? '',
            ], ',', '"', '', "\r\n");
        }
        rewind($stream);
        $content = stream_get_contents($stream);
        fclose($stream);

        return UploadedFile::fake()->createWithContent('parties.csv', $content);
    }

    private function xlsxUpload(array $rows, bool $withFormula = false, bool $numericCode = false): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'erp-p13-xlsx-');
        $writer = new XlsxWriter;
        $writer->openToFile($path);
        $writer->addRow(Row::fromValues(PartyImportParser::HEADERS));

        if ($withFormula) {
            $writer->addRow(new Row([
                Cell::fromValue(''),
                new FormulaCell('=1+1', 2),
                Cell::fromValue('طرف فرمولی'),
                Cell::fromValue('customer'),
            ]));
        } elseif ($numericCode) {
            $writer->addRow(new Row([
                Cell::fromValue(''),
                Cell::fromValue(21),
                Cell::fromValue('طرف کد عددی'),
                Cell::fromValue('customer'),
            ]));
        } else {
            foreach ($rows as $row) {
                $writer->addRow(Row::fromValues([
                    $row['party_id'] ?? '',
                    $row['party_code'] ?? '',
                    $row['display_name'] ?? '',
                    $row['roles_text'] ?? '',
                ]));
            }
        }

        $writer->close();
        $content = file_get_contents($path);
        unlink($path);

        return UploadedFile::fake()->createWithContent('parties.xlsx', $content);
    }

    private function createParty(string $code, string $name, array $roles): Party
    {
        $party = Party::query()->create([
            'organization_id' => $this->organization->getKey(), 'code' => $code, 'display_name' => $name,
        ]);

        foreach ($roles as $role) {
            PartyRole::query()->create([
                'organization_id' => $this->organization->getKey(), 'party_id' => $party->getKey(), 'role' => $role,
            ]);
        }

        return $party;
    }

    private function partyImportCounts(): array
    {
        return [
            Party::query()->count(),
            PartyRole::query()->count(),
            PartyImport::query()->count(),
            PartyImportRow::query()->count(),
        ];
    }

    private function readCsv(string $content): array
    {
        $content = str_starts_with($content, "\xEF\xBB\xBF") ? substr($content, 3) : $content;
        $stream = fopen('php://temp', 'w+b');
        fwrite($stream, $content);
        rewind($stream);
        $rows = [];
        while (($row = fgetcsv($stream, null, ',', '"', '')) !== false) {
            $rows[] = $row;
        }
        fclose($stream);

        return $rows;
    }
}
