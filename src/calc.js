/**
 * DP-002 — $100K Funnel Revenue Calculator — calculation engine
 *
 * Deterministic and dependency-free. The same module runs in the browser
 * (real-time UI) and on the server (saved funnels, report export).
 *
 * Funnel positions
 *   main      required. Visitors × conversion = initial buyers.
 *   bump      optional. Offered at checkout to every initial buyer; added to the SAME charge.
 *   upsell    optional. Offered after purchase to every initial buyer; its own charge.
 *   downsell  optional. Offered ONLY to buyers who declined the upsell; requires an active upsell.
 *   oto       optional. Offered to (initial buyers × reach rate) after the upsell/downsell step;
 *             reach rate is 100% in the MVP. Its own charge.
 *
 * Conventions
 * - All rates are decimals (0.35 = 35%). The UI converts percentages.
 * - Money is returned at full precision; round only for display.
 * - Projected buyers are expected values and may be decimals.
 * - Goal results (required buyers / visitors) are whole numbers, rounded UP.
 * - Anything that cannot be determined is null, with a plain-language reason
 *   in `notes`. Never Infinity or NaN.
 *
 * Cost rules (see README "Decision log")
 * - Payment fees: percentage on all funnel revenue, plus the fixed fee once per
 *   charge. The main purchase + bump is one charge; upsell, downsell and OTO
 *   are each a separate charge.
 * - Fees are not returned on refunds. One refund rate applies to all revenue.
 * - Fulfillment costs apply to every sale of that offer, including refunded ones.
 * - Ad spend is a fixed monthly budget in goal calculations.
 */

import { ENGINE_VERSION } from './version.js';
export { ENGINE_VERSION };

export const OFFER_KEYS = Object.freeze(['bump', 'upsell', 'downsell', 'oto']);
export const OFFER_LABELS = Object.freeze({
  main: 'Main product',
  bump: 'Order bump',
  upsell: 'Upsell',
  downsell: 'Downsell',
  oto: 'One-time offer',
});

const deepFreeze = (o) => {
  Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v));
  return Object.freeze(o);
};

/** Illustrative defaults only. Never present these as industry benchmarks. */
export const DEFAULT_INPUTS = deepFreeze({
  productName: '',
  price: 27,
  visitors: 5000,
  conversionRate: 0.02,
  fulfillmentCost: 0,
  offers: {
    bump: { enabled: true, name: '', price: 17, rate: 0.35, fulfillmentCost: 0 },
    upsell: { enabled: true, name: '', price: 97, rate: 0.25, fulfillmentCost: 0 },
    downsell: { enabled: true, name: '', price: 47, rate: 0.2, fulfillmentCost: 0 },
    oto: { enabled: true, name: '', price: 297, rate: 0.1, fulfillmentCost: 0, reachRate: 1 },
  },
  adSpend: 1500,
  processingPct: 0.029,
  processingFixed: 0.3,
  refundRate: 0.03,
  fixedCosts: 100,
  revenueGoal: 10000,
  profitGoal: 5000,
  aovGoal: 300,
  currency: 'USD',
});

/** Merge raw input over the defaults (one level deep for each offer). */
export function mergeInputs(raw = {}) {
  const offers = {};
  for (const k of OFFER_KEYS) offers[k] = { ...DEFAULT_INPUTS.offers[k], ...(raw.offers?.[k] || {}) };
  return { ...DEFAULT_INPUTS, ...raw, offers };
}

const TOP_FIELDS = {
  price: { label: 'Main product price', required: true, positive: true },
  visitors: { label: 'Monthly visitors' },
  conversionRate: { label: 'Front-end conversion rate', rate: true },
  fulfillmentCost: { label: 'Main product fulfillment cost' },
  adSpend: { label: 'Monthly ad spend' },
  processingPct: { label: 'Payment fee percentage', rate: true },
  processingFixed: { label: 'Payment fee per charge' },
  refundRate: { label: 'Refund rate', rate: true },
  fixedCosts: { label: 'Monthly fixed costs' },
  revenueGoal: { label: 'Monthly revenue goal', goal: true },
  profitGoal: { label: 'Monthly profit goal', goal: true },
  aovGoal: { label: 'Target AOV', goal: true },
};

