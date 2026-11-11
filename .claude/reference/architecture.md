# Modular architecture, TDD and the fast lane: rules a card can meet and a reviewer can check

**When it is read:** when the card adds a module, a boundary, an external library, a
component or a test strategy, or when the card is a candidate for the fast lane. **How:** only the
sections the card touches, with `Read` and a line range of the heading; never whole. `card.md` names
the rule IDs that apply, and the `builder` receives those IDs and their ranges. This reference
does not replace `rules/architecture.md`: the rule is short and loads by itself by path; this is the
bibliography with IDs, and the rule cites it. **The tools are options, not obligations.** **[NV]
marks guidance not verified**: a hypothesis, never the only evidence of a `meets`; **[V sec]** was
checked in a secondary source that quotes the primary one. How each rule is checked: `J` judgment
with written evidence, `C` a command that exits 0 or not, `T` an automated test. The examples assume
code under `src/`, tests next to the code or under a tests folder, and Vitest/Jest: adjust the paths to
the stack. Source numbers `Bn` are in Sources. None of the example commands was run.

What the kit already covers is not repeated: the direction of dependencies (D2), no cycles (D3), deep
modules (D4), one knowledge in one module (D5), no speculative generality (D6), tests first (T1),
no softened tests (T2), mutation over the new lines (T3), behavior and not implementation (T5), business
rules without a browser (T9), a proportional diff (A5) and the whole previous suite (C3). The rules
below say what they add to those.

## Rules that are criteria

| Rule | Criterion |
|---|---|
| ARQ-01, ARQ-02 | D1 |
| ARQ-03, ARQ-12 | D2 |
| ARQ-05 | D3 |
| ARQ-11 | D11 |
| ARQ-04, ARQ-09 | D12 |
| ARQ-13, ARQ-14 | D13 |
| ARQ-07 | D15 |
| ARQ-10 | O8 |
| TDD-01 | T10 |
| TDD-02, TDD-04, TDD-10 | T1 |
| TDD-03 | T4 |
| TDD-05 | T5 |
| TDD-06 | T9 |
| TDD-07 | C4 |
| TDD-08 | C3 |
| TDD-09, LANE-01, LANE-02, LANE-03, LANE-04, LANE-05, LANE-07, LANE-08 | T14 |
| LANE-06 | T2 |

The rules outside this table are judgment or guidance, with no criterion of their own.

## 1. Decoupling and modular architecture (ARQ)

**ARQ-01** — Before splitting into modules, list in the plan the decisions that are likely to change (payment provider, export format, pricing rule, search engine) and assign each to a single module that hides it. · How J+T · criterion D1 · Check: for each listed decision the reviewer answers “if it changes, how many modules are edited?”; more than one is information leakage. node-ts: the plan says “CSV export format → `src/export/csv.ts`”; `rg -l "split\(';'\)|\.join\(';'\)" src/` returns only that file. Generic: a “decision → owner module” table in the plan; a grep of the technical vocabulary of the decision (SDK name, format) falls in one directory · Source B1, B7 [V sec].

**ARQ-02** — Split by business capability (vertical slices: `src/modules/customers/`, `src/modules/orders/`), not by technical layer at the top level (`controllers/`, `services/`, `repositories/`, `domain/`, `application/`, `infrastructure/`); the layers live inside each module and only a small `shared/` kernel is at the top. `plan.mjs` refuses a `## Tasks` file under a top-level layer folder. · How C+J · criterion D1 · Check: the top-level directories under `src/` are domain names: `ls src/` gives `customers/ orders/ shared/`, and inside `customers/` its layer folders (`{presentation,domain,data}`, each when it holds something). A CRUD of a single entity keeps the folders but no ports, use cases or adapters (do not turn a CRUD into hexagonal) · Source B11, B5, B1.

**ARQ-03** — What crosses a boundary outwards are simple data structures in the inner circle's shape: no ORM entities, no framework request/response objects, no SDK types. · How C · criterion D2 · Check: the interface and application layers import no ORM or SDK types; the domain receives no `Request`. dependency-cruiser `{ name: 'no-orm-outside-infra', severity: 'error', from: { path: '^src/[^/]+/(domain|application|http)/' }, to: { path: 'node_modules/(sequelize|typeorm|@prisma/client|mongoose)' } }`; ArchUnit `noClasses().that().resideInAPackage("..domain..").should().dependOnClassesThat().resideInAPackage("javax.persistence..")`. D2 covers the direction; this covers the **content** of the boundary · Source B2.

