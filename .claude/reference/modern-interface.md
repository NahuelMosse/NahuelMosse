# Modern interface: concrete values

**This is the product register** —expression 2 to 4, software used every day—. A screen that has
to impress, to be shown in a video, is the showcase register: `reference/showcase.md`. Either way,
the components come from `reference/components.md`, installed, not drawn.

What is perceived today as professional software —Linear, Attio, Raycast, Mercury, Stripe, Vercel,
with Carbon, Atlassian and Apple behind the systems— distilled into rules with values. Read it when
writing the design line, `## Look` and `## Information`. Hover and press are a **calibration from Linear**, measured on those
products, not universal values, and overlays come from the documented systems (`reference/motion-benchmark.md`); the
components that carry them are in
`reference/components.md` and `templates/components/`. When to choose each component is in
`reference/ui-patterns.md`; the front-end performance budgets (initial JS per route, Web Vitals, O15), in
the front-end section of `reference/performance.md`.

**The idea:** a professional interface does not feel premium because it has many animations; it
feels premium because **every state change has a designed response**. A screen can hold fifty
micro-interactions and none look put there for its own sake —the 90 % are tiny changes of opacity,
transform, border, background, layout and focus—. **Structure → hierarchy → states → feedback →
spatial continuity → delight**: the typical mistake is to start with delight.

## Ten rules, by impact

1. **One thing leads per screen.** Hierarchy by contrast, not only by size: primary text, secondary,
   metadata, actions and states each have a deliberate level. Dimmer navigation, small icons.
2. **Fewer surfaces.** Not everything is a card: eighteen rounded rectangles separated by gaps look
   like a generated dashboard. Group by space and alignment; a surface is earned. Measured on product screens by `product: card in card` and `product: row as card` (`design-round.mjs --kind product`).
3. **Figure first.** In an indicator, the value on top, the change beside it, the chart below.
4. **Neutrals of 12 steps with fixed roles and one or two accents**, in OKLCH or LCH (Linear moved
   from HSL to LCH and from 98 theme variables to 3: base, accent, contrast).
5. **A hairline border plus layered, low shadows**; what floats gets more. Concentric radii —the
   inner radius is the outer minus the padding—. Optical alignment: ±1 px when it looks better.
6. **Few weights (400, 500, 600), negative tracking as size grows, `tabular-nums` on every number.**
7. **Density is deliberate.** A tool used all day shows more at once than a landing, with enough
   hierarchy so it is not noise. Measured by `product: content span` (85 % of the width at 1440) and the rows in the first viewport.
8. **Design states, not components**: a button is rest → hover → focus → pressed → loading →
   success/error → disabled; an input, empty → focus → typing → valid/invalid → saving → saved.
9. **Gradient, glass and blur only when they say something**: depth, a light source, the navigation
   layer, focus. Never as wallpaper. Measured by `product: backdrop-filter` and `product: background gradients`: 0 unless `## Look` declares `brand-chrome:`.
10. **No SaaS kit**: identical cards with the same shadow, uppercase headings with wide tracking,
    the same entrance on everything.

## Product defaults

What a product screen starts from, with its values; a project changes a value in its tokens, not the rule.

