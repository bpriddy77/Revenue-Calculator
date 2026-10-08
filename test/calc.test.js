import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, compareScenarios, validateInputs, DEFAULT_INPUTS } from '../src/calc.js';

const close = (actual, expected, msg) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${msg ?? ''} expected ${expected}, got ${actual}`);

// The brief's prototype: $17, 1,000 visitors, 2%, 3% refunds, 2.9% + $0.30, $200 ads, $50 fixed.
const base = { ...DEFAULT_INPUTS };

test('matches the brief prototype exactly', () => {
  const r = calculate(base);
  assert.equal(r.ok, true);
  close(r.results.orders, 20, 'orders');
  close(r.results.grossRevenue, 340, 'gross');
  close(r.results.netRevenue, 329.8, 'net');
  close(r.results.processingFees, 15.86, 'fees');
  close(r.results.contributionProfit, 113.94, 'contribution');
  close(r.results.operatingProfit, 63.94, 'operating');
  assert.equal(r.goals.revenue.requiredOrders, 122);
  assert.equal(r.goals.revenue.requiredVisitors, 6100);
  assert.equal(r.goals.revenue.additionalVisitors, 5100);
});

test('distinguishes orders, refunded orders and retained orders', () => {
  const r = calculate(base).results;
  close(r.refundedOrders, 0.6);
  close(r.retainedOrders, 19.4);
  close(r.refundedRevenue, 10.2);
});

test('profit goal counts ad spend and fixed costs, and notes ad spend is held fixed', () => {
  const r = calculate(base);
  // (1000 + 200 + 50) / 15.697 = 79.63 → 80 orders → 4,000 visitors
  close(r.results.contributionPerOrder, 15.697);
  assert.equal(r.goals.profit.requiredOrders, 80);
  assert.equal(r.goals.profit.requiredVisitors, 4000);
  assert.match(r.goals.profit.notes.adSpend, /ad budget/);

  // Sanity: 80 orders really does clear the goal
  const check = calculate({ ...base, visitors: 4000 });
  assert.ok(check.results.operatingProfit >= 1000);
});

test('other per-sale cost applies to every order', () => {
  const r = calculate({ ...base, otherCostPerOrder: 1 });
  close(r.results.otherCosts, 20);
  close(r.results.operatingProfit, 43.94);
  assert.equal(r.goals.profit.requiredOrders, 86); // 1250 / 14.697 = 85.05
  assert.equal(r.goals.profit.requiredVisitors, 4300);
});

test('zero traffic: no crash, explains what cannot be calculated', () => {
  const r = calculate({ ...base, visitors: 0 });
  assert.equal(r.ok, true);
  close(r.results.orders, 0);
  close(r.results.operatingProfit, -250);
  assert.equal(r.results.isLosingMoney, true);
  assert.equal(r.results.revenuePerVisitor, null);
  assert.ok(r.notes.revenuePerVisitor);
  assert.equal(r.results.blendedCAC, null);
  assert.ok(r.notes.blendedCAC);
  assert.equal(r.goals.revenue.requiredVisitors, 6100);
  assert.equal(r.goals.revenue.additionalVisitors, 6100);
});

test('zero conversion: required orders still shown, visitors explained instead of Infinity', () => {
  const r = calculate({ ...base, conversionRate: 0 });
  assert.equal(r.goals.revenue.requiredOrders, 122);
  assert.equal(r.goals.revenue.requiredVisitors, null);
  assert.match(r.goals.revenue.notes.requiredVisitors, /0% conversion/);
  assert.equal(r.goals.profit.requiredVisitors, null);
  for (const v of Object.values(r.results)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), 'no Infinity/NaN in results');
  }
});

test('zero ad spend', () => {
  const r = calculate({ ...base, adSpend: 0 });
  assert.equal(r.results.blendedCAC, 0);
  close(r.results.operatingProfit, 263.94);
  assert.equal(r.goals.profit.requiredOrders, 67); // 1050 / 15.697 = 66.89
});

test('high refunds', () => {
  const r = calculate({ ...base, refundRate: 0.5 });
  close(r.results.netRevenue, 170);
  close(r.results.processingFees, 15.86, 'fees not returned on refunds');
  assert.equal(r.goals.revenue.requiredOrders, 236); // 2000 / 8.50 = 235.29
});

test('100% refunds: revenue and profit goals are unreachable, with explanation', () => {
  const r = calculate({ ...base, refundRate: 1 });
  assert.equal(r.goals.revenue.reachable, false);
  assert.equal(r.goals.revenue.requiredOrders, null);
  assert.ok(r.goals.revenue.notes.requiredOrders);
  assert.equal(r.goals.profit.reachable, false);
});

test('decimal prices', () => {
  const r = calculate({ ...base, price: 9.99 });
  close(r.results.grossRevenue, 199.8);
  close(r.results.netRevenue, 193.806);
  close(r.results.processingFees, 11.7942);
  close(r.results.operatingProfit, -67.9882);
  assert.equal(r.goals.revenue.requiredOrders, 207); // 2000 / 9.6903 = 206.39
  assert.equal(r.goals.revenue.requiredVisitors, 10350);
});

test('business that loses money is flagged', () => {
  const r = calculate({ ...base, adSpend: 500 });
  close(r.results.contributionProfit, -186.06);
  close(r.results.operatingProfit, -236.06);
  assert.equal(r.results.isLosingMoney, true);
});

test('each sale losing money: break-even CAC negative and profit goal unreachable', () => {
  const r = calculate({ ...base, price: 0.25 });
  assert.ok(r.results.contributionPerOrder < 0);
  assert.ok(r.notes.breakEvenCAC);
  assert.equal(r.goals.profit.reachable, false);
  assert.ok(r.goals.profit.notes.requiredOrders);
});

test('rounding: exact results are not pushed up by floating-point dust', () => {
  // 70 / 10 = 7 orders exactly; 7 / 0.07 = 100.00000000000001 in JS → should be 100
  const r = calculate({ ...base, price: 10, refundRate: 0, conversionRate: 0.07, revenueGoal: 70 });
  assert.equal(r.goals.revenue.requiredOrders, 7);
  assert.equal(r.goals.revenue.requiredVisitors, 100);
});

test('goal of zero needs zero sales; blank goals are skipped', () => {
  const r = calculate({ ...base, revenueGoal: 0, profitGoal: '' });
  assert.equal(r.goals.revenue.requiredOrders, 0);
  assert.equal(r.goals.profit, null);
});

test('scenario comparison matches the brief table', () => {
  const s = compareScenarios(base);
  close(s.conservative.results.orders, 10);
  close(s.expected.results.orders, 20);
  close(s.optimistic.results.orders, 40);
  close(s.conservative.results.grossRevenue, 170);
  close(s.expected.results.grossRevenue, 340);
  close(s.optimistic.results.grossRevenue, 680);
});

test('scenarios can override any field', () => {
  const s = compareScenarios(base, { low: { price: 7 }, high: { price: 27, visitors: 2000 } });
  close(s.low.results.grossRevenue, 140);
  close(s.high.results.grossRevenue, 1080);
});

test('validation catches bad input and accepts form strings', () => {
  assert.ok(validateInputs({ price: '' }).errors.price);
  assert.ok(validateInputs({ price: 0 }).errors.price);
  assert.ok(validateInputs({ price: -5 }).errors.price);
  assert.ok(validateInputs({ conversionRate: 1.5 }).errors.conversionRate);
  assert.ok(validateInputs({ visitors: 'lots' }).errors.visitors);

  const { inputs, errors } = validateInputs({ price: '$1,299.00', adSpend: '', fixedCosts: ' ' });
  assert.deepEqual(errors, {});
  assert.equal(inputs.price, 1299);
  assert.equal(inputs.adSpend, 0);
  assert.equal(inputs.fixedCosts, 0);

  const bad = calculate({ price: -1 });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.price);
});

test('conversion lever: rate needed at current traffic', () => {
  const r = calculate(base);
  close(r.goals.revenue.requiredConversionRate, 0.122); // 122 orders / 1,000 visitors
  const tiny = calculate({ ...base, visitors: 50 });
  assert.equal(tiny.goals.revenue.requiredConversionRate, null);
  assert.match(tiny.goals.revenue.notes.requiredConversionRate, /More visitors/);
  const none = calculate({ ...base, visitors: 0 });
  assert.equal(none.goals.revenue.requiredConversionRate, null);
});
