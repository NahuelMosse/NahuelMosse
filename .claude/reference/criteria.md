# Inspection criteria: code at senior-team level

The bar a delivery of the method is inspected against. It is what a senior team would do with a
new feature in a web app, plus what agent-generated code is measured to get wrong. Every criterion
is answered **about the concrete delivery**, with evidence.

**It is the same list at the three moments of a card:** the plan walks it in `## Bar` before
writing code —one ID per line, how it is met or why it does not apply—, the implementation is
written against it, and the closing inspection answers it with evidence. Nobody works against one
bar and is measured against another. The goal is **every applicable criterion at `meets`**: the
whole list is known from the start, so what is missing is not a discovery, it is something that
was not done.

## How it is used

**Every criterion is answered with a state and its evidence** —the command and what it returned,
or `file:line`—:

| State | When |
|---|---|
| `meets` | it was verified and it holds |
| `fails H` | high: loses data, the acceptance criterion fails in real use, exposes personal data, opens an exploitable security hole, or the agent claims something it did not do |
| `fails M` | medium: bothers a real user, exposes something minor, or leaves a decision unwritten |
| `fails L` | low: a detail |
| `not applicable` | the feature does not exist in this card; the reason comes from the requirement |
| `not verified` | it could not be checked; it counts neither for nor against |

**The result has two parts, in this order:**
1. **The gate.** A single `fails H` leaves the delivery as **not deliverable**, whatever its
   points. `fails M` are counted separately.
2. **The score**, only among deliveries that passed the gate: met over applicable.

This fixes the two defects the judgment-based grade had: it added one high defect and five
details as if they weighed the same, and it subtracted points without saying why.

**A defect fails a single criterion**: the most specific one. If the same defect touches others,
those others are answered “see E1” and do not count as a separate failure. *Measured:* losing the
data on restart was counted in E1 and in R3; a broken frozen test, in T, K and C at once.

**What predates the card does not count against the card, and what belongs to the card is never
from before.** A defect in code the card did not create or modify, registered as `OUT-NN`, is
answered `not applicable` with that record as evidence. A defect in a file, route or function the
card created or modified is never `OUT`: it is answered with its failure, whether or not the
closing says so.

**A check that did not run is never `meets`.** “Could not run” counts only with the error output;
without it, it is a check that was not done and the criterion fails.

**«How» column:** `T` a tool verifies it; `C` a command with an expected result; `A` an attack or
probe against the running app; `J` judgment of whoever inspects, with evidence.

**«Grade» column:** the lowest grade at which the criterion enters the bar —`poc`, `mvp` or `production`—
(see «Grades» below). A criterion is required at its grade and at the ones above it.

**«Today» column:** how the method secures it in this version. `mechanism` = a hook or a tool
enforces it; `command` = it is in the stack profile (`stacks/`, rows keyed by criterion ID) and the agent runs it; `prose` = it is
written but nothing verifies it; **`—`** = the method does not ask for it.

**«Source» column:** the rule IDs of the topic references in `reference/` (`DB-*`, `OBS-*`, `SEC-*`,
`ARQ-*`, `TDD-*`, `LANE-*`, `DOC-*`, `API-*`, `DEP-*`, `LIC-*`, `VER-*`, `INF-*`, `COST-*`, `PERF-*`,
`LOAD-*`, `CI-*`, `CD-*`, `DPL-*`, `ERR-*`, `A11Y-*`, `UX-*`, `I18N-*`, `TEST-*`), where the rule, its
check by stack and its sources are written, and the external source. `node .claude/tools/bar.mjs <ID>`
prints the row; the rule is read from the reference by its ID.

**Sources:** at the foot of the document. Study figures come from the source read; what the
research could not read in the source is marked “unverified”.

---

## R · Requirements and scope

| ID | Criterion | How | Grade | Today | Source |
|---|---|---|---|---|---|
| R1 | The acceptance criterion is met **in real use**, the way whoever asked for it would use it, not only in the test | A | mvp | command (gate) | ISO 25010 functional suitability |
| R2 | Every gap in the card —what it does not say and has to be decided— is identified in writing, with its question | J | poc | command (10 questions) | SSDF PO.1.2 · Ambig-SWE |
| R3 | Every decision on a gap picks, if it exists, the option that works with any answer, and says so | J | poc | command (gate) | own, measured |
| R4 | The decisions that affect whoever uses or operates the product are in the README, with one `- <ID>-ASM-NN: <plain text>` line per assumption of the plan (`required.mjs` checks it) | J | mvp | prose | Google review: documentation |
| R5 | The questions for the business can be answered without extra explanation: in the business's language, without criteria IDs, ASVS IDs or method jargon | C | poc | command (`/close` check 7) | — |
| R6 | Every acceptance criterion has an identifiable test that proves it | C | mvp | command (tags) | SSDF PW.8.2 |
| R7 | **Every hunk of the diff corresponds to the card**; nothing added that nobody asked for without registering it | J | poc | prose (File map) | Google small CLs · agent PRs rejected for scope |
| R8 | The foreign defects that were seen are registered and were not touched; what the card changes of what already existed is declared | J | poc | mechanism (plan: `## Changes to existing behavior` · `out-of-scope.mjs`: an OUT does not point at what the card touched) | Microsoft playbook · OpenSpec |
| R9 | Every non-functional requirement has a measurable value, or the default budget of `reference/performance.md` is written as an `ASM-NN`, or it is declared that it has none | J | production | prose | ISO 25010 time behavior, capacity · PERF-01 |
| R10 | The applicable security requirements are identified, with the chosen ASVS level | J | mvp | prose | SSDF PO.1.2 |

## D · Design