const OFFER_FIELDS = {
  price: { label: 'price', required: true, positive: true },
  rate: { label: 'acceptance rate', required: true, rate: true },
  fulfillmentCost: { label: 'fulfillment cost' },
  reachRate: { label: 'reach rate', rate: true },
};

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const toNumber = (v) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[$,%\s]/g, '')) : NaN);
const toBool = (v) => v === true || v === 'true' || v === 1 || v === 'on';

/** Ceil that ignores floating-point dust (7 / 0.07 = 100.00000000000001 → 100). */
const ceilSafe = (x) => Math.ceil(x - 1e-9);

function checkNumber(value, rule, label) {
  if (isBlank(value)) return { value: rule.goal ? null : 0, error: rule.required ? `${label} is required.` : null };
  const n = toNumber(value);
  if (!Number.isFinite(n)) return { value: n, error: `${label} must be a number.` };
  if (n < 0) return { value: n, error: `${label} can't be negative.` };
  if (rule.positive && n === 0) return { value: n, error: `${label} must be greater than zero.` };
  if (rule.rate && n > 1) return { value: n, error: `${label} can't be more than 100%.` };
  return { value: n, error: null };
}

/**
 * Normalize and validate. Error keys: 'price', 'offers.upsell.rate', etc.
 * Fields of a disabled offer are not validated, so leftover input never blocks results.
 */
export function validateInputs(raw = {}) {
  const merged = mergeInputs(raw);
  const errors = {};
  const inputs = { ...merged, offers: {} };

  for (const [key, rule] of Object.entries(TOP_FIELDS)) {
    const { value, error } = checkNumber(merged[key], rule, rule.label);
    inputs[key] = value;
    if (error) errors[key] = error;
  }

  for (const k of OFFER_KEYS) {
    const src = merged.offers[k];
    const offer = { ...src, enabled: toBool(src.enabled), name: typeof src.name === 'string' ? src.name : '' };
    for (const [field, rule] of Object.entries(OFFER_FIELDS)) {
      if (field === 'reachRate' && k !== 'oto') continue;
      const label = `${OFFER_LABELS[k]} ${rule.label}`;
      const { value, error } = checkNumber(src[field], rule, label.charAt(0).toUpperCase() + label.slice(1));
      offer[field] = value;
      if (error && offer.enabled) errors[`offers.${k}.${field}`] = error;
    }
    inputs.offers[k] = offer;
  }

  // A downsell only exists for buyers who decline an upsell.
  for (const k of OFFER_KEYS) inputs.offers[k].active = inputs.offers[k].enabled;
  inputs.offers.downsell.active = inputs.offers.downsell.enabled && inputs.offers.upsell.enabled;

  return { inputs, errors };
}

/**
 * Per-buyer economics from the rates alone. Everything in the funnel scales
 * linearly with initial buyers, so totals = initial buyers × these values.
 */
function perBuyer(i) {
  const o = i.offers;
  const take = {
    main: 1,
    bump: o.bump.active ? o.bump.rate : 0,
    upsell: o.upsell.active ? o.upsell.rate : 0,
    downsell: o.downsell.active ? (1 - o.upsell.rate) * o.downsell.rate : 0,
    oto: o.oto.active ? o.oto.reachRate * o.oto.rate : 0,
  };
  const price = { main: i.price, bump: o.bump.price, upsell: o.upsell.price, downsell: o.downsell.price, oto: o.oto.price };
  const cost = { main: i.fulfillmentCost, bump: o.bump.fulfillmentCost, upsell: o.upsell.fulfillmentCost, downsell: o.downsell.fulfillmentCost, oto: o.oto.fulfillmentCost };

  const keys = ['main', ...OFFER_KEYS];
  const aov = keys.reduce((s, k) => s + take[k] * price[k], 0);
  const charges = take.main + take.upsell + take.downsell + take.oto; // bump rides on the main charge
  const fees = aov * i.processingPct + charges * i.processingFixed;
  const fulfillment = keys.reduce((s, k) => s + take[k] * cost[k], 0);
  const retainedRevenue = aov * (1 - i.refundRate);
  const contribution = retainedRevenue - fees - fulfillment;
  return { take, price, cost, aov, charges, fees, fulfillment, retainedRevenue, contribution };
}

