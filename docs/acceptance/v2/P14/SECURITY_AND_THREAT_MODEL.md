# Security Audit and Threat Model

## Scope and confidence

The audit inspected the local source, route/middleware/policy structure, database safety guard, P09/P10 boundaries, import/export validation, configuration examples, and the current test suite. It did not perform penetration testing, fuzzing, a source-code scanner, a full connected dependency audit, or a live authenticated browser review. No production system or real customer/employee data was accessed.

Source-driven findings are evidence-backed within that coverage. The complete transitive dependency status and production cookie/TLS/secrets posture remain unverified because composer/npm advisory endpoints were unreachable and no production configuration exists in this local-only repository.

## Current controls observed

| Control | Evidence and practical boundary |
|---|---|
| Password/session authentication | SessionController validates email/password and regenerates the session after authentication; User casts password as hashed and hides password/remember_token. |
| Login throttling | The POST /login route uses throttle:login and explicit CSRF middleware. No equivalent global rate limit was identified for other API writes. |
| Session/CSRF | API routes use web middleware, auth, and ResolveActiveOrganization; mutation routes additionally require an explicit session CSRF token. Logout invalidates the session and regenerates the token. |
| Organization isolation | The active organization is resolved from the authenticated user's membership. Policies distinguish domain reads/writes; tests cover foreign IDs, readers, and organization switching. |
| Database-level scoping | Reviewed P08/P12/P13 migrations use organization-scoped foreign keys/unique keys for sensitive associations. Not every older table was schema-dumped in P14. |
| SQL and rendering | Most queries use Eloquent/query builder with bound parameters. The focused scan found no raw HTML insertion sink in React. No dynamic security scanner was run. |
| P13 uploads | Party import accepts CSV/TXT/XLSX up to 5 MB, is limited to the active organization/editor, previews before apply, binds retry keys to normalized content, rejects spreadsheet formulas, and exports formula-safe CSV. It is not general document storage. |
| Financial controls | P09 requires balanced whole-Rial posting, open periods, locks, and idempotency. P10 is constrained to a synthetic_test profile for local/testing and a P10-SYNTH-* book; P10-linked journals cannot use the standalone reversal endpoint. |
| Secrets | .env and .env.testing are local ignored files; no secret value was printed. .env.example is intended to be secret-free. Production secret storage/configuration was not inspected because none is in scope. |

## Dependency advisory review

The installed framework is Laravel 13.43.0. GitHub's current advisory for numeric validation reports versions before 13.44.1 as affected by high-severity resource exhaustion when the multiple_of rule or relative-field gt/gte/lt/lte rules process unbounded exponent input. The focused source scan found none of those rules in app code; it found integer/numeric fields bounded with min/max where used. This suggests the documented trigger is not currently used by the inspected application, but it is an inference from the scanned source, not a proof against all runtime paths. Plan an authorized update to at least 13.44.1 before network exposure; P14 cannot change dependencies. [Laravel numeric-validation advisory](https://github.com/laravel/framework/security/advisories/GHSA-c25c-x5r7-2v5m), [Laravel 13.44.1 release](https://github.com/laravel/framework/releases/tag/v13.44.1).