| ID | Criterion | How | Grade | Today | Source |
|---|---|---|---|---|---|
| D1 | The new code lives in modules with a clear responsibility | J | mvp | prose | ISO 25010 modularity |
| D2 | Dependencies between layers go in one direction, and a test asserts it | C | production | command (architecture test) | ISO 5055 architectural conformity |
| D3 | No cycles between modules | T | production | command (stack profile) | ISO 5055 · ARQ-* · `madge --circular` |
| D4 | Deep modules: the interface is small compared to what it hides; no functions that only forward | J | production | prose (stack profile) | Ousterhout |
| D5 | The same knowledge is not repeated across several modules | J | mvp | prose (stack profile) | Ousterhout: information leakage |
| D6 | No speculative generality: no abstraction with a single use, no parameter nobody passes. **Does not count** what is injected to be able to test —the clock, the storage— nor what another criterion asks to register | J | poc | prose (ladder) | Fowler · Beck: fewest elements |
| D7 | What exists is reused before writing something new | J | poc | prose (ladder) | SSDF PW.4 · GitClear |
| D8 | For every external dependency there is an explicit policy —timeout, retry, what happens if it fails— in the matrix of `docs/technical/system-design.md` from production; below it, one README decision line per dependency (timeout, retry, what the user sees) | J | mvp | prose (README line · matrix) | ERR-RES-05 · ERR-RES-06 · ERR-RES-07 · ERR-RES-08 · Nygard: integration points · SRE PRR |
| D9 | Threat model of the feature: what data it handles, what comes in, where the trust boundary is (see S21, the living document) | J | production | prose | SSDF PW.1.1 · OWASP A06 · SEC-TM-01 |
| D10 | No secret or sensitive data travels to the client without need | A | mvp | prose | ISO 25010 confidentiality |
| D11 | Each module owns its tables; no other module reads or writes them directly | C | production | command (stack profile) | DB-OWN-01 · DB-OWN-02 · ARQ-* · Parnas 1972 |
| D12 | Contracts between modules are explicit (types or interfaces of the public index); cross effects go through that interface or an event | J | production | prose | ARQ-* · PAT-* |
| D13 | Front components talk through props, events or a public API; never another component's DOM or internal state | J | production | prose | ARQ-* |
| D14 | A card that changes the architecture —a new module, process, store or external dependency, or a change of boundary—: an ADR with two or more alternatives (one the boring or present one) on the six axes, and the choice justified | J | production | mechanism (required) | INF-* · DB-ENG-01 · DB-ENG-02 · Nygard 2011 · McKinley 2015 |
| D15 | Non-trivial third-party libraries sit behind an adapter module in infrastructure; domain and application do not import them, except the declared ones | C | production | command (stack profile) | DEP-* · ARQ-* |

## K · Code

| ID | Criterion | How | Grade | Today | Source |
|---|---|---|---|---|---|
| K1 | Strict-mode types and no compiler or linter suppressions without a written reason | C | mvp | command (stack profile) | SSDF PW.6 |
| K2 | No new problems from Sonar's quality rules in the diff, tests included | T | production | command (stack profile) | ISO 5055 · study of 302,600 agent commits |
| K3 | Cognitive complexity of every new function under the rule's threshold | T | production | command (stack profile) | ISO 5055 maintainability |
| K4 | Duplication in the new code under threshold, measured | T | poc | command (stack profile) | GitClear: copy-paste from 8.3% to 12.3% |
| K5 | No dead code: new symbols with no use, what a replacement left without use, files nothing imports, commented-out code | T | mvp | gate check `dead-code` (`tools/hygiene.mjs`) · command (stack profile) | agent symbols removed within 3 days |
| K6 | Names that say what the thing is in the domain | J | mvp | prose | Google review: naming |
| K7 | Comments explain why, do not repeat the code or narrate the change | J | mvp | prose | Google review · Ousterhout |
| K8 | Every input from outside is validated on entry, on the server | A | mvp | prose (stack profile) | ASVS · OWASP A05 |
| K9 | Open resources —files, connections, timers— are released | J | mvp | — | ISO 5055 reliability |
| K10 | No costly operations inside loops and no unbounded queries; database: P9–P11 | J | mvp | — | ISO 5055 efficiency · Nygard · DB-IDX-06 · DB-IDX-07 |
| K11 | Follows the repo's conventions: structure, style, way of handling errors | J | mvp | prose | Google review: consistency |
| K12 | The diff reads as if the repo were public: no secret, local path, real email or internal host, no debug leftover, commented-out code, TODO without its issue or trace of the chat; a repo declared `Visibility: public` also carries its license, changelog, contributing and security files | C | mvp | mechanism (gate: public · commit hook) | maintainer review of open-source projects |

## E · Errors and reliability

| ID | Criterion | How | Grade | Today | Source |
|---|---|---|---|---|---|
| E1 | What the user did survives a server restart | A | mvp | prose (edges) | ISO 25010 recoverability |
| E2 | A write cut off halfway leaves no broken data | A | mvp | prose (stack profile) | ISO 25010 fault tolerance |
| E3 | Two operations at once on the same thing do not lose data, or the decision is written; a read-modify-write uses an optimistic version or an atomic update | A | mvp | prose (edges) | Microsoft: concurrency · DB-TX-03 |
| E4 | An operation that changes state, repeated, does not duplicate it (idempotency); the idempotency key is persisted under a unique index | A | production | prose (G2: token twice) | Stripe · AWS Builders Library · DB-TX-04 |
| E5 | An error while generating or saving answers a controlled error and the server keeps running | A | mvp | prose (stack profile) | OWASP A10:2025 |
| E6 | No error is swallowed silently or leaks the trace to the user | C | mvp | command (C2: empty catch) | ISO 5055 · OWASP A10 |
| E7 | Corrupt data at startup: the app says so and stops, without overwriting | A | production | prose (stack profile) | — |
| E8 | Every call to an external system has an explicit timeout; database: timeout to obtain a pool connection, `statement_timeout` and `lock_timeout` of the role | C | mvp | prose (stack profile) | Nygard · DB-OPS-01 · DB-OPS-02 |
| E9 | Retries have growing waits and apply only to idempotent operations | J | production | — | Stripe · AWS · ERR-RES-03 · ERR-RES-04 |
| E10 | The common case does not force the caller to handle avoidable exceptions | J | production | — | Ousterhout · ERR-DES-01 |
| E11 | Typed errors cross layers with a translation at each boundary; no driver or ORM error reaches the response | J | production | prose | ERR-TAX-02 · ERR-LAY-02 · RFC 9457 |
| E12 | An error is logged once, where it is handled, and keeps its cause chain | C | production | command (stack profile) | ERR-CAP-01 · ERR-CAP-03 |
| E13 | Global handlers for unhandled errors exist, and no promise is left unhandled | C | mvp | command (stack profile) | ERR-CAP-09 · ERR-PROC-02 |
| E14 | Queues have a dead letter, a retry limit and an alert | J | production | prose | ERR-JOB-02 · ERR-JOB-03 · DB-TX-06 |
| E15 | Every error branch the card adds has its test; a live mutant on an error branch fails this criterion | T | mvp | mechanism (mutate · required) | ERR-TEST-01 · ERR-TEST-03 · TDD-* |
| E16 | The message the user sees says what happened and what to do, carries the reference id, keeps what the user typed and is accessible | A | production | prose | ERR-UX-01 · ERR-UX-02 · ERR-UX-03 · A11Y-FRM-03 |

## T · Tests

The rules behind these criteria, with the smell detectors and the templates, are in `reference/testing.md`.

