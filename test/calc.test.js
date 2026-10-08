import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculate, compareScenarios, defaultScenarios, validateInputs, DEFAULT_INPUTS, OFFER_KEYS,
} from '../src/calc.js';
import { ENGINE_VERSION } from '../src/version.js';

const close = (actual, expected, msg = '') =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${msg} expected ${expected}, got ${actual}`);
const offer = (r, key) => r.offers.find((o) => o.key === key);

// Defaults match the brief's screenshot: $27 main, 100 buyers, 17/35%, 97/25%, 47/20%, 297/10%.
const base = DEFAULT_INPUTS;
const offersOff = Object.fromEntries(OFFER_KEYS.map((k) => [k, { enabled: false }]));
const withOffers = (patch) => ({
  ...base,
  offers: Object.fromEntries(OFFER_KEYS.map((k) => [k, { ...base.offers[k], ...(patch[k] || {}) }])),
});

/* ---------- The brief's worked example ---------- */

test('reproduces the five-offer example: $9,395 revenue and $93.95 AOV', () => {
  const r = calculate(base);
  assert.equal(r.ok, true);
  close(r.results.buyers, 100, 'buyers');
  close(offer(r, 'main').revenue, 2700, 'main');
  close(offer(r, 'bump').revenue, 595, 'bump');
  close(offer(r, 'upsell').revenue, 2425, 'upsell');
  close(offer(r, 'downsell').revenue, 705, 'downsell');
  close(offer(r, 'oto').revenue, 2970, 'oto');
  close(r.results.grossRevenue, 9395, 'gross');
  close(r.results.aov, 93.95, 'aov');
});

test('costs and profit for the example', () => {
  const x = calculate(base).results;
  close(x.refundedRevenue, 281.85);
  close(x.netRevenue, 9113.15);
  close(x.charges, 150, 'main+bump share a charge; upsell 25 + downsell 15 + OTO 10 are separate');
  close(x.processingFees, 9395 * 0.029 + 150 * 0.3);
  close(x.contributionProfit, 7295.695);
  close(x.operatingProfit, 7195.695);
  close(x.cac, 15);
  close(x.roas, 9395 / 1500);
  close(x.revenuePerVisitor, 9113.15 / 5000);
  close(x.breakEvenCac, 87.95695);
  close(x.maxCheckoutValue, 27 + 17 + 97 + 297, 'upsell OR downsell, never both');
});

test('totals equal buyers × per-buyer values', () => {
  const x = calculate(base).results;
  close(x.buyers * x.retainedRevenuePerBuyer, x.netRevenue);
  close(x.buyers * x.contributionPerBuyer - x.adSpend, x.contributionProfit);
});

/* ---------- Branching and toggles ---------- */

test('downsell is offered only to buyers who declined the upsell', () => {
  const r = calculate(base);
  close(offer(r, 'downsell').eligible, 75);
  close(offer(r, 'downsell').buyers, 15);
  assert.ok(offer(r, 'upsell').buyers + offer(r, 'downsell').buyers <= r.results.buyers);
});

test('100% upsell acceptance leaves nobody for the downsell', () => {
  const r = calculate(withOffers({ upsell: { rate: 1 } }));
  close(offer(r, 'downsell').eligible, 0);
  close(offer(r, 'downsell').buyers, 0);
  close(offer(r, 'upsell').buyers, 100);
});

test('0% upsell acceptance sends every buyer to the downsell', () => {
  const r = calculate(withOffers({ upsell: { rate: 0 } }));
  close(offer(r, 'downsell').eligible, 100);
  close(offer(r, 'downsell').revenue, 940);
});

test('100% acceptance on every offer', () => {
  const r = calculate(withOffers({ bump: { rate: 1 }, upsell: { rate: 1 }, downsell: { rate: 1 }, oto: { rate: 1 } }));
  close(r.results.aov, 27 + 17 + 97 + 297);
  close(r.results.aov, r.results.maxCheckoutValue, 'AOV hits the ceiling only when everyone says yes');
});

test('disabled offers add no revenue and no buyers', () => {
  const r = calculate(withOffers({ bump: { enabled: false } }));
  close(offer(r, 'bump').buyers, 0);
  close(offer(r, 'bump').revenue, 0);
  close(r.results.grossRevenue, 9395 - 595);
});

test('a downsell without an upsell stays off and explains why', () => {
  const r = calculate(withOffers({ upsell: { enabled: false } }));
  assert.equal(offer(r, 'downsell').active, false);
  close(offer(r, 'downsell').revenue, 0);
  close(r.results.grossRevenue, 2700 + 595 + 2970);
  assert.match(r.notes.downsell, /decline an upsell/);
});

test('OTO reach rate limits who sees it (100% by default)', () => {
  close(offer(calculate(base), 'oto').eligible, 100);
  const r = calculate(withOffers({ oto: { reachRate: 0.5 } }));
  close(offer(r, 'oto').eligible, 50);
  close(offer(r, 'oto').buyers, 5);
});

test('every offer combination: totals equal the sum of active offers', () => {
  for (let mask = 0; mask < 16; mask++) {
    const patch = {};
    OFFER_KEYS.forEach((k, idx) => { patch[k] = { enabled: Boolean(mask & (1 << idx)) }; });
    const r = calculate(withOffers(patch));
    assert.equal(r.ok, true);
    const sum = r.offers.reduce((s, o) => s + o.revenue, 0);
    close(r.results.grossRevenue, sum, `mask ${mask}`);
    for (const o of r.offers) if (!o.active) assert.equal(o.revenue, 0, `${o.key} off in mask ${mask}`);
  }
});

test('single-product mode reproduces the original calculator ($63.94)', () => {
  const r = calculate({ ...base, price: 17, visitors: 1000, adSpend: 200, fixedCosts: 50, revenueGoal: 2000, profitGoal: 1000, offers: offersOff });
  close(r.results.operatingProfit, 63.94);
  close(r.results.aov, 17);
  assert.equal(r.goals.revenue.requiredBuyers, 122);
  assert.equal(r.goals.revenue.requiredVisitors, 6100);
  assert.equal(r.goals.profit.requiredBuyers, 80);
});

test('fulfillment costs apply per sale of each offer', () => {
  const r = calculate(withOffers({ upsell: { fulfillmentCost: 5 } }));
  close(r.results.fulfillmentCosts, 125);
  close(r.results.operatingProfit, 7195.695 - 125);
});

/* ---------- Zero and extreme cases ---------- */

test('zero traffic: no errors, AOV still shown from rates', () => {
  const r = calculate({ ...base, visitors: 0 });
  assert.equal(r.ok, true);
  close(r.results.buyers, 0);
  close(r.results.grossRevenue, 0);
  close(r.results.aov, 93.95);
  assert.ok(r.notes.aov);
  assert.equal(r.results.cac, null);
  assert.ok(r.notes.cac);
  assert.equal(r.results.revenuePerVisitor, null);
  close(r.results.operatingProfit, -1600);
  assert.equal(r.results.isLosingMoney, true);
  assert.equal(r.goals.revenue.requiredVisitors, 5500);
});

test('zero conversion: buyers needed shown, traffic explained instead of Infinity', () => {
  const r = calculate({ ...base, conversionRate: 0 });
  assert.equal(r.goals.revenue.requiredBuyers, 110);
  assert.equal(r.goals.revenue.requiredVisitors, null);
  assert.match(r.goals.revenue.notes.requiredVisitors, /0% conversion/);
  const scan = (obj) => Object.values(obj).forEach((v) => {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), 'no Infinity/NaN');
  });
  scan(r.results);
});

test('zero ad spend: CAC is $0 and ROAS does not apply', () => {
  const r = calculate({ ...base, adSpend: 0 });
  assert.equal(r.results.cac, 0);
  assert.equal(r.results.roas, null);
  assert.ok(r.notes.roas);
});

test('refunds reduce revenue but fees are not returned', () => {
  const r = calculate({ ...base, refundRate: 0.5 });
  close(r.results.netRevenue, 4697.5);
  close(r.results.processingFees, 9395 * 0.029 + 45);
});

test('100% refunds: revenue and profit goals unreachable', () => {
  const r = calculate({ ...base, refundRate: 1 });
  assert.equal(r.goals.revenue.reachable, false);
  assert.ok(r.goals.revenue.notes.requiredBuyers);
  assert.equal(r.goals.profit.reachable, false);
});

test('negative profit is flagged', () => {
  const r = calculate({ ...base, adSpend: 10000 });
  close(r.results.operatingProfit, 7195.695 - 8500);
  assert.equal(r.results.isLosingMoney, true);
});

test('when each buyer loses money, the profit goal is unreachable', () => {
  const r = calculate({ ...base, price: 1, fulfillmentCost: 5, offers: offersOff });
  assert.ok(r.results.contributionPerBuyer < 0);
  assert.ok(r.notes.breakEvenCac);
  assert.equal(r.goals.profit.reachable, false);
});

/* ---------- Goals ---------- */

test('revenue goal: buyers, traffic, conversion lever, and buyers needed at target AOV', () => {
  const g = calculate(base).goals.revenue;
  assert.equal(g.requiredBuyers, 110); // 10,000 / 91.1315 = 109.73
  assert.equal(g.requiredVisitors, 5500);
  assert.equal(g.additionalVisitors, 500);
  close(g.requiredConversionRate, 0.022);
  assert.equal(g.requiredBuyersAtTargetAov, 35); // 10,000 / (300 × 0.97) = 34.36
});

test('profit goal counts ad spend and fixed costs; already reached at current traffic', () => {
  const g = calculate(base).goals.profit;
  assert.equal(g.requiredBuyers, 76); // 6,600 / 87.95695 = 75.04
  assert.equal(g.requiredVisitors, 3800);
  assert.equal(g.additionalVisitors, 0);
  assert.match(g.notes.adSpend, /ad budget/);
});

test('AOV goal: gap, reached, and beyond the funnel ceiling', () => {
  const g = calculate(base).goals.aov;
  close(g.gap, 206.05);
  assert.equal(g.reached, false);
  assert.equal(g.reachable, true);
  const low = calculate({ ...base, aovGoal: 50 }).goals.aov;
  assert.equal(low.reached, true);
  close(low.gap, 0);
  const high = calculate({ ...base, aovGoal: 500 }).goals.aov;
  assert.equal(high.reachable, false);
  assert.ok(high.notes.gap);
});

test('blank goals are skipped; zero goal needs zero buyers', () => {
  const r = calculate({ ...base, revenueGoal: 0, profitGoal: '', aovGoal: '' });
  assert.equal(r.goals.revenue.requiredBuyers, 0);
  assert.equal(r.goals.profit, null);
  assert.equal(r.goals.aov, null);
});

test('rounding ignores floating-point dust', () => {
  const r = calculate({ ...base, price: 10, refundRate: 0, conversionRate: 0.07, revenueGoal: 70, offers: offersOff });
  assert.equal(r.goals.revenue.requiredBuyers, 7);
  assert.equal(r.goals.revenue.requiredVisitors, 100);
});

/* ---------- Scenarios ---------- */

test('default scenarios scale conversion and acceptance rates (½×, 1×, 1½×)', () => {
  const s = compareScenarios(base);
  close(s.conservative.results.buyers, 50);
  close(s.expected.results.buyers, 100);
  close(s.optimistic.results.buyers, 150);
  close(s.conservative.results.aov, 61.0625);
  close(s.expected.results.aov, 93.95);
  close(s.optimistic.results.aov, 125.6625);
});

test('scaled rates are capped at 100%', () => {
  const sc = defaultScenarios(withOffers({ bump: { rate: 0.9 } }));
  assert.equal(sc.optimistic.offers.bump.rate, 1);
});

test('each scenario has independent acceptance rates', () => {
  const s = compareScenarios(base, {
    a: { offers: { upsell: { rate: 0.5 } } },
    b: { conversionRate: 0.04 },
  });
  close(offer(s.a, 'upsell').buyers, 50);
  close(offer(s.a, 'downsell').eligible, 50);
  close(s.b.results.buyers, 200);
  close(offer(s.b, 'upsell').buyers, 50, 'b keeps the base 25% upsell rate');
});

/* ---------- Validation ---------- */

test('validation: invalid percentages, negative prices, missing main price', () => {
  assert.ok(validateInputs({ price: '' }).errors.price);
  assert.ok(validateInputs({ price: -5 }).errors.price);
  assert.ok(validateInputs({ conversionRate: 1.5 }).errors.conversionRate);
  assert.ok(validateInputs(withOffers({ bump: { price: -1 } })).errors['offers.bump.price']);
  assert.ok(validateInputs(withOffers({ upsell: { rate: 1.2 } })).errors['offers.upsell.rate']);
  assert.ok(validateInputs(withOffers({ oto: { price: 0 } })).errors['offers.oto.price']);
});

test('a disabled offer with bad input does not block results', () => {
  const r = calculate(withOffers({ bump: { enabled: false, price: 'abc', rate: 5 } }));
  assert.equal(r.ok, true);
});

test('accepts form strings', () => {
  const { inputs, errors } = validateInputs({ price: '$1,299.00', adSpend: '', offers: { bump: { enabled: 'true', price: '17', rate: '0.35' } } });
  assert.deepEqual(errors, {});
  assert.equal(inputs.price, 1299);
  assert.equal(inputs.adSpend, 0);
  assert.equal(inputs.offers.bump.enabled, true);
});

test('results carry the engine version', () => {
  assert.equal(calculate(base).engineVersion, ENGINE_VERSION);
  assert.equal(calculate({ price: -1 }).engineVersion, ENGINE_VERSION);
});