function solveGoal({ goal, needed, perBuyerValue, conversionRate, visitors, unreachableReason }) {
  if (goal === null) return null;
  const result = {
    goal,
    reachable: true,
    requiredBuyers: null,
    requiredVisitors: null,
    additionalVisitors: null,
    requiredConversionRate: null,
    notes: {},
  };

  if (needed <= 0) {
    Object.assign(result, { requiredBuyers: 0, requiredVisitors: 0, additionalVisitors: 0, requiredConversionRate: 0 });
    return result;
  }
  if (perBuyerValue <= 0) {
    result.reachable = false;
    result.notes.requiredBuyers = unreachableReason;
    return result;
  }

  result.requiredBuyers = ceilSafe(needed / perBuyerValue);

  if (conversionRate > 0) {
    // Visitors come from the rounded-up buyer count.
    result.requiredVisitors = ceilSafe(result.requiredBuyers / conversionRate);
    result.additionalVisitors = Math.max(0, result.requiredVisitors - visitors);
  } else {
    result.notes.requiredVisitors =
      'With a 0% conversion rate, no number of visitors produces a buyer, so the traffic you need ' +
      "can't be calculated. Enter the conversion rate you're aiming for to see it.";
  }

  if (visitors > 0) {
    const rate = result.requiredBuyers / visitors;
    if (rate <= 1) result.requiredConversionRate = rate;
    else result.notes.requiredConversionRate = "Even if every visitor bought, today's traffic isn't enough for this goal. More visitors is the lever here.";
  } else {
    result.notes.requiredConversionRate = 'Add monthly visitors to see the conversion rate this goal needs.';
  }
  return result;
}

