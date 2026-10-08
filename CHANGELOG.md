# Changelog

All builds follow [semantic versioning](https://semver.org). The version lives in `src/version.js`, `package.json` and the `app-version` meta tag in `index.html`; keep all three in step.

- **APP_VERSION**: the product as a whole.
- **ENGINE_VERSION**: the calculation rules. Bump whenever a formula changes.
- **DATA_SCHEMA**: the shape of saved data. Bump when the saved format changes.

## [0.7.0] - 2026-10-08
### Added
- **Traffic from ads and social reach.** Section 1 now asks where visitors come from: ad spend ÷ cost per click (paid) plus social reach × click-through (organic). Shows a live summary, e.g. "About 1,500 visitors from ads + 500 from social = 2,000 visitors a month", and what each buyer from ads costs in clicks (cost per click ÷ conversion). Customers who know their traffic can switch to "I know my monthly visitors".
- **Conversion rate switch** in Section 1: Conservative 1% / Expected 2% / Stretch 4% (from the DP-002 brief's scenario example) or **My sales data** (sales page visitors and buyers → actual conversion rate). Same wording and "illustrative planning assumptions" label as the offers, with tick marks and a live note under the slider.
- Beginner explanations with examples for traffic sources, cost per click, social reach, click-through and conversion rate.
- **Goals account for ad spend.** In ads + social mode, revenue and profit goals show the monthly ad spend they would take at the customer's cost per click. The profit goal now includes the extra ad spend, and explains when a goal can't be reached because each buyer from ads costs more in clicks than they bring in.
- Scenario comparison: ad spend replaces visitors in ads + social mode; initial scenarios also use the Conservative / Expected / Stretch conversion rates.
- Report includes the traffic breakdown and conversion rate.
### Changed
- Ad spend moved to Section 1, where it drives traffic; Costs shows it read-only.
- Main product data moved from the offers sales-data table to Section 1.
- Engine 3.0.0 (traffic model, goal math in ads + social mode). 52 tests.
- Cost per click ($1.00), social reach (25,000) and click-through (2%) are example values only, with no scenario presets.
### Data schema 4
- Older saves are migrated and keep the visitors they entered ("I know my monthly visitors").

## [0.6.0] - 2026-10-08
### Changed
- **No product name required.** The calculator starts with "My First Digital Product", which customers can edit; results, sliders, saving and the report work immediately. A blank name never blocks anything. (The v0.3.1 name gate is removed.)
- New headline: "Map your digital product offers, explore how each purchase contributes to your average order value, and see the numbers behind your revenue goals."
### Added
- **Short explanations where decisions happen.** The main product and every offer card show a one-line beginner-friendly definition and a practical example (order bump, upsell, downsell, one-time offer).
- **Funnel sequence** at the top of Additional offers: main product → order bump → upsell, or downsell if they say no → one-time offer. Shows live "see it / buy" counts and greys out offers that are off.
- **Order value comparison** in the results: Main product price, Projected AOV and Total available offer value, with a bar showing where the average sits against the ceiling, the price breakdown, and how much of the available value the average buyer captures. The ceiling counts the upsell or the downsell, whichever is higher, never both.
- PDF report lists all three order-value figures.
- Engine 2.3.0: `results.mainPrice` and `results.totalOfferValue`, definitions for each, default product name, 3 new tests (45 total).

## [0.5.0] - 2026-10-08
### Added
- **Take-rate switch** at the top of the offers section: Conservative, Expected, Stretch or **My sales data**. Conservative is the default for new users. Shows "Custom rates" when a seller sets their own.
- **My sales data**: for each step (main product, order bump, upsell, downsell, one-time offer), enter how many people saw it and how many bought. Actual take rates are calculated live and replace the assumptions.
  - The downsell rate is calculated only against people who declined the upsell and were shown the downsell. More downsell viewers than upsell decliners is flagged as an error; fewer is noted.
  - Add-on viewers above the number of main-product buyers are flagged.
  - The one-time offer's reach rate is taken from OTO viewers ÷ main buyers.
- New field in the one-time offer card: **Buyers who reach this offer** (default 100%).
- Engine: `takeRatesFromData()` and 7 new tests (42 total). Browser smoke test covers the switch and sales-data mode.
### Changed
- Scenario names are now **Conservative / Expected / Stretch** everywhere (the middle rate was "Planning"; the third scenario was "Optimistic").
- Initial scenario comparison uses the agreed take rates (bump 10/20/35%, upsell 3/6/15%, downsell 2/4/8%, OTO 2/5/10%) with the customer's own traffic and conversion in all three.
- Wording: "Not sure what percentage to enter? Start with our conservative planning scenario. Once you have actual sales data, replace these assumptions with your own results." The rates are labeled **illustrative planning assumptions, not verified industry benchmarks or predictions** in the offers section, scenarios and PDF report.
- Report states where the take rates came from (a scenario, custom, or the seller's own sales data).
### Data schema 3
- Saved funnels from 0.4.x and earlier (schema 2) are migrated automatically: the "optimistic" scenario becomes "stretch".

## [0.4.0] - 2026-10-08
### Added
- **Planning ranges** for each offer's acceptance rate (Conservative, Planning, Stretch), kept in `src/guidance.js`:
  order bump 10/20/35%, upsell 3/6/15%, downsell 2/4/8%, one-time offer 2/5/10%.
- Under every offer slider: tick marks at the three rates, one-tap buttons to apply each, and a live note saying where the current rate sits (e.g. "Above the stretch rate of 35%. Make sure you have results that support it.").
- "Not sure how many buyers will say yes?" panel in Section 2 with **Reset all to conservative**.
- Scenario comparison: **Use planning ranges for acceptance** fills Conservative / Expected / Optimistic with the three ranges.
- Ranges are labeled as planning starting points, not benchmarks or predictions.
### Changed
- New sellers now start at the conservative rate for every offer (engine 2.1.0 defaults). The brief's worked example moved into the test fixture.
- Sliders show a soft gold ring on the knob when focused instead of a box around the track.

## [0.3.4] - 2026-10-08
### Changed
- "Authority" in the page header is now brand gold (`#BEAE88`).

## [0.3.3] - 2026-10-08
### Changed
- Renamed to **Authority Funnel Revenue Calculator** (page title, header, report, footer, README, engine header).
- New subtitle: plan the five evergreen digital products that build your authority and lead clients to your bigger work.
- Income-claim cleanup for FTC compliance: removed every "$100K" reference from the name and page. The "Use $100K a year" shortcut is replaced by a neutral yearly-goal helper (enter any yearly amount; it fills in the monthly goal). The AOV hint no longer suggests a typical $300–$500 range.
- README gains a wording rule for page, report and sales copy.

## [0.3.2] - 2026-10-08
### Fixed
- Moving any slider now updates the results immediately. Added `test/ui-smoke.py`, a browser test that checks every slider, toggle and typed field updates results live. Sliders updated their number box but did not trigger a recalculation, so results only caught up on the next typed change (such as editing the product name).

## [0.3.1] - 2026-10-08
### Changed
- A product name is now required before anything is calculated. Until one is entered:
  - every slider is disabled;
  - the name field is highlighted in gold with a "Required" tag and a pulsing hint;
  - the results panel shows "Start by naming your product" with a button that jumps to the field;
  - the results details, goal planner and scenarios are dimmed with an "Add a product name to unlock" tag;
  - Save, Download report and Reset scenarios are disabled (opening an already saved funnel still works).
- A name made only of spaces does not count. Once named, results update live as before.
- Engine unchanged (2.0.0); this is a page-only change.

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
