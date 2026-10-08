/**
 * Single source of truth for versions. Bump on every build (semver).
 * APP_VERSION    — the product as a whole (UI, config, deployment).
 * ENGINE_VERSION — the calculation rules only. Bump when any formula changes,
 *                  so saved calculations and exported reports show which math produced them.
 * DATA_SCHEMA    — shape of saved data. Bump when the saved format changes.
 */
export const APP_VERSION = '0.3.3';
export const ENGINE_VERSION = '2.0.0';
export const DATA_SCHEMA = 2;
export const BUILD_DATE = '2026-10-08';
