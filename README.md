# Digital Product Revenue Calculator — Calculation Engine

The tested math for Project 2. It has no dependencies, runs in the browser and on the server, and drops straight into a React/Vite app.

```bash
npm test        # 17 tests, Node 18+
```

```js
import { calculate, compareScenarios, DEFINITIONS, formatMoney } from './src/calc.js';

const r = calculate({ price: 17, visitors: 1000, conversionRate: 0.02 /* … */ });
if (!r.ok) showErrors(r.errors);              // { price: 'Product price is required.' }
r.results.operatingProfit;                     // 63.94
r.goals.revenue.requiredOrders;                // 122
r.goals.revenue.additionalVisitors;            // 5100  → "You're 5,100 visitors away"
r.notes.revenuePerVisitor;                     // plain-language reason when a value is null
```

Rates are decimals (2% = `0.02`). The UI converts to and from percentages. Money values come back at full precision, so round them only for display.

## Decision log (locked 2026-10-08)

| # | Decision | How the engine handles it |
|---|----------|---------------------------|
| 1 | Refunds and processing fees | Fees are charged on every order and are **not** returned on refunds. Refunds are treated as occasional, case-by-case events. |
| 2 | Ad spend in goal calculations | Treated as a **fixed monthly budget**. The profit-goal result includes a note that scaling usually takes a bigger ad budget and that cost per visitor tends to rise. |
| 3 | Profit goal | Required orders = (profit goal + ad spend + fixed costs) ÷ contribution per order. If each sale loses money, the goal is marked unreachable and the reason is explained. |
| 4 | Rounding | Required orders round **up** to whole sales. Required visitors are calculated from the rounded orders, then also rounded up. Projected orders stay as decimals (expected values). |
| 5 | Acquisition cost | Labeled **blended**: ad spend ÷ all orders. The definition explains that true paid cost is higher if some buyers came in organically. |
| 6 | Per-sale costs | Apply to **every** order, including refunded ones, since digital products are delivered before a refund. |

## Edge cases

The engine never returns `Infinity` or `NaN`. When a value can't be determined, it returns `null` and puts a plain-language explanation in `notes`:

- 0 visitors → no revenue per visitor and no acquisition cost. Goal results still show the traffic needed.
- 0% conversion → required orders are shown; required visitors are explained instead of calculated.
- 100% refunds, or a price below per-sale costs → the goal is marked `reachable: false` with the reason.
- An operating loss → `isLosingMoney: true`, so the UI can flag it.

## UI guidance

**Make it fluid and motivating.** Recalculate on every keystroke or slider move. Show both goal panels live next to the projections, so every change instantly shows its effect on income *and* on what it takes to get there. `additionalVisitors` supports a "You're X visitors away from your goal" line. Sliders for price and conversion make the math feel playful.

**Keep the honesty guardrails visible.** Show `DEFINITIONS.disclaimer` near the results, not hidden in a footer. Use wording like "at these numbers" or "your plan shows", and never "you will earn." Label every default as illustrative and editable. Because this is a paid product, the in-app copy and the sales page both need to avoid sounding like income promises.

**Definitions.** `DEFINITIONS` provides plain-language text for each output, for tooltips and the exported report (RC-10).

## Prototype page and deploying

`index.html` is a working prototype of the calculator screen. It imports `src/calc.js` directly, so there is no build step.

On Vercel: Framework Preset **Other**, Build Command **empty**, Output Directory **empty**. If these files sit inside a subfolder of the repo, set Root Directory to that folder.

The prototype remembers the last numbers in the visitor's own browser. Real accounts and server-side saving come later.

## Not yet built

Account-based saving (RC-08), the report export (RC-09), and multi-currency formatting beyond the `currency` field.
