# Profile: Node and TypeScript

The commands for the lines of `## Gate` on this stack, and for the criteria of `reference/criteria.md` that
have a command. **It is the tested profile.** `$ID` is the
card; `$E2E`, the scenarios folder. A command marked **Untested on this machine** is written from the tool's
documentation and has not run here: the first card that uses it confirms or adjusts it. Every product named is
an option, never an obligation.

**Read only the section you need** —`Read` with the line range of its heading—: the
whole profile would be re-read on every request of the card.

## At a glance

- `tsconfig.json` with `strict` and `noUncheckedIndexedAccess`; `npm test` = types + unit tests + screen gate (captures outside it);
  the verification commands live once as `verify:*` scripts of `package.json`.
- `node --test` lines run with `--test-concurrency=1`, or 4 (or half the cores) when the tests isolate their own port and database
  and a stable ×3 run (`tools/repeat.mjs`) confirms it. Playwright and axe are development dependencies; browsers install with
  `PLAYWRIGHT_SKIP_BROWSER_GC=1 npx playwright install chromium`. A browser test whose browser is missing fails, never `{ skip }`:
  the gate counts any skip, even a conditional one, as its spec not run.
- The `## Gate` lines of `card.md`, one per check, run by `verify.mjs`: `suite: node --test {affected}`, `lint: npx eslint <src test e2e>`,
  `mutate <file>: node --test <that file's unit tests>` (production: every logic file; mvp: the domain; poc: none),
  `attacks: node .claude/tools/attack.mjs --json <flags>` (profile backend; url from `APP_URL`), `motion: npm run motion`, `app: node src/main.mjs` (takes `PORT` and `DATA_DIR` from the environment).
- Before committing the RED tests: `npx tsc --noEmit`; the linter (eslint-plugin-playwright, no loops or conditionals in tests); the
  new tests ×3 stable (`npx playwright test --grep "@$ID" --repeat-each=3`, or
  `node .claude/tools/repeat.mjs 3 -- node --test --test-concurrency=1 <files>`); the red run with `--timeout=5000 --retries=0`
  (Node: `timeout 30 node --test --test-timeout=5000 --test-force-exit <files>`), never in the final suite.
- A test that starts a server closes it in `after` with `server.closeAllConnections()` before `server.close()`: a keep-alive connection
  that `fetch` leaves open makes Node abort at the forced exit on Windows (UV_HANDLE_CLOSING) with every test green.
- Mutation of a logic file: `node .claude/tools/mutate.mjs <file> --since <card-start> --equivalents specs/<card>/equivalents.md -- <unit suite>`,
  never over the browser suite. ZAP: once per card, at the end.
- `node --test` takes a glob (`"test/**/*.test.mjs"`), never a folder: Node 24 runs a folder as if it were a test file, and fails.
- Test traps (server shutdown, static server MIME, screen logic in a pure module): the "Test traps" section below.

Read the rest only when a criterion of `bar.mjs` needs a command not listed here (its section, by line range),
or the card has a screen (`## Screen: states and motion`).

## Configuration the profile requires

- `tsconfig.json` with `strict` **and `noUncheckedIndexedAccess`** — the second is the one that
  catches `list[i]` and `map.get(k)` treated as if they were always there.
- `npm test` = types + unit tests + screen gate. Captures stay outside the gate.
- **`node --test` lines run with `--test-concurrency=4`** (or half the cores) when the tests isolate their own port and database;
  the condition is a stable ×3 run (`tools/repeat.mjs`) that confirms it, and the card's `## Gate` declares it. Without that run, `--test-concurrency=1`.
- Playwright and `@axe-core/playwright` as **development dependencies**, never production ones.
- Browsers are installed with `PLAYWRIGHT_SKIP_BROWSER_GC=1 npx playwright install chromium`:
  without the variable, Playwright deletes from the machine's cache the versions this repo does
  not use, and on a shared machine other projects or agents may be using them.
- Several tags in one filter: `--grep "@A|@B"` with **double** quotes; cmd.exe, which runs npm scripts and
  `verify.mjs` lines on Windows, takes an unquoted `|` as a pipe. Repeating `--grep` does not add up: only the
  last one counts. *Verified on this machine.*
- The scenarios server's port comes from an environment variable, with a default value: that way
  two runs —the suite and a mutation that uses the scenarios— do not collide.
