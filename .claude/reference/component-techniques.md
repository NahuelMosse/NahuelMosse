# How the best component libraries build their components

Read it when building or rewriting a component of the set (`.claude/templates/components/`). It
holds what shadcn/ui, Radix, React Aria, coss ui, Animate UI, Motion Primitives, Magic UI, Sonner,
Vaul and cmdk do, read from their source: the values, the structure and the edge cases, written so
they can be built in plain CSS and JS. **A repo without React does not get React for its
components: it gets these techniques.**

The gap between a set copied from screenshots and these libraries is in the details below —springs, origins,
grace areas, focus return—, none of them visible in a still image.

## Material: what makes them look expensive

Compared side by side, the gap is not shape but material. Six rules carry most of it:

- **Surfaces build the hierarchy, not borders.** In dark mode each level is ~6 L above the one
  below: page `oklch(14.5%)`, card `20.5%`, overlay `23.5%`. In light mode the card is white on an
  `oklch(98.5%)` page, separated by a 5 % shadow and a hairline. The sidebar and the topbar are the
  page's own color: chrome stays behind, cards come forward.
- **Alpha borders in two weights.** Use `--border` (ink at 9 % light, white at 8 % dark) for a
  card's outline, and `--border-subtle` (5.5 % / 5 %) for row separators, KPI dividers and chart
  grids. Cards need `background-clip: padding-box`, so the alpha border is not drawn twice. A
  hairline `::before` adds light: `0 1px` black 4 % on light, `0 -1px` white 6 % on dark.
- **Controls have their own material.** Their border is alpha but still 3:1: black 44 % on light,
  white 36 % on dark, where every library's default fails. Fields and secondary buttons get a fill
  on dark (white 3.5 %), so they separate from the card. Add a 1 px bottom shadow, and on dark a
  1 px top light. The primary button has an inset top light of white 16 %, and pressing flattens it.
  Disabled is shown by color, never by opacity.
- **Overlays float by ring and shadow, not border.** Use `0 0 0 1px` of an alpha ring plus two soft
  shadows. Set `outline: 1px solid transparent` so forced-colors keeps an edge. The scrim is light,
  `/ .24` on light and `/ .6` on dark, with a 4 px blur.
- **Color goes to data and choice.** The accent marks:
  - what the hand chose: checked controls, the picked day, the selected row (6 % tint, 14 % dark);
  - the current data: the current bar, a hovered bar while the others drop to .55;
  - the one primary action and focus.

  Navigation selects in neutral. Bars are the accent at 28 %, never gray: gray reads as disabled.
- **One signal per state.** The current sidebar item gets a fill, weight 500 and an accent icon,
  with no bar on top. A menu highlight is one sliding pill for mouse and keyboard, and the keyboard
  only adds a 1 px focus tint. Shortcuts in menus are bare glyphs; keycaps belong to a legend.

Radii: cards 12, controls 8, menu items 6, the command palette and dialogs 16, with items inside at
16 − padding. Text in controls is 14/500; the primary button is 500 too, never 600.

## Motion engine

- **Springs, not durations**, for anything that follows the user: a semi-implicit Euler integrator
  sub-stepped at 1/120 s — `a = (-k·(x-target) - c·v)/m; v += a·dt; x += v·dt` — stopped when
  `|v|` and `|x-target|` are below 0.01, writing the style each frame. A critically damped spring
  has `c = 2·√(k·m)`. For CSS, sample the integrator into `linear(…)` (~30 points); the duration is
  the settle time.

  The values are a calibration to start from, not requirements.

  | Where | stiffness | damping | mass |
  |---|---|---|---|
  | Hover / select highlight | 350 | 35 | 1 |
  | Tabs highlight | 200 | 25 | 1 |
  | Switch thumb | 300 | 25 | 1 |
  | Radio dot | 200 | 16 | 1 |
  | Sliding number digit | 280 | 18 | 0.3 |
  | Pointer spotlight | 250 | 30 | 0.6 |
  | Number ticker (entering figure) | 100 | 60 | 1 |

