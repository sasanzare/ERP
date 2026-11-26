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

## P05 sales workflow evidence

The sales screens reuse the Lens Inspector desktop hierarchy and Mobile Focus Sheet layout. The sales register/detail remains the focal surface, the shared toolbar and sales tabs remain command surfaces, and related lead/customer/price snapshots stay grouped in the document. Line cards keep Toman values sharp over a quiet work surface; shared Liquid Glass controls retain the existing reduced-transparency and forced-fallback behavior.

Google Chrome exercised the editor workflow: create a customer lead, add an overdue follow-up, complete it and reload the overdue queue, create a draft from the lead, add two priced lines, confirm the quote, and convert it to an order. The line results were 135,000 and 43,831 toman; the quote/order total was 178,831 toman. A separate authorized P04 price update did not alter either snapshot; the P05 fixture price was restored after the check. Two requests held behind a MariaDB quote row lock returned statuses 201 and 200 with the same order ID. The order list showed one order for that source quote and two copied lines. Reader lead/quote writes returned 403.

Keyboard Tab reached the customer selector and submit control; Enter submitted the lead form with a visible 2 CSS px focus outline. At 390×844, the document/client widths were both 375 CSS px; the focal surface ended at y=688.34, the total at y=671.34, and the dock began at y=770. Forced bright fallback exposed three glass surfaces and zero SVG-refraction surfaces. Chrome reported zero runtime errors.

| View | Screenshot |
|---|---|
| Overdue follow-up queue, desktop 1280×900 | [P05 overdue follow-ups](screenshots/p05-overdue-follow-up-desktop-2026-11-21T09-56-40-423Z.png) |
| Quote line snapshots and exact Toman amounts, desktop 1280×900 | [P05 quote lines](screenshots/p05-quote-lines-desktop-2026-11-21T09-56-40-423Z.png) |
| Confirmed order with source quote, lead, and customer, desktop 1280×900 | [P05 order](screenshots/p05-order-desktop-2026-11-21T09-56-40-423Z.png) |
| Confirmed order lines, mobile 390×844 | [P05 mobile order](screenshots/p05-order-mobile-2026-11-21T09-56-40-423Z.png) |
| Quote in forced bright fallback, mobile 390×844 | [P05 forced fallback](screenshots/p05-quote-fallback-mobile-2026-11-21T09-56-40-423Z.png) |

## P06 stock workspace evidence

The stock workspace reuses the accepted RTL shell and Lens Inspector hierarchy: the balances/history surface is the focal area, operation/reservation forms are a single grouped rail, and the shared toolbar and stock tabs remain command surfaces. Mobile collapses to one content column and retains the fixed navigation dock. The operational tables use short location/product details and keep exact quantities visually aligned with the base-unit label.

Google Chrome verified synthetic local `erp_dev` data at 1280×900 and 390×844, including reserve/release, duplicate release, linked transfer legs and both locations, one exact last-unit race on separate MariaDB connections, issue availability, fractional precision, missing base unit, wrong warehouse/location, reader write denial, keyboard form submission and validation feedback. The race worker held the `stock_locks` row while two requests were sent to independent PHP servers; after 400 ms both remained pending, then exactly one reservation succeeded (201/422). A direct read of the stored rows confirmed one open 1.000 reservation and physical/reserved/available milli-values of 1000/1000/0. The browser run reported zero uncaught errors.

At mobile scroll end, `documentWidth` and `clientWidth` both measured 375 CSS px in the 390×844 window. The last reservation panel ended at y=676.19 while the fixed dock started at y=770. Forced bright fallback retained seven glass surfaces, enabled zero SVG-refraction surfaces, and kept the stock views usable.

| View | Screenshot |
|---|---|
| Balances and editor operation form, desktop 1280×900 | [P06 balances](screenshots/p06-balances-desktop-2026-11-21T14-52-28-542Z.png) |
| Movement history with linked transfer path, desktop 1280×900 | [P06 movements](screenshots/p06-movements-desktop-2026-11-21T14-52-28-542Z.png) |
| Reservations and editor form, mobile 390×844 | [P06 reservations](screenshots/p06-reservations-mobile-2026-11-21T14-52-28-542Z.png) |
| Balances in forced bright fallback, mobile 390×844 | [P06 forced fallback](screenshots/p06-fallback-mobile-2026-11-21T14-52-28-542Z.png) |

