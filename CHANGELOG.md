# Changelog

All builds follow [semantic versioning](https://semver.org). The version lives in `src/version.js`, `package.json` and the `app-version` meta tag in `index.html`; keep all three in step.

- **APP_VERSION**: the product as a whole.
- **ENGINE_VERSION**: the calculation rules. Bump whenever a formula changes.
- **DATA_SCHEMA**: the shape of saved data. Bump when the saved format changes.

## [0.3.0] - 2026-10-08
Rebuilt to the **DP-002 $100K Funnel Revenue Calculator** spec, which replaces the single-product calculator.
### Engine 2.0.0 (breaking)
- Five funnel positions: main product (required), order bump, upsell, downsell, one-time offer.
- Order bump offered to all buyers, on the same charge. Upsell offered to all buyers. Downsell offered only to buyers who decline the upsell, and only when an upsell is on. OTO offered to initial buyers × reach rate (100% in the MVP).
- AOV calculated from modeled acceptance rates; shown separately from the most one buyer could spend.
- New metrics: ROAS, cost per buyer, break-even cost per buyer, per-offer buyers and revenue, per-offer fulfillment cost.
- Payment fixed fee charged once per charge (main + bump = one charge; upsell, downsell, OTO = one each).
- Goals: revenue, profit, and target AOV (gap, ceiling check, buyers needed at the target AOV).
- Scenarios hold independent traffic, conversion and acceptance rates; defaults are ½×, 1× and 1½× the customer's rates, capped at 100%.
- Disabled offers are not validated, contribute nothing, and create no buyers.
- 32 automated tests covering every case listed in the brief.
### Page
- Seven sections per the brief: main product, additional offers, costs, results dashboard, goal planner, scenario comparison, save and export.
- Offer cards on a visual funnel path with on/off switches, live "who sees this" counts and per-offer yield.
- Save, reopen and delete named funnels (this browser). Downloadable PDF report via the print dialog.
- "Use $100K a year" shortcut for the revenue goal.
### Data schema 2
- Saved data from 0.2.x is not carried over (single-product format).

## [0.2.0] - 2026-10-08
### Changed
- Complete redesign in Priddy Impact Group brand: deep teal `#004053`, slate `#687083`, gold `#BEAE88`, white. Poppins throughout.
- Gold-foil profit figure with a count-up on every change; animated progress rings for each goal (`@property` + `conic-gradient`); gold-filled sliders; container-query layouts; frosted mobile profit bar.
### Added
- GoHighLevel embedding: `?embed=1` hides the header, makes the page background transparent and posts its height to the parent page so the iframe fits its content.
- `vercel.json` allowing the calculator to be framed by GoHighLevel and faststartpro.com domains only.
- Versioning: `src/version.js`, version shown in the footer, results stamped with the engine version, saved data stamped with schema and versions, cache-busted script imports.
- Brand assets in `assets/`.
### Engine 1.1.0
- Every result now includes `engineVersion`.

## [0.1.1] - 2026-10-08
### Added
- First prototype page (`index.html`).
- Engine: conversion rate needed to reach each goal at current traffic (`requiredConversionRate`).

## [0.1.0] - 2026-10-08
### Added
- Calculation engine and test suite, built on the six locked model decisions.
