---
description: Freezes the requirement into card.md (specs, tasks, gate, log), classifies it with risk.mjs and asks the one round of questions. Fetches it from Jira over MCP if there is a card; if it arrived as text, freezes that text.
argument-hint: <CARD-ID>
---

Card: `$1`. The shape of every section is `.claude/templates/card.md` and METHOD step 1; read the template, and of METHOD,
lenses and stacks only the section a question needs (`Grep -n "^## "`, then `Read` the range). A tool's usage: `help.mjs <tool>`.

1. **Fetch, never remember.** A Jira card: the whole card over the Atlassian MCP, all comments with author and date, all attachments
   (open the ones you can), linked pages. If the MCP does not respond, stop: without the requirement there is no card. A requirement
   that arrived as text is the source all the same: `sources:` says where it came from and `not_read:` what has no channel.
2. **Write `specs/$1-<slug>/card.md` with one `Write`**, from the template:
   - header: `status: proposed`, `cap: <N> min` (the time the card is worth; `time-cap` warns at 70 % and stops at 100 %; at grade poc at most 2× the likely time),
     at grade poc the card is a facade: only cap, `## Specs` (an assumption is an `ASM-NN` line with no test), `## Look` and `## Log` with `L1`; no `## Tasks`, no `## Gate`, no round of questions, no `replaces:` lines,
     `sources:` never empty, `not_read:` present;
   - `## Specs`: every sentence or criterion of the card as `S<n> · "<verbatim quote>"`, quoting only its own clause, not the whole card; an assumption as
     `$1-ASM-NN · <the cheapest reading to undo> · S<n>`, only for what changes what the user sees or does, and never adding an error path, status code or field the card does not ask for; the HTTP defaults of `reference/http-defaults.md` (profile backend) are one ASM with a test per row. A screen that calls an endpoint that does not exist yet: ask about it (AMB) or assume it as an ASM with its route and body, and plan it in `## Tasks`;
   - `## Look` (visual lens): when the requirement names no look, reference, brand, design or landing, the whole section is `plain: <why>` (no direction, designer or rounds); otherwise a `ref:` comes from the card, the repo's design system or `.claude/reference/design-refs.md` (profile web), never «the simplest»: it is an `ASM` with the reference of level; `tokens:` states mood and genre, and fixes no font family or palette unless the brand or the requester gives them;
   - `## Tasks` and `## Gate` as the template says: every `S#` and `ASM` has its planned test, a `probe <state>:` for each state `## Specs` names, `attacks:` with the limits the card says, `migrate-upgrade:` if it touches data;
   - before writing the Log: `Grep` the tags `@<ID>-S` of the earlier cards in the files the Tasks touch; each frozen test the new card contradicts goes in `## Log` as `replaces: <file> "<test>" · <why> · by: <file> "<test>"`;
   - `## Log`: `L1` is the requirement, verbatim and whole. `guard.mjs` freezes L1; the Log only grows.
   Not with a heredoc or `echo >`: `guard-shell` refuses it. Write the folder name, alone on one line, to `specs/.current`, and switch
   to branch `$1-<slug>` if you are on the default branch.
3. **Classify, then walk the lenses.** `node .claude/tools/risk.mjs specs/$1-<slug>` lists everything the plan lacks (a test per `S#` and `ASM`, a layer per file, a `probe` per state, `attacks:`, the migration) and writes nothing; fix them all and rerun. Complete, it writes `risk.json` (size, review, lenses), freezes it and prints the `risk:` line. Go through the questions of those lenses in `.claude/reference/lenses.md` before `## Specs` closes: what the card answers is a spec; what it does not is an AMB (someone to ask) or an `ASM-NN` in the cheapest reading to undo, with its planned test; rerun `risk.mjs`. A card that changes a route, screen or file of main has `## Changes to existing behavior` (`none` if it does not).
   With review `high` only, launch the `judge` with a prompt starting `PLAN` and the path of `card.md`: it writes `judge.md` with ACT lines marked `plan`. Close each one in the card before RED (a new `ASM-NN` with its planned test, a Gate line, or `declared · <why>`), write `closed · <ASM-NN, T<n> or Gate line>` on its line of `judge.md`, and rerun `risk.mjs`.
4. **One round of questions.** What the card does not say (the empty case, duplicates, validation, limits, permissions, states, error,
   order, concurrency, what must be stamped now) is `$1-AMB-NN · <date> · open · <question in the business's language, no IDs>` in
   `specs/$1-<slug>/ambiguities.md`. With Jira, all of them go in **one** comment on the card, posted without asking approval, each with
   the option assumed if nobody answers (`.claude/AUTONOMY.md`). The main thread reads the answers once, before RED; what is unanswered becomes an
   `$1-ASM-NN` line of `## Specs`, with its planned test. A later answer goes in the Log and the PR; it does not reopen RED. Never a second round.
5. Commit `card.md` alone. **Closes with:** `git show --name-only --format= HEAD` lists only `specs/$1-<slug>/card.md`; report the specs, the open questions, `not_read:` and the `risk:` line.