The full guarded serial Laravel suite passed 50 tests / 464 assertions; `npm run typecheck` and `npm run build` passed. The implementation and remaining migration rehearsal boundary are recorded in [HANDOFF.md](../HANDOFF.md).

## P07 sales-fulfillment evidence

The confirmed-order detail keeps the P05 commercial snapshot intact and adds one fulfillment group to each line. Ordered, reserved, delivered, cancelled, and pending quantities remain sharp content; the line's reserve/deliver/cancel controls reuse the shared Liquid Glass buttons. Warehouse and location selectors, exact decimal text fields, and visible focus follow the established RTL forms. Each delivery shows its reservation ID and links directly to the immutable P06 operation and movement in `/stock/movements`.

Google Chrome verified a dedicated synthetic `erp_dev` order line for 3.000 EA at 1280×900 and 390×844. Reserve produced physical/reserved/available `10.000/3.000/7.000`; delivery of 2.000 produced `8.000/1.000/7.000`; cancelling the remaining 1.000 produced `8.000/0.000/8.000`. The final line retained ordered 3.000, delivered 2.000, cancelled 1.000, its P05 300,000-toman line/total snapshot, one outbound movement, and an unchanged cancellation timestamp on retry. The verified fixture uses order 8, line 10, delivery 3, operation 14, and movement 15.

Two requests on independent local PHP/MariaDB connections used the same delivery key and payload while the stock-key row was held. They returned 201 and 200 with the same delivery and operation IDs; database-backed API readback showed one delivery and one outbound issue. Reusing the key with changed quantity returned 409; a new request exceeding the remaining order/reservation returned 422. Reader history remained visible, reader writes were forbidden, foreign order/line and unrelated reservation IDs remained hidden, explicit CSRF was required, and an injected outbound-movement failure left no partial issue, consumption, or link. The guarded P07 migration rollback/reapply on `erp_test` preserved the P06 tables and operation foreign key/support index.

The mobile document/client widths were both 375 CSS px in the 390×844 viewport. Keyboard Tab reached the warehouse selector, location selector, and reserve action with a visible focus outline. Forced bright fallback kept three shared glass surfaces and zero SVG-refraction surfaces. The harness reported zero runtime errors.

| View | Screenshot |
|---|---|
| Fulfillment controls and full reservation, desktop 1280×900 | [P07 reserve](screenshots/p07-reserve-desktop-2026-11-21T16-58-33-946Z.png) |
| Partial delivery with linked issue/movement, desktop 1280×900 | [P07 delivery](screenshots/p07-delivery-desktop-2026-11-21T16-58-33-946Z.png) |
| Delivered and cancelled quantities, desktop 1280×900 | [P07 cancellation](screenshots/p07-cancel-desktop-2026-11-21T16-58-33-946Z.png) |
| Fulfillment history and fixed dock, mobile 390×844 | [P07 mobile order](screenshots/p07-order-mobile-2026-11-21T16-58-33-946Z.png) |
| Fulfillment in forced bright fallback, mobile 390×844 | [P07 forced fallback](screenshots/p07-fallback-mobile-2026-11-21T16-58-33-946Z.png) |

## P08 purchasing evidence

The purchase workspace uses the existing Lens Inspector shell and a single focal document panel. Request composition keeps product/unit/quantity together; order lines group ordered, received, remaining, price, and receipt history. Actions remain shared Liquid Glass buttons, and status/actor/supplier snapshots stay in the document surface. Mobile keeps the same document hierarchy with the fixed bottom dock; forced bright fallback uses solid high-contrast panels and dark links.

