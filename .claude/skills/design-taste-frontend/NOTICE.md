# Third-party notices

## impeccable (Apache License 2.0)

The craft-floor measures of `scripts/lib/probe.mjs` and the copy tells of `scripts/lint.mjs` port the detection logic and
thresholds of the impeccable detector.

- Source: https://github.com/pbakaus/impeccable, commit `c3bb418ee38ee49a6b999b7752c1368f3123a2bd` (2026-11-05)
- Copyright 2025 Paul Bakaus
- License: Apache License, Version 2.0, http://www.apache.org/licenses/LICENSE-2.0

Ported rules: side-tab, nested-cards, tight-leading, wide-tracking, all-caps-body, crushed-tracking, skipped-heading,
cramped-padding, gray-on-color, heading-rhythm, monotonous-spacing, justified-text, oversized-h1, repeating-stripes-gradient and
codex-grid-background (as `stripe-grid-bg`), edge-flush-cards, clipped-overflow-container, theater-slop-phrase,
aphoristic-cadence. The thresholds are impeccable's; the code is rewritten for this inspector's measurements and is not a copy.

Unless required by applicable law or agreed to in writing, the work is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied.