- The verification commands live once, as `verify:*` scripts of `package.json` (`verify:suite`, `verify:lint`,
  `verify:contract`…); the `## Gate` lines and the pipeline both invoke them.

## Test traps

The list `agents/builder.md` points to; each one failed in practice.
- The focused submit is never `disabled` while sending: `aria-disabled="true"` and the click ignored. `disabled` drops the focus to `body`.
- A busy indicator is seen while its state holds: never `hidden` or `display: none` on its icon; `aria-busy="true"`, not `""`.
- A test file ends clean: `server.close()` with `closeAllConnections()` and the database closed, never a pause. Its `fetch` calls send `connection: close`: a connection fetch keeps alive makes Node 24 on Windows abort `--test-force-exit` with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` after every test passed, and `closeAllConnections` does not reach it. In a file the card does not touch that abort is the runtime, not the change: `once.mjs` (every verify line) runs it again without the forced exit; do not debug it.
- URLs in tests are built with `new URL` or `encodeURIComponent`; a body at a byte limit with a helper that counts bytes, not characters.
- A test that the contract matches the app takes the statuses from real responses, never from a list in the test.
- A screen's logic (validation, messages, the payload, and every decision of its flow: the state a response status leads to, the field that takes the focus, whether a submit goes out, the key that sends) lives in a pure module `presentation/<name>-state.js` that `node --test` imports, mutated like the domain; the DOM file only reads the DOM, calls those functions and writes what they return, with no `if` of its own beyond a null check, and the server has an HTTP test under node: mutation runs only node tests, and browser-only coverage leaves every mutant alive.
- A static server sends `.mjs` and `.js` as `text/javascript` and serves only its public folder.
- A browser test runs axe or reads a color only after the state's animations end (`await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity).map((a) => a.finished.catch(() => {}))))`; a spinner never ends): mid-fade, text fails contrast that it passes at rest.

## HTTP defaults: JS idioms

For `reference/http-defaults.md` (profile backend): the largest exact integer is `Number.MAX_SAFE_INTEGER`; text is trimmed with `trim()` and measured with `[...s].length`; case-insensitive uniqueness and search use `toLowerCase()`; a repeated JSON key keeps the last value (`JSON.parse`); a malformed request is the server's `clientError` event.

## Default libraries by category

Solved problems use a library (`rules/architecture.md`, «Solved problems use the stack's library»). **The repo's
existing choice always wins**; this table is for a new repo or a category the repo does not cover yet. A library
lives in the module's `data/` (or the composition root for DI), behind domain names.

| Category | NestJS | Express, Fastify, Hono |
|---|---|---|
| Persistence and migrations | the repo's ORM: **Prisma**, **TypeORM**, **MikroORM** or **Sequelize**; new repo: Prisma or TypeORM, with its migrations | **Prisma** (`prisma migrate`) or **Drizzle** (`drizzle-kit`); a query builder (**Kysely**, **Knex**) when SQL stays visible |
| Dependency injection | Nest's own DI: `@Module` per feature, providers, `@Injectable` | constructor parameters wired in the entry file; **awilix** or **tsyringe** only when the app wires many services; never a hand-written container or registry |
| Validation | `class-validator` with `ValidationPipe`, or **zod** through a pipe | **zod** or **valibot** at the edge |
| Authentication | `@nestjs/passport` or `@nestjs/jwt`; **better-auth** or an identity provider | **Passport**, **better-auth**, **jose** for tokens; an identity provider before home-made sessions |
| Dates | `Temporal` where available, else **date-fns** or **Luxon** | the same |
| HTTP client | `@nestjs/axios` or the platform `fetch` with a thin adapter | `fetch` (undici) or **ky** |
| Queues and jobs | `@nestjs/bullmq` | **BullMQ** (Redis) or **pg-boss** (Postgres) |

A module per feature maps to `src/modules/<feature>/` (Nest: the feature module folder), with its layer folders inside
(`presentation/`, `domain/`, `data/`, `application/` when a use case orchestrates); `shared/` holds the kernel. The architecture test of D2 reads those paths.

**Request-handling files** import no persistence client: in NestJS with Sequelize, nothing under `*.controller.ts` imports `sequelize` or a `*.model.ts`; the same pattern holds for the repo's own ORM. ORM defaults to map: Prisma `@default(uuid(7))` for ids and `@db.Timestamptz(3)` on every `DateTime` (its default `timestamp(3)` has no zone); see P17.

## Recipes

- **SQLite with `node:sqlite`:** `import { DatabaseSync } from 'node:sqlite'`; `db.exec(sql)`, `db.prepare(sql).run/get/all(...params)`; `new DatabaseSync(file, { readOnly: true })` for a read-only open; `PRAGMA foreign_keys = ON` and `PRAGMA busy_timeout = 5000` on open. It prints `ExperimentalWarning: SQLite is an experimental feature` on stderr: harmless; `node --disable-warning=ExperimentalWarning` in `app:` and in `node --test` lines silences it.
- **Migrations:** numbered, applied in order, the applied number in `PRAGMA user_version`. Each one: `BEGIN IMMEDIATE`, read `user_version` inside the transaction and skip if applied, run the statements, set `user_version`, `COMMIT`; a throw is `ROLLBACK` and the start exits ≠ 0. Tests: two simultaneous opens of the same file apply each migration once; a migration that throws leaves the database as before.
- **Unique violation:** `err.errcode === 2067` (`SQLITE_CONSTRAINT_UNIQUE`; 1555 is the primary key) answers 409; never a regex on the message.
- **A public function with an object parameter** validates it, and its tests call `fn(null)`, `fn({})` and `fn()`, at any risk, each with the error or default the function states.

## Readability limits

The `lint:` line enforces them: spread `readability` from `.claude/templates/eslint-readability.mjs` into `eslint.config.mjs`
(`max-lines` 250, `max-lines-per-function` 40, `complexity` 10, `max-depth` 3, `max-params` 4, `max-classes-per-file` 1; tests excluded).
Over a limit: `// eslint-disable-next-line <rule> -- <reason>`. The same fragment carries `no-await-in-loop` (`rules/speed.md`); a
React repo adds `eslint-plugin-react-hooks` (`rules-of-hooks`, `exhaustive-deps`), and a TypeScript one with type information
`@typescript-eslint/no-floating-promises`. It also carries the readable-code rules (`no-nested-ternary`, `no-else-return`,
`no-lonely-if`, `curly`, `no-magic-numbers`); with **eslint-plugin-sonarjs** (K2 · K3) add `sonarjs/cognitive-complexity` 15,
`sonarjs/no-identical-functions` and `sonarjs/no-commented-code`. The formatter is its own gate line: `fmt: npx prettier --check .`.

