# Security

This section records application access boundaries and their enforcement points.

- [Organization access](organization-access.md) — session, membership, product scope, CSRF, role policy, and audit behavior.
- [P04 master-data isolation](p04-master-data-isolation.md) — scoped relationships, selector filtering, price resolution, and editor policy.
- [P05 sales isolation](p05-sales-isolation.md) — organization-scoped documents, role capability, transitions, and transactional conversion.
- [P06 stock isolation](p06-stock-isolation.md) — active-organization scoping, reader/editor permission, location pairing, and concurrent writes.
- [P07 fulfillment isolation](p07-sales-fulfillment.md) — order-line scoping, editor-only fulfillment, foreign-ID hiding, and P06 release-route protection.
- [P08 purchasing isolation](p08-purchasing.md) — separate-editor approval, supplier-role checks, organization-scoped receipt fields, and retry/lock enforcement.
- [P09 accounting isolation](p09-accounting.md) — reader review, editor posting, scope checks, and transaction lock order.
- [P10 settlement isolation](p10-settlement.md) — active-organization scoping, editor/CSRF writes, retry safety, P09 transaction boundary, and synthetic posting gate.
- [P11 reporting isolation](p11-reporting.md) — authenticated read access, active-organization scope, book ownership checks, and the local-only seed boundary.