**ARQ-04** — Each module exposes a single contract (its public index); nobody imports its inside. · How C · criterion D12 · Check: a rule that forbids deep imports between modules. dependency-cruiser `{ name: 'only-public-index', severity: 'error', from: { path: '^src/([^/]+)/' }, to: { path: '^src/([^/]+)/.+', pathNot: ['^src/$1/', '^src/[^/]+/index\\.ts$'] } }` [NV: the use of `$1` in `pathNot` of `to` was not tried this session]; or ESLint `no-restricted-imports` with patterns `../*/infra/*`; generic `internal`/private packages (Go `internal/`, Java JPMS `exports`, .NET `internal`) · Source B11, B12.

**ARQ-05** — Break each cycle by inverting the dependency (the one that changes less defines the port) or extracting what is shared to a third module; never with a deferred import or a `require` inside the function. · How C · criterion D3 · Check: `npx depcruise src --config` with a `no-circular` rule at `error`; ``rg -n "await import\(|require\(" src/ --glob "!**/*.config.*"`` reviewed; ArchUnit `slices().matching("..(*)..").should().beFreeOfCycles()`. D3 demands 0 cycles; this forbids the “solution” that hides it from the tool · Source B3 [V sec].

**ARQ-06** — Depend in the direction of stability: a module many depend on (`shared`, `domain`) imports no volatile one (UI, integration); measure I = Ce/(Ca+Ce) when the repo has more than about 5 modules. · How C · criterion none · Check: the importer's I is at least the imported one's; node-ts `npx depcruise src --metrics --output-type metrics` and a rule `{ to: { moreUnstable: true } }` [NV option name]; JDepend / NDepend report I, A and D. Low priority in small repos: with 3 layers D2 already implies it · Source B3 [V sec].

**ARQ-07** — Every SDK, API or third-party service that embodies a decision that can change (payments, email, storage, maps, AI) is used only from an own, thin adapter that speaks the domain's language; if the external model has other semantics, the adapter is an anti-corruption layer that translates and does not decide. The adapter is a **module** with domain names; an interface type only if there is a test fake (the D6 exception) or a second implementation. · How C+J · criterion D15 · Check: the package import appears in a single directory and the adapter has no business rules: `rg -l "from 'stripe'" src/` gives only `src/payments/infra/stripe-gateway.ts`, or dependency-cruiser `{ name: 'stripe-only-in-adapter', severity: 'error', from: { pathNot: '^src/payments/infra/' }, to: { path: 'node_modules/stripe' } }`. Does **not** apply to the standard library, the chosen framework nor the primitives of the adopted design system (wrapping every button is indirection with no decision to hide: D6). `rules/architecture.md` #3 and D8 cover part of it; the **confinement** of the SDK to one file was not asked · Source B4, B6, B14 [V sec].

**ARQ-08** — Do not mock types that are not yours: domain tests use a fake of your port; the adapter is tested with integration against the real one, a sandbox or the fake the provider publishes. · How C · criterion none · Check: no unit test outside `infra/` mocks a third-party package: ``rg -n --pcre2 "vi\.mock\('(?!\.)|jest\.mock\('(?!\.)" src/ --glob "!**/infra/**"`` returns 0; generic Mockito/Moq over SDK classes outside the adapter's test is a failure · Source B14 [V sec].

**ARQ-09** — Between modules only weak and local connascence: of name or type through the contract; no meaning (shared magic values), position (more than about 3 positional parameters) nor duplicated algorithm across modules. · How C+J · criterion D12 · Check: business literals defined once in the owner's contract; public module functions with 3 parameters or fewer or a named object: ESLint `max-params: ["error", 3]` over `src/*/index.ts`; `rg -n "'(pending|approved|rejected)'" src/` only in the owner module; generic: enums/constants exported by the owner, named parameters · Source B9.

**ARQ-10** — Start as a modular monolith; extracting a module to a separate service requires writing in the plan the concrete reason (scale, deployment or an independent team) and that the module already meets ARQ-04 and ARQ-11. · How J · criterion O8 · Check: the plan names the reason; without a reason there is no new service. node-ts: a single deployable `package.json` with modules in `src/`; a new workspace with its own server needs the paragraph in the plan · Source B10, B11.

