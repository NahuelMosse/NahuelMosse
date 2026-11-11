# Accessibility: rules a card can meet and a reviewer can check

**When it is read:** when the card touches a screen, a component, a form, a table, a chart, an
email or a PDF the app generates; and for the manual protocol of a new screen and the checklist
per pattern. **How:** only the sections the card touches, with `Read` and a line range of the heading;
never whole. `card.md` names the rule IDs that apply, and the `builder` receives those IDs and their
ranges. Framework-independent: the examples use browser HTML/CSS and, for automatic verification, Playwright
with `@axe-core/playwright`, which is what the kit already installs (`stacks/node-ts.md`). **Tools and
reference products are options, not obligations.** **[NV] marks guidance not verified**: a hypothesis, never
the only evidence of a `meets`; **[V-sec]** was checked in a secondary source only. How each rule is checked:
`C` a command (an `rg`, a linter, a validator) that exits 0 or not, `T` an automated test that fails if the
rule breaks, `M` manual (a person with keyboard, screen reader or zoom, following a protocol), `J` judgment.
For `M` and `J` a written evidence is left. The skill `skills/accessibility-audit` is third-party and audits
against WCAG 2.1 AA: the kit asks for **WCAG 2.2 AA**, so the five 2.2 criteria that the skill leaves out
(2.4.11, 2.5.7, 3.2.6, 3.3.7, 3.3.8; criterion I14) are checked apart, with the rules below; 2.5.8 is in I8.
Source numbers `Bn` are in Sources. None of the example commands was run.

**The helper the examples use.** axe's only 2.2 rule (`target-size`) comes disabled and runs only if its tag is
included or it is named: the examples of Playwright's docs (`wcag2a, wcag2aa, wcag21a, wcag21aa`) do not run it.
Every axe line of the kit's profiles uses the tags below or names the rule.

```ts
import AxeBuilder from '@axe-core/playwright';
export const WCAG22AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
export async function axe(page, o: { rules?: string[]; include?: string } = {}) {
  let b = new AxeBuilder({ page });
  b = o.rules ? b.withRules(o.rules) : b.withTags(WCAG22AA);
  if (o.include) b = b.include(o.include);
  return b.analyze(); // { violations, incomplete, passes, inapplicable }
}
```

**What automatic analysis covers, and why the manual protocol is mandatory.** axe finds on average 57 % of the
WCAG problems **by volume of issues** (Deque: more than 2,000 audits, 13,000 pages), which differs from the
usual 20–30 %, a figure **by criteria**: both are true and measure different things (B15, B16). GDS's
independent test over the least accessible page: the best of 10 tools found 37 % of the 143 barriers, all of
them together 71 %, and 29 % was found by none (B17). What is dubious goes to `incomplete`, which requires manual
review. So “axe passed” is not “meets AA”: the report names the real coverage and what was not tried by hand
stays *could not run*.

**WCAG 2.2 AA is the criterion; the regulations are context, not an obligation of the method.** Which applies depends on the jurisdiction
of the product, for example:

| Jurisdiction | Norm | Baseline |
|---|---|---|
| Argentina | Ley 26.653 (2010), Decreto 656/2019, Disposición ONTI 6/2019: for the State, public service concessionaires and those who provide or contract goods and services to the State (B11) | WCAG 2.0, aim of AA |
| European Union | European Accessibility Act (Directive 2019/882), applies to products and services after 28 June 2025; microenterprises that provide services are exempt (B9). EN 301 549 V3.2.1 is in force; V4.1.1 (published 2 September 2026) moves the baseline to WCAG 2.2 AA once cited in the Official Journal (B8) | WCAG 2.1, then 2.2 AA |
| United States | Section 508 (B10) | WCAG 2.0 AA |

Targeting WCAG 2.2 AA covers all of them.

## Rules that are criteria

| Rule | Criterion |
|---|---|
| A11Y-SEM-02, A11Y-SEM-03 | I4 |
| A11Y-SEM-04, A11Y-FRM-01 | I3 |
| A11Y-SEM-06 | I5 |
| A11Y-SEM-07 | I2 |
| A11Y-COL-01, A11Y-COL-02, A11Y-PRO-01 | I1 |
| A11Y-KBD-01, A11Y-KBD-02, A11Y-KBD-03, A11Y-KBD-05 | I6 |
| A11Y-SR-01, A11Y-SR-02, A11Y-SR-05, A11Y-FRM-03, A11Y-FRM-04, A11Y-FRM-05, A11Y-FRM-06 | I7 |
| A11Y-RSP-04 | I8 |
| A11Y-RSP-01, A11Y-RSP-02, A11Y-RSP-03, A11Y-RSP-06 | I9 |
| A11Y-KBD-06, A11Y-KBD-08 | I10 |
| A11Y-KBD-04, A11Y-FRM-09, A11Y-FRM-10, A11Y-AUT-01, A11Y-AUT-02, A11Y-AUT-03, A11Y-AUT-04 | I14 |
| A11Y-PRO-04, A11Y-PRO-05 | I15 |
| A11Y-SEM-01, A11Y-SEM-09, A11Y-SR-03, A11Y-SR-06, A11Y-KBD-07, A11Y-APG-01, A11Y-APG-02, A11Y-APG-03, A11Y-APG-04, A11Y-APG-05, A11Y-APG-06, A11Y-APG-07, A11Y-APG-08, A11Y-APG-09 | I16 |
| A11Y-PRO-06 | I17 |
| A11Y-PRO-03, A11Y-PRO-07 | V5 |
| A11Y-DOC-04 | I12 |
| A11Y-IA-01, A11Y-IA-02, A11Y-IA-03, A11Y-IA-04, A11Y-IA-05, A11Y-IA-06 | I16 |
| A11Y-RSP-02 | I13 |

The rules outside this table are judgment or guidance, with no criterion of their own.

## 1. Semantics and names (SEM)

**A11Y-SEM-01** — Use the native element that already has the semantics and the keyboard: `<button>`, `<a href>`, `<input>`, `<select>`, `<details>`, `<dialog>`, `<table>`. ARIA only when there is no equivalent. · How C+T · criterion I16 · WCAG 4.1.2, 1.3.1, 2.1.1 · Check: no non-interactive element with a click handler, controls are found by role and are the native tag: `rg -n '<(div|span|li|td)\b[^>]*\bon(Click|click|MouseDown)=' src/` returns 0, `rg -n 'role="(button|link|checkbox)"' src/` each justified; PW `expect(await page.getByRole('button', { name: 'Save' }).evaluate(e => e.tagName)).toBe('BUTTON')`. “Using ARIA” is a discontinued draft (24 February 2026): its first rule is cited from the APG · Source B6, B5, B4.

**A11Y-SEM-02** — Every interactive control has an accessible name that says its action; on icon buttons the name goes on the button (visually hidden text or `aria-label`) and the svg carries `aria-hidden="true" focusable="false"`. · How C+T · criterion I4 · WCAG 4.1.2, 2.4.4, 1.1.1 · Check: PW `axe(page, { rules: ['button-name','link-name','input-button-name','aria-command-name','svg-img-alt'] })` has no violations; generic ``rg -n -U '<button[^>]*>\s*<svg' src/`` and each match has an `aria-label` or a `sr-only` span. Name the button, not the svg; `title` is no name (A11Y-SEM-04) · Source B24, B7, B19.

**A11Y-SEM-03** — The accessible name contains the control's visible text, starting with it. · How C+T · criterion I4 · WCAG 2.5.3 Label in Name (A) · Check: PW `axe(page, { rules: ['label-content-name-mismatch'] })` (a “needs review” rule: look at `incomplete` too); generic `rg -n 'aria-label="[^"]+"[^>]*>[^<]{2,}<' src/` comparing by hand · Source B24.

**A11Y-SEM-04** — Do not use `title` or `placeholder` as the name of anything. · How C · criterion I3 · WCAG 1.3.1, 3.3.2, 4.1.2 · Check: PW `axe(page, { rules: ['label-title-only', 'label'] })` (the first is best-practice: ask for it by name); generic ``rg -n -P '<input(?![^>]*aria-label)(?![^>]*id=)[^>]*placeholder=' src/``. `title` counts only if nothing else gave a name; `placeholder` is outside the algorithm · Source B7, B26.

