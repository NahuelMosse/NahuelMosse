# SDD method

**The Jira card is the specification. What is assumed is declared (`<ID>-ASM-NN`) and tied to a test.**
## The flow

1. **`/card <ID>`.** Before `card.md`, one batch of ≤3 parallel calls, ~10k tokens (`git ls-files`, `Grep`, the files the card names), no test or whole file. Bring the whole requirement: Jira over MCP (description, comments, attachments, links; or the `archivist`) or the given text; no MCP answer, stop.
   Write `specs/<ID>-<slug>/card.md` with **one `Write`** from `.claude/templates/card.md`:
   - header: `status: proposed`, `cap: <N> min`, `sources:`, `not_read:`;
   - `## Specs`: every sentence of the card as `S<n> · "<verbatim quote>"` (one clause each); an assumption (only if it changes what the user sees or does) as `<ID>-ASM-NN · <reading> · S<n>` (HTTP defaults: one ASM, a test per row);
   - `## Tasks`: `T<n> · S<n>,… · <files (layer)> · tests: <file> "<title @<ID>-S<n>>"`; a file carries `(presentation|rule|data)` (`rule` does no I/O, SQL only in `data`);
     every `S#` and `ASM` has its planned test; each production task gets an indented `reuses:`/`new:` line, a new pattern a `why-layer:`; each file sits in its slice's layer folder;
   - `## Gate`: one command per line (`suite:`, `lint:`, `mutate <file>: <suite>`, `app:`) plus the plan's own: `probe <state>:` per state `## Specs` names, `attacks:` with the card's limits, `migrate-upgrade:` if it touches data;
   - `## Log`: `L1` is the requirement, verbatim and whole, never changed; the Log only grows,
     by `node .claude/tools/log.mjs specs/<card> "<line>"`. `Grep` earlier cards' `@<ID>-S` tags in the files the Tasks touch: each frozen test the card contradicts is declared now as `replaces:` and replaced in a new file titled with its tags.
   - `## Look` (visual lens): `ref:` (the card, design system or `reference/design-refs.md (profile web)`; never «the simplest»; an `ASM`), `behavior:` per moment, `tokens:`, `copy:`; a product screen, `## Information` (decisions, tiers, signals) and `ia:`;

   - `## Changes to existing behavior`: a route, screen or file of main it changes (`none` if it only adds).

   Write the folder name to `specs/.current`, switch to branch `<ID>-<slug>`.
2. **`node .claude/tools/risk.mjs specs/<card>`** checks the plan, classifies with code, freezes `risk.json`: `size` (small|large), `review`
   (low|medium|high), `lenses` (visual, contract, integrity, interpretation, security). A gap is listed with its closing line: complete the card, rerun. Never reclassify.
   Walk those lenses' questions in `.claude/reference/lenses.md` before `## Specs` closes: what the card leaves unanswered is an AMB or ASM with its test; rerun `risk.mjs`.
   **Plan judge** (`high` only, never at `poc`): a `judge` with a prompt starting `PLAN` reads only `card.md`, writes `judge.md` with its ACT marked `plan`.
   Close each in the card before RED (a new `ASM-NN` with its planned test, a Gate line or `declared · <why>`); its `judge.md` line says `closed · <ASM-NN, T<n> or Gate line>`; rerun `risk.mjs`.
   **Ambiguities:** what the card does not say (empty case, duplicates, limits, permissions, states, errors, order, trail) is `<ID>-AMB-NN` in `ambiguities.md` (append-only, read by `publish`). With Jira, all go in **one** comment, posted without asking approval, each with the option assumed if nobody answers. The main thread reads answers once, before RED; the unanswered become `## Specs` ASM lines (cheapest reading to undo, with its test).
   A later answer: Log and PR, never reopening RED. Never a second round. Without Jira: straight to ASM.
   Commit `card.md`.
3. **Build.**
   - **small:** inline, no subagents. RED first: the planned tests, tag `@<ID>-S<n>` (assumption: `@<ID>-ASM-NN`) in the title,
     failing for the right reason, **committed before any code**; then the code, then the gate. Test names, locals and helpers in
     English from RED (unless `Code language:`): the `code-language` check reads test files too, and frozen tests cannot be renamed.
   - **large:** one `builder` per group of `## Tasks`, in sequence, prompted with only the `card.md` path, its task IDs, `S#` and the gate command. A builder that is not the last runs its own tests and the `lint`/`mutate` lines of its files; only the last runs `verify.mjs`. In the
     background (unattended or a subagent: `wait.mjs --agent <id>`).
   - Visual lens: `plain:` or `remove-only:` in `## Look` means no designer or critic. Otherwise a `designer` captures `ref/` beside the builder; after tests pass a fresh one does the capture rounds per grade (`designer.md`), or the gate fails. At `production`, before `/close`, the `design-critic` commits `critique.md`; a designer fixes only its blockers and the critic re-checks them (`RECHECK`).
   - Validate outside input on the way in; a missing key of a closed enumeration is an error, not a default. Scope is the card's: an unasked control, endpoint, header, error path or status code is a Log line `OUT · <what>`, not built; an ASM never widens the card.