/** Run the full funnel model. Returns { ok: false, errors } when inputs are invalid. */
export function calculate(raw = {}) {
  const { inputs: i, errors } = validateInputs(raw);
  if (Object.keys(errors).length) return { ok: false, errors, inputs: i, engineVersion: ENGINE_VERSION };

  const notes = {};
  const u = perBuyer(i);
  const buyers = i.visitors * i.conversionRate;

  // Itemized offers
  const upsellBuyers = buyers * u.take.upsell;
  const eligible = {
    main: i.visitors,
    bump: i.offers.bump.active ? buyers : 0,
    upsell: i.offers.upsell.active ? buyers : 0,
    downsell: i.offers.downsell.active ? buyers - upsellBuyers : 0,
    oto: i.offers.oto.active ? buyers * i.offers.oto.reachRate : 0,
  };
  const offers = ['main', ...OFFER_KEYS].map((key) => {
    const src = key === 'main' ? { name: i.productName, enabled: true, active: true } : i.offers[key];
    const b = buyers * u.take[key];
    return {
      key,
      label: OFFER_LABELS[key],
      name: (src.name || '').trim(),
      enabled: key === 'main' ? true : src.enabled,
      active: key === 'main' ? true : src.active,
      price: u.price[key],
      rate: key === 'main' ? i.conversionRate : src.rate,
      eligible: eligible[key],
      buyers: b,
      revenue: b * u.price[key],
      fulfillment: b * u.cost[key],
    };
  });
  if (i.offers.downsell.enabled && !i.offers.upsell.enabled) {
    notes.downsell = 'A downsell is only offered to buyers who decline an upsell, so it stays off until the upsell is on.';
  }

  // Totals
  const grossRevenue = offers.reduce((s, o) => s + o.revenue, 0);
  const charges = buyers * u.charges;
  const processingFees = grossRevenue * i.processingPct + charges * i.processingFixed;
  const fulfillmentCosts = offers.reduce((s, o) => s + o.fulfillment, 0);
  const variableCosts = processingFees + fulfillmentCosts;
  const refundedRevenue = grossRevenue * i.refundRate;
  const netRevenue = grossRevenue - refundedRevenue;
  const contributionProfit = netRevenue - variableCosts - i.adSpend;
  const operatingProfit = contributionProfit - i.fixedCosts;

  // AOV comes from the modeled acceptance rates, so it exists even with zero buyers.
  const aov = u.aov;
  if (buyers === 0) notes.aov = 'No buyers at these numbers yet. This is what each buyer would spend on average.';

  // Most one buyer could spend: main + bump + (upsell OR downsell, never both) + OTO.
  const o = i.offers;
  const maxCheckoutValue =
    i.price +
    (o.bump.active ? o.bump.price : 0) +
    Math.max(o.upsell.active ? o.upsell.price : 0, o.downsell.active ? o.downsell.price : 0) +
    (o.oto.active ? o.oto.price : 0);

  let revenuePerVisitor = null;
  if (i.visitors > 0) revenuePerVisitor = netRevenue / i.visitors;
  else notes.revenuePerVisitor = 'Add monthly visitors to see how much each visitor is worth.';

  let cac = null;
  if (i.adSpend === 0) { cac = 0; notes.cac = 'No ad spend entered, so buyers cost $0 in advertising.'; }
  else if (buyers > 0) cac = i.adSpend / buyers;
  else notes.cac = "You're spending on ads but the model shows no buyers, so cost per buyer can't be calculated.";

  let roas = null;
  if (i.adSpend > 0) roas = grossRevenue / i.adSpend;
  else notes.roas = 'No ad spend entered, so return on ad spend does not apply.';

  const breakEvenCac = u.contribution;
  if (breakEvenCac <= 0) {
    notes.breakEvenCac = 'Each buyer loses money before any advertising. Raise prices or lower per-sale costs before spending on ads.';
  }

  const adSpendNote =
    'Assumes your ad budget stays at its current monthly amount. As you scale, reaching more visitors ' +
    'usually takes a bigger ad budget, and cost per visitor tends to rise.';

  const revenueGoal = solveGoal({
    goal: i.revenueGoal,
    needed: i.revenueGoal,
    perBuyerValue: u.retainedRevenue,
    conversionRate: i.conversionRate,
    visitors: i.visitors,
    unreachableReason: 'At a 100% refund rate every sale is returned, so no number of buyers reaches this goal.',
  });
  if (revenueGoal && i.aovGoal !== null && i.aovGoal > 0 && i.refundRate < 1 && revenueGoal.requiredBuyers > 0) {
    revenueGoal.requiredBuyersAtTargetAov = ceilSafe(i.revenueGoal / (i.aovGoal * (1 - i.refundRate)));
  }

  const profitGoal = solveGoal({
    goal: i.profitGoal,
    needed: i.profitGoal === null ? 0 : i.profitGoal + i.adSpend + i.fixedCosts,
    perBuyerValue: u.contribution,
    conversionRate: i.conversionRate,
    visitors: i.visitors,
    unreachableReason:
      'Each buyer loses money after refunds, fees and fulfillment, so more buyers make the loss bigger. ' +
      'Raise prices or lower per-sale costs to make this goal reachable.',
  });
  if (profitGoal) profitGoal.notes.adSpend = adSpendNote;

  let aovGoal = null;
  if (i.aovGoal !== null) {
    const gap = i.aovGoal - aov;
    aovGoal = { goal: i.aovGoal, current: aov, gap: Math.max(0, gap), reached: gap <= 1e-9, notes: {} };
    if (i.aovGoal > maxCheckoutValue + 1e-9) {
      aovGoal.reachable = false;
      aovGoal.notes.gap =
        'This target is higher than the most one buyer could spend in this funnel, so no acceptance rates reach it. ' +
        'Add an offer or raise prices.';
    } else aovGoal.reachable = true;
  }

  return {
    ok: true,
    engineVersion: ENGINE_VERSION,
    inputs: i,
    offers,
    results: {
      buyers,
      charges,
      grossRevenue,
      refundedRevenue,
      netRevenue,
      processingFees,
      fulfillmentCosts,
      variableCosts,
      adSpend: i.adSpend,
      fixedCosts: i.fixedCosts,
      contributionProfit,
      operatingProfit,
      aov,
      maxCheckoutValue,
      revenuePerVisitor,
      cac,
      roas,
      breakEvenCac,
      retainedRevenuePerBuyer: u.retainedRevenue,
      contributionPerBuyer: u.contribution,
      isLosingMoney: operatingProfit < 0,
    },
    goals: { revenue: revenueGoal, profit: profitGoal, aov: aovGoal },
    notes,
  };
}