**Paradigm.** NestJS: use cases, services, repositories and controllers are classes, one per file; pure helpers in their own
module file named for the concept (`money.ts`), never loose functions beside a class. Express, Fastify, Hono and React: a file is a
set of related functions (or one component) or one class, never both. The gate's `shape` check flags the mix.

## The `## Gate` section of `card.md`

What `verify.mjs` runs in parallel. An example for a card with a domain module, a server and a
screen:

```
suite: node --test {affected}
lint: npx eslint src test e2e
# production grade: every logic file; at mvp only the domain one (src/telefono.mjs), at poc none
mutate src/telefono.mjs: node --test test/telefono.test.mjs
mutate src/app.mjs: node --test test/app.http.test.mjs
attacks: node .claude/tools/attack.mjs --json --write "POST /api/x name=Ana" --read "/api/x"
motion: npm run motion
app: node src/main.mjs
seed: node scripts/seed.mjs
cycles: npx madge --circular --extensions ts,tsx,js,mjs src
contract: npm run verify:contract
docs: npm run verify:docs
budget: npm run verify:budget
vitals: npm run verify:vitals
load: npm run verify:load
```

`attacks:` runs `attack.mjs` against `APP_URL`, the app `verify.mjs` started with `app:`; the probes, rule ids and exit codes are the
vendored skill's (`.claude/skills/http-attack/SKILL.md`, profile backend). `npm run motion` starts its own app on a free port, runs
the audit and stops it by PID, with `node .claude/tools/motion-audit.mjs <url>
--only <selectors of what the card added> --cpu 4`, or over `design/components/gallery.html` when
the card changed the set. What uses a browser or starts the app goes one at a time; the rest, in
parallel. The commands named `p95`, `budget`, `vitals` or `load` run alone, after everything else.

