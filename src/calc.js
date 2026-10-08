/**
 * Digital Product Revenue Calculator — calculation engine (Project 2)
 *
 * Deterministic and dependency-free. The same module runs in the browser
 * (real-time UI updates) and on the server (saved scenarios, report export).
 *
 * Conventions
 * - All rates are decimals: 0.02 means 2%. The UI converts percentages.
 * - Money values are returned at full precision. Round only for display.
 * - Projected orders are expected values and may be decimals (20.4 orders).
 * - Goal-solving results (required orders / visitors) are always whole
 *   numbers, rounded UP, because you cannot make 121.3 sales.
 * - Any output that cannot be determined is returned as null, with a
 *   plain-language explanation in `notes[field]`. Never Infinity or NaN.
 *
 * Locked model decisions (2026-10-08) — see README.md "Decision log".
 */

import { ENGINE_VERSION } from './version.js';
export { ENGINE_VERSION };

/** Illustrative defaults only. Never present these as industry benchmarks. */
export const DEFAULT_INPUTS = Object.freeze({
  productName: '',
  price: 17,
  visitors: 1000,
  conversionRate: 0.02,
  adSpend: 200,
  processingPct: 0.029,
  processingFixed: 0.3,
  refundRate: 0.03,
  otherCostPerOrder: 0,
  fixedCosts: 50,
  revenueGoal: 2000,
  profitGoal: 1000,
  currency: 'USD',
});

/** Default scenario overrides. Every value is editable in the UI. */
export const DEFAULT_SCENARIOS = Object.freeze({
  conservative: { conversionRate: 0.01 },
  expected: { conversionRate: 0.02 },
  optimistic: { conversionRate: 0.04 },
});

const FIELDS = {
  price: { label: 'Product price', required: true, positive: true },
  visitors: { label: 'Monthly visitors' },
  conversionRate: { label: 'Purchase conversion rate', rate: true },
  adSpend: { label: 'Monthly ad spend' },
  processingPct: { label: 'Processing fee percentage', rate: true },
  processingFixed: { label: 'Processing fee per order' },
  refundRate: { label: 'Refund rate', rate: true },
  otherCostPerOrder: { label: 'Other cost per sale' },
  fixedCosts: { label: 'Monthly fixed costs' },
  revenueGoal: { label: 'Monthly revenue goal', goal: true },
  profitGoal: { label: 'Monthly profit goal', goal: true },
};

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v.replace(/[$,\s]/g, ''));
  return NaN;
}

/** Ceil that ignores floating-point dust (7 / 0.07 = 100.00000000000001 → 100). */
function ceilSafe(x) {
  return Math.ceil(x - 1e-9);
}

/**
 * Normalize raw form values and collect validation errors.
 * Blank optional cost fields become 0. Blank goals become null (not set).
 */
export function validateInputs(raw = {}) {
  const inputs = { ...DEFAULT_INPUTS, ...raw };
  const errors = {};

  for (const [key, rule] of Object.entries(FIELDS)) {
    const value = raw[key] !== undefined ? raw[key] : DEFAULT_INPUTS[key];

    if (isBlank(value)) {
      if (rule.required) errors[key] = `${rule.label} is required.`;
      inputs[key] = rule.goal ? null : 0;
      continue;
    }

    const n = toNumber(value);
    if (!Number.isFinite(n)) {
      errors[key] = `${rule.label} must be a number.`;
    } else if (n < 0) {
      errors[key] = `${rule.label} can't be negative.`;
    } else if (rule.positive && n === 0) {
      errors[key] = `${rule.label} must be greater than zero.`;
    } else if (rule.rate && n > 1) {
      errors[key] = `${rule.label} can't be more than 100%.`;
    }
    inputs[key] = n;
  }

  return { inputs, errors };
}

/**
 * Work backward from a goal.
 * @param needed      amount the orders must cover
 * @param perOrder    what each order contributes toward that amount
 */
