# UI/UX and Workflow Audit

## Evidence boundary

This is a static frontend/source audit, not a completed visual product-flow audit. The P14 instruction authorized local route inspection and the user approved saving synthetic screenshots. The in-app browser and an isolated Chrome tab both timed out on http://127.0.0.1:8000/sign-in; an elevated loopback GET also timed out. The temporary tab and local dev-server processes were closed. No screenshot was captured or saved, and historical P01-P13 screenshots are not treated as current P14 evidence.

The repository does not have standalone playwright or playwright-core packages installed. P14 did not install a new dependency or change a lockfile. The available computer-use browser path was used only for the authorized local GET attempt; it could not reach the host loopback route.

Static evidence includes resources/js/app.tsx, WorkspaceShell.tsx, ProjectWorkScreen.tsx, SignInScreen.tsx, DashboardScreen.tsx, MembershipAdministrationScreen.tsx, the shared CSS, docs/UI_DESIGN.md, route registration, and corresponding feature tests. Runtime keyboard, focus, console, responsive geometry, loading, error, and permission-state checks were not possible in this audit.

## Navigation and page structure

The app.tsx route switch sends the root/home and unmatched routes to ProductsScreen. WorkspaceShell groups navigation under historical phase labels: P11 dashboard, P04 master data, P05 sales, P06 stock, P08 purchasing, P09 accounting, P10 settlements, P12 project work, and P13 administration. Work routes exist, but the root remains the goods product list and the shell exposes optional inventory/purchasing/accounting areas alongside project work.

This is a concrete mismatch with V2's project-centric internal workflow and Q51's request to preserve optional modules while hiding them from the daily path. The implementation is reusable, so a later navigation/activation decision should reuse current route groups rather than duplicate screens.

## Prioritized findings

| ID | Priority | Finding | Evidence | Proposed target |
|---|---|---|---|---|
| UX-P14-01 | P1 | The default root opens the product register, and the shared sidebar exposes all legacy goods, inventory, procurement, and accounting sections. A service-company user starting daily work at projects/tasks must navigate away from the default screen. | routes/web.php:25-45; resources/js/app.tsx:22-43; resources/js/components/WorkspaceShell.tsx:28-69, 192-309 | P15/P18 after D01; keep existing modules intact. |
| UX-P14-02 | P1 | The project workspace represents projects and tasks but no phases, milestones, approved progress, acceptance, or project lifecycle approvals. Task counts can be misread as business progress. | ProjectWorkScreen.tsx:176-215, 240-401; ProjectWorkService.php:60-129; P12 migration | P24-P27; publish progress only from an approved rule. |
| UX-P14-03 | P2 | Search is module-specific; no global customer/project/task search or tags/help layer was found. | GlassSearchField usage and route inventory; E-ABSENCE in RTM | P18/P26/P27/P37/P38 |
| UX-P14-04 | P2 | Project/task entry forms expose a short set of fields (title, assignee, due date, comments) and have no checklist, estimate/actual time, or acceptance criteria. | ProjectWorkScreen.tsx:240-374; ProjectWorkController.php:92-194 | P26/P29 after D02/D03/D06 |
| UX-P14-05 | P2 | Existing sidebar/mobile behavior and long Persian labels have historical acceptance evidence but were not re-captured at current HEAD/runtime. Current contrast, keyboard completion, narrow viewport overflow, and screen-reader announcements remain unverified. | docs/UI_DESIGN.md P02-P13 evidence; current capture blocker above | Re-capture at P18/P27 with current routes and synthetic data. |

## Static strengths

- Persian labels and RTL-aware layout are built into the existing React screens and shared workspace shell.
- Navigation landmarks expose accessible labels and aria-current on the selected page.
- Work screens use native headings, links, labels, forms, status text, and explicit loading/error/empty states in source.
- Existing design documentation records Liquid Glass fallback, mobile dock, keyboard focus, and reduced-transparency decisions. That history is useful context, not current visual proof.

## Workflow steps reviewed statically

| Step | Description | General health |
|---|---|---|
| 1 | Sign-in and authenticated workspace entry | Partial; auth is implemented, but current browser route could not be opened. |
| 2 | Navigate from the default product screen to projects | Needs improvement; root defaults to products and all legacy modules remain exposed. |
| 3 | View a project, task list/board, assignment, due date, and comments | Partial; the P12 source implements these, while phase progress, acceptance, time, and richer task workflow are absent. |
| 4 | Review responsive, focus, error, loading, and permission states in the current runtime | Blocked; browser loopback timed out, so no current screenshot or browser evidence was produced. |

## Recommended follow-up

After P14 owner approval, review the daily landing/navigation in P15/P18, extend the existing P12 surfaces in P24-P27, and repeat the visual audit using fresh synthetic screenshots at desktop and mobile widths. Do not treat this static review as visual acceptance.