- **Layout moves are FLIP** —measure, invert with `transform`, play—, never `top/left/width`.
- **Popovers grow from their anchor**: `transform-origin` is the anchor side (Radix publishes it as
  a variable); enter `opacity 0→1, scale .95→1` plus a 2-unit slide from the trigger side; exit the
  reverse, shorter. coss uses a subtler `scale .98`.
- **Reduced motion is a global rule**, not per component: displacement, scale and loops go,
  figures land at their value, highlights jump — and what changes still fades in 100–150 ms, never
  zero. Most libraries forget it; the set does not.
- **Everything animates, keyboard included.** An overlay opened with a key grows from its trigger
  like one opened by click; `data-instant` exists only for reduced motion.

## Overlays and menus

- **Dialog**: overlay `rgb(0 0 0 / .5)` fade only; content centered, 200 ms, `scale .95→1` + fade;
  width `min(100% - 2rem, 32rem)`. Focus trapped, outside `inert`, scroll locked, Escape and
  outside click close, **focus returns to the trigger**. Close button with a hidden label.
  **Alert dialog**: no outside dismiss; Cancel first in DOM order and focused on open.
- **Drawer (Vaul)**: `transform .5s cubic-bezier(.32,.72,0,1)`, overlay on the same curve, enters
  from `translate3d(0,100%,0)`. Drag with pointer capture; refuse the drag when a scrollable
  ancestor is not at its top or text is selected. Toward opening, rubber-band:
  `8·(ln(v+1)-2)`. Release: close if velocity > 0.4 px/ms or the drag passed 25 % of the height,
  else spring back. Snap points: nearest, or next if velocity > 0.4 and drag < 40 %; skip points
  above 2 px/ms.
- **Menu (Radix)**: roving tabindex, no loop by default; first item focused on open; select on
  pointerup; Escape closes and returns focus. **Typeahead** buffer clears after 1000 ms, repeated
  letter cycles. **Submenu** opens after 100 ms of hover; a **grace polygon** from the pointer's
  exit point to the submenu edges keeps the highlight from jumping to the item below while the
  pointer travels (300 ms grace). ArrowRight/Enter/Space open, ArrowLeft closes (mirrored in RTL).
  Roles `menu / menuitem / menuitemcheckbox / menuitemradio` with `aria-checked`, `separator`,
  `aria-haspopup` + `aria-expanded` on the sub trigger. Content: `min-width 8rem; padding 4px;
  radius 6px; border; shadow-md`, 4 px from the trigger, max height = available height.
  **Context menu** opens at the pointer; long-press on touch.
- **Tooltip**: open after intent (Radix 700 ms; React Aria 1500 ms) and **instantly** while warm
  (300–500 ms after another closed); only one open; opens on keyboard focus, closes on Escape and
  pointerdown; the pointer may travel into it. 100–150 ms fade with `scale .95`.
- **Select**: listbox with `role=listbox/option`, `aria-selected`, typeahead, Home/End, check on
  the selected item, selection on pointerup with a short ignore window after opening.
- **Combobox**: DOM focus stays in the input; the list is driven by `aria-activedescendant`;
  `role=combobox`, `aria-expanded`, `aria-controls`. Escape clears, then closes.
- **Command palette (cmdk)**: input keeps focus, `aria-activedescendant`; fuzzy ranked filtering
  with keywords; items re-sorted by score; selected item `scrollIntoView({block:'nearest'})` —the
  group heading for a group's first item—; ArrowUp/Down, Home/End, Ctrl-N/P; an Empty that renders
  only with no matches; groups with `role=group` labelled by their heading.
