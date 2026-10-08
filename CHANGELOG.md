# Changelog

All builds follow [semantic versioning](https://semver.org). The version lives in `src/version.js`, `package.json` and the `app-version` meta tag in `index.html`; keep all three in step.

- **APP_VERSION**: the product as a whole.
- **ENGINE_VERSION**: the calculation rules. Bump whenever a formula changes.
- **DATA_SCHEMA**: the shape of saved data. Bump when the saved format changes.

## [0.2.0] - 2026-10-08
### Changed
- Complete redesign in Priddy Impact Group brand: deep teal `#004053`, slate `#687083`, gold `#BEAE88`, white. Poppins throughout.
- Gold-foil profit figure with a count-up on every change; animated progress rings for each goal (`@property` + `conic-gradient`); gold-filled sliders; container-query layouts; frosted mobile profit bar.
### Added
- GoHighLevel embedding: `?embed=1` hides the header, makes the page background transparent and posts its height to the parent page so the iframe fits its content.
- `vercel.json` allowing the calculator to be framed by GoHighLevel and faststartpro.com domains only.
- Versioning: `src/version.js`, version shown in the footer, results stamped with the engine version, saved data stamped with schema and versions, cache-busted script imports.
- Brand assets in `assets/`.
### Engine 1.1.0
- Every result now includes `engineVersion`.

## [0.1.1] - 2026-10-08
### Added
- First prototype page (`index.html`).
- Engine: conversion rate needed to reach each goal at current traffic (`requiredConversionRate`).

## [0.1.0] - 2026-10-08
### Added
- Calculation engine and test suite, built on the six locked model decisions.
