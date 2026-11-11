#!/usr/bin/env node
// PreToolUse: blocks what the method forbids, on any tool that names a file: reading or writing a
// secret, and the writes that lower the bar.
// A hook cannot force anything to be done; it can prevent. Only the latter goes here.
// What it freezes: closing.md (close.mjs writes it), L1 and the `## Log` of card.md (the requirement as given, and a log that only grows), risk.json once it
// is written, the `deal` of a committed direction.json, a test tagged `@<ID>-S<n>` once a commit holds it, the kit's manifest, an applied migration and the
// lines of a verification config that existed before the card.
// Contract: exit 0 lets it through, exit 2 blocks and Claude reads stderr. On its own error it
// blocks: a guard that crashes and lets things through turns the rule into a suggestion.

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname } from 'node:path';

const reject = (reason) => {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
};

try {
  const { IS_VERIFICATION_CONFIG, isSecret, isSecretGlob, rootOf, relativeTo, currentCard, cardStart, existedAt } =
    await import('../tools/card.mjs');
  const { normalizePath, onDisk, IS_TEST_FILE, committedTagged, frozenExempt } = await import('../tools/guard-paths.mjs');
  const raw = readFileSync(0, 'utf8');
  const input = JSON.parse(raw);
  await (await import('../tools/card.mjs')).delegateToRepo(import.meta.url, raw, input);
  const data = input.tool_input ?? {};
  const tool = input.tool_name ?? '';
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();

  // The value of a secret is set by a person: the agent neither reads nor writes it, with any tool.
  // The same message as guard-shell.mjs; `cat .env.example` lists the names and is allowed.
  const named = [data.file_path, data.notebook_path, tool === 'Grep' ? data.path : null]
    .filter((p) => typeof p === 'string' && p).map((p) => normalizePath(p, cwd));
  if (named.some(isSecret) || (tool === 'Grep' && typeof data.glob === 'string' && isSecretGlob(data.glob))) {
    reject('Secrets are not read or written by the agent. The variable names are in .env.example ' +
           '(`cat .env.example`); the value is set by a person.');
  }
  // The checks below are about writing: reading a card, a test or a config is allowed.
  if (['Read', 'Grep'].includes(tool)) process.exit(0);

  const given = data.file_path ?? data.notebook_path ?? '';
  if (!given) process.exit(0);
  // `key` is what the rules match, one spelling per file; `path` is the file as the disk names it, for fs and git.
  const key = normalizePath(given, cwd);
  const path = onDisk(given, cwd);
  // Loaded only for a write: a Read or a Grep ends above without it.
  const { applyEdit, cardIdOf, logViolation } = await import('../tools/card-doc.mjs');

  // The manifest of the modules is written by `kit.mjs` and `install.mjs` only: a module is turned off
  // as a decision with its reason, never by editing a file.
  if (/(^|\/)\.claude\/kit(-files)?\.json$/.test(key)) {
    reject(
      '.claude/kit.json (and kit-files.json, the hashes of its files) is the manifest of the kit\'s modules and only `node .claude/tools/kit.mjs` writes it: ' +
      '`kit.mjs on <module>`, or `kit.mjs confirm-off <module> --reason "…"`. Turning a module off is a ' +
      'person\'s decision, between cards, with its reason.'
    );
  }

  // A migration that exists in the base (the merge-base with main) is assumed applied everywhere: it is
  // not edited, a correction is a new migration. One created in this branch is not in the base.
  const { appliedMigration, IMMUTABLE_ADVICE } = await import('../tools/migrations.mjs');
  const applied = appliedMigration(path, input.cwd ?? process.cwd());
  if (applied) reject(IMMUTABLE_ADVICE(applied));

  // The questions of the one round on the card, and what publish.mjs records, live in ambiguities.md: one line per event.
  if (/\/ambiguities\.md$/.test(key) && tool === 'Edit') {
    reject(
      'ambiguities.md is append-only: one line per event, and a written line is not touched. ' +
      'To record a state change, add a new event at the end.'
    );
  }

  // closing.md is written whole by close.mjs (from node, so this guard does not see that write): by hand it only gets out of step.
  if (/(^|\/)specs\/[^/]+\/closing\.md$/.test(key)) {
    reject(
      'closing.md is written whole by `node .claude/tools/close.mjs` and is not edited by hand. If something has to appear in it, ' +
      'add a line at the end of `## Log` in card.md (`- L<n> · <date> · closing: <what>`) and run close.mjs again: it copies the Log lines that start with `closing:`.'
    );
  }

  // card.md: the first write creates it; after that L1 stays as the card gave it and `## Log` is append-only.
  if (/(^|\/)specs\/[^/]+\/card\.md$/.test(key)) {
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const next = existsSync(path) ? applyEdit(current, data) : String(data.content ?? '');
    const why = existsSync(path) && logViolation(current, next);
    if (why) reject(`card.md: ${why}. The requirement is frozen; a later doubt or an answer is a new line at the end of \`## Log\`: \`node .claude/tools/log.mjs specs/<card> "<line>"\`.`);
    // The public bar is skipped only by the user (tools/public-bar.mjs): a new `public-skip:` line needs their last message to order it.
    const skips = (t) => new Set(t.split('\n').map((l) => l.trim()).filter((l) => /^public-skip\s*:/i.test(l)));
    const before = skips(current);
    if ([...skips(next)].some((l) => !before.has(l))) {
      const { currentOrder } = await import('../tools/transcript.mjs');
      const { ordersSkip } = await import('../tools/public-bar.mjs');
      if (!ordersSkip(currentOrder(input))) {
        reject('card.md: `public-skip:` turns off the public bar for the whole card, and only the user does that. Their last message has to order it ' +
          '("salteá la barra pública", "skip the public bar"), with no question. A line a public repo does carry is declared instead: ' +
          '`public-allow: <file> [<kind>] · <why>` in ## Gate.');
      }
    }
  }
  // risk.json is the classification that decides the size, the review and the lenses: written once by risk.mjs.
  if (/(^|\/)specs\/[^/]+\/risk\.json$/.test(key) && existsSync(path)) {
    reject('risk.json is frozen: risk.mjs wrote it once and a second run prints it. Only `node .claude/tools/risk.mjs --diff <card-dir>` (run by verify.mjs) raises it, from the real diff, and never lowers it. Changing the classification by hand lowers the review the card gets.');
  }

  // direction.json carries the `deal` draw.mjs recorded (seed, input, history), which the gate deals again to see that the palette was
  // dealt and not picked. Once a commit holds it, the `deal` is not changed by hand; the rest of the sheet is the designer's.
  if (/(^|\/)(?:specs\/[^/]+|design\/taste)\/direction\.json$/.test(key) && existsSync(path)) {
    const head = spawnSync('git', ['show', `HEAD:./${basename(path)}`], { cwd: dirname(path), encoding: 'utf8', maxBuffer: 1 << 26, timeout: 15000 });
    if (head.error) reject(`Could not query git for ${path} (${head.error.code ?? head.error.message}). Without it the guard cannot tell whether the deal is frozen, so it blocks.`);
    if (head.status === 0) {
      let committed = null;
      try { committed = JSON.parse(head.stdout).deal ?? null; } catch { committed = null; }
      let next;
      try { next = JSON.parse(applyEdit(readFileSync(path, 'utf8'), data)).deal ?? null; } catch { next = undefined; }
      if (committed !== null && next === undefined) reject('direction.json: the edit leaves a file that is not JSON, and its `deal` cannot be checked.');
      if (committed !== null && JSON.stringify(committed) !== JSON.stringify(next)) {
        reject('direction.json: its `deal` (seed, input, history) is committed and frozen. The gate deals it again to check the palette; to deal anew run `node .claude/skills/design-taste-frontend/scripts/draw.mjs` (it writes a new record), never edit the record by hand.');
      }
    }
  }

  // Whoever implements does not lower the bar they themselves have to clear. The freeze is the RED commit: a test
  // tagged `@<ID>-S<n>` or `@<ID>-ASM-NN` that HEAD already has is frozen; one that has not entered git yet is being
  // written. Frozen-ness comes from git alone: without specs/.current a committed tagged test is still frozen.
  if (IS_TEST_FILE.test(key) && existsSync(path)) {
    const head = committedTagged(path);
    if (head.error) {
      reject(`Could not query git for ${path} (${head.error}). Without being able to verify whether the test is frozen, the guard blocks.`);
    }
    const root = rootOf(path);
    // `refactor-tests: <why>` in the card's Gate lets a mechanical change (ids from numbers to text, a module moved) edit frozen
    // tests in place instead of copying them; close.mjs lists every one it touched, with its diff, for a person to review.
    // A grade whose level says `testsFrozen: false` (poc) leaves its committed tests editable; any doubt freezes them.
    if (head.frozen && !(await frozenExempt(root, currentCard))) {
      const named = root && currentCard(root, { named: true });
      const own = named && cardIdOf(named);
      const mine = own && new RegExp(`@${own}-(?:S\\d+|ASM-\\d+)(?!\\d)`).test(head.text);
      reject(
        `${root ? relativeTo(root, path) : path} has tagged tests${own ? (mine ? ' by this card' : ' by another card') : ''} and a commit already holds them: frozen. ` +
        'Whoever implements does not edit them. If one is wrong, replace it: a new file with the same tag, and ' +
        '`node .claude/tools/log.mjs specs/<card> "replaces: <test file> \\"<test>\\" · <why wrong> · by: <new file> \\"<test>\\""`. A mechanical change that has to touch many of them ' +
        'declares `refactor-tests: <why>` in ## Gate: they are edited in place and the close lists each one for review.'
      );
    }
  }

  // The configuration of what gets verified —linters, tests, coverage, mutation— that already
  // existed before the card only grows: rules are added to it, not removed or changed. Loosening it
  // is approving without fixing. Shrinking the command instead of the config is stopped by required.mjs.
  if (IS_VERIFICATION_CONFIG.test(key) && existsSync(path)) {
    const root = rootOf(path);
    const cardDir = root && currentCard(root);
    if (cardDir && existedAt(root, cardStart(root, cardDir), relativeTo(root, path))) {
      const linesOf = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean);
      const current = readFileSync(path, 'utf8');
      const remaining = new Set(linesOf(applyEdit(current, data)));
      const lost = linesOf(current).filter((l) => !remaining.has(l));
      if (lost.length) {
        reject(
          `${relativeTo(root, path)} configures what gets verified and already existed before the card: ` +
          `lines are only added to it. This change removes or modifies ${lost.length}: “${lost[0]}”` +
          `${lost.length > 1 ? '…' : ''}. If a rule flags something, the code gets fixed. If the ` +
          'rule is wrong, log it and it goes to the PR; the rule stays: `node .claude/tools/log.mjs specs/<card> "rule <name> is wrong: <why>"`.'
        );
      }
    }
  }
} catch (e) {
  reject(`The guard could not evaluate this write (${e.message}). It blocks when in doubt: ` +
         'retry, and if it persists, say so instead of looking for another way to write.');
}

process.exit(0);
