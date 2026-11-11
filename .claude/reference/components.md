# The component catalog

**A repo with its own design system uses it; otherwise a component this catalog covers is installed, never written by hand.** The libraries below have
already solved —with thousands of hours of design behind them— the glass, the light that follows
the pointer, the borders that live, the figures that slide, the dialogs that morph from their card.
A card writes a component only when nothing here covers it, and then it enters the project's set
with its gallery entry and its tests (definition of done, below).

The plan and the gate hold it. The task that builds a screen names in `reuses:` where its pieces
come from: registry items (`@shadcn/table`, `@coss/dialog`, `@magicui/number-ticker`) or
`components/ui/` files in a repo with shadcn; `design/components/` (and `record.html` for a dense
record) without React. The gate fails a screen whose markup writes a native button, field, select,
table or dialog outside `components/ui/` (`I-catalog`), and, without React, one drawn with classes
of its own instead of the set's and the ports of `templates/components/motion/` (`I-set`).

*Measured: a site built with a hand-written set scored 5 out of 10 against the team's references in
a blind comparison —“the hover gives no depth, the figure is static, the background is flat”—; every
one of those gaps is a component of this catalog.*

## The stack and how a component comes in

React 19 + TypeScript + Tailwind v4 + `motion` (`motion/react`), with the shadcn CLI, which copies the
component's code into the project —it is not a dependency, it is yours to adapt—:

```
npx shadcn@latest add @magicui/magic-card
npx shadcn@latest add @aceternity/card-spotlight
npx shadcn@latest add @kokonutui/liquid-glass-card
npx shadcn@latest add @animate-ui/components-animate-tabs
npx shadcn@latest add @coss/dialog
npx shadcn@latest add "https://motion-primitives.com/c/morphing-dialog.json"
```

The profile is `stacks/react-shadcn.md`. A repo without React keeps the hand-written set of
`templates/components/`, as a fallback.

### The fallback set: product and showcase

