---
type: Architecture
title: P02 Reusable Product Workspace
description: Documents the shared Persian RTL workspace shell and the product register/detail routes established in P02.
tags:
  - architecture
  - frontend
  - ui
status: active
---

# P02 Reusable Product Workspace

## Implementation

- Laravel serves the React entry view for `/`, `/products`, and numeric `/products/{id}` paths. The root entry displays the product register. Non-numeric product paths do not match the workspace detail route.
- React components live under `resources/js/components/`; `WorkspaceShell` provides the desktop sidebar, compact toolbar, active navigation state, and mobile bottom navigation.
- The list at `/products` and detail at `/products/{id}` use the existing same-origin `GET /api/v1/products` response. The API contract remains `{ data: [{ id, code, name }] }`. Detail selects an item by numeric `id`; no detail API endpoint or database field was added.
- `GlassSearchField` filters the client-loaded collection by product name or code. `GlassButton` provides a shared Liquid Glass action surface. `ProductQuickViewDialog` uses a native modal dialog and restores keyboard focus to the invoking row action.
- Loading, API error/retry, empty API, no filter matches, and unknown numeric ID each have a separate UI state.
- The product code is explicitly LTR inside the RTL interface. Desktop and mobile use different register layouts while keeping the same response fields.

## Material and accessibility

The UI reuses the existing LiquidGlass component and displacement-map implementation. Shared material, radius, focus, and motion tokens are defined in [the P02 UI design reference](../../UI_DESIGN.md). `?glass=fallback` forces the solid/blur fallback; bright and dark backdrop review is available via the `scene` query setting. Reduced transparency, increased contrast, and reduced motion have explicit CSS behavior.

## Current verification state

P02 is accepted. TypeScript, Vite asset build, and the guarded Laravel suite passed during implementation. The closeout captured the live register and dialog at 1280×900 and 390×844 and rechecked Escape and focus return. The corrected 390×844 detail view had 17.31 CSS px of clearance above the mobile dock and zero horizontal overflow. See the [UI design reference](../../UI_DESIGN.md#verification-evidence) for captures and [project handoff](../../../HANDOFF.md) for acceptance evidence.

## P03 access integration

The shared shell displays the active organization, membership role, an allowed-organization selector when there is more than one membership, and sign-out. The product detail form is rendered only when the server context reports the product update capability; Laravel policy enforcement remains authoritative. Sign-in and no-membership denied states reuse the shared design tokens and glass fallback. P03 is accepted; Google Chrome exercised the session, CSRF, role, organization switch, logout, filter, and quick-view paths at desktop and mobile sizes. See [authentication and organization access](authentication-and-organization-access.md) and [P03 screenshot and geometry evidence](../../UI_DESIGN.md#p03-verification-evidence).
