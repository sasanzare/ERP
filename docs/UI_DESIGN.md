# P02 UI Design Reference

## Scope

P02 establishes the reusable Persian RTL workspace around the existing synthetic product API. The shell, list, detail view, filters, dialog, loading, empty, error, retry, and unknown-product states use the product response fields `id`, `code`, and `name`. P03 owns sign-in, organizations, roles, and permission enforcement.

## Composition and responsive layout

- Desktop uses the Liquid Glass Design skill's Lens Inspector composition: a compact top toolbar, one primary product register/detail surface, and one grouped navigation/status rail.
- Mobile uses the Mobile Focus Sheet composition: a single content surface and fixed bottom navigation with safe-area clearance. The register changes from a wide table to stacked product rows.
- The list is `/products`; detail is `/products/{numeric id}`; `/` opens the list. Detail reads the unchanged `GET /api/v1/products` collection and selects by `id`.
- The product code is rendered in LTR direction with `<bdi>`. Filters match the name or code and distinguish an empty API response from a filter with no matches.
- The quick-view control opens a native modal dialog, sends focus to its close control, supports Escape and close buttons, and restores focus to the row trigger.
- On mobile product details, keep the back link at the top and use the fixed bottom navigation for route changes; do not add a duplicate bottom return action inside the dock's clearance area.

## Shared tokens

`resources/css/products.css` is the shared token source. It defines:

| Token family | Variables | Use |
| --- | --- | --- |
| Material | `--lg-tint`, `--lg-rim`, `--lg-primary-tint`, `--lg-primary-rim`, `--lg-fallback-blur` | Regular navigation/dialog and tinted primary controls |
| Geometry | `--ui-radius-sm`, `--ui-radius-md`, `--ui-radius-lg` | Fields, controls, work surfaces |
| Focus | `--focus-ring`, `--focus-ring-offset` | Visible keyboard indication |
| Motion | `--motion-fast`, `--motion-standard`, `--motion-ease` | State changes; reduced-motion preference removes transitions and shimmer |

The LiquidGlass primitive retains its measured displacement map, geometry cache, and forced fallback. `GlassButton` is the shared action control; `GlassSearchField` is the shared labeled filter; `WorkspaceShell` owns desktop and mobile navigation; `ProductQuickViewDialog` owns dialog focus behavior.

## Typography

The workspace uses the locally supplied IRANSansX WOFF2 assets in `resources/fonts/iran-sans-x/`. `IRANSansXFaNum` is the root UI family so Persian text and Persian-formatted digits share the Persian-number glyph design. `@font-face` maps the supplied static files to CSS weights 100–900 (Thin, UltraLight, Light, Regular, Medium, DemiBold, Bold, ExtraBold, Black), and `font-synthesis: none` prevents fabricated bold faces. LTR inputs and non-monospace LTR identifiers use the standard IRANSansX family; existing monospace product/code badges remain monospace.

## Contrast and fallback behavior

- Add `?glass=fallback` to force the CSS material fallback on any workspace route.
- Add `&scene=bright` to a query that already has `?glass=fallback` to review adaptive tint over a bright scene. The default scene is dark.
- Toolbars, navigation, and the quick-view dialog use Regular glass. Primary actions and selected controls use Tinted glass. Product rows, details, and input values use quiet surfaces to keep text sharp.
- Adaptive surfaces use a stronger tint for bright backdrops. Increased contrast strengthens rims and work-surface boundaries. Reduced transparency removes backdrop filtering and uses a solid dark surface. Reduced motion disables transitions and loading animation.
- Measurable layout markers are `data-lg-role="stage"`, `focus`, `dock`, and `rail`; mobile navigation uses the dock role when visible.

## Verification evidence

| View | Desktop 1280×900 | Mobile 390×844 |
|---|---|---|
| Live register | [Desktop register](screenshots/p02-register-desktop.png) | [Mobile register](screenshots/p02-register-mobile.png) |
| Quick-view dialog | [Desktop dialog](screenshots/p02-dialog-desktop.png) | [Mobile dialog](screenshots/p02-dialog-mobile.png) |

Chrome loaded the live API with HTTP 200 and rendered the MariaDB record DEMO-001. Playwright verified that the dialog fit both viewports, opened via Enter, moved focus to its close control, and returned focus to the trigger on Escape. The same dialog opened and closed with the forced glass fallback. Both register viewports had equal document scroll and client widths.

