# GST-208 · customer search

status: proposed
cap: 45 min
sources: description, comments (4), attachment acceptance-criteria-v3.xlsx
not_read: attachment mockups.fig (could not be opened)

<!-- The card's single document. Headings are in English: the tools read them. The text is in the repo's language.
     Lines starting with `- S`, `- T` and `- L` are read by risk.mjs and verify.mjs: keep their shape. -->

## Specs

Each spec quotes a sentence or criterion of the card verbatim. A test carries its tag: `@GST-208-S1`. One behavior per spec: past 500 characters of its own text (the quote does not count) `plan.mjs` asks to split it, or `declared · long-spec · S<n> · <why it is one>`.

- S1 · "Search customers by partial company name"
- S2 · "Results show tax ID and status" · state: loading, empty
- GST-208-ASM-01 · the search is by prefix, not by substring (the cheapest to undo) · S1

## Tasks

`T<n> · <specs> · <files> · tests: <file> "<title with its tag>"`: one line per group of files; several tests are separated with `;`. Every `S#` and every `ASM-NN` has its planned test in some T line (risk.mjs refuses a plan without it, and does not write risk.json). A card's tests go in files that hold no earlier card's tagged tests: those are frozen. A test of an earlier card that this card contradicts is replaced in a new file whose title carries the replaced test's tags (L3).
Paths are feature-first, layers inside: `src/modules/<feature>/{presentation,domain,data}/…` (`lib/features/<feature>/…` in Flutter), `application/` for a use case that orchestrates, a small `shared/` kernel; `risk.mjs` refuses a new file under a top-level folder by layer or by kind (`domain/`, `screens/`, `services/`…) or outside its layer folder. Names are in English unless CLAUDE.md declares `Code language:`. The simplest structure that works: no use case that only forwards; a factory, strategy, adapter, bus or `I<Name>` interface file carries `why-layer: <the second variant it serves, or the test fake that needs it>` and `risk.mjs` refuses it without one: otherwise drop it. Where the card adds persistence, dependency injection, validation, auth, a client or a queue, the plan names the library per category (the repo's own, else the stack's default in `.claude/stacks/`); hand-rolling one is an `ASM`. A file carries its layer in parentheses: `(rule)` domain, no I/O (validation and calculations are pure and live here), `(data)` the only place with SQL or db access, `(presentation)` a screen. The gate's `layers` check reads them. The logic of a screen (validation, messages, payload) goes in a pure `presentation/<name>-state.js` that `node --test` imports and `mutate` covers; the DOM file only wires it.
Every task that writes production code carries, indented under its T line, what it found when it searched the module and `shared/` before writing: `reuses: <file> <symbol it uses or extends>`, or `new: <what you searched and why nothing fits>`; `risk.mjs` refuses it without one of the two. A task that builds a screen names the component set there (`reuses: design/components/<file> <the components it composes>`, `record.html` for a card with `## Information`), or, in a repo with shadcn, the registry items it installs (`@shadcn/table`, `@coss/dialog`…) or its `components/ui/` files; if the repo has no set, a task of the card copies it from the kit's component templates (module ui).

- T1 · S1 · src/modules/customers/domain/search.mjs (rule), test/customer-search.test.mjs · tests: test/customer-search.test.mjs "search by partial name @GST-208-S1"; test/customer-search.test.mjs "search by prefix @GST-208-ASM-01"
  new: no search over a name exists (Grep search|match|filter in customers and shared/)
- T2 · S2 · src/modules/customers/presentation/customers.routes.mjs (presentation), src/modules/customers/data/customers.repository.mjs (data), test/customer-results.test.mjs · tests: test/customer-results.test.mjs "results show tax ID and status @GST-208-S2"
  reuses: src/shared/format.mjs formatTaxId

## Changes to existing behavior

A route, screen or file of main that this card changes, one line each, with the earlier test it affects; `none` if the card only adds.

- GET /api/customers · the list now takes `q` · test/customers.test.mjs "list all @GST-190-S1" stays valid

## Look