**A11Y-SEM-05** — Structure with one `h1` per view, headings without level jumps and landmarks (`header`, `nav`, a single `main`, `footer`); style does not replace the element. · How C+M · criterion none · WCAG 1.3.1, 2.4.6 · Check: PW `new AxeBuilder({ page }).withRules(['landmark-one-main','region','heading-order','page-has-heading-one']).analyze()` (best-practice rules do not run with the WCAG tags: ask for them); a screen reader's headings list alone has to tell what the view is about (71.6 % navigate first by headings) · Source B20, B15.

**A11Y-SEM-06** — Declare the document language (`<html lang="en">`) and that of each fragment in another language. · How C · criterion I5 · WCAG 3.1.1 (A), 3.1.2 (AA) · Check: PW `axe(page, { rules: ['html-has-lang','html-lang-valid','valid-lang'] })`; generic ``rg -n -P '<html(?![^>]*\blang=)' src/ templates/``; the same check on email and PDF templates (A11Y-DOC) · Source B19, B34.

**A11Y-SEM-07** — Write `alt` by function: informative → what it contributes; inside a link or button → destination or action; decorative or redundant → `alt=""`; complex → short plus a long description. · How C+J · criterion I2 · WCAG 1.1.1 · Check: PW `axe(page, { rules: ['image-alt','image-redundant-alt','input-image-alt','role-img-alt'] })` plus human review of the list `page.locator('img[alt]:not([alt=""])').evaluateAll(es => es.map(e => e.alt))`; generic `rg -n -i 'alt="(image|photo|icon|logo|picture|img)[^"]*"' src/` (alts that describe the file, not the content). The quality of the alt is judgment · Source B31, B19.

**A11Y-SEM-08** — Every view has a unique `<title>` that starts with the specific (“Order 1042 — Orders — App”). · How T · criterion none · WCAG 2.4.2 (A) · Check: PW `await expect(page).toHaveTitle(/^Order 1042/)`; generic `rg -n 'document\.title\s*=|<title>' src/` one assignment per route · Source B31.

**A11Y-SEM-09** — Add no ARIA that is not needed: no `aria-hidden` on focusables or their ancestors, roles with their required attributes, no redundant roles (`<button role="button">`), no `role="menu"` for navigation. · How C · criterion I16 · WCAG 4.1.2 · Check: PW `axe(page)` covers `aria-hidden-focus`, `aria-required-attr`, `aria-required-children`, `aria-required-parent`, `aria-allowed-attr`, `aria-prohibited-attr`; `aria-allowed-role` is best-practice: ask for it; generic ``rg -n '<(button|a|nav|main|ul|li|table)\b[^>]*role="\1"' src/``, `rg -n 'role="menu(bar|item)?"' src/` each a menu of actions, not a nav. Pages with ARIA have more errors (59.1 against 42), although they are also more complex · Source B6, B19, B22, B23.

## 2. Keyboard and focus (KBD)

**A11Y-KBD-01** — Everything done with a pointer is done with the keyboard, and focus can be left with the keyboard (no traps, except the modal, closed with Esc). · How T+M · criterion I6 · WCAG 2.1.1 (A), 2.1.2 (A) · Check: PW a `tabWalk(page, 80)` helper that presses Tab and records what got focus: it contains the expected control and does not end up turning in a single one; generic unplug the mouse and walk with Tab/Shift+Tab/Enter/Space/arrows/Esc, noting the unreachable · Source B1.

**A11Y-KBD-02** — Focus order follows reading order: no positive `tabindex` and no CSS reordering (`order`, `flex-direction: row-reverse`, `grid-area`) of what is interactive. · How C+T · criterion I6 · WCAG 2.4.3 (A), 1.3.2 · Check: `rg -n 'tabindex="[1-9]' src/` returns 0; ``rg -n '\border:\s*-?[0-9]|row-reverse|column-reverse' src/ --glob '*.{css,scss}'``; PW walk 30 Tab presses recording each `top` and the number of backward jumps stays at most 1 within a view without side columns · Source B1, B22.

**A11Y-KBD-03** — Focus is always visible: `:focus-visible` with an outline of 2 px or more and 3:1 against the background; never `outline: none`/`0` with no replacement. · How C+T · criterion I6 · WCAG 2.4.7 (AA), 1.4.11 (AA) · Check: PW after Tab, `parseFloat(getComputedStyle(document.activeElement).outlineWidth)` is at least 2; generic `rg -n 'outline:\s*(none|0)\b' src/ --glob '*.{css,scss,tsx,jsx,vue,svelte}'` and each match has a `:focus-visible` replacement in the same selector. Already in `reference/modern-interface.md` “Focus” · Source B2, B1.

**A11Y-KBD-04** — The element with focus is never totally covered by a fixed header/footer, a cookie banner or a non-modal panel: `scroll-padding-top/bottom` equal to the height of what is fixed. · How T · criterion I14 · WCAG **2.4.11 Focus Not Obscured (Minimum) (AA, new in 2.2)** · Check: PW press Tab 40 times and for the focused element evaluate three points (top-left, bottom-right, center) with `document.elementFromPoint`: not all three may belong to something else; generic `html { scroll-padding-top: var(--header-h); scroll-padding-bottom: var(--footer-h); }`; manual: tab backwards from the footer at 200 % zoom. Fixed content that covers the focus fails (F110); technique C43 `scroll-padding` · Source B2.

**A11Y-KBD-05** — Put a “Skip to content” link as the first tabbable, visible on receiving focus, that takes the focus to `<main>`. · How T · criterion I6 · WCAG 2.4.1 (A) · Check: PW Tab → the link is focused and in the viewport; Enter → `main` (with `tabindex="-1"`) is focused; generic `<a class="skip" href="#main">Skip to content</a> … <main id="main" tabindex="-1">` · Source B1.

**A11Y-KBD-06** — In an SPA, every route change updates `document.title` and moves focus to the new view's `h1` (`tabindex="-1"`) or announces the page name in a live region. · How T · criterion I10 · WCAG 2.4.3, 4.1.3, 2.4.2 · Check: PW click a link, `toHaveTitle(/^Customers/)` and the level-1 heading `toBeFocused()`; generic in the router's navigation hook `document.title = …; requestAnimationFrame(() => document.querySelector('h1')?.focus())` · Source B27.

**A11Y-KBD-07** — Modal overlays use `<dialog>.showModal()` (or an equivalent primitive): inert background, Tab does not leave, Esc closes, initial focus by content and, on closing, focus back to the trigger (or the next logical one if it no longer exists). · How T · criterion I16 · WCAG 2.1.2, 2.4.3, 4.1.2 · Check: PW click the trigger; the dialog by role and name is visible; for a destructive action the initial focus is the least destructive option; ten Tab presses stay inside; Esc hides it and the trigger is focused; generic `rg -n 'role="dialog"' src/` each with `aria-modal`, a name and focus management, or migrate to `<dialog>`; `rg -n '<dialog[^>]*tabindex' src/` returns 0. Whether the browser returns focus on closing a native dialog is [NV]: test it or do it by hand · Source B5, B22, B30.

**A11Y-KBD-08** — After an action focus lands somewhere that makes sense, never on `<body>`: when deleting a row, the next one (or the message); when closing a panel, its trigger; when saving, the message or the next control. · How T · criterion I10 · WCAG 2.4.3 · Check: PW after the delete click, `document.activeElement === document.body` is false; generic in each handler that removes the focused element from the DOM, move the focus before removing it · Source B5, B22.

**A11Y-KBD-09** — Single-key shortcuts (letters, numbers, J/K) can be turned off or remapped, or act only when their component has focus. · How T+J · criterion none · WCAG 2.1.4 Character Key Shortcuts (A) [NV exact text this session] · Check: PW with focus in a search `<input>`, pressing `j` must not move the list's selection; generic the shortcut listener lives on the container, not on `document` · Source B1.