`templates/components/` is one set with two registers, the kit's demo and starting point. Its gallery is a back-office app —sidebar,
breadcrumb, toolbar, a table with selection bar and a detail panel that grows from the row into a
split view, row and user menus, forms, settings, empty, loading and error states— plus a «Componentes» tab with each component in every
state; a switch in the top bar turns the same app light, dark or showcase, and the accent into
the brand blue (the default accent, #355DF4), indigo or mono.

| Register | What it holds | How it is switched on |
|---|---|---|
| `product` (default) | tokens (light neutral, `data-theme="dark"`, accent in three numbers; Inter Variable shipped in `fonts/`; color mixes in oklab; control edges at 3:1; `data-locale` for numbers, currency and dates), primitives, every component of the gallery with its micro-interaction: button (spring press, shimmer once per hover, loading keeps its label, success morph, error in the danger tone), field with one focus style, counter and animated error validated on leaving, checkbox, radio and switch (the accent when checked), a slider, segmented (a raised thumb on a sunken track) and tabs, tooltip (warm: it slides to the next anchor), **one floating surface** for the menu (icons, checkbox and radio items, submenus, context menu, keyboard accelerators; one highlight pill, for pointer and keyboard, lights the active item of the menu, the select, the combobox and the palette), the select (a listbox, Radix grammar), the combobox (the value is an option, or an explicit «Crear X»), the date picker (keyboard-walkable, ranges; one footer for both kinds: today, this week, this month, last 30 days, clear), the popover and the hover card; dialog and drawer with header, body and footer, and a card or row that morphs into its dialog or panel and back; a detail panel that is a split view beside the table (J/K, URL hash); toasts that stack like Sonner's, with swipe to dismiss and the undo bar; table with FLIP, selection, a sliding highlight that lets go of a row that is gone, rows that enter and leave, a skeleton that keeps each column's alignment and, on a phone, cards with two lines of hierarchy (`data-cards="summary"`); accordion, rolling numbers, a KPI band whose figure, change and sparkline all come from the same filtered set (the strip scrolls and snaps on a phone; «nuevo» instead of a percentage of zero), charts with round 1-2-5 ticks, real HTML axes, the current month in the accent and a tooltip that answers over the whole column band and says the change on the month before, empty state, a command palette that searches invoices and clients (recents, sub-pages, shortcuts), status change in place, selection bar with shortcuts, a reorderable list and a board of cards by status (`drag.js`: the item is lifted with a placeholder of its real size, the neighbours make room on a spring, the box under it scrolls near its edge, and Space, the arrows and Escape do the same without a pointer), a box that scrolls sideways shows a shadow on the side that has more, skeleton with a shimmer band, and `ui.skeletonOf(html)`, which makes the markup of what will arrive its own skeleton (`ui.withSkeleton(host, ui.skeletonOf(html), load)`): a bone over each run of text and each mark, one sheen that crosses the whole block, the same height before and after, so the swap moves nothing. Alive on purpose and quiet: one highlight that slides under the pointer across sidebar, tabs, segmented options and table rows (`highlight`); a view that slides in from the side the navigation came from while its blocks blur-fade in (`enterView`); tab panels that slide in the same way. Springs critically damped, everything with its reduced-motion fallback. **Life, in proportion to how often a thing happens** (`life.css`, `life.js`; a palette or a tooltip gets none, a hover or a row only feedback of 200 ms or less, a dialog or a toast its standard motion plus one detail, and what is rare is expressive): a ripple from where a button was pressed, a plus that turns, a label that swaps, a shimmer once when the page arrives; icons that move by parts when the pointer rests on a sidebar or menu item (`intent`, 100 / 80 ms, never from the keyboard); a pill that slides between the KPIs, the last point of each sparkline that settles and pulses, a figure the user changed that flashes the tone of what it did; a check that draws itself in a toast, and `ui.toast.promise` with a shimmering label; a row that is uncovered and glows once, a band that crosses a row whose status changed; a status that pings when it first comes into view and a badge that grows from its left edge; the pointer light on the cards that can be pressed; the first-run empty state (words, dots under the pointer, a pulse three times); the area of a chart uncovered in step with its line, rings on the current point; checkbox and radio rings, a switch that fills from its knob, a slider bubble that leans; segmented and tab labels clipped to the pill that moves under them; the circle that opens a new theme (View Transitions). **Four signature moments** that are allowed to be expressive (`ui.moments`): the first invoice (confetti, once in a life), collecting an overdue one (a burst, and a lap of light when none is left), a record month (rings, a badge, a lap in the accent, once a month) and sending (the icon flies). Each says what happened in a toast, runs one at a time (`celebrate`), and obeys `data-celebrate="off"` and reduced motion. Code in `core.js` (helpers, the spring integrator, locale, messages), `overlays.js` (everything that floats), `charts.js`, `life.js` and `components.js` | nothing: it is the default |
| `showcase` | `showcase.css` (a dark skin; its accent is the brand's, never a fixed hue), `effects.css` (the low-opacity light that follows the pointer, on every `.spotlight` in this register and on the cards that can be pressed in any; the border beam on the one element that needs attention, `.beam[data-attention]`; glass, shimmer, scroll progress) | `data-register="showcase"` on the root; the effect classes sit in the markup of any register and the product draws the beam and the light on figures in none |

**The dense record** (`record.html`, with `record.css` and `record.js`): one record that holds dozens of
fields —a client account, a loan, a case— laid out by decision. A header that sticks and keeps up to seven
key facts as tiles (the value rolls, a spark of its trend, two on a phone), the decision's actions in it (a bar
at the thumb on a phone, the destructive one apart), the stepper path of the record's stages, the exceptions
first with a link to each section, a section nav that stays and marks where you are (scrollspy, its ink
sliding under the link), then a 2:1 body: label-value groups of eight pairs at most with one value column and
«—» for a missing value, policy checks with failures first and never by color alone —each meter a bullet
graph whose tick is the limit (`--limit` on `.checks__meter`), what passes folded behind its count, the as-of
date of the data in the section's note—, a table with right-aligned tabular numbers and its scroll shadows,
the history; context in the narrow column, under the main one on a phone. The request is tried against other
limits: the slider moves the figure, the ring and the rules that depend on the limit, and offers the way back
to the request. Each decision opens a dialog that states its consequence; one against a rule, or a
destructive one (`role="alertdialog"`, opening on Cancel), requires its reason, and `decide()` writes it to the
history with `logEvent()` (the new event comes in on top, tinted for a moment) before the toast, which rises
above the phone's bar. The record comes in in reading order. `scroll-padding` keeps every anchor and focused
control out from under the bars (WCAG 2.4.11). `record.spec.mjs` tests it at 1280 and 390, with axe in light
and dark.

| Library | License | Use it for |
|---|---|---|
| **shadcn/ui** (`@shadcn`) | MIT | the base: button, button group, input, select, dialog, sheet, table, tabs, charts (Recharts) |
| **coss ui** (`@coss`) | MIT (`apps/ui`; the rest of its repo is AGPL — never copy from there) | product components on Base UI: toast, combobox, autocomplete, drawer, number field, OTP, calendar, meter, command |
| **React Aria** (`@react-aria`) | Apache-2.0 | interactions and accessibility of anything custom: `usePress`, `useHover`, `useFocusRing`, drag and drop, collections |
| **Magic UI** (`@magicui`) | MIT | effects, animated text, figures, backgrounds, devices |
| **Aceternity** (`@aceternity`) | MIT core; **Pro items are not used** (magnetic-button, notch, 3d-globe, terminal, gooey-input, the shaders) | showcase backgrounds, cards, scroll storytelling, navigation |
| **Motion Primitives** (`https://motion-primitives.com/c/<name>.json`) | MIT | motion primitives with continuity: morphing dialog, transition panel, sliding number; text effects (scramble, roll, shimmer) and border or light effects (border-trail, glow) |
| **Animate UI** (`@animate-ui`) | MIT + Commons Clause: use it in projects, never resell the components as such | animated Radix/Base/Headless primitives, animated tabs, avatar group, animated icons |
| **Kokonut UI** (`@kokonutui`) | MIT (the free components; `kokonutui.pro` templates are paid) | liquid glass, spotlight cards, smooth tabs and drawer, text effects |
| **Bencho** (`bencho.dev`, repo `cabralorenzo/bencho`, the free half: 44 blocks and 24 sounds) | MIT (repo `LICENSE` read 2026-10-29; the name, the mark and the site's photographs are not covered; Pro blocks are paid and not used) | micro-interactions to read and port, not to install: most blocks are demos with fixed data and pointer-only input. Worth porting: `checklist` (one spring 380/34/0.9 drives the fill, the tick and the strike of a row), `one-time-code` (one invisible real input with `autocomplete="one-time-code"`, so paste and autofill work), `label-input` (a floating label on a real `<label for>`), `time-scrubber` (`role="slider"`, arrows, the step decided on release), `slide-confirm` (commits only at the end of the track; a port adds the keyboard path and the role). `sounds/` synthesises interface sounds with Web Audio and has no mute: a port gates it behind a setting and reduced motion, and only in `showcase`. Not used: `dynamic-island`, `dock`, `glass-bubble` (they imitate Apple's UI) and the upload dropzone (a simulation, no file input) |
| **React Bits** (`@react-bits`, registry `"@react-bits": "https://reactbits.dev/r/{name}.json"` in `components.json`; `npx shadcn@latest add @react-bits/SplitText-TS-TW`, suffix `JS`/`TS` + `CSS`/`TW`) | MIT + Commons Clause (repo `LICENSE.md` read 2026-11-07): used inside the project, its copyright notice kept; the components are never redistributed on their own, so none is copied into this kit. React Bits Pro is proprietary and not used | `showcase` text effects (split, scramble, shiny, decrypted), cursor effects and shader backgrounds. At most one WebGL background per page (`ogl`/`three`), lazy-loaded, with a still image under reduced motion and on a weak GPU; a few components do not check reduced motion, so `motion-audit` runs after one comes in |
| **Watermelon UI** (`ui.watermelon.sh`, repos `WatermelonCorp/watermelon-platform` and `watermellon-registry`) | MIT (repo `LICENSE` read 2026-10-25; the provenance of each contributed component is not guaranteed) | a large catalog of blocks and animated components; a component is ported only after its file and credit are read, never those that imitate a brand UI (`family-*`, `aave-*`) |

## The register of each row

Every row says in which register it is used, the same two of `reference/modern-interface.md` and
`reference/showcase.md`:

| Register | Where |
|---|---|
| `product` | software used every day (expression 2 to 4): it is used without asking |
| `showcase` | a screen that has to impress (expression 8 to 10): **it is not used in software used every day**. What `modern-interface.md` lists as removed —gradients that follow the mouse, text that appears word by word, tilt, glare, parallax, confetti, intercepted scroll— is `showcase` here |
| `both` | it works in either; in product, with the restraint of `modern-interface.md` |

## What each need uses, and how it moves

Values are those of the component's source; the project adapts colors and sizes to its tokens, not
the motion.

### Surfaces that answer the pointer

| Need | Component | Register | How it works |
|---|---|---|---|
| Card whose border lights up where the pointer is | `@magicui/magic-card` | `showcase` | border = `radial-gradient(200px circle at x y, #9E7AFF, #FE8BBB)` on `padding-box` background; the point follows a spring `stiffness 250, damping 30, mass 0.6`; resets to −200 px on leave, on window blur, on hidden tab. Mode `orb`: a diffuse glow |
| Card with a spotlight that reveals | `@aceternity/card-spotlight`, `@kokonutui/spotlight-cards` | `showcase` | radial mask that follows the pointer and reveals a gradient or dots |
| Glass | `@kokonutui/liquid-glass-card` | `both` | SVG filter: `feTurbulence baseFrequency 0.05, numOctaves 1` → `feGaussianBlur 2` → `feDisplacementMap scale 30` (cards) / `70` (buttons) → `feGaussianBlur 4`; `bg-background/20 backdrop-blur-[2px]`; inner 3 px shadows as the light edge; hover overlay `via-black/5` in 200 ms. In product only where it says something: the navigation layer, depth |
| Glare | `@magicui/glare-hover`, `@aceternity/glare-card` | `showcase` | a light band crosses the surface with the pointer |
| Tilt | `@aceternity/3d-card`, `@aceternity/comet-card`, Motion Primitives `tilt` | `showcase` | perspective rotation toward the pointer, limited to a few degrees |
| Focus on one, blur the rest | `@aceternity/focus-cards` | `showcase` | the hovered card stays sharp, the others blur and dim |
| Hover that knows the side | `@aceternity/direction-aware-hover` | `showcase` | the overlay enters from the side the pointer came from |

### Borders and light

| Need | Component | Register | How it works |
|---|---|---|---|
| A beam that travels the border | `@magicui/border-beam` | `showcase` | 50 px beam along `offset-path` of the border, 6 s loop, `colorFrom #ffaa40 → colorTo #9c40ff`, 1 px border cut with `mask-intersect` |
| A shine that travels the border | `@magicui/shine-border` | `showcase` | conic shine, 14 s loop |
| Neon card | `@magicui/neon-gradient-card` | `showcase` | animated gradient border with blur glow |
| Gradient border on hover | `@aceternity/hover-border-gradient`, `@aceternity/moving-border` | `showcase` | the gradient grows from the pointer or runs around |
| Glow that follows the container | `@aceternity/glowing-effect` | `showcase` | border glow that tracks the pointer's proximity |

### Figures and data

| Need | Component | Register | How it works |
|---|---|---|---|
| A figure that counts up when seen | `@magicui/number-ticker` | `both` | spring `damping 60, stiffness 100`, starts once in view (`useInView once`), writes `textContent` with `Intl.NumberFormat` (no re-render); `decimalPlaces`, `delay` |
| A figure that changes | Motion Primitives `sliding-number`, `animated-number` | `product` | each digit slides vertically to its new value |
| Progress | `@magicui/animated-circular-progress-bar`, `@coss/meter`, `@coss/progress` | `product` | |
| Charts | `@shadcn/chart` (Recharts) | `product` | the line draws, the header of the card reads the point under the pointer (nothing floats over the plot); series colors from tokens |
| List that grows | `@magicui/animated-list` | `product` | new items enter on top, the rest move down |

### Text

| Need | Component | Register | How it works |
|---|---|---|---|
| Headline that enters | `@magicui/text-animate`, Motion Primitives `text-effect`, `@aceternity/text-generate-effect`, `@react-bits/SplitText-TS-TW` (GSAP SplitText) | `showcase` | by word or by letter, `blur → 0` and fade, staggered |
| Shine that runs over text | `@magicui/animated-shiny-text`, Motion Primitives `text-shimmer`, `@kokonutui/shimmer-text` | `showcase` | |
| Gradient text | `@magicui/aurora-text`, `@magicui/animated-gradient-text` | `showcase` | |
| Rotating word | `@aceternity/flip-words`, `@magicui/word-rotate`, `@aceternity/container-text-flip` | `showcase` | |
| Decipher reveal | `@magicui/hyper-text`, Motion Primitives `text-scramble`, `@aceternity/encrypted-text`, `@react-bits/DecryptedText-TS-TW` | `showcase` | |
| Text revealed by scroll | `@magicui/text-reveal` | `showcase` | words light up as the scroll passes |
| Highlight | `@magicui/highlighter`, `@aceternity/hero-highlight` | `showcase` | |

### Backgrounds

| Need | Component | Register |
|---|---|---|
| Light | `@magicui/light-rays`, `@aceternity/spotlight`, `@aceternity/spotlight-new`, `@aceternity/lamp` | `showcase` |
| Grid that lives | `@magicui/flickering-grid`, `@magicui/animated-grid-pattern`, `@magicui/interactive-grid-pattern`, `@magicui/retro-grid`, `@aceternity/background-ripple-effect` | `showcase` |
| Texture | `@magicui/dot-pattern`, `@magicui/noise-texture`, `@aceternity/noise-background`, `@aceternity/dotted-glow-background` | `both` |
| Atmosphere | `@aceternity/aurora-background`, `@aceternity/background-beams`, `@aceternity/background-gradient-animation`, `@kokonutui/beams-background`, `@kokonutui/background-paths`, `@magicui/particles`, `@magicui/meteors` | `showcase` |
| Shader field (WebGL, one per page) | `@react-bits/Aurora-TS-TW`, `@react-bits/Silk-TS-TW`, `@react-bits/Threads-TS-TW`, `@react-bits/Iridescence-TS-TW`, `@react-bits/LiquidChrome-TS-TW` | `showcase` |

### Navigation and continuity

| Need | Component | Register | How it works |
|---|---|---|---|
| Tabs with a sliding background | `@animate-ui/components-animate-tabs`, `@aceternity/tabs`, `@kokonutui/smooth-tab` | `product` | a highlight element moves between triggers with a spring (layout animation) |
| A highlight that slides between options | Motion Primitives `animated-background` | `product` | shared `layoutId` |
| A card that becomes the dialog | Motion Primitives `morphing-dialog`, `morphing-popover` | `both` | shared layout between the trigger and the dialog |
| Panels that change in place | Motion Primitives `transition-panel` | `product` | direction-aware enter and exit |
| Dock | `@magicui/dock`, `@aceternity/floating-dock` | `showcase` | icons magnify by pointer distance |
| Navbar that reacts to scroll | `@aceternity/floating-navbar`, `@aceternity/resizable-navbar`, `@kokonutui/morphic-navbar` | `both` | |
| Scroll progress | `@magicui/scroll-progress` | `both` | |
| Command menu | `@coss/command` | `product` | opens at once, filters, keyboard |

### Scroll that tells something

| Need | Component | Register |
|---|---|---|
| Text advances while a panel stays | `@aceternity/sticky-scroll-reveal` | `showcase` |
| 3D rotation into view | `@aceternity/container-scroll-animation`, `@aceternity/macbook-scroll` | `showcase` |
| A beam that follows the reading | `@aceternity/tracing-beam`, `@aceternity/timeline` | `showcase` |
| Parallax of a gallery | `@aceternity/hero-parallax`, `@aceternity/parallax-scroll` | `showcase` |
| Velocity text | `@magicui/scroll-based-velocity` | `showcase` |
| Content entering | `@magicui/blur-fade`: 0.4 s `easeOut`, 6 px offset, `blur(6px) → 0`, delay 0.04 s + stagger, once in view with margin −50 px | `both` |

### Buttons and actions

| Need | Component | Register |
|---|---|---|
| Base and groups | `@shadcn/button`, `@shadcn/button-group` | `product` |
| With life | `@magicui/shimmer-button`, `@magicui/shiny-button`, `@magicui/interactive-hover-button`, `@magicui/ripple-button`, `@magicui/rainbow-button`, `@animate-ui/components-buttons-liquid`, `@kokonutui/attract-button`, `@kokonutui/hold-button` | `showcase` |
| Loading → success | `@aceternity/stateful-button` | `product` |
| Celebration (rare) | `@magicui/confetti`, `@magicui/cool-mode` | `showcase` |

### Product components (states, feedback, forms) · `product`

`@coss/toast` · `@coss/dialog` · `@coss/alert-dialog` · `@coss/drawer` · `@coss/sheet` ·
`@coss/combobox` · `@coss/autocomplete` · `@coss/select` · `@coss/number-field` ·
`@coss/otp-field` · `@coss/calendar` · `@coss/table` · `@coss/empty` · `@coss/skeleton` ·
`@coss/spinner` · `@coss/tooltip` · `@coss/popover` · `@coss/menu` · `@coss/context-menu` ·
`@coss/accordion` · `@coss/tabs` · `@coss/field` · `@coss/form` — all on Base UI, accessible, with
their states. Animated variants of the same primitives: `@animate-ui/components-base-*`.

### Interaction and accessibility of what is custom · `product`

React Aria —`@react-aria` components or its hooks— for anything the libraries above do not cover:
`usePress` / `useHover` / `useFocusRing` normalize mouse, touch and keyboard and expose
`[data-pressed]`, `[data-hovered]`, `[data-focus-visible]`, `[data-selected]`, `[data-dragging]` for
styling; overlays expose **`entering` / `exiting`** to animate in and out; drag and drop is accessible;
30 languages and RTL.

## Without React: what covers each row

A repo that does not use React keeps the faithful ports of `templates/components/motion/`
(`reference/component-techniques.md`, «Faithful ports»): the same component, ported from the library's
source and compared with its live demo. A row not listed here has no port and is written from the
fallback set's own components or left out.

| Row of the catalog | Port | Where Ledger's gallery uses it |
|---|---|---|
| `@magicui/magic-card` | `magic-card` | the cards that can be pressed (Componentes, the clients' cards); the showcase's `.spotlight` surfaces keep the set's own light |
| `@aceternity/focus-cards` | `focus-cards` | Configuración → plantillas de factura |
| `@magicui/number-ticker` | `number-ticker` | the figures of Inicio, counting on entering |
| Motion Primitives `sliding-number` | `sliding-number` | the counters of the menu, the toolbar and the selection bar, and the figure of a chart's reading |
| `@magicui/animated-circular-progress-bar` | `animated-circular-progress-bar` | the collection goal in Inicio |
| `@magicui/animated-list` | `animated-list` | recent activity in Inicio |
| `@magicui/bento-grid` | `bento-grid` | the grid of Inicio |
| `@magicui/marquee` | `marquee` | the clients' logos in Inicio |
| `@magicui/animated-beam` | `animated-beam` | Configuración → integraciones |
| `@kokonutui/apple-activity-card` | `apple-activity-card` | the collection rings in Inicio |
| `@animate-ui/components-animate-tabs` | `tabs` | Facturas: lista, tablero, línea de tiempo |
| `@kokonutui/smooth-tab` | `smooth-tab` | cover piece, not used in the app |
| Motion Primitives `animated-background` | `animated-background` | the page you are on in the sidebar and the KPI band; the rows, tabs and options of the set keep its own highlight, which is rebuilt with them |
| Motion Primitives `morphing-dialog` | `morphing-dialog` | a client's card opening into its record |
| Motion Primitives `morphing-popover` | `morphing-popover` | «Agregar nota» in a row's menu |
| Motion Primitives `transition-panel` | `transition-panel` | the invoice form in steps |
| `@aceternity/expandable-card` | `expandable-card` | a client's card on a phone |
| `@aceternity/floating-dock`, `@magicui/dock` | `floating-dock` | the quick actions of Inicio (one button that opens a column on a phone) |
| `@animate-ui` animated icons | `icons` | the icons it draws (users, settings, plus, refresh, send, copy, trash) in the menu, the toolbar and the row menus |
| `@animate-ui/components-buttons` copy, flip | `copy-button`, `flip-button`, `flip-card` | the CUIT and the invoice number; «Ver dorso» |
| `@magicui/animated-theme-toggler` | `theme-toggler` | the theme button of the top bar |
| Toolbars: Motion Primitives `toolbar-dynamic`, `toolbar-expandable`, Kokonut `toolbar` | `toolbar-dynamic`, `toolbar-expandable`, `kokonut-toolbar` | the search of Facturas, the bar of selected rows, the state filter of Clientes |
| `@kokonutui/ai-prompt-input`, `file-upload` | `ai-prompt`, `file-upload` | the invoice form: describe, data, attach |
| `@kokonutui/action-search-bar` | `action-search-bar` | not used: the search of the toolbar is `toolbar-dynamic`; it fits a screen whose search offers actions |
| `@kokonutui` card stack | `card-stack` | «Por revisar» in Inicio |
| `@aceternity/animated-tooltip` | `animated-tooltip` | the team assigned to a client |
| `@aceternity/sticky-scroll-reveal` | `sticky-scroll-reveal` | the «Cómo conciliar» walk-through |
| `@kokonutui` profile dropdown, team selector, loader | `profile-dropdown`, `team-selector`, `kk-loader` | the user menu in the sidebar, the seats of Configuración → Equipo, the loader of the integrations' sync |
| Arc `filter-toolbar` | `filter-toolbar` | Facturas: the chips of the filters above the table (status, client, due date, amount); the calendar button is the same range as the chip of the date |
| Own `hover-preview` | `hover-preview` | the number of an invoice in the table: its card follows the pointer, and the number is the link to the invoice |
| Arc `confirm-morph` | `confirm-morph` | «Anular factura» in the detail of an invoice and in the menu of its row, with its own Deshacer |
| Arc `morph-select`, `stepper` | `morph-select`, `stepper` | the new invoice: terms and currency; the three steps of the dialog |
| Arc `text-morph` | `text-morph` | the status of the open invoice when it changes, and the Save button's «Guardado» |
| Arc `slot-text` | `slot-text` (through `data-slot` of a `data-sliding` figure) | the three KPIs of Facturas |
| Own `speed-counter` | `speed-counter` | not used in the app: the figures that count (the ticker of Inicio, the reels of the KPIs) already say it, and its blur only adds noise beside them |
| Arc `donut-chart`, `line-chart`, `activity-heatmap` | `donut-chart`, `line-chart`, `activity-heatmap` | Inicio: billed by status, what was collected over 7, 30 or 90 days, and the collections and due dates per day. The six-month chart of Facturas keeps `charts.js`: its reading lives in the header of the card, which `line-chart` does not have |
| Arc `usage-meter` | `usage-meter` | Configuración → Plan y uso: the invoices issued this month and the space the PDFs take |
| Arc `sortable-data-table` | `sortable-data-table` | not used: the table of Facturas is the set's own (row menu, status picker, board, detail, drag); from the port it takes the tint of the sorted column and the arrow that clears a blur |
| Arc `toast-stack` | `toast-stack` | a demo only; the set's toasts take from it the description, the update in place that folds the action away, the swipe that resists to the left, and Alt + T |

## A component's definition of done

A component enters the project —installed or written— only with:

1. **Its tokens**: the project's colors, radii and fonts replace the library's defaults; the motion
   values stay unless the design line says otherwise.
2. **Every state** and its **reduced-motion version** (`motion`'s `useReducedMotion`, or
   `motion-safe:` / `motion-reduce:` in Tailwind).
3. **Keyboard and ARIA**: what the library brings, checked with axe and the keyboard.
4. **Its place in the gallery** (`/gallery` route, or Storybook if the repo has it), in every state.
5. **Its tests**: behavior, and its visual baseline.

## The pattern and the sheet of each complex component

A component that is composite follows its APG pattern (roles, states, keyboard map; criterion I16) and is
chosen by the rules of its sheet in `reference/ui-patterns.md` (criteria I18–I25). The rules are in
`reference/accessibility.md` (A11Y-APG-*).

| Component of the catalog | APG pattern | Sheet in `reference/ui-patterns.md` |
|---|---|---|
| Button, button group, stateful button | native `button`; A11Y-SEM-01 | UX-BOTON |
| Field, form, number field, OTP | native controls and labels; A11Y-FRM-* | UX-INPUT |
| Select, combobox, autocomplete | listbox, combobox; A11Y-APG-05 | UX-SELECCION |
| Checkbox, radio, switch | native; A11Y-APG-01 | UX-CHECK-SWITCH |
| Slider | slider; A11Y-APG-07 for the alternative to dragging | UX-SLIDER |
| Calendar, date picker | native date input or grid; A11Y-APG-01 | UX-FECHA |
| Dialog, alert dialog, drawer, sheet, popover, morphing dialog | dialog, alertdialog; A11Y-APG-01 | UX-OVERLAY, UX-CONFIRMAR |
| Toast | status region; A11Y-APG-08 | UX-FEEDBACK |
| Tooltip, hover card | tooltip; A11Y-APG-06 | UX-AYUDA |
| Menu, context menu | menu; A11Y-APG-03 | UX-MENU |
| Command menu | combobox; A11Y-APG-05 | UX-PALETA |
| Tabs, segmented, accordion | tabs, disclosure; A11Y-APG-02, A11Y-APG-04 | UX-SECCIONES |
| Reorderable list, kanban | single-pointer alternative; A11Y-APG-07 | UX-ARRASTRE |
| Table, list, cards | table; A11Y-TAB-* | UX-COLECCION |
| Skeleton, spinner, progress, empty state | status; A11Y-SR-* | UX-CARGA, UX-VACIO |
| Marquee, ticker, confetti, beams, carousel | pause control; A11Y-APG-09, A11Y-MOV-* | UX-VIDA |

## Growing without a Frankenstein

1. Is it in this catalog? Install it.
2. Can it be composed from what is installed? Then it is a composition, not a component.
3. Only one feature uses it? It stays local to that feature.
4. A second place uses it? It is promoted to the project's set with the definition of done.

So there is never a `Button`, `PrimaryButton`, `ShinyButton2` and `ButtonV2`: one `Button` with its
variants.