Only with the lens `visual`, 15 lines or fewer; risk.mjs refuses the plan without the four keys. `ref:` is the design the card brings (Figma, a capture) saved in `specs/<card>/ref/`, or a URL; if the card brings none, it comes from the repo's design system or `.claude/reference/design-refs.md` (profile web; a product of that level, never «the simplest» or «the cheapest to undo») and is declared as an `ASM`. One reference of the same field gives the structure; one or two lateral ones from other fields (`### Lateral` of that gallery) give the trait of excellence. A product screen (a dashboard, a list, a tool) declares `ref-kind: product`: its references are real product UI (`reference/design-refs.md`), the capture refuses a login or marketing page, `design-round --kind` measures it with the `product:` rows, and `brand-chrome: glass, gradient` lists the surfaces the brand itself asks for. A landing also declares `ref-genre: <genre>` (see the gallery) and its `ref:` is of that genre. An optional `intent: collage|statement|grid|pinned-media` says what a section family is on purpose; under it the focal, competing, axes and elements measures of `design-round` are reported, never flagged (`reference/composition.md`). An optional `generator: <name>` names the image or video API or external CLI the card may spend on; tools of the session and local models need no line (`design-taste-frontend` `references/generation.md`). `tokens:` states mood and genre, spacing and easing; it fixes font families or a palette only when the brand or the requester gives them: the designer chooses them after looking at the references, in `## Direction` of `rondas.md`, and departs from the genre's cliché. `copy:` is the concrete number of the offer and who speaks (`reference/copy.md`); template phrases are listed there too. A card that only takes something off a screen (a notice, an error screen) writes `remove-only: <what goes>` instead of the four keys: no `ref:` and no design rounds, the states and accessibility lines still run on what remains, and the gate fails if its presentation files gain more lines than they lose. A card whose requirement asks for a screen and names no look, reference, brand, design or landing writes `plain: <why>` instead: the screen takes the repo's styles (plain semantic HTML when there are none), with no `ref:`, designer, design rounds, brand sheet, design line, component set or critique; the states and accessibility lines still run.