**ARQ-11** — Each module writes only its own data; the others obtain it through its contract (a direct call to its facade or an event), not by reading its tables. · How C+J · criterion D11 · Check: see DB-OWN-01, DB-OWN-02 and DB-OWN-05 in `reference/database.md` (module data), and the “table → owner module” table of `system-design.md`, which the architecture test reads · Source B11.

**ARQ-12** — Every architecture property the plan states has an automatic fitness function in the default test command: direction, cycles, public index, SDK confinement. · How C · criterion D2 · Check: `npm test` (or `npm run check`) includes `depcruise`; breaking a rule on purpose in a local branch fails the command. node-ts `"test": "depcruise src --config .dependency-cruiser.cjs && vitest run"`; ArchUnit/NetArchTest/import-linter in the suite; in legacy, `FreezingArchRule` so that only the new violations count. D2 asks it for the direction; this extends it to ARQ-03, ARQ-04, ARQ-05 and ARQ-07 · Source B8, B12.

**ARQ-13** — In the UI each state has a single owner: data go down through props, changes go up through callbacks or events; a component does not mutate what it receives nor read a sibling's internal state. · How C+J · criterion D13 · Check: a props-mutation linter and a review of state duplicated between components; node-ts (React) props typed `Readonly<Props>`, ESLint `react/no-direct-mutation-state`; Vue `vue/no-mutating-props` [NV exact React rule name]; generic “props down, events up”: shared state is lifted to the common ancestor or to a store with a single module that writes · Source B13.

**ARQ-14** — A Web Component or isolated component exposes as its public API attributes/properties and a `CustomEvent` with a typed `detail`; it decides on purpose `bubbles` and `composed` and documents it; nobody enters another component's `shadowRoot` or internal DOM. · How C+T · criterion D13 · Check: ``rg -n "shadowRoot\.querySelector|\.shadowRoot\." src/`` only inside the component itself; a test dispatches the action and listens for the event on `document` (if it must leave) or on the host (if not); node-ts `this.dispatchEvent(new CustomEvent<{ id: string }>('item-select', { detail: { id }, bubbles: true, composed: true }))`; in frameworks with no shadow DOM, no `ref` to another component's internal DOM and no global selectors over its markup · Source B13.

**ARQ-15** — A solved problem uses the stack's library, not hand-written code: persistence is an ORM or query builder with migrations, dependency injection is the framework's DI or a container, validation is a schema library; also authentication, dates, the HTTP client and queues. The repo's existing choice wins; the default per stack is in `stacks/<stack>.md`. The library sits in the module's `infrastructure/` (or the composition root) behind domain names (ARQ-07). · How J · criterion none · Check: the plan names the library per category; a hand-written SQL mapper, a registry of singletons or a home-made validator without an `<ID>-ASM-NN` that says why is a finding. A one-function utility is still DEP-01's case, not this one · Source clean architecture practice (Martin), framework documentation.

## 2. TDD and test strategy (TDD)

