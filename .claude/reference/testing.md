# Testing: rules a card can meet and a reviewer can check

**When it is read:** when the specs are turned into tests (shape of the suite, techniques per
requirement type, test data), when the builder writes or changes tests (doubles, oracles,
determinism, e2e). **How:** only the sections the card touches,
with `Read` and a line range of the heading; never whole. `card.md` names the rule IDs that apply and the
`builder` receives those IDs and their ranges. Examples are Node/TypeScript (Vitest, `node:test`,
Playwright); each rule brings its generic equivalent (pytest, JUnit, xUnit). **Libraries and tools are options,
not obligations.** **[NV] marks guidance not verified**: a hypothesis, never the only evidence of a `meets`.
Neighboring topics are cited by prefix, not repeated: test first, red for the right reason, expected value from
the requirement, mocks at the edges (TDD-*, `reference/architecture.md`); flaky quarantine, stabilizing a new
test, ephemeral dependencies, coverage and mutation as a gate, not weakening tests (CI-*, `reference/ci-cd.md`, module ci);
a test per error of the taxonomy, injected failures (ERR-TEST-*, `reference/errors.md`); accessibility tree in
tests, axe per view, manual protocol (A11Y-*, `reference/accessibility.md`, module ui); everything about load and capacity
(LOAD-*, `reference/performance.md`). How each rule is checked: `J` judgment with written evidence, `C` a
command that exits 0 or not, `T` an automated test. The `rg` commands assume tests under `tests/` and code
under `src/` and need ripgrep with PCRE2; the detectors of the last topic were tried over a sample with each
smell planted, a clean sample and five real spec files (false positives are reviewed by hand). Source numbers
`Bn` are in Sources.

## Rules that are criteria

| Rule | Criterion |
|---|---|
| TEST-IA-07, TEST-VIS-04 | T2 |
| TEST-COB-02, TEST-IA-10 | T3 |
| TEST-BUE-07, TEST-ORA-01, TEST-ORA-02, TEST-ORA-04, TEST-ORA-05, TEST-IA-01, TEST-IA-03 | T4 |
| TEST-BUE-01, TEST-BUE-02, TEST-DBL-03, TEST-DBL-04, TEST-DBL-06, TEST-VEL-02, TEST-IA-06 | T5 |
| TEST-BUE-06 | T6 |
| TEST-INT-02, TEST-E2E-05, TEST-DET-04, TEST-DAT-03, TEST-VEL-04 | T7 |
| TEST-E2E-02, TEST-E2E-03, TEST-DET-01, TEST-DET-02, TEST-DET-03, TEST-DET-05, TEST-DET-06, TEST-IA-05 | T8 |
| TEST-EST-01 | T9 |
| TEST-EST-04, TEST-DIS-01, TEST-DIS-02, TEST-DIS-07 | T10 |
| TEST-COB-01, TEST-COB-04 | T11 |
| TEST-E2E-01, TEST-E2E-04 | T12 |