function solveGoal({ goal, needed, perOrder, conversionRate, visitors, unreachableReason }) {
  if (goal === null) return null;

  const result = {
    goal,
    reachable: true,
    requiredOrders: null,
    requiredVisitors: null,
    additionalVisitors: null,
    requiredConversionRate: null,
    notes: {},
  };

  if (needed <= 0) {
    result.requiredOrders = 0;
    result.requiredVisitors = 0;
    result.additionalVisitors = 0;
    result.requiredConversionRate = 0;
    return result;
  }

  if (perOrder <= 0) {
    result.reachable = false;
    result.notes.requiredOrders = unreachableReason;
    return result;
  }

  result.requiredOrders = ceilSafe(needed / perOrder);

  if (conversionRate > 0) {
    // Visitors are calculated from the rounded-up order count.
    result.requiredVisitors = ceilSafe(result.requiredOrders / conversionRate);
    result.additionalVisitors = Math.max(0, result.requiredVisitors - visitors);
  } else {
    result.notes.requiredVisitors =
      'With a 0% conversion rate, no number of visitors produces a sale, so the visitors you need ' +
      "can't be calculated. Enter the conversion rate you're aiming for to see the traffic required.";
  }

  // The other lever: what conversion rate reaches the goal with today's traffic?
  if (visitors > 0) {
    const rate = result.requiredOrders / visitors;
    if (rate <= 1) {
      result.requiredConversionRate = rate;
    } else {
      result.notes.requiredConversionRate =
        "Even if every visitor bought, today's traffic isn't enough for this goal. More visitors is the lever here.";
    }
  } else {
    result.notes.requiredConversionRate = 'Add monthly visitors to see the conversion rate this goal needs.';
  }

  return result;
}

/**
 * Run the full model for one set of inputs.
 * Returns { ok: false, errors } when inputs are invalid.
 */
export function calculate(raw = {}) {
  const { inputs: i, errors } = validateInputs(raw);
  if (Object.keys(errors).length > 0) return { ok: false, errors, inputs: i };

  const notes = {};

  // Volume
  const orders = i.visitors * i.conversionRate;
  const refundedOrders = orders * i.refundRate;
  const retainedOrders = orders - refundedOrders;

  // Revenue
  const grossRevenue = orders * i.price;
  const refundedRevenue = grossRevenue * i.refundRate;
  const netRevenue = grossRevenue - refundedRevenue;

  // Costs. Processing fees are charged on every order and are NOT returned
  // when a sale is refunded. Other per-sale costs apply to every order,
  // because digital products are delivered before any refund.
  const feePerOrder = i.price * i.processingPct + i.processingFixed;
  const processingFees = orders * feePerOrder;
  const otherCosts = orders * i.otherCostPerOrder;
  const variableCosts = processingFees + otherCosts;

  // Profit
  const contributionProfit = netRevenue - variableCosts - i.adSpend;
  const operatingProfit = contributionProfit - i.fixedCosts;

  // Unit economics
  const retainedRevenuePerOrder = i.price * (1 - i.refundRate);
  const contributionPerOrder = retainedRevenuePerOrder - feePerOrder - i.otherCostPerOrder;

  let revenuePerVisitor = null;
  if (i.visitors > 0) {
    revenuePerVisitor = netRevenue / i.visitors;
  } else {
    notes.revenuePerVisitor = 'Add monthly visitors to see how much each visitor is worth.';
  }

  // Blended: assumes every order is credited to ad spend, including organic buyers.
  let blendedCAC = null;
  if (i.adSpend === 0) {
    blendedCAC = 0;
    notes.blendedCAC = 'No ad spend entered, so customers cost $0 in advertising.';
  } else if (orders > 0) {
    blendedCAC = i.adSpend / orders;
  } else {
    notes.blendedCAC =
      "You're spending on ads but the model shows no orders, so cost per customer can't be calculated.";
  }

  const breakEvenCAC = contributionPerOrder;
  if (contributionPerOrder <= 0) {
    notes.breakEvenCAC =
      'Each sale loses money before any advertising. Raise the price or lower per-sale costs ' +
      'before spending on ads.';
  }

  const adSpendNote =
    `Assumes your ad budget stays at its current monthly amount. As you scale, ` +
    `reaching more visitors usually takes a bigger ad budget, and cost per visitor tends to rise.`;

  const revenueGoal = solveGoal({
    goal: i.revenueGoal,
    needed: i.revenueGoal,
    perOrder: retainedRevenuePerOrder,
    conversionRate: i.conversionRate,
    visitors: i.visitors,
    unreachableReason:
      'At a 100% refund rate every sale is returned, so no number of orders reaches this goal.',
  });

  const profitGoal = solveGoal({
    goal: i.profitGoal,
    needed: i.profitGoal === null ? 0 : i.profitGoal + i.adSpend + i.fixedCosts,
    perOrder: contributionPerOrder,
    conversionRate: i.conversionRate,
    visitors: i.visitors,
    unreachableReason:
      'Each sale loses money after refunds, fees and per-sale costs, so selling more makes the loss ' +
      'bigger. Raise the price or lower per-sale costs to make this goal reachable.',
  });
  if (profitGoal) profitGoal.notes.adSpend = adSpendNote;

  return {
    ok: true,
    engineVersion: ENGINE_VERSION,
    inputs: i,
    results: {
      orders,
      refundedOrders,
      retainedOrders,
      grossRevenue,
      refundedRevenue,
      netRevenue,
      feePerOrder,
      processingFees,
      otherCosts,
      variableCosts,
      contributionProfit,
      operatingProfit,
      retainedRevenuePerOrder,
      contributionPerOrder,
      revenuePerVisitor,
      blendedCAC,
      breakEvenCAC,
      isLosingMoney: operatingProfit < 0,
    },
    goals: { revenue: revenueGoal, profit: profitGoal },
    notes,
  };
}

