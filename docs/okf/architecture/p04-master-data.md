---
type: Architecture
title: P04 Master Data API and Workspace
description: Documents P04 organization-scoped master-data routes, forms, authorization, and local verification.
tags:
  - architecture
  - api
  - master-data
  - ui
status: active
---

# P04 Master Data API and Workspace

## API boundary

Authenticated `/api/v1` routes use the P03 `web` session, active-organization middleware, and explicit CSRF token on mutations. Reads and ID lookups scope by the active organization before serialization. Relationship selectors and validation are organization-scoped. Foreign records return the same not-found status as unknown IDs; a foreign unit on a product or foreign warehouse on a location receives validation failure without saving.

Reader memberships can read authorized registers and details. Editor memberships can create and update master data. `OrganizationPolicy` enforces the server boundary; the workspace capability only controls UI actions.

## Routes

| Workspace path | API collection/detail | Purpose |
|---|---|---|
| `/parties`, `/parties/new`, `/parties/{id}` | `/api/v1/parties` | Search and edit parties; filter by customer or supplier role. |
| `/products`, `/products/{id}` | `/api/v1/products`, `/api/v1/products/{id}` | Preserve the original product list envelope and name-only PATCH while extending product editing with code and optional base unit. |
| `/units`, `/units/new`, `/units/{id}` | `/api/v1/units` | Organization-owned units of measure. |
| `/warehouses`, `/warehouses/new`, `/warehouses/{id}` | `/api/v1/warehouses` | Organization-owned warehouse register. |
| `/locations`, `/locations/new`, `/locations/{id}` | `/api/v1/locations` | Warehouse-scoped location selector and server-side pair validation. |
| `/price-lists`, `/price-lists/new`, `/price-lists/{id}` | `/api/v1/price-lists` | Manage lists and entries; resolve `/api/v1/price-lists/{listId}/products/{productId}` explicitly. |

Price entries are created/upserted with `POST /api/v1/price-lists/{id}/entries`; deletion is `DELETE /api/v1/price-lists/{id}/entries/{productId}`. P04 continues to store and display those amounts in rials. P05 sales lines convert the selected whole-rial entry to exact tenths of a toman for quote/order snapshots. Location option queries accept a scoped `warehouse_id`; `POST /api/v1/locations/validate-selection` rejects a location from a different warehouse.

## Workspace conventions

The new registers share the P02 `WorkspaceShell`, `GlassButton`, `GlassSearchField`, shared field control, focus ring, and existing material/fallback tokens. Desktop keeps the sidebar and a focal data surface. Mobile uses the existing bottom dock, horizontal resource tabs, stacked table rows, and a single-column form. Loading, API error, empty, denied, and not-found states are explicit. Codes are LTR and rial amounts stay exact.

## Local verification

`P04DemoSeeder` is called by the existing `p03:provision-demo` workflow and uses `firstOrCreate`, preserving unrelated records and avoiding repeated role/audit rows. The P04 Chrome harness is [Verify-P04Browser.mjs](../../../scripts/Verify-P04Browser.mjs). It exercises the editor/reader session, dual-role party filters, base-unit detail, two selected list prices, unpriced state, duplicate code validation, foreign-unit rejection, warehouse/location filtering and pair rejection, organization switching, and forced glass fallback.

Chrome verification passed at 1280×900 and 390×844. The seven inspected screenshots and mobile measurements are listed in the [UI design reference](../../UI_DESIGN.md#p04-verification-evidence). The final guarded Laravel suite passed 36 tests / 213 assertions; TypeScript, production build, PHP syntax, and Pint checks passed. Local runtime evidence is also recorded in [HANDOFF.md](../../../HANDOFF.md).

For local development, `npm run dev` starts the Laravel and Vite servers together; start MariaDB separately with Docker as described in the [README](../../../README.md). Ctrl+C stops the two web processes.

P05 sales routes and their Toman snapshot boundary are documented in the [P05 workflow](p05-sales-workflow.md) and [P05 data model](../data/p05-sales-documents.md).