The rules outside this table are judgment or guidance, with no criterion of their own. The detector D18 of the
last topic (no test weakened in the card's diff) is checked by the gate.

## 1. Strategy and shape of the suite (EST)

**TEST-EST-01** — Choose the shape of the suite by the kind of app and write it in the plan: pyramid if there is a domain with rules or calculations; trophy if it is a front end with little logic of its own; honeycomb if it is a service that mostly orchestrates the database and HTTP. · How J · criterion T9 · Check: the plan says the shape and why; the real split of tests (count by folder or tag) does not contradict it. Pyramid: many unit tests over the domain, some integration, few e2e (Google orients 80/15/5 by number of cases [V]). Trophy: component tests with a fake network (MSW or `page.route`) as the bulk, e2e for critical journeys, linter and types as the base. Honeycomb: the service started whole against its real database in a container and fake third-party APIs, tested through its public API. Same in any stack; what changes is the tool of each layer · Source B4, B5, B9, B10, B11.

**TEST-EST-02** — Classify each test by size (the resources it uses) as well as by scope; a small test touches no network, disk or real clock and does no sleep, and runs in the gate of every change. · How C · criterion none · Check: `rg -n "fetch\(|axios|http\.request|fs\.(write|read)|setTimeout|new Date\(\s*\)" <unit-tests-folder>` is empty (or each line has its double). node-ts folders `unit` (small), `integration` (medium, local containers), `e2e` (large); `vitest --project unit` on every push; generic `@pytest.mark.small/medium/large`, JUnit 5 tags. Covers CI-09 · Source B11.

**TEST-EST-03** — If a high-level test fails and no low-level test fails, add the low-level test that reproduces the cause. · How J · criterion none · Check: in the fix, the diff brings a lower-level test besides the high one going green again. Covers TDD-04, TDD-06 · Source B5.

**TEST-EST-04** — Everything you do not want to break has a test (the Beyoncé rule): also configuration, migrations, permissions and failure handling. · How J · criterion T10 · Check: the plan lists, for each edge and each configuration file touched, which test covers it. Configuration changes are a main cause of outages and unit tests do not see them · Source B11.

**TEST-EST-05** — What has no automatic oracle (aesthetics, usability, copy) is not faked with a test: it goes to a visual capture, an audit or an exploratory session, and it is declared. · How J · criterion none · Check: the close names the technique and its state (passed, failed, could not run). Covers TDD-09, A11Y-PRO-04 · Source B5, B36.

## 2. What a good test is (BUE)

**TEST-BUE-01** — Judge each test with the four pillars (protection against regressions, resistance to refactoring, fast feedback, maintainability); resistance to refactoring is not traded for anything. · How J · criterion T5 · Check: checklist c.2. Practical proof: a refactor with no change of behavior breaks no test (if it does, the test was wrong). The pillar names come from a secondary summary and the chapter titles [V sec] · Source B1.

**TEST-BUE-02** — Test through the front door: the module's public API, the endpoint, the screen. Never private methods or internal fields. · How C+J · criterion T5 · Check: detector D20 (`(x as any).field`, `x['_field']`, `._field`). node-ts bad `expect((cart as any)._items.length).toBe(0)`, good `expect(cart.total()).toBe(0)`; generic no reflection to read privates (`setAccessible(true)`, `obj._Class__field`) · Source B5, B11.

**TEST-BUE-03** — One behavior per test, and the name says the action and the expected result. · How C+J · criterion none · Check: detector D22 (generic names: `works`, `test 2`, `happy path`); review that each test has one action under test. node-ts `it('rejects a negative quantity with INVALID_QUANTITY', …)`, not `it('works', …)`; generic `test_rejects_negative_quantity_with_invalid_quantity`, `@DisplayName` · Source B11.

**TEST-BUE-04** — Structure each test as arrange, act, assert, visible, with a single action and no actions after the assertion. · How J · criterion none · Check: three blocks separated by a blank line; the “when” is one line · Source B11.

**TEST-BUE-05** — DAMP before DRY: the value that decides the assertion is visible in the test; the shared setup builds, it does not hide data the test uses. · How J · criterion none · Check: if understanding why the expected value is 25 requires opening another file (Mystery Guest), rewrite. node-ts `anOrder().withItem({ price: 10, quantity: 2 })` in the test, not a global `standardOrder` fixture; generic the same with builders or factories (`factory_boy`, `Instancio`) · Source B11, B12.

**TEST-BUE-06** — No logic in the test body (if, for, switch, calculations); for several cases, a parameterized table. · How C · criterion T6 · Check: the linter (`no-conditional-in-test`) plus detector D06 for stacks without it. node-ts `it.each([[0, 0], [1, 10], [99, 990]])('with %i units…', (c, expected) => …)`; generic `@pytest.mark.parametrize`, `@ParameterizedTest` · Source B11, B12, B15.

**TEST-BUE-07** — Use the specific matcher so that the failure says expected and obtained: no `expect(a === b).toBe(true)` and no several anonymous assertions on different things. · How C · criterion T4 · Check: detector D19. node-ts `expect(total).toBe(25)`, `expect(order).toEqual({ status: 'paid', total: 25 })`; generic `assertThat(total).isEqualTo(25)` before `assertTrue(total == 25)`. Assertion Roulette recurs in LLM tests (23.8–61.3 % of those generated for HumanEval [V sec]) · Source B11, B32.

## 3. Test doubles (DBL)

**TEST-DBL-01** — Order of preference: real implementation → fake → stub → interaction verification. A double is justified because the real one is slow, non-deterministic or out of your control. · How J+C · criterion none · Check: the doubles policy (c.3); count mocks per file `rg -c "\b(vi|jest)\.(mock|fn|spyOn)\(" tests` and review the files with more than 3. Covers TDD-05 (mocks at the edges); the explicit order is new · Source B3, B11.

**TEST-DBL-02** — Managed dependencies (your database, your cache, your internal queue that nobody else reads) go real in integration tests; unmanaged ones (SMTP, a shared bus, a third-party API) are replaced. · How J · criterion none · Check: in integration there is no `vi.mock` of the repository or the ORM; there is a container. Covers TDD-05 in general; this adds the managed/unmanaged criterion · Source B1, B23.

**TEST-DBL-03** — Do not mock types you do not own: wrap the third-party SDK in an adapter of your own, double the adapter and test the adapter against the real service or its contract. · How C · criterion T5 · Check: detector D23 (`vi.mock('axios')`, `jest.mock('@aws-sdk/…')` in domain tests). node-ts `interface Payments { charge(…) }` + `StripePayments implements Payments`; the domain is tested with `FakePayments`; `StripePayments` has its integration test against the sandbox; generic the same, in Python no `patch('requests.post')` in domain tests. Covers TDD-05 · Source B1, B11 (GOOS and the Testing on the Toilet rule are cited in `reference/architecture.md`).

**TEST-DBL-04** — Verify interactions only for outgoing effects that change state (a mail sent, a message published, a charge), with the arguments that matter; never verify query calls. · How C+J · criterion T5 · Check: detector D11 (`toHaveBeenCalledTimes`, `toHaveBeenNthCalledWith`) reviewed: each one over an outgoing effect. node-ts good `expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@x.test' }))`, bad `expect(repo.find).toHaveBeenCalledTimes(1)` · Source B1, B11.

**TEST-DBL-05** — A fake is maintained with its own contract tests, which run against the fake and against the real one. · How T · criterion none · Check: the same suite parameterized by implementation `describe.each([['real', createReal], ['fake', createFake]])` · Source B11.

**TEST-DBL-06** — Do not mock modules of your own on the same side of the boundary (neither the module under test nor its internal collaborators). · How C · criterion T5 · Check: detector D09 (`vi.mock('../…')`, `jest.mock('./…')`). Covers TDD-05 · Source B1, B11.

## 4. Case design (DIS)

**TEST-DIS-01** — Split each input into equivalence classes, the invalid ones included, and write at least one test per class. · How J · criterion T10 · Check: the plan lists the partitions per rule; coverage = partitions exercised over partitions identified. Example quantity → {negative (invalid), 0, 1..99, 100 or more (invalid)} · Source B34.

**TEST-DIS-02** — At each boundary of a rule with a comparison, test with 3 values (the boundary and its two neighbors); 2 values as a minimum. · How J+T · criterion T10 · Check: a parameterized table with the boundary values. The ISTQB example: `x ≤ 10` written wrongly as `x = 10` is caught by x = 9, not by 10 or 11. node-ts `it.each([[9, 'ok'], [10, 'ok'], [11, 'exceeds']])` · Source B34.

**TEST-DIS-03** — For rules that combine two or more conditions, write the decision table and one test per feasible column. · How J · criterion none · Check: the table is in the plan or in the test as an `it.each` with one row per column · Source B34.

**TEST-DIS-04** — For entities with states (order, appointment, workflow), cover all valid transitions; if the flow is critical, also each invalid transition, one per test. · How J+T · criterion none · Check: a state × event matrix in the plan; one test per valid cell, and per empty cell if critical. node-ts `it.each(invalidTransitions)('from %s, %s is rejected', …)` asserts the typed error · Source B34.

**TEST-DIS-05** — With three or more independent parameters of several values (roles × configuration × browser), use pairwise combinations as the default and a higher t-way for what is critical. · How C · criterion none · Check: generate with PICT or similar **[NV tool]**; the combinations file is committed · Source B35.

**TEST-DIS-06** — For functions with invariants (parse/serialize round trip, idempotence, order, conservation of totals, equivalence with a simple model), add property-based tests with a reproducible seed. · How T · criterion none · Check: the failure prints `seed` and `path`; they are fixed in the regression test that is added. node-ts `fc.assert(fc.property(fc.array(fc.record({ price: fc.nat(), quantity: fc.nat() })), items => total(items) === total([...items].reverse())))`; generic Hypothesis (`@given`), jqwik, QuickCheck · Source B16, B17.

**TEST-DIS-07** — Each case comes from a named technique: the plan says, per rule, which technique was used and which coverage items came out. · How J · criterion T10 · Check: matrix c.1 applied in the plan · Source B34.

## 5. Oracles (ORA)

**TEST-ORA-01** — The expected value is a literal that comes from the requirement or from an independent calculation; never from calling the function under test nor from copying what it returned. · How C+J · criterion T4 · Check: detector D12 (`expect(f(x)).toEqual(f(x))`); review that each expected value has its origin in the scenario. Covers TDD-03 · Source B25, B26.

**TEST-ORA-02** — Assert the value, not the existence: `toBeDefined`, `toBeTruthy`, `not.toBeNull` and `toHaveBeenCalled()` without arguments are valid only when the requirement is exactly that. · How C · criterion T4 · Check: detector D03. 80.2 % of the test patches of agents contain weak oracle signals or none (syntactic signals, not a measure of correctness) · Source B27.

**TEST-ORA-03** — When there is no exact expected value, use a derived oracle: a metamorphic relation, a property, a simple reference model. Implicit ones (it does not crash, it does not return 500) complement and never suffice alone. · How J · criterion none · Check: each test with an implicit oracle has next to it another with a specified or derived one. Metamorphic examples: doubling every quantity doubles the total; filtering by A then B equals B then A · Source B25.

**TEST-ORA-04** — Error assertions name the expected type or code: no `toThrow()` with no argument. · How C · criterion T4 · Check: detector D21. node-ts `expect(() => f(-1)).toThrow(expect.objectContaining({ code: 'INVALID_QUANTITY' }))`; generic `pytest.raises(InvalidQuantity)`, `assertThrows(InvalidQuantity.class, …)`. Covers ERR-TEST-01 · Source B11.

**TEST-ORA-05** — No test that cannot fail: no tautologies, no `expect` without a matcher, no assertions inside a `try` whose `catch` swallows. · How C · criterion T4 · Check: detectors D02, D16, D17; linter `valid-expect` · Source B15, B27.

**TEST-ORA-06** — Regression against the previous output (snapshot, approval) is a derived oracle that freezes what exists, right or wrong; it is valid only after someone validated that output against the requirement. · How J · criterion none · Check: the commit that creates the approved file says who validated it and against what. Covers TDD-03, TDD-08 · Source B25, B26.

## 6. Real integration (INT)

**TEST-INT-01** — Test your own database with the same engine and version as production, in an ephemeral container; no SQLite or H2 in place of Postgres or MySQL. · How C · criterion none · Check: `rg -n "sqlite|h2database|:memory:" tests/ package.json` is empty in a repo whose engine is another. node-ts `await using pg = await new PostgreSqlContainer('postgres:16').start(); const url = pg.getConnectionUri();`; generic Testcontainers in Java, Python, Go, .NET. Covers CI-21, DB-MIG-10 · Source B1, B11, B23.

**TEST-INT-02** — Each test starts from a known state that it builds itself: a transaction with rollback, a schema or database per worker, or snapshot/restore; none depends on what another left. · How T · criterion T7 · Check: running with random order and in parallel (TEST-DET-04) gives the same result · Source B6, B23.

**TEST-INT-03** — For third-party services: a double at the HTTP edge in the gate, and verification of the double against the real one outside the gate (a periodic contract test or sandbox). Pact only if you know and coordinate with the consumer and the provider. · How J · criterion none · Check: each third-party double has its verification named and its frequency. Covers TDD-07, ERR-TEST-02 · Source B6, B22.

**TEST-INT-04** — Record and replay (HAR, cassettes) only with the file committed and strict matching; re-recording is a reviewed change, not a step to make it pass. · How C · criterion none · Check: `git diff --stat -- '*.har'` in the PR is justified in the description · Source B14.

## 7. E2E

**TEST-E2E-01** — Look up elements by role and accessible name; label, text and test id after; never CSS or structural XPath, nor `first()/last()/nth()` to disambiguate. · How C · criterion T12 · Check: the linter (`no-raw-locators`) plus detector D07. node-ts `page.getByRole('button', { name: 'Save' })`, not `page.locator('.btn-primary > span')`; generic Testing Library in other frameworks, in Selenium `By.xpath` with role and name before structure · Source B13, B14, B15.

**TEST-E2E-02** — Assert the page state with assertions that retry, always with `await`; never `expect(await x.isVisible()).toBe(true)`. · How C · criterion T8 · Check: the linter (`prefer-web-first-assertions`, `missing-playwright-await`) plus detectors D14, D15 · Source B14, B15.

**TEST-E2E-03** — No sleep: not `waitForTimeout`, not `setTimeout` in a promise, not `networkidle`; wait for an observable condition. · How C · criterion T8 · Check: the linter (`no-wait-for-timeout`, `no-networkidle`) plus detectors D04, D13 · Source B6, B14, B15.

**TEST-E2E-04** — Do not use `force: true`: if the user cannot act on the element, the test must fail. · How C · criterion T12 · Check: detector D13; linter `no-force-option` · Source B15.

**TEST-E2E-05** — Each test uses its own browser context and its own data, created by it with a unique value; there is no order between tests. · How C+T · criterion T7 · Check: the kit's sentinel detector (step 4); `--repeat-each` and `--fully-parallel` are green · Source B14.

**TEST-E2E-06** — Do not test third-party sites or APIs live from e2e: intercept with `page.route` and verify the third party separately. · How C · criterion none · Check: detector D10 (`goto('https://…')` to an external host). Covers TEST-INT-03 · Source B14.

**TEST-E2E-07** — Prepare by API, verify by UI: login with stored state and data seeded by endpoint or SQL; the interface is used only for what the scenario tests. · How J · criterion none · Check: the test does not navigate setup forms that are not its scenario. Splitting the SUT at the API edge [V]; the mechanics of `storageState` **[NV]** · Source B11.

## 8. Visual and snapshot (VIS)

**TEST-VIS-01** — Use screenshot comparison only for what is visual, with baselines generated on the same OS, browser and fonts that run in CI, and explicit, small tolerances. · How C · criterion none · Check: the baselines carry a platform suffix that matches the CI runner; `threshold` and `maxDiffPixels` are declared in the config. Covers TDD-09 · Source B14.

**TEST-VIS-02** — Mask what is dynamic (dates, avatars, counters) and disable animations before capturing. · How C · criterion none · Check: each `toHaveScreenshot` with dynamic content passes `mask`. The `mask` and `animations: 'disabled'` options **[NV this session]** · Source B24.

**TEST-VIS-03** — Text snapshots small (a few dozen lines), with a descriptive name and dynamic values replaced by matchers; never as the only oracle of a business rule. · How C · criterion none · Check: linter `no-large-snapshots` plus detector D08 (a `.snap` of more than 50 lines). Covers TDD-03; this adds the size · Source B9, B24.

**TEST-VIS-04** — Updating baselines or snapshots (`-u`, `--update-snapshots`) is a change reviewed diff by diff, in its own commit; never the way to turn a red green. · How C · criterion T2 · Check: detector D18 over the diff; `git log --stat` shows `.snap` and `.png` only in commits that declare it. Covers CI-AI-01 · Source B9, B24.

**TEST-VIS-05** — For complex outputs without a field-by-field oracle (reports, generated documents, legacy), approval testing: the approved output is committed and each change is approved looking at the diff. · How J · criterion none · Check: the approved file has an author and an approval criterion in the commit. Covers TDD-08. Authorship and the received/approved mechanics **[NV]** · Source B25, B38.

## 9. Determinism (DET)

**TEST-DET-01** — Inject the clock or use a fake clock; no logic test reads the real time. · How C · criterion T8 · Check: detector D10 (`new Date()`, `Date.now()` in tests) and its equivalent in `src/` to see whether the clock is injected. node-ts `vi.useFakeTimers(); vi.setSystemTime(new Date('2026-03-01T12:00:00Z'))` or `context.mock.timers.enable({ apis: ['Date'], now: 0 })`; generic `freezegun`, an injected `Clock.fixed` in Java. Covers ERR-TEST-06; this generalizes it · Source B6, B39.

**TEST-DET-02** — All randomness carries a fixed or printed, reproducible seed (fake data, property tests, order). · How C · criterion T8 · Check: detector D10 (`Math.random()`, `randomUUID()` in tests); in property tests the seed of the failure stays in the regression test · Source B17, B39.

**TEST-DET-03** — Small and medium tests do not go out to the network: every host that is not localhost is doubled. · How C · criterion T8 · Check: detector D10 (external URLs) plus running the unit suite without network (a container with `--network none`) **[NV exact command]**. Covers CI-09 · Source B11.

**TEST-DET-04** — The suite passes in random order and in parallel; in CI it runs randomized with the seed in the log. · How T · criterion T7 · Check: `node --test --test-randomize` (and `--test-random-seed=N` to reproduce); Playwright `--fully-parallel`; Vitest `--sequence.shuffle` **[NV flag]**; the Node version that ships `--test-randomize` **[NV]**. Covers CI-19 · Source B11, B39.

**TEST-DET-05** — Asynchrony: wait for an event, a callback or polling with a timeout that lives in one place; never a sleep. · How C · criterion T8 · Check: detector D04. Covers TEST-E2E-03 for unit and integration · Source B6, B11.

**TEST-DET-06** — Time zone and locale fixed in the runner (for example `TZ=UTC`), and an explicit test in another zone when the rule depends on the zone. · How C · criterion T8 · Check: the test script fixes `TZ`; `rg -n "TZ=" package.json`. Covers DB-MOD-06 in the data layer; see `reference/i18n.md` (module i18n) I18N-FMT-06 · Source B6.

**TEST-DET-07** — A test runs on every OS the project supports. A behaviour tied to one platform (an encoding, line ends, a path separator) is reproduced from the test's own language so it runs everywhere, not by calling a shell that exists on one platform only. A test skipped by situation says why in its skip reason: skipped by platform, why the other platforms are not supported and what covers them there; skipped for a missing tool or service, which one, and the run reports it as could not run, never as passed. · How C · criterion T2 · Check: `rg -n "skip:|process\.platform" tests` — every conditional skip carries a reason that names its cause · Source B6.

## 10. Test data (DAT)

**TEST-DAT-01** — Build the data with builders of valid defaults; the test sets only the fields that matter to its assertion. · How J · criterion none · Check: guide c.4. node-ts `anOrder().withItem({ price: 10, quantity: 2 }).build()`; generic Test Data Builder in Java or C#, `factory_boy` in Python · Source B8.

**TEST-DAT-02** — An Object Mother only for a few stable, named characters; a shared character is not edited to fit a new test. · How C · criterion none · Check: `git log -p -- <fixtures-folder>` reviewed: changing an existing value of a mother breaks other tests · Source B8.

**TEST-DAT-03** — No mutable general fixture shared by the whole suite: each test recreates what it needs or receives a copy. · How T · criterion T7 · Check: random order (TEST-DET-04) is green. The General Fixture smell is known from a secondary source [V sec] · Source B2, B6.

**TEST-DAT-04** — The data a test creates carries a unique value (a sentinel) and the assertion is on that value. · How C · criterion none · Check: the kit's sentinel detector. It is what makes parallelism over a shared database possible · Source none (kit, step 4).

**TEST-DAT-05** — The numbers and texts that decide the assertion have a name or come from the builder with a method that says what they represent. · How J · criterion none · Check: if the expected value is `990`, it shows why (`99 * UNIT_PRICE` with the constant written in the test, not imported from `src`). Magic Number Test recurs in LLM tests · Source B32.

**TEST-DAT-06** — Never real personal data in fixtures; if production is the starting point, anonymized and documented. · How C · criterion none · Check: `gitleaks` and an `rg` of real ID/email patterns in `tests/` **[NV patterns]**. Covers DB-SEC-07 · Source B11.

## 11. Coverage and mutation (COB)

**TEST-COB-01** — Use coverage to find what has no test, not as a measure of quality; never raise it with tests that have no assertion. · How C · criterion T11 · Check: coverage of the new lines with a threshold (Q3) and, next to it, D01 and D03 over the tests that produce it. Covers CI-26 · Source B7, B20.

**TEST-COB-02** — Read the mutation report with its states: NoCoverage counts as a survivor, Timeout as detected, compile and runtime errors do not count; each survivor is killed or declared equivalent with its reason. · How C · criterion T3 · Check: the kit's `mutate.mjs`; the report per file with the score and the justified survivors. Covers ERR-TEST-03; this adds the reading of states · Source B18, B19.

**TEST-COB-03** — With tests written by an agent, neither coverage nor mutation proves they detect a bug already in the code; only the oracle that comes from the requirement gives that. · How J · criterion none · Check: TEST-ORA-01 met in each new test. Covers TDD-03 · Source B21, B26.

**TEST-COB-04** — For decision logic, look at branch coverage, not only line coverage. · How C · criterion T11 · Check: a branch report in the coverage config (`coverage.thresholds.branches` in Vitest **[NV exact key]**). 100 % of statements does not ensure branches · Source B34.

## 12. Speed and maintainability (VEL)

**TEST-VEL-01** — Measure the duration of the suite by size and keep a written budget; a small test that takes as long as a medium one is misclassified. · How C · criterion none · Check: a reporter with durations (`--reporter=verbose`/JSON) and the 10 slowest reviewed in each card that touches them. Covers CI-08 · Source B11.

**TEST-VEL-02** — If a refactor with no change of behavior breaks tests, the test is fixed; the fragility is not accepted. · How J · criterion T5 · Check: review of the test diff in a refactor card: changes only in setup, not in assertions · Source B1, B11.

**TEST-VEL-03** — Helpers and page objects encapsulate the how (navigate, fill, seed); the assertion stays in the test. If a helper asserts, it is called `expect…`/`assert…` and is registered in the linter. · How C · criterion none · Check: `expect-expect` with `assertFunctionNames` (for example `['expect', 'verify*']`) **[NV exact pattern syntax]**; without it, D01 flags false positives · Source B11, B15.

**TEST-VEL-04** — Tests run in parallel by default; no mutable global state between files. · How T · criterion T7 · Check: `--fully-parallel` / `workers > 1` green ten times · Source B11, B14.

## 13. Exploratory and manual (EXP)

**TEST-EXP-01** — Exploratory testing is done in sessions with a charter and a fixed time, and leaves a report: charter, area, what was tried, bugs, open questions, time in setup, test and investigation. · How J · criterion none · Check: the session report in `specs/<card>/` with state passed, failed or could not run. Charter example: “Explore the order creation with boundary quantities and a slow connection to discover inconsistent states of the total”. The literal charter template **[NV]** · Source B36, B37.

**TEST-EXP-02** — Explore when there is a new screen, a risky flow, a large change, or something without an automatic oracle; it does not replace the checks nor they the exploratory testing. · How J · criterion none · Check: the plan says what is explored and why. Covers A11Y-PRO-04 · Source B5, B36.

**TEST-EXP-03** — Every bug found while exploring becomes an automated test that fails before the fix. · How C · criterion none · Check: the fix commit brings a test that fails on the previous commit. Covers TDD-04 · Source B5.

**TEST-EXP-04** — Manual work is reported with the three states and never as “passed” if it was not done. · How J · criterion none · Check: the close lists each manual verification with its state. Covers the kit's invariant 3 · Source none (kit).

## 14. Typical mistakes of tests written by AI (IA)

Each maps to rules above; this section adds the detector and the evidence that it happens.

**TEST-IA-01** — Do not assert what the code returns: the expected value is written before looking at the output. · How C+J · criterion T4 · Check: D12; the test written before the code (T1). LLMs capture the actual behavior of the program, not the expected one. Covers TDD-03 · Source B26, B27.

**TEST-IA-02** — Do not mock everything: the test of a domain rule has no mock; integration tests double only the unmanaged. · How C · criterion none · Check: D09, D23 and the mock count per file (TEST-DBL-01) · Source B1, B11.

**TEST-IA-03** — No test that cannot fail. · How C · criterion T4 · Check: D01, D02, D16, D17, D19; and a manual mutant: inverting the main condition must turn the test red · Source B27, B30.

**TEST-IA-04** — No giant snapshots as an oracle. · How C · criterion none · Check: D08, `no-large-snapshots` · Source B9, B24.

**TEST-IA-05** — No sleeps. · How C · criterion T8 · Check: D04, D13 · Source B6, B14.

**TEST-IA-06** — No tests coupled to the implementation (privates, counts of query calls, mocks of own modules). · How C · criterion T5 · Check: D09, D11, D20 · Source B1, B11.

**TEST-IA-07** — Do not delete, skip, weaken or re-approve a test to make it pass. · How C · criterion T2 · Check: D05 and D18 over the diff (assertions deleted, `.skip/.only` added, `toBe(x)` changed to `toBeDefined()`, snapshots regenerated). More than 79 % of the cheating of Claude models and Qwen3-Coder is modifying tests (ImpossibleBench). Covers CI-AI-01; the guard of the kit freezes committed tests, D18 is the command for repos without it · Source B30.

**TEST-IA-08** — Do not special-case: production code does not compare against values that appear only in the tests. · How C+T · criterion none · Check: D24 (the literals of the tests compared in `src/`); mutation and property tests (TEST-DIS-06) for the numeric cases D24 does not see · Source B30.

**TEST-IA-09** — The number of tests is not evidence: the report gives scenarios covered, mutation score and tests seen failing, not the count of test files. · How J · criterion none · Check: the close does not use “I added N tests” as proof. Agent PRs include tests as often as human ones (42.9 % vs 40.0 %) with nearly twice the test lines per code line · Source B27, B33.

**TEST-IA-10** — A generated test enters only if it compiles, passes stably, and kills at least one mutant or covers a scenario that was not covered. · How C · criterion T3 · Check: CI-19 (N runs) plus mutation over the touched file. In TestGen-LLM, 75 % compiled, 57 % passed reliably and 25 % added coverage · Source B29.

## 15. Smell detectors with `rg`

The linter comes first (`eslint-plugin-jest`, `eslint-plugin-playwright`, B15); these detectors are for stacks
without a linter or as a cheap second net. All are line-based: they catch the typical cases, not adversarial
ones. Common glob `G='-g *.{spec,test}.{ts,tsx,js,jsx,mjs,cjs} -g !node_modules'`; each command runs as
`rg -nP $G '<pattern>' tests`, except where noted. A detector that fires gives a finding with file and line; each
one gave 0 on the clean sample. In a Windows shell without a real `rg.exe` in the `PATH`, the `rg` of the agent
tool is a shell function that a `bash -c` does not inherit.

- **D01** — a test with no assertion · `rg -nUP $G '^( *)(it|test)(\.(only|skip))?\([^\n]*=>\s*\{\n(?:(?!\1\}\);)(?![^\n]*\b(?:expect|assert)\w*[.(])[^\n]*\n)*\1\}\);' tests` · false positive when the assertion is in a helper (add the helper's prefix to the alternation); does not see one-line tests.
- **D02** — tautology: a literal as subject, or `f(x)` against `f(x)` · `rg -nP $G 'expect\((true|false|null|undefined|\d+|(["'"'"'])[^"'"'"']*\2)\)\.(toBe|toEqual|toStrictEqual)\(|expect\(([\w.]+(\([^()]*\))?)\)\.(toBe|toEqual|toStrictEqual)\(\4\)' tests` · also flags `expect(1).toBe(2)`, equally useless.
- **D03** — weak oracle · `rg -nP $G '\.(toBeDefined|toBeTruthy|toBeFalsy|not\.toBeNull|not\.toBeUndefined|toHaveBeenCalled)\(\)|expect\.anything\(\)|\.toMatchSnapshot\(\)' tests` · read the line: it can match text inside a test title.
- **D04** — sleep · `rg -nP $G 'waitForTimeout\(|\bsleep\(|setTimeout\(\s*\w+\s*,\s*\d{2,}|new Promise\(\s*\(?\w*\)?\s*=>\s*setTimeout' tests`.
- **D05** — `.skip/.only/.todo/.fixme`, `xit`, `fit` · `rg -nP $G '\b(it|test|describe)\.(skip|only|todo|fixme)\b|\b(xit|xdescribe|fit|fdescribe|xtest)\(' tests`.
- **D06** — logic in the test · `rg -nP $G '^\s+(if|for|while|switch)\s*\(|\.forEach\(' tests` · flags an `if` in a hook (legitimate); misses a `for` at indentation 0 that generates tests (also legitimate).
- **D07** — structural selector · `rg -nP $G "locator\(\s*['\"\`](?!role=|text=|internal:)[.#\[/a-z]|xpath=|querySelector|\.(first|last|nth)\(|getByTestId\(" tests`.
- **D08** — a snapshot of more than 50 lines · `rg -c "" -g "*.snap" tests | awk -F: '$NF>50'`.
- **D09** — mock of an own module · `rg -nP $G '\b(vi|jest)\.mock\(\s*["'"'"']\.{1,2}/' tests`.
- **D10** — real clock, randomness or network · `rg -nP $G 'new Date\(\s*\)|Date\.now\(\)|Math\.random\(\)|randomUUID\(\)|goto\(\s*["'"'"'`]https?://(?!localhost|127\.0\.0\.1)' tests`.
- **D11** — count or order of calls · `rg -nP $G 'toHaveBeenCalledTimes\(|toHaveBeenNthCalledWith\(|toHaveBeenLastCalledWith\(|\bspyOn\([^,]+,\s*["'"'"']_' tests` · each hit reviewed: valid only over an outgoing effect.
- **D12** — expected value computed with the code · `rg -nP $G 'expect\((\w+)\(([^()]*)\)\)\.(toBe|toEqual|toStrictEqual)\(\1\(' tests`.
- **D13** — `force: true`, `networkidle` · `rg -nP $G 'force:\s*true|networkidle' tests`.
- **D14** — assertion that does not retry, over the page · `rg -nP $G 'expect\(\s*await\s+.*\.(isVisible|isHidden|isChecked|isEnabled|textContent|innerText|inputValue|count|getAttribute)\([^()]*\)\s*\)' tests`.
- **D15** — web-first assertion without `await` · `rg -nP $G '^(?!\s*(await|return)\b)\s*expect\((page|\w*[Ll]ocator)\b.*\)\.(toHave|toBe(Visible|Hidden|Enabled|Disabled|Checked|Attached|Focused))' tests`.
- **D16** — `expect(x);` with no matcher · `rg -nP $G '^\s*expect\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)\s*;' tests`.
- **D17** — an assertion in a `try` whose `catch` swallows · `rg -nUP $G 'try\s*\{[^}]*\bexpect\([^}]*\}\s*catch\s*\([^)]*\)\s*\{\s*(//[^\n]*\s*)?\}' tests` · assumes an empty `catch` or one with a comment.
- **D18** — a test weakened in the diff (an assertion removed, a weak one or a skip added, a snapshot regenerated, a test file deleted) · `git diff -U0 <base> -- tests | rg -nP '^-(?!--).*\b(expect|assert)\w*[.(]|^\+(?!\+\+).*(\.(skip|only|todo|fixme)\b|\b(xit|xdescribe)\(|toBeDefined\(\)|toBeTruthy\(\)|expect\.anything\(\)|--update-snapshots|-u\b)|^deleted file'` · needs the base commit (the card's start); it is the mechanical item C17 and the complement by command of the hook that freezes tests.
- **D19** — a comparison wrapped in `toBe(true)` · `rg -nP $G 'expect\([^;]*(===|!==|==|!=|>=|<=|\s>\s|\s<\s)[^;]*\)\.toBe\((true|false)\)' tests`.
- **D20** — access to privates · `rg -nP $G '\(\s*\w+\s+as\s+any\s*\)\.\w|\w\[["'"'"']_\w+["'"'"']\]|\._[a-z]\w*\b' tests`.
- **D21** — `toThrow()` with no type · `rg -nP $G '\.toThrow(Error)?\(\s*\)|\.rejects\.toThrow\(\s*\)|assert\.throws\(\s*[^,()]+(\([^()]*\))?\s*\)' tests`.
- **D22** — generic name · ``rg -nP $G '\b(it|test)\(\s*["'`](works|it works|funciona|test\s*\d*|should work|ok|caso \d+|happy path)["'`]' tests``.
- **D23** — mock of a third-party package · `rg -nP $G '\b(vi|jest)\.mock\(\s*["'"'"'](?!\.)[@\w]' tests`.
- **D24** — special-casing in production · `L=$(rg -oNP --no-filename "[\"'\`]([A-Za-z][\w-]{5,})[\"'\`]" -r '$1' tests -g "*.{spec,test}.*" | sort -u | paste -sd'|'); rg -nP "(===?|!==?|\bcase)\s*[\"'\`]($L)[\"'\`]|[\"'\`]($L)[\"'\`]\s*(===?|!==?)" src` · sees text literals of 6 or more characters; numeric special-casing (`price === 10 && quantity === 2`) is not detected: for that, mutation and property tests.

## 16. Templates

### c.1 Matrix of techniques per requirement type

| Requirement type | Main technique | Coverage items | Level | Oracle |
|---|---|---|---|---|
| Validation of a field or range (`quantity 1..99`) | Partitions + 3-value boundary analysis | Each partition (valid and invalid) and each boundary with its two neighbors | Unit | Specified: literal of the requirement |
| Rule with several conditions | Decision table | Each feasible column | Unit | Specified |
| Entity with a life cycle (order, appointment) | State transition | All valid transitions; in what is critical, all, invalid ones included, one per test | Unit + one e2e of the happy path | Specified: target state and typed error |
| Calculation with invariants (totals, conversions, ordering) | Examples + property-based | The card's examples + properties (round trip, idempotence, conservation, reference model) | Unit | Derived: property or metamorphic relation |
| Combinable configuration (roles × flags × browser) | Pairwise (higher t-way if critical) | Pairs of values | Integration / e2e | Specified per combination |
| Persistence, queries, migrations | Examples over a real database | Each new query, constraint and migration | Integration with a container | Specified: rows and constraint errors |
| Third-party integration | Double at the edge + contract | Each response the requirement names, plus timeout, 4xx, 5xx, 429 | Integration | Specified; contract verified apart |
| Screen: behavior | Scenarios of the snapshot | Each scenario | Component or e2e by role and name | Specified: visible text or state |
| Screen: appearance | Visual capture + review | Named visual states | Visual | Human, then regression |
| Complex output (report, PDF, export) | Approval | Each output variant | Unit or integration | Derived (regression) validated once by a human |
| Error and resilience | ERR-TEST-* | Each error of the taxonomy | Unit or integration | Specified: type or code |
| No automatic oracle (usability, copy) | Exploratory with a charter | Charters | Manual | Human, with a session report |

### c.2 Checklist for reviewing a test

For each new or touched test. A “no” is a finding with file and line.

1. Does the name say the action and the expected result? (TEST-BUE-03)
2. Does it test one behavior, through the public API? (BUE-02, BUE-03)
3. Are arrange, act and assert visible, with a single action? (BUE-04)
4. Is the expected value a literal that comes from the requirement, written in the test? (ORA-01, DAT-05)
5. Is the assertion on the value, with a specific matcher, and not on existence? (ORA-02, BUE-07)
6. Can it fail? Invert the code's condition mentally: does it turn red? (ORA-05, IA-03)
7. Is there logic (if, for, calculation) in the body? (BUE-06)
8. Which doubles does it use, and are all of them for unmanaged or slow dependencies? Does it verify interactions only of outgoing effects? (DBL-01..06)
9. Does it read the real clock, randomness or network? Does it wait with a sleep? (DET-01..05)
10. Does it create its own data and assert on it? Does it depend on another test? (DAT-03, DAT-04)
11. If it is a screen test, does it look up by role and name, with retrying assertions and no `force`? (E2E-01..04)
12. If it uses a snapshot or capture, is it small, deterministic and not the only oracle of a rule? (VIS-01..03)
13. Did it survive a refactor with no change of behavior? (BUE-01, VEL-02)
14. Did I see it fail for the right reason? (TDD-02)
15. In the diff, did any existing test lose an assertion, gain a `.skip` or a regenerated snapshot? (IA-07)

### c.3 Doubles policy

| Dependency | What is used | Where fidelity is verified |
|---|---|---|
| Values, pure functions, domain entities | Real, always | none |
| Internal collaborators of the same module or layer | Real | none |
| Own database, own cache, internal queue | Real in an ephemeral container (integration); in a domain unit test it does not appear because the domain does not depend on it | Same engine and version as production (TEST-INT-01) |
| Clock, randomness | Injected fake or the runner's fake clock | none |
| File system | A real temporary directory per test | none |
| Third-party API (payments, mail, maps) | Own adapter + a fake or stub of the adapter; in e2e, `page.route` | A test of the adapter against a sandbox or a contract, outside the gate (TEST-INT-03) |
| Bus or broker shared with other teams | A mock that verifies the published message (it is an outgoing effect) | Contract with the consumer (Pact if it applies) |
| Internal service of another team | Stub at the edge + a consumer-driven contract | The provider's verification in its pipeline (TDD-07) |
| A third-party SDK directly | **Never** mock the package; wrap it (TEST-DBL-03) | none |

Rules of use: a double without justification (slow, non-deterministic, out of control) is replaced by the real
one; more than three stubs in one test is a design signal, the unit is reviewed and stubs are not added (B11,
ch. 13); interaction verification is for outgoing effects that change state and asserts only the arguments that
matter; the fake is maintained by the owner of the real one and has contract tests against both.

### c.4 Test data guide

1. **A builder with valid defaults** for each aggregate the tests build; the default produces a valid, boring
   object; the methods (`withItem`, `expired`, `forMember`) name what they change.
2. **The test sets what it asserts.** If the expected value depends on a field, that field is visible in the
   test, even if it matches the default.
3. **Unique values per test** in everything that goes to a shared database or screen (a sentinel with the
   test's id); the assertion is on that value.
4. **An Object Mother only for stable characters** (an admin user, a standard customer), with a domain name;
   they are not modified: if a test needs something else, it uses the builder.
5. **Immutable or recreated fixtures**; no module-level mutable state shared between tests.
6. **Database seeding by API or SQL**, not through the interface, unless the scenario is the creation.
7. **Fixed, explicit dates** (`2026-03-01T12:00:00Z`) with a zone; never `new Date()`.
8. **No real personal data**; production data only anonymized and with a written decision.
9. **Constants of the expected value written in the test**, not imported from `src` (if the unit price is
   imported from the code, a bug in the constant passes green).
10. **Large data files** (CSV, sample JSON) committed next to the test, with a one-line comment on their origin.

## Sources

- B1 — Vladimir Khorikov, *Unit Testing Principles, Practices, and Patterns*, Manning, 2020 (ch. 4 titles) and “When to Mock”, 2020 — https://www.manning.com/books/unit-testing · https://livebook.manning.com/book/unit-testing/chapter-4 · https://enterprisecraftsmanship.com/posts/when-to-mock/
- B2 — Gerard Meszaros, *xUnit Test Patterns*, 2007 [NV: the site did not respond; smell definitions from secondary sources] — http://xunitpatterns.com/
- B3 — Martin Fowler, “Mocks Aren't Stubs”, 2007 — https://martinfowler.com/articles/mocksArentStubs.html
- B4 — Martin Fowler, “TestPyramid”, 2012 — https://martinfowler.com/bliki/TestPyramid.html
- B5 — Ham Vocke, “The Practical Test Pyramid”, 2018 — https://martinfowler.com/articles/practical-test-pyramid.html
- B6 — Martin Fowler, “Eradicating Non-Determinism in Tests”, 2011 — https://martinfowler.com/articles/nonDeterminism.html
- B7 — Martin Fowler, “TestCoverage”, 2012 — https://martinfowler.com/bliki/TestCoverage.html
- B8 — Martin Fowler, “ObjectMother”, 2006; Nat Pryce, “Test Data Builders”, 2007 (through Mark Seemann) — https://martinfowler.com/bliki/ObjectMother.html · https://blog.ploeh.dk/2017/08/15/test-data-builders-in-c/
- B9 — Kent C. Dodds, “Write tests. Not too many. Mostly integration.”, “The Testing Trophy and Testing Classifications”, “Effective Snapshot Testing” — https://kentcdodds.com/blog/write-tests · https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications · https://kentcdodds.com/blog/effective-snapshot-testing
- B10 — Spotify, “Testing of Microservices”, 2018 — https://engineering.atspotify.com/2018/01/testing-of-microservices
- B11 — Winters, Manshreck, Wright (eds.), *Software Engineering at Google*, chapters 11–14 — https://abseil.io/resources/swe-book/html/ch11.html · https://abseil.io/resources/swe-book/html/ch12.html · https://abseil.io/resources/swe-book/html/ch13.html · https://abseil.io/resources/swe-book/html/ch14.html
- B12 — Google Testing Blog, Testing on the Toilet: “Test Behavior, Not Implementation”, “Don't Put Logic in Tests”, “Tests Too DRY? Make Them DAMP!” [NV body: only titles, authors and dates] — https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html · https://testing.googleblog.com/2014/07/testing-on-toilet-dont-put-logic-in.html · https://testing.googleblog.com/2019/12/testing-on-toilet-tests-too-dry-make.html
- B13 — Testing Library, “About Queries” — https://testing-library.com/docs/queries/about/
- B14 — Playwright docs: Best Practices, Locators, Assertions, Visual comparisons, Mock APIs — https://playwright.dev/docs/best-practices · https://playwright.dev/docs/locators · https://playwright.dev/docs/test-assertions · https://playwright.dev/docs/test-snapshots · https://playwright.dev/docs/mock
- B15 — eslint-plugin-jest and eslint-plugin-playwright (rule names) — https://github.com/jest-community/eslint-plugin-jest · https://github.com/playwright-community/eslint-plugin-playwright
- B16 — Claessen and Hughes, “QuickCheck”, ICFP 2000; Hughes, “Experiences with QuickCheck”, 2016 — https://research.chalmers.se/en/publication/237427 · https://research.chalmers.se/en/publication/232550
- B17 — fast-check docs — https://fast-check.dev/docs/introduction/what-is-property-based-testing/ · https://fast-check.dev/docs/api/interfaces/Parameters/
- B18 — Petrović et al., “Does mutation testing improve testing practices?”, ICSE 2021; “Practical Mutation Testing at Scale”, IEEE TSE 2021 — https://arxiv.org/abs/2103.07189 · https://research.google/pubs/practical-mutation-testing-at-scale-a-view-from-google/
- B19 — Stryker, “Mutant states and metrics” — https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/
- B20 — Inozemtseva and Holmes, “Coverage Is Not Strongly Correlated with Test Suite Effectiveness”, ICSE 2014 — https://cs.ubc.ca/~rtholmes/papers/icse_2014_inozemtseva.pdf
- B21 — Zhao, Zhou, Cohen, “Do Coverage and Mutation Scores of LLM-Generated Test Suites Correlate with Their Effectiveness?”, ISSTA 2026, arXiv 2607.22880 — https://arxiv.org/abs/2607.22880
- B22 — Pact docs — https://docs.pact.io/ · https://docs.pact.io/faq/convinceme
- B23 — Testcontainers; `@testcontainers/postgresql` — https://testcontainers.com/ · https://node.testcontainers.org/modules/postgresql/
- B24 — Jest, “Snapshot Testing” — https://jestjs.io/docs/snapshot-testing
- B25 — Barr, Harman, McMinn, Shahbaz, Yoo, “The Oracle Problem in Software Testing: A Survey”, IEEE TSE 2015 — https://discovery.ucl.ac.uk/1471263/
- B26 — Konstantinou, Degiovanni, Papadakis, “Can we find bugs using LLM-generated oracles?”, arXiv 2410.21136 — https://arxiv.org/abs/2410.21136
- B27 — Banik, Chowdhury, Shamim, “All Smoke, No Alarm: Oracle Signals in Agent-Authored Test Code”, arXiv 2606.18168, IEEE AITest 2026 — https://arxiv.org/abs/2606.18168
- B28 — Tang et al., “ChatGPT vs SBST”, IEEE TSE 2024, arXiv 2307.00588 [figures from a search summary] — https://arxiv.org/abs/2307.00588
- B29 — Alshahwan et al., “Automated Unit Test Improvement using Large Language Models at Meta” (TestGen-LLM), FSE 2024 — https://arxiv.org/abs/2402.09171
- B30 — Zhong, Raghunathan, Carlini, “ImpossibleBench”, arXiv 2510.20270 — https://arxiv.org/abs/2510.20270
- B31 — Yu et al., “SWE-ABS”, arXiv 2603.00520; Aleithan et al., “SWE-Bench+”, arXiv 2410.06992 — https://arxiv.org/abs/2603.00520 · https://arxiv.org/abs/2410.06992
- B32 — “Test smells in LLM-Generated Unit Tests”, arXiv 2410.10628; “Using Large Language Models to Generate JUnit Tests”, arXiv 2305.00418 [figures from search summaries] — https://arxiv.org/abs/2410.10628 · https://arxiv.org/abs/2305.00418
- B33 — Milanese et al., “Human-Agent versus Human Pull Requests”, arXiv 2601.21194; arXiv 2607.18057; “Do Autonomous Agents Contribute Test Code?”, arXiv 2601.03556 — https://arxiv.org/abs/2601.21194 · https://arxiv.org/abs/2607.18057 · https://arxiv.org/abs/2601.03556
- B34 — ISTQB, *Certified Tester Foundation Level Syllabus v4.0*, ch. 4; ISTQB, “Boundary Value Analysis” white paper, 2025 — https://www.istqb.com/ctfl-v4-0/ · https://istqb.org/wp-content/uploads/2025/10/Boundary-Value-Analysis-white-paper.pdf
- B35 — Kuhn, Wallace, Gallo, “Software Fault Interactions and Implications for Software Testing”, IEEE TSE 2004; NIST, “Interactions involved in software failures” — https://csrc.nist.gov/pubs/journal/2004/06/software-fault-interactions-and-implications-for-s/final · https://csrc.nist.gov/Projects/automated-combinatorial-testing-for-software/combinatorial-methods-in-testing/interactions-involved-in-software-failures
- B36 — James Bach and Michael Bolton, “Testing and Checking Refined”; session-based test management — https://www.satisfice.com/blog/archives/856 · https://en.wikipedia.org/wiki/Session-based_testing
- B37 — Elisabeth Hendrickson, *Explore It!*, 2013 — https://www.oreilly.com/library/view/explore-it/9781941222584/
- B38 — ApprovalTests — https://approvaltests.com/
- B39 — Node.js `node:test` (MockTimers, `--test-randomize`, `--test-random-seed`); Vitest “Mocking dates” — https://nodejs.org/api/test.html#class-mocktimers · https://vitest.dev/guide/mocking/dates

The figures the kit's criteria cite: the 80.2 % of T4 is in B27 (syntactic oracle signals, not correctness); the
50–54 % of T2 coincides with B30 (GPT-5 54 %, Opus 4.1 about 50 %, o3 about 49 %); the 0.546 against 0.690 of T3
has no source (in B21, 0.546 is a p-value).

## Not verified

- The 0.546 against 0.690 of criterion T3: no source found.
- xunitpatterns.com does not connect (ECONNREFUSED) and archive.org is blocked: the smell catalog comes from secondary sources.
- The body of the Testing on the Toilet posts (B12): only title and comments loaded; the normative content rests on *Software Engineering at Google*, which was read.
- Khorikov: the blog “When to Mock” and the chapter 4 titles were verified; the text of the four pillars comes from a secondary summary.
- Hendrickson: the literal charter template (O'Reilly returned 403). ApprovalTests: authorship and the received/approved mechanics.
- Pairwise in ISTQB: it is not in the CTFL v4.0 excerpt; its place in the Test Analyst syllabus was not checked. Kuhn's per-system percentages are secondary.
- Tool flags and keys not opened: Vitest `--sequence.shuffle` and the branch threshold, the `assertFunctionNames` syntax, `mask` and `animations` of `toHaveScreenshot`, `storageState`, PICT, the Node version that ships `--test-randomize`.
- Figures of B28 and B32 come from search summaries, not from the tables of the papers.
- The detectors were tried over a synthetic sample and five real spec files; precision and recall over a large repository were not measured.