**Where TDD pays and where it does not, according to the evidence.** The evidence is mixed and it is cited as it is. In industrial teams TDD is associated with far fewer pre-release defects at a moderate perceived initial cost (Nagappan 2008: 40–90 % lower defect density and a perceived +15–35 % initial time, four cases, not randomized [V sec]; B18). The aggregate effect on quality is small and productivity does not move conclusively; in academic studies against iterative test-last it can come out worse (the Rafique and Mišić 2013 meta-analysis; abstract not opened [V sec]; B20). What explains the benefit is the **small, uniform step**, not the test-first order (Fucci 2017, 39 professionals, B19 [V]). For an LLM, receiving the tests together with the statement improves the hit rate (B21, B22; verified in function benchmarks, not measured in real repos), and with human-written tests a bounded agentic flow solves almost all of SWE-bench Lite: the hard part is **writing the right reproduction test** (B23 [V]). For an agent the order matters for another reason: a test frozen before the code stops the agent from adjusting it to its implementation (the kit's T1/T2, measured by the kit, not from the human TDD literature); and if the test is written after, the expected value comes from what the code returns (80.2 % of weak oracles, already cited in T4). Mutation over the diff makes better tests get written and catches real failures (Google, millions of mutants, B24 [V]).

**Conclusion.** TDD contributes where there is specifiable behavior with an oracle independent of the code: business rules, calculations, validations, transformations, reproducible bugs, contracts between modules. For an agent it also contributes as an **executable specification and an anti-cheating anchor**, the main reason in this method. It contributes little or nothing —and another verification fits better— in visual and layout exploration, throwaway spikes, wiring and configuration without logic, texts and styles (capture plus accessibility plus the existing suite), and where the only possible test repeats the implementation (a change-detector). This is why the method makes the unit test first **mandatory for domain code with rules or calculations** (the `rule` word in the File map line, criterion T13) and optional elsewhere: the outer cycle is already test first (frozen red scenarios, T1) and the mutation of the new lines (T3) measures what TDD promises.

**TDD-01** — Write first the list of scenarios of the requirement, in the language of behavior, with no implementation decisions; turn one at a time into a test. · How J · criterion T10 · Check: the plan's list names no classes, tables or functions; each new test maps to an item. node-ts `describe('customer signup')` → `it('rejects a tax id with an invalid check digit')`; in BDD, one `Scenario` per item. T10 and V2 cover the list; the new part is the ban on mixing design into it · Source B15 [V].

**TDD-02** — The new test has to fail for the right reason before the code is written: the error is the behavior's assertion, not a broken import, a missing type or a timeout. · How C · criterion T1 · Check: run the test in red and keep the output; it must contain the `AssertionError`/`expected … received`, not `Cannot find module`, `is not a function` or `TS2307`. node-ts `npx vitest run test/customers.test.ts 2>&1 | rg -q "AssertionError|expected" && ! rg -q "Cannot find module|is not a function"`; the symbols the test needs exist as a stub that returns a neutral value; JUnit `AssertionFailedError`, pytest `AssertionError`, not `ImportError`/`NameError`. T1 verifies the order by commits, not the **reason** of the red: a red from a broken import turns green with any implementation that compiles · Source B15 [V].

**TDD-03** — The expected values come from the requirement or from an independent calculation, never from running the implementation and copying the output; snapshots are not created after the code as the oracle of logic. · How J+C · criterion T4 · Check: `rg -n "toMatchSnapshot|toMatchInlineSnapshot" test/` reviewed: acceptable for stable serialized output, not as the only oracle of a rule; node-ts `expect(computeVat(1000, 'A')).toBe(210)` with the 21 % quoted from the requirement, not a number read from the console; golden files only for formats (PDF, CSV) generated from a hand-written case. T4 asks for oracles that do not hold by themselves; this names the oracle's source · Source B15 (“pasting the real value as expected”) [V].

**TDD-04** — Fixing a bug starts with a test that reproduces it and fails on the commit before the fix. · How C · criterion T1 · Check: the added test fails when applied over the fix's parent commit: `git checkout HEAD~1 -- src/ && npx vitest run test/bug-123.test.ts` fails; `git checkout HEAD -- src/ && npx vitest run test/bug-123.test.ts` passes. No criterion demanded it explicitly (T1 is for the card's scenarios) · Source B23, B32 [V sec].

**TDD-05** — Mock only at the edges with systems you do not control and whose effects are seen from outside (email, payments, queues); inside the system use the real objects; do not verify sequences of internal calls. · How C+J · criterion T5 · Check: mocks of own modules (`vi.mock('../...')`) justified one by one; `toHaveBeenCalledWith` over internal collaborators is a change-detector signal; node-ts ``rg -n "vi\.mock\('\.\.?/" test/ | wc -l`` each one with a comment of why; Mockito `verify()` only over outgoing ports. T5 is judgment; this gives it the check · Source B17 [V sec], B26 [NV body], B14 [V sec].

**TDD-06** — Each behavior is tested at the lowest level that can observe it, and once: the e2e tests cover the journey, they do not repeat the rules already tested below. · How J · criterion T9 · Check: every business rule has a unit test; the scenario's e2e has no more than one assertion per rule already covered; node-ts rules in `vitest`, journey in one Playwright spec per scenario. T9 asks for rules without a browser; the new part is the non-duplication · Source B16 [V].

**TDD-07** — Between modules with different owners or deployments, the contract has a consumer-side test that the provider runs. · How T · criterion C4 · Check: there is a contract test (schema or CDC) for each API consumed by another team/service; node-ts Pact, or validation with the OpenAPI/zod schema shared on both sides. C4 (responses for existing clients do not change) had no mechanism; this is the mechanism. Does not apply to a monolith with a single team · Source B16 [V].

