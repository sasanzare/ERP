---
type: Security Model
title: P11 Reporting Organization Isolation
description: Defines the read-only P11 dashboard authorization, active-organization scoping, and foreign-book handling.
tags:
  - security
  - dashboard
  - organization
status: active
---

# P11 Reporting Organization Isolation

## Session and read policy

The `/dashboard` page requires the existing authenticated session and `ResolveActiveOrganization` middleware. The summary, options, and source-record endpoints authorize view access for the active organization's sales, stock, purchasing, and accounting policies. P11 exposes no write route and performs no accounting, settlement, inventory, or approval mutation from the dashboard.

## Organization and book scope

The organization comes only from the authenticated active membership; the client cannot supply an `organization_id` to choose another tenant. The controller resolves the selected accounting book with both `organization_id` and `book_id`. A foreign or unknown book is returned as 404. Each financial, stock, approval, and detail query applies the same active-organization boundary; financial queries also apply the validated book.

Changing the active organization reloads the workspace and clears the previous report before fetching new data. Filter changes clear stale totals and detail rows while the new request is loading. Read-only viewers can use all four metrics; source-specific editor privileges are not required.

## Local synthetic walkthrough

`p11:provision-walkthrough` rejects non-local/non-testing environments and binds local execution to the exact `erp_dev` schema, `legacy-local`, and `P10-SYNTH-BROWSER`. It verifies the existing `synthetic_test` profile and account codes before provisioning and never changes approval metadata, existing P10 setup, or manual journals. Testing mode is confined to `erp_test` and requires explicit organization/book IDs created by the guarded feature fixture. Stable request identities and idempotency keys make reruns return the same domain rows. Live/production posting remains disabled; see [ADR-008](../decisions/adr-008-p09-accounting-scope-and-posting-decisions.md).

See [P11 architecture](../architecture/p11-dashboard.md) and [P11 reporting data](../data/p11-reporting.md).