## 3. Screen readers and announcements (SR)

**A11Y-SR-01** — Every status message (saved, “12 results”, “offline”, a submit error with no change of context) is announced without moving focus, with `role="status"` (or `alert` if it is an urgent error) in a region that exists empty in the DOM from load. · How T · criterion I7 · WCAG 4.1.3 (AA) · Check: PW `getByRole('status')` has count 1 before; after clicking Save its text matches and the button keeps the focus; generic `<div role="status" class="sr-only" id="status"></div>` in the layout and the code does `status.textContent = msg` (never create the region with the text inside). A live region does not announce its initial content, only changes (except `alert`); creating it empty before is the most common reason a message is not announced · Source B2, B24, B25.

**A11Y-SR-02** — `polite` by default; `assertive`/`role="alert"` only for blocking errors, session loss or security. One announcement per event. · How C+J · criterion I7 · WCAG 4.1.3 · Check: PW `page.locator('[role=alert],[aria-live=assertive]').count()` is at most 1; generic `rg -n 'aria-live="assertive"|role="alert"' src/` each with an urgent error case that justifies it · Source B24, B25.

**A11Y-SR-03** — Expose the state, do not only paint it: `aria-expanded` on what opens, `aria-pressed` on toggles, `aria-selected`/`aria-current` on the selection and the current page, `aria-invalid` on the field with an error, `aria-sort` on the sorted column. · How T · criterion I16 · WCAG 4.1.2 · Check: PW `toHaveAttribute('aria-expanded', 'false')` then `'true'` after the click; `aria-current="page"` on the current link; generic `rg -n 'class(Name)?=.*(active|selected|open|is-open)' src/` each state class has its ARIA attribute on the same element · Source B4, B5.

**A11Y-SR-04** — Hide with the right mechanism: `hidden`/`display:none` removes for everyone; `.sr-only` leaves it only for the reader; `aria-hidden="true"` only on the decorative non-focusable; `inert` for the background of an own overlay. · How C · criterion none · WCAG 1.3.1, 4.1.2 · Check: PW `axe(page, { rules: ['aria-hidden-focus','aria-hidden-body'] })`; generic `rg -n 'aria-hidden="true"[^>]*(href=|tabindex="0"|<button)' src/` · Source B6, B30.

**A11Y-SR-05** — Waits are announced: “Loading…” when starting and the result when finishing (“12 results”, “No results”); do not rely on `aria-busy`. · How T · criterion I7 · WCAG 4.1.3 · Check: PW after `search.fill('acme')` the status text matches `\d+ results|no results`; generic the list component writes the count into the status region when the filter changes · Source B2, B24.

**A11Y-SR-06** — Pin the accessibility tree of each new component in a test (role, name, state), so that a visual refactor does not break it silently. · How T · criterion I16 · WCAG 4.1.2, 1.3.1 · Check: PW `toMatchAriaSnapshot` over the navigation or the component [NV minimum Playwright version]; generic Chrome DevTools → Accessibility pane / Firefox Accessibility Inspector to review the tree by hand. T12 asks to look up by role and name · Source B21, B4.

## 4. Color and contrast (COL)

**A11Y-COL-01** — Text with 4.5:1 contrast (3:1 if large), computed over the tokens and measured in the view, in light, dark and every state (a disabled one does not require it). · How C+T · criterion I1 · WCAG 1.4.3 (AA) · Check: PW `axe(page, { rules: ['color-contrast'] })` has no violations **and** no `incomplete` of `color-contrast` (text over a gradient or image stays in `incomplete`); generic a script that walks the text/background pairs of the tokens and computes the WCAG 2 ratio. Tailwind v3 grays on white (computed): `gray-300` 1.47:1, `gray-400` 2.54:1, `slate-400`/`zinc-400` 2.56:1, `gray-500` 4.83:1: the first that passes is 500. “Large text” is 18 pt or 14 pt bold (about 24 px / 18.66 px) [NV the px equivalence] · Source B19, B33.

**A11Y-COL-02** — What is not text and is needed to use the interface has 3:1 against what is adjacent: the border of inputs and checkboxes, the focus indicator, the selected state, the marks and lines of charts. · How C+J · criterion I1 · WCAG 1.4.11 (AA) · Check: PW measure `getComputedStyle(input).borderColor` against the background with the same contrast function; axe does not evaluate it [NV that axe has no 1.4.11 rule]; generic tokens `--border-control` and `--focus-ring` with their computed ratio in the design system. Exempt: inactive, unmodified browser style, hover · Source B2.

**A11Y-COL-03** — Nothing is distinguished by color alone: errors with an icon and text, states with a label, chart series with a shape or a direct label, links inside text underlined (or 3:1 against the neighboring text). · How T+J · criterion none · WCAG 1.4.1 (A) · Check: PW inject `html{filter:grayscale(1)}` and capture, judged by eye; `axe(page, { rules: ['link-in-text-block'] })`; generic `rg -n 'text-(red|green)-[0-9]+' src/` in state components each with text or an icon. G183, F73 · Source B2.

**A11Y-COL-04** — APCA is used, if wanted, as an additional readability check, never as a replacement: every color pair also meets the WCAG 2 ratios. · How J · criterion none · WCAG 1.4.3/1.4.11 · Check: the tokens document has two columns: WCAG 2 ratio (mandatory) and APCA Lc (informative). WCAG 3.0 (Working Draft, 10 September 2026) replaces nothing, its contrast algorithm is not decided and APCA has been out of its draft since July 2023: it is neither demandable nor measurable · Source B3, B22.

**A11Y-COL-05** — Respect the system modes: `forced-colors: active` (visible borders, `CanvasText`/`Highlight`), `prefers-contrast: more`, a dark theme with its own verified pairs. · How T · criterion none · WCAG 1.4.11, 1.4.3 · Check: PW `page.emulateMedia({ forcedColors: 'active' })` plus axe and capture; `page.emulateMedia({ colorScheme: 'dark' })` plus `axe(page, { rules: ['color-contrast'] })`; generic `@media (forced-colors: active) { .card { border: 1px solid CanvasText; } }` · Source B2.

## 5. Motion (MOV)

**A11Y-MOV-01** — With `prefers-reduced-motion: reduce`, displacement, scale, parallax and animated scroll are replaced by an opacity or color fade; nothing that depends on movement stays without its version. · How T · criterion none · WCAG 2.3.3 (AAA, adopted as practice) · Check: PW `page.emulateMedia({ reducedMotion: 'reduce' })` and the animations whose keyframes touch `transform|translate|scale|left|top` are 0; generic `@media (prefers-reduced-motion: reduce) { *,*::before,*::after { scroll-behavior: auto !important; } .panel { transition: opacity 120ms; transform: none; } }`. It is AAA, and animated blur counts as movement; “motion animation” excludes color and opacity (C39). The kit's `tools/motion-audit.mjs` covers what remains with reduced motion · Source B2.

**A11Y-MOV-02** — What moves, blinks or updates by itself for more than 5 s can be paused, stopped or hidden (carousels, marquees, live counters). · How T · criterion none · WCAG 2.2.2 (A) · Check: PW a “pause” button is visible in each carousel/marquee; generic `rg -n 'setInterval|autoplay|animation-iteration-count:\s*infinite|infinite' src/` each with a pause control · Source B1.

**A11Y-MOV-03** — Nothing flashes more than three times per second. · How J · criterion none · WCAG 2.3.1 (A) [NV exact text this session] · Check: it is not reliably automated; `motion-audit` records animations and their duration; review animations with `duration < 333ms` that alternate opacity or color in a loop · Source B1.

## 6. Forms and errors (FRM)

**A11Y-FRM-01** — Every field has a visible, associated `<label>`, above the field; the placeholder is neither label nor hint. · How C · criterion I3 · WCAG 1.3.1, 3.3.2, 4.1.2 · Check: PW `axe(page, { rules: ['label','select-name','aria-input-field-name'] })` and `getByLabel('Email')` is visible; generic `rg -n 'placeholder="' src/` each input with `placeholder` has its `<label for>` or is wrapped by a `<label>` · Source B26, B19.

