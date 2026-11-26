# ERP

Local-development ERP prototype. P01 established the product API, P02 added the Persian RTL workspace, P03 added session sign-in and organization-scoped access, P04 added shared master data, P05 added sales documents, P06 added stock operations and reservations, P07 added sales-order fulfillment, P08 added purchasing/receipts, P09 adds a manual balanced accounting engine, P10 adds the approved local synthetic settlement path, and P11 adds a reconciled read-only dashboard and repeatable synthetic walkthrough. The application reads synthetic data from MariaDB in Docker Compose. The application root is this directory.

## Local requirements

- PHP 8.3–8.5 per Laravel 13's published support range, with `pdo_mysql` enabled. This machine uses PHP 8.5.13 at `C:\php8.5\php.exe`.
- Composer PHAR. This machine uses `C:\Users\moxfo\composer.phar`.
- Node.js 20.19+ (this machine uses Node 26.13.1) and npm (11.17.0).
- Docker Desktop with the Docker Engine available to the current Windows user.

Resolved versions in the current lockfiles: Laravel Framework 13.43.0, React/React DOM 19.3.1, Vite 8.3.8, TypeScript 5.9.3, and `@vitejs/plugin-react` 5.2.0. The configured MariaDB image is `mariadb:11.8.9-noble` (the running server reports 11.8.9).

On this Windows host, the ordinary shell receives `permission denied` on Docker Desktop's Engine pipe. Open **PowerShell as Administrator** for the initializer and Docker Compose commands below. In the Codex sandbox, host loopback access for PHP/Vite also required elevated launch. No Windows group membership or security setting was changed.

## First setup

First install the locked dependencies from a regular PowerShell in the repository root:

```powershell
Set-Location 'D:\All projects\ERP'
$env:ERP_PHP_BINARY = 'C:\php8.5\php.exe'
& $env:ERP_PHP_BINARY 'C:\Users\moxfo\composer.phar' install
npm ci
```

Then open **PowerShell as Administrator** and run the initializer from the repository root. It creates ignored local `.env` and `.env.testing` files with random database credentials, starts MariaDB, applies migrations, seeds the synthetic product, and provisions repeatable P03 memberships plus P04 master-data fixtures. Demo passwords stay in an ignored local file.

```powershell
Set-Location 'D:\All projects\ERP'
$env:ERP_PHP_BINARY = 'C:\php8.5\php.exe'
.\scripts\Initialize-Local.ps1
```

The database uses the official `mariadb:11.8.9-noble` image. Development access is scoped to `erp_dev`; tests use the separate `erp_test` schema and `erp_test` user. The published port defaults to `127.0.0.1:3307`, leaving 3306 available for XAMPP. The Compose named volume persists the database across container restarts.

## Daily development

In **Administrator PowerShell**, start MariaDB:

```powershell
Set-Location 'D:\All projects\ERP'
$env:ERP_PHP_BINARY = 'C:\php8.5\php.exe'
docker compose up -d --wait db
```

In one regular PowerShell, run both web servers:

```powershell
Set-Location 'D:\All projects\ERP'
$env:ERP_PHP_BINARY = 'C:\php8.5\php.exe'
npm run dev
```

`npm run dev` starts Laravel at `127.0.0.1:8000` and Vite at `127.0.0.1:5173` in the same terminal; press `Ctrl+C` there to stop both. It does not start or stop Docker. If `ERP_PHP_BINARY` is unset, the launcher uses `C:\php8.5\php.exe`.

