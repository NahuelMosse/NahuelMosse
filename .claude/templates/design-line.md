# Project design line

It goes in `design/line.md` of the repo. Its values are declared as custom properties
(`--accent: …`) in **a single place, which the line names** —`design/tokens.css` by default—, and
that is **the only place where a color or a duration is written**: everything else uses them with
`var(--…)`. The first card that touches a screen creates it, together with the component set; the
following ones use them and extend them. A screen that invents its own values cannot be reviewed by
anybody, and four screens that invent them are four different products.

**The order of the work** is the order of this file: structure → hierarchy → states → feedback →
spatial continuity → delight. *If the screen looks mediocre standing still, no animation saves it.*
The values of today are in `.claude/reference/modern-interface.md`, measured on real products in
`.claude/reference/motion-benchmark.md`; the components and their behavior, in
`.claude/reference/components.md`.

## 1. References

Three to five real products —not mock-ups— and **what is taken from each**: “the density and the
row selection of Linear”, “the instant feedback of Raycast”, “the chart that updates when filtering
of Mercury”, “two expressive moments in the style of Lando Norris”. If the card brought references,
they are those, saved in `design/references/`. The captures of `## Look` compare against them. **References that come
with a card move the direction too** —depth, materials, surfaces, how the figure leads—, not only
how much responds: keeping the previous look is a decision of the business, asked as an `AMB`, not
the cheap assumption. *Measured: a card kept the previous palette and took from the references only
the level of response; in the blind comparison its gaps were exactly depth, materials and a figure
that does not lead.*

## 2. Direction

Three to five sentences: who uses the product, where and for how long; what feeling it has to give;
what it avoids. The brief's three numbers, from 1 to 10, with a line of why: **invention**,
**density** and **expression**.

**Expression decides the register, and with it which reference applies:**

| Expression | Register | What it is | Read |
|---|---|---|---|
| 2–4 | **Product** | used every day: a tool, a dashboard, a back office | `reference/modern-interface.md` |
| 8–10 | **Showcase** | shown more than used: a presentation, a landing, a demo, **anything that has to impress in a video** | `reference/showcase.md` |

A card that asks to impress, to be shown, to look like the references of a showcase, is 8 or more;
lowering it is a decision of the business, asked as an `AMB`.

**In a showcase, two more parts:**

- **The message** —who watches, what they must conclude, the three proofs— (`reference/showcase.md`).
- **The scene table**: one row per section with the idea it states, the proof it shows, and **the
  reference image whose composition it copies** —its grid, where the figure goes, which card is
  filled, how the chart is drawn—, looking at the image, not from memory. The builder gets the
  image with the row; the judge scores each scene against its own reference. *Measured: three laps
  of written composition rules moved the judge from 4–7 to 5–6; the gaps it named were always
  visible in a reference nobody had put next to the scene.*

| Scene | States | Proves it with | Copies the composition of |
|---|---|---|---|
| first screen | … | … | `design/references/<image>` |

## 3. Tokens

- **Primitives**: 12 neutral steps in `oklch()` and one accent; type scale; 4 px spacing unit; one
  base radius and the derived ones (nested = outer − padding); elevation levels (a hairline border
  plus layered low shadows; more for what floats).
- **Semantic**: `--surface`, `--surface-raised`, `--text`, `--text-soft`, `--border`, `--accent`,
  `--focus`, `--danger`, `--success`…, and dark mode redefining the same names. Screens use only the
  semantic ones. **Every allowed color pair carries its contrast**: 4.5:1 for text, 3:1 for
  components and focus (WCAG 1.4.3, 1.4.11).
- **Motion, by use, not by value**: five or six durations and three curves, and on top of them the
  names the components use —`--motion-button-press`, `--motion-dropdown-enter` / `-exit`,
  `--motion-modal-enter` / `-exit`, `--motion-toast-enter`, `--motion-indicator`,
  `--motion-layout`—. Enter and exit both start fast (`ease-out`); exit is shorter; what has
  physics —a switch knob, a sliding indicator, reordering— uses a critically damped spring. Never
  `ease-in` to enter, never `transition: all`, only `transform` and `opacity` for movement.

