# ERP

Local-development ERP prototype. P01 established the product API, P02 added the Persian RTL workspace, P03 added session sign-in and organization-scoped access, P04 added shared master data, P05 added sales documents, and P06 adds standalone stock operations and reservations. The application reads synthetic data from MariaDB in Docker Compose. The application root is this directory.

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

**P07 status: ACCEPTED (2026-11-21).** P08 can reuse P06's stock options, exact quantity helpers, stable stock-key locks, and receipt operation while recording purchase-order line traceability in its own workflow.

## Scope and status

This repository is local-development-only. It contains synthetic data and no production, staging, deployment, cloud, or external-service configuration. P01–P07 are accepted; P08 is the next planned phase. The reusable UI reference is [docs/UI_DESIGN.md](docs/UI_DESIGN.md), detailed phase state and evidence are in [HANDOFF.md](HANDOFF.md), and the user-provided phase roadmap remains at [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md).