/** Deep-merge scenario overrides onto base inputs (offers merged per offer). */
function applyOverrides(base, o = {}) {
  const merged = { ...base, ...o, offers: { ...(base.offers || {}) } };
  for (const k of OFFER_KEYS) merged.offers[k] = { ...(base.offers?.[k] || {}), ...(o.offers?.[k] || {}) };
  return merged;
}

/**
 * Default scenarios from the customer's own numbers: half and one-and-a-half
 * times their conversion and acceptance rates (capped at 100%).
 */
export function defaultScenarios(inputs) {
  const i = mergeInputs(inputs);
  const scale = (f) => {
    const r = (v) => Math.min(1, +(toNumber(v) * f).toFixed(4));
    const offers = {};
    for (const k of OFFER_KEYS) offers[k] = { rate: r(i.offers[k].rate) };
    return { visitors: toNumber(i.visitors), conversionRate: r(i.conversionRate), offers };
  };
  return { conservative: scale(0.5), expected: scale(1), optimistic: scale(1.5) };
}

/** Compare scenarios without re-entering inputs. */
export function compareScenarios(base = {}, overrides = defaultScenarios(base)) {
  return Object.fromEntries(Object.entries(overrides).map(([name, o]) => [name, calculate(applyOverrides(base, o))]));
}

/* ---------- Display helpers (formatting only, never fed back into the math) ---------- */
export function formatMoney(value, currency = 'USD', locale = 'en-US') {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}
export function formatCount(value, locale = 'en-US') {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

/** Plain-language definitions for the UI and the exported report. */
export const DEFINITIONS = Object.freeze({
  buyers: 'People who buy the main product: visitors × front-end conversion rate. A decimal is an average, not a partial person.',
  aov: 'Average order value: everything buyers spend across the funnel, divided by the number of buyers. It comes from your acceptance rates, not from assuming everyone buys everything.',
  maxCheckoutValue: 'The most a single buyer could spend if they said yes at every step. Your AOV is the realistic average; this is the ceiling.',
  grossRevenue: 'Everything buyers pay across all offers, before refunds.',
  netRevenue: 'What you keep from sales after refunds, before fees and costs.',
  processingFees: 'Your payment processor’s percentage on all revenue, plus its fixed fee on each charge. The main product and order bump share one charge; each later offer is its own charge. Fees are not returned on refunds.',
  fulfillmentCosts: 'Costs you pay for each sale of an offer, such as delivery apps or licenses.',
  contributionProfit: 'What is left after refunds, per-sale costs and ad spend. It pays for your fixed costs.',
  operatingProfit: 'Your estimated monthly profit after every cost you entered. Taxes are not included.',
  revenuePerVisitor: 'What each visitor to your sales page is worth on average, after refunds.',
  cac: 'Ad spend divided by all buyers. If some buyers found you without ads, your true paid cost per buyer is higher.',
  roas: 'Return on ad spend: funnel revenue before refunds for every $1 of ads.',
  breakEvenCac: 'The most you can spend to win one buyer before that buyer stops being profitable.',
  disclaimer:
    'These are planning assumptions, not predictions or promises of income. Results depend on your actual traffic, ' +
    'conversion, acceptance rates, pricing and costs. Taxes and any costs you did not enter are excluded.',
});