Google Chrome verified the local synthetic workflow with an editor requester and a separate editor approver. The requester could not approve through the UI and a direct same-session approval returned 403; the second editor approved with actor/time persisted. Conversion created one supplier order for 5.000 units at 100,000 IRR per unit (500,000 IRR total); exact retry returned the existing order and a changed price returned 409. Receipts of 3.000 and 2.000 closed the order. Before the independent last-quantity contention receipt, readback was physical/reserved/available 15.000/4.000/11.000. The final UI receipt replay after closeout returned the same receipt 11, operation 31, and movement 32. The separate two-connection race returned 201/409 and wrote one receipt. Expected 403/409/422 validation responses did not produce JavaScript runtime errors.

At 390×844, document `scrollWidth` and client width both measured 375 CSS px. At the scroll end, the last P08 panel ended at y=670.97 and the dock began at y=770, leaving a 99.03 CSS px gap. Keyboard Tab reached request quantity and receipt submission with visible focus; submitting 6.000 against the 5.000 outstanding amount showed validation feedback and left stock unchanged. Forced bright fallback retained four shared glass surfaces with zero SVG-refraction surfaces. Chrome reported zero runtime errors.

| View | Screenshot |
|---|---|
| Submitted request awaiting an independent approver, desktop 1280×900 | [P08 approval pending](screenshots/p08-request-awaiting-approval-desktop-2026-11-21T19-31-34-456Z.png) |
| Authorized approver action, desktop 1280×900 | [P08 approver](screenshots/p08-request-approver-desktop-2026-11-21T19-31-34-456Z.png) |
| Supplier order, desktop 1280×900 | [P08 supplier order](screenshots/p08-purchase-order-desktop-2026-11-21T19-31-34-456Z.png) |
| Partial 3.000 receipt, desktop 1280×900 | [P08 partial receipt](screenshots/p08-receipt-partial-desktop-2026-11-21T19-31-34-456Z.png) |
| Both receipts and linked inbound movements, desktop 1280×900 | [P08 completed order](screenshots/p08-purchase-order-complete-desktop-2026-11-21T19-31-34-456Z.png) |
| Receipt history at scroll end, mobile 390×844 | [P08 mobile order](screenshots/p08-purchase-order-mobile-2026-11-21T19-31-34-456Z.png) |
| Receipt history in forced bright fallback, mobile 390×844 | [P08 bright fallback](screenshots/p08-purchase-order-fallback-mobile-2026-11-21T19-31-34-456Z.png) |

The repeat harness is [scripts/Verify-P08Browser.mjs](../scripts/Verify-P08Browser.mjs). It uses an isolated temporary Chrome profile and stores synthetic screenshots under `docs/screenshots/`.

## P09 accounting evidence

The P09 workspace adapts the Instrument Bay composition for the dense journal register, with the book selector and journal list as the focal surface and account/period setup grouped in a supporting rail. On mobile it becomes one document column above the shared focus dock. Account balances and journal lines remain solid content surfaces; Liquid Glass is limited to the shell, navigation, and actions. A visible note states that these are manual synthetic postings and that live source recognition, tax, and costing rules remain open.

The isolated Chrome harness created an `IRR` book, five postable accounts, and inclusive Gregorian periods through the UI, then posted the four worked examples: sale journal 1 for 1,000,000 IRR, purchase/inventory journal 2 for 500,000 IRR, collection journal 3 for 400,000 IRR, and supplier payment journal 4 for 200,000 IRR. Sale journal 1 was reversed as journal 5 on 2027-01-01 after its 2026 period closed; the original plus reversal netted to zero by account. Replaying journal 1's posting key after closure returned the same journal (HTTP 200). Two independent MariaDB connections posting one draft with the same key returned 201/200 and one persisted journal (journal 11 in the final harness run). A separate race between closing a period and posting serialized to close 200 / post 422, leaving journal 12 in draft and the future period closed. The period-close control updated its status in place in the workspace.

At 1280×900 and 390×844, the mobile document/client widths were both 375 CSS px. At the mobile scroll end, the last setup panel ended at y=687.81 and the fixed dock began at y=770, leaving an 82.19 px gap. Tab focus on the journal search control showed a visible focus-within rim/shadow. Forced bright fallback retained eight shared glass surfaces, disabled active SVG refraction on all of them, and kept the synthetic-only note readable. The live route loaded Vite's client and `accounting.css`; Chrome reported zero runtime errors.

