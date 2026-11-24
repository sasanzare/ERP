# Agent Instructions

## Project scope

Local-development-only ERP prototype. P01–P09 are accepted at their local boundaries. P03 owns sign-in, organizations, roles, and access enforcement; P04 owns shared organization-scoped parties, units, products, warehouses, locations, and Rial price lists; P05 owns leads, follow-ups, Toman quotes, and confirmed orders; P06 owns stock operations, balances, and reservations; P07 owns sales fulfillment; P08 owns purchase requests, approval, supplier orders, and receipts; P09 owns manual books, accounts, periods, journals, posting, and reversal. Automatic source posting remains disabled until the domain decisions in ADR-008 are approved. P10 supplier invoices/payables, deployment, cloud, and external services are out of scope. Use synthetic data.

## Architecture and safety

- Laravel 13 runs on host PHP 8.5.13 (`C:\php8.5\php.exe`). React/TypeScript/Vite sources live under `resources/js/`; the browser uses same-origin `/api/v1/` routes.
- MariaDB runs as Compose service `db` with persistent volume `erp_mariadb_data`, loopback host port 3307 by default, and separate schema-scoped `erp_dev` and `erp_test` users.
- Keep credentials and `APP_KEY` in ignored `.env` / `.env.testing`; keep `.env.example` secret-free.
- PHPUnit's `Tests\TestCase` validates the exact local `erp_test` target before Laravel's database-refresh helpers. Never reset the development schema.
- Run only one `artisan test` process at a time; all `RefreshDatabase` tests share the same disposable `erp_test` schema.
- Keep PHPUnit's XML bootstrap unset in this Windows setup: PHP 8.5.13 reports local files unreadable to PHPUnit despite direct PHP includes. The PHPUnit proxy autoloads Composer; the guard reads `.env.testing` before Laravel setup.
- On this host the normal Codex shell cannot access Docker Desktop's named pipe; use Administrator PowerShell for Docker commands. Do not change Windows group membership or security settings without the user's instruction.
- Preserve `.git`, the current branch, user files, lockfiles, and user-provided `docs/MASTER_PLAN.md`. Do not commit or push.
- Keep the Persian UI RTL, accessible, and aligned with the Liquid Glass Design skill, including solid/reduced-transparency and reduced-motion fallbacks.
- After adding CSS modules, verify the live Vite/HMR route in Chrome; a successful production build alone does not establish that the development server resolved the stylesheet.
- Resolve record IDs inside the active organization before validating secondary relationship inputs; preserve the existing 404 parity for foreign and unknown records.
- P08 approval must deny requester self-approval server-side. Purchase orders store whole-IRR line/total snapshots; receipts derive product/unit from the order line and reuse the P06 receipt operation with order → line → product/location → stock-key locking.
- `p08:provision-approver` creates one local synthetic editor in `legacy-local`; its generated credential remains under ignored private storage and is never printed.
- P09 ledger amounts are exact whole IRR strings at API/UI boundaries. Preserve P05 whole-toman and P08 whole-rial snapshots; never post current sales, inventory, purchasing, or receipt flows automatically. Use book → journal → period → sorted accounts lock order and keep source decisions in ADR-008.

## Commands and documentation

- Read [HANDOFF.md](HANDOFF.md) before development. The local runbook is [README.md](README.md); the phase roadmap is [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md); project knowledge lives in [docs/okf/index.md](docs/okf/index.md).
- Setup: `C:\php8.5\php.exe C:\Users\moxfo\composer.phar install`, `npm ci`, then `scripts/Initialize-Local.ps1` as documented in README.
- Daily run: start DB with `docker compose up -d --wait db` (manual Docker step); `npm run dev` starts Laravel and Vite together, and Ctrl+C stops both.
- Checks: `php artisan test`, `npm run typecheck`, `npm run build`, and `node scripts/Verify-P04Browser.mjs`, `Verify-P05Browser.mjs`, `Verify-P06Browser.mjs`, `Verify-P07Browser.mjs`, `Verify-P08Browser.mjs`, and `Verify-P09Browser.mjs` from `scripts/`. P05–P09 contention checks use independent PHP servers/connections coordinated by a harness; run one Laravel test-suite process at a time. The P09 harness preserves its synthetic `erp_dev` fixtures and screenshots.
- Laravel Boost is a development dependency; its generated agent/configuration files are local and ignored. Do not add cloud/deployment configuration in this local-only project.
