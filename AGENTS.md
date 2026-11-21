# Agent Instructions

## Project scope

Local-development-only ERP prototype. P01–P04 are accepted. P03 owns sign-in, organizations, roles, and access enforcement; P04 owns shared organization-scoped parties, units, products, warehouses, locations, and price lists. Implement only the currently requested phase. Use synthetic data; sales, inventory movements, finance, deployment, cloud, and external services remain out of scope.

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

## Commands and documentation

- Read [HANDOFF.md](HANDOFF.md) before development. The local runbook is [README.md](README.md); the phase roadmap is [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md); project knowledge lives in [docs/okf/index.md](docs/okf/index.md).
- Setup: `C:\php8.5\php.exe C:\Users\moxfo\composer.phar install`, `npm ci`, then `scripts/Initialize-Local.ps1` as documented in README.
- Daily run: start DB with `docker compose up -d --wait db` (manual Docker step); `npm run dev` starts Laravel and Vite together, and Ctrl+C stops both.
- Checks: `php artisan test`, `npm run typecheck`, `npm run build`, and `node scripts/Verify-P04Browser.mjs` when the relevant phase is requested.
- Laravel Boost is a development dependency; its generated agent/configuration files are local and ignored. Do not add cloud/deployment configuration in this local-only project.
