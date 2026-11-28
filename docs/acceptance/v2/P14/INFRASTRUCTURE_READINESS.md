# Infrastructure Readiness

## Observed local topology

| Layer | Observed configuration | Evidence / limitation |
|---|---|---|
| Application | Host Windows PHP 8.5.13, Laravel 13.43.0, React 19.3.1, Vite 8.3.8 | composer.json, package.json, local installed versions |
| Database | Compose service db, image mariadb:11.8.9-noble, loopback 127.0.0.1:3307 | docker compose ps showed erp-local-db-1 running; read-only DB handshake identified MariaDB 11.8.9 |
| Persistent data | Named volume erp_mariadb_data | compose.yaml; no volume reset or cleanup was run |
| Development schema | erp_dev with local user erp_app | .env identifiers only; no secret values reported |
| Test schema | erp_test with user erp_test | .env.testing plus DatabaseTestSafetyGuard; separate read-only migration ledger |
| Session/cache/queue | Local defaults use file/session cache and synchronous queue; .env.testing uses array session/cache and synchronous queue | examples/config only; temporary audit server overrides were process-local and server was stopped |
| Storage | Local Laravel storage directories; no general customer document/object-storage configuration found | source/config inventory |
| Queue/scheduler | Compose has no queue worker or scheduler service; current queue config can use sync | no independent queue/cron readiness evidence |
| Staging/production | Not configured or accessed | explicit project local-only boundary |

The direct host route to 127.0.0.1:8000 timed out from the in-app browser, the separate Chrome capture attempt, and an elevated loopback GET. Both temporary dev-server sessions were stopped. This prevents current runtime UI evidence but does not establish that the PHP/Vite code is intrinsically unreachable outside the managed execution environment.

## Workload and operations gaps

- The 100-staff, 10,000-customer, and approximately 200-concurrent-user targets are not measured. No load-test harness/result or production-like hardware profile was found.
- The database service was running and connectable locally, but the db:show --counts presentation failed after connection because host PHP lacks intl. No current row-count baseline was established.
- No encrypted off-host backup, independent key storage, retention schedule, restore drill, measured RPO/RTO, or disaster-recovery runbook was found.
- No staging environment, production TLS/reverse-proxy configuration, secrets manager, health/metrics alerting, queue worker, scheduler, incident owner, or release rollback rehearsal was found.
- The Compose volume is persistent, but persistence is not backup or restore evidence.
- Current local APP_DEBUG is true. This is a local development setting and cannot be used as production configuration.
- Composer and npm dependency audit commands could not resolve public registries because DNS was unavailable. This is not a clean dependency scan.

## P40/P46 readiness recommendation

1. Resolve D01 and D08/D09/D10/D12 before choosing a target deployment topology.
2. Inventory any proposed hosting target read-only; do not provision or purchase services in P14.
3. Establish separately isolated local/test/staging/production credentials and databases only after explicit deployment authorization.
4. Define a synthetic mixed workload and run the V2 plan's ramp/steady/spike scenario in the authorized staging environment; collect hardware, RPS, p95, error rate, queue lag, DB lock data, and data-integrity evidence.
5. Implement and rehearse encrypted backup/restore with measured RPO/RTO before internal pilot.
6. Validate operational auth, session cookies, monitoring, release/rollback, migration policy, and incident ownership before Gate I/II.

No claim of 200-user capacity, production readiness, recoverability, or availability is supported by this local audit.
