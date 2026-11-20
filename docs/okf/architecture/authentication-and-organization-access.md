---
type: Architecture
title: P03 Authentication and Organization Access
description: Documents the implemented session, organization context, role, product boundary, and role audit paths for P03.
tags:
  - architecture
  - authentication
  - authorization
status: active
---

# P03 Authentication and Organization Access

## Session boundary

- Browser workspace routes use Laravel's `web` session and `auth` middleware. Guests are redirected to `/sign-in`; logout removes the active organization, invalidates the session, and regenerates the CSRF token.
- `/api/v1/*` workspace routes deliberately include Laravel's `web` middleware group in addition to the API route group. Same-origin requests use the session cookie; state-changing requests must include a matching `X-CSRF-TOKEN` or `_token`. An explicit middleware check supplements Laravel 13's same-origin request-origin allowance.
- Login is server-side and uses the existing `User` model and session guard. The login route has a per-email-and-IP throttle and returns one generic invalid-credentials message.

## Organization context and role matrix

Memberships are rows in `organization_memberships`, uniquely keyed by organization and user. Role belongs to this membership, not to the user.

| Membership role | Read organization products | Rename product display name |
| --- | --- | --- |
| `reader` | Yes | No |
| `editor` | Yes | Yes |

The active organization ID is stored in the server session. `ResolveActiveOrganization` reloads the user's memberships for each protected request. A missing selection resolves to the first allowed organization; a submitted switch is accepted only when the user currently belongs to the target. Missing or stale membership is denied.

## Product and audit boundary

- `GET /api/v1/products` filters by the active organization before selecting `id`, `code`, and `name`.
- `PATCH /api/v1/products/{id}` accepts only `name`. It scopes by active organization before lookup, then authorizes with `ProductPolicy`. A foreign product ID and an unknown ID both return 404.
- `organization_role_audits` records organization, membership, actor or `system` source, previous role, new role, and creation time. `MembershipRoleService` commits the membership update and audit row in one transaction and skips audit insertion when the role is unchanged.
- The `legacy-local` organization is the documented starting owner for all products present before the P03 ownership migration. Organization code uniqueness is backed by a composite database index. Rolling back that index is refused while product codes repeat across organizations.

Demo account provisioning and credential storage are described in the [local README](../../../README.md); operational validation remains in the [handoff](../../../HANDOFF.md).

## Verification state

P03 is accepted. The guarded Laravel suite passed 27 tests / 94 assertions. Browser verification used Google Chrome with its actual session cookie and CSRF token. The editor updated a product name through the form and the change survived navigation/refresh; the original product name was restored after the scenario. A reader was denied by both the UI and API. Direct foreign detail navigation showed only the generic unavailable state, and foreign/unknown write IDs returned the same public 404 result. Provisioning twice retained 2 organizations, 3 memberships, 3 role-audit rows, and 2 products. Desktop and mobile evidence is in the [UI design reference](../../UI_DESIGN.md#p03-verification-evidence).