**A11Y-FRM-02** — Personal data fields carry `autocomplete` with its token (`name`, `email`, `tel`, `postal-code`, `street-address`, `username`, `current-password`, `new-password`, `one-time-code`). · How C · criterion none · WCAG 1.3.5 (AA) · Check: PW `axe(page, { rules: ['autocomplete-valid'] })`; generic ``rg -n -P 'type="(email|tel|password)"(?![^>]*autocomplete=)' src/`` · Source B26.

**A11Y-FRM-03** — The error goes next to the field, after the label and the hint, tied with `aria-describedby`, the field with `aria-invalid="true"`, a hidden prefix “Error:”, text that says what happened and how to fix it with the label's words; the loaded values are not erased. · How T · criterion I7 · WCAG 3.3.1 (A), 3.3.3 (AA), 1.3.1, 4.1.2 · Check: PW click Continue; the field has `aria-invalid="true"`, `toHaveAccessibleDescription(/error: .*date of birth/i)`, and another field keeps its `toHaveValue('Ana')`; generic `rg -n -i '"(invalid field|invalid|required|this field is required|error)"' src/` generic messages to rewrite. See `reference/errors.md` ERR-UX-04 · Source B26, B25.

**A11Y-FRM-04** — On submitting with errors: a summary above the `main` (over the `h1`), with links to each field, focus moved to the summary and a `title` with “Error: ” in front. · How T · criterion I7 · WCAG 3.3.1, 2.4.3, 2.4.2 · Check: PW the summary (`role="alert"`) is focused, `toHaveTitle(/^Error: /)`, a link of the summary focuses its field; generic `<div role="alert" tabindex="-1" class="error-summary"><h2>There is a problem</h2><ul><li><a href="#dob-day">Enter the date of birth</a></li></ul></div>` · Source B26.