**TDD-08** — Before changing code that has no tests, fix its current behavior with characterization tests in a commit of their own; then change. · How C · criterion C3 · Check: a “characterization” commit that only adds tests and passes over the existing code, before the change's commit; node-ts `it('today returns null if the province is missing')` documenting what is observed, however odd; approval tests (ApprovalTests) in legacy. C3 demands the previous suite to pass, but if there is no suite there is no net; this creates it · Source B32 [V sec].

**TDD-09** — Do not write TDD tests for what has no behavior oracle (layout, aesthetics, copy, wiring of config); verify it with a before/after capture, an accessibility audit and the existing suite. · How J · criterion T14 · Check: no new test asserts CSS classes, markup structure nor the literal text unless the text is the requirement; node-ts Playwright `toHaveScreenshot()` or a manual capture at 320 px and desktop plus `@axe-core/playwright`; generic visual regression plus axe. Links with the fast lane · Source B26, B16.

**TDD-10** — Red-to-green cycles are small and even: one scenario per cycle and one commit per green scenario; if a cycle touches more than one module or takes much longer than the rest, it is split. · How C · criterion T1 · Check: `git log --stat` of the card: one scenario per commit, none mixes two. T1 looks after the order; the granularity, which is what the evidence associates with the benefit, was not asked · Source B19, B15 [V].

## 3. Fast lane (LANE)

**The definition, validated.** The fast lane is a *standard change* in ITIL's sense (a pre-authorized category with a documented procedure; the procedure is assessed and authorized when it is created or changed, not on each execution: B27 [V sec]); DORA recommends treating changes according to risk and shows no evidence that heavy approval lowers the failure rate (B29, B30); the risk of a change grows with its size and its **spread** (B34, B35 [V sec]); one-line changes fail in under 4 % of the cases in the only study that measured it (B36 [V sec], one industrial project). The 30-line / 3-file threshold is well under Google's “reasonable” 100 lines (B28 [V]): what defines the lane is the **type** of change, not the size. Seven refinements to the definition:

1. **“Move” is on screen:** moving an element on the screen yes; moving files, renaming or reorganizing code no (that is a refactor: Google separates it into another CL, B28, and it changes imports). If the movement changes the DOM order it changes the reading and focus order (B40): the keyboard test is added.
2. **“Style within tokens” is *using* existing tokens in a component.** *Changing the value* of a token or touching a global stylesheet is a high-spread change (B34, B35): it leaves the lane even if it is one line. If a color changes, the contrast check is added.
3. **Classification is by the content of the diff, not by the path.** A `.tsx`/`.vue` is presentation and logic at once: the diff adds or touches no lines with conditionals, handlers, hooks/effects, data calls, routes, nor attributes that code or tests use as a key (`data-testid`, `name`, `id`, `href`).
4. **Text exclusions:** translated texts (the change goes in every locale or it is not the lane), the visible text of a control that is its accessible name (WCAG 2.5.3, B40), texts the code compares or uses as a key, validation messages, email, notification and PDF templates, and texts the client asked for with exact wording.
5. **Replacing an asset:** the same role and proportion, a weight not greater (or justified), the `alt` updated if what it shows changes, the license declared. An icon that becomes the only content of a button needs an accessible name.
6. **Tests:** “no test modified except the literal” includes the locator by role and accessible name (kit T12) when the changed text is that name. A test that has to change for another reason takes the card out of the lane.
7. **What is not said and is needed:** a mechanism classifies over the diff, not the agent's declaration; escalation is one way (from lane to the full method, never the reverse); the requirement is frozen all the same (invariant 1); a single doubt takes it out of the lane (invariant 2); and the lane's reopening rate is measured to review the catalog (ITIL: the procedure is re-authorized when it fails; DORA: measure per category).

No evidence was found that a risk-proportional process **with agents** lowers cost without raising defects: the closest is indirect (B39: trimming context and routing by difficulty lower the cost 21–64 % without losing performance in benchmarks). The rule rests on the human evidence of DORA and of per-change risk prediction; its effect in this method remains to be measured (LANE-09).

