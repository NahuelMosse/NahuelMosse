#!/usr/bin/env node
// PreToolUse on Bash and PowerShell: during a card, a `git commit` carries the why in its body.
// Measured: in two runs the history had only subjects, and the decision behind each change was lost.
// A single -m with no blank-line body, no second -m and no -F is blocked. Exempt: --no-edit, -C, -c
// and --reuse-message (amends and merges that keep a message), and repos without a current card.
// In the kit's own source repo the subject must also be a Conventional Commit (see tools/release.mjs).
// Contract: exit 0 lets it through, exit 2 blocks and Claude reads stderr. On its own error it blocks.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { hookCard } from '../tools/card.mjs';
import { baseOf } from '../tools/migrations.mjs';

const CONVENTIONAL = /^(feat|fix|perf|refactor|docs|test|chore|style|build|ci|revert)(\([^)]+\))?!?: .+/;

// The source repo of the kit has its tests and installer and no kit.json; an installed repo has kit.json.
const isKitSource = (from) => {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, '.claude', 'tools', 'install.mjs'))) {
      return existsSync(join(dir, '.claude', 'tests')) && !existsSync(join(dir, '.claude', 'kit.json'));
    }
    const up = dirname(dir);
    if (up === dir) return false;
    dir = up;
  }
};

const reject = (reason) => {
  process.stderr.write(reason + '\n');
  process.exit(2);
};

let cmd;
let cwd;
try {
  const raw = readFileSync(0, 'utf8');
  const input = JSON.parse(raw);
  await (await import('../tools/card.mjs')).delegateToRepo(import.meta.url, raw, input);
  cmd = input.tool_input?.command ?? '';
  cwd = input.cwd ?? process.cwd();
} catch (e) {
  reject(`The commit check could not read the command (${e.message}). It blocks when in doubt: retry.`);
}