**Product register defaults** (values in `.claude/reference/modern-interface.md`, “Product defaults”):
one primary action per view; navigation (tabs, segmented control, menu highlight) is neutral and the
accent marks value and the selection of data (checked controls, the selected row, the chosen day); a toolbar
has title and count on the left and controls on the right, wrapping on a phone; a data table has
fixed column widths from a `<colgroup>` so filtering never moves a column; a reading page is 1200 px
at most and centered, a data screen spans the width beside its navigation, both with 24 / 32 px
gutters; a dense screen is laid out by the decisions of `## Information`. A line that departs from one says why.

## 4. Typography

Chosen family and why —not the system default without deciding it—, four to six sizes with their
line height and tracking (negative as size grows), three weights with a fixed role, and
`tabular-nums` on every number.

## 5. The system: primitives, components and patterns

**The components come from the catalog** (`.claude/reference/components.md`): shadcn, coss, React
Aria, Magic UI, Aceternity, Motion Primitives, Animate UI and Kokonut, installed with the shadcn CLI
and adapted to the tokens (`stacks/react-shadcn.md`). This section lists which ones the product
uses, for what, and with which variants; a component the catalog covers is never written by hand.
In a repo without React, the fallback is the hand-written set below.

Layers, from the bottom: tokens → primitives → components → patterns → screens. The screens are
**composed** from the set in
`design/components/` —primitives (`stack`, `inline`, `grid`, `surface`, `text-*`) and components—,
with its gallery (`design/components/gallery.html`) showing every component in every state and its
tests (`gallery.spec.mjs`: behavior and visual baselines; `record.spec.mjs` for the dense record). **The patterns this product uses** —how
it confirms, waits, edits, gives feedback, navigates— are written here, starting from
`.claude/reference/patterns.md`.

The set starts from `.claude/templates/components/` and is adapted to the direction: tokens,
radii, type, character.
**A component is designed once, with all its states and its motion, and every screen inherits
it**: that is what keeps the product consistent and what lets the effort go into the details.

- A new component enters the set —and the gallery, and its tests— before being used on a screen,
  meeting the definition of done; if a similar one exists, that one is extended with a variant,
  with a line of what it is for. What only one feature uses stays local to it.
- A control written by hand on a screen when the set has it, and a color, space, radius or
  duration written by hand, are findings of `verify.mjs`.

Each component of the set has its **state matrix** (below), its **micro-interactions** (Saffer),
its ARIA role and keyboard, and its reduced-motion version.

## 6. State changes of the screen

The components answer to the hand; **the screen answers to the work**. One row per state change
the screen has —opening a detail, filtering, selecting, saving, deleting, creating, switching
view, data arriving—:

| Change | Trigger | Rules | Feedback | Repetition and modes | Kind | Token | Reduced |
|---|---|---|---|---|---|---|---|
| Delete a row | “Delete” in its menu | removed from the DOM at once; request in the background | the others close the gap (FLIP); toast “Deleted — Undo” | if it fails, the row returns and the error says why | productive | `--motion-layout`, `--motion-toast-enter` | no gap animation: the toast fades |
| Open the detail | click or Enter on a row | the list stays | the panel grows from the row (continuity) | Escape closes; J/K move without closing | productive | `--motion-modal-enter` | fade |

**Productive** is frequent, fast and almost invisible: hover, toggle, dropdown, reorder. **Expressive**
is rare and can call attention: the first project created, a goal reached. **Aim at 95 / 5.** What
is done a hundred times a day —keyboard actions, context menus— does not animate beyond its
feedback. **Nothing teleports**: what appears, moves or changes size has a designed
transition, and what comes from somewhere comes from there. **The card outranks it:** what the card says
disappears, is replaced or stops existing leaves the DOM in the event's task, with no exit animation,
`hidden` or deferred `remove()` on that node; the motion goes on what enters and on the neighbors (FLIP).