**LANE-01** — Classify the lane with an automatic check over the diff, not with the agent's declaration: a closed list of allowed types (allow-list) and a list of paths and patterns that expel (deny-list). · How C · criterion T14 · Check: a script receives `git diff --numstat` and `git diff -U0` and returns `lane: fast` or `lane: full` with the reason (the kit has no fast lane: `risk.mjs` classifies by risk and the gate runs in every card). Sketch for a stack without the kit: exit 1 on the first trigger; deny `/\.(test|spec)\.[tj]sx?$/`, `/(^|\/)(api|domain|application|infra|migrations)\//`, `/package(-lock)?\.json$/`, `/\.env/`, `/tokens?\.(css|json|ts)$/`; logic `/\b(if|else|switch|for|while|await|fetch)\b|\buse[A-Z]\w*\(|\bon[A-Z]\w*=|=>|data-testid|href=|name=/`; plus changed lines at most 30, files at most 3, a single screen/component directory. The same scheme works in a pre-commit hook or a CI step. A5 measures size but does not classify · Source B27 [V sec], B35 [V sec].

**LANE-02** — Only four types enter: (a) non-business text, (b) visual position within the same screen, (c) style using existing tokens, (d) replacement of an asset with the same role. · How C+J · criterion T14 · Check: the plan names the type; the diff contains only that type · Source B27 [V sec].

**LANE-03** — Expelled from the lane: business texts (prices, amounts, terms, legal, consent, errors that explain a rule), translated texts in a single locale, the accessible name of a control, email/PDF/notification templates, changes to token values or global styles, `data-testid`/`id`/`name`/routes, dependencies, configuration, feature flags and any line with logic. · How C+J · criterion T14 · Check: LANE-01 covers the mechanical part; the reviewer confirms the text is not business. node-ts `rg -n "\\$|ARS|USD|%|terms|privacy|consent" <files of the diff>` as an alert · Source B33 [V sec], B40 [NV], B34, B35 [V sec].

**LANE-04** — Size: at most 30 changed lines, at most 3 files and a single screen or component; exceeding any expels. · How C · criterion T14 · Check: `git diff --numstat` summed; distinct directories counted · Source B28 [V], B34, B36 [V sec].

**LANE-05** — In the lane these stay: freezing the requirement, running the whole existing suite, lint and types, a before/after capture at 320 px and desktop of each touched screen, an axe audit of those screens, contrast if a color changed, and keyboard if the order changed; new scenario tests and mutation are omitted because there are no lines of logic. · How C · criterion T14 · Check: the captures and the axe report stay in `specs/<card>/`; node-ts `npx playwright test --grep @existing && npx playwright test lane-capture.spec.ts` with `toHaveScreenshot` in two viewports plus `AxeBuilder`. The omission of mutation depends on `tools/required.mjs` seeing there are no lines of logic [NV: how it decided at the time of the study was not reviewed] · Source B29 [V], B40 [NV].

**LANE-06** — No test is modified except the literal of the changed text and the accessible-name locator that uses it, in the same commit. · How C · criterion T2 · Check: `git diff -U0 -- '*.test.*' '*.spec.*'` contains only lines where the same literal changes as in the production diff; the kit's guard enforces it (T2 covers it in general, this bounds the only exception) · Source B26.

**LANE-07** — Escalation is one way: any trigger at any moment moves the card to the full method from the step it is at; it never goes down from the full method to the lane. · How C · criterion T14 · Check: the plan records `lane:` and, if it changed, the trigger; there is no `full → fast` transition · Source B27 [V sec].

**LANE-08** — An open ambiguity takes the card out of the lane. · How C · criterion T14 · Check: `ambiguities.md` with no `AMB-NN` (NN from 01) for cards with `lane: fast` (invariant 2) · Source B27 [V sec].

**LANE-09** — Measure the lane as a change category: percentage of cards in the lane, reopening or rework rate of those cards, and review the catalog when one fails. · How J · criterion none · Check: a record per card with `lane`, result and reopening (the kit keeps it in `specs/lane.md`); if a lane card is reopened, its pattern is added to the deny-list · Source B29 [V] (change fail rate, rework rate, measuring per category), B27 [V sec].

## Sources