4. **Gate.** `node .claude/tools/verify.mjs` runs each `## Gate` line once, checks every `S#` has a test and prints what fails. Formatters and generators run before it, committed: a line that changes versioned files fails. Fix and rerun; two rounds without progress: log it, stop, `## Could not run`.
5. **`/close`.** `node .claude/tools/close.mjs` runs its checks and writes `closing.md` (`## Passed`, `## Failed`, `## Could not run`,
   `## Judge`, `## Assumptions`, `Cost:`); a Log line `kit: <what>` where the kit hindered you. Then it publishes branch, PR, CI, card comment, merging once CI passed with nothing for a person; never main, `--force`, `--admin` unless ordered.

## The invariants

- **The requirement is frozen and verbatim,** also as text. Never code from a summary.
- **Never resolve an ambiguity on your own:** AMB asked once, else ASM with a test. *Silently filling a gap is the worst failure.*
- **Tagged tests are frozen once committed (from mvp).** A wrong one is replaced, never edited: the fix goes in a new file with the same tag; the Log gets `- L<n> · <date> · replaces: <file> "<test>" · <why wrong> · by: <file> "<test>"`; the gate says `passed with replaced` and the close sends it to «Needs a person» (under `refactor-tests:`, kept tags is a rename: one decision line). A new behavior is a new test.
- **Three states: passed · failed · could not run.** What did not run is never "passed"; a check that stops you is not turned off; an uncorrected finding stops the close.
- **Nothing waits for a person.** Their call goes in `## Needs a person`, not yours (`.claude/AUTONOMY.md`).
- **Grade** (`poc`, `mvp`, `production`): how much of the bar the repo asks (`kit.mjs status`). `poc` is a facade: cap, Specs and Look only, presentation with mock data (logic is blocked), one capture round, close ends at the push. **Modules** add lenses and gate lines, not steps; a **profile** (`web`, `backend`, `flutter`) brings screen or API instruments.

## Cost rules

- **One `Write` per file, not ten `Edit`s.** No `sed -i` or `node -e` on files: the hook refuses it.
- **Nothing over ~30 s runs in the foreground:** background, log, `Grep`; a `Monitor` runs `node .claude/tools/wait.mjs <log> --monitor --max 1790`
  (ends on `<tool>: exit <N>`); end the turn; unattended or in a subagent, `wait.mjs`.
- **A subagent only from the table below,** never `general-purpose`; what decides is never a Sonnet's.
- **Read in depth only what an `S#` touches;** the rest by `Grep`. To see the card again, `node .claude/tools/card-view.mjs specs/<card> [S<n> T<n>…]`; `Read` it only to edit. `bar.mjs <IDs>` prints the criteria rows. A tool's usage: `node .claude/tools/help.mjs <tool>`; never read a kit tool's code.
- **Verify by what you touched:** `node .claude/tools/affected.mjs <files>` lists the tests that import them; run those. `node --test` always carries `--test-force-exit`.

## Who does what

| Task | Agent |
|---|---|
| Builds a group of tasks of a large card | `builder` |
| A `(presentation)` screen: `ref/` beside the builder · capture rounds after it | `designer` |
| Critiques the look (`visual`, `production`); re-checks blockers once | `design-critic` (Opus) |
| Judges the plan at high (`PLAN`, 12 turns) against the lenses; writes `judge.md` | `judge` (Opus) |
| Freezes the requirement from Jira | `archivist` |
| Sweeps more than two files | `scout` |
| Tests, builds, installs, long logs | `runner` · `executor` |
| Applies a decided change in several places | `grunt` |
| Big plan order · a hard problem | `planner` · `oracle` |

## What does not depend on your good will

Hooks block, even when they fail: `guard` (L1 and the Log of `card.md`, `risk.json`, committed tagged tests, migrations already in main, `kit.json`), `delegate-code` (production code: `builder`, `grunt`, or you on a small card after RED), `review-cap` (plan judge at high), `require-bar` (cap, Specs, Tasks, Gate before code),
`time-cap` (warns at 70 % of `cap:`, stops at 100 %, from card.md's first commit), `context-cap`, `require-at-close` (mutation, linter of tests, scope, at high `judge.md` with its ACT closed), `publish`; `close.mjs` checks the gate. If one stops you, read its message; do not go around it.
The main thread compacts at 200k.

## Where the scenario tests live

`kit.mjs e2e <path>` sets `$E2E`; `kit.mjs rule-paths <rule> <globs>`, a rule's `paths:`.
```
E2E=apps/e2e        # adjust to this repo's real path
```