- ref: specs/GST-208/ref/search.png · https://linear.app/issues
- behavior: load · the rows enter in a 60 ms stagger, once
- behavior: cursor · a row lifts 2 px on hover; the buttons answer to press and focus
- behavior: view · the table enters once, on first sight
- behavior: loading, empty · skeleton with the shape of a row; the empty state offers the action
- tokens: mood warm, artisanal · genre drink-food · spacing 4 8 12 16 24 32 · easing out cubic-bezier(.22,1,.36,1) 200 ms (or: the repo's, in <path>)
- copy: 1,884 events in 13 days · the brand speaks in first person, one quote from a named attendee

## Information

Only for a product screen (`ref-kind: product`); risk.mjs refuses it without this section. A dense screen is hard because of what it shows and where: list what the user decides on it and, per field, the decision it serves and its tier, so the screen gives the most value without burying it. `glance` is seen without interaction (the fields of D1, the main decision, in the first viewport), 7 at most per decision; `detail` is one interaction away (a tab, a disclosure, a drawer); `audit` stays out of the first view (ids, who changed what). A field no decision needs is `audit` or leaves the screen. What can go wrong is named too, because the user came to find it: `signal:` lists the states that block a decision as the screen writes them (a policy not met, a missing document) with their tone, and a field a rule bounds carries `· limit: <op> <number>`; a screen where nothing can go wrong says so with `declared · signals · <why>`. The label is written as the screen shows it: `ia-check.mjs` (the `ia:` line) finds each field by it and measures the tiers, that the fields of D1 stay in view on a long record, that a value stands out from its label, that each signal state and each value past its limit is toned and one of them is in the first viewport, that the fields of one decision sit together, numbers right-aligned, tabular data in a table and one spacing scale.

- decision: D1 · open the right customer · who: sales rep
- decision: D2 · see who needs a follow-up · who: sales rep
- signal: Blocked, Overdue · danger
- Company name · D1 · glance
- Tax ID · D1 · glance
- Status · D1,D2 · glance
- Days since last contact · D2 · glance · limit: ≤ 30
- Billing address · D1 · detail
- Created by · - · audit

## Gate

One command per line, as verify.mjs runs them: `suite:`, `lint:`, `mutate <file>: <suite>`, `app:`, `probe:`, `attacks:`, `overflow:`, `ia:` (a product screen). A `mutate` line per logic file of `## Tasks` (`(rule)`, `(data)`, a `*-state.js`) with the node tests that import it; never the DOM wiring or `main`. `overflow: node .claude/tools/overflow.mjs [--only <selector>]` (profile web) measures the page on load; a state's text is measured by its `probe`. `suite:` runs the tests the card can break, `{affected}` standing for them (`node --test {affected}`, `npx vitest run {affected}`, `pytest {affected}`, `flutter test {affected}`); the whole suite runs once in the CI of the PR, which `/close` waits for. `refactor-tests: <why>` lets a mechanical change edit frozen tests in place; the close lists each for a person. With `app:`, verify.mjs starts the app once and brings it down at the end; every line gets `APP_URL`, `PORT` and `DATA_DIR` in its environment (`$APP_URL`, `${APP_URL}` and `%APP_URL%` also work in the text, in any shell), and `attack.mjs`, `overflow.mjs`, `motion-audit.mjs` and `app.mjs probe` take the URL from `APP_URL` when none is given.
`no-visual: <why>` declares that the card touches code files that build markup (an HTML string in a `.py`) without changing what a screen shows: the `visual` lens stays off while no `## Tasks` file is a view, and the gate fails if the card's diff changes a markup line of those files. `no-docs: <why>` declares a card that changes no behavior: without it, with the `docs` module on and from mvp, the `docs` check wants the feature page, the contract and the data model the card touched (`templates/docs.md`, module docs); with the module off nobody writes docs. `public-allow: <file glob> [<kind>] · <why>` lets a line the public bar flags stay (kinds: secret, path, email, host, debug, commented-code, todo, trace; a sample key in a fixture, a CLI that prints); `public-skip: <the user's words>` turns the bar off for the card and is written only when the user's last message orders it.
Planned here, before the code, so the gate and the judge find them done: a screen (lens `visual`) has one `probe <state>:` line for each state a spec names (`state: …`), the transient ones with the route held (`--route "GET /api/x=hold"`). An API (lens `contract`) must have the `attacks:` line; `--body-limit` is the limit the card sets, in bytes; `--common-headers` the headers every response carries, `--unique` the write that must answer a duplicate, `--search` a read with a free-text parameter, `--fault-db` the database file to damage, `--openapi` the contract to compare (every flag and rule id: `.claude/skills/http-attack/SKILL.md`, profile backend).
The steps of a `probe` can press Enter from each control and type markup: `[{ "enter-each": "form" }, { "type-markup": "input[name=q]" }]`; `--enter-skip` lists the controls where Enter does not submit.

```
suite: node --test {affected}
fmt: npx prettier --check .
lint: npx eslint src test
mutate src/modules/customers/domain/search.mjs: node --test test/customer-search.test.mjs
app: node src/main.mjs
probe loading: node .claude/tools/app.mjs probe steps/loading.json --axe --contrast "[role=status]" --route "GET /api/customers=hold" --out .validation/probe/loading
probe empty: node .claude/tools/app.mjs probe steps/empty.json --axe --contrast "[role=status]" --out .validation/probe/empty
probe typed: node .claude/tools/app.mjs probe steps/typed.json --enter-skip "textarea" --out .validation/probe/typed
attacks: node .claude/tools/attack.mjs --json --body-limit 1024 --write "POST /api/customers name=Ana" --read "/api/customers" --common-headers "content-type, cache-control" --unique "POST /api/customers name=Ana" --search "/api/customers q" --fault-db $DATA_DIR/customers.db --openapi openapi.json
overflow: node .claude/tools/overflow.mjs
ia: node .claude/tools/ia-check.mjs specs/GST-208-customer-search
```

## Log

L1 is the requirement, verbatim and whole. Then one line per answer from Jira, decision or evidence. A frozen test of an earlier card that this card contradicts is declared before building: `Grep` its `@<ID>-S` tags in the files the Tasks touch. A line is appended with `node .claude/tools/log.mjs specs/<card> "<text>"`, which numbers and dates it.

- L1 · Search customers by partial company name. Results show tax ID and status. <rest of the card as written>
- L2 · 2026-08-31 · Jira answer: …
- L3 · 2026-09-01 · replaces: test/search.test.mjs "search is exact @GST-190-S2" · S1 asks for partial match · by: test/customer-search.test.mjs "search by partial name @GST-190-S2 @GST-208-S1"