**Optimistic where it is safe and reversible**: the change is shown at once and confirmed in the
background, with undo. Skeleton delay: `reference/ui-patterns.md` UX-CARGA-1.

## 6b. The screen audit

Every screen answers these sixteen, each with its evidence —the `motion-audit` report, a frame of the
showreel, a scenario— or `not applicable` with the reason (there is nothing to drag; nothing
loads). A blank row is the failure.

| # | Item | Answer and evidence |
|---|---|---|
| 1 | Pointer hover feedback | |
| 2 | Pointer press feedback | |
| 3 | Keyboard focus feedback | |
| 4 | Selection transition | |
| 5 | Open / close transition | |
| 6 | Content insertion | |
| 7 | Content removal | `not applicable · the card pins it` when the card says it disappears or is replaced; otherwise the neighbors' gap |
| 8 | Loading state | |
| 9 | Loading → success state | |
| 10 | Error feedback | |
| 11 | Layout changes | |
| 12 | Navigation continuity | |
| 13 | Progressive disclosure | |
| 14 | Empty → populated transition | |
| 15 | Drag / reorder feedback, where applicable | |
| 16 | Reduced-motion behavior | |

## 7. Signature interactions

Two to four, chosen by the card that creates the screen: the only expressive ones, where the
product shows its personality —a figure that tells its story as you scroll, a transition between
the two main views, a celebratory moment—. Each with its row in section 6 and its contact sheet in
`## Look`.

## 8. Data states

Loading —under 1 s, nothing; from 1 to 10 s, a skeleton with the real shape; more, progress—, empty
—what is missing, when it appears, an action that resolves it—, error —what happened and what to
do, without jargon—, and success.

## 9. Voice

Tone, capitalization, how an error is written, a button —verb and object: “Save phone”— and a
loading state —“Saving…”—, and the format of dates and numbers.

## 10. How it is extended

A new value is added to the tokens with a line of what it is for, or it does not go in. A new
component or variant goes into the set and its gallery before being used. `verify.mjs` flags every
color or duration written by hand in what a card adds, and `motion-audit.mjs` measures in the
browser that every element and every state change responds.

---

## A component's state matrix

One table per component. Every cell is a **token**, not a value; `n/a` only with the reason.

| State | Background | Border | Text | Elevation | Transform | Cursor | Focus | Transition |
|---|---|---|---|---|---|---|---|---|
| Rest | | | | | | | | |
| Hover (fine pointer only) | | | | | | `pointer` | | `--motion-hover` |
| Focus visible | | | | | | | 2 px outline, offset, `--focus` | no delay |
| Pressed | | | | | scale 0.97 | | | `--motion-button-press` |
| Selected | | | | | | | | `--motion-indicator` if something slides |
| Disabled | | | | | | `not-allowed` | | |
| Loading | | | | | | `progress` | | delay per UX-CARGA-1 |
| Success / error | | | | | | | | |

Plus: ARIA role and keyboard —which keys and where focus goes—, target size (24 × 24 px minimum),
contrast of every pair, and the reduced-motion variant: **fewer and gentler, not zero** —feedback
of color and opacity stays; displacement, scale and parallax go.

## An element's micro-interaction

Every action the user takes on an element is written in five lines (Saffer):

| | |
|---|---|
| **Trigger** | what starts it: a click, a key, data arriving |
| **Rules** | what happens, in what order, and what cannot happen |
| **Feedback** | what they see and when: up to 0.1 s, the result; up to 1 s, nothing special; over 1 s, that the system is working; over 10 s, how much is left and how to cancel |
| **Repetition** | what happens if it is done twice or fast: the button does not submit twice |
| **Modes** | how it changes with the context: offline, without permissions, with empty data |

Example, a button that saves: the press scales it to 0.97 at once; if the answer takes over 150 ms
it shows it is working without changing width; it cannot be submitted again; when done it shows
“Saved” with a check that draws itself and goes back; if it fails, it nudges, the error stays next
to the field with what to do, and what was typed is not lost.
