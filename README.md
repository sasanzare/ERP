# ERP

Local-development ERP prototype. P01 established the Persian product API, P02 added the reusable RTL workspace, and P03 adds session sign-in and organization-scoped product access. Product data is read from MariaDB in Docker Compose. The application root is this directory.

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

Then open **PowerShell as Administrator** and run the initializer from the repository root. It creates ignored local `.env` and `.env.testing` files with random database credentials, starts MariaDB, applies migrations, seeds the synthetic product, and provisions repeatable P03 demo memberships with passwords in an ignored local file.

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

In a regular PowerShell, run Laravel:

```powershell
Set-Location 'D:\All projects\ERP'
$env:ERP_PHP_BINARY = 'C:\php8.5\php.exe'
& $env:ERP_PHP_BINARY artisan serve --host=127.0.0.1 --port=8000
```

In a second regular PowerShell, run Vite:

```powershell
Set-Location 'D:\All projects\ERP'
npm run dev
```

Open [http://127.0.0.1:8000/products](http://127.0.0.1:8000/products). The root `/` also opens the product register, `/products/{id}` opens a product detail, and the React page fetches `/api/v1/products` from the same origin.

## P03 local sign-in and organization provisioning

The local initializer runs the forward migrations, seeds the existing product, then invokes `php artisan p03:provision-demo`. For an already initialized development database, run these commands from the repository root in Administrator PowerShell after starting the existing MariaDB service:

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

Stop Laravel and Vite with `Ctrl+C` in their terminals. In **Administrator PowerShell**, stop MariaDB without deleting its persistent volume:

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

## Scope and status

This repository is local-development-only. It contains synthetic data and no production, staging, deployment, cloud, or external-service configuration. P01, P02, and P03 are accepted. The reusable UI reference is [docs/UI_DESIGN.md](docs/UI_DESIGN.md), detailed phase state and evidence are in [HANDOFF.md](HANDOFF.md), and the user-provided phase roadmap remains at [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md).