const start = cmd.match(/\bgit\s+(?:[^|;&\n"']*?\s)?commit\b/);
if (!start) process.exit(0);

// A heredoc message —"$(cat <<'EOF' … EOF)"— becomes one quoted word with its own text.
const flat = cmd.slice(start.index + start[0].length)
  .replace(/"\$\(\s*cat\s*<<-?\s*['"]?(\w+)['"]?\n([\s\S]*?)\n\s*\1\s*\n?\s*\)"/g, (_, __, body) => `"${body.replace(/["\\$`]/g, '')}"`);

// The words of the commit, up to the first unquoted operator.
const words = [];
let word = null;
for (let i = 0; i < flat.length; i++) {
  const c = flat[i];
  if (c === '"' || c === "'") {
    let j = i + 1;
    while (j < flat.length && flat[j] !== c) j += c === '"' && flat[j] === '\\' ? 2 : 1;
    word = (word ?? '') + flat.slice(i + 1, j);
    i = j;
  } else if (/\s/.test(c)) {
    if (c === '\n' && word === null) break;
    if (word !== null) words.push(word);
    word = null;
    if (c === '\n') break;
  } else if (/[;|&]/.test(c)) {
    break;
  } else word = (word ?? '') + c;
}
if (word !== null) words.push(word);

// Inside a card the commit is held to the public bar (tools/public-bar.mjs) before it enters the history, where a fix later
// does not remove it: at any grade the staged lines carry no secret, local path or real email.
const inCard = hookCard(cwd, process.env, { tool_name: 'Bash', tool_input: { command: cmd } });
// The grade comes from the installed kit's manifest; a repo without one (the kit's source, a bare test repo) has no grade to hold.
let grade = null;
let declared = { allow: [], skip: null };
let bar = null;
if (inCard) {
  bar = await import('../tools/public-bar.mjs');
  if (existsSync(join(inCard.root, '.claude', 'kit.json'))) {
    try { grade = (await import('../tools/kit.mjs')).active(inCard.root).grade ?? 'production'; } catch { grade = 'production'; }
  }
  const { readCard } = await import('../tools/card-doc.mjs');
  declared = bar.publicDeclarations(readCard(inCard.card) ?? '');
  if (!declared.skip) {
    const all = words.some((w) => w === '--all' || /^-[a-zA-Z]*a[a-zA-Z]*$/.test(w));
    const diff = spawnSync('git', ['diff', all ? 'HEAD' : '--cached', '-U0', '--no-color'], { cwd: inCard.root, encoding: 'utf8', maxBuffer: 1 << 28 });
    const found = diff.status === 0 ? bar.publicFindings(bar.addedLines(diff.stdout), { level: 'poc', allow: declared.allow }) : [];
    if (found.length) {
      reject(`The commit carries what a public repo never does (${found.length}): ${found.slice(0, 50).join('; ')}${found.length > 50 ? `; and ${found.length - 50} more` : ''}.\n` +
        'Fix the lines and stage them again, or declare in ## Gate `public-allow: <file> [<kind>] · <why>`; only the user skips the whole bar.');
    }
  }
}

if (words.some((w) => /^(--no-edit|--file(=.*)?|-F.*|-C.*|-c.*|--reuse-message(=.*)?|--reedit-message(=.*)?)$/.test(w))) process.exit(0);

const messages = [];
for (let i = 0; i < words.length; i++) {
  const w = words[i];
  if (/^--message=/.test(w)) messages.push(w.slice(10));
  else if (w === '--message' || /^-[a-zA-Z]*m$/.test(w)) messages.push(words[++i] ?? '');
}

// From mvp a card's commits are Conventional Commits, as a public repo's maintainer asks, and none is a wip or a fixup:
// the history is read by others. A repo declared `Visibility: public` writes them in English.
const subject = (messages[0] ?? '').split('\n')[0];
if (messages.length > 0 && inCard && grade && grade !== 'poc' && !declared.skip) {
  if (/^(?:wip\b|fixup!|squash!|amend!)/i.test(subject)) reject(`A card's commit says what it changes: "${subject}" is a wip or a fixup. Commit the finished step with its own subject.`);
  // A card keeps the convention it started with: a kit update that arrives mid-card does not reject the subjects its
  // history already uses ("PF-1 T6 …").
  const started = () => {
    const base = (() => { try { return baseOf(inCard.root)?.sha; } catch { return null; } })();
    if (!base) return false;
    const log = spawnSync('git', ['log', '--format=%s', `${base}..HEAD`], { cwd: inCard.root, encoding: 'utf8', timeout: 20_000 });
    return log.status === 0 && log.stdout.split('\n').some((s) => s && !CONVENTIONAL.test(s) && !/^Merge /.test(s));
  };
  // A repo whose history already prefixes commits with the card key ("KIT-06: …") keeps that convention in its next cards.
  const keyed = /^[A-Z][A-Z0-9]*-\d+\b[:\s]/;
  const repoKeyed = () => {
    const log = spawnSync('git', ['log', '-50', '--no-merges', '--format=%s'], { cwd: inCard.root, encoding: 'utf8', timeout: 20_000 });
    return log.status === 0 && log.stdout.split('\n').filter((s) => keyed.test(s)).length >= 3;
  };
  if (!CONVENTIONAL.test(subject) && !started() && !(keyed.test(subject) && repoKeyed())) {
    reject('A card\'s commits are Conventional Commits: `type(scope)!: subject`, with type feat | fix | perf | refactor | docs | test | chore | style | build | ci | revert. ' +
      'Example: git commit -m "feat(customers): search by partial name" -m "why".');
  }
  if (bar.isPublic(inCard.root) && bar.looksSpanish(messages.join('\n'))) reject('The repo is declared `Visibility: public`: its commits are in English, subject and body.');
}

// The kit's source repo: its commits are Conventional Commits, which tools/release.mjs reads to set the version.
if (messages.length > 0 && isKitSource(cwd) && !CONVENTIONAL.test(messages[0].split('\n')[0])) {
  reject('Commits in this repo are Conventional Commits: `type(scope)!: subject`, with type feat | fix | perf | refactor | docs | test | chore | style | build | ci | revert.\n'
    + 'feat raises the minor, fix and perf the patch. A major is marked with `!` after the type (`feat(card)!: ...`) or a `BREAKING CHANGE: ...` line in the body.\n'
    + 'tools/release.mjs sets the kit version from them. Example: git commit -m "feat(release): the version follows the commits" -m "why".');
}

if (messages.length === 0 || messages.length > 1) process.exit(0);
if (/\n\s*\n\s*\S/.test(messages[0])) process.exit(0);

// Only a card in progress asks for it.
if (!inCard) process.exit(0);

reject('The commit needs the why in its body: a second -m with what the change decides and why. Example: git commit -m "<subject>" -m "<why>"');