The corrected mobile detail at 390×844 ended at y=752.69 CSS px. The fixed dock began at y=770 and ended at y=834, leaving a 17.31 CSS px gap. Document scrollWidth and clientWidth both measured 390 px. The top return link and both dock links were hit-testable. Clicking the dock list link and the upper back link returned to the list, with a browser Back transition between the two checks.

Prior checks exercised empty API, no-results, error, retry, and recovery through controlled same-origin responses. They also verified bright and dark scenes, reduced motion, increased contrast, and reduced transparency. Direct browser measurements covered the geometry relevant to the ERP shell. The skill’s generic checker was not run.

## P03 verification evidence

Google Chrome exercised the local session-authenticated application with synthetic credentials. The browser run verified guest redirect and JSON 401, generic credential failure, session-cookie login, explicit CSRF rejection, editor rename and refresh, read-only denial, organization switching, foreign/unknown product hiding, logout, the P02 code filter, and the quick-view dialog. There were no uncaught browser JavaScript exceptions.

| View | Desktop 1280×900 | Mobile 390×844 |
|---|---|---|
| Sign-in | [Chrome sign-in](screenshots/p03-sign-in-desktop-2026-11-20T19-29-07-621Z.png) | [Chrome mobile sign-in](screenshots/p03-sign-in-mobile-2026-11-20T19-29-07-621Z.png) |
| Product register | [Editor register](screenshots/p03-editor-register-desktop-2026-11-20T19-29-07-621Z.png) | [Reader register](screenshots/p03-reader-register-mobile-2026-11-20T19-29-07-621Z.png) |
| Product detail | [Editor renamed detail](screenshots/p03-editor-renamed-detail-desktop-2026-11-20T19-29-07-621Z.png) | [Reader detail](screenshots/p03-reader-detail-mobile-2026-11-20T19-29-07-621Z.png) |
| Organization switch | [Organization B register](screenshots/p03-organization-b-register-desktop-2026-11-20T19-29-07-621Z.png) | — |

At 390×844, reader register/detail had zero horizontal overflow. Detail content ended at y=718.69 CSS px, and the dock began at y=770 px, leaving 51.31 CSS px of clearance. The reader view omits the edit form; the editor desktop detail displays it. Browser evidence was captured by `scripts/Verify-P03Browser.mjs` using an isolated Chrome profile and the actual same-origin session cookie.

## P04 verification evidence

The P04 data workspace reuses the Lens Inspector hierarchy on desktop and a Mobile Focus Sheet on mobile: the register/form is the focal surface, the shared toolbar and resource tabs are command surfaces, and organization/role context remains grouped in the shell. Existing glass tokens and the forced fallback are reused.

Google Chrome exercised local synthetic editor and reader sessions, editor-created/edited dual-role party data, product/base-unit details, exact selected-list prices, duplicate product-code validation, foreign-unit rejection without a saved change, warehouse-filtered location options, server-side mismatched-pair rejection, organization switching, reader read-only behavior, and the P02 quick-view dialog. The forced bright fallback remained usable. The browser run had zero uncaught runtime errors.

| View | Desktop 1280×900 | Mobile 390×844 |
|---|---|---|
| Party register | [P04 party register](screenshots/p04-party-register-desktop-2026-11-21T06-56-53-692Z.png) | [Forced bright glass fallback](screenshots/p04-party-register-fallback-mobile-2026-11-21T06-56-53-692Z.png) |
| Party editor form | — | [P04 party detail](screenshots/p04-party-detail-mobile-2026-11-21T06-56-53-692Z.png) |
| Product base unit | [P04 product detail](screenshots/p04-product-base-unit-desktop-2026-11-21T06-56-53-692Z.png) | — |
| Selected price | [P04 list A](screenshots/p04-price-list-a-desktop-2026-11-21T06-56-53-692Z.png), [P04 list B](screenshots/p04-price-list-b-desktop-2026-11-21T06-56-53-692Z.png) | — |
| Warehouse/location selector | — | [P04 location selector](screenshots/p04-location-register-mobile-2026-11-21T06-56-53-692Z.png) |

The list A and B views show 120,000 and 135,000 rial respectively. Product DEMO-001 shows the unpriced state. At mobile scroll-to-end measurements, document width and layout client width both measured 375 CSS px in a 390×844 window; the last party-form action ended at y=609.53 with the dock starting at y=770, and the location-selector action ended at y=622.31 with the dock starting at y=770. The mobile register uses stacked rows and has no root horizontal overflow.

The harness is [scripts/Verify-P04Browser.mjs](../scripts/Verify-P04Browser.mjs). The guarded Laravel suite separately verifies the database code index and foreign-key constraints.
