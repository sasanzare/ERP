<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\PartyRole;
use App\Services\Parties\PartyImportParser;
use App\Services\Parties\PartyImportService;
use App\Services\Parties\PartyRegisterQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PartyDataExchangeController extends Controller
{
    public function __construct(
        private readonly PartyImportParser $parser,
        private readonly PartyImportService $imports,
        private readonly PartyRegisterQuery $register,
    ) {}

    public function preview(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        Gate::authorize('manageMasterData', $organization);
        $this->rejectOrganizationOverride($request);
        $file = $this->validatedFile($request);
        $parsed = $this->parser->parse($file);
        $preview = $this->imports->preview($organization, $parsed['rows']);

        return response()->json(['data' => [
            'payload_hash' => $preview['payload_hash'],
            'counts' => $preview['counts'],
            'rows' => $this->publicRows($preview['rows']),
        ]]);
    }

    public function apply(Request $request): JsonResponse
    {
        $organization = $this->activeOrganization($request);
        Gate::authorize('manageMasterData', $organization);
        $this->rejectOrganizationOverride($request);

        $validated = $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt,xlsx', 'max:5120'],
            'payload_hash' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/'],
        ]);
        $key = (string) $request->header('Idempotency-Key', '');

        validator(['import_key' => $key], ['import_key' => ['required', 'uuid']])->validate();

        /** @var UploadedFile $file */
        $file = $validated['file'];
        $parsed = $this->parser->parse($file);
        $result = $this->imports->apply(
            $organization,
            $request->user(),
            $key,
            $validated['payload_hash'],
            $parsed['format'],
            $parsed['rows'],
        );

        return response()->json(['data' => $result]);
    }

    public function export(Request $request): StreamedResponse
    {
        $organization = $this->activeOrganization($request);
        $this->rejectOrganizationQueryOverride($request);
        $validated = $request->validate([
            'q' => ['sometimes', 'nullable', 'string', 'max:120'],
            'role' => ['sometimes', 'nullable', Rule::in(['customer', 'supplier'])],
        ]);

        $query = $this->register->make($organization, (string) ($validated['q'] ?? ''), $validated['role'] ?? null)
            ->select(['parties.id', 'parties.code', 'parties.display_name'])
            ->selectSub(
                PartyRole::query()
                    ->selectRaw("GROUP_CONCAT(role ORDER BY role SEPARATOR '|')")
                    ->whereColumn('party_roles.organization_id', 'parties.organization_id')
                    ->whereColumn('party_roles.party_id', 'parties.id'),
                'roles_text',
            )
            ->orderBy('parties.display_name')
            ->orderBy('parties.id');

        return response()->streamDownload(function () use ($query): void {
            $stream = fopen('php://output', 'wb');
            fwrite($stream, "\xEF\xBB\xBF");
            fputcsv($stream, PartyImportParser::HEADERS, ',', '"', '', "\r\n");

            foreach ($query->cursor() as $party) {
                fputcsv($stream, [
                    (string) $party->id,
                    $this->spreadsheetSafe((string) $party->code),
                    $this->spreadsheetSafe((string) $party->display_name),
                    (string) ($party->roles_text ?? ''),
                ], ',', '"', '', "\r\n");
            }

            fclose($stream);
        }, 'parties-'.now()->format('Ymd-His').'.csv', [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function template(Request $request): StreamedResponse
    {
        $this->activeOrganization($request);

        return response()->streamDownload(function (): void {
            $stream = fopen('php://output', 'wb');
            fwrite($stream, "\xEF\xBB\xBF");
            fputcsv($stream, PartyImportParser::HEADERS, ',', '"', '', "\r\n");
            fclose($stream);
        }, 'party-import-template.csv', [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function activeOrganization(Request $request): Organization
    {
        $organization = $request->attributes->get('activeOrganization');
        abort_unless($organization instanceof Organization, 403);
        Gate::authorize('viewMasterData', $organization);

        return $organization;
    }

    private function validatedFile(Request $request): UploadedFile
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt,xlsx', 'max:5120'],
        ]);

        return $validated['file'];
    }

    private function publicRows(array $rows): array
    {
        return array_map(fn (array $row): array => [
            'source_row' => $row['source_row'],
            'source_party_id' => $row['source_party_id'],
            'party_code' => $row['party_code'],
            'display_name' => $row['display_name'],
            'roles' => $row['roles'],
            'roles_text' => $row['roles_text'],
            'classification' => $row['classification'],
            'message' => $row['message'],
        ], $rows);
    }

    private function spreadsheetSafe(string $value): string
    {
        return preg_match('/^[\p{Z}\x00-\x20]*[=+\-@]/u', $value) === 1 ? "'".$value : $value;
    }

    private function rejectOrganizationOverride(Request $request): void
    {
        if (array_key_exists('organization_id', $request->all())) {
            throw ValidationException::withMessages([
                'organization_id' => 'سازمان از نشست فعال تعیین می‌شود و از درخواست پذیرفته نمی‌شود.',
            ]);
        }
    }

    private function rejectOrganizationQueryOverride(Request $request): void
    {
        if ($request->query->has('organization_id')) {
            throw ValidationException::withMessages([
                'organization_id' => 'خروجی فقط از سازمان فعال نشست ساخته می‌شود.',
            ]);
        }
    }
}
