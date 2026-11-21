---
type: Architecture Decision
title: P05 Toman Sales Snapshots and Order Conversion
description: Records the P05 currency boundary, snapshot refresh timing, exact rounding, and transactional conversion rules.
tags:
  - decision
  - sales
  - pricing
  - data-integrity
status: accepted
---

# ADR-004: P05 Toman Sales Snapshots and Order Conversion

## Decision

- Keep P04 price-list storage as whole integer rials. P05 sales documents are denominated in toman and copy the source rial amount exactly as tenths of a toman. This is a unit conversion, not a change to existing P04 values.
- Accept positive quantity strings with three decimal places and discounts from 0.00% through 100.00%. Store discount basis points and use scaled-integer arithmetic only.
- Round each calculated line once to a whole toman using half-up rounding, then sum those line amounts. Reject unsupported precision, input range, and arithmetic overflow.
- Resolve and snapshot price when a draft line is added or explicitly repriced. Quantity/discount edits preserve the current price; confirmation and conversion never re-resolve it.
- Copy product/unit references and display values, customer/lead/list snapshots, and all calculated amounts into confirmed documents.
- Confirmed quote conversion is one locked database transaction. Enforce one order per source quote with a unique database constraint and one copied order line per source quote line. Retry returns the existing order.

## Rationale

P04's accepted Rial master-data contract remains stable while P05 presents amounts in the requested Toman unit. Keeping one tenth of a toman as the persisted snapshot scale exactly represents any whole-rial P04 price without floats. Snapshots keep confirmed documents readable after price or master-data labels change. A unique source relationship and transaction make duplicate submissions safe and give P07 a stable line interface.

## Consequences

P05 API money values are exact strings. `unit_price_toman` may have one decimal place; line and document net values are whole toman. The P05 demo price list stores 1,200,000/1,350,000 rials to render 120,000.0/135,000.0 toman. P04 remains labeled in rials. Stock, reservation, and fulfillment behavior is not implied by a confirmed sales order.

See [P05 data and calculation](../data/p05-sales-documents.md), [workflow](../architecture/p05-sales-workflow.md), and [sales isolation](../security/p05-sales-isolation.md).