- **Toast (Sonner)**: visible 3, lifetime 4000 ms, gap 14 px. Collapsed: each toast behind is
  `translateY(gap·n)` and `scale(1 - .05·n)`, clamped to the front toast's height, its content at
  opacity 0. Hover, focus or Alt+T **expand**: each at its real height plus gaps (an invisible
  bridge covers the gaps so hover holds). `transform/opacity/height 400ms`. Timer pauses while
  expanded, interacted with or the tab is hidden, and resumes with the remaining time. **Swipe**:
  pointer capture, axis lock, dismiss at 45 px or 0.11 px/ms; against the allowed direction,
  dampen with `1/(1.5+|d|/20)` instead of blocking. **A toast with an action** (Undo) does not use the
  4000 ms: it stays until the person interacts or at least 10 s of effective visibility, pauses on hover,
  on focus and with a hidden tab, and its action also exists outside it (a `Ctrl+Z` shortcut or the
  item's menu); an error toast is not dismissed by itself (UX-FEEDBACK-2, UX-FEEDBACK-3; criterion I20).

## Controls

- **Focus**: one style — border to the ring color plus a 3 px ring at 50 % alpha
  (`:focus-visible` only). Invalid: `[aria-invalid]` border and ring in danger at 20 % (40 % dark).
- **State attributes, not classes**: `data-pressed`, `data-hovered`, `data-focus-visible`,
  `data-disabled`, `data-state=open|closed|checked`, `data-invalid` (React Aria / Radix), so CSS
  styles states and JS only sets them.
- **Sliding highlight** (tabs, segmented, sidebar, menu rows): one absolutely positioned pill in a
  relative container; on select or hover, measure the target (`offsetLeft/Top/Width/Height`) and
  move the pill with the spring; hover mode shows it on enter and fades it after ~200 ms on leave,
  **sliding** if the pointer reaches a sibling in that window; re-measure on ResizeObserver and
  scroll. Pill under the content (`z-index 0 / 1`). Tabs: text color `transition .5s`.
- **Switch**: track 24×40 px, padding 3 px, thumb 18 px moved by the spring; while pressed the
  thumb widens to 21 px (0.1 s); icons inside scale and fade in.
- **Checkbox**: tick drawn with `pathLength=1`, dashoffset 1→0 in 200 ms with opacity; press
  `scale .95`, hover 1.05. **Radio**: dot `scale 0→1` with the radio spring.
- **Accordion**: `.35 s ease-in-out`, opacity, `y 20→0`; the height is final from the first frame and the surfaces and the clip travel with `transform` and `clip-path` (never `height` or `grid-template-rows`)
  and a moving mask (`linear-gradient(black var(--stop), transparent var(--stop))`) so content is
  revealed, not cut.
- **Ripple** (Magic UI): span at the pointer, size `max(w,h)`, `scale 0→2` with opacity 1→0 in
  600 ms, removed after; button `overflow:hidden`.
- **Shimmer** (Magic UI): conic gradient spark sliding along the rim with an `inset` layer hiding
  the center; in product it runs **once** on the page's primary action per session; looping is
  showcase only. Off with reduced motion.
- **Border beam / shine border** (Magic UI): a 50 px gradient square travelling the border with
  `offset-path: rect(0 auto auto 0 round …)` and `offset-distance 0→100%` (6 s linear), visible
  only on the ring by a masked border box; shine animates `background-position` of a radial
  gradient (14 s). In product, **one lap** marks a signature moment (2.4 s, then a 300 ms fade);
  the endless loop is showcase only.
- **Pointer spotlight** (Magic Card): a real element, a 280 px radial blob inside the card and a 200 px one
  on its 1 px edge (a static `content-box exclude` mask), moved by a spring (250 / 30 / 0.6) with a
  `transform` written straight to it once per frame; it fades in with opacity in 240 ms, only with
  `(hover:hover) and (pointer:fine)`. Never a pseudo-element moved through a variable of its parent.
  With reduced motion the light appears where the pointer came in and does not follow.
- **Blur-fade**: `y 6px, opacity 0, blur(6px) → 0`, 400 ms ease-out, delay `.04 s + 40 ms·i`, once,
  IntersectionObserver with `rootMargin -50px`.
- **Sliding number**: per digit a column 0–9 in a `1ch` clip box with `tabular-nums`; offset by the
  shortest wrap-around path (`(10+n-d)%10`, minus 10 if > 5). **Number ticker**: spring from the
  start value, writes `textContent` through `Intl.NumberFormat` **with the repo's locale**.

## Data and layout

- **Sidebar**: 16 rem (18 on mobile sheet, 3 rem collapsed to icons); collapse animates the spacer
  width 200 ms linear while group labels slide up and fade (`-mt-8, opacity 0`); Ctrl/⌘+B toggles;
  state persisted. Items 32 px (28 sm, 48 lg), `gap 8, radius 6, padding 8`, icons 16; hover
  `accent`; **current = same tint + weight 500, no accent bar**; row action shown on item hover or
  focus-within and kept while its menu is open; collapsed items get tooltips. Hairline rail to
  toggle by click.
- **Table**: header 40 px, muted header text so data carries the weight; cells `p 10px`; row
  hover = surface mixed with black 2 % (white 2 % dark), selected 4 % — computed tints, stable
  across themes; checkbox column `width:1px`, nudged 2 px to the baseline; a row keeps its tint
  while its menu is open; last row without border. **Sortable header**: ghost button pulled
  12 px left so its label aligns with the cells, icon ↕ / ↑ / ↓, menu Asc · Desc · Hide;
  **`aria-sort` on the header cell**. Sticky header with the surface background. Empty: one
  full-span cell 96 px tall, centered. **Selection**: header checkbox checked / indeterminate;
  Shift+click and Shift+arrows extend a range; the grid is one tab stop with arrows between
  cells (React Aria behaviour, built by hand). **Card variant**: separate borders, rounded first
  and last cells, an inset 1 px top hairline (black 4 % / white 6–8 %).
- **Card**: radius 16, border, `shadow-xs` at 5 %, the inset hairline; header `p 24, gap 6`, title
  18/600; panels collapse their padding against each other. A **frame** (muted outer layer) holds
  a table or inner cards for the dashboard look.
- **KPI tile**: number 24 → 30 px 600 `tabular-nums` driven by the **tile's container width**
  (container queries), delta as a badge in the header action slot, subtle vertical gradient
  background, grid of 2 → 4 columns by container size.
- **Chart**: series colors as CSS variables per theme; axes without tick or axis lines, margin 8,
  horizontal grid only at 50 % border; area fill a vertical gradient 0.8 → 0.1 of the series
  color; tooltip `min-width 8rem, radius 8, border 50 %, padding 6×10, 12px, shadow-xl`, values
  in tabular mono, a 10 px square swatch.
- **Skeleton**: the caller gives the shape; keep each column's alignment. **Empty**: centered,
  `gap 24, padding 24 → 48`, icon in a 40 px muted square, title 18/500 tight, description muted
  relaxed, actions below.
- **Badge** pill `px 8, py 2, 12/500`; **avatar** 24 / 32 / 40, overlap `-8px` cut out by a 2 px ring
  in the background color, a count chip of the same size; **progress** track 8 px at 20 % of the
  color, indicator moved by `translateX`; **pagination** 36 px items, current outlined with
  `aria-current=page`, labels collapse to chevrons on mobile; **breadcrumb** muted links, current
  in foreground; **kbd** 20 px, 12/500 muted.

## Faithful ports

For a repo without React, `templates/components/motion/` carries the components of the libraries
ported to plain JavaScript and CSS. **The rule: a component is ported from its source, with its
values (springs, durations, easings, sizes, opacities), and compared against the live demo of the
library before it counts as done**; a number invented because it looked right is a defect. Where a
port departs from the original, the departure is written in the header of its `.js` and tested:
what a back office needs and the original lacks (keyboard path, a live region, reduced motion,
`destroy()`), or a value shortened because the product uses it every day. Each port has its `.js`
(`mount(el, opts)` → `{ destroy, … }`), its `.css` (values in its own `:root` block, colors from
`tokens.css`), its `.html` demo, and its tests in the spec of its group (`au`, `ac`, `kk`, `mp`,
`mu`, `arc`), all run by `motion/playwright.config.mjs`.

| Port (`motion/<name>`) | Library | Port (`motion/<name>`) | Library |
|---|---|---|---|
| `animated-list` | Magic UI | `tabs` | Animate UI |
| `animated-beam` | Magic UI | `sliding-number` | Animate UI, Motion Primitives |
| `bento-grid` | Magic UI | `copy-button` | Animate UI |
| `animated-circular-progress-bar` | Magic UI | `theme-toggler` | Magic UI, Animate UI |
| `magic-card` | Magic UI | `flip-button` | Animate UI |
| `number-ticker` | Magic UI | `flip-card` | Animate UI |
| `marquee` | Magic UI | `icons` | Animate UI |
| `apple-activity-card` | Kokonut UI | `animated-tooltip` | Aceternity UI |
| `file-upload` | Kokonut UI | `expandable-card` | Aceternity UI |
| `action-search-bar` | Kokonut UI | `focus-cards` | Aceternity UI |
| `ai-prompt` | Kokonut UI | `floating-dock` | Aceternity UI |
| `card-stack` | Kokonut UI | `sticky-scroll-reveal` | Aceternity UI |
| `smooth-tab` | Kokonut UI | `morphing-dialog` | Motion Primitives |
| `team-selector` | Kokonut UI | `morphing-popover` | Motion Primitives |
| `kk-loader` | Kokonut UI | `transition-panel` | Motion Primitives |
| `profile-dropdown` | Kokonut UI | `animated-background` | Motion Primitives |
| `kokonut-toolbar` | Kokonut UI | `toolbar-dynamic` | Motion Primitives |
| | | `toolbar-expandable` | Motion Primitives |
| `confirm-morph` | Arc (MIT) | `donut-chart` | Arc (MIT) |
| `filter-toolbar` | Arc (MIT) | `line-chart` | Arc (MIT) |
| `sortable-data-table` | Arc (MIT) | `arc-kit` (springs and tokens of Arc) | Arc (MIT) |

The Arc ports (`arc.spec.mjs`) differ from the originals where a back office needs it: Spanish words, a keyboard
path and a live region where the original had none, an inset focus ring on `confirm-morph`, a data table for the
charts and `destroy()`. Where the set already had something similar they **coexist** and the screen picks:
`sortable-data-table` takes `{ columns, rows }` and animates the sort and the selection, while the table of
`components.js` sorts markup that is already there; the `line-chart` mounts a multi-series chart with a morph
between ranges, a dashed previous period and a tooltip, while the line chart of `charts.js` is a single series
read in the card header (the bars stay in `charts.js`; `update({ data })` is the counterpart of `setChart`); the
`donut-chart` has no equivalent. Widths and heights are animated where the original animates them (the pill, the
chip slots, the legend rows), because what is beside them follows.

Arc (uiarc.dev, MIT) and two pieces written from scratch, tested in `arc2.spec.mjs`; they share `arc-shared.js` (Arc's motion
scale, springs as stiffness and damping, an animated value on one frame loop, the text swap) and `arc-shared.css`:

| Port (`motion/<name>`) | Source | Replaces or adds |
|---|---|---|
| `slot-text` | Arc `slot-text` | Adds to `number-ticker` / `sliding-number`: columns keyed by place value, left-to-right landing, letters |
| `text-morph` | Arc `text-morph` | New: a label that morphs in place and a width that follows |
| `morph-select` | Arc `morph-select` | New: the trigger that becomes the list (next to the set's select) |
| `toast-stack` | Arc `toast-stack` | Adds to the toasts of `overlays.js`: description, update in place with the action folding away, Alt+T, rubber-band swipe |
| `usage-meter` | Arc `usage-meter` | New: a segmented quota with rolling digits and a limit marker |
| `activity-heatmap` | Arc `activity-heatmap` | New: a calendar of days with a tooltip that glides |
| `stepper` | Arc `stepper` | New: steps whose marker turns into a check or an alert |
| `speed-counter` | From scratch (idea: Speeding Text, React Bits Pro) | Adds the speed blur to a counter |
| `hover-preview` | From scratch (idea: Hover Preview, React Bits Pro) | New: a floating invoice card over a table cell |

## What they all share

One tint step for hover, the next for selected; low-contrast borders and small shadows (only
floating surfaces get a large one); `tabular-nums` on every number; fixed control heights
(20 / 28 / 32 / 40 / 48); states in `data-*` attributes; focus returned to where it came from;
every overlay grows from its anchor; and motion that follows the hand is a spring.