| View | Screenshot |
|---|---|
| Posted sale journal with exact Rial totals, desktop 1280×900 | [P09 posted sale](screenshots/p09-sale-posted-desktop-2026-11-22T08-33-42-246Z.png) |
| Journal register with the worked examples, desktop 1280×900 | [P09 journal register](screenshots/p09-journal-register-desktop-2026-11-22T08-33-42-246Z.png) |
| Reversal linked to its original, desktop 1280×900 | [P09 reversal detail](screenshots/p09-reversal-detail-desktop-2026-11-22T08-33-42-246Z.png) |
| Journal register and setup rail at scroll end, mobile 390×844 | [P09 mobile register](screenshots/p09-journal-register-mobile-2026-11-22T08-33-42-246Z.png) |
| Accounting workspace in forced bright fallback, mobile 390×844 | [P09 bright fallback](screenshots/p09-fallback-mobile-2026-11-22T08-33-42-246Z.png) |

The repeat harness is [scripts/Verify-P09Browser.mjs](../scripts/Verify-P09Browser.mjs). It uses an isolated Chrome profile, preserves synthetic `erp_dev` records, and saves evidence under `docs/screenshots/`.

## P10 customer and supplier settlement evidence

P10 uses a focused invoice register as the primary surface and a compact source-invoice rail. The register keeps original amount, allocated amount, outstanding balance, effective/due dates, order links, P07 delivery or P08 warehouse-receipt links, treasury movement IDs, and P09 journal links together. The shared Glass shell, toolbar, tabs, and action buttons remain the control layer; invoice, source, and financial details stay on solid surfaces. Customer amounts show both whole Rial and the exact Toman equivalent.

The Chrome acceptance harness used a separate `P10-SYNTH-BROWSER` IRR book and existing synthetic P07/P08 sources. Customer invoice 4 (journal 20) links sales order 9 / line 11 / delivery 4. Customer receipt treasury movement 5, allocation 5, and journal 21 record 400,000 IRR, leaving 600,000 IRR / 60,000 Toman. Supplier invoice 6 (journal 25) links purchase order 5 / line 5 / warehouse receipts 7 and 8. Supplier payment treasury movement 8, allocation 8, and journal 26 record 200,000 IRR, leaving 300,000 IRR. All linked P09 journals balance. A separate customer contention invoice 5 (journal 22) on order 8 / delivery 3 accepted one of two simultaneous 400,000-IRR allocations (HTTP 201/422), persisted 800,000 IRR against the 1,000,000-IRR open item, and retained a 200,000-IRR balance. Its base/winning receipts are treasury movements 6/7, with balanced journals 23/24. A screenshot-only Chrome pass then reused these persisted records after the synthetic-only notice was added to the source form.

At 1280×900, the register and source rail both rendered with linked source and journal details. At 390×844, document/client widths were 375/375 CSS px. At the scroll end, the P10 content bottom was y=688.25 / y=688.28 and the dock began at y=770, leaving 81.75 / 81.72 px for the customer/supplier views. Keyboard Tab focus remained visible. Bright forced fallback retained 9 shared glass surfaces with 0 active SVG refraction surfaces and kept the synthetic-only note legible; the live route loaded the Vite client and `settlements.css`. Chrome reported 0 runtime errors.

| View | Screenshot |
|---|---|
| Customer invoice/source/receipt and 600,000-rial / 60,000-toman balance, desktop 1280×900 | [P10 customer settled](screenshots/p10-customer-settled-review-desktop-2026-11-24T10-11-58-823Z.png) |
| Supplier invoice, P08 receipts, payment, and 300,000-rial balance, desktop 1280×900 | [P10 supplier settled](screenshots/p10-supplier-settled-review-desktop-2026-11-24T10-11-58-823Z.png) |
| Customer balance, mobile 390×844 | [P10 customer mobile](screenshots/p10-customer-settled-review-mobile-2026-11-24T10-11-58-823Z.png) |
| Supplier balance, mobile 390×844 | [P10 supplier mobile](screenshots/p10-supplier-settled-review-mobile-2026-11-24T10-11-58-823Z.png) |
| Settlement workspace in bright forced fallback, mobile 390×844 | [P10 bright fallback](screenshots/p10-settlement-bright-fallback-review-mobile-2026-11-24T10-11-58-823Z.png) |