**A11Y-FRM-05** — Validate on trying to advance (submit, continue), not on leaving each field nor while typing; server-side validation always exists. After an error, the field with the error is re-validated while it is corrected (GOV.UK's pattern; the earlier “validate on leaving the field” guidance of `reference/modern-interface.md` is replaced by this). · How J · criterion I7 · WCAG 3.3.1 · Check: PW `f.fill('x'); f.press('Tab')` shows no `Error:` text; generic review `onBlur` handlers that set errors: `rg -n 'onBlur=.*(validate|setError)' src/`. The exception admitted is what research justifies (for instance a character counter) · Source B26.

**A11Y-FRM-06** — Required fields are indicated in text (not only an asterisk or color) and the expected format is said before the field, in the hint. · How T+J · criterion I7 · WCAG 3.3.2 (A), 1.4.1 · Check: PW `toHaveAccessibleDescription(/e\.g\.|format/i)` on the phone field; generic if almost everything is required, mark the optional ones with “(optional)” in the label · Source B26.

**A11Y-FRM-07** — Radios, checkboxes and compound fields (a date in three parts) go in a `<fieldset>` with a `<legend>`. · How T · criterion none · WCAG 1.3.1, 3.3.2 · Check: PW `getByRole('group', { name: 'Date of birth' })` is visible; generic `rg -n 'type="radio"' src/ -l` each file with `<fieldset>`/`role="radiogroup"` · Source B26.

**A11Y-FRM-08** — Choose the input by the datum: `inputmode="numeric"` (not `type="number"`) for numbers that are not added (ID number, bank code, codes), `spellcheck="false"` on names and emails, a width that fits the expected length. · How C+J · criterion none · WCAG usability (it reduces errors, 3.3) · Check: PW `toHaveAttribute('inputmode', 'numeric')`; generic `rg -n 'type="number"' src/` only for quantities · Source B26.

**A11Y-FRM-09** — Do not ask twice for the same thing in a process: autocomplete or offer to select it (“Billing address is the same”), unless re-entering is essential, for security or the datum is no longer valid. · How T+J · criterion I14 · WCAG **3.3.7 Redundant Entry (A, new in 2.2)** · Check: PW check “Use the same address” and the billing street keeps the value; generic an inventory of fields per step of the flow, each repeated one with its mechanism or its recorded exception · Source B1, B2.

**A11Y-FRM-10** — If the app offers help (contact, chat, FAQ) on several views, it appears in the same relative place on all of them. · How T · criterion I14 · WCAG **3.2.6 Consistent Help (A, new in 2.2)** · Check: PW on each view the relative index of the help link among `header a, footer a` is the same; generic help lives in a layout component, not in each view · Source B1, B2.

**A11Y-FRM-11** — Actions with legal, financial or deletion consequences can be reviewed, confirmed or undone. · How T · criterion none · WCAG 3.3.4 (AA) [NV exact text] · Check: PW click Delete then Undo and the row is visible; generic delete plus “Undo”, or a confirmation dialog with a summary. The toast's “Undo” must be reachable by keyboard (A11Y-APG-08) · Source B1.

## 7. Tables and data (TAB)

**A11Y-TAB-01** — Tabular data goes in a `<table>` with `<caption>`, `<th scope="col|row">`; not in `div` grids, and with no `display:flex/block/grid` over the table or its rows. · How C+T · criterion none · WCAG 1.3.1 · Check: PW `getByRole('table', { name: 'Pending orders' })` and `getByRole('columnheader', { name: 'Total' })` are visible plus `axe(page, { rules: ['th-has-data-cells','td-headers-attr','table-duplicate-name','scope-attr-valid'] })`; generic `rg -n 'role="(table|row|cell|grid)"' src/` migrate to a native table unless it is an interactive grid; ``rg -n -U '(table|tr|td)\s*\{[^}]*display:\s*(flex|block|grid)' src/ --glob '*.css'`` · Source B22, B5.

**A11Y-TAB-02** — A wide table goes inside a container with horizontal scroll operable by keyboard (`tabindex="0"`), with a name if given `role="region"`. · How C · criterion none · WCAG 2.1.1, 1.4.10 · Check: PW `axe(page, { rules: ['scrollable-region-focusable'] })`; generic `<div class="table-wrap" tabindex="0" role="region" aria-labelledby="cap-orders"><table><caption id="cap-orders">…`. The table is exempt from reflow; its surroundings are not · Source B22, B2.

**A11Y-TAB-03** — Do not make the whole row clickable: the link goes in the main cell (with an `::after` that extends if needed) and the actions in buttons of their own. · How C · criterion none · WCAG 2.1.1, 4.1.2 · Check: PW `page.locator('tr[onclick], tr[data-href], tr[role=link]').count()` is 0; generic `rg -n '<tr[^>]*on(Click|click)=' src/` · Source B22.

**A11Y-TAB-04** — A sortable column has a `<button>` inside the `<th>` and `aria-sort` on the sorted `<th>`; the change of order is announced. · How T · criterion none · WCAG 4.1.2, 4.1.3 · Check: PW click the header's button and `toHaveAttribute('aria-sort', 'ascending')`; generic `rg -n 'aria-sort' src/` in every table component with ordering [NV detail of the APG example] · Source B5, B4.

**A11Y-TAB-05** — Every chart has a short name and an alternative with the same data: a table (visible or expandable with `<details>`) or a long description in `<figure>/<figcaption>`; series distinguishable without color and marks at 3:1. · How T+J · criterion none · WCAG 1.1.1, 1.4.1, 1.4.11 · Check: PW the figure's “View data” button reveals a table; generic `<figure><svg role="img" aria-labelledby="t1">…</svg><figcaption id="t1">Sales by month, 2026</figcaption><details><summary>View data</summary><table>…</table></details></figure>` · Source B31, B2.

## 8. Complex components by the APG (APG)

**A11Y-APG-01** — Every composite widget comes from a primitive that implements its APG pattern (React Aria, Base UI, Radix or the native one) and is tested with the keyboard and with at least one reader before accepting it. · How T+M · criterion I16 · WCAG 2.1.1, 4.1.2 · Check: a keyboard test per pattern (the checklist below); generic `rg -n 'role="(tablist|listbox|combobox|menu|tree|grid|slider)"' src/` each one comes from a primitive or has its keyboard test. The APG's code is not for production without testing interoperability with assistive technologies; ARIA gives no keyboard · Source B5.

**A11Y-APG-02** — Disclosure and accordion: `<button aria-expanded>` (or `<details>/<summary>`) that shows content below, without moving focus; the accordion's heading wraps the button. · How T · criterion I16 · WCAG 4.1.2 · Check: PW Enter on the button sets `aria-expanded="true"` and the button keeps the focus; generic `<h3><button aria-expanded="false" aria-controls="p1">Shipping</button></h3><div id="p1" hidden>…</div>` · Source B22, B5.

**A11Y-APG-03** — `role="menu"` only for application-style action menus (with arrows, Home/End, Esc returns focus, Tab closes); the site's navigation is a list of links with disclosure buttons or a `popover`. · How C+T · criterion I16 · WCAG 4.1.2, 2.1.1 · Check: PW Enter on the menu button focuses the first `menuitem`, ArrowDown moves, Esc returns the focus to the button; generic ``rg -n -U '<nav[\s\S]{0,400}role="menu' src/`` returns 0 · Source B22, B23, B5.

**A11Y-APG-04** — Tabs: `tablist`/`tab`/`tabpanel`, Tab enters the active tab and leaves to the panel, arrows move between tabs, `aria-selected`; automatic activation only if the panel appears without delay. · How T · criterion I16 · WCAG 2.1.1, 4.1.2 · Check: PW ArrowRight focuses the next tab and sets `aria-selected="true"`, Tab focuses the tabpanel; generic tabs that load remote data use manual activation (Enter/Space) · Source B5.

**A11Y-APG-05** — Combobox: DOM focus stays in the input (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`), arrow down opens and walks, Enter accepts, Esc closes; the result count is announced. · How T · criterion I16 · WCAG 2.1.1, 4.1.2, 4.1.3 · Check: PW fill, ArrowDown, the combobox keeps the focus and has `aria-activedescendant`, Enter sets the value and `aria-expanded="false"`; generic if typing is not needed to filter, use a native `<select>` · Source B5.

**A11Y-APG-06** — Tooltips and popovers by hover/focus: they close with Esc without moving the pointer, the pointer can be moved over them without disappearing, and they stay until focus/hover leaves; they are never the only place of essential information nor a button's name. · How T · criterion I16 · WCAG 1.4.13 (AA) · Check: PW hover shows the tooltip, hover on the tooltip keeps it, Esc hides it; generic the trigger has its own name and the tooltip goes in `aria-describedby` · Source B2, B5.

**A11Y-APG-07** — Every drag has a single-pointer alternative (up/down buttons, “Move to…”, a click on the slider's track) and a keyboard mode with announcements (pick up, move, drop, cancel). · How T · criterion I14 · WCAG **2.5.7 Dragging Movements (AA, new in 2.2)**, 2.1.1, 4.1.3 · Check: PW the “Move to…” button and menu item place the card in the other list; the keyboard mode: Enter on the handle, Tab, Enter and the status says dropped; generic `rg -n 'draggable=|onDrag|useDrag|dnd-kit|sortable' src/ -l` each file with its alternative. “Keyboard equivalence does not meet it on its own”: a single pointer is needed, which React Aria alone does not give · Source B2, B28, B29.

**A11Y-APG-08** — Toasts: the `role="status"` region exists from load; error ones do not go away by themselves; if a toast carries an action (“Undo”), that action is also reachable by keyboard without chasing the toast (shortcut, focus or in the action's place); the time of a toast with an action can be extended (pause on hover and focus). · How T · criterion I16 · WCAG 4.1.3, 2.2.1, 2.1.1 · Check: PW after Delete the status text matches, and after 8 s the “Undo” is still visible or reachable by the documented shortcut; generic `rg -n 'toast\(|sonner|react-hot-toast|notistack' src/` review the `duration` of error ones (infinite) and that the library mounts the region at start. TetraLogical suggests considering not using toasts: the message next to the action · Source B25, B24, B2.

**A11Y-APG-09** — Carousels: a pause button if they advance by themselves, previous/next controls with a name, slides as a named group (“2 of 5”), no autoplay by default. · How T · criterion I16 · WCAG 2.2.2 · Check: PW a pause button is visible and a group named `2 of 5` is attached; generic `rg -n 'autoplay' src/` [NV APG detail] · Source B5.

**The checklist per APG pattern.** Each item is a Playwright assertion or, if it says *(manual)*, a check with a reader.

| Pattern | Roles and states | Keyboard | Focus | Announcement |
|---|---|---|---|---|
| **Button / toggle** | `<button>`; toggle with `aria-pressed` | Enter and Space | visible ring | name + “pressed” *(manual)* |
| **Disclosure / accordion** | `button[aria-expanded]` (+`aria-controls`) or `details/summary`; in an accordion, a button inside the `hN` | Enter/Space toggle | does not move | “expanded/collapsed” |
| **Modal dialog** | `dialog` + `showModal()` or `role=dialog` + `aria-modal` + a name by `aria-labelledby` | Tab/Shift+Tab cycle inside; Esc closes | initial: the first control, the heading (long content) or the least destructive option; on closing, the trigger | role and title on opening *(manual)* |
| **Alert dialog** | `role=alertdialog`, a name and `aria-describedby` to the message | as dialog | the least destructive option | the message read on opening *(manual)* |
| **Menu button + menu** | `button[aria-haspopup=menu][aria-expanded]`, `menu` > `menuitem(checkbox\|radio)`; **not for navigation** | Enter/Space/↓ open and go to the first, ↑ to the last; ↑↓ walk; Home/End; a letter jumps; Esc closes; Tab leaves and closes | on closing, the button | “menu, N items” *(manual)* |
| **Disclosure navigation** | `nav` > `ul` > links + `button[aria-expanded]` (or `popover`) | Tab walks the links; Enter/Space on the button; Esc closes | stays on the button | “expanded” |
| **Tabs** | `tablist` (named) > `tab[aria-selected][aria-controls]`; `tabpanel[aria-labelledby]` | ←/→ (↑/↓ if vertical), Home/End; Enter/Space if manual activation | Tab enters the active one and leaves to the panel | “tab, 2 of 4, selected” *(manual)* |
| **Combobox** | `input[role=combobox][aria-expanded][aria-controls][aria-autocomplete]`, `listbox` > `option[aria-selected]` | ↓ opens/walks, Alt+↓ opens without moving, Enter accepts, Esc closes (and optionally clears) | DOM on the input; the active option by `aria-activedescendant` | result count in status |
| **Listbox** | `listbox` (+`aria-multiselectable`) > `option[aria-selected]` | ↑↓, Home/End, a letter; Space/Shift selects in multiple | roving or `aria-activedescendant` | option and state |
| **Tooltip** | `role=tooltip`, referenced by `aria-describedby`; the trigger has its own name | Esc closes | does not receive focus | the description after the name |
| **Sortable table** | `table` > `caption`; `th[scope]`; `th[aria-sort]` with a `button` inside | Tab to the sort buttons; scroll container `tabindex=0` | stays on the button | the new order in status |
| **Drag & drop** | a named handle (“Move Order 1042”); named targets | Enter picks up, Tab/arrows to a target, Enter drops, Esc cancels; **and** a one-click “Move to…” button | returns to the moved element | pick up/position/drop in status |
| **Toast** | `role=status` region (or `alert` if error) mounted on load | the action reachable without chasing the toast | does not steal focus | once; errors do not go away |
| **Carousel** | a group named “N of M”; previous/next/pause buttons | Tab to the controls | does not move by itself | no autoplay, or with a pause |

## 9. Responsive, zoom, reflow and targets (RSP)

**A11Y-RSP-01** — At 320 CSS px wide there is no horizontal scroll nor lost information or function (except tables, maps, charts and 2D editors; their headers, search and pagination do reflow). With horizontal scroll, 256 px of height. · How T · criterion I9 · WCAG 1.4.10 (AA) · Check: PW `page.setViewportSize({ width: 320, height: 640 })` and `document.documentElement.scrollWidth` is at most 320; generic the browser at 1280 px wide with 400 % zoom (equal to 320 px) · Source B2.

**A11Y-RSP-02** — At 200 % zoom (and with only the text enlarged to 200 %) no text or control is cut, overlapped or hidden. · How T+M · criterion I9 · WCAG 1.4.4 (AA) · Check: PW page zoom is half the viewport: `page.setViewportSize({ width: 640, height: 450 })` plus a capture; text-only zoom: inject `html{font-size:200% !important}` and count the elements with `scrollWidth > clientWidth + 1` and `overflow` other than `visible`: 0 (`tools/overflow.mjs` does this for the screens a card touches, with real and pseudo-localized text); generic manual with Ctrl/Cmd up to 200 % and then 400 %. `user-scalable=no` or `maximum-scale=1` in the viewport is a failure (axe `meta-viewport`) · Source B1, B31.

**A11Y-RSP-03** — With WCAG's text spacing (line height 1.5; paragraph 2×; letter 0.12 em; word 0.16 em) no content is lost. · How T · criterion I9 · WCAG 1.4.12 (AA) · Check: PW inject `*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}` and the same clipping check as RSP-02 · Source B1.

**A11Y-RSP-04** — Every pointer target measures at least 24 × 24 CSS px or has equivalent free space (a 24 px circle that does not overlap another); on touch, aim for 44 pt (iOS) / 48 dp (Android). · How C+T · criterion I8 · WCAG **2.5.8 (AA, new in 2.2)** · Check: PW `axe(page, { rules: ['target-size'] })` — **careful**: with only `wcag2a…wcag21aa` it does not run — and an own measurement: the buttons, links and checkboxes with `getBoundingClientRect` under 24 px (outside running text) are 0; generic `.icon-btn { min-inline-size: 24px; min-block-size: 24px; }` (44 px for the main action on mobile); Android 48 × 48 dp, contrast 4.5:1 [V]; Apple 44 × 44 pt [NV] · Source B1, B2, B33.

**A11Y-RSP-05** — Do not lock the orientation: the app works in portrait and landscape. · How T · criterion I13 · WCAG 1.3.4 (AA) [NV exact text] · Check: PW `page.setViewportSize({ width: 844, height: 390 })` plus a capture and axe; generic `rg -n 'screen\.orientation\.lock|orientation:\s*portrait' src/` · Source B1.

**A11Y-RSP-06** — What is fixed (header, bottom bar, banner) does not eat the screen with zoom: at low heights (500 px or less) it stops being fixed or shrinks. · How T · criterion I9 · WCAG 1.4.10, 2.4.11 · Check: PW at 640 × 360 the height of a fixed or sticky header is under 25 % of the viewport; generic `@media (max-height: 500px) { header { position: static; } }` · Source B18, B2.

## 10. Accessible authentication (AUT)

**A11Y-AUT-01** — Never block pasting nor autocomplete on user, password or code; mark the fields with `autocomplete="username"`, `"current-password"`, `"new-password"`, `"one-time-code"`. · How C+T · criterion I14 · WCAG **3.3.8 Accessible Authentication (Minimum) (AA, new in 2.2)**, 1.3.5 · Check: PW the password field has `autocomplete="current-password"` and a dispatched `paste` event is not cancelled; generic `rg -n 'onPaste|on:paste|addEventListener\(.paste|autocomplete="off"' src/` returns 0 in login forms. Blocking pasting or autocomplete fails · Source B2, B26.

**A11Y-AUT-02** — The one-time code is entered in a single field, or in several that accept pasting the whole code and distribute it. · How T · criterion I14 · WCAG 3.3.8 · Check: PW focus the first digit field, `keyboard.insertText('482913')` and the Verify button is enabled; generic `<input inputmode="numeric" autocomplete="one-time-code" maxlength="6">` · Source B2.

**A11Y-AUT-03** — No step of access demands a cognitive test (remember, transcribe, solve a puzzle, a text or arithmetic CAPTCHA, “characters 1, 3 and 5”) without an alternative: a password manager, an email link, a passkey/WebAuthn, the system's biometrics. · How J · criterion I14 · WCAG 3.3.8 · Check: the alternative path exists (PW the “email link”/“passkey” button is visible); an inventory of each step of login/recovery with its non-cognitive alternative. Recognizing objects is allowed in AA; an email link (G218) is sufficient; hardware keys and OS biometrics are not cognitive tests · Source B2.

**A11Y-AUT-04** — Offer to show the password (a button with `aria-pressed` or a name change). · How T · criterion I14 · WCAG 3.3.8 (technique), 4.1.2 · Check: PW the “Show password” button turns the field to `type="text"` · Source B2.

**A11Y-AUT-05** — If the session expires, warn before with a dialog that receives focus and allows extending it (at least 20 s to answer), and do not lose what was loaded. · How T · criterion none · WCAG 2.2.1 Timing Adjustable (A) [NV exact thresholds] · Check: PW with a fake clock (`page.clock.install()` and `fastForward`) the `alertdialog` is focused [NV `page.clock` in the installed version]; generic a client-side timer that fires the warning N minutes before · Source B25.

## 11. Content the app generates: PDFs, emails, text (DOC)

**A11Y-DOC-01** — Every PDF the app generates is a tagged PDF conforming to PDF/UA (UA-1, or UA-2 if PDF 2.0 is generated) and passes veraPDF. · How C · criterion none · WCAG 1.3.1, 1.1.1, 2.4.2, 3.1.1 applied to documents · Check: PW wait for the `download` event, save the file, then the command; generic `verapdf -f ua1 out/invoice.pdf` (or `-f ua2`) gives `isCompliant="true"`. veraPDF only does the machine-checkable checks [V-sec]: the Matterhorn Protocol checks that ask for judgment (reading order, a meaningful alt) go to manual review. Section 508 applies WCAG to non-web documents and EN 301 549 covers documents · Source B14, B10, B8.

**A11Y-DOC-02** — The PDF declares language and title (shown in the bar instead of the file name), has a logical reading order, tagged headings, tables with header cells, alt on informative images and artifacts marked on the decorative; never text as an image. · How C+M · criterion none · WCAG applied to documents · Check: `verapdf -f ua1 --format text out/invoice.pdf | rg -i 'fail'`; manual: open with NVDA + Acrobat Reader or the tags view and read straight through [NV individual checks] · Source B14.

**A11Y-DOC-03** — The emails the app sends: `<html lang dir>`, layout tables with `role="presentation"`, one `h1`, alt on images, links with their own text, the contrast of COL-01, and a plain-text part. · How C+T · criterion none · WCAG 3.1.1, 1.3.1, 1.1.1, 2.4.4, 1.4.3 applied to email · Check: PW `page.setContent(renderEmail('welcome', data))`, no axe violations and `table:not([role=presentation])` count 0; generic ``rg -n -P '<table(?![^>]*role="presentation")' <email-templates-folder>``. Email Markup Consortium 2026: 376,348 emails analyzed, only 8 passed everything; 84 % do not mark layout tables as presentation [V-sec] · Source B34.

**A11Y-DOC-04** — The text the app generates (messages, help, model-written content) is in the page's language, in plain language: short sentences, the important first, no internal jargon; links say where they lead (“View invoice 1042”, not “click here”). · How C+J · criterion I12 · WCAG 2.4.4 (A), 3.1.1, 3.1.5 (AAA) [NV text of 3.1.5] · Check: PW links whose text matches `^(click|here|more|read more|see more)$` are 0; generic `rg -n -i '>(click|click here)<|>read more<|>see more<' src/` · Source B26, B18.

## 12. Process (PRO)

**A11Y-PRO-01** — axe runs per view **and per state** (open modal, visible error, expanded menu, dark theme), with the tags `wcag2a…wcag22aa`; the best-practice rules are asked for apart; every exclusion (`disableRules`/`exclude`) is listed with its reason. · How T · criterion I1 · every mechanizable WCAG · Check: PW a loop over states with `expect(r.violations, state).toEqual([])`; generic `rg -n 'disableRules|\.exclude\(' e2e/` each line with a comment of the reason · Source B15, B21.

**A11Y-PRO-02** — The `incomplete` result of axe is not discarded: each item is reviewed by hand and stays in the report as passes / fails. · How T+M · criterion none · every mechanizable WCAG · Check: PW write `r.incomplete` to `specs/<card>/axe-incomplete.json`; “incomplete … manual review is needed” · Source B15.

**A11Y-PRO-03** — “Passed axe” is not “meets AA”: the report names the real coverage (about 57 % of the problems by volume; 20–30 % of the criteria; no tool, nor all together, reached 100 % in GDS's test) and what was not tried by hand stays *could not run*. · How J · criterion V5 · Check: the report states both figures with their base, so they do not contradict each other (automatic analysis covers about a third of WCAG by criteria) · Source B15, B16, B17.

**A11Y-PRO-04** — Every new or changed screen passes the 10-minute manual protocol (below): keyboard, screen reader, zoom and reflow; its result goes in `specs/<card>/accessibility.md`. A person doing it counts as evidence of kind A; if nobody ran it, it is declared `could not run` with its reason, never `passed`. · How M · criterion I15 · Check: the protocol below, run on the production build, in the view and the states the card changed · Source B17, B18, B31.

**A11Y-PRO-05** — The minimum matrix of readers is NVDA + Chrome (or Firefox) on Windows and VoiceOver + Safari on iOS or macOS; JAWS + Chrome and TalkBack + Chrome when the product is public or the client asks. · How M · criterion I15 · Check: the report names reader, browser and result. Main desktop reader: JAWS 40.5 %, NVDA 37.7 %, VoiceOver 9.7 %; on mobile VoiceOver 70.6 % · Source B18, B20.

**A11Y-PRO-06** — The conformance report uses VPAT 2.5Rev INT with the four terms (Supports, Partially Supports, Does Not Support, Not Applicable) and, if the app is public, an accessibility statement is published (`templates/accessibility-statement.md`, living in `docs/business/accessibility.md`) with standard, state, known limitations and contact. · How J · criterion I17 · Check: the statement exists and is current · Source B12, B13.

**A11Y-PRO-07** — The target is WCAG 2.2 AA, which covers at once: Argentina (Disp. ONTI 6/2019, 30 of the 38 criteria of WCAG 2.0 A/AA), the United States 508 (WCAG 2.0 AA), the European Union (EN 301 549 V3.2.1 → WCAG 2.1 AA today; V4.1.1 → WCAG 2.2 AA when cited in the Official Journal, expected 16 December 2026) and the EAA since 28 June 2025. · How J · criterion V5 · Check: the plan's accessibility line names the target. The third-party skill `skills/accessibility-audit` audits against WCAG 2.1 AA · Source B8, B9, B10, B11.

**A11Y-PRO-08** — Before launching a public service, test it with people with disabilities and with older people; before that, at least one audit by someone who did not build it. · How J · criterion none · Check: the evidence of the sessions · Source B18.

## The 10-minute manual protocol per screen

It runs on the production build, over the view and the states the card changed. Each item is left *passes* / *fails* / *could not run* with a line of evidence, in `specs/<card>/accessibility.md`. Step 9 of the method runs it as part of the verdict of a new screen.

**Keyboard — 3 min** (the mouse out of reach). (1) Reload. First Tab → “Skip to content” appears; Enter → focus is on the content. (2) Tab to the end and Shift+Tab back: is the focus always visible? never covered by something fixed? does the order follow the reading? (3) Activate each new control with Enter/Space; composite widgets with arrows (the checklist above). (4) Open each overlay: focus enters, Tab does not escape, Esc closes, focus returns to the trigger. (5) Do the main action (save, delete, filter): where did focus land? Never on the `body`. (6) Submit the form empty: focus goes to the error summary; each link leads to its field.

**Screen reader — 4 min** (NVDA + Chrome/Firefox on Windows, or VoiceOver + Safari on macOS/iOS). (1) On load the view's title is announced; in an SPA, on navigating too. (2) The list of headings and of landmarks: with that alone, is the view understood? (3) Tab through the new controls: each one says **name, role and state** (“Filters, button, collapsed”). (4) Each field says its label, whether it is required, its format hint and, with an error, the error. (5) Do the main action: the result is announced (“Saved”, “3 results”) without moving focus. (6) A toast/alert: announced once; if it has an action, it can be reached. (7) Images and charts: the alt says what it contributes; the chart has its table or description.

**Zoom and reflow — 3 min.** (1) Browser zoom at 200 % (a 1280 px window): nothing cut or overlapped; everything operable. (2) Zoom at 400 % (or a 320 px window): one scroll direction only (except tables/maps); the menu converts and works; what is fixed covers no more than a quarter of the screen. (3) Text only at 200 % (Firefox: View → Zoom → Text only): no clipped text in buttons or cells. (4) System “reduce motion”: nothing moves or scales; fades stay. (5) The system's high-contrast mode (Windows): the borders of controls, focus and states are visible.

## 13. Typical errors of AI-generated UI (IA)

Each rule is an `rg` that exits 0 or a list to justify; the underlying rule is in the topic cited. The pipes are escaped for Markdown (`\|`); in the terminal they go without the slash.

| ID | Pattern | Command | Underlying rule |
|---|---|---|---|
| **A11Y-IA-01** | A clickable `div`/`span` | `rg -n '<(div\|span\|li\|img)\b[^>]*\bon(Click\|click)=' src/` | SEM-01 |
| **A11Y-IA-02** | An `<a>` with no `href`, or `href="#"`/`javascript:` used as a button | ``rg -n -P '<a(?![^>]*href=)[^>]*on(Click\|click)\|href="(#\|javascript:[^"]*)"' src/`` | SEM-01 |
| **A11Y-IA-03** | Redundant or contradictory ARIA: a `role` equal to the native one, an `aria-label` that overrides different visible text, `aria-hidden` on a focusable | `rg -n '<button[^>]*role="button"\|<a[^>]*role="link"\|aria-hidden="true"[^>]*(href\|tabindex="0")' src/` | SEM-09, SEM-03 |
| **A11Y-IA-04** | `outline: none` / `outline-0` / `focus:outline-none` with no ring of its own | `rg -n 'outline:\s*(none\|0)\|focus:outline-none\|outline-none' src/` each with `focus-visible:ring` or `:focus-visible` | KBD-03 |
| **A11Y-IA-05** | Placeholder as label | `rg -n 'placeholder=' src/ -l` crossed per file with `rg -n '<label\|aria-label'` | FRM-01 |
| **A11Y-IA-06** | An icon-only button with no name (`<button><svg/></button>`) | ``rg -n -U '<button[^>]*>\s*<(svg\|[A-Z]\w*Icon)[^>]*/?>\s*</button>' src/`` each with `aria-label` | SEM-02 |
| **A11Y-IA-07** | Light grays for text (`text-gray-400`, `text-slate-400`, `#999`, `#aaa`, `opacity-50` on text) | `rg -n 'text-(gray\|slate\|zinc\|neutral\|stone)-(300\|400)\|color:\s*#(9\|a\|b\|c)[0-9a-f]{2}\b' src/` (gray-400 on white is 2.54:1) | COL-01 |
| **A11Y-IA-08** | A hand-made modal with no focus trap, no Esc, no return, or with `tabindex` on a `<dialog>` | `rg -n 'role="dialog"\|className=.*(modal\|Modal)' src/ -l` each is a `<dialog>`/primitive or has the KBD-07 test | KBD-07 |
| **A11Y-IA-09** | A toast/notification that creates the region together with the text (not announced) or an error that dismisses itself | `rg -n 'aria-live\|role="(status\|alert)"' src/` inside components that mount conditionally (`&&`, `v-if`, `{#if}`) | SR-01, APG-08 |
| **A11Y-IA-10** | A positive `tabindex` | `rg -n 'tabindex="[1-9]\|tabIndex=\{[1-9]' src/` | KBD-02 |
| **A11Y-IA-11** | Headings made with style (`<div class="text-2xl font-bold">`) | `rg -n '<(div\|p\|span)[^>]*class(Name)?="[^"]*text-(xl\|2xl\|3xl\|4xl)[^"]*font-(bold\|semibold)' src/` | SEM-05 |
| **A11Y-IA-12** | `role="menu"` on navigation, or a tooltip with essential information / as the only name | `rg -n 'role="menu' src/`; `rg -n '<Tooltip' src/` review | APG-03, APG-06 |
| **A11Y-IA-13** | Animations with no `prefers-reduced-motion` | `rg -n '@keyframes\|animate-\|motion\.' src/ -l` against `rg -n 'prefers-reduced-motion\|useReducedMotion' src/ -l` | MOV-01 |
| **A11Y-IA-14** | A data table made with `div` + grid | `rg -n 'grid-cols-[0-9]+' src/` in lists: is it a table? | TAB-01 |
| **A11Y-IA-15** | `user-scalable=no` or `maximum-scale=1` in the viewport | `rg -n 'user-scalable\s*=\s*no\|maximum-scale\s*=\s*1' src/ public/` (axe `meta-viewport`) | RSP-02 |

The 15 rules of most impact for an agent, in order of frequency on the real web (B19): SEM-01/IA-01, COL-01/IA-07, SEM-02/IA-06, FRM-01/IA-05, SEM-07, KBD-03/IA-04, KBD-07/IA-08, SR-01/IA-09, SEM-09/IA-03, FRM-03/FRM-04, RSP-04, KBD-04, KBD-06, APG-07, PRO-03/PRO-04.

## Sources

- B1 — WCAG 2.2, W3C Recommendation, 5 October 2023; what is new — https://www.w3.org/TR/WCAG22/ · https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- B2 — Understanding WCAG 2.2 — https://www.w3.org/WAI/WCAG22/Understanding/
- B3 — WCAG 3.0, Working Draft — https://www.w3.org/TR/wcag-3.0/
- B4 — WAI-ARIA 1.2, W3C Recommendation 2023 — https://www.w3.org/TR/wai-aria-1.2/
- B5 — ARIA Authoring Practices Guide (APG) — https://www.w3.org/WAI/ARIA/apg/ · https://www.w3.org/WAI/ARIA/apg/patterns/
- B6 — Using ARIA (Discontinued Draft, 24 February 2026) — https://www.w3.org/TR/using-aria/
- B7 — Accessible Name and Description Computation 1.2 — https://www.w3.org/TR/accname-1.2/
- B8 — EN 301 549 (V3.2.1; V4.1.1 published 2 September 2026) — https://nda.ie/news/en301549-published · https://www.etsi.org/
- B9 — European Accessibility Act, Directive (EU) 2019/882 — https://eur-lex.europa.eu/eli/dir/2019/882/oj/eng
- B10 — Section 508 (Revised 508 Standards) — https://www.section508.gov/develop/applicability-conformance/
- B11 — Argentina: Ley 26.653, Decreto 656/2019 and Disposición ONTI 6/2019 — https://servicios.infoleg.gob.ar/infolegInternet/anexos/175000-179999/175694/norma.htm · https://www.argentina.gob.ar/normativa/nacional/329284/texto · https://www.boletinoficial.gob.ar/detalleAviso/primera/217000/20190920
- B12 — VPAT 2.5Rev (ITI, April 2025) — https://www.itic.org/policy/accessibility/vpat
- B13 — W3C, “Developing an Accessibility Statement” — https://www.w3.org/WAI/planning/statements/
- B14 — PDF/UA: ISO 14289-1 and ISO 14289-2:2024; veraPDF — https://pdfa.org/iso-14289-2-pdf-ua-2-the-gold-standard-for-accessibility-in-pdf-2-0-has-arrived/ · https://docs.verapdf.org/cli/validation
- B15 — axe-core (Deque): README, rule descriptions, API — https://github.com/dequelabs/axe-core · https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md
- B16 — Deque, “Automated testing study identifies 57 percent of digital accessibility issues”, 2021 — https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/
- B17 — GDS (GOV.UK), “What we found when we tested tools on the world's least-accessible webpage”, 2017 — https://accessibility.blog.gov.uk/2017/02/24/what-we-found-when-we-tested-tools-on-the-worlds-least-accessible-webpage/
- B18 — GOV.UK Service Manual: testing for accessibility; testing with assistive technologies — https://www.gov.uk/service-manual/helping-people-to-use-your-service/testing-for-accessibility · https://www.gov.uk/service-manual/technology/testing-with-assistive-technologies
- B19 — WebAIM Million 2026 — https://webaim.org/projects/million/
- B20 — WebAIM Screen Reader User Survey #10 — https://webaim.org/projects/screenreadersurvey10/
- B21 — Playwright, “Accessibility testing” — https://playwright.dev/docs/accessibility-testing
- B22 — Adrian Roselli, articles on modals, disclosure widgets, menus, tables and cards — https://adrianroselli.com/2025/06/where-to-put-focus-when-opening-a-modal-dialog.html · https://adrianroselli.com/2020/05/disclosure-widgets.html · https://adrianroselli.com/2017/10/dont-use-aria-menu-roles-for-site-nav.html
- B23 — Heydon Pickering, *Inclusive Components* [NV most of the index] — https://inclusive-components.design/menus-menu-buttons/
- B24 — Sara Soueidan: “Accessible Icon Buttons”; “Accessible notifications with ARIA Live Regions” — https://sarasoueidan.com/blog/accessible-icon-buttons/ · https://sarasoueidan.com/blog/accessible-notifications-with-aria-live-regions-part-1/
- B25 — Léonie Watson / TetraLogical: live regions, form validation, session timeouts, low vision — https://tetralogical.com/blog/2024/05/01/why-are-my-live-regions-not-working/
- B26 — GOV.UK Design System: error message, error summary, validation, text input — https://design-system.service.gov.uk/components/error-message/ · https://design-system.service.gov.uk/components/error-summary/ · https://design-system.service.gov.uk/patterns/validation/
- B27 — Marcy Sutton / Fable, accessible client-side routing user testing (Gatsby, 2019) — https://v2.gatsbyjs.com/blog/2019-07-11-user-testing-accessible-client-routing
- B28 — React Aria, Drag and Drop — https://react-aria.adobe.com/dnd
- B29 — Cloudscape drag and drop; Salesforce UX “4 Major Patterns for Accessible Drag and Drop” [NV the four patterns] — https://cloudscape.design/patterns/general/drag-and-drop/
- B30 — MDN, `<dialog>` — https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
- B31 — W3C WAI Tutorials: images; Easy Checks — https://www.w3.org/WAI/tutorials/images/decision-tree/ · https://www.w3.org/WAI/test-evaluate/preliminary/
- B33 — Android “Make apps more accessible”; Apple HIG accessibility [NV Apple] — https://developer.android.com/guide/topics/ui/accessibility/apps · https://developer.apple.com/design/human-interface-guidelines/accessibility
- B34 — Email Markup Consortium accessibility reports 2025 and 2026 [V-sec] — https://emailmarkup.org/

## Not verified

- The normative texts of 2.1.4, 2.2.1, 2.3.1, 1.3.4, 3.3.4 and 3.1.5 (their Understanding pages were not opened): the rules cite the number and the general sense.
- Apple HIG (a JS page), Microsoft's persona spectrum, the index of *Inclusive Components* (DNS), Léonie Watson's screen reader commands post (404), the four Salesforce patterns.
- EN 301 549 in its text (an unreadable PDF); the dates and the baseline come from the Irish NDA.
- Article 32 of the EAA (the 2030 date); the Email Markup Consortium figures (secondary only).
- Whether the browser returns focus on closing a native `<dialog>`; `toMatchAriaSnapshot` and `page.clock` depending on the installed Playwright version; the NVDA/VoiceOver shortcuts cited.
- The px equivalence of “large text”; whether axe has any rule for 1.4.11.
- The web accessibility law of the City of Buenos Aires.
- None of the example commands was run.