- **One primary per view.** A single filled accent button; secondary and ghost are neutral (hairline border, `--surface-hover` on hover). Destructive is neutral with danger text until hovered.
- **The accent marks value and the selection of data; navigation is neutral.** A checked checkbox, radio and switch, the chosen day and the range of a calendar, the selected row (a 6 % tint, 14 % in dark), the current row's bar, the current bar of a chart and the product mark are the accent. A segmented control, a toggle group, a tab, the fill of the current sidebar item and the highlight of a menu are neutral (`--surface-active`, `--hl-bg`): the accent there would say «value» where it means «where you are». The current sidebar item carries the accent only on its icon.
- **Toolbar.** Title (20 px, 600) and count (13 px, faint, tabular) on the left; search, filters and the primary on the right, one control height (32 px); under 640 px the controls drop under the title at full width.
- **Stable table columns.** `table-layout: fixed` with a `<colgroup>`; rows 40 px, header 36 px and sticky; numbers right-aligned and `tabular-nums`. Filtering hides rows and never changes a width; an empty result is a row with the message and the action that resolves it.
- **Figures that can be believed.** A KPI's figure, its change and its trend line come from the same filtered set: the figure is the current period, the change is that period against the one before, and a zero before says «new», never a percentage. Chart ticks are round (1, 2 or 5 × a power of ten, from zero), a bar chart's unit is its figure's unit, and the current month is the data in the accent. On a phone the KPIs are one strip that scrolls and snaps, and a list row is a card of two lines: who and how much, then what, when and the status.
- **Container by what the page holds.** A reading page (a form, settings, an article) is 1200 px wide or less and centered; a data screen (a board, a list, a record) spans the width beside its navigation, 85 % or more from 1200 px (`product: content span`). Gutters of 24 px, 32 px from 768 px up; content never glued to the left at 1280.
- **Information first on a dense screen.** The screen serves the decisions of `## Information`: the main decision's fields sit together in the first viewport, seven at most (Salesforce's highlights panel shows seven), in a header that stays on a long record, each value larger, heavier or of more contrast than its label; a second decision is its own group, separated by more space than the space inside a group; what serves no decision goes one interaction away (a tab, a disclosure, a drawer), and audit data (ids, who changed what) out of the first view. Spacing is one scale on a 4 px grid, and six steps carry most of the layout (measured: GitHub, Plausible, Tremor and shadcn dashboards put 84–100% of their layout spacing on 4 px and 92–100% on their six most used values). Tabular data is a `<table>` with its headers, numbers right-aligned. `ia-check.mjs` measures each of these.
- **Press and focus.** Press `scale(0.98)` in 80 ms (the Linear calibration), release on a 240 ms spring; focus-visible is a 2 px ring with 2 px offset, and a text field takes a 3 px halo that grows in 120 ms; hover only with a fine pointer.
- **Everything animates, short and interruptible; reduced motion fades.** Nothing is instant, not even what the keyboard opens: a panel opened by Enter animates like one opened by click. With `prefers-reduced-motion` displacement and scale become an opacity or color fade of 100–150 ms, never zero. **The card outranks motion:** what the card says disappears, is replaced or stops existing leaves the DOM in the event's own task, with no exit animation on that node, no `hidden` and no deferred `remove()`; the motion goes on what enters and on the neighbors (FLIP).
- **Light neutral by default, one accent.** Twelve OKLCH steps whose neutrals take the brand hue (a cool gray is a preset), dark as `data-theme="dark"`; the accent is three numbers (`--accent-hue`, `--accent-chroma`, `--accent-l`: the project's brand color, with muted indigo and mono as presets) and every tint, hover, text and ring derives from them in OKLCH, so 4.5:1 and 3:1 hold in both themes. The accent is the one primary action, the focus ring, the value of a control and the selection of data. In dark the page, the card and the overlay are three steps of lightness, about 6 L and 3 L apart.
- **Type.** Defaults of a dense tool, changed in the tokens: 12 / 13 / 14 / 16 / 20 / 28, weights 400 / 500 / 600, tracking negative from 20 px up, `tabular-nums` on every number.

## Values

**Typography** (Radix Themes; Carbon uses a 14 px base for product):

| Step | Size | Line height | Tracking |
|---|---|---|---|
| 1 | 12 px | 16 | +0.0025em |
| 2 | 13–14 px | 20 | 0 |
| 3 | 16 px | 24 | 0 |
| 4 | 20 px | 28 | -0.005em |
| 5 | 28 px | 36 | -0.0075em |
| 6 | 40 px | 44 | -0.02em |
| 7 | 60 px | 60 | -0.025em |

Families used in product: Inter (Linear adds Inter Display for headings), Geist, the system stack.
Line length of 80 characters or less.

**Color** (Radix 12-step scale): 1–2 app and card background · 3–5 component background at rest,
hover, active · 6 subtle border · 7 control border · 8 hover border · 9–10 solids · 11 low-contrast
text · 12 high-contrast text. Semantic tokens in pairs, in `oklch()`, dark mode overriding the same
names; in dark mode elevation is lightness.

**Spacing** (base 4): 4, 8, 12, 16, 24, 32, 48, 64, 80. Inside components 4–12; card padding 16–24;
between sections 32–80. **Radii**: one base and the others derived.

**Dashboard grid** (Stripe, Carbon, Mercury): the most important at top left; up to three charts per
row with the same height; charts that update when filtering, not twenty cards.

## Motion

**Productive and expressive** (Carbon). Productive is frequent, fast, almost invisible: hover,
toggle, dropdown, reorder. Expressive is rare and can call attention: a success that matters, an
onboarding, the main transition. **95 / 5.** **Every interaction gets its micro-animation, the
frequent ones and the keyboard ones too** —a menu opened with a key still grows from its trigger, the
highlight still slides—: short and interruptible so it never slows the work. That is what makes an
interface feel alive and cared for; a static one reads as generic.

| Interaction | ms | Movement |
|---|---|---|
| hover, focus | 50–120 | controls: color, background, border; **surfaces that open or select** —cards, rows, chart marks—: depth too, a shadow step, a brighter border, the mark highlighted with its value; never position. Focus appears without delay |
| press | 70–110 | `scale(0.97)`–`0.98` |
| toggle | 100–150 | position + color; the knob with a spring |
| tooltip | 100–150 | fade from its origin, after 400 ms of intent; instant while warm |
| dropdown, popover | 120–180 | fade + 4–8 px from its trigger (`transform-origin`) |
| accordion | 150–220 | final height at once; surface by `transform`, panel by `clip-path` (`motion/flip-size.js`) |
| toast | 180–240 | fade + translate from the edge |
| modal | 200–280 | fade + scale from 0.97; exit 150–200 |
| drawer | 220–320 | translate from its edge |
| shared element, view change | 250–400 | layout (FLIP, View Transitions) |
| celebratory moment | 400–700 | exceptional |

**Curves.** Enter decelerates: `cubic-bezier(0.23, 1, 0.32, 1)`. Move on screen: `cubic-bezier(0.77,
0, 0.175, 1)`. Exit accelerates and is shorter. **Never `ease-in` to enter**: it delays the moment
the user is watching. Springs **only where there is physics** —dragging, sliders, switches,
reordering, shared layout—, critically damped or almost: a dropdown that bounces looks like a toy.
In CSS, a spring is a `linear()` curve; in JS, Motion.

**Spatial continuity is the most premium improvement.** What appears comes from somewhere: tab →
underline that slides, row → detail panel that grows from it, button → popover from the button,
card → panel, thumbnail → viewer. Nothing teleports.

**Perceived speed counts more than decoration.** Respond on pointer-down. Optimistic updates when
safe and reversible, with undo. Skeletons follow the delay of `ui-patterns.md` UX-CARGA-1. A skeleton has the shape of what arrives (`skeletonOf` the same markup): a list loads as circle and lines, a table as its cells, never a stack of grey bars.

**Technique, in this order:** CSS transitions —they can be interrupted and retarget from the
current value; keyframes restart from zero— → Web Animations API → View Transitions →
Motion or GSAP only when needed (GSAP for cinematic scroll, not for 48 hover states) → Rive for one
signature animation. Radix for primitives in React. **Only `transform` and `opacity` for movement;
never `transition: all`; never animate `width`, `height`, `top`, `left` or margins.** Reveal with
IntersectionObserver or `animation-timeline: view()`, never with a `scroll` listener.

**Life is dosed by frequency, not banned.** Products that feel alive borrow from Magic UI, Animate
UI and Kokonut: a ripple on press, a spotlight that follows the pointer on an interactive card,
icons that move on hover, a check that draws itself, a row that glows when it arrives. The dose
depends on how often a thing is used:
- **Used a hundred times a day** (the command palette, tooltips): feedback only.
- **Used tens of times** (hover, rows, navigation): one short response per hover, under 200 ms.
- **Used now and then** (dialogs, toasts): the standard motion plus one detail.
- **Rare or first-time**: expressive. This is where a signature moment goes, with confetti or a beam
  lap.

Every loop pauses off screen. A celebration can be turned off and always comes with a text toast.

**What stays out:**
- Tilt on cards that carry figures, and magnetic targets.
- Custom cursors, and dimming the neighbours of a hovered card.
- Gradients or backgrounds that loop forever, and scrambled or typed text over amounts.
- A staggered entrance on every navigation, and bounce on dropdowns.
- 500–800 ms for normal actions.

The set (`templates/components/life.js`, `life.css`) carries the dosed version.

**Accessibility.** All non-essential motion has its `prefers-reduced-motion: reduce` version:
**fewer and gentler, not zero** —slide and scale become a crossfade, feedback of color and opacity
stays—. Nothing loops for more than 5 s without a way to pause it (WCAG 2.2.2). Content usable from
the first frame. `prefers-reduced-transparency` drops the blur; `prefers-contrast: more` hardens
the borders. **And mediocre hardware**: if it only feels right on a 120 Hz laptop, it is not done —
`motion-audit.mjs --cpu 4`.

## Micro-design

What you notice after five minutes of use, and no screenshot shows:

| Detail | How |
|---|---|
| **Response times** | up to 0.1 s feels instant; past 1 s, show it is working; past 10 s, how much is left and how to cancel (NN/g) |
| **A button that does something** | Save → Saving… → Saved ✓, without changing width; it does not submit twice |
| **Form validation** | when the person tries to advance (submit, continue), not while typing and not on leaving an empty field; after the first error the field is re-validated while it is corrected; the error inline, specific, animated open, not a modal; it goes away when corrected (UX-INPUT-1, I22) |
| **Delete** | the row goes at once and a toast offers Undo; if the request fails, it comes back with the error |
| **Notices** | `role="status"` for what went well, `role="alert"` for errors; a critical error does not leave on its own |
| **Focus** | `:focus-visible`, 2 px outline with offset, 3:1 contrast; never `outline: none` without a replacement; the focused element is never hidden behind a sticky bar (WCAG 2.4.11, I14) |
| **Drag** | there is always a way without dragging: “Move to…”, up and down, a click on the slider's track (WCAG 2.5.7, I14) |
| **Keyboard** | J/K or arrows in lists, Escape closes and returns focus, a command menu if the product has many actions |
| **Targets** | 24 × 24 px minimum (WCAG 2.5.8); a checkbox's label is part of its target |
| **Cursors** | `pointer` on the clickable, `not-allowed` on the disabled, `progress` while working |
| **Text that does not fit** | `text-overflow: ellipsis` with the full value accessible; in flex, `min-width: 0` |
| **Scrollbars and touch** | `scrollbar-gutter: stable`; `touch-action: manipulation`; `overscroll-behavior: contain` in a modal |

## Sources

Linear (“How we redesigned the Linear UI”, linear.app/now) · Attio · Raycast · Mercury and Mercury
Insights · Stripe and Stripe Checkout · Vercel and Geist · Framer (interactive websites) · Lando
Norris (expressive direction) · IBM Carbon motion (productive and expressive, 70/110/150/240/400/700
ms) · Atlassian motion · NN/g (animation duration, response times) · Material 3 motion · Apple HIG
motion · Emil Kowalski, `review-animations` and `apple-design` (vendored, MIT) · Rauno Freiberg,
*Invisible details of interaction design* · Dan Saffer, *Microinteractions* · MDN and W3C
(`prefers-reduced-motion`, WCAG 2.2.2, `@starting-style`, View Transitions, `linear()`) · web.dev
(animations, CLS) · Radix · Motion.