The repeat harness is [scripts/Verify-P10Browser.mjs](../scripts/Verify-P10Browser.mjs). It preserves its synthetic P10 book and invoices in local `erp_dev`; its capture-only mode reuses the records without creating additional invoices.

## P11 reconciled dashboard evidence

The P11 screen keeps the accepted Lens Inspector workspace: the shared toolbar owns book/date/currency controls, the report surface is the single focal content area, and the existing sidebar/dock remain the command layer. The four sharp, solid-content tiles form a two-column desktop grid and a one-column mobile stack. Stock and approval tiles are explicitly labeled organization-wide; the financial tiles name the selected book. Each tile opens its own filtered, paginated source list. The panels reuse the existing tokens and shell glass; reduced-transparency, reduced-motion, increased-contrast, and forced-color fallbacks remain legible.

The isolated Chrome harness used local synthetic data at organization `legacy-local` (ID 1), book `P10-SYNTH-BROWSER` (ID 2), report date `2026-11-26`, and `Asia/Tehran`. The dashboard API and rendered values matched independent source-row calculations: net sales `5,000,000` IRR, overdue receivables `600,000` IRR, available stock `131.500` EA over 15 positive product/location rows, and 1 pending purchase approval. Drill-down populations reconciled to 5 customer invoices, 1 overdue invoice, 15 stock rows, and 1 request. Toman mode displayed `500,000` and `60,000` exactly.

The harness delayed local API fetches and observed the loading panel, sent an invalid Gregorian date and observed the error panel, then opened an as-of date with no matching invoices and observed the empty drill-down state. The guarded feature suite also verified 403/redirect behavior for an authenticated user with no active-organization membership.

Boundary readbacks returned no overdue balance for an invoice due on `2026-11-24`, `1,000,000` IRR overdue on `2026-11-25` before the future-effective `2026-11-26` collection, and `600,000` IRR on `2026-11-26`. A second same-organization book returned `0` net sales. The run traversed the confirmed sale order, separately approved purchase request, closed purchase order/receipt, and customer/supplier settlement cards. Customer invoice `1,000,000` minus `400,000` collected left `600,000` IRR / `60,000` Toman; supplier invoice `500,000` minus `200,000` paid left `300,000` IRR. The local walkthrough command replay returned the same source IDs and did not add duplicate operations, receipts, invoices, settlements, or journals.

At 1280×900 the four tiles fit in the workspace viewport. At 390×844 the mobile document/client widths were 375/375 CSS px; after scrolling to the content end, the report cleared the fixed dock by 82.08 px. Tab focus was visible. Bright forced fallback retained three shared glass surfaces and zero active SVG-refraction surfaces. The live route loaded both the Vite client and `dashboard.css`; Chrome reported zero runtime errors.

The user's existing Chrome profile was signed out at the local ERP route. The acceptance harness used a separate temporary Chrome profile and the ignored local P03 editor fixture; no credential was entered into the user's open Chrome profile. The direct user-profile tab was closed after confirming its sign-in state.

| View | Screenshot |
|---|---|
| Four dashboard metrics, 1280×900 | [P11 desktop dashboard](screenshots/p11-dashboard-desktop-2026-11-26T11-49-52-906Z.png) |
| Filtered overdue-receivable source rows, 1280×900 | [P11 overdue drill-down](screenshots/p11-overdue-details-desktop-2026-11-26T11-49-52-906Z.png) |
| Customer sale/order/issue/invoice/collection link, 1280×900 | [P11 customer journey](screenshots/p11-customer-journey-desktop-2026-11-26T11-49-52-906Z.png) |
| Purchase approval/order/receipt/invoice/payment link, 1280×900 | [P11 supplier journey](screenshots/p11-supplier-journey-desktop-2026-11-26T11-49-52-906Z.png) |
| Dashboard at the top of the mobile viewport, 390×844 | [P11 mobile dashboard](screenshots/p11-dashboard-mobile-2026-11-26T11-49-52-906Z.png) |
| Dashboard at scroll end in bright forced fallback, 390×844 | [P11 bright fallback](screenshots/p11-dashboard-bright-fallback-mobile-2026-11-26T11-49-52-906Z.png) |