- B1 — D. L. Parnas, “On the Criteria To Be Used in Decomposing Systems into Modules”, CACM 15(12), 1972 — https://doi.org/10.1145/361598.361623
- B2 — R. C. Martin, “The Clean Architecture”, 2012 — https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- B3 — R. C. Martin, component coupling principles (ADP, SDP, SAP) and package metrics [NV book content] — https://en.wikipedia.org/wiki/Software_package_metrics
- B4 — A. Cockburn, “Hexagonal Architecture”, 2005 — https://alistair.cockburn.us/hexagonal-architecture/
- B5 — E. Evans, *Domain-Driven Design*, 2003 [NV content]; M. Fowler, “BoundedContext”, 2014 — https://martinfowler.com/bliki/BoundedContext.html
- B6 — Microsoft Azure Architecture Center, “Anti-Corruption Layer pattern” — https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer
- B7 — J. Ousterhout, *A Philosophy of Software Design*, 2nd ed., 2021 [NV book text] — https://web.stanford.edu/~ouster/cgi-bin/book.php
- B8 — N. Ford, R. Parsons, P. Kua, P. Sadalage, *Building Evolutionary Architectures*, 2nd ed., 2022; P. Paul and R. Wang, “Fitness function-driven development”, 2019 — https://www.oreilly.com/library/view/building-evolutionary-architectures/9781492097532/ · https://www.thoughtworks.com/insights/articles/fitness-function-driven-development
- B9 — M. Richards and N. Ford, *Fundamentals of Software Architecture*, 2020 [NV content]; connascence.io — https://connascence.io/
- B10 — M. Fowler, “MonolithFirst”, 2015; S. Newman, QCon London 2020 reported by The Register — https://martinfowler.com/bliki/MonolithFirst.html · https://www.theregister.com/2020/03/04/microservices_last_resort/
- B11 — K. Grzybek, “Modular Monolith: A Primer” and “Integration Styles” — https://www.kamilgrzybek.com/blog/posts/modular-monolith-primer · https://www.kamilgrzybek.com/blog/posts/modular-monolith-integration-styles
- B12 — ArchUnit User Guide; dependency-cruiser rules reference — https://www.archunit.org/userguide/html/000_Index.html · https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- B13 — React “Sharing State Between Components”; Vue “Props: One-Way Data Flow”; MDN “Creating and triggering events” and `Event.composed` — https://react.dev/learn/sharing-state-between-components · https://vuejs.org/guide/components/props.html · https://developer.mozilla.org/en-US/docs/Web/Events/Creating_and_triggering_events · https://developer.mozilla.org/en-US/docs/Web/API/Event/composed
- B14 — S. Freeman and N. Pryce, *Growing Object-Oriented Software, Guided by Tests*, 2009; Google Testing on the Toilet, “Don't Mock Types You Don't Own”, 2020 — https://testing.googleblog.com/2020/07/testing-on-toilet-dont-mock-types-you.html · https://markhneedham.com/blog/2009/12/13/tdd-only-mock-types-you-own/
- B15 — K. Beck, *Test-Driven Development: By Example*, 2002 [NV content]; “Canon TDD”, 2023 — https://newsletter.kentbeck.com/p/canon-tdd
- B16 — H. Vocke, “The Practical Test Pyramid”, 2018 — https://martinfowler.com/articles/practical-test-pyramid.html
- B17 — V. Khorikov, *Unit Testing Principles, Practices, and Patterns*, Manning, 2020 — https://www.oreilly.com/library/view/unit-testing-principles/9781617296277/
- B18 — N. Nagappan, E. M. Maximilien, T. Bhat, L. Williams, “Realizing quality improvement through test driven development”, Empirical Software Engineering 13(3), 2008 — https://doi.org/10.1007/s10664-008-9062-z
- B19 — D. Fucci et al., “A Dissection of the Test-Driven Development Process: Does It Really Matter to Test-First or to Test-Last?”, IEEE TSE, 2017 — https://arxiv.org/abs/1611.05994
- B20 — Y. Rafique and V. B. Mišić, “The Effects of Test-Driven Development on External Quality and Productivity: A Meta-Analysis”, IEEE TSE 39(6), 2013 — https://doi.org/10.1109/TSE.2012.28
- B21 — N. S. Mathews and M. Nagappan, “Test-Driven Development and LLM-based Code Generation”, ASE 2024 — https://arxiv.org/abs/2402.13521
- B22 — Y. Cui, “Tests as Prompt: A Test-Driven-Development Benchmark for LLM Code Generation”, 2025 — https://arxiv.org/abs/2505.09027
- B23 — “TDFlow: Agentic Workflows for Test Driven Software Engineering”, EACL 2026 — https://arxiv.org/abs/2510.23761
- B24 — G. Petrović and M. Ivanković, “State of Mutation Testing at Google”, ICSE-SEIP 2018; “Practical Mutation Testing at Scale”; “Does mutation testing improve testing practices?”, ICSE 2021 — https://research.google/pubs/state-of-mutation-testing-at-google/ · https://arxiv.org/abs/2102.11378 · https://arxiv.org/abs/2103.07189
- B25 — C. Foster et al., “Mutation-Guided LLM-based Test Generation at Meta”, FSE Companion 2025 — https://arxiv.org/abs/2501.12862
- B26 — Google Testing on the Toilet, “Change-Detector Tests Considered Harmful”, 2015 [NV body] — https://testing.googleblog.com/2015/01/testing-on-toilet-change-detector-tests.html
- B27 — ITIL 4, Change Enablement: “standard change” (through a secondary glossary) — https://tdx.cornell.edu/TDClient/189/Portal/KB/ArticleDet?ID=7719
- B28 — Google Engineering Practices, “Small CLs” — https://google.github.io/eng-practices/review/developer/small-cls.html
- B29 — DORA: “Working in small batches”, “Streamlining change approval”, “DORA metrics” — https://dora.dev/capabilities/working-in-small-batches/ · https://dora.dev/capabilities/streamlining-change-approval/ · https://dora.dev/guides/dora-metrics/
- B30 — N. Forsgren, J. Humble, G. Kim, *Accelerate*, 2018 — https://itrevolution.com/product/accelerate/
- B31 — P. Hammant, trunkbaseddevelopment.com, “Short-Lived Feature Branches” — https://trunkbaseddevelopment.com/short-lived-feature-branches/
- B32 — M. Feathers, *Working Effectively with Legacy Code*, 2004 (through a secondary summary) — https://understandlegacycode.com/blog/key-points-of-working-effectively-with-legacy-code/
- B33 — ISTQB Glossary: “risk”, “product risk”, “risk-based testing” — https://glossary.istqb.org/
- B34 — A. Mockus and D. Weiss, “Predicting risk of software changes”, Bell Labs Technical Journal 5(2), 2000 — https://doi.org/10.1002/bltj.2229
- B35 — Y. Kamei et al., “A Large-Scale Empirical Study of Just-in-Time Quality Assurance”, IEEE TSE 39(6), 2013 — https://sail.cs.queensu.ca/data/pdfs/TSE_ALarge-ScaleEmpiricalStudyOfJust-in-TimeQualityAssurance.pdf
- B36 — R. Purushothaman and D. E. Perry, “Toward Understanding the Rhetoric of Small Source Code Changes”, IEEE TSE 31(6), 2005 — https://users.ece.utexas.edu/~perry/work/papers/DP-03-small.pdf
- B37 — J. Śliwerski, T. Zimmermann, A. Zeller, “When do changes induce fixes?”, MSR 2005 — https://www.st.cs.uni-saarland.de/papers/msr2005/msr2005.pdf
- B38 — Google, *Site Reliability Engineering*, 2016 — https://sre.google/sre-book/table-of-contents/
- B39 — Cost of agents without losing performance: AgentDiet, DAAO, AdaptiveLLM — https://arxiv.org/abs/2509.23586
- B40 — W3C WCAG 2.2: 2.5.3 Label in Name, 1.3.2 Meaningful Sequence, 2.4.3 Focus Order, 1.4.10 Reflow [NV this session] — https://www.w3.org/TR/WCAG22/

## Not verified

- The text of the books: *Clean Architecture*, Evans, Vernon, Ousterhout, Richards and Ford, *Building Evolutionary Architectures*, GOOS, Beck 2002, Khorikov, Feathers, *Accelerate*. What is taken from them comes from records, articles by the authors or reviews, and is marked.
- The original abstract of Rafique and Mišić (B20) and the magnitudes of Mathews and Nagappan (B21).
- The bodies of the Google posts “Change-Detector Tests” and “Don't Mock Types You Don't Own”: only the title, the date and a quotation in the comments.
- The official ITIL 4 text on *standard change* and the ISTQB syllabus on proportionality.
- The dependency-cruiser options `moreUnstable` and `$1` in `pathNot`, and the exact names of the React ESLint rules: syntax to validate on first use.
- WCAG 2.2 (B40) was not opened in the study session.
- No direct evidence was found of a risk-proportional process with AI agents and its defect rate (B39 is indirect).
- None of the example commands was run.
