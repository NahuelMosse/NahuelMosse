# Origin and license of the component set

What each port of `motion/` came from, and under what license. The licenses are those `reference/components.md`
declares for each library; the upstream `LICENSE` file of each port was **not** re-read for this list, so each
row says `unknown — upstream LICENSE not checked` when the declared license is the only evidence. A license
this list cannot determine is never assumed: it stays `unknown — <what is missing>`.

## Fonts

| File | Origin | License |
|---|---|---|
| `fonts/InterVariable.woff2` | Inter Variable, Rasmus Andersson | OFL-1.1 (`fonts/OFL.txt`) |

## Ports

| Port (`motion/`) | Upstream | License declared by the catalog | Evidence checked |
|---|---|---|---|
| `animated-beam`, `animated-circular-progress-bar`, `animated-list`, `bento-grid`, `magic-card`, `marquee`, `number-ticker`; the View Transition reveal of `theme-toggler` | Magic UI (`registry/magicui/*`) | MIT | unknown — upstream LICENSE not checked |
| `animated-tooltip`, `expandable-card`, `floating-dock`, `focus-cards`, `sticky-scroll-reveal` | Aceternity UI (`ui/*`; the free core, never the Pro items) | MIT | unknown — upstream LICENSE not checked |
| `action-search-bar`, `ai-prompt`, `apple-activity-card`, `card-stack`, `file-upload`, `kk-loader`, `kk-toolbar`, `kokonut-toolbar`, `profile-dropdown`, `smooth-tab`, `team-selector` | Kokonut UI (the free components) | MIT | unknown — upstream LICENSE not checked |
| `copy-button`, `counter` (animated figure), `flip-button`, `flip-card`, `icons`, `sliding-number`, `tabs`, the sun and moon of `theme-toggler` | Animate UI (`registry/*`, `primitives/*`) | MIT + Commons Clause: used in projects, never resold as components | unknown — upstream LICENSE not checked |
| `animated-background`, `counter` (animated number), `morphing-dialog`, `morphing-popover`, `mp-morph`, `toolbar-dynamic`, `toolbar-expandable`, `transition-panel` | Motion Primitives (`ibelick/motion-primitives`) | MIT, Copyright (c) 2024 ibelick | `LICENCE.md` of the repository read on 2026-10-25 |
| `text-scramble`, `text-effect`, `text-roll`, `text-loop`, `text-shimmer`, `spinning-text`, `border-trail`, `glow-effect`, `magnetic`, `progressive-blur`, `image-comparison`, `cursor` | Motion Primitives (`ibelick/motion-primitives`, `components/core/<name>.tsx`) | MIT, Copyright (c) 2024 ibelick | `LICENCE.md` of the repository read on 2026-10-25 |
| `dialog-stack`, `card-swipe`, `continuous-tabs`, `draw-signature`, `feature-tour`, `command-search` | Watermelon UI (`WatermelonCorp/watermelon-platform`, `animated-components/<name>/original.tsx`) | MIT, Copyright (c) 2025-present Watermelon Contributors | `LICENSE` of `watermellon-registry` read on 2026-10-25 (the `watermelon-platform` LICENSE reads "Copyright (c) 2026 Watermelon Platform Contributors"); no third-party attribution in the file of any of the six |
| `confirm-morph`, `filter-toolbar`, `sortable-data-table`, `donut-chart`, `line-chart`, and their shared `arc-kit.js` / `arc.css` (the motion tokens, springs and `physical()` of `registry/motion-tokens.ts`) | Arc (uiarc.dev, `kuratlielia/arc-library`, `registry/components/*`; the free MIT part, never the Pro items) | MIT, Copyright (c) 2026 Elia Kuratli | `LICENSE` of the upstream repository read on 2026-10-14 (commit bfdf7e8): MIT; the copyright notice below travels with the ports |

### Arc license notice

The ports of Arc keep its notice:

```
MIT License

Copyright (c) 2026 Elia Kuratli

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Arc (uiarc.dev)

| Port (`motion/`) | Upstream file (`registry/components/<name>/<name>.tsx` and `.module.css`) | License | Evidence checked |
|---|---|---|---|
| `slot-text`, `text-morph`, `morph-select`, `toast-stack`, `usage-meter`, `activity-heatmap`, `stepper` | `kuratlielia/arc-library` (Arc), free components of the public repository | MIT, Copyright (c) 2026 Elia Kuratli | `LICENSE` of the repository read on 2026-10-14 (study `estudio/40-ui-nuevas-fuentes.md`). The Pro components of Arc are proprietary and are not ported. |

The shared pieces `arc-shared.js` and `arc-shared.css` restate the motion tokens of Arc (`registry/motion-tokens.ts`, `registry/foundation.css`: durations, curves, the five springs, stagger and blur steps), also MIT.

```
MIT License

Copyright (c) 2026 Elia Kuratli

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Written from scratch

`speed-counter` (a counter whose directional blur follows the speed of the number) and `hover-preview` (a floating invoice
card over a table cell) are original code for this set. Their ideas come from two components of React Bits Pro (Speeding
Text and Hover Preview), a proprietary library that forbids building kits from it; none of its code was read or copied,
only the public description of the effect (the names and defaults in its documentation) was used as a starting point.

## The set itself

`tokens.css`, `primitives.css`, `components.css`, `components.js`, `core.js`, `overlays.js`, `charts.js`,
`life.css`, `life.js`, `effects.css`, `showcase.css` and `motion/flip-size.js` (the transform, clip-path and
border-radius that make a box change size without animating layout) are written for this kit. Their behavior follows
published grammars (Radix menus and selects, cmdk palettes, Sonner toasts, React Aria interactions); no
code of those libraries is known to be copied: unknown — a line-by-line comparison was not made.

## Rule for new ports

A port enters with its upstream, its license read from the upstream's `LICENSE` file and the date it was
read, in this table, in the same commit. A port whose license is blocked by `reference/dependencies.md`
(GPL, AGPL, SSPL, BUSL, non-commercial, none) does not enter.
