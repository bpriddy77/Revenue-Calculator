# DP-002 — Authority Funnel Revenue Calculator

**Version 0.7.0** (calculation engine 3.0.0, data schema 4). See `CHANGELOG.md`.

Helps coaches, consultants and service providers plan an authority funnel: five evergreen digital products (main product, order bump, upsell, downsell, one-time offer) that showcase their expertise and lead buyers toward bigger one-on-one work. Models how the five work together on average order value (AOV), revenue and profit. Dependency-free; runs in the browser and on the server.

```bash
npm test        # 52 tests, Node 18+
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

Three order-value figures are shown side by side, because the gap between them is the core teaching point of the Offer Map:

| Figure | Meaning | Field |
|---|---|---|
| Main product price | What every buyer initially purchases | `results.mainPrice` |
| Projected AOV | Average revenue per initial buyer after take rates (gross funnel revenue ÷ initial buyers) | `results.aov` |
| Total available offer value | Combined price if one buyer accepts every offer they can see: main + bump + the higher of upsell or downsell + OTO | `results.totalOfferValue` |

## Decision log

Locked with Malissa, 2026-10-08:

| # | Decision | How the engine handles it |
|---|----------|---------------------------|
| 1 | Refunds and fees | Fees are charged on every sale and are **not** returned on refunds. Refunds are occasional, case-by-case events. |
| 2 | Ad spend in goals | **Ads + social mode (default, v0.7.0):** ad spend grows with the visitors a goal needs, at the customer's cost per click; the note says cost per click usually rises with spend. **Direct visitors mode:** ad spend stays a fixed monthly budget, as before. |
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

## Traffic model (v0.7.0)

| Mode | Visitors | Notes |
|---|---|---|
| Ads + social reach (default) | ad spend ÷ cost per click + social reach × click-through | Cost per click, reach and click-through are example values the customer replaces. No presets. |
| I know my monthly visitors | entered directly | Ad spend is still counted as a cost. |

In ads + social mode the profit goal solves for buyers with ad spend growing alongside paid visitors: profit = buyers × contribution − (visitors needed − social visitors) × cost per click − operating costs. When contribution per buyer is below cost per click ÷ conversion, more ads can't reach the goal and the page says why.

## Take rates: scenarios and sales data

**Scenario take rates** (`src/guidance.js`). Illustrative planning assumptions, not verified industry benchmarks or predictions. Never describe them as established statistics.

| Offer | Conservative (default) | Expected | Stretch |
|---|---|---|---|
| Main product conversion | 1% | 2% | 4% |
| Order bump | 10% | 20% | 35% |
| Upsell | 3% | 6% | 15% |
| Downsell | 2% | 4% | 8% |
| One-time offer | 2% | 5% | 10% |

New users start at Conservative and can switch every offer to Expected or Stretch in one click. The scenario comparison starts from these three columns with the customer's own traffic and conversion. Edit the numbers in one place; defaults, slider marks, buttons and scenarios all follow.

**Sales data** (`takeRatesFromData()` in `src/calc.js`). Experienced sellers enter, per step, how many people saw it and how many bought, over one consistent period:

| Step | "Saw it" means | Take rate |
|---|---|---|
| Main product | Sales page visitors | bought ÷ saw → front-end conversion |
| Order bump | Buyers shown the bump | bought ÷ saw |
| Upsell | Buyers shown the upsell | bought ÷ saw |
| Downsell | Upsell **decliners** shown the downsell | bought ÷ saw. "Saw" can't exceed upsell saw − upsell bought |
| One-time offer | Buyers shown the OTO | bought ÷ saw; reach = saw ÷ main buyers |

Impossible numbers are flagged and that row is not applied. Editing a rate by hand leaves sales-data mode ("Custom rates").

## UI guidance

**Make it fluid and motivating.** Recalculate on every keystroke, slider move or toggle. `additionalVisitors` drives the "You're X visitors away" line; `requiredConversionRate` and `requiredBuyersAtTargetAov` show the other two levers.

**Income-claim wording (FTC).** The product name, page and report avoid dollar figures and earnings language. Do not use "$100K", "passive income", "make money while you sleep", "guaranteed" or similar in the product name, page copy, report or sales page. Prefer "evergreen", "low-maintenance", "plan", "model" and "at these numbers". Example figures are always labeled as examples the customer replaces.

**Keep the honesty guardrails visible.** Show `DEFINITIONS.disclaimer` near the results, not hidden in a footer. Use wording like "at these numbers" or "your plan shows", and never "you will earn." Label every default as illustrative and editable. Because this is a paid product, the in-app copy and the sales page both need to avoid sounding like income promises.

**Definitions.** `DEFINITIONS` provides plain-language text for each output, for tooltips and the exported report (RC-10).

## Prototype page and deploying

`index.html` is the branded calculator. It imports `src/calc.js` directly, so there is no build step.

On Vercel: Framework Preset **Other**, Build Command **empty**, Output Directory **empty**. If these files sit inside a subfolder of the repo, set Root Directory to that folder.

No product name is required: the page starts with "My First Digital Product", which customers can change, and calculates immediately.

Named saves and the working state live in the visitor's own browser (`localStorage`, keyed by data schema). Account-based saving comes with GHL access control. The report uses the browser's print dialog (Save as PDF), with a dedicated print layout.

## Selling through GoHighLevel

Purchase happens in GoHighLevel. The planned access flow:

1. Customer buys through a GHL order form.
2. GHL grants access to a membership product (or fires a workflow webhook).
3. The calculator is shown inside that membership area as an embedded page:

```html
<iframe id="pig-calc" src="https://YOUR-VERCEL-DOMAIN/?embed=1"
        style="width:100%;border:0;min-height:1400px" title="Authority Funnel Revenue Calculator"></iframe>
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
