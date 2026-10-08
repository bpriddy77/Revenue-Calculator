/**
 * Scenario take rates (offer acceptance rates) for an authority funnel.
 *
 * ILLUSTRATIVE PLANNING ASSUMPTIONS, NOT VERIFIED INDUSTRY BENCHMARKS OR PREDICTIONS.
 * Supplied by Priddy Impact Group as starting assumptions to refine later.
 * Never describe them as established statistics. Conservative is the default
 * for a new seller. Update the numbers here; defaults, slider marks, buttons
 * and the initial scenario comparison all read from this file.
 */
export const ASSUMPTION_LABEL = 'Illustrative planning assumptions, not verified industry benchmarks or predictions.';
export const RANGE_KEYS = Object.freeze(['conservative', 'expected', 'stretch']);
export const RANGE_LABELS = Object.freeze({ conservative: 'Conservative', expected: 'Expected', stretch: 'Stretch' });

export const PLANNING_RANGES = Object.freeze({
  // Front-end conversion (sales page visitors who buy the main product). From the DP-002 brief's scenario example.
  main: Object.freeze({ conservative: 0.01, expected: 0.02, stretch: 0.04 }),
  bump: Object.freeze({ conservative: 0.10, expected: 0.20, stretch: 0.35 }),
  upsell: Object.freeze({ conservative: 0.03, expected: 0.06, stretch: 0.15 }),
  downsell: Object.freeze({ conservative: 0.02, expected: 0.04, stretch: 0.08 }),
  oto: Object.freeze({ conservative: 0.02, expected: 0.05, stretch: 0.10 }),
});

const near = (a, b) => Math.abs(a - b) < 1e-9;

/**
 * Where a rate sits against the planning ranges, with a plain-language note.
 * Returns { band, message } or null when the offer has no ranges.
 */
export function describeRate(offerKey, rate) {
  const r = PLANNING_RANGES[offerKey];
  if (!r || typeof rate !== 'number' || !Number.isFinite(rate)) return null;
  const pct = (v) => `${+(v * 100).toFixed(2)}%`;
  for (const k of RANGE_KEYS) {
    if (near(rate, r[k])) return { band: k, message: `Matches the ${RANGE_LABELS[k]} scenario rate.` };
  }
  if (rate < r.conservative) return { band: 'below', message: `Below the Conservative rate of ${pct(r.conservative)}. A cautious plan.` };
  if (rate < r.expected) return { band: 'conservative', message: 'Between the Conservative and Expected rates.' };
  if (rate < r.stretch) return { band: 'expected', message: 'Between the Expected and Stretch rates.' };
  return { band: 'above', message: `Above the Stretch rate of ${pct(r.stretch)}. Make sure your own sales data supports it.` };
}

/** Which scenario, if any, every offer's rate currently matches. */
export const OFFER_RANGE_KEYS = Object.freeze(['bump', 'upsell', 'downsell', 'oto']);
export function matchingScenario(rates, keys = OFFER_RANGE_KEYS) {
  for (const b of RANGE_KEYS) {
    if (keys.every((k) => typeof rates[k] === 'number' && near(rates[k], PLANNING_RANGES[k][b]))) return b;
  }
  return null;
}
