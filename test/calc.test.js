import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculate, compareScenarios, defaultScenarios, validateInputs, takeRatesFromData, growthLevers, DEFAULT_INPUTS, OFFER_KEYS,
} from '../src/calc.js';
import { ENGINE_VERSION } from '../src/version.js';
import { PLANNING_RANGES, describeRate, matchingScenario, ASSUMPTION_LABEL } from '../src/guidance.js';

const close = (actual, expected, msg = '') =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${msg} expected ${expected}, got ${actual}`);
const offer = (r, key) => r.offers.find((o) => o.key === key);

// The brief's worked example: $27 main, 100 buyers, 17/35%, 97/25%, 47/20%, 297/10%.
const base = {
  ...DEFAULT_INPUTS,
  trafficMode: 'direct', // the example enters 5,000 visitors directly
  visitors: 5000,
  conversionRate: 0.02,
  adSpend: 1500,
  offers: {
    bump: { ...DEFAULT_INPUTS.offers.bump, rate: 0.35 },
    upsell: { ...DEFAULT_INPUTS.offers.upsell, rate: 0.25 },
    downsell: { ...DEFAULT_INPUTS.offers.downsell, rate: 0.2 },
    oto: { ...DEFAULT_INPUTS.offers.oto, rate: 0.1 },
  },
};
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

test('three order-value figures: main price ≤ projected AOV ≤ total available offer value', () => {
  const x = calculate(base).results;
  assert.equal(x.mainPrice, 27);
  close(x.totalOfferValue, 438, '27 + 17 + max(97, 47) + 297');
  close(x.aov, 93.95);
  assert.ok(x.mainPrice <= x.aov && x.aov <= x.totalOfferValue);
});

test('total available offer value uses the downsell when it is the higher branch', () => {
  const x = calculate(withOffers({ upsell: { price: 30 }, downsell: { price: 60 } })).results;
  close(x.totalOfferValue, 27 + 17 + 60 + 297);
});

test('the calculator works with the default product name', () => {
  assert.equal(DEFAULT_INPUTS.productName, 'My First Digital Product');
  assert.equal(calculate(DEFAULT_INPUTS).ok, true);
  assert.equal(calculate({ ...DEFAULT_INPUTS, productName: '' }).ok, true, 'a blank name never blocks results');
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

test('initial scenarios use the Conservative / Expected / Stretch take rates', () => {
  const sc = defaultScenarios(base);
  assert.deepEqual(Object.keys(sc), ['conservative', 'expected', 'stretch']);
  for (const b of ['conservative', 'expected', 'stretch']) {
    for (const k of OFFER_KEYS) assert.equal(sc[b].offers[k].rate, PLANNING_RANGES[k][b], `${b} ${k}`);
    assert.equal(sc[b].conversionRate, PLANNING_RANGES.main[b], 'conversion from the scenario');
    assert.equal(sc[b].visitors, 5000, 'keeps the customer traffic');
    assert.equal(sc[b].adSpend, 1500, 'keeps the customer ad spend');
  }
  const s = compareScenarios(base);
  close(s.conservative.results.aov, 27 + 17 * 0.10 + 97 * 0.03 + 47 * 0.97 * 0.02 + 297 * 0.02);
  close(s.expected.results.aov, 27 + 17 * 0.20 + 97 * 0.06 + 47 * 0.94 * 0.04 + 297 * 0.05);
  close(s.stretch.results.aov, 27 + 17 * 0.35 + 97 * 0.15 + 47 * 0.85 * 0.08 + 297 * 0.10);
  close(s.conservative.results.buyers, 50);
  close(s.expected.results.buyers, 100);
  close(s.stretch.results.buyers, 200);
});

test('each scenario has independent acceptance rates (any keys work)', () => {
  const s = compareScenarios(base, {
    a: { offers: { upsell: { rate: 0.5 } } },
    b: { conversionRate: 0.04 },
  });
  close(offer(s.a, 'upsell').buyers, 50);
  close(offer(s.a, 'downsell').eligible, 50);
  close(s.b.results.buyers, 200);
  close(offer(s.b, 'upsell').buyers, 50, 'b keeps the base 25% upsell rate');
});

/* ---------- Take rates from sales data ---------- */

const salesData = {
  main: { viewed: 5000, purchased: 100 },
  bump: { viewed: 100, purchased: 35 },
  upsell: { viewed: 100, purchased: 25 },
  downsell: { viewed: 75, purchased: 15 },
  oto: { viewed: 100, purchased: 10 },
};

test('sales data produces actual take rates', () => {
  const t = takeRatesFromData(salesData);
  assert.equal(t.ok, true);
  close(t.rates.main, 0.02);
  close(t.rates.bump, 0.35);
  close(t.rates.upsell, 0.25);
  close(t.rates.downsell, 0.2, 'downsell: 15 of the 75 decliners who saw it');
  close(t.rates.oto, 0.1);
  close(t.reachRate, 1);
});

test('rates from sales data reproduce the worked example', () => {
  const t = takeRatesFromData(salesData);
  const r = calculate({ ...base, conversionRate: t.rates.main, offers: Object.fromEntries(OFFER_KEYS.map((k) => [k, { ...base.offers[k], rate: t.rates[k] }])) });
  close(r.results.aov, 93.95);
});

test('downsell rate is measured only against upsell decliners who saw it', () => {
  const t = takeRatesFromData({ ...salesData, downsell: { viewed: 60, purchased: 15 } });
  close(t.rates.downsell, 0.25);
  assert.match(t.notes.downsell, /15 upsell decliners did not see/);
});

test('more downsell viewers than upsell decliners is an error', () => {
  const t = takeRatesFromData({ ...salesData, downsell: { viewed: 80, purchased: 10 } });
  assert.equal(t.ok, false);
  assert.match(t.errors['downsell.viewed'], /Only 75 people declined the upsell/);
  assert.equal(t.rates.downsell, null);
});

test('more buyers than viewers, or add-on viewers above main buyers, are errors', () => {
  assert.ok(takeRatesFromData({ bump: { viewed: 10, purchased: 12 } }).errors['bump.purchased']);
  const t = takeRatesFromData({ main: { viewed: 1000, purchased: 50 }, oto: { viewed: 60, purchased: 5 } });
  assert.match(t.errors['oto.viewed'], /Only 50 people bought the main product/);
});

test('OTO reach rate comes from OTO viewers ÷ main buyers', () => {
  const t = takeRatesFromData({ ...salesData, oto: { viewed: 80, purchased: 8 } });
  close(t.reachRate, 0.8);
  close(t.rates.oto, 0.1);
});

test('blank, partial, zero and invalid rows', () => {
  const t = takeRatesFromData({ bump: { viewed: '', purchased: '' }, upsell: { viewed: 50 }, oto: { viewed: 0, purchased: 0 }, main: { viewed: 'abc', purchased: 2.5 } });
  assert.equal(t.rates.bump, null);
  assert.equal(t.notes.bump, undefined, 'fully blank rows are skipped quietly');
  assert.match(t.notes.upsell, /both numbers/);
  assert.match(t.notes.oto, /Nobody saw/);
  assert.ok(t.errors['main.viewed']);
  assert.match(t.errors['main.purchased'], /whole numbers/);
});

/* ---------- Traffic from ads and social reach ---------- */

test('default traffic comes from ad spend and social reach ($10 a day in ads)', () => {
  assert.equal(DEFAULT_INPUTS.adSpend, 300);
  const r = calculate(DEFAULT_INPUTS);
  close(r.results.paidVisitors, 400, '$300 ÷ $0.75 per click');
  close(r.results.organicVisitors, 1500, '75,000 reach × 2%');
  close(r.results.visitors, 1900);
  close(r.results.buyers, 19, '1,900 × 1% conservative conversion');
  close(r.results.paidCostPerBuyer, 75, '$0.75 per click ÷ 1%');
});

test('a new user opens to a profit, not a loss', () => {
  const x = calculate(DEFAULT_INPUTS).results;
  assert.ok(x.operatingProfit > 0, `opening profit ${x.operatingProfit}`);
});

test('direct mode uses visitors as entered', () => {
  const r = calculate({ ...DEFAULT_INPUTS, trafficMode: 'direct', visitors: 3000 });
  close(r.results.visitors, 3000);
  close(r.results.paidVisitors, 0);
});

test('cost per click must be above $0 when there is ad spend', () => {
  assert.ok(calculate({ ...DEFAULT_INPUTS, costPerClick: 0 }).errors.costPerClick);
  assert.equal(calculate({ ...DEFAULT_INPUTS, costPerClick: 0, adSpend: 0 }).ok, true);
  close(calculate({ ...DEFAULT_INPUTS, adSpend: 0 }).results.visitors, 1500, 'social only');
});

test('revenue goal shows the ad spend it would take', () => {
  const g = calculate({ ...DEFAULT_INPUTS, adSpend: 1500, costPerClick: 1, socialReach: 25000 }).goals.revenue;
  assert.equal(g.requiredBuyers, 269); // 10,000 ÷ 37.31 retained per buyer
  assert.equal(g.requiredVisitors, 26900);
  close(g.requiredAdSpend, (26900 - 500) * 1);
  close(g.additionalAdSpend, 26400 - 1500);
  assert.match(g.notes.adSpend, /Cost per click usually rises/);
});

test('profit goal is unreachable when each paid buyer costs more in clicks than they bring in', () => {
  const r = calculate({ ...DEFAULT_INPUTS, costPerClick: 1 }); // $100 of clicks per paid buyer vs ~$35.87 contribution
  assert.equal(r.goals.profit.reachable, false);
  assert.match(r.goals.profit.notes.requiredBuyers, /costs \$100\.00 in clicks/);
});

test('profit goal with growing ad spend: the required ad spend really reaches the goal', () => {
  const inp = { ...DEFAULT_INPUTS, conversionRate: 0.04, costPerClick: 0.5 };
  const g = calculate(inp).goals.profit;
  assert.equal(g.reachable, true);
  assert.ok(g.requiredAdSpend > 0);
  const check = calculate({ ...inp, adSpend: g.requiredAdSpend });
  assert.ok(check.results.operatingProfit >= inp.profitGoal - 1e-6, `profit ${check.results.operatingProfit}`);
  const less = calculate({ ...inp, adSpend: Math.max(0, g.requiredAdSpend - 60) });
  assert.ok(less.results.operatingProfit < inp.profitGoal, 'noticeably less ad spend falls short');
});

test('profit goal reachable from social reach alone needs no ad spend', () => {
  const g = calculate({ ...DEFAULT_INPUTS, socialReach: 1000000, profitGoal: 1000 }).goals.profit;
  assert.equal(g.reachable, true);
  assert.equal(g.requiredAdSpend, 0);
});

/* ---------- Ways to grow ---------- */

test('growth levers: only improvements, best first, with the change to apply', () => {
  const levers = growthLevers(DEFAULT_INPUTS);
  assert.ok(levers.length > 0 && levers.length <= 3);
  for (let n = 1; n < levers.length; n++) assert.ok(levers[n - 1].profitDelta >= levers[n].profitDelta);
  for (const l of levers) {
    assert.ok(l.profitDelta > 0);
    const merged = { ...DEFAULT_INPUTS, ...l.change, offers: Object.fromEntries(OFFER_KEYS.map((k) => [k, { ...DEFAULT_INPUTS.offers[k], ...(l.change.offers?.[k] || {}) }])) };
    close(calculate(merged).results.operatingProfit, l.profitAfter, `${l.key} change reproduces its result`);
  }
});

test('growth levers: offers at Expected roughly doubles the default profit', () => {
  const l = growthLevers(DEFAULT_INPUTS, { limit: 5 }).find((x) => x.key === 'offersExpected');
  assert.ok(l);
  assert.ok(l.profitAfter > 2 * calculate(DEFAULT_INPUTS).results.operatingProfit * 0.9);
});

test('growth levers suggest turning on an offer that is off, and skip what is already strong', () => {
  const off = { ...DEFAULT_INPUTS, offers: { ...DEFAULT_INPUTS.offers, oto: { ...DEFAULT_INPUTS.offers.oto, enabled: false } } };
  assert.ok(growthLevers(off, { limit: 5 }).some((l) => l.key === 'addOffer'));
  const strong = { ...DEFAULT_INPUTS, conversionRate: 0.04 };
  assert.ok(!growthLevers(strong, { limit: 5 }).some((l) => l.key === 'conversionExpected'));
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

/* ---------- Planning ranges ---------- */

test('new sellers start at the conservative planning rates', () => {
  for (const k of OFFER_KEYS) assert.equal(DEFAULT_INPUTS.offers[k].rate, PLANNING_RANGES[k].conservative, k);
  const r = calculate(DEFAULT_INPUTS);
  close(r.results.aov, 27 + 17 * 0.1 + 97 * 0.03 + 47 * 0.97 * 0.02 + 297 * 0.02); // 38.4618
});

test('scenario rates are ordered Conservative < Expected < Stretch, within 0–100%', () => {
  for (const k of OFFER_KEYS) {
    const r = PLANNING_RANGES[k];
    assert.ok(r.conservative > 0 && r.conservative < r.expected && r.expected < r.stretch && r.stretch <= 1, k);
  }
  assert.match(ASSUMPTION_LABEL, /not verified industry benchmarks or predictions/);
});

test('matchingScenario recognizes a full set of scenario rates', () => {
  assert.equal(matchingScenario({ bump: 0.2, upsell: 0.06, downsell: 0.04, oto: 0.05 }), 'expected');
  assert.equal(matchingScenario({ bump: 0.2, upsell: 0.06, downsell: 0.04, oto: 0.06 }), null);
  assert.equal(matchingScenario({ main: 0.04 }, ['main']), 'stretch');
});

test('describeRate places a rate against the ranges', () => {
  assert.equal(describeRate('bump', 0.10).band, 'conservative');
  assert.match(describeRate('bump', 0.10).message, /Matches the Conservative/);
  assert.equal(describeRate('bump', 0.05).band, 'below');
  assert.equal(describeRate('bump', 0.15).band, 'conservative');
  assert.equal(describeRate('bump', 0.25).band, 'expected');
  assert.equal(describeRate('bump', 0.20).band, 'expected');
  assert.equal(describeRate('bump', 0.35).band, 'stretch');
  assert.equal(describeRate('bump', 0.50).band, 'above');
  assert.equal(describeRate('main', 0.02).band, 'expected');
  assert.equal(describeRate('nope', 0.5), null);
});

test('results carry the engine version', () => {
  assert.equal(calculate(base).engineVersion, ENGINE_VERSION);
  assert.equal(calculate({ price: -1 }).engineVersion, ENGINE_VERSION);
});
