# DP-002 — $100K Funnel Revenue Calculator

**Version 0.3.2** (calculation engine 2.0.0, data schema 2). See `CHANGELOG.md`.

Models how a main product, order bump, upsell, downsell and one-time offer work together to raise average order value (AOV), revenue and profit. Dependency-free; runs in the browser and on the server.

```bash
npm test        # 32 tests, Node 18+
```

```js
import { calculate, compareScenarios, defaultScenarios } from './src/calc.js';

const r = calculate({
  price: 27, visitors: 5000, conversionRate: 0.02,
  offers: {
    bump:     { enabled: true, price: 17,  rate: 0.35 },
    upsell:   { enabled: true, price: 97,  rate: 0.25 },
    downsell: { enabled: true, price: 47,  rate: 0.20 },   // only upsell decliners
    oto:      { enabled: true, price: 297, rate: 0.10 },
  },
});
r.results.aov;            // 93.95
r.results.grossRevenue;   // 9395
r.offers;                 // itemized: eligible, buyers, revenue per offer
r.goals.revenue;          // requiredBuyers, requiredVisitors, requiredBuyersAtTargetAov…
r.notes;                  // plain-language reasons whenever a value is null
```

Rates are decimals (35% = `0.35`). Errors use dotted keys, e.g. `errors['offers.upsell.rate']`.

## Funnel model

| Offer | Who sees it | Charge |
|---|---|---|
| Main product | Visitors; buyers = visitors × conversion | New charge |
| Order bump | Every initial buyer, at checkout | Same charge as main |
| Upsell | Every initial buyer | New charge |
| Downsell | Only buyers who decline the upsell; requires an upsell | New charge |
| One-time offer | Initial buyers × reach rate (100% in MVP) | New charge |

AOV = gross funnel revenue ÷ initial buyers, from the modeled acceptance rates. The most one buyer could spend (main + bump + the larger of upsell or downsell + OTO) is shown separately.

## Decision log

Locked with Malissa, 2026-10-08:

| # | Decision | How the engine handles it |
|---|----------|---------------------------|
| 1 | Refunds and fees | Fees are charged on every sale and are **not** returned on refunds. Refunds are occasional, case-by-case events. |
| 2 | Ad spend in goals | Treated as a **fixed monthly budget**. The profit goal notes that scaling usually takes more ad spend and cost per visitor rises. |
| 3 | Profit goal | Required buyers = (profit goal + ad spend + operating costs) ÷ contribution per buyer. Unreachable when each buyer loses money, with the reason explained. |
| 4 | Rounding | Required buyers round **up**; required visitors come from the rounded buyers, also rounded up. Projections stay as decimals. |
| 5 | Acquisition cost | Labeled **cost per buyer** (blended): ad spend ÷ all initial buyers. |
| 6 | Per-sale costs | Fulfillment applies to **every** sale of an offer, including refunded ones. |

Added for the funnel model in v0.3.0 (assumptions, open to change):

| # | Assumption | Why |
|---|-----------|-----|
| 7 | The fixed processing fee is charged **once per charge**: main + bump share one; upsell, downsell and OTO are one each. | The brief says the bump is added to the original transaction; post-purchase offers are separate one-click charges in GHL. |
| 8 | **One refund rate** applies to all funnel revenue. | Keeps the MVP simple; per-offer refund rates can come later. |
| 9 | **ROAS** = funnel revenue before refunds ÷ ad spend. | The common industry definition. |
| 10 | The **revenue goal is measured after refunds**. | Consistent with decision 1 and the original calculator. |
| 11 | **AOV is always shown**, even with zero buyers, because it comes from acceptance rates. | Lets customers design order value before they have traffic. |
| 12 | Default scenarios are **½×, 1× and 1½×** the customer's conversion and acceptance rates, capped at 100%. | Each scenario is fully editable. |

## UI guidance

**Make it fluid and motivating.** Recalculate on every keystroke, slider move or toggle. `additionalVisitors` drives the "You're X visitors away" line; `requiredConversionRate` and `requiredBuyersAtTargetAov` show the other two levers.

**Keep the honesty guardrails visible.** Show `DEFINITIONS.disclaimer` near the results, not hidden in a footer. Use wording like "at these numbers" or "your plan shows", and never "you will earn." Label every default as illustrative and editable. Because this is a paid product, the in-app copy and the sales page both need to avoid sounding like income promises.

**Definitions.** `DEFINITIONS` provides plain-language text for each output, for tooltips and the exported report (RC-10).

## Prototype page and deploying

`index.html` is the branded calculator. It imports `src/calc.js` directly, so there is no build step.

On Vercel: Framework Preset **Other**, Build Command **empty**, Output Directory **empty**. If these files sit inside a subfolder of the repo, set Root Directory to that folder.

A product name is required before the page calculates anything; until then sliders, results, goals, scenarios, saving and the report are locked. The engine itself does not require a name, so server-side use is unaffected.

Named saves and the working state live in the visitor's own browser (`localStorage`, keyed by data schema). Account-based saving comes with GHL access control. The report uses the browser's print dialog (Save as PDF), with a dedicated print layout.

## Selling through GoHighLevel

Purchase happens in GoHighLevel. The planned access flow:

1. Customer buys through a GHL order form.
2. GHL grants access to a membership product (or fires a workflow webhook).
3. The calculator is shown inside that membership area as an embedded page:

```html
<iframe id="pig-calc" src="https://YOUR-VERCEL-DOMAIN/?embed=1"
        style="width:100%;border:0;min-height:1400px" title="Revenue Calculator"></iframe>
<script>
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'pig-revenue-calculator:height') {
      document.getElementById('pig-calc').style.height = e.data.height + 'px';
    }
  });
</script>
```

`vercel.json` only allows the page to be framed by GoHighLevel domains and faststartpro.com. If the membership area runs on a different custom domain, add it to `frame-ancestors` there.

**Important:** framing limits *where* the page can be shown, but anyone who has the direct Vercel link can still open it. Real paid-only access needs the account step below (GHL webhook → account → login). Until then, treat the link as unlisted, not protected.

## Versioning rules

Bump `APP_VERSION` on every build. Bump `ENGINE_VERSION` when any formula changes, and `DATA_SCHEMA` when the saved format changes. Update `package.json`, the `app-version` meta tag and the `?v=` on the two imports in `index.html` to match, and add a `CHANGELOG.md` entry.

## Not yet built

Paid-only access and account-based saving; passing product names and prices in from DP-001 (future, not MVP); multi-currency formatting beyond the `currency` field.
