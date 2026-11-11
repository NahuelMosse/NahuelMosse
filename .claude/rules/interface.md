---
paths: ["**/*.css","**/*.tsx","**/*.jsx","**/*.vue","**/*.svelte","**/*.html"]
---

# Interface: what is decided before, and what is looked at after

This rule loads by itself when you touch a screen file. There is nothing to remember.

## Before writing the screen: the card's `## Look` and `## Information`

- `## Look` (and `## Information` on a product screen) — **only if the card touches a screen.** What the user has to be able to do and
read in each view, in short prose. It is not design: it is what will be checkable by looking.
**If the card creates a screen, invoke `interface-design` to write it**; if it only adds a control
to a screen that already exists, the brief is written by looking at that screen and the skill adds
nothing. It is the only skill in the kit that comes in *before* the screen: it forces choosing a
domain, a focus and a visual signature instead of falling into the template. Its premise is that
of this step — *“you are going to generate generic output; the patterns from your training are
strong”*—, so the brief is not documentation of the design, **it is the decision not to be generic,
made in writing and beforehand**.

**And the brief says from where each thing is done.** For each action the card asks for, write
which screen the person is standing on when they need it. *An action that exists but forces you to
leave where you are is, for whoever uses it every day, an action that does not exist* — and no
scenario test detects it, because the scenario says what can be done, not from where.

**On a product screen the brief starts from `## Information` of the card.** A dense screen (a loan
file, an account, a case) fails by burying the decision under everything it can show, not by its
components. The card lists what the user decides there and, per field, the decision it serves and
its tier (`glance`, `detail`, `audit`); the brief turns that into zones, one per decision, and
`ia-check.mjs` measures the result in the browser (`templates/card.md`, `## Information`).

**Before looking for a signature, calibrate how much is called for.** `interface-design` pushes
toward standing out without asking which screen it is about, and not all screens tolerate the same.
The brief opens by declaring two numbers, with a line of why:

| | 1 | 5 | 10 |
|---|---|---|---|
| **Invention** — how far it departs from the conventional | what the user already knows how to use | — | author's piece |
| **Density** — how much data per screen | one thing at a time | — | airplane cockpit |

A sales dashboard that is read standing up in the morning is **low invention, high density**. A
portfolio is the opposite. Without those two numbers, the skill always optimizes for the
portfolio.

**Low invention is about structure, not about character.** The dial says how conventional *the
form* is —a stage board looks like a stage board— and does not authorize leaving the execution
undecided. Measured: a screen with invention 2 came out correct and was immediately read as
*“excessively made with AI”*. **Conventional structure and execution without character is not the
same as low invention: it is not having decided.** The type scale, the depth, the rhythm of space
and the weight of the dominant figure are chosen all the same, and with the same care, at
invention 2 as at invention 8.

**And do not invent what is already solved.** Before designing from scratch, look at whether the
type of screen has mature patterns: a data grid, a board by states, a table with filters.
**Departing from that is a decision that is declared and justified**, not the default. *Because the
user does not come to get to know your system: they come to read a number.*

**Two more things the brief has to say, or the designer's rounds cannot verify them:**

**What each view does with the desktop width.** One line per view. It is built mobile-first
because covering both comes out cheaper, but the desktop is where the whole workday happens: it
has to show something that does not fit on the phone, not be the phone stretched.

**What data each visual variable encodes.** Color, weight, density: each one names the dimension of
the data it carries —*color says the stage*, *weight says the priority*— or it does not go. **If a
visual variable cannot name what data it encodes, it is a disguise.** Measured: a card chose a
metaphor palette and came out worse than another with six colors, one per data category. The signature is not in the mood, it is in the domain's variables.

**And the material, which is what gives the most away and what nobody declares.** Five decisions,
five lines, decided per product. **What is not decided comes out by default, and the default is recognizable.**

| | If not declared, it comes out as |
|---|---|
| **Typography** — which family, and why that one | `system-ui` |
| **Canvas** — what color the background is and what color the surface resting on it (cold gray is one option) | cold gray `#f6f7f9` + white card |
| **Separation** — what separates things: space, line, shadow or background change. **One, not all four** | 1 px border **plus** shadow **plus** radius, on everything |
| **Radius** — how much, and whether it is a single one or varies by size | 10-12 px on everything |
| **Density** — how much a row breathes, in pixels | comfortable, landing-page style |

Independent runs left to default converge on the same cold gray canvas, the same white card with
1 px border plus shadow plus radius, the same uppercase labels, and **no chosen typeface**, even
when the brief defined precisely what data each color encodes.

*And `design-deslop` does not catch it: its list is flat hierarchy, no focal point, identical
cards, timid palette — and that screen had none of them. **The anti-generic review is passed while
being recognizably default**, because the list looks at the composition and the tell is in the
material.*

### Deciding the material is not moving away from the default

**This table says what has to be decided, not that you have to go the other way.** Reading it as
“cold gray is wrong” produces linen canvas, cream paper with serif, warm cardboard: all different,
all worse, with the same verdict — **“it looks old”**.

Cold gray is the default **because it is the contemporary register of work software**. The problem
with the screen that used it was not the color: it was that **it had not decided anything else**.

> **It looks old, and what is old makes you want to change it.** An internal tool that looks
> fifteen years old tells the client the software is old, even if it was delivered yesterday. For a
> consultancy that is not an aesthetic objection: it is the next quote being to replace it.

