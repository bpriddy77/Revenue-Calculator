/**
 * Planning ranges for offer acceptance ("take") rates in an authority funnel.
 *
 * These are STARTING POINTS for planning, supplied by Priddy Impact Group.
 * They are not industry benchmarks, statistics or predictions, and the page
 * must never present them as such. Conservative is the default for a new seller.
 * Update the numbers here; the page and engine defaults read from this file.
 */
export const RANGE_KEYS = Object.freeze(['conservative', 'planning', 'stretch']);
export const RANGE_LABELS = Object.freeze({ conservative: 'Conservative', planning: 'Planning', stretch: 'Stretch' });

export const PLANNING_RANGES = Object.freeze({
  bump: Object.freeze({ conservative: 0.10, planning: 0.20, stretch: 0.35 }),
  upsell: Object.freeze({ conservative: 0.03, planning: 0.06, stretch: 0.15 }),
  downsell: Object.freeze({ conservative: 0.02, planning: 0.04, stretch: 0.08 }),
  oto: Object.freeze({ conservative: 0.02, planning: 0.05, stretch: 0.10 }),
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
    if (near(rate, r[k])) return { band: k, message: `Matches the ${RANGE_LABELS[k].toLowerCase()} planning rate.` };
  }
  if (rate < r.conservative) return { band: 'below', message: `Below the conservative rate of ${pct(r.conservative)}. A cautious plan.` };
  if (rate < r.planning) return { band: 'conservative', message: 'Between the conservative and planning rates.' };
  if (rate < r.stretch) return { band: 'planning', message: 'Between the planning and stretch rates.' };
  return { band: 'above', message: `Above the stretch rate of ${pct(r.stretch)}. Make sure you have results that support it.` };
}