/**
 * Compare scenarios without re-entering inputs. Each scenario is the base
 * inputs plus its own overrides (any field can be overridden).
 */
export function compareScenarios(base = {}, overrides = DEFAULT_SCENARIOS) {
  return Object.fromEntries(
    Object.entries(overrides).map(([name, o]) => [name, calculate({ ...base, ...o })]),
  );
}

/** Display helpers. Formatting only — never feed formatted values back into the math. */
export function formatMoney(value, currency = 'USD', locale = 'en-US') {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

export function formatCount(value, locale = 'en-US') {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

/** Plain-language definitions for the UI and the exported report (RC-10). */
export const DEFINITIONS = Object.freeze({
  orders: 'Expected purchases this month: visitors × conversion rate. A decimal is an average, not a partial sale.',
  grossRevenue: 'Everything customers pay before any refunds.',
  refundedRevenue: 'Money returned to customers who asked for a refund.',
  netRevenue: 'What you keep from sales after refunds, before fees and costs.',
  processingFees: 'What your payment processor charges per order. These fees are not returned when you refund a sale.',
  variableCosts: 'Costs that grow with every sale: processing fees plus any other per-sale costs.',
  contributionProfit: 'What is left after refunds, per-sale costs and ad spend. It pays for your fixed costs.',
  operatingProfit: 'Your estimated monthly profit after every cost you entered. Taxes are not included.',
  revenuePerVisitor: 'How much each visitor to your sales page is worth, on average, after refunds.',
  blendedCAC: 'Ad spend divided by all orders. If some buyers found you without ads, your true paid cost per customer is higher.',
  breakEvenCAC: 'The most you can spend to win one customer before that sale starts losing money.',
  requiredOrders: 'The sales you need to reach your goal, rounded up to whole orders.',
  requiredVisitors: 'The traffic you need to reach your goal at your conversion rate.',
  disclaimer:
    'These are planning assumptions, not predictions or promises of income. Results depend on your ' +
    'actual traffic, conversion, pricing and costs. Taxes and any costs you did not enter are excluded.',
});