| ID | Criterion | How | Grade | Today | Source |
|---|---|---|---|---|---|
| T1 | The card's tests were written **before** the code, by commit order | C | mvp | prose | SpecBench: tests written first · TDD-* |
| T2 | **No test was softened** to make it pass: not edited, not skipped, not deleted. The one exception is the fast lane's replacement of a string literal, verified by the guard | T | mvp | mechanism (guard) | ImpossibleBench (arXiv 2510.20270): in Claude models more than 79% of the cheating is modifying tests · TEST-IA-07 · TEST-VIS-04 · LANE-* |
| T3 | Mutation score over the new lines detects breakage (poc none · mvp domain files · production every file in the diff) | T | mvp | mechanism (mutate · required) | Google: Practical Mutation Testing at Scale · TEST-COB-02 · TEST-IA-10 |
| T4 | Every test asserts behavior: no tests without assertions, no assertions that hold by themselves | C | mvp | prose (T5) | Banik et al., “All Smoke, No Alarm” (arXiv 2606.18168): 80.2% of agent test patches carry weak or no oracle signals; it measures syntactic signals, not whether the test is correct · TEST-ORA-01 · TEST-ORA-02 · TEST-ORA-05 |
| T5 | Behavior is tested, not implementation: a refactor that does not change behavior does not break tests | J | mvp | — | Software Engineering at Google, ch. 12 · TEST-BUE-02 · TEST-DBL-04 |
| T6 | No logic inside tests: loops, conditionals, calculations | T | mvp | mechanism (required: linter over every test in the diff, with `no-conditional-in-test`) | idem · TEST-BUE-06 |
| T7 | Tests run in any order and in parallel with the same result | C | mvp | prose | Google: flaky tests · TEST-DET-04 · TEST-INT-02 |
| T8 | No flaky tests: ten runs, the same result | C | mvp | — | Google: 17% of flaky cases were real bugs · TEST-DET-01 · TEST-E2E-03 |
| T9 | Business rules have tests without a browser | J | mvp | prose (T2) | test pyramid · TEST-EST-01 |
| T10 | Each of the plan's edges has its own test | C | mvp | — | own · TEST-DIS-02 · TEST-EST-04 |
| T11 | Coverage of the new lines of 80% or more | T | production | command (stack profile) | Sonar way quality gate · TEST-COB-01 |
| T12 | Screen tests look up by role and accessible name, not by structure | C | mvp | command (stack profile) | Testing Library · TEST-E2E-01 |
| T13 | Domain logic with rules or calculations (`rule` in the File map): its unit test is committed before the code | C | mvp | mechanism (required) | TDD-* · Nagappan 2008 · Fucci 2017 |
| T14 | A poc's diff brings no logic: data is mocked in presentation files; logic belongs to the mvp | C | poc | mechanism (require-bar · required) | LANE-* |

## S · Security (attacking the running app)