`app:` (`node src/main.mjs`, or `npm start`) is not a check: `node .claude/tools/app.mjs up` runs it
with `PORT` and `DATA_DIR` in the environment, so the app must take both from there; the optional
`seed:` loads data once and sees `APP_URL`. The probes, the designer and the design-critic use that one app. `npm run motion`
may point at `APP_URL` when it is set and start its own app only without it.
`attack.mjs --json` sends the bodies as JSON (it also switches by itself when the form gets a 415).

## Screen: states and motion

If the card touches a screen, a Playwright spec in the `suite:` walks every new control and asserts:

- **states**: with `page.mouse.move`, `locator.focus()` and `mouse.down`, that hover, focus and
  press change what the state matrix says (`toHaveCSS`), and that focus is visible
  (`toBeFocused` plus the outline's width and color);
- **motion**: each control's transition is between 1 and 400 ms (`transitionDuration`), and with
  `page.emulateMedia({ reducedMotion: 'reduce' })` no infinite or displacing animation remains
  (`document.getAnimations()`);
- **stability**: cumulative layout shift (`PerformanceObserver` of `layout-shift`) is 0.1 or less
  on load and on scroll; it is the evidence of O15 for CLS;
- **accessibility**: axe with no violations, also with `colorScheme: 'dark'` if the project has a
  dark mode.

Colors and durations written by hand in what the card adds are flagged by `verify.mjs`; with
stylelint, `declaration-property-value-disallowed-list` with `/#[0-9a-f]{3,8}/i` and `/rgb\(/` for
color, and the same for durations, it also stops them in the editor.

**Captures** (`--project=captures`): the strip of each view, full page, at 1280×900 and 390×844, for
whoever looks first; and for the main thread, one capture per state the card changed with
`page.screenshot({ fullPage: false })` and `deviceScaleFactor: 1`. A 1280×900 viewport is about 1.5
thousand tokens; a long full page, ten.

## Before committing the RED tests

| What | Command | Must give |
|---|---|---|
| test types | `npx tsc --noEmit` (the `tsconfig`/`jsconfig` includes `e2e/`) | 0 errors |
| test linter | **eslint-plugin-playwright** with `playwright/missing-playwright-await` (`includePageLocatorMethods: true`), `playwright/no-useless-await` and `playwright/no-conditional-in-test`, over the scenario files; for unit tests, `no-conditional-in-test` from `eslint-plugin-jest`. **In both**, `no-restricted-syntax` over `ForStatement`, `ForOfStatement`, `ForInStatement`, `WhileStatement` and `CallExpression[callee.property.name='forEach']` inside tests: the conditional rules do not see loops | 0 errors. It does not see an `await` on a locator returned from your own function |
| expected value | in the spec files' block of the ESLint config, a `no-restricted-syntax` selector `CallExpression[callee.name='expect'] CallExpression[callee.property.name=/^(filter\|map\|reduce\|sort\|find)$/]` with the message “the expected value is written, not computed with the logic under test”. A locator's `.filter(...)` inside `expect(...)` also matches: it is assigned to a `const` first | 0 errors |
| stable | the card's new tests run **3 times** before they are committed: Playwright `npx playwright test --grep "@$ID" --repeat-each=3`; node tests `node .claude/tools/repeat.mjs 3 -- node --test --test-concurrency=1 <files>` (`node --test` de-duplicates a file named three times and has no repeat flag, so `repeat.mjs` runs the command three times in a row and stops at the first failure). A test that fails once is **“could not run: unstable”**, never committed: it is fixed or its order dependence removed. Order dependence is the main cause of flakiness. | 3 of 3 green |
| red run | node tests in red, with a server they may leave open: `timeout 30 node --test --test-timeout=5000 --test-force-exit <files>`. Playwright reds: `npx playwright test --grep "@$ID" --timeout=5000 --retries=0`: a red test that waits for a locator that does not exist is cut at 5 s and is not retried. A red test that waits for a server that does not exist hangs the run for minutes; the timeout makes it fail on the assertion. Only here: **never in the final suite**, where `--test-force-exit` would hide an open handle | fails in under 30 s, on the assertion |
| test smells | the detectors D01 to D24 of `reference/testing.md` over the new tests, when the linter does not cover them. Untested on this machine as a set; each one was tried over a sample | no finding that is not a justified false positive |

## Commands by criterion: the gate and the tests

| Criterion · Gate line | Command | Must give |
|---|---|---|
| `suite:` · C3 · K1 | `node .claude/tools/once.mjs suite -- npm test` | exit 0, and the script includes `tsc --noEmit`, the unit tests and `playwright test --project=gate`. `once` does not repeat it if it already passed on the same code; it stores in `.validation/`, which goes in `.gitignore`. The previous suite passes whole (C3) in this same run, it is not run twice |
| R6 | `node .claude/tools/once.mjs scenarios -- npx playwright test --grep "@$ID"` | exit 0; every `S#` has a test tagged `@<ID>-S<n>` (`verify.mjs` checks it) |
| T8 · T12 | `npx playwright test --grep "@$ID" 2>&1 \| grep -cE "TimeoutError\|resolved to 0 elements\|strict mode violation"` | `0` |
| O1 | `git clone . /tmp/clean && cd /tmp/clean && npm ci && npm start` | starts with no further step |
| T3 · `mutate <file>:` | For **every file in the diff the grade asks to mutate** (production: every logic file; mvp: the domain; poc: none): `node .claude/tools/once.mjs mutate:<file> -- node .claude/tools/mutate.mjs <file> --since <card-start> --equivalents specs/<card>/equivalents.md -- <suite that covers it>`. The suite is that file's unit suite; a server or a router is covered by an HTTP test with `node --test` that starts the app on a free port and requests it —never the browser suite: `mutate.mjs` refuses it, because every mutant would rerun it, and refuses any run over 10 minutes—. With a unit suite use `--parallel 4`. It mutates only the lines the card changed. A mutant that does not change behavior is declared in `equivalents.md` with its reason, and it comes into view; `mutate.mjs` prints the declaration line to copy, which identifies the mutant by its operator and the code around it, so reformatting lines does not break it. `/close` does not start until `node .claude/tools/required.mjs` gives 0. For more operators, **Stryker** (`npx stryker run --mutate <file>`) |
| `seed:` | `comm -12 <(grep -ohE "from '[^']+'" <seed> \| sort -u) <(grep -ohE "from '[^']+'" <seed-test> \| sort -u)` — must give empty: the seed does not import what its test imports | empty |

## Commands by criterion: the code

| Criterion | Command |
|---|---|
| K1 | `grep -rnE "\)!\|\]!\|\bas any\b\|as unknown as\|@ts-(ignore\|expect-error)\|eslint-disable\|catch *\([^)]*\) *\{ *\}" $(git diff --name-only <card-base>)`; and for a closed enumeration, `Record<StageId, …>`, not `Record<string, …>`; a member list written twice: by name `grep -rln -E "'(member1\|member2\|…)'" --exclude-dir=node_modules .`, by count `grep -rn -E "repeat\( *N\|\.length *[=!]== *N\|Array\( *N" --include=*.css --include=*.ts .` |
| K5 | `node -e "const p=require('./package.json');const s=Object.values(p.scripts\|\|{}).join(' ');for(const d of Object.keys(p.devDependencies\|\|{}))if(!s.includes(d.split('/').pop().replace('@','')))console.log('nobody runs:',d)"` — empty; and for every production `export`, `git grep -wl <name> \| wc -l` greater than 1 |
| D2 · D11 · D15 | an `architecture.test` that parses the imports of each layer; or **dependency-cruiser** with `forbidden` rules: the domain and application folders to `node_modules` except the allow-list, deep imports into another module (`only-public-index`), and a table touched outside its owner module. Untested on this machine |
| K4 | `npx -y jscpd@4 --min-lines 10 --min-tokens 50 <production-folder>` — blocking for a clone with a side in lines the card wrote (`verify.mjs`, every grade); a clone already in the repo is a note; it finds exact copies, not renamed ones |
| D3 | `npx madge --circular --extensions ts,tsx,js,mjs <src>`, or dependency-cruiser with the `no-circular` rule — no cycles (the `cycles:` line). Untested on this machine |
| E6 · E12 · E13 | **eslint** with `sonarjs`, `@typescript-eslint/no-floating-promises` and `no-misused-promises`, a `no-restricted-syntax` over a `CatchClause` whose only statement is a call to `console` or the logger, and `preserve-caught-error` if the version ships it [NV]. Untested on this machine |
| D6 | the loop of `reference/code-patterns.md` over `src`: exported interfaces with at most one implementation and no fake in tests; abstract classes with at most one subclass. Informative |
| D4 | the `rg --pcre2` of `reference/code-patterns.md`: methods that only forward to a collaborator. Informative |
| D1 · T7 | `rg -n "Date\.now\(\|new Date\(\)\|Math\.random\(\|process\.env" src --glob '**/domain/**'`. Informative |
| K6 | the name-pattern `rg` of `reference/code-patterns.md`. An alert, not a verdict |
| T2 | the D18 command of `reference/testing.md`: `git diff -U0 <card-start> -- <tests folder> \| rg -nP '<D18 pattern>'` — empty, or each line justified in `card.md`. Untested on this machine |
| I26 · T7 | `TZ=America/St_Johns LANG=tr_TR.UTF-8 npm test` through `once.mjs`: the suite a second time with an offset of half an hour and the Turkish `i`; on Windows `cross-env TZ=… LANG=…`. Untested on this machine |

## Commands by criterion: quality, security and delivery

| Criterion | Command |
|---|---|
| K2 · K3 | `node .claude/tools/once.mjs lint -- npx eslint <production and test files in the diff>`, with **eslint-plugin-sonarjs** (`sonarjs.configs.recommended`) for all and `no-conditional-in-test` also for the unit tests — zero problems. The tests go in the same command: `required.mjs` asks that every test in the diff has passed through the linter (the `lint:` line). Tested on this machine with version 4.2.2. With a company server: `sonar-scanner` and `sonar.qualitygate.wait=true` |
| S3 | **Semgrep** Community Edition with the kit's own rules: `semgrep scan --metrics=off --disable-version-check --config .claude/rules/semgrep/sdd.yml --error <files in the diff>`; exit 1 = findings, 0 = clean. Registry packs (`--config p/expressjs`) only for internal use, always with `--metrics=off` |
| T11 | `npx c8 --include <production files in the diff> --check-coverage --lines 80 node --test <unit-tests>` |
| S12 | `npx @lizenz/checker --production --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD;Unlicense;CC0-1.0;Zlib"` (successor of `license-checker-rseidelsohn`), or `npx licensee --production --errors-only` with a `.licensee.json`; the repo's own list if `docs/technical/dependencies.md` overrides it. Fonts, icons, images and copied fragments: **scancode-toolkit** or the inventory in the notices. A command not verified on this machine: **Untested on this machine** |
| S17 | **OWASP ZAP** in baseline mode, against the running app: `zap-baseline.py -t http://127.0.0.1:<port>` — needs Docker or Java. Untested on this machine. Once per card, at the end; not rerun after fixes |
| P4 · P12 | `node .claude/skills/migrations-safe/scripts/migration-lint.mjs --history` (module data): the migrations new in the branch, plus the history checks (an applied file edited, two branches that collide or sort out of order); runner (Prisma, Drizzle, Knex, Atlas, goose, dbmate…) and dialect (PostgreSQL, SQLite, MySQL, SQL Server, Oracle, Db2) detected from the project, `--dialect` to override. Exit 2 is could not run, never a pass |
| W8 | `npx @redocly/cli lint docs/api/openapi.yaml` or `npx @stoplight/spectral-cli lint docs/api/openapi.yaml`; AsyncAPI: `npx @asyncapi/cli validate docs/api/asyncapi.yaml` (the validator for AsyncAPI 3 must be confirmed, [NV]); GraphQL: the schema printed from the code against the committed one. Untested on this machine |
| W9 | a test in the suite that compares the registered routes with the spec paths in both directions and validates the responses of the HTTP tests (the `contract:` line); alternative `schemathesis run docs/api/openapi.yaml --url http://127.0.0.1:<port>`, one at a time. Untested on this machine |
| W1 · W7 · W10 | the generator's strict build (Docusaurus with `onBrokenLinks: 'throw'`, `mkdocs build --strict`, Starlight with `starlight-links-validator`), or `lychee --offline docs README.md`, or `npx markdown-link-check` (the `docs:` line). Diagrams as code, one render per source through `once.mjs`: `npx -p @mermaid-js/mermaid-cli mmdc -i <file.mmd|page.md> -o <out>`, `d2 <file.d2> <out.svg>`, `likec4 build`, a request to Kroki, `node archify/bin/archify.mjs validate <name>.archify.json` [NV subcommand]. Untested on this machine; the flags of `mmdc`, `d2`, `likec4` and `archify` are [NV] |
| S19 | `npx generate-license-file --input package.json --output THIRD_PARTY_NOTICES.md` and `git diff --exit-code THIRD_PARTY_NOTICES.md`. Untested on this machine |
| V3 | `npx commitlint --from <card-start> --to HEAD` with `@commitlint/config-conventional`; release notes with release-please, semantic-release, changesets or git-cliff, all options. Untested on this machine |
| O23 · O25 · O27 · O28 · S23 | `actionlint` for GitHub Actions; `rg -n "uses: " .github/workflows \| rg -v "@[0-9a-f]{40}"` is empty; `permissions:` present in every workflow; `gh api repos/<owner>/<repo>/branches/main/protection` for the required checks. Pipeline templates by provider (GitHub Actions, GitLab CI, Azure Pipelines, Bitbucket) are options. Untested on this machine |
| S23 · S24 | `trivy image <image>` or `grype <image>`; `checkov -d <iac>` or `kics scan -p <iac>`; `hadolint Dockerfile` (a non-root `USER`). Untested on this machine |
| O21 | `promtool check rules <alerts>` (or the provider's validator) and each alert's `runbook_url` points to an anchor that exists in `docs/technical/runbook.md`. Untested on this machine |
| I31 | a script with no library that loads the source catalog and each other one and prints `missing`, `extra` and `bad` placeholders (I18N-TST-01), or `npx lingui extract --clean && git diff --exit-code src/locales/` / `npx formatjs extract … && git diff --exit-code`. Untested on this machine |
| I27 | `npx eslint src --rule '{"i18next/no-literal-string":"error"}' -f json` counted, or `formatjs/no-literal-string-in-jsx`. Informative. Untested on this machine |
| O15 | `rg --pcre2` with the 22 patterns of `reference/performance.md` section 5.15 over the diff's front-end files (`H`, `C`, `J` globs of that table), excluding `*.spec.*` and `*.test.*`; for example `rg -n --pcre2 '^(?!\s*(/\*\|\*\|//))[^\`]*?transition(-property)?\s*:\s*all\b' -g '*.css' -g '!*.spec.*'` for FE-DET-03 and `rg -n --pcre2 'will-change\s*:\s*+(?!auto\b)' -g '*.css'` for FE-DET-18. Informative; the lab tests (LoAF, lab INP, leaks in 7 cycles) are the `vitals:` line. Tried on a bad and a good sample; the rest of the commands are untested on this machine |
| P5 · P16 | the upgrade from main with data, as `node .claude/tools/once.mjs migrate-upgrade -- <script>` (the Gate line `migrate-upgrade: <script>`). The script, against a throwaway database of the production engine and version (Testcontainers or a pinned container): `BASE=$(git merge-base origin/main HEAD)`; `git worktree add ../_base "$BASE"`; migrate to the base state **from `../_base`**; load the versioned seed with the rows that break DDL (populated tables, NULLs, duplicates, rows that look orphaned) and fail if a seed table is empty; apply **from the branch** only what is pending; run the suite; `node .claude/tools/worktrees.mjs remove ../_base --discard` (it unlinks junctions before git deletes: `git worktree remove` empties their target on Windows). The apply step per tool, all untested on this machine: Prisma `npx prisma migrate deploy` (base, then branch) and `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` for DB-MIG-19; Knex `npx knex migrate:latest`; Flyway `flyway migrate` then `flyway validate` (`outOfOrder=false`); Liquibase `liquibase update`; Atlas `atlas migrate apply --dir file://<dir>` (`../_base/migrations`, then `migrations`) with `--exec-order linear`; Alembic `alembic upgrade head` (and `alembic heads` with one line [NV]); Django `python manage.py migrate` and `makemigrations --check --dry-run`; EF Core `dotnet ef database update`; Rails `bin/rails db:migrate`; golang-migrate `migrate -path <dir> -database "$URL" up` |
| S10 · S11 | `npm sbom --sbom-format cyclonedx > sbom.json` · `npm audit --omit=dev` · for every direct dependency, `npm view <package> name` must exist |
| S9 | `git log -p \| grep -nE "(api[_-]?key\|secret\|password\|token)\s*[:=]\s*['\"][^'\"]{8,}"` — empty. More complete: **gitleaks**, or **Betterleaks** or **trufflehog** as options; as a pre-commit hook (`pre-commit` or husky) it is the evidence of S22. Secret managers, as options: AWS Secrets Manager, Azure Key Vault, GCP Secret Manager, HashiCorp Vault, Doppler, 1Password, Infisical |
| S1 · S2 · S7 · E8 · S24 (profile backend) | `node .claude/tools/attack.mjs http://127.0.0.1:<port> --write "<METHOD> <route> <body>" --read "<route with personal data>"` for every route the card adds or changes — exit 0 (the `attacks:` line). Also, timeouts: `server.requestTimeout` and `server.headersTimeout` set, and a client that sends the headers one byte at a time sees the connection cut |
| S18 | `npm outdated --json`; Renovate (`renovate.json`) or Dependabot (`.github/dependabot.yml`) as options for the update policy |

## Commands by criterion: interface

Playwright with `@axe-core/playwright`, one view per test, at 1280 and 390 px, with the tags
`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa` (I1 to I5). I6 and I8 with
`page.emulateMedia({ forcedColors: 'active' })`. I9: reflow with a 320 px viewport; text spacing
by injecting the WCAG 1.4.12 CSS; target size by measuring `getBoundingClientRect`. Text zoom to 200%:
a viewport with `deviceScaleFactor` 2 and the root `font-size` at 200%, no clipped or overlapping
text. Keyboard tests per APG pattern for each complex component (I16): the roles, the states and the
keys of its pattern in `reference/accessibility.md` (module ui).

## Commands by criterion: operation

| Criterion | How |
|---|---|
| O10 | a script that requests every main screen 200 times with the seed loaded and reports the p95, as a smoke under the budget of O10 (the `p95:` line). No dependencies: `fetch` and `performance.now()` |
| E2 · E7 | corrupt a copy of the data file and start against it: it must stop with a message and the file stay intact. The write, to a temp file and then `rename` |
| O7 | `netstat` during the run: a single own port, on the declared interface |
| O15 | `npx size-limit` per route, or a script over `.vite/manifest.json`; Playwright with the `web-vitals` library (`onLCP`, `onINP`, `onCLS` with `reportAllChanges`), CPU throttled x4 through CDP, the scenario's interactions (the `budget:` and `vitals:` lines); Lighthouse CI (`npx @lhci/cli autorun`) as an option, which in navigation mode gives no INP. Run alone, in a production build. Untested on this machine |
| P5 · P6 · P8 · P9 · P10 · P11 · S20 | Testcontainers (`@testcontainers/postgresql`); EXPLAIN with no `Seq Scan`, `type: ALL` or Table Scan on growing tables; count queries by wrapping `client.query` of pg, `$on('query')` of Prisma, `logging` of Sequelize or `on('query')` of Knex [NV]; the PK, FK, type and privilege queries of `reference/database.md` (module data). Untested on this machine |
| P17 | the gate's `table-shape` over the card's SQL migrations (module data). Prisma on PostgreSQL: `id String @id @default(uuid(7)) @db.Uuid`, `createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)`, `updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)`, `@@map("<table>")` for snake_case; Drizzle: `uuid().primaryKey()` with a v7 default from the app, `timestamp({ withTimezone: true }).notNull().defaultNow()`; TypeORM: `@PrimaryColumn('uuid')` filled with a v7 library, `@CreateDateColumn({ type: 'timestamptz' })`, `@UpdateDateColumn({ type: 'timestamptz' })` |
| P7 | `pg_dump -Fc`, `pg_restore -d restore_check`, a validation query and the time against the RTO. Untested on this machine |
| O16 | `curl -s http://127.0.0.1:<port>/health` compared with the `version` of `package.json`; for a CLI, `--version` |
| O18 | `curl -fsS` to `/health` and `/ready`, and `/ready` with the database stopped (Testcontainers `stop`) giving 503. Untested on this machine |
| P2 · O5 · O6 · O17 · O19 | pino or the repo's logger in JSON; `@opentelemetry/sdk-node` with the auto-instrumentations and `OTEL_TRACES_EXPORTER=console`; the probe starts the app, sends a request with known sensitive data and a `traceparent`, and checks the log lines, the header in the simulated outgoing call and in the job, and the span. Backends, as options: Grafana with Prometheus and Tempo, Datadog, New Relic, Azure Monitor, CloudWatch; error tracking with Sentry or GlitchTip. Untested on this machine |
| O22 | k6 (`constant-arrival-rate`, `thresholds`) or autocannon; the generator on another machine, or declared (the `load:` line). Run alone. Untested on this machine |
| O29 | the pipeline's smoke against staging and the runbook's rollback. Untested on this machine |