Other reviewed Laravel advisories are patched by 13.43.0 or earlier: crafted JSON DoS is patched from 13.38.0; empty-array wildcard validation and oversized-Unicode email DoS are patched from 13.43.0. [Crafted JSON advisory](https://github.com/laravel/framework/security/advisories/GHSA-8h64-cpq2-9h2g), [empty-array advisory](https://github.com/laravel/framework/security/advisories/GHSA-cq3g-fj94-c8p3), [email validation advisory](https://github.com/laravel/framework/security/advisories/GHSA-cvfq-f547-rv2g).

React and React DOM are 19.3.1. The reviewed React Server Components advisory fixes 19.3.1; the project does not declare/install react-server-dom packages and its current application is a client-rendered React/Vite application. Vite is 8.3.8; the reviewed dev-server RCE advisory is patched from 8.3.7. The repository binds the Vite dev server to 127.0.0.1. These focused version checks do not cover every transitive package. [React RSC advisory](https://github.com/advisories/GHSA-xqc2-xf4c-x3h3), [Vite advisory](https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7).

Full composer audit --locked and npm audit were attempted. Both failed before advisory results because the host could not resolve repo.packagist.org or registry.npmjs.org. Therefore a complete locked dependency scan is BLOCKED; the failure is not a clean scan.

## Threat model

| Actor | Assets/goal | Main surfaces | Existing mitigation | Residual risk |
|---|---|---|---|---|
| Internal reader | View only authorized organization data | Session, active organization, GET API routes, exports | Auth middleware, membership resolution, domain read policies, negative tests | Fixed role set; field-level controls are not modeled. |
| Internal editor | Maintain approved operational records | API mutation routes, CSRF, source workflows | Explicit CSRF, organization policy, validation, transactions, idempotency | No fine-grained PM/Finance/HR separation; non-login write rate limits not evidenced. |
| Role manager | Change membership editor/reader roles | P13 role API/history and CLI provisioning | Separate organization-scoped grant, last-manager protection, expected-role checks, audit rows | Role manager is a local admin grant, not a complete authorization matrix. |
| Finance administrator | Manage receivables, settlements, and corrections | P09/P10 endpoints and database profile | Editor checks, exact whole-Rial amounts, local synthetic profile, P10 lock/retry rules | Production approval branch is not backed by an in-app approval workflow; corrections/refunds are absent. |
| Executive administrator | Review reliable progress/profit and close projects | P11 dashboard, P12 projects, future approvals | P11 is read-only and labels current metrics; P12 counts task status | No approved project progress, contract profit, staffing capacity, or executive role. |
| Unauthorized external user | Discover or mutate internal data | Sign-in, unauthenticated routes, API URLs | API group requires auth; only sign-in/login are guest paths; login throttled/CSRF-protected | Production network boundary, proxy/TLS, and security headers were not inspected. |
| Future customer portal user | See/accept only own project/contract data | Future P42-P46 portal boundary | No portal route exists now; roadmap explicitly defers it | Separate identity, relation-based authorization, consent, approval expiry, and no-leak tests are still required. |
| Compromised account | Escalate within an organization or replay actions | Sessions, active organization switch, import/export, finance | Scoped policies, explicit CSRF, idempotency, immutable snapshots, role audit | No MFA, account recovery/offboarding workflow, anomaly monitoring, or complete audit event stream. |

### Trust boundaries and protected assets

1. Browser to Laravel: session cookie, CSRF token, authenticated same-origin API. Production TLS/cookie flags are not validated here.
2. User to active organization: membership resolution and organization policies. All record lookups must preserve active-organization scoping and existing foreign-ID behavior.
3. Laravel services to MariaDB: application credentials target erp_dev locally and erp_test for guarded tests; schema integrity relies on organization keys, foreign keys, transactions, and uniqueness.
4. P13 upload to parser: untrusted CSV/XLSX bytes are bounded, normalized, previewed, and applied only after authorization; no general file repository exists.
5. P10 source to P09 posting: a high-trust boundary. Only the local synthetic mapping is approved. Live profiles require separate, auditable owner approval and must remain disabled until then.
6. Docker volume and local environment files: erp_mariadb_data persists development fixtures; .env/.env.testing contain local credentials and must remain ignored.

## Security findings

| ID | Severity | Finding | Evidence/limitation | Required future action |
|---|---|---|---|---|
| SEC-P14-01 | P1 before release | Laravel 13.43.0 is below the patched version for a high-severity numeric-comparison DoS advisory. The affected rule family was not found in the scanned app validators. | Composer audit failed DNS; advisory-range comparison is current web research; source scan was focused and static. | Authorized dependency update to >=13.44.1, then full guarded regression and dependency audit. |
| SEC-P14-02 | P1 before release | P10 has an approved-profile code path gated by nonempty metadata but no application approval workflow tying that metadata to an owner decision. | Static inspection of P10PostingProfileResolver.php:64-73 and ADR-008; no live profile was changed or enabled. | Retain local-only profile; require controlled provisioning and verifiable approval evidence before any approved profile. |
| SEC-P14-03 | P1 before broader access | Fixed editor/reader permissions plus role_manager do not provide the requested PM/Finance/HR/customer field-level matrix. | OrganizationPolicy and P13 role service; feature tests cover current roles only. | Resolve D02/D09 and add negative authorization tests as permissions grow. |
| SEC-P14-04 | P1 before operational use | Password-only local auth has no Google/MFA, account recovery, or offboarding workflow. | SessionController and route inventory; production auth is not configured. | Resolve D09; plan identity/offboarding and recovery before P17/P42. |
| SEC-P14-05 | P1 before release | Backup, restore, monitoring, staging, and incident recovery were not demonstrated. | No deployment/operations configuration found; no restore/load action performed. | Resolve D08/D10/D12 and validate at P39/P40/P41. |
| SEC-P14-06 | P2 | Login is throttled, but no broad API mutation rate-limit policy was identified. | routes/web.php:8-18 versus authenticated mutation routes in routes/api.php. Local-only exposure currently limits reach. | Define per-operation limits before customer-facing or wider network access. |
| SEC-P14-07 | P2 | General audit logging is not evident; P13 audits membership-role changes only. | P13 audit model/service and current migration inventory. | Define a data-change audit scope for contract, financial, personnel, and approval records. |
| SEC-P14-08 | P2 / blocked evidence | Complete dependency findings are unknown because public registry DNS failed; browser runtime review and static SAST were not available. | Actual composer/npm audit errors are in evidence/command-results.md. | Re-run in an approved network-enabled security-validation environment before P40. |

No code or policy was changed during this audit. No P0 vulnerability was established from the inspected source; this is not a statement that the application is production secure.