| ID | Criterion | How | Grade | Today | Source |
|---|---|---|---|---|---|
| S1 | A request that changes state or downloads personal data **and that a browser would send with ambient credentials (cookie, HTTP auth, client certificate)**, from another site, another port or a null or foreign `Origin` is rejected; a request with no `Origin` (a client that is not a browser) is served. With no ambient credentials there is nothing to forge from another site: the row is a decision —`S1 · no ambient credentials · <who calls the API and how>`— and the `attacks:` line runs with `--no-ambient`, which checks mechanically that no legitimate response sets `Set-Cookie` or asks `WWW-Authenticate`. No defense a criterion adds fails a call the card documents as valid: if it would, it is an `AMB`/`ASM` in the cheapest-to-undo reading, never a default 403 | T | mvp | mechanism (attack) | ASVS · measured in CLI-9 |
| S2 | A foreign `Host`, a huge body and a method that does not apply are rejected; the host the card is used with (`localhost`, `127.0.0.1`, the shared app's) is never rejected by default | T | mvp | mechanism (attack) | ASVS |
| S3 | No injection: parameterized queries, with an allow-list for what cannot be parameterized, output escaped according to context, no concatenating input into commands or paths | T + A | mvp | command (stack profile) | Pearce: ~40% vulnerable · Perry: 36% with SQL injection against 7% · DB-SEC-02 |
| S4 | XSS: what the user types and comes back to the screen is escaped, on the screens the card touched | A | mvp | prose | Veracode: 86% without defense (verified, see SEC-AI-*) |
| S5 | Access control is applied on the server, on every route and object; it is tested with another user | A | mvp | prose (stack profile) | OWASP A01 |
| S6 | Values another program would execute —formulas in a CSV— are neutralized without breaking legitimate data | A | production | prose (edges) | OWASP CSV injection · measured |
| S7 | CSP, `nosniff`, and `no-store` on responses with personal data | C | production | prose (stack profile) | OWASP A02:2025 |
| S8 | A result message cannot be produced without the action | A | mvp | prose (edges) | measured |
| S9 | No secrets in the code, the configuration or the history | T | poc | command (stack profile) | 81.1% of agent credentials undetected |
| S10 | **Every new dependency exists in the registry**, has reasonable age, downloads and repo, and is needed | C | mvp | command (stack profile) | 19.7% of packages invented; 43% repeat |
| S11 | The dependencies have no known vulnerabilities and are pinned by lockfile | T | mvp | command (stack profile) | OWASP A03:2025 |
| S12 | Licenses of what is new —dependencies, fonts, icons, images, copied fragments— are within the default list of `reference/dependencies.md` or the repo's own | T | mvp | command (stack profile) | SSDF · LIC-* |
| S13 | Cryptography uses standard algorithms; passwords with bcrypt or argon2 | T | mvp | — | Pearce: CWE-522 |
| S14 | Security events —access denied, rejection— are logged without personal data | C | production | — | OWASP A09 |
| S15 | ASVS matrix answered for the chapters the card touches | J | production | prose (stack profile) | ASVS 5.0 |
| S16 | For every security finding, the same pattern searched in the rest of the code | C | production | prose (stack profile) | SSDF RV.3 |
| S17 | Baseline dynamic scan without medium or high alerts | T | production | command (stack profile, untested) | OWASP ZAP |
| S18 | Update policy configured (bot, grouped, majors apart, at most one major behind); what the card adds is on the latest major | C | production | command (stack profile) | DEP-* |
| S19 | THIRD_PARTY_NOTICES.md generated by command, with attribution; every new dependency appears in it | C | mvp | mechanism (required · stack profile) | LIC-* · Apache-2.0 section 4 |
| S20 | The app connects with its own least-privilege database user, distinct from the migrations user | C | production | command (stack profile) | DB-SEC-04 · SEC-* |
| S21 | A STRIDE threat model per surface lives in system-design.md, updated with each new public endpoint, integration, upload or role | J | production | mechanism (required) | SEC-TM-01 · SEC-TM-02 · OWASP Threat Modeling |
| S22 | Secrets: a manager per environment, .env only local and ignored with .env.example, an inventory without values, rotation and revocation in the runbook, OIDC or managed identities over long-lived keys, a secret scanner as pre-commit | C | production | mechanism (required) | SEC-SECR-01 · SEC-SECR-09 · SEC-* |
| S23 | CI supply chain: actions pinned by SHA, least-privilege CI token, image and IaC scanned | C | production | command (stack profile) | SEC-SC-* · CI-* · SLSA |
| S24 | Runtime hardening: container without root, rate limit on authentication, explicit CORS | C | production | command (stack profile) | SEC-RT-* · ASVS |

## P · Data and privacy

| ID | Criterion | How | Grade | Today | Source |
|---|---|---|---|---|---|
| P1 | The personal data the card touches is identified and minimized | J | mvp | prose | ISO 25010 confidentiality |
| P2 | A test sends known personal data and secrets and verifies they do not appear in logs, error messages or traces | T | production | command (stack profile) | Microsoft · OWASP A09 · OBS-LOG-* · SEC-* |
| P3 | Responses return only the necessary fields | A | mvp | — | ASVS V15.3.1 |
| P4 | A schema or data-format change goes expand, migrate, contract; nothing is dropped or renamed in one step; a destructive change has a verified backup and human approval | C | production | command (stack profile) | Fowler: parallel change · DORA · DB-MIG-02 · DB-MIG-11 · DB-MIG-16 |
| P5 | Migrations are versioned scripts, tested up, down and up on existing data and applied over main's latest state with data, with the same engine and version as production, and run inside the pipeline (O28) | C | mvp | command (stack profile) | DORA: database change management · DB-MIG-09 · DB-MIG-10 · DB-MIG-15 |
| P6 | Integrity in what is stored: foreign keys, NOT NULL, UNIQUE and CHECK in the database; `_id` columns without a foreign key are listed and an invalid insert is tested | C | mvp | command (stack profile) | ISO 25010 integrity · DB-MOD-04 |
| P7 | Retention, archiving and backups with RPO and RTO of what is new are in system-design.md; the restore is tested (stack profile) if the card adds or changes a store | C | production | command (stack profile) | SRE · DB-OPS-04 · DB-OPS-05 · DB-OPS-07 |
| P8 | Correct types: decimal for money, instants with zone or in UTC | C | mvp | command (stack profile) | DB-MOD-05 · I18N-FMT-04 |
| P9 | Every new query over a growing table has its index; EXPLAIN with the card's volume shows no full scan; foreign keys indexed | C | mvp | command (stack profile) | DB-IDX-01 · DB-IDX-02 · DB-IDX-03 · DB-IDX-05 · Winand |
| P10 | No N+1: a test counts queries per request with N=1 and N=k and expects the same number | T | production | command (stack profile) | DB-IDX-06 |
| P11 | Growing lists paginate by keyset with a unique tiebreaker; no SELECT * on hot paths | C | production | command (stack profile) | DB-IDX-07 · DB-IDX-04 |
| P12 | Indexes and constraints are created without blocking where the engine allows it, with lock_timeout in migrations | C | production | command (stack profile) | DB-MIG-03 · DB-MIG-04 · DB-MIG-05 |
| P13 | Nothing external inside an open transaction; events from a data change go through an outbox | J | production | prose | DB-TX-05 · DB-TX-06 |
| P14 | The data model is in system-design.md before the code: entities, relations, owner, cardinality, volume, queries with their index, migrations | J | production | mechanism (require-bar · required) | DB-OPS-04 · INF-* |
| P15 | Personal data inventoried and classified in system-design.md, with retention, encryption at rest and encrypted backups, under the data-protection norm named in system-design.md (see `reference/security.md`) | J | production | mechanism (required) | SEC-DAT-03 · DB-SEC-07 · the applicable norm |
| P16 | A migration that exists on the main branch is never edited, renamed or deleted; new migrations sort after main's last one with a single history head; the model has no migration pending; the new migrations apply on top of main's last state with seeded data | C | mvp | mechanism (guard · required) | DB-MIG-12 · DB-MIG-13 · DB-MIG-14 · DB-MIG-15 · DB-MIG-17 · DB-MIG-19 · DB-MIG-20 |
| P17 | Every new table has its primary key per the repo's id decision (UUIDv7 by default, never serial or int), `created_at` and `updated_at` as timestamptz NOT NULL (only `created_at` in a declared append-only table) | C | mvp | mechanism (gate table-shape) | DB-MOD-03 · DB-MOD-14 · RFC 9562 |

## O · Operation and safe change

| ID | Criterion | How | Grade | Today | Source |
|---|---|---|---|---|---|
| O1 | Installs and starts from a clean clone without hidden steps | C | mvp | command (stack profile) | 12-Factor |
| O2 | Configuration comes from the environment, not the code; no fixed URLs or paths | C | mvp | — | 12-Factor III |
| O3 | Default paths do not depend on the folder it is started from | A | mvp | — | measured in CLI-11 |
| O4 | Shutdown is clean: on SIGTERM it finishes what is in progress and releases resources | A | production | — | 12-Factor IX · SRE |
| O5 | Logs to standard output as JSON with level, and the important business events are recorded with a stable name | A | production | command (stack profile) | 12-Factor XI · SRE · OBS-LOG-02 · OBS-LOG-06 |
| O6 | What fails in the new feature is visible: an error is tracked with the app version and the correlation id, and stays in the log with what is needed to diagnose it | J | mvp | command (stack profile) | SRE: monitoring · OBS-* · ERR-* |
| O7 | Listens only on the port it declares and does not write outside its folder | C | mvp | command (stack profile) | — |
| O8 | Change how the app starts or is deployed only if the card asks for it | J | poc | prose | measured in a legacy repo |
| O9 | The feature can be turned off or reverted without losing data; a feature flag has an owner and a retirement date | J | production | prose | Fowler: feature toggles · DORA · CD-* |
| O10 | Response time measured **and within budget**, with the volume the card asks for, **with the machine under no other load**; R1 is the per-card smoke and the full load test is O22; an operation does not degrade with more data or block the server | C | production | command (stack profile) | ISO 25010 · measured in CLI-11: the same POST took 84 ms alone and 589 ms with two other inspections in parallel · PERF-* · LOAD-* |
| O11 | The whole screen suite runs once per card, not once per fix | T | mvp | mechanism (once) | measured |
| O12 | What the validations generate —coverage, logs, probes— does not stay in the repo. **The evidence the method delivers does**: closing captures, ASVS matrix and accessibility report, in `specs/<card>/` | C | mvp | command (F4) | — |
| O13 | A versioned cost model: price, URL and date per component, observability ingest and retention included, totals today and at 10x; updated with every infra change | C | production | mechanism (required) | COST-01 · INF-* · AWS Well-Architected · FinOps |
| O14 | Infrastructure described as it is today in system-design.md: deployment, environments, scaling, secrets, linked cost | J | production | mechanism (require-bar · required) | INF-* · C4 |
| O15 | Front: initial JS per route under budget and Web Vitals (LCP, INP, CLS) under budget, measured by command | C | production | command (stack profile) | PERF-* · FE-PERF-* · the front-end section of `reference/performance.md` · web.dev |
| O16 | SemVer, a single version in the manifest, a tag per release, the version exposed by the app | C | production | command (stack profile) | VER-* · semver.org |
| O17 | Every request carries a correlation id that reaches external calls and jobs and appears in every log line | T | production | command (stack profile) | OBS-LOG-* · W3C Trace Context |
| O18 | /health (liveness) and /ready (checks dependencies) exist and are verified by command | C | mvp | command (stack profile) | OBS-* |
| O19 | RED per endpoint, USE for pool and queues, and OpenTelemetry instrumentation present | C | production | command (stack profile) | OBS-MED-* · Wilkie (RED) · Gregg (USE) · OpenTelemetry |
| O20 | Availability and latency SLOs in system-design.md, coherent with O10; alerts as code on symptoms or burn rate | J | production | prose | OBS-MED-07 · OBS-ALR-01 · OBS-ALR-04 · Google SRE workbook |
| O21 | Supportability: a user-visible error carries a reference id that support finds in the logs; every alert links its runbook section, written by symptom | A | production | command (stack profile) | OBS-ALR-05 · OBS-ALR-06 · OBS-SUP-03 · ERR-UX-* |
| O22 | Full load test on a release, a hot-path card or a volume requirement: type chosen, thresholds as a gate, open model without coordinated omission, generator off the measured machine or declared | C | production | command (stack profile) | LOAD-* · PERF-* |
| O23 | The pipeline is code and runs the same verify commands as the plan's Verification | C | mvp | mechanism (required) | CI-* |
| O24 | One build artifact promoted across environments | J | production | prose | CD-* · Humble and Farley |
| O25 | Commit stage fast (target 10 minutes or less) | C | production | command (stack profile) | CI-* |
| O26 | Flaky tests quarantined with owner and card, never silent retries | C | production | mechanism (required: A9 grep) | CI-* · Google flaky tests |
| O27 | Required checks and branch protection on the main branch | C | production | command (stack profile) | CI-* |
| O28 | Migrations run inside the pipeline, never by hand | C | production | command (stack profile) | CD-* · DB-MIG-01 |
| O29 | Post-deploy smoke and a tested rollback | C | production | command (stack profile) | CD-* · DPL-* |
| O30 | DORA metrics measured | J | production | prose | CD-* · DORA |

## I · Interaction and accessibility

Prioritized with the WebAIM Million 2026: 96% of errors fall in the first six.

| ID | Criterion | How | Grade | Today | Source |
|---|---|---|---|---|---|
| I1 | Text contrast 4.5:1, or 3:1 for large text | T | mvp | prose (stack profile) | WCAG 1.4.3 · 83.9% of pages fail · A11Y-COL-01 |
| I2 | Every informative image has alternative text | T | mvp | prose (stack profile) | WCAG 1.1.1 · 53.1% · A11Y-SEM-07 |
| I3 | Every field has an associated label | T | mvp | prose (stack profile) | WCAG 1.3.1/4.1.2 · 51% · A11Y-FRM-01 |
| I4 | No empty link or button | T | mvp | prose (stack profile) | WCAG 2.4.4/4.1.2 · 46.3% · A11Y-SEM-02 |
| I5 | The page declares the language | T | mvp | prose (stack profile) | WCAG 3.1.1 · A11Y-SEM-06 · I18N-NEG-03 |
| I6 | Everything is operated by keyboard, in logical order, with visible focus | A | mvp | prose (stack profile) | WCAG 2.1.1/2.4.7 · A11Y-KBD-01 |
| I7 | Errors are announced and tied to the field; help on the expected format | A | mvp | prose (stack profile) | WCAG 3.3.1/3.3.2/4.1.3 · A11Y-FRM-03 |
| I8 | Touch targets of 24 × 24 px or more | A | mvp | prose (stack profile) | WCAG 2.5.8 · A11Y-RSP-04 |
| I9 | It is usable at 320 px wide without horizontal scroll, and with text zoomed to 200% | A | mvp | prose (stack profile) | WCAG 1.4.10 · WCAG 1.4.4 · A11Y-RSP-01 |
| I10 | After an action, the screen comes back as it was: search, filter, focus | A | mvp | prose (edges) | measured in CLI-11 · A11Y-KBD-06 |
| I11 | A resource that does not exist gives 404 on the new screens | A | mvp | prose (edges) | measured in CLI-11 |
| I12 | The texts are clear for whoever uses the screen | J | poc | prose | ISO 25010 self-descriptiveness · A11Y-DOC-04 |
| I13 | No text overflows at its real length or with pseudo-localization, at 320, 390 and 1280 px | C | mvp | command (overflow.mjs) | A11Y-RSP-02 · I18N-LAY-01 · LANE-* |
| I14 | The WCAG 2.2 AA criteria the kit did not cover: 2.4.11, 2.5.7, 3.2.6, 3.3.7, 3.3.8 | A | production | prose | A11Y-KBD-04 · A11Y-AUT-01 · WCAG 2.2 · UX-ARRASTRE-1 |
| I15 | Manual screen reader protocol on each new screen, recorded with reader, browser and result | A | production | prose | A11Y-PRO-04 · A11Y-PRO-05 |
| I16 | Complex components follow their APG pattern: roles, states and keyboard map, with a keyboard test per pattern | C | production | command (stack profile) | A11Y-APG-* · WAI-ARIA APG |
| I17 | An accessibility statement is kept in the docs | J | production | prose | A11Y-PRO-06 · Ley 26.653 · EAA · EN 301 549 |
| I18 | One primary button per view; a loading button keeps its size and cannot submit twice | T | mvp | prose | UX-BOTON-1 · GOV.UK · Atlassian |
| I19 | A modal does not open another modal; one popover at a time, never in cascade | T | mvp | prose | UX-OVERLAY-1 · UX-OVERLAY-2 · NN/g |
| I20 | A toast with an action stays at least 10 s and its action also exists outside it; an error toast is not dismissed by itself; the live region exists on load | T | mvp | prose | UX-FEEDBACK-2 · UX-FEEDBACK-3 · WCAG 2.2.1 |
| I21 | A switch applies its change at once and never lives in a form with a submit button | T | mvp | prose | UX-CHECK-SWITCH-1 · NN/g · Apple HIG |
| I22 | Validation runs when the person tries to advance, never on leaving an empty field; a field with an error is re-validated while it is corrected | T | mvp | prose | UX-INPUT-1 · GOV.UK |
| I23 | While loading, a loading indicator is shown and never a “No records” later contradicted; a skeleton appears only after about 300 ms | T | mvp | prose | UX-VACIO-1 · UX-CARGA-1 · NN/g |
| I24 | A reversible deletion opens no dialog and offers Undo; an irreversible action has a specific confirmation with initial focus on Cancel | T | mvp | prose | UX-CONFIRMAR-1 · UX-CONFIRMAR-2 |
| I25 | A loop pauses off screen and with a hidden tab; an entry effect runs once per session; a celebration can be turned off; an animated figure exposes its final value from the first frame | T | production | prose | UX-VIDA-1 · UX-VIDA-2 · UX-VIDA-3 · UX-VIDA-4 · WCAG 2.2.2 |
| I26 | Formats and instants are explicit: `Intl` with a locale (and a zone for dates), money as data with its ISO 4217 code, instants stored in UTC, UTF-8 and NFC, identifiers compared invariantly | C | mvp | command (stack profile) | I18N-FMT-01 · I18N-FMT-04 · I18N-FMT-05 · I18N-INP-05 · W3C Working with Time and Timezones · CLDR |
| I27 | Visible text is externalized with a description for the translator, as whole sentences with no concatenation, and does not mix contexts | C | production | prose | I18N-STR-01 · I18N-STR-03 · I18N-STR-05 · Mozilla l10n best practices |
| I28 | Plurals and genders choose their form by CLDR category with `other` present, never with `n === 1`, and values inside a message are formatted by locale | T | production | prose | I18N-STR-06 · I18N-STR-07 · I18N-TST-05 · CLDR plural rules |
| I29 | The layout tolerates text growth and other scripts: logical properties, no fixed width in text containers, truncation by graphemes, case changed with the locale | T | production | command (overflow.mjs) | I18N-LAY-01 · I18N-LAY-02 · I18N-LAY-06 · MDN logical properties |
| I30 | In a right-to-left locale the base direction is in the markup, user text is isolated, directional icons are mirrored and arrows invert in horizontal widgets | T | production | prose | I18N-LAY-03 · I18N-LAY-04 · I18N-A11-03 · W3C bidi |
| I31 | Message catalogs are complete and in sync with the code, and a pseudo-locale walk finds no unmarked text and no clipping | C | production | prose | I18N-FLW-02 · I18N-FLW-03 · I18N-TST-01 · I18N-TST-02 |
| I32 | The plan states the i18n level and the locale matrix; language is negotiated in a stated order with a fallback chain and independent preferences, and `hreflang` is reciprocal if there are public pages | J | production | prose | I18N-ACT-01 · I18N-NEG-01 · I18N-NEG-02 · BCP 47 · Google hreflang |
| I33 | The screen has one focal point, found in 3 seconds, and its hierarchy comes from type and space | J | production | prose | research-diseno 4.2 · `## Look` |
| I34 | The direction of `## Look` is recognized on the screen, and the screen is no generic template | J | production | prose | research-diseno 4.2 |
| I35 | Components of one family share radius, shadow, easing and spring | J | production | prose | research-diseno 4.2 |
| I36 | Motion explains a change of state and does not distract from the task | J | production | prose | research-diseno 4.2 · UX-VIDA-* |
| I37 | The empty, error and loading states have useful copy and look designed | J | production | prose | research-diseno 4.2 · UX-VACIO-1 |
| I38 | The assets are specific to the product and the copy is clear and specific | J | production | prose | research-diseno 4.2 |
| I39 | Density and vertical rhythm: air between groups, grouping by proximity | J | production | prose | research-diseno 4.2 |
| I40 | Against the `ref:`, the differences of the last capture round are listed, each corrected or justified | J | production | prose | research-diseno 4.2 · `rondas.md` |

## C · Compatibility

| ID | Criterion | How | Grade | Today | Source |
|---|---|---|---|---|---|
| C1 | Works with the real program that consumes it, with the configuration of whoever asked for it and with other common ones | A | mvp | prose (edges, test-first rule) | measured in CLI-9 |
| C2 | Legitimate uncommon data is preserved exactly end to end: `+`, leading zeros, apostrophes, accents | A | mvp | prose (edges) | measured in CLI-9 |
| C3 | Breaks nothing that already worked: the previous suite passes whole | C | mvp | command (stack profile) | — |
| C4 | Responses for existing clients do not change | C | mvp | — | Stripe: API versioning · API-* |

## A · What fails in agent-generated code

| ID | Criterion | How | Grade | Today | Source |
|---|---|---|---|---|---|
| A1 | **Every success claim has a command with its output** in the record; nothing is reported as verified without having run | C | mvp | prose (three states) | 75.8% of failures with explicit state are false success |
| A2 | The closing does not mention changes that are not in the diff | C | poc | — | 45.4% of PRs inconsistent due to “phantom changes” |
| A3 | Ambiguities are asked, not resolved silently | J | poc | prose (10 questions) | Ambig-SWE: asking improves up to 74% |
| A4 | The project's constraints are respected, verified with executable checks | C | mvp | mechanism (hooks) | 38.33% of symptoms are constraint violations (unverified) |
| A5 | The size of the **production** diff —without `specs/` or tests— is proportional to the request and to the criteria that apply | C | poc | — | Google small CLs · agent PRs rejected for size |
| A6 | The feature is wired end to end, not only what the test checks | A | mvp | command (gate) | agents deliver what the test looks at |
| A7 | If a language model evaluates or reviews, it is repeated and its output does not replace a command | C | production | prose | 13.6% of judgments flip between runs |
| A8 | If the code calls a model: its output is validated as untrusted input, the system prompt is separated from the user input, least permissions, consumption limits | J | mvp | — | OWASP Top 10 for LLM 2025 · SEC-LLM-* |
| A9 | The agent never disables a test, adds continue-on-error or skips hooks to make the pipeline pass | C | poc | mechanism (required · guard-shell) | CI-AI-* · TEST-IA-07 · ImpossibleBench (arXiv 2510.20270) |

## V · Process and evidence

| ID | Criterion | How | Grade | Today | Source |
|---|---|---|---|---|---|
| V1 | The requirement was recorded as it arrived, frozen | C | poc | mechanism (guard) | — |
| V2 | There is a plan written before the code, with the bar and the edges | C | mvp | mechanism (require-bar) | — |
| V3 | The change is committed, with messages that say what and why, with Conventional Commits or the repo's convention | C | poc | command (stack profile) | Google: change descriptions · VER-* |
| V4 | There is a record of the AI session: tool, model, cost, where the full record is | C | mvp | prose (F3) | ISO 42001 A.6.2.8 (unverified) · NIST AI RMF GOVERN 1.4 |
| V5 | Accessibility evidence criterion by criterion, if the card touched a screen | J | mvp | prose (stack profile) | WCAG · VPAT · A11Y-PRO-03 · A11Y-PRO-07 |
| V6 | The comment for the client comes only from the output of the validations | J | mvp | prose | — |
| V7 | A person approves before merging | J | poc | prose (snapshot `proposed`) | SSDF PW.7 · ISO 42001 |

## W · Documentation

| ID | Criterion | How | Grade | Today | Source |
|---|---|---|---|---|---|
| W1 | Docs in Markdown in the repo, in the same diff as the code, built or validated by the default command or CI | C | mvp | command (stack profile) | DOC-* · Write the Docs |
| W2 | Diátaxis structure: every page declares its type | J | production | prose | DOC-* · diataxis.fr |
| W3 | Business docs: what it does, how it is used, rules and limits, in the business's language, without jargon or IDs | J | production | prose | DOC-* |
| W4 | Technical docs: C4 context and containers, and a page per module (responsibility, decisions, data flow) | J | production | prose | DOC-* · c4model.com |
| W5 | Runbook: deploy, rollback, diagnosis, one section per alert by symptom, secret rotation and revocation, security incident response | J | production | prose | DOC-* · OBS-SUP-06 · SEC-IR-03 · Google SRE |
| W6 | A card that changes behavior updates in its own diff the feature page (rules, edge cases, its tests), the API contract when it touches a route and docs/data-model.md when it touches the schema | C | mvp | mechanism (gate docs) | DOC-* |
| W7 | Links in the docs are valid | T | mvp | command (stack profile) | DOC-* |
| W8 | If there is an API: a contract with examples, errors, auth, version and deprecation policy, linted; the published interactive reference comes from that same spec, “Try it out” never reaches production, and the docs UI is not open in production when the API is internal | C | mvp | command (stack profile) | API-* · OpenAPI 3.1 · RFC 9745 · RFC 8594 · OWASP API9 |
| W9 | The contract matches the implementation, by a contract test | T | mvp | command (stack profile) | API-* |
| W10 | A diagram is code that renders with exit 0 in CI; its title states the conclusion, it has a legend, every arrow carries a verb, and its alt text (or `accTitle`/`accDescr`) says the conclusion | C | production | mechanism (required) | DOC-16 · DOC-17 · DOC-18 · DOC-22 · c4model.com |
| W11 | The figure is chosen by the question it answers; what is quantitative comes from versioned data with its source; no figure is orphaned from the text | J | production | prose | DOC-20 · DOC-21 · DOC-23 · Visual Vocabulary · Cleveland-McGill |

---

## Grades

A project in `poc` wants to know whether the concept works; one in `production` already knows and needs
a real product. The grade of the repo (`node .claude/tools/kit.mjs grade <poc|mvp|production> --reason "…"`,
written in `.claude/kit.json`; **production** when none is chosen) decides how much of this list is the bar.
It only goes up, between cards; unattended nobody lowers it or chooses `poc`. Moving up prints what is now
required and was not before: that is the debt to close.

| Grade | The bar |
|---|---|
| `poc` | A facade to show how it would look: presentation with mock data, minimally functional (navigation, buttons and forms answer with mock data), nothing behind. It keeps the whole requirement read and frozen, the open gaps as ASMs in `## Specs` (no round of questions), the stack, folder structure and design rules, a push of the card's branch only and no merge. Its diff brings no logic (T14). It drops tests, Tasks, Gate, mutation, the judge, the accessibility sweep, performance budgets and the modules `docs`, `i18n`, `observability`, `api`, `ci` and `infra`. The only validation is one capture round at 390 and 1440 px. The time cap is at most 2× the likely time (goal 1×). |
| `mvp` | Adds basic security (OWASP top 10), accessibility AA on what is touched, the plan judge only when `risk.json` says high, the API documented (W8, W9), the pipeline, health and visibility of failures, and mutation of the domain only (files under `domain/` or marked `rule`, and a screen's pure `*-state.js`); cap at most 8× (goal 4×). |
| `production` | Everything in this list. `security-l2` stays opt-in on top. |

**What a grade leaves out is never removed in silence.** `modules.json` defines it —per module a `grades`
(`{ "poc": "off" }`, default on) and in `core.byGrade` the blocks of criteria a grade leaves out, each with
its reason— and `kit.mjs` reads it as one more source of «off», next to the modules a person turned off.
`bar.mjs` shows the grade on top and one line `<block> · off by grade: <grade> — <reason>` for each block;
the plan's `## Bar` copies those lines, `required.mjs` skips the checks of the criteria left out and `/close`
names the grade. The «Grade» column and `modules.json` say the same thing: a test compares them.

The screen's machinery is graded too: a module's `gradeProcedures` name what it asks to build and the grade
leaves out, and `bar.mjs` shows each as the same `<procedure> · off by grade: <grade> — <reason>` line.
At `poc` a screen has no `design/line.md`, no component set copied from the templates, no `screen-audit.md`
and one capture round, at 390 and 1440 px; at `mvp` it has the line and the capture rounds of the bar, and the set holds only the
components the card uses; `production` asks the whole of it. **At `poc` the scope is the card's:** a signal
that shows up while it is written (a route, a second language, a worker) does not turn a module on; it is
noted as an `<ID>-OUT-NN` proposal.

Criteria required at each grade (cumulative), by area:

| | Criteria | poc | mvp | production |
|---|---|---|---|---|
| R · Requirements and scope | 10 | 5 | 9 | 10 |
| D · Design | 15 | 2 | 6 | 15 |
| K · Code | 12 | 1 | 10 | 12 |
| E · Errors and reliability | 16 | 0 | 8 | 16 |
| T · Tests | 14 | 1 | 13 | 14 |
| S · Security | 24 | 1 | 12 | 24 |
| P · Data and privacy | 17 | 0 | 8 | 17 |
| O · Operation and safe change | 30 | 1 | 10 | 30 |
| I · Interaction and accessibility | 40 | 1 | 21 | 40 |
| C · Compatibility | 4 | 0 | 4 | 4 |
| A · Agent failures | 9 | 4 | 8 | 9 |
| V · Process and evidence | 7 | 3 | 7 | 7 |
| W · Documentation | 11 | 0 | 5 | 11 |
| **Total** | **209** | **19** | **121** | **209** |

## What this list says about the method today

| | Criteria | Mechanism | Command | Prose | Not asked |
|---|---|---|---|---|---|
| R · Requirements and scope | 10 | 3 | 3 | 4 | 0 |
| D · Design | 15 | 1 | 4 | 10 | 0 |
| K · Code | 12 | 1 | 5 | 4 | 2 |
| E · Errors and reliability | 16 | 1 | 3 | 10 | 2 |
| T · Tests | 14 | 5 | 2 | 4 | 3 |
| S · Security | 24 | 5 | 10 | 7 | 2 |
| P · Data and privacy | 17 | 4 | 10 | 2 | 1 |
| O · Operation and safe change | 30 | 5 | 17 | 5 | 3 |
| I · Interaction and accessibility | 40 | 0 | 3 | 37 | 0 |
| C · Compatibility | 4 | 0 | 1 | 2 | 1 |
| A · Agent failures | 9 | 3 | 0 | 3 | 3 |
| V · Process and evidence | 7 | 2 | 1 | 4 | 0 |
| W · Documentation | 11 | 2 | 4 | 5 | 0 |
| **Total** | **209** | **32** | **63** | **97** | **17** |

**Only 32 of 209 criteria are secured by a mechanism.** Another 63 depend on the agent running a
command; 97 are written and nothing verifies them; 17 the method does not ask for. The measured
runs fail precisely on the prose ones: the state after the action, the legitimate data a defense
breaks, the request from another port. The ones that moved to mechanism —the review cap, the bar
before the code, the attacks— stopped failing.

**The path for code to come out at senior-team level the first time** is to move criteria from
prose to mechanism, in this order:
1. **The ones that give high failures and today are prose:** E1 to E5 —restart, cut-off write,
   concurrency, idempotency, controlled error— and S5 —access control—. A script in the profile
   that attacks them against the running app, as `attack.mjs` does with the origin.
2. **The agent ones:** A1 —no claim without its output— and A2 —nothing in the closing that is
   not in the diff—. They are the two that repeat most in the studies and the two easiest to
   enforce with a hook on the closing.
3. **Accessibility:** I1 to I5 are covered by axe in one run; today they are in prose only because
   there is no per-ID command in the profile.
4. **The ones the method does not ask for:** data and privacy (P3), operation (O2 to O4), and K9.

---

## Sources

**Standards**
- ISO/IEC 25010:2023 — https://iso25000.com/index.php/en/iso-25000-standards/iso-25010 (characteristics verified; definitions of security, maintainability, flexibility and operational safety unverified in the standard)
- ISO/IEC 5055 / CISQ ASCQM — https://www.omg.org/spec/ASCQM/ · https://www.it-cisq.org/standards/code-quality-standards/
- NIST SSDF SP 800-218 — https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf
- OWASP Top 10 2025 — https://top10.owasp.org/2025 · Top 10 for LLM 2025 — https://genai.owasp.org/llm-top-10/
- OWASP ASVS 5.0 — https://owasp.org/www-project-application-security-verification-standard/
- WebAIM Million 2026 — https://webaim.org/projects/million/
- WCAG 2.2 — https://www.w3.org/TR/WCAG22/ · WAI-ARIA Authoring Practices — https://www.w3.org/WAI/ARIA/apg/
- 12-Factor — https://12factor.net/ · Google SRE, launch checklist — https://sre.google/sre-book/launch-checklist/
- SWEBOK v4 — https://www.computer.org/education/bodies-of-knowledge/software-engineering (areas verified; practices per area, from memory)
- ISO/IEC 42001 A.6.2.8 — only through third-party summaries
- RFC 9457 Problem Details — https://www.rfc-editor.org/rfc/rfc9457.html · RFC 9745 Deprecation header — https://www.rfc-editor.org/rfc/rfc9745.html · RFC 8594 Sunset header — https://www.rfc-editor.org/rfc/rfc8594.html
- W3C Trace Context — https://www.w3.org/TR/trace-context/ · OpenTelemetry — https://opentelemetry.io/docs/
- SemVer — https://semver.org/ · OpenAPI 3.1 — https://spec.openapis.org/oas/v3.1.0
- W3C, Working with Time and Timezones — https://www.w3.org/TR/timezone/ · Unicode CLDR plural rules — https://cldr.unicode.org/index/cldr-spec/plural-rules · BCP 47 — https://www.rfc-editor.org/info/bcp47 · MDN, CSS logical properties — https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_logical_properties_and_values · Google, localized versions (`hreflang`) — https://developers.google.com/search/docs/specialty/international/localized-versions
- SLSA — https://slsa.dev/spec/v1.2/ · OWASP Threat Modeling — https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html · C4 model — https://c4model.com/ · Diátaxis — https://diataxis.fr/
- Ley 25.326 (Argentina) — https://servicios.infoleg.gob.ar/infolegInternet/anexos/60000-64999/64790/texact.htm · GDPR, art. 5 — https://gdpr-info.eu/art-5-gdpr/ · Ley 26.653 — https://servicios.infoleg.gob.ar/infolegInternet/anexos/175000-179999/175694/norma.htm · EN 301 549 — https://www.etsi.org/

**Senior practice**
- Google Engineering Practices, code review — https://google.github.io/eng-practices/review/reviewer/looking-for.html · small changes — https://google.github.io/eng-practices/review/developer/small-cls.html
- Software Engineering at Google, ch. 12 — https://abseil.io/resources/swe-book/html/ch12.html
- Google, origin of flaky tests — https://testing.googleblog.com/2017/04/where-do-our-flaky-tests-come-from.html
- Google, Practical Mutation Testing at Scale — https://research.google/pubs/practical-mutation-testing-at-scale-a-view-from-google/
- Google SRE workbook, alerting on SLOs — https://sre.google/workbook/alerting-on-slos/
- Fowler, parallel change — https://martinfowler.com/bliki/ParallelChange.html · feature toggles — https://martinfowler.com/articles/feature-toggles.html
- DORA, capabilities — https://dora.dev/capabilities/
- Stripe, idempotency — https://stripe.com/blog/idempotency · AWS Builders Library — https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/
- Microsoft, review guide — https://microsoft.github.io/code-with-engineering-playbook/code-reviews/process-guidance/reviewer-guidance/
- Nygard, ADR (2011) — https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions · FinOps — https://www.finops.org/framework/ · AWS Well-Architected — https://aws.amazon.com/architecture/well-architected/
- Ousterhout, *A Philosophy of Software Design*; Nygard, *Release It!*; Fowler, *Refactoring*: through third-party summaries, without the book

**Agent-generated code**
- Pearce et al. — https://arxiv.org/abs/2108.09293 · Perry et al. — https://arxiv.org/abs/2211.03622
- SUSVIBES — https://arxiv.org/abs/2512.03262
- Invented packages — https://arxiv.org/abs/2406.10279 · https://arxiv.org/abs/2605.17062
- GitClear 2025 — https://www.gitclear.com/ai_assistant_code_quality_2025_research (figures from the page, no tables)
- Sonar issues in agent commits — https://arxiv.org/abs/2603.28592
- Banik et al., “All Smoke, No Alarm: Oracle Signals in Agent-Authored Test Code” (T4: the 80.2% counts syntactic oracle signals, not whether a test is correct) — https://arxiv.org/abs/2606.18168
- ImpossibleBench (T2, A9: in Claude models more than 79% of the cheating is modifying tests) — https://arxiv.org/abs/2510.20270
- SpecBench — https://arxiv.org/abs/2605.21384
- Patches that pass and are wrong — https://arxiv.org/abs/2503.15223
- PRs inconsistent with their diff — https://arxiv.org/abs/2601.04886
- Agent false success — https://arxiv.org/abs/2606.09863
- Constraint violation — https://arxiv.org/abs/2605.29442 · https://arxiv.org/abs/2605.10039
- Ambig-SWE — https://arxiv.org/abs/2502.13069
- Variance of a model as judge — https://arxiv.org/abs/2606.13685 · self-preference — https://arxiv.org/abs/2410.21819

The 2026 studies are recent; several have no peer review or second source.
