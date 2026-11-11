---
description: Checks the card against its card.md, writes closing.md from the gate, the judge and the cost, and publishes the branch, the PR and the closing comment using only what they said.
argument-hint: <CARD-ID>
---

Card: `$1`.

1. Bring down every server, port, container and shell you started, by PID (`node .claude/tools/app.mjs down` for the shared app), never by process name, before the first run.
2. `node .claude/tools/close.mjs` runs its checks and writes `specs/<card>/closing.md` between its `close.mjs:begin` and `close.mjs:end`
   markers: L1 intact · every `S#` has a test · every tag is a spec · each ASM tagged or declared uncovered · no tagged test touched since
   RED · the diff and `## Tasks` agree · the gate green on this code · the plan judge (`judge.md` with every ACT closed or declared, when
   `risk.json` says high) · `required.mjs` · the critique (`critique.md`, a visual card at production). The `kit: <what>` lines of the Log become `## Kit notes`, and what the card taught about the kit (checks failed or not run, waivers, rules declared wrong, adjusted designs) goes to the kit's notes outside the repo (`kit.mjs notes`). Paste its raw output. `--check` writes nothing; a rerun regenerates only its block. Past 25 items of a kind, `## Needs a person` counts the rest and `closing-items.md` lists them all; under `refactor-tests:`, a frozen test edited only in titles, comments, assertion messages or names renamed alike everywhere (same tags, same setup, inputs, strings of data and assertions) is one decision line. If `closing.md` still passes the 65 536 characters a PR body takes, the output says so. Exit 0 all passed, 1 something failed, 2 no card in progress. Do not reread the sources: `closing.md` and the diff say what changed; open a file only when the diff asks.
3. Anything `failed` or `could not run` is not closed over: fix it and rerun. A failing check is never silenced:
   not turned off, not edited around. Turning on a module the repo needs (`kit.mjs on <module>` for a late signal, AUTONOMY.md) is not silencing. A step that cannot run (no remote, `gh`, Jira, CI) stays in `## Could not run`; nothing is invented.
4. At grade poc the close ends at the push of the branch: no PR, no merge. Publish, the only sequence (AUTONOMY.md says who may lift a refusal), in order (`publish.mjs` lets out exactly these): `git push -u origin <ID>-<slug>`, `gh pr create --title "<ID> · <title>"
   --body-file specs/<card>/closing.md`, CI in the background (`(gh pr checks --watch; echo "gh: exit $?") > .validation/ci.log 2>&1`, awaited with
   `node .claude/tools/wait.mjs .validation/ci.log --until "^gh: exit 0" --fail "^gh: exit [1-9]" --fail "no checks reported" --max 570`, repeated on exit 2; some `gh` versions end the watch without a summary phrase, so the wait reads the exit code), the result of `ci.log` written to `.validation/ci.md`, then `gh pr comment <n> --body-file .validation/ci.md`, the closing comment on Jira with the PR link, once (`<ID>-CLOSE · <date> · posted` is recorded by the hook), and `gh pr merge <n>`
   when the checks passed and `closing.md` has nothing failed and no `## Needs a person` (otherwise the PR stays open for a
   person). Never a push onto main, `--force` or `--admin` unless the user's last message orders it. With no remote, `## Could not run` gets `publish: could not run, no remote configured`; the card closes
   locally all the same and is not given as passed.