Open [http://127.0.0.1:8000/products](http://127.0.0.1:8000/products). The root `/` also opens the product register, `/products/{id}` opens a product detail, and the React page fetches `/api/v1/products` from the same origin.

The Persian RTL UI uses the locally bundled IRANSansX and IRANSansXFaNum WOFF2 weights from `resources/fonts/iran-sans-x/`; `npm run build` bundles them for production assets. Latin identifiers retain their existing LTR/monospace presentation.

## P03 local sign-in and organization provisioning

The local initializer runs the forward migrations, seeds the existing product, then invokes `php artisan p03:provision-demo`. That existing command now also runs the repeatable P04 master-data seeder. For an already initialized development database, run these commands from the repository root in Administrator PowerShell after starting the existing MariaDB service:

```powershell
$env:ERP_PHP_BINARY = 'C:\php8.5\php.exe'
& $env:ERP_PHP_BINARY artisan migrate --force
& $env:ERP_PHP_BINARY artisan db:seed --force
& $env:ERP_PHP_BINARY artisan p03:provision-demo
```

Provisioning is repeatable. It creates the synthetic organizations and memberships, preserves the existing `DEMO-001` product, and writes generated demo passwords once to the ignored local file `storage/app/private/p03-demo-credentials.json`. The command does not print passwords. Keep that file local; if it is missing while either demo account exists, provisioning stops without resetting account passwords.

Open [http://127.0.0.1:8000/sign-in](http://127.0.0.1:8000/sign-in) and read the local credentials file on this machine. The existing product register and numeric detail routes require a session. Organization selection, sign-in, product updates, and sign-out use same-origin requests; each state-changing request must include the matching session CSRF token in `X-CSRF-TOKEN` (same-origin request metadata alone is not sufficient).

The browser acceptance script requires the local Laravel/Vite servers, MariaDB, the ignored credentials file, and installed Google Chrome. It drives a fresh isolated Chrome profile through the register, detail, role, switch, edit, and logout paths; it restores product ID 1 to its starting Persian name before finishing.

```powershell
node scripts/Verify-P03Browser.mjs
```

| Account | «سازمان پیش‌فرض» (`legacy-local`) | «سازمان آزمایشی ب» (`demo-organization-b`) |
| --- | --- | --- |
| `editor@erp.local` | `editor` | `reader` |
| `reader@erp.local` | `reader` | No membership |

`reader` can view products. `editor` can view and rename the display name of products. Roles belong to memberships, so the same editor account is read-only in the second organization. Both organizations contain a `DEMO-001` product; product codes are unique within each organization.

To assign or change a local demo membership role, use the server-side audited action:

```powershell
& $env:ERP_PHP_BINARY artisan organization:assign-role legacy-local reader@erp.local reader
```

An optional `--actor=<email>` records an existing user as the actor; without it, the audit row records the explicit `system` source. Reapplying an unchanged role does not add another audit row.

## Safe shutdown and checks

Stop both Laravel and Vite with `Ctrl+C` in the terminal running `npm run dev`. In **Administrator PowerShell**, stop MariaDB without deleting its persistent volume:

```powershell
docker compose stop db
```

Run checks from the repository root. If this shell cannot connect to the local DB socket, use **Administrator PowerShell** for `php artisan test`:

```powershell
Set-Location 'D:\All projects\ERP'
$env:ERP_PHP_BINARY = 'C:\php8.5\php.exe'
& $env:ERP_PHP_BINARY artisan test
npm run typecheck
npm run build
```

The base test case reads `.env.testing` and verifies the local MariaDB connection, loopback host, matching published port, `erp_test` schema, and `erp_test` user before Laravel's database-refresh helpers run. A non-destructive unit test verifies that the guard rejects `erp_dev`.

To change the host database port, update `DB_FORWARD_PORT` in the ignored `.env` and rerun `scripts/Initialize-Local.ps1` so Laravel and the test configuration use the same port. Never reset the development schema to test the guard.

## P01 verification

**Status: ACCEPTED (2026-11-20).** MariaDB 11.8.9 is healthy; migrations applied; two consecutive seeder runs left one `DEMO-001` row (ID 1). `GET /api/v1/products` returned HTTP 200 with the stored record, and the same ID remained after a DB container restart without reseeding. PHPUnit passed 5 tests / 7 assertions, including the `erp_test` feature test and non-destructive rejection of `erp_dev`. TypeScript and production asset builds passed. Browser checks passed at 1280×900 and 390×844; the page rendered the Persian name and code without horizontal overflow, and empty, failure/retry, SVG fallback, and reduced-transparency fallback states were checked.

## P02 verification

**Status: ACCEPTED (2026-11-20).** The live register at `/products` and numeric detail route use the existing MariaDB-backed product API. The final mobile detail check measured a 17.31 CSS px gap above the bottom dock at 390×844, with zero horizontal overflow. The register and dialog screenshots, keyboard behavior, and prior TypeScript, Vite, and guarded Laravel checks are recorded in the [UI design reference](docs/UI_DESIGN.md#verification-evidence) and [handoff](HANDOFF.md).

## P03 verification

**Status: ACCEPTED (2026-11-20).** Three forward migrations ran on the existing `erp_dev` schema. The existing product stayed ID 1, `DEMO-001`, «کالای نمونه» and was backfilled to «سازمان پیش‌فرض»; a second organization has its own `DEMO-001`. Provisioning twice kept 2 organizations, 3 memberships, 3 initial role-audit rows, and 2 products. The guarded MariaDB suite passed 27 tests / 94 assertions; TypeScript, Vite build, and changed PHP style checks passed. Google Chrome verified generic failed login, successful session-cookie login, CSRF rejection, editor rename/refresh, reader denial without row changes, organization switching, foreign-ID hiding, logout, product filtering and quick view. Desktop 1280×900 and mobile 390×844 screenshots are linked from the [UI design reference](docs/UI_DESIGN.md#p03-verification-evidence); mobile detail had 0 horizontal overflow and 51.31 px clearance above the dock. See [HANDOFF.md](HANDOFF.md) for full validation and remaining environment limits.

## P04 shared master data

`p03:provision-demo` now also provisions repeatable P04 examples: one party that is both customer and supplier, units, a priceable product, two warehouses and locations, and two price lists. It uses `firstOrCreate` so reruns do not duplicate these records. Existing products ID 1 and 2 were preserved by migration 000005; their unit is intentionally unknown (`NULL`) until assigned.

The shared registers and forms are available at:

- `/parties` — filter by customer or supplier role; one party can hold both roles under the same ID.
- `/units`, `/products`, `/warehouses`, `/locations`, and `/price-lists` — editor-only create/update actions; readers retain scoped read access.
- `/products/{id}` — preserves product detail/name editing and adds code/base-unit editing. `GET /api/v1/products` retains `{ data: [{ id, code, name }] }`, and name-only PATCH remains supported.

Price-list detail resolves prices for the explicitly selected list and product. Amounts are stored as exact unsigned integer rials, serialized as strings, and labeled «ریال» in Persian. A missing entry is shown as unpriced. Unit conversions, discounts, and order/quote price snapshots are outside P04.

Location choices are filtered by their warehouse. `POST /api/v1/locations/validate-selection` checks the warehouse/location pair on the server and rejects a location from another warehouse.

**Status: ACCEPTED (2026-11-21).** The final guarded Laravel suite passed 36 tests / 213 assertions on `erp_test`; TypeScript, Vite build, PHP syntax, and Pint checks passed. The additive migration preserved development product IDs, owners, codes, and names. The P04-only rollback/reapply rehearsal ran on `erp_test`. Repeat provisioning kept 2 organizations, 3 memberships, 3 role-audit rows, 3 products, 1 party with 2 roles, 3 units, 2 warehouses, 2 locations, 2 price lists, and 2 price entries. Google Chrome acceptance passed at 1280×900 and 390×844 plus forced glass fallback, with zero uncaught browser errors and no root mobile horizontal overflow. See [P04 UI evidence](docs/UI_DESIGN.md#p04-verification-evidence) and [HANDOFF.md](HANDOFF.md) for details.

For a repeat browser run, start the local Laravel, Vite, and MariaDB services and run `node scripts/Verify-P04Browser.mjs`. It uses the ignored demo credentials locally and saves synthetic screenshots under `docs/screenshots/`.

## P05 lead to confirmed sales order

The existing `p03:provision-demo` command also provisions a repeatable P05 sales fixture under «سازمان پیش‌فرض»: two products with known base units and a dedicated quote price list. It creates missing P05 records with `firstOrCreate` and does not replace the existing P04 products, prices, or ownership.

Apply the forward migration to an existing local database and then provision the P05 fixture:

```powershell
$env:ERP_PHP_BINARY = 'C:\php8.5\php.exe'
& $env:ERP_PHP_BINARY artisan migrate --force
& $env:ERP_PHP_BINARY artisan p03:provision-demo
```

P04 price-list values stay stored in whole rials. P05 sales documents display toman: each selected rial amount is copied exactly as tenths of a toman, and each discounted line is rounded once to a whole toman using half-up rounding. The P05 fixture list therefore stores 1,200,000 and 1,350,000 rials, which appear in sales documents as 120,000.0 and 135,000.0 toman. A line with no list entry or no product base unit is rejected; a deliberately saved zero price is valid.

The sales workspace is available at `/leads`, `/follow-ups`, `/quotes`, and `/orders`. Start the local database and `npm run dev` as described above, then use the editor account to create a lead, add a dated activity, create a draft from the lead, add/reprice its lines, confirm it, and convert it to one sales order. Reader accounts can view these records but cannot write. P05 does not reserve stock or fulfill orders.

The P05 Chrome harness is `node scripts/Verify-P05Browser.mjs`; it uses the ignored demo credentials in an isolated Chrome profile and stores synthetic screenshots under `docs/screenshots/`. The exact API, precision, snapshot, and order-line interface are documented in [P05 sales workflow](docs/okf/architecture/p05-sales-workflow.md) and [P05 data/pricing](docs/okf/data/p05-sales-documents.md).

**P05 status: ACCEPTED (2026-11-21).** The guarded Laravel suite passed 45 tests / 363 assertions; TypeScript, production build, changed-file Pint, and PHP syntax checks passed. The P05-only rollback/reapply rehearsal on `erp_test` preserved the P04 layer. Google Chrome verified the journey at 1280×900 and 390×844, keyboard submission, and forced bright fallback. A MariaDB row-lock contention check returned the same order for both conversion requests (201/200), with one order and two copied lines. Price-list edits left both document snapshots at 178,831 toman; the demo list price was restored afterward. See the [P05 UI evidence](docs/UI_DESIGN.md#p05-sales-workflow-evidence) and [handoff](HANDOFF.md) for the synthetic local records and detailed run results.

## P06 trustworthy stock balances

P06 provides `/stock` for physical/reserved/available balances, `/stock/movements` for the immutable operation journal, and `/stock/reservations` for open/released reservations. Editors can post opening stock, receipts, issues, location transfers, and reservations/releases. Readers retain organization-scoped read access. Operations and reservations require `Idempotency-Key`; writes use the session, active organization, explicit CSRF token, and `manageStock` authorization.

Quantities are decimal strings with up to three fractional digits, stored as integer thousandths up to `999999999.999`. Physical stock is derived from inbound/outbound movement legs; reserved stock is the sum of open reservations; available is physical minus reserved. A stable organization/product/location lock row serializes first and later writes. Transfers validate both warehouse/location pairs and commit both legs together. Opening stock must be the first movement for a key; correct a posted count with a receipt or issue. P06 does not link reservations or movements to sales-order lines; P07 owns those links and partial delivery.

For an already initialized database, start MariaDB in **Administrator PowerShell** without removing its volume:

```powershell
docker compose up -d --wait db
```

Then apply the additive migration and launch Laravel/Vite in a regular PowerShell:

```powershell
$env:ERP_PHP_BINARY = 'C:\php8.5\php.exe'
& $env:ERP_PHP_BINARY artisan migrate --force
npm run dev
node scripts/Verify-P06Browser.mjs
```

The browser harness uses existing synthetic fixtures without changing their IDs or units: `P05-DEMO-001` ID 4 and `P05-DEMO-002` ID 5 use `EA`; `DEMO-002` ID 3 uses `EA`; `DEMO-001` ID 1 has no base unit and is rejected for stock. `LOC-A-01` ID 1 is in `WH-MAIN` ID 1; `LOC-B-01` ID 2 is in `WH-SECOND` ID 2. The harness posts synthetic P06 operations/reservations and saves screenshots under `docs/screenshots/`.

**P06 status: ACCEPTED (2026-11-21).** Migration `2026_11_21_000007_create_p06_inventory_tables` is applied to the existing `erp_dev` schema without resetting its volume or changing existing product IDs/base units. On guarded `erp_test`, the P06-only rollback/reapply succeeded; P03–P05 table counts and representative organization/product/party/unit/location/price/lead/quote rows matched before and after. The final guarded serial suite passed 50 tests / 464 assertions. Chrome passed reserve/release, linked transfer, last-unit two-connection race (201/422), exact fractional issue, reader/editor, keyboard validation, 1280×900, 390×844, and forced fallback; four synthetic screenshots are linked in [P06 UI evidence](docs/UI_DESIGN.md#p06-verification-evidence). See [P06 architecture](docs/okf/architecture/p06-stock-workflow.md) and [HANDOFF.md](HANDOFF.md).

## P07 fulfil a confirmed sales order

P07 adds Reserve, Deliver, and Cancel Remainder controls to each confirmed order line at `/orders/{id}`. The editor selects a warehouse and one of its locations; the product and base unit come from the saved order line. Quantities use the same exact three-decimal thousandths as P06. A line's ordered, still-reserved, delivered, cancelled, and pending amounts are derived from its immutable order snapshot, linked reservation counters, delivery rows, and cancellation record.

Each partial delivery posts one P06 `issue` operation and one immutable outbound movement, consumes only that amount from its linked reservation, and saves the order-line/operation/movement trace in the same transaction. Delivery requires `Idempotency-Key`; same-key/same-payload retry returns the same delivery, while changed payload returns HTTP 409. Delivery works against reserved stock even when unreserved availability is zero. Cancelling a remainder releases the linked outstanding reservation amount without posting an inventory movement. Repeating cancellation preserves the original history and timestamp. The standalone P06 release route rejects P07-linked reservations so it cannot bypass line reconciliation.

Migration `2026_11_21_000008_add_p07_sales_fulfillment` is applied to the existing `erp_dev` schema. It preserves the existing volume and P05 commercial snapshots. On guarded `erp_test`, rollback/reapply of only 000008 succeeded; the rehearsal preserved P06 tables and restored the P06 inventory-operation FK/support index. The final guarded serial suite passed 55 tests / 565 assertions; TypeScript, Vite production build, changed-file Pint, and PHP syntax checks passed.

For local browser acceptance, start MariaDB and `npm run dev`, then run `node scripts/Verify-P07Browser.mjs`. The harness creates synthetic product, warehouse/location, quote/order, and stock fixtures, verifies the order-line UI at 1280×900 and 390×844, keyboard focus, forced bright fallback, retry conflict, and a two-connection MariaDB delivery race. It saves screenshots under `docs/screenshots/` and does not reset or remove the fixture records. The verified main fixture progressed through physical/reserved/available `10.000/0.000/10.000`, `10.000/3.000/7.000`, `8.000/1.000/7.000`, and `8.000/0.000/8.000`; delivery 3 links operation 14 to outbound movement 15. See [P07 UI evidence](docs/UI_DESIGN.md#p07-sales-fulfillment-evidence), the [P07 workflow](docs/okf/architecture/p07-sales-fulfillment.md), and [HANDOFF.md](HANDOFF.md).

**P07 status: ACCEPTED (2026-11-21).** P08 reuses P06's stock options, exact quantity helpers, stable stock-key locks, and inbound receipt operation while recording purchase-order line traceability in its own workflow.

## P08 purchase request to warehouse receipt

P08 provides `/purchase-requests` and `/purchase-orders`. Editors create a draft request with one or more product lines in each product's active base unit, submit it, and receive approval from a different organization editor. The requester cannot approve their own request; the API returns 403 for direct self-approval and saves the independent approver and timestamp.

An approved request converts into one supplier order for an organization-owned party with the supplier role. Order lines retain their source request line, product/unit/quantity labels, agreed unit price, and line/total values as historical snapshots. Purchase prices are whole IRR per base unit (currency scale 0); line totals round half-up once to a whole rial, and the order total sums those rounded line totals. P04 price lists remain in rials and P05 sales documents remain in Toman.

Each order line accepts partial receipts at an organization-owned warehouse/location pair. Product and unit come from the saved line. The receipt posts the existing P06 `receipt` operation and inbound movement in the same transaction as the receipt trace, cumulative received amount, and order closeout. Orders close after every line is fully received. Receipt keys are UUIDs bound to the organization, order line, warehouse, location, and quantity; an exact retry returns the original receipt even after closeout, and changed input returns 409. The order/line lock serializes receipts on different lines while P06's stock-key lock prevents inconsistent inventory writes. Reservations remain unchanged.

For an existing P08 local database, run the additive migration in **Administrator PowerShell** after starting the existing MariaDB service. The default-local-organization approver fixture is generated once and its credential is kept only in the ignored private storage directory; the command does not print it:

```powershell
$env:ERP_PHP_BINARY = 'C:\php8.5\php.exe'
& $env:ERP_PHP_BINARY artisan migrate --force
& $env:ERP_PHP_BINARY artisan p08:provision-approver
```

Then, in a regular PowerShell with the local application running, use the isolated Chrome acceptance harness:

```powershell
node scripts/Verify-P08Browser.mjs
```

The Chrome harness uses an isolated temporary profile and synthetic local records. It verifies the editor/requester self-approval denial, the separate approver UI, price-bound conversion retry, 5.000 received as 3.000 + 2.000, unchanged reservation quantity, closed-order replay, location validation, keyboard focus, mobile geometry, forced bright fallback, and a two-connection last-quantity contention. It saves screenshots under `docs/screenshots/` and preserves the synthetic records it creates.

**P08 status: ACCEPTED (2026-11-21).** Migration `2026_11_21_000009_create_p08_purchase_tables` was applied forward to existing `erp_dev`; its pre-existing product, stock-operation, and sales-order counts stayed unchanged. The full guarded serial Laravel suite passed 61 tests / 694 assertions. TypeScript, Vite build, changed-file Pint, PHP/Node syntax, and Chrome acceptance passed. The main browser fixture's 5.000-unit order was received as 3.000 + 2.000; before the separate one-unit contention fixture, its balance was physical/reserved/available 15.000/4.000/11.000. The final receipt replay returned receipt 11, operation 31, and movement 32. The contention requests returned 201/409 and stored one receipt. At 390×844 the page had no horizontal overflow and the last order panel cleared the dock by 99.03 CSS px; bright fallback retained four shared glass surfaces and zero SVG-refraction surfaces. Screenshots and full local evidence are in [P08 UI evidence](docs/UI_DESIGN.md#p08-purchasing-evidence) and [HANDOFF.md](HANDOFF.md).

## P09 balanced accounting engine

P09 provides `/accounting/journals` for a Persian RTL manual journal workspace and `/accounting/journals/new` / `/accounting/journals/{id}` for drafts and review. Editors can create IRR books, postable or heading accounts, inclusive Gregorian periods, draft lines, balanced postings, period closures, and reversals. Readers can review books, periods, journal lines, totals, and original/reversal links. Every write uses the active organization session, editor policy, and explicit CSRF token.

Journal lines contain one positive whole-rial debit or credit and zero on the other side. Posting requires exact debit/credit equality, same-book active postable accounts, one matching open period, and an idempotency UUID. Posted journals are immutable. A reversal appends swapped lines, preserves the original, and uses a new open period when the original is closed. Same-key retries return the persisted journal after closure; a different payload conflicts. Book-first locking serializes posting, reversal, period creation, and closure.

P05 sales totals remain whole Toman and P08 purchase totals remain whole Rial. P09 amounts are serialized as decimal strings; the exact conversion helper maps 178831 toman to 1788310 rial, while a 500000-rial purchase amount remains 500000. P05/P06/P07/P08 workflows do not post automatically. P10 invoice and settlement paths are accepted only for the local ERP MVP and the exact synthetic mapping recorded in [ADR-008](docs/okf/decisions/adr-008-p09-accounting-scope-and-posting-decisions.md). The profile remains `synthetic_test`; this approval does not enable live/production posting.

For an existing P08 local database, start the already-created MariaDB volume in **Administrator PowerShell**, then apply only pending forward migrations:

```powershell
docker compose up -d --wait db
$env:ERP_PHP_BINARY = 'C:\php8.5\php.exe'
& $env:ERP_PHP_BINARY artisan migrate --database=mariadb --force
```

Run the guarded tests serially and the browser harness with Laravel/Vite running. The browser harness uses local P03 editor credentials, an isolated Chrome profile, synthetic data, and an independent MariaDB lock worker. It preserves its `erp_dev` fixtures and screenshots; set `P09_BROWSER_BOOK_CODE` to resume a partial fixture, or omit it for a fresh book.

```powershell
& $env:ERP_PHP_BINARY artisan test
npm run typecheck
npm run build
& $env:ERP_PHP_BINARY vendor\bin\pint --test app\Http\Controllers\Api\V1\AccountingController.php app\Services\Accounting\AccountingService.php
node scripts/Verify-P09Browser.mjs
```

**P09 status: ACCEPTED (2026-11-22) at the local manual/synthetic engine boundary.** Migrations `2026_11_22_000010_create_p09_accounting_tables` and `2026_11_22_000011_add_p09_one_sided_line_amount_check` are applied to `erp_dev` and guarded `erp_test`; pre-existing P01–P08 table counts matched before/after. The full guarded suite passed 78 tests / 825 assertions. TypeScript, Vite build, changed-file Pint, PHP syntax, route registration, and Chrome checks passed. In browser book 1, journal 1 posted sale on account (Dr AR / Cr revenue 1,000,000 IRR), journal 2 purchase/inventory (500,000 IRR), journal 3 customer collection (400,000 IRR), and journal 4 supplier payment (200,000 IRR); all were balanced. Journal 5 reverses sale journal 1 in open period 2027-01-01 after the 2026 period closed. Same-key replay returned 200 for journal 1 after closure. The latest two-connection posting race returned 201/200 and persisted journal 11 once. A separate close/post race returned close 200 / post 422 and left journal 12 in draft. At 390×844, document/client widths were 375/375 px and the last setup panel cleared the fixed dock by 82.19 px. Bright fallback applied zero SVG refraction surfaces; Chrome reported zero runtime errors and the live Vite route loaded `accounting.css`. Evidence is in [P09 UI design](docs/UI_DESIGN.md#p09-accounting-evidence) and [HANDOFF.md](HANDOFF.md). Open domain decisions continue to gate all source-driven posting.

## P10 customer and supplier settlement

P10 adds `/settlements` and `/api/v1/settlements/*` routes for customer invoices from P07 deliveries, supplier invoices from P08 warehouse receipts, open-item balances, treasury receipts/payments, allocations, and linked P09 journals. Customer source amounts retain P05 whole-Toman snapshots and convert exactly ×10 to whole Rial. Supplier amounts use P08 whole-Rial unit-price snapshots and cumulative quantity rounding. Current settlement writes fully allocate one movement to one invoice.

P10 writes use the active organization, editor policy, and explicit CSRF token. Invoice + open item + P09 journal and treasury movement + allocation + P09 journal each commit atomically. Same-key retries return original IDs even after zero balance or a closed period; changed payloads conflict. Standalone P09 reversal rejects P10-linked journals.

The approved local workflow uses the existing organization 1 / book 2 (`P10-SYNTH-BROWSER`) profile recorded in ADR-008. Do not provision another profile for that workflow. The command below is only for isolated, disposable local tests; its new profile is not part of the approval:

```powershell
C:\php8.5\php.exe artisan p10:provision-synthetic-profile 1 P10-SYNTH-LOCAL
```

The command refuses non-local/non-debug environments and creates a `synthetic_test` profile without approval metadata. It does not approve live account mappings or extend the approved organization/book/account mapping. Preserve the existing approved local profile and records. With Laravel/Vite running, use the Chrome harness only when generating new synthetic acceptance data is intended; it can leave records in `erp_dev`:

```powershell
node scripts/Verify-P10Browser.mjs
```

The harness leaves synthetic P10 records in `erp_dev` and saves screenshots under `docs/screenshots/`. **P10 status: ACCEPTED for the local ERP MVP only (2026-11-24).** The focused guarded P10 suite passed 7 tests / 136 assertions, including both invoice/settlement journeys, exact journal accounts and balances, exact-key replay after period closure, and the closed-period correction boundary. The prior full guarded suite passed 85 tests / 945 assertions before this approval-test update; it was not rerun for this task. Migration `2026_11_24_000012_create_p10_settlement_tables` is applied to `erp_test` and `erp_dev`; previous P10 browser evidence is linked below. Live/production posting remains disabled and outside the approval. See [P10 UI evidence](docs/UI_DESIGN.md#p10-customer-and-supplier-settlement-evidence), [P10 architecture](docs/okf/architecture/p10-settlement.md), [P10 data](docs/okf/data/p10-settlement.md), [P10 security](docs/okf/security/p10-settlement.md), [ADR-008](docs/okf/decisions/adr-008-p09-accounting-scope-and-posting-decisions.md), and [HANDOFF.md](HANDOFF.md).

## P11 reconciled local dashboard

P11 adds `/dashboard`, `GET /api/v1/dashboard/options`, `GET /api/v1/dashboard`, and paginated `GET /api/v1/dashboard/metrics/{metric}`. The dashboard derives organization scope from the authenticated active workspace. Financial tiles use the selected organization-owned book; available stock and pending purchase approvals are organization-wide. Each tile opens the exact filtered source rows, with a server-side page size of 25 and a reconciliation count/total for the full population.

Select a Gregorian report date and display currency. The selected book's IANA timezone defines one inclusive end-of-day cutoff at `23:59:59` for timestamped operational events; the default local book uses `Asia/Tehran`. P10 invoices use their date-only `effective_on` and `due_on` fields. Net sales sums posted customer invoices in the selected book through the date and ignores receipts, supplier invoices, drafts, quotes/orders, and standalone P09 manual journals. Overdue receivables include only invoices due strictly before the date and subtract allocations effective through that date whose settlement journals are posted; future receipts do not change earlier balances. P10 has no correction/void record, so the dashboard does not infer one.

Available stock reconstructs physical quantity from P06 movement timestamps and subtracts reservations outstanding at the cutoff using reservation creation, P07 delivery-event, and persisted release timestamps. P06 standalone releases and P07 cancel-remainder each release the full outstanding amount at one timestamp; this supports the current history contract. Stock totals group by base unit, and detail rows retain physical, reserved, and available quantities to three decimals. Pending approvals include requests submitted by the cutoff that had not yet been approved at that time, using `submitted_at` and `approved_at`.

Money stays as exact whole-Rial strings in JSON. Toman display divides by ten without floating-point arithmetic and retains a fractional Toman when needed. The dashboard response and source drill-downs use the same filters; totals do not depend on the 200-row P10 settlement list limit.

### Repeatable local walkthrough

On the existing local setup, the following command reuses `legacy-local`, book `P10-SYNTH-BROWSER`, and the existing unapproved `synthetic_test` profile. It verifies the ADR-008 account mapping before writing, does not create a new accounting book/profile, and uses the accepted P05/P06/P07/P08/P10 workflows with stable fixture identities and idempotency keys. It is restricted to local debug `erp_dev`; test replay runs only inside guarded `erp_test`.

```powershell
& 'C:\php8.5\php.exe' artisan p11:provision-walkthrough
```

The repeatable journey covers:

1. Customer party → lead → price-list quote → confirmed sales order → P06 opening baseline → P07 reservation and issue → 1,000,000-rial customer invoice → 400,000-rial collection → 600,000-rial / 60,000-toman residual.
2. Purchase request → submission → approval by a different editor → 500,000-rial purchase order → P06/P08 warehouse receipt → supplier invoice → 200,000-rial payment → 300,000-rial residual.
3. A separate submitted request left pending so the approval tile has a deterministic source row.

The walkthrough uses a 10.000 EA baseline for its own synthetic product. After the one-unit issue and one-unit receipt, that product/location remains at 10.000 EA available. The command defaults the report date to the current date in the selected book timezone; customer invoice effective/due dates are four/two days before that date, and the supplier due date is thirty days after it. Re-running the command returns the existing source order, delivery, receipt, invoices, settlements, journals, and request rows.

For a clean disposable schema, `tests/Feature/P11DashboardTest.php` uses guarded `erp_test`, creates an equivalent `synthetic_test` profile and P10-SYNTH book, then runs provisioning twice and compares the resulting records, journal links, balances, and movements. It never resets `erp_dev`.

With MariaDB and Laravel/Vite running, verify and capture the live dashboard:

```powershell
node scripts/Verify-P11Browser.mjs
```

The harness uses a temporary Chrome profile and the ignored local P03 editor credential file without printing credentials. It checks all four tiles against the named local organization/book/date, source drill-down counts, the due-date and future-payment boundaries, a second same-organization book, exact Toman display, the sale/purchase source and settlement screens, mobile geometry, keyboard focus, bright forced fallback, live Vite `dashboard.css`, and JavaScript/network errors. It saves concise screenshots under `docs/screenshots/`. Do not run the harness if local P03 demo credentials are unavailable; do not copy them into source files or output.

The current local readback on 2026-11-26 for organization `legacy-local` / book `P10-SYNTH-BROWSER` / `Asia/Tehran` was independently reconciled from source rows:

| Metric | Expected | Observed |
|---|---:|---:|
| Net sales | 5,000,000 IRR | 5,000,000 IRR |
| Overdue receivables | 600,000 IRR | 600,000 IRR |
| Available stock | 131.500 EA across 15 positive product/location rows | 131.500 EA across 15 rows |
| Pending purchase approvals | 1 request | 1 request |

The dashboard drill-downs returned 5 sales invoices, 1 overdue customer invoice, 15 available product/location rows, and 1 pending request. Cutoff checks returned 0 overdue when the invoice was due on 2026-11-24, 1,000,000 IRR overdue on 2026-11-25 before the 2026-11-26 collection, and 600,000 IRR on 2026-11-26 after the collection. Toman display returned 500,000 for net sales and 60,000 for overdue receivables. The P11 fixture command ran twice in `erp_dev` with the same order, invoice, receipt, settlement, journal, and movement IDs. No P10 profile or manual journal was changed.

See [P11 UI evidence](docs/UI_DESIGN.md#p11-reconciled-dashboard-evidence), [P11 architecture](docs/okf/architecture/p11-dashboard.md), [P11 data contract](docs/okf/data/p11-reporting.md), [P11 security](docs/okf/security/p11-reporting.md), and [HANDOFF.md](HANDOFF.md) for current validation status.

**P11 status: ACCEPTED (2026-11-26) at the local read-only reporting and synthetic walkthrough boundary.** The focused guarded suite passed 5 tests / 122 assertions and the full serial guarded suite passed 90 tests / 1,083 assertions. `npm run typecheck`, `npm run build`, changed-file Pint, Node syntax, and `git diff --check` passed. The Chrome harness matched all four independently reconciled totals, exercised date boundaries and source links, verified loading/error/empty states, mobile geometry, keyboard focus, bright fallback, and live Vite styling, and reported zero runtime errors. Live/production posting remains disabled.

## P12 projects and assigned work

P12 adds `/projects`, `/projects/{id}`, `/projects/{id}/tasks/{taskId}`, and `/inbox` in the Persian RTL workspace. The project detail shares one task collection between list and board views. Editors create tasks, choose active-organization members, change status, and add plain-text project/task comments. Readers can review their organization's project work.

Tasks use `open`, `in_progress`, and `completed`. `completed_by` and `completed_at` are recorded on completion, cleared on reopen, and unchanged when the same completion request is repeated. The due date is date-only. `config('app.timezone')` defines the local date cutoff; the current repository setting is `UTC`. A due reminder is eligible at the start of the due date, and the task becomes overdue at the start of the next day.

When a member opens `/inbox`, the UI posts to `/api/v1/work/inbox/process-due-reminders` and reads `/api/v1/work/inbox`. This local, synchronous process stores one persistent reminder per task, assignment version, recipient, and due date. Repeated processing is safe. Completed tasks leave the inbox. Reassignment changes the identity so a previous assignee stops receiving the reminder and the new assignee can receive one if the task is due.

An editor can associate an open or closed P08 purchase-order line with one project. P12 records the exact whole-rial `line_total_rial` snapshot and source labels. A line can be linked only once across projects; retrying the same project's association returns the existing link. The project opens the P08 order at the source line without changing the order, receipt, stock, or P09/P10 records.

With the documented MariaDB service running, launch Laravel and Vite with `npm run dev`, then run the isolated Chrome acceptance harness:

```powershell
node scripts/Verify-P12Browser.mjs
```

The harness reuses its synthetic P12 project/task, existing local P03 editor and P08 editor credentials, and P11 order `PO-000009` line 9. It opens the assigned editor's mobile inbox, verifies the due reminder, follows the task to its project, completes it, and reconciles the list/board counts. It also verifies the 500,000-IRR source link, 1280×900 and 390×844 layouts, keyboard focus, bright forced fallback, live Vite CSS, and browser errors. Credentials remain in ignored private storage and are never printed. The run leaves synthetic P12 project/work records in `erp_dev` and screenshots under `docs/screenshots/`.

P12's focused guarded suite passed 7 tests / 133 assertions; the full serial guarded suite passed 97 tests / 1,216 assertions. `npm run typecheck`, `npm run build`, changed-file Pint, PHP/Node syntax checks, route listing, and `git diff --check` passed. See [P12 UI evidence](docs/UI_DESIGN.md#p12-projects-and-assigned-work-evidence), [P12 architecture](docs/okf/architecture/p12-project-work.md), [P12 data model](docs/okf/data/p12-project-work.md), [P12 access model](docs/okf/security/p12-project-work.md), and [HANDOFF.md](HANDOFF.md).

## Scope and status

This repository is local-development-only. It contains synthetic data and no production, staging, deployment, cloud, or external-service configuration. P01–P12 are accepted at their local-development boundaries; P10's approval is limited to the exact local synthetic workflow in ADR-008. Live/production posting remains disabled. The reusable UI reference is [docs/UI_DESIGN.md](docs/UI_DESIGN.md), detailed phase state and evidence are in [HANDOFF.md](HANDOFF.md), and the user-provided phase roadmap remains at [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md).