**For work software (tools, admin, dashboards) the register has to be today's.** It does not govern
landings, editorial or brand pages, where a serif, a warm canvas or texture can be the identity.
Five signals that age a work screen:

| Ages it | Instead |
|---|---|
| Serif in interface text | serif only on a figure or a title, if there is a reason |
| Warm canvas —cream, linen, cardboard | neutral, cold or true; warmth goes in an accent, not in the background |
| Texture, paper, physical-object metaphor | flat surface; identity goes in typography, rhythm and color |
| Low contrast and ornamental borders | high contrast and separation by space |
| Tight density with thick rules | generous space and a single thin line where needed |

**And it is not “go back to the default”.** In the contemporary register you stand out all the
same: through the choice of typeface, through the scale, through how the domain's color is applied,
through density. *What has to be avoided is that the effort to be different shows* — which was
exactly the first verdict of this experiment: *“you can tell there was an attempt to keep it from
looking generic, but it looks worse”*.

**Three scales, not loose values.** A color token is not a design system. What makes a system is
that the values come out of a short, named scale, and that adding a screen does not invent new
values:

- **Typography** — four or five named sizes, and weight and color as separate axes.
- **Space** — one unit and its multiples. No hand-written `padding: .85rem`.
- **Color** — the domain's ones plus a short neutral ramp. The rest is derived.

*Fifteen loose sizes is not a decision made fifteen times: it is no decision, made fifteen times.*
The size ceiling is owned by `rules/design.md`.

**And what repeats twice is a component.** A form field, a status pill, a listing row: if the same
block shows up in two views, it goes to a primitive with its variants.

## The project's design line

**Each project has its design line, and it is modern.** It is created by the first card that
touches a screen, in `design/line.md` with its values declared as tokens in a single place,
following `.claude/templates/design-line.md`: the references, the direction, the tokens, the
typography, **the component set**, the state changes of the screen, the signature interactions, the
data states and the voice. The cards that follow **use it and extend it**. `verify.mjs` flags every
color or duration written by hand in what the card adds, a card that touches a screen without a
design line, and a control written by hand when the set has it.

**On a screen, never write a value of your own**: no color, space, radius, shadow or duration
outside the tokens; no `display`, `gap` or margin of your own where a primitive (`stack`,
`inline`, `grid`, `surface`) says it; no control that the set already has. **Before creating a
component, search the set**; a new reusable one enters it with its gallery entry and its tests
(`.claude/reference/components.md`, “definition of done”). **And behave like the product**: how it
confirms, waits, edits and navigates is in the design line's patterns
(`.claude/reference/patterns.md`).

**Screens are composed from the component set, not drawn.** The set lives in `design/components/`
with its gallery, starts from `.claude/templates/components/` and follows
`.claude/reference/components.md`: every component designed once, with all its states and its
motion, and every screen inherits it. A component that is missing enters the set before being
used. The plan names the set in the `reuses:` of the task that builds the screen, and the gate
measures it (`I-set`): of the classes the card's markup names, at least 60 % are defined by the set
or by a stylesheet the repo already had, the screen loads the set's stylesheets, and a card with
`## Information` uses at least three blocks of the record (`design/components/record.html`); a
button, field, select, table or dialog written without the set's class fails as well. In a repo
with shadcn (`components.json`), the `reuses:` names registry items or `components/ui/` files, and a
native control written outside `components/ui/` fails the gate (`I-catalog`): it is installed, not drawn.

**And the brief designs each element, not only the screen.** For each new or changed element, the
brief brings its state matrix —rest, hover, visible focus, pressed, selected, disabled, loading,
error— with tokens, and each user action on it as a microinteraction in five lines: trigger, rules,
feedback, repetition and modes. The microdesign —response times, validation when the person tries to advance,
the button that does not submit twice, focus, cursors, text that does not fit— is in
`.claude/reference/modern-interface.md`.

## The interface feels like this year's, and responds

**The concrete values are in `.claude/reference/modern-interface.md`**: ten rules of modern
dashboards, type scale, color roles, spacing, loading and empty states, and the motion tokens. The
brief chooses from there, not from the model's memory.

**Every state change has a designed response, and none is there for its own sake.** The components
answer to the hand; the screen answers to the work: the design line lists the screen's state
changes —open, filter, select, save, delete, create, switch view, data arriving— each with trigger,
rules, feedback, repetition, kind (productive or expressive, 95 / 5), token and reduced version.
`find-animation-opportunities` helps find what teleports. **A screen that does not respond reads as
old; one where everything bounces reads as a toy.** Productive motion is fast and almost invisible;
two to four signature interactions carry the personality.

**The card outranks motion.** What the card says disappears, is replaced or stops existing leaves
the DOM in the event's own task: no exit animation on that node, no `hidden`, no deferred
`remove()`. The motion goes on what enters and on the neighbors (FLIP). Item 7 of the screen audit
for it is `not applicable · the card pins it`; a brief line that contradicts the card is a `fails`
of the plan against the snapshot.

`verify.mjs` checks that there is motion and its reduced version; `motion-audit.mjs`, in the
browser, that every element and every inventoried change responds, in range, without layout
animation and without long frames. How it looks is the designer's rounds.

## After writing the screen

Looking at it —captures, verdict against the brief, `design-deslop`, the data, the material, what
year it looks like— is the `designer`'s rounds and, at grade `production`, the `design-critic`'s.