**P11 status: ACCEPTED (2026-11-26) at the local dashboard and synthetic walkthrough boundary.** The focused guarded suite passed 5 tests / 122 assertions and the full suite passed 90 / 1,083. `npm run typecheck`, `npm run build`, changed-file Pint, Node syntax, and `git diff --check` passed. The repeat harness is [scripts/Verify-P11Browser.mjs](../scripts/Verify-P11Browser.mjs). It reads dashboard/source records and saves screenshots; the provisioning command separately creates the synthetic business journeys.

## P12 projects and assigned-work evidence

P12 keeps the shared workspace shell and Liquid Glass navigation as the command layer. The project detail is the focal content surface; status counts form one compact rail, while task records stay on sharp, solid surfaces. Desktop uses the existing Lens Inspector hierarchy. Mobile keeps a single task surface and the P12 project/inbox links in the existing bottom dock.

Chrome acceptance used an isolated task-prefixed OS-temporary profile and the existing local P03 editor/P08 approver credentials. It created or reused synthetic project `پذیرش مرورگر P12`, assigned `وظیفهٔ محول‌شدهٔ P12` to the distinct P08 editor, added project/task text comments, and linked P11 purchase order `PO-000009` line 9. The project shows exactly `500,000` IRR committed, and its link opened and scrolled to the original P08 line. The assignee's inbox contained 1 open task and 1 due reminder. Repeated reminder processing created 0 additional records; after completion and refresh the inbox open/reminder counts were both 0. The project list and board both showed 0 open and 1 completed task.

At 1280×900 Chrome captured the project and linked purchase line. At 390×844 the inbox had 375/375 CSS-pixel document/client widths, its mobile dock was visible, and the content cleared the dock by 100.23 px at the initial position and 194.23 px at scroll end. Keyboard focus was visible. Bright forced fallback retained six shared glass surfaces and zero active refraction surfaces. The live Vite client and `project-work.css` loaded; Chrome reported zero runtime/network errors.

| View | Screenshot |
|---|---|
| Project detail, task list, summary counts, and purchase commitment, 1280×900 | [P12 project desktop](screenshots/p12-project-desktop-2026-11-26T18-19-15-239Z.png) |
| Source P08 purchase order line 9 opened from the project, 1280×900 | [P12 purchase-line trace](screenshots/p12-purchase-line-source-desktop-2026-11-26T18-19-15-239Z.png) |
| Assigned editor's inbox with its due reminder, 390×844 | [P12 assigned inbox](screenshots/p12-assigned-inbox-mobile-2026-11-26T18-19-15-239Z.png) |
| Assigned task details and completion action, 390×844 | [P12 assigned task](screenshots/p12-assigned-task-detail-mobile-2026-11-26T18-19-15-239Z.png) |
| Completed project state, 0 open / 1 completed, 1280×900 | [P12 completed project](screenshots/p12-completed-project-desktop-2026-11-26T18-19-15-239Z.png) |
| Project in bright forced fallback at scroll end, 390×844 | [P12 bright fallback](screenshots/p12-bright-fallback-mobile-2026-11-26T18-19-15-239Z.png) |

The repeat harness is [scripts/Verify-P12Browser.mjs](../scripts/Verify-P12Browser.mjs). It reuses the synthetic project, task, comment, and purchase association, uses only a temporary Chrome profile, and does not print credentials. The date-boundary and reminder-reassignment cases are covered by fixed-clock guarded feature tests. P12's focused suite passed 7 tests / 133 assertions; the full serial guarded suite passed 97 / 1,216. `npm run typecheck`, `npm run build`, changed-file Pint, PHP/Node syntax, and `git diff --check` passed. **P12 status: ACCEPTED (2026-11-26) at the local project-work boundary.**
