#!/usr/bin/env node
// PreToolUse on Bash and PowerShell: the file guard only sees Edit/Write, so a `cat > file` or a `sed -i` dodges
// it entirely. This closes that path.
// Contract: exit 0 lets it through, exit 2 blocks and Claude reads stderr. On its own error it blocks.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const reject = (reason) => {
  process.stderr.write(reason + '\n');
  process.exit(2);
};

let cmd;
let background = false;
let input = {};
try {
  const raw = readFileSync(0, 'utf8');
  input = JSON.parse(raw);
  await (await import('../tools/card.mjs')).delegateToRepo(import.meta.url, raw, input);
  const data = input.tool_input ?? {};
  cmd = data.command ?? '';
  background = data.run_in_background === true;
} catch (e) {
  reject(`The guard could not read the command (${e.message}). It blocks when in doubt: retry.`);
}
if (!cmd) process.exit(0);

// The ways to write a file without Edit/Write: a redirection, `tee`, `sed -i`, `perl -i`, `dd of=`, the destination of
// `cp`/`mv`/`install`, `truncate`, the PowerShell cmdlets and `[IO.File]::Write*`; and a script handed to an
// interpreter on the line itself, which can write anything it names. The line is read as the shell reads it
// (shell-words.mjs): quotes inside a word, a `cd` before a relative path and a wrapper do not hide the target, and a
// commit message, a heredoc body or a quoted `->` is data, not a target. Reading stays allowed: the source of a `cp`,
// `grep`, `cat`, `git show`.
const base = typeof input.cwd === 'string' && input.cwd && existsSync(input.cwd) ? input.cwd : process.cwd();
const ADVICE = {
  card: 'Writing card.md or risk.json through the shell dodges the guard that keeps L1 and the Log of the card. ' +
    'Create card.md with one Write; a later line goes at the end of `## Log` with ' +
    '`node .claude/tools/log.mjs specs/<card> "<line>" ["<line>" ...]` (it numbers and dates each line), or with Edit.',
  closing: 'closing.md is written only by `node .claude/tools/close.mjs`, which seals it against the gate records; a line written by hand breaks the seal. Run /close instead.',
  unresolved: 'That line writes to a path the guard cannot read from its text (a variable, a loop, `eval`, `xargs`, a patch from stdin) and it names a file the guards protect. ' +
    'Write the path out in full, or use Read, Edit, Write and `node .claude/tools/log.mjs`.',
  ambiguities: 'ambiguities.md is append-only. `sed -i`, `>`, `Set-Content` and `Out-File` rewrite lines already ' +
    'recorded. To change a state, add a new event at the end with `>>`, `Add-Content` or `Out-File -Append`. ' +
    'One line per event: `<ID>-AMB-NN · <date> · resolved · <answer> · <author>, <date>` (or `expired → <ID>-ASM-NN`, `no channel · <question> → <ID>-ASM-NN`).',
  config: 'That is a configuration of what gets verified, and through the shell the guard cannot see what ' +
    'changes. Edit it with Edit or Write: if it only adds rules, it goes through.',
  manifest: '.claude/kit.json (and kit-files.json, the hashes of its files) is the manifest of the kit\'s modules, and through the shell it is not written: ' +
    '`node .claude/tools/kit.mjs on <module>` or `kit.mjs confirm-off <module> --reason "…"`. Turning a ' +
    'module off is a person\'s decision, between cards, with its reason.',
  secret: 'Secrets are not read or written by the agent. The variable names are in .env.example ' +
    '(`cat .env.example`); the value is set by a person.',
  frozen: 'has tagged tests and a commit already holds them: frozen, and the shell does not edit them either. If one is wrong, replace it: a new file with the same tag, and ' +
    '`node .claude/tools/log.mjs specs/<card> "replaces: <test file> \\"<test>\\" · <why wrong> · by: <new file> \\"<test>\\""`.',
};
let shell;
let paths;
let card;
try {
  shell = await import('../tools/shell-words.mjs');
  paths = await import('../tools/guard-paths.mjs');
  card = await import('../tools/card.mjs');
} catch (e) {
  reject(`The guard could not load its parsers (${e.message}). It blocks when in doubt: retry.`);
}
const visited = [];
const targets = [];
const scripts = [];
try {
  shell.walk(cmd, base, (step) => {
    visited.push(step);
    for (const w of shell.writesOf(step.segment, step.cwd)) targets.push({ ...w, cwd: step.cwd });
    if (step.script !== null) scripts.push({ text: step.script, cwd: step.cwd });
  });
  // A heredoc a program runs is a script: a shell's body is read as a command line, any other interpreter's as an inline script.
  for (const { name, body } of shell.heredocScripts(cmd)) {
    if (['sh', 'bash', 'zsh', 'dash', 'ksh'].includes(name)) {
      shell.walk(body, base, (step) => {
        visited.push(step);
        for (const w of shell.writesOf(step.segment, step.cwd)) targets.push({ ...w, cwd: step.cwd });
        if (step.script !== null) scripts.push({ text: step.script, cwd: step.cwd });
      });
    }
    scripts.push({ text: body, cwd: base });
  }
  for (const w of shell.fileApiWrites(shell.withoutBodies(cmd))) {
    if (w.path) targets.push({ ...w, cwd: base });
    else scripts.push({ text: shell.withoutBodies(cmd), cwd: base });
  }
} catch (e) {
  reject(`The guard could not read the command (${e.message}). It blocks when in doubt: retry.`);
}

// What goes through `xargs` or `eval` is written to paths the line does not spell: a writer given an unknown last path stands for it.
for (const { segment, cwd, name } of visited) {
  if (segment.words.some((w) => w === 'xargs')) {
    for (const w of shell.writesOf({ words: [...segment.words, '$xargs'], redirects: [] }, cwd)) if (w.path === '$xargs') targets.push({ ...w, cwd });
  }
  if (name === 'eval') targets.push({ path: '$eval', append: false, via: '`eval`', cwd });
}

const exemptions = new Map();
const exempt = async (file) => {
  const root = card.rootOf(file);
  if (!exemptions.has(root)) exemptions.set(root, await paths.frozenExempt(root, card.currentCard));
  return exemptions.get(root);
};
// A config outside every git work tree (a copy under /tmp) configures nothing a repo verifies.
const inWorkTree = (key) => {
  for (let dir = dirname(key); ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return true;
    if (dirname(dir) === dir) return false;
  }
};
// What a written path is, matched on its normalized spelling; resolved against the folder the segment runs in and,
// in case the `cd` tracking was wrong, against the folder of the call.
const kindOf = async ({ path, cwd, append }) => {
  for (const key of new Set([paths.normalizePath(path, cwd), paths.normalizePath(path, base)])) {
    if (/(^|\/)specs\/[^/]+\/(card\.md|risk\.json)$/.test(key)) return 'card';
    if (/(^|\/)specs\/[^/]+\/closing\.md$/.test(key)) return 'closing';
    if (/(^|\/)ambiguities\.md$/.test(key) && !append) return 'ambiguities';
    if (card.IS_VERIFICATION_CONFIG.test(key) && inWorkTree(key)) return 'config';
    if (/(^|\/)kit(-files)?\.json$/.test(key)) return 'manifest';
    if (card.isSecret(key)) return 'secret';
  }
  if (paths.IS_TEST_FILE.test(paths.normalizePath(path, cwd))) {
    const file = paths.onDisk(path, cwd);
    const head = paths.committedTagged(file);
    if (head.error) reject(`Could not query git for ${file} (${head.error}). Without being able to verify whether the test is frozen, the guard blocks.`);
    if (head.frozen && !(await exempt(file))) return 'frozen';
  }
  return null;
};
// The kinds of file a target that cannot be resolved may be: it blocks only when what can reach it names one of them.
const PROTECTED_TEXT = /card\.md|closing\.md|risk\.json|ambiguities\.md|kit(?:-files)?\.json|\.(?:test|spec)\.|(?:^|[\s/'"=$])specs\/|migrations?\//i;
const namesProtected = (text) => PROTECTED_TEXT.test(text) || String(text).split(/[\s'"`=;|&()<>,]+/).filter(Boolean).some((token) => {
  const key = paths.normalizePath(token.replace(/^\$\w*/, ''), base);
  return paths.IS_TEST_FILE.test(token) || card.IS_VERIFICATION_CONFIG.test(key) || card.isSecret(key) || card.isSecretGlob(token);
});
const NO_FILE = /^(?:\$null|\/dev\/null|nul)$/i;
// What an unresolved path can stand for: itself, and the values the line gives the variables it uses (`f=…`, `for f in …`).
// A variable the line binds from somewhere it cannot follow (`read`, `$1`, `$_`, a command substitution, a partial
// value like `$f.md`) can stand for anything the line names: the whole line is what it reaches.
const reachOf = (path, seen = new Set()) => {
  const reach = [path];
  const bare = /^["']?\$\{?\w+\}?["']?$/.test(String(path).trim());
  if (/\$[@*]/.test(path)) return cmd;
  for (const [, name] of String(path).matchAll(/\$\{?(\w+)/g)) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (/^\d+$/.test(name) || /^(?:_|PSItem)$/i.test(name)) return cmd;
    const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b(?:read|mapfile|readarray)\\b[^;\\n&|]*\\b${n}\\b`).test(cmd)) return cmd;
    // Assignment forms: `n=v`, `for n in v`, `printf -v n fmt…`, `: ${n:=v}`, `Set-Variable -Name n -Value v`.
    const forms = `(?:^|[\\s;&|(])\\$?${n}\\s*=([^;\\n&|]*)|\\bfor(?:each)?\\s*\\(?\\s*\\$?${n}\\s+in\\s+([^;\\n)]*)|\\bprintf\\s+-v\\s+${n}\\s+([^;\\n&|]*)|\\$\\{${n}:?=([^}]*)\\}|\\bSet-Variable\\s+(?:-Name\\s+)?\\$?${n}\\s+(?:-Value\\s+)?([^;\\n&|]*)|\\bSet-Variable\\s+-Value\\s+([^;\\n&|]*?)\\s+-Name\\s+\\$?${n}\\b`;
    for (const m of cmd.matchAll(new RegExp(forms, 'gi'))) {
      const value = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? '').trim();
      // A partial path (`out/$f.txt`) over literal values is each value spelled into it.
      if (!bare && !/[`$*?[]/.test(value)) {
        const words = m[2] !== undefined ? value.split(/\s+/) : [value];
        for (const w of words) reach.push(String(path).replace(new RegExp(`\\$\\{?${n}\\}?(?!\\w)`, 'g'), w.replace(/^["']|["']$/g, '')));
        continue;
      }
      if (!bare) return cmd;
      if (!/[`$]/.test(value)) { reach.push(value); continue; }
      // A temp folder plus a literal name, or a `mktemp`, is a scratch path the line spells in full.
      if (/^["']?\$\{?(?:TMPDIR|TEMP|TMP)\}?\/[^$`"']*["']?$/.test(value) || /^["']?\$\(\s*mktemp\b[^$`()]*\)["']?$/.test(value)) { reach.push(value.startsWith('$(') || /mktemp/.test(value) ? 'mktemp' : value); continue; }
      if (!/^["']?\$\{?\w+\}?["']?$/.test(value)) return cmd;
      reach.push(reachOf(value, seen));
    }
  }
  return reach.join('\n');
};
const NULL_BOUND = /(?:^|[\s;&|(])\$?null\s*=/i;
const noFile = (p) => NO_FILE.test(p ?? '') && !(/^\$null$/i.test(p) && NULL_BOUND.test(cmd));
for (const target of targets) {
  if (noFile(target.path)) continue;
  if (target.unresolved || shell.isUnresolved(target.path)) {
    // `xargs`, `eval` and a patch from stdin write paths that come from anywhere in the line.
    const opaque = ['$xargs', '$eval', '-'].includes(target.path);
    if (namesProtected(opaque ? cmd : reachOf(target.path))) reject(ADVICE.unresolved);
    continue;
  }
  const candidates = [target.path];
  if (shell.isGlob(target.path)) for (const match of shell.expandGlob(target.path, target.cwd)) candidates.push(match);
  for (const path of candidates) {
    const kind = await kindOf({ ...target, path });
    if (kind === 'frozen') reject(`${path} ${ADVICE.frozen}`);
    if (kind) reject(ADVICE[kind]);
  }
}

const WRITE_CALL = /\b(?:write\w*|append\w*|copyFile\w*|rename\w*|unlink\w*|rm|rmSync|rmdir\w*|truncate\w*|createWriteStream|writelines|Set-Content|Add-Content|Out-File|Tee-Object|Remove-Item|Move-Item|Copy-Item|Rename-Item)\s*[(\s]|\b(?:execSync|execFileSync|spawnSync|exec|execFile|spawn)\s*\(|\bos\.(?:system|popen|exec\w*|spawn\w*)\b|\bsubprocess\.\w+|\b(?:cp|cpSync|copy\w*|move\w*)\s*\(|\bopen(?:Sync)?\s*\([^)]*,\s*['"`]\s*[rbt]*[wax+>]|\bos\.(?:remove|removedirs|replace|rename\w*|unlink|rmdir|truncate|ftruncate|write|link|symlink)\b|\bos\.open\s*\([^)]*\bO_(?:WRONLY|RDWR|CREAT|TRUNC|APPEND)|\bshutil\.(?:copy\w*|move|rmtree)\b|\bopen\s*\(?\s*(?:my\s+)?[$\w]+\s*,\s*(?:['"]\s*(?:\+?>|\+<)|['"]?\s*>)/i;
// An inline script can write any file it names, through any API: a protected file named anywhere in it is refused.
if (scripts.length) {
  const config = card.IS_VERIFICATION_CONFIG.source.replace('(^|\\/)', '').replace(/\$$/, '').replaceAll('[^/]', '[^/\\s\'"`]');
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const { text, cwd } of scripts) {
    // The folder the script runs in may hold no repo (a failed `cd`): the folder of the call is searched as well.
    const here = paths.frozenNames(cwd);
    const there = cwd === base ? here : paths.frozenNames(base);
    const frozen = here.error || there.error ? { error: here.error ?? there.error } : { names: [] };
    if (frozen.error) reject(`Could not query git for the frozen tests (${frozen.error}). Without being able to verify them, the guard blocks.`);
    const names = [];
    for (const [found, folder] of [[here, cwd], [there, base]]) {
      if (found.names.length && !(await exempt(resolve(folder, '_')))) names.push(...found.names.map(escape));
    }
    const protectedName = new RegExp(`(?<![\\w-])(?:card\\.md|risk\\.json|ambiguities\\.md|kit(?:-files)?\\.json|${config}${names.length ? `|${names.join('|')}` : ''})(?![\\w-])`, 'i');
    const hit = text.match(protectedName);
    // Naming a file is not writing it: a script that only reads card.md passes.
    if (hit && WRITE_CALL.test(text)) {
      reject(`That script names ${hit[0]}, a file the guards protect, and a script can write it through any API they cannot see. ` +
        'Read it with Read or `cat`; a card line goes through `node .claude/tools/log.mjs`, a config through Edit, the manifest through `kit.mjs`.');
    }
  }
}

// Migrations that exist in the base are assumed applied everywhere (DB-MIG-12): through the shell they
// are not edited, renamed, moved or deleted either, and the commands that silence the integrity check of
// the history are not run (DB-MIG-13). A regex over a shell line is incomplete by nature: this is the
// first layer, and the close compares the working tree with the base, which no other route dodges.
try {
  const { shellViolation, IMMUTABLE_ADVICE, ESCAPE_ADVICE } = await import('../tools/migrations.mjs');
  const where = typeof input.cwd === 'string' && existsSync(input.cwd) ? input.cwd : process.cwd();
  const found = shellViolation(cmd, where);
  if (found?.escape) reject(ESCAPE_ADVICE(found.escape));
  if (found) reject(IMMUTABLE_ADVICE(found));
} catch (e) {
  reject(`The guard could not evaluate the migrations (${e.message}). It blocks when in doubt: retry.`);
}

// Secrets: the agent neither reads nor writes them, so the value never enters the context. They are
// blocked as the destination of a write (above), or as the argument of something that reads or copies them.
// Naming them to a program that loads them itself (`node --env-file=.env app.js`,
// `docker compose --env-file .env up`) is allowed: the agent does not see the content.
// A glob that can match `.env` (`.e*`, `.en?`, `.[e]nv`) reaches it as well as its name.
// Declared holes: `git diff` or `git show` of a versioned `.env`, a script that reads the file, and
// `env` or `printenv` after loading it.
const { hookCard, actsAsMain } = card;
const READERS = new Set('cat|type|less|more|head|tail|bat|nl|od|xxd|hexdump|strings|base64|grep|rg|egrep|sed|awk|cut|sort|diff|cmp|cp|mv|scp|rsync|tar|zip|7z|openssl|source|get-content|gc|select-string|copy-item|move-item|code|notepad|vim|nano'.split('|'));
const globReachesEnv = (word) => {
  const name = word.replaceAll('\\', '/').split('/').pop();
  if (!/[*?[]/.test(name) || !name.startsWith('.')) return false;
  const pattern = name.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\[!/g, '[^');
  try { return new RegExp(`^${pattern}$`, process.platform === 'win32' ? 'i' : '').test('.env'); } catch { return true; }
};
const secretWord = (word, cwd) => globReachesEnv(word) || card.isSecretGlob(word) || card.isSecret(paths.normalizePath(word, cwd));
const secretReach = visited.some(({ segment, cwd, name, args }) => {
  const names = segment.words.map((w) => w.replaceAll('\\', '/').split('/').pop().toLowerCase().replace(/\.exe$/, ''));
  const curl = name === 'curl' && args.some((a) => /^(?:-d@?|-F|-T|--data\S*|--upload-file)/.test(a));
  const reads = names.some((n) => READERS.has(n)) || segment.words[0] === '.' || curl;
  return reads && segment.words.some((w) => secretWord(w, cwd) || (curl && secretWord(w.split(/[=@]/).pop(), cwd)));
});
if (secretReach) reject(ADVICE.secret);

// A check is never skipped to make a commit or a push go through: not with `--no-verify` in any spelling git accepts
// (an unambiguous prefix down to `--no-v`), not with `git commit -n` (alone or in a cluster of short flags), and not by
// pointing `core.hooksPath` elsewhere for one call. A commit message is data: the values of `-m`, `-F` and their kin are
// not flags.
const SKIPS_HOOKS = '`--no-verify`, `git commit -n` `-c core.hooksPath=…` and `git config core.hooksPath` skip the hooks that protect the card. Fix what the hook reports; if the hook is ' +
  'wrong, record it in the card\'s `## Log` as `- L<n> · OUT · <what>` and it goes to the PR; the hook stays.';
const TAKES_VALUE = /^(?:-m|-F|-C|-c|-t|-o|--message|--file|--reuse-message|--reedit-message|--template|--author|--date|--trailer|--push-option|--cleanup|--fixup|--squash)$/;
for (const { name, args } of visited) {
  if (name !== 'git') continue;
  let i = 0;
  for (; i < args.length && args[i].startsWith('-'); i++) {
    const a = args[i];
    const config = a === '-c' || a === '--config-env' ? args[++i] ?? '' : a.match(/^(?:-c|--config-env=)(.+)$/)?.[1];
    if (config !== undefined && /^core\.hookspath\b/i.test(config)) reject(SKIPS_HOOKS);
    if (['-C', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix'].includes(a)) i++;
  }
  const sub = args[i];
  // `git config core.hooksPath …` skips the hooks for good; reading or unsetting it does not.
  const rest = args.slice(i + 1);
  const plain = rest.filter((a) => !a.startsWith('-'));
  const at = plain.findIndex((a) => /^core\.hookspath$/i.test(a));
  if (sub === 'config' && at >= 0 && plain.length > at + 1 && !rest.some((a) => /^--(?:get\S*|list|unset\S*)$|^-l$/.test(a))) reject(SKIPS_HOOKS);
  const remotePush = plain.findIndex((a) => /^remote\..+\.push$/i.test(a));
  if (sub === 'config' && remotePush >= 0 && plain.length > remotePush + 1 && !rest.some((a) => /^--(?:get\S*|list|unset\S*)$|^-l$/.test(a))) {
    reject('`git config remote.<name>.push …` rewrites where every push of that remote lands (it can send a card branch onto main), so setting it is refused. Reading or unsetting it is fine.');
  }
  for (let j = i + 1; j < args.length; j++) {
    const a = args[j];
    if (a === '--') break;
    if (/^--no-v(?:e(?:r(?:i(?:f(?:y)?)?)?)?)?(?:=|$)/.test(a)) reject(SKIPS_HOOKS);
    if (TAKES_VALUE.test(a)) { j++; continue; }
    if (sub === 'commit' && /^-[A-Za-z]+$/.test(a)) {
      for (const ch of a.slice(1)) {
        if (ch === 'n') reject(SKIPS_HOOKS);
        if ('mFCctSu'.includes(ch)) break;
      }
      if (/^-[A-Za-z]*[mFCct]$/.test(a)) j++;
    }
  }
}
const segments = visited.map(({ segment }) => segment.words.join(' '));

// A stash changes the tree under the runs in the background (verify, a suite): measured, a false red on a
// real card. With a card in progress only the read-only forms go through.
const stashes = segments.some((segment) => {
  const tokens = segment.trim().split(/\s+/);
  if (!/^git(\.exe)?$/i.test(tokens[0] ?? '')) return false;
  let i = 1;
  while (i < tokens.length && tokens[i].startsWith('-')) i += ['-C', '-c', '--git-dir', '--work-tree'].includes(tokens[i]) ? 2 : 1;
  return tokens[i] === 'stash' && !['list', 'show'].includes(tokens[i + 1]);
});
if (stashes) {
  let inProgress = false;
  try { inProgress = Boolean(hookCard(input.cwd ?? process.cwd(), process.env, input)); } catch {}
  if (inProgress) {
    reject('git stash changes the working tree under the runs in the background (verify, a suite) and turns them red for nothing. ' +
           'Commit what you have, or work in a separate checkout with git worktree add; git stash list and git stash show are fine.');
  }
}

// A suite or a check that is a line of the plan's `## Verification` runs through once.mjs or verify.mjs: a
// bare run leaves no record, so verify.mjs runs the same thing again. Measured: a card ran its whole suite by
// hand three times, and verify.mjs ran it once more each time. Only the exact command of a line (or the
// `npm run <script>` of a line that is a script) is refused: a bounded run (`npx playwright test --grep @X`,
// `node --test one.test.mjs`) is not that line.
// Inside a subagent the rule is wider: what is equivalent to a whole line (an npm script a line reaches, its body,
// `playwright test -c <config>` or `node --test <globs>` with no filter) is refused as well, and a grunt or a
// designer runs no verify.mjs: the first whole run is the builder's or the main thread's, in step 4.
// For a subagent a parser that fails refuses; for the main thread it does not stop the shell, the rule is about cost.
const agentType = String(input.agent_type ?? '');
const noSuites = Boolean(input.agent_id) && /^(?:builder|grunt|designer)$/.test(agentType);
try {
  const found = hookCard(input.cwd ?? process.cwd(), process.env, input);
  // The lines of the gate: `## Gate` of card.md, or `## Verification` of a plan.md a repo still has.
  const cardPath = found && `${found.card}/card.md`;
  const heading = cardPath && existsSync(cardPath) ? 'Gate' : 'Verification';
  const planPath = found && (heading === 'Gate' ? cardPath : `${found.card}/plan.md`);
  if (planPath && existsSync(planPath)) {
    const plan = readFileSync(planPath, 'utf8');
    const section = plan.split(/^## /m).find((s) => s.startsWith(heading)) ?? '';
    const clean = (c) => c.trim().replace(/^cd\s+\S+\s*&&\s*/, '').replace(/\s*\|\s*(?:tail|head)\b[^|]*$/, '')
      .replace(/(?:\s+(?:\d*>>?|&>)\s*&?\S+)+\s*$/, '').replace(/\s+/g, ' ').trim();
    const { planCommands, scriptNamed, wholeRunOf } = await import('../tools/verify.mjs');
    const { commandsOf } = await import('../tools/shell-writes.mjs');
    const { records } = await import('../tools/once.mjs');
    const planned = section && planCommands(plan, { base: 'HEAD', cardDir: found.card }, heading);
    const norm = (c) => c.replace(/\s+/g, ' ').trim();
    // Short: named lint, types or format, or measured under 30 s by verify.mjs (durations.json, by command) or once.mjs
    // (its records, by name); with several measures the longest counts. A line nobody has run is not short.
    const SHORT_MIN = 0.5;
    const shortLine = (root, line) => {
      if (/^(?:lint|types|format)$/i.test(line.name)) return true;
      let durations = {};
      try { durations = JSON.parse(readFileSync(join(root, '.validation', 'verify', 'durations.json'), 'utf8')); } catch {}
      const measures = Object.entries(durations).filter(([known]) => known && line.command.includes(known)).map(([, m]) => Number(m));
      for (const r of records(root)) if (r.name === line.name) measures.push(Number(r.minutes));
      const known = measures.filter(Number.isFinite);
      return known.length > 0 && Math.max(...known) < SHORT_MIN;
    };
    const MAIN_THREAD ='A whole run is the gate\'s: verify.mjs, run by the builder or the main thread; a runner or an executor runs a line through once.mjs. ';
    const BOUNDED = 'A bounded run goes through: one spec file, `--grep` or `-g` on a tag, node --test over one file or with `--test-name-pattern`, tsc and eslint on what you touched.';
    // Each command the line runs is compared on its own: parentheses, a trailing `&`, `nohup`, `sh -c '…'`, an
    // environment prefix and `cd x &&` do not make a whole line another command.
    for (const asked of [...new Set(commandsOf(cmd).map(clean))].filter(Boolean)) {
      if (planned && noSuites && agentType !== 'builder' &&/\bnode\s+(?:-\S+\s+)*\S*verify\.mjs(?:\s|$)/.test(asked)) {
        reject(`A ${agentType} does not run verify.mjs: the gate is the builder's or the main thread's. ${MAIN_THREAD}${BOUNDED}`);
      }
      // Through once.mjs the command is what comes after `--`.
      const viaOnce = noSuites && /\bnode\s+(?:-\S+\s+)*\S*once\.mjs\s/.test(asked);
      const inner = viaOnce ? clean(asked.replace(/^.*?\bonce\.mjs\s+\S+\s+--\s+/, '')) : asked;
      if (planned && inner && (viaOnce || !/\b(?:once|verify)\.mjs\b/.test(asked))) {
        const exact = (/^(?:npm|pnpm|yarn)\s/.test(inner) || section.replace(/\s+/g, ' ').includes(inner)) &&
          planned.find((c) => c.file === undefined && (norm(c.command) === inner || (scriptNamed(inner) && scriptNamed(inner) === scriptNamed(norm(c.command)))));
        const equivalent = exact ? { line: exact.name, what: 'its exact command' } : input.agent_id ? wholeRunOf(inner, planned, found.root) : null;
        // A subagent may run a short line: one named lint, types or format, or one measured under 30 s.
        const reached = input.agent_id && equivalent ? planned.find((c) => c.file === undefined && c.name === equivalent.line) : null;
        if (reached && shortLine(found.root, reached)) continue;
        // To a builder, a grunt or a designer, once.mjs is refused as well: it is not recommended.
        if (exact && !viaOnce && !noSuites) {
          reject(
            `That is the command of the verification line “${exact.name}” of the plan, run on its own: it leaves no record and verify.mjs repeats it. ` +
            'Run it as `node .claude/tools/once.mjs <name> -- <command>` (name: the line\'s, here ' + `“${exact.name}”), or let node .claude/tools/verify.mjs run it with the other lines. ` +
            'A bounded run (one test file, `--grep` on one tag) goes through as it is.'
          );
        }
        if (equivalent) {
          reject(
            `That is the whole of the verification line “${equivalent.line}” of the plan (${equivalent.what})${viaOnce ? ', even through once.mjs' : ' run bare inside a subagent'}: ` +
            (noSuites ? `a ${agentType} does not run whole suites (the gate is verify.mjs). ` : 'it leaves no record and verify.mjs repeats it: run it as `node .claude/tools/once.mjs <name> -- <command>`. ') +
            MAIN_THREAD + BOUNDED
          );
        }
      }
    }
  }
} catch (e) {
  if (input.agent_id) reject(`The guard could not evaluate the verification lines of the plan (${e.message}). It blocks a subagent when in doubt: retry.`);
}

// `node --test` waits for every handle its tests leave open: a server or a browser kept one agent's call blocked for its whole
// timeout, 6.8 minutes, after the tests had ended in 14 seconds. An agent runs it with `--test-force-exit`; the commands of the kit
// (`mutate.mjs … -- node --test …`, verify.mjs) carry their own flags and are not a `node --test` of the agent.
if (input.agent_id) {
  const { commandsOf } = await import('../tools/shell-writes.mjs');
  const NODE_TEST = /^(?:npx\s+(?:-\S+\s+)*)?node(?:@\S+)?(?:\.exe)?\s+(?:-\S+\s+)*?--test(?=\s|$)/;
  if (commandsOf(cmd).some((c) => NODE_TEST.test(c) && !/(?:^|\s)--test-force-exit(?=[\s=]|$)/.test(c))) {
    reject('node --test without `--test-force-exit` waits for every handle the tests leave open (a server, a browser) and blocks the call for its whole timeout. ' +
           'Run it as `timeout <s> node --test --test-timeout=8000 --test-force-exit <files>`, and never two runs of the same browser suite at once. ' +
           'If the runtime aborts at the forced exit (UV_HANDLE_CLOSING, Windows), a test leaves a keep-alive connection open: close the server in `after` with `server.closeAllConnections()` before `server.close()`.');
  }
}

// Two Playwright runs share `test-results/` and erase each other's output (a complete verification was repeated,
// 30 minutes). While once.mjs or verify.mjs holds the browser-run lock of the card (tools/browser-lock.mjs), a
// command that launches Playwright —`playwright test`, an `npm run` that expands to it, once.mjs of a browser
// line, verify.mjs— is refused. A saving, not a guard of the card: if it cannot read, it lets through.
try {
  const found = hookCard(input.cwd ?? process.cwd(), process.env, input);
  const lock = await import('../tools/browser-lock.mjs');
  const held = found && lock.liveLock(found.root);
  if (held) {
    const { launchesPlaywright } = lock;
    const { commandsOf } = await import('../tools/shell-writes.mjs');
    if (commandsOf(cmd).some((c) => /\bnode\s+(?:-\S+\s+)*\S*verify\.mjs(?:\s|$)/.test(c) || launchesPlaywright(c, found.root))) {
      reject(`a browser run is in progress (pid ${held.pid}: ${held.command}); wait for it with wait.mjs, they share the output dir`);
    }
  }
} catch { /* a saving: without a reading it says nothing */ }

// The captures project rewrites the PNGs of every card when it runs whole, and the diff then carries the evidence
// of earlier cards (required.mjs reports it). During a card the agent is told to run it with this card's filter:
// a warning to the agent, not a refusal.
try {
  const runsCaptures = /\bplaywright\s+test\b[^|;&\n]*(?:--project[=\s]+captures\b|captures\S*\.config)|\bnpm\s+run\s+captures\b/.test(cmd);
  const filtered = /(?:^|\s)(?:-g|--grep)(?:[=\s]|$)/.test(cmd) || /\s\S+\.(?:capture|spec)\.[cm]?[jt]sx?\b/.test(cmd);
  if (runsCaptures && !filtered && hookCard(input.cwd ?? process.cwd(), process.env, input)) {
    const advice = 'The captures project rewrites the PNGs of every card when it runs whole, and the diff would carry the evidence of earlier cards. ' +
      "During a card run it only with the card's filter: `--grep` on its views (\"@capture <view>\") or its own capture file.";
    process.stdout.write(JSON.stringify({ systemMessage: advice, hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: advice } }));
  }
} catch { /* advice only */ }

// The guards of production code see Edit and Write, not the shell: a subagent that writes it with `sed -i`, a
// redirection, `tee` or a script that calls `writeFileSync` leaves no trace they can read. With a card in progress
// the forms that can be read from the text are refused (shell-writes.mjs says what changed after the ones that cannot).
// The main thread's shell writes go through the same rule as its Edit and Write (delegate-rule.mjs).
try {
  const found = hookCard(input.cwd ?? process.cwd(), process.env, input);
  if (found) {
    const { shellWrites } = await import('../tools/shell-writes.mjs');
    const { files, via } = shellWrites(cmd, { root: found.root, cwd: input.cwd ?? process.cwd(), tool: input.tool_name });
    if (files.length && !input.agent_id) {
      const { productionVerdict } = await import('../tools/delegate-rule.mjs');
      for (const file of files) {
        const why = await productionVerdict(input, join(found.root, file));
        if (why) reject(`${why} That includes writing ${file} through the shell (${via.join(', ')}).`);
      }
    } else if (files.length) {
      reject(`That writes production code through the shell (${via.join(', ')}: ${files.join(', ')}), where the guards that protect the card do not see it. ` +
        'Use Edit or Write for production files: whole file with Write, a small change with Edit. The shell is for running things, not for writing the product.');
    }
  }
} catch (e) {
  reject(`The guard could not evaluate the shell writes (${e.message}). It blocks a subagent when in doubt: retry.`);
}

// Waiting for another agent with a sleep loop is waiting blind, in series, and rereading context.
// Measured: a 107-minute card spent 40 in ten-minute loops asking whether a subagent's output
// existed yet. A short loop to wait for a server to come up is fine, and one that runs in the
// background blocks no one: it notifies when it finishes.
// A shell loop has its `do`; a `for` inside a script passed to `node -e` is not one.
// A PowerShell loop has its block: `while (…) { … }`, `for (…) { … }` or `do { … } while (…)`.
// What `cat` or `tee` writes from a heredoc is a file's text, not something this command runs: a script written for later
// is not a wait (measured: two scripts of mutations refused while being written).
const run = cmd.replace(/\b(?:cat|tee)\b[^\n]*<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, ' ');
const loop =!background && (/\b(for|while|until)\b[^\n]*?[;\n]\s*do\b/.test(run) || /\b(while|until|for)\s*\([^\n]*\)\s*\{|\bdo\s*\{/i.test(run));
// The seconds a command sleeps: `sleep N`, PowerShell's `Start-Sleep [-Seconds|-s] N` and `-Milliseconds|-m N`,
// and cmd's `timeout /t N`.
const sleepsOf = (text) => [
  ...[...text.matchAll(/\bsleep\s+(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])),
  ...[...text.matchAll(/\bStart-Sleep\s+(?:-(?:Seconds|s)\s+)?(\d+(?:\.\d+)?)/gi)].map((m) => Number(m[1])),
  ...[...text.matchAll(/\bStart-Sleep\s+-(?:Milliseconds|m|ms)\s+(\d+)/gi)].map((m) => Number(m[1]) / 1000),
  ...[...text.matchAll(/\btimeout(?:\.exe)?\s+\/t\s+(\d+)/gi)].map((m) => Number(m[1])),
];
const wait = Math.max(0, ...sleepsOf(run));
// A sleep before or after a loop, outside its `do … done`, is a wait of its own: `sleep 100; for f in *.log; do tail $f; done`.
const waitOutsideLoop = Math.max(0, ...sleepsOf(run.replace(/\b(?:for|while|until)\b[\s\S]*?\bdone\b/g, ' ')));
const watchesAgent = /tasks[\\/][^\s"']*\.output\b|stop_reason/.test(run);
// A short sleep repeated for minutes is the same wait. The loop's ceiling —a `timeout N` around it,
// or a counter times its sleep— says how long it can hold the turn. Measured: a card ran
// `timeout 285 sh -c 'until …; do sleep 0.5; done'` 288 times, nine of its ten hours.
const timeoutCap = Math.max(0, ...[...run.matchAll(/\btimeout\s+(\d+)/g)].map((m) => Number(m[1])));
// The other ways to say how many times it goes round: `for i in $(seq 1 30)`, `{1..30}`, `for i in 1 2 3`
// and `for ((i=0; i<30; i++))`. A list it cannot count (`$(ls)`, a glob, a variable) says nothing.
const seqCount = (args) => {
  const nums = args.trim().split(/\s+/).filter((a) => !/^-[a-zA-Z]/.test(a)).map(Number);
  if (!nums.length || nums.length > 3 || nums.some(Number.isNaN)) return null;
  const [from, step, to] = nums.length === 1 ? [1, 1, nums[0]] : nums.length === 2 ? [nums[0], 1, nums[1]] : nums;
  return step === 0 ? null : Math.max(0, Math.floor((to - from) / step) + 1);
};
const iterationsOf = (text) => {
  const counts = [...text.matchAll(/\bfor\s+\w+\s+in\s+([^;\n]*?)\s*[;\n]\s*do\b/g)].map((m) => {
    let n = 0;
    let known = true;
    const rest = m[1]
      .replace(/\$\(\s*seq\s+([^)]*)\)|`\s*seq\s+([^`]*)`/g, (_, a, b) => {
        const c = seqCount(a ?? b);
        if (c === null) known = false; else n += c;
        return ' ';
      })
      .replace(/\{(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?\}/g, (_, a, b, s) => {
        n += Math.floor(Math.abs(Number(b) - Number(a)) / Math.abs(Number(s) || 1)) + 1;
        return ' ';
      });
    const words = rest.split(/\s+/).filter(Boolean);
    if (words.some((w) => /[$`*?()]/.test(w))) known = false;
    return known ? n + words.length : 0;
  });
  for (const m of text.matchAll(/\bfor\s*\(\(\s*\w+\s*=\s*(\d+)\s*;\s*\w+\s*(<=|<)\s*(\d+)/g))
    counts.push(Number(m[3]) - Number(m[1]) + (m[2] === '<=' ? 1 : 0));
  return Math.max(0, ...counts);
};
const counterCap = Math.max(0, ...[...run.matchAll(/-(?:ge|gt|lt|le)\s+(\d+)/g)].map((m) => Number(m[1])), iterationsOf(run)) * wait;
// A wait inside the prompt cache costs one turn; every wake-up past it rewrites the whole context. The main
// thread and the agents that wait on suites (builder, runner, executor) keep a one-hour cache, so one
// wait of up to 10 minutes is a single turn. Measured: a card polled every 25 s for 949 turns, USD 85 of 175.
// A subagent (its hook input carries `agent_id`; the main thread's does not) that runs a card waits for its
// own agents and processes: for it, a foreground wait is allowed when it has a ceiling of at most 570 s
// —an explicit `timeout` on the tool call, or a `timeout N` / counter in the loop—. The main thread keeps the rule above.
// `wait.mjs` is the way to wait: one process that ends on the line it was told to wait for.
// Who keeps the one-hour cache is read, in this order: from the `usage` of the last assistant message of its own
// transcript (1-hour tokens written: the agent may not be defined in the repo at all, as the main thread of a run
// is not); from its frontmatter (`experimental: cacheTtl: 1h`) in the repo's `.claude/agents`, the home's and the
// kit's own; and by default the main thread has one hour and a subagent five minutes (the old ceiling of 270 s).
// wait.mjs does not know which agent runs it: the guard holds a five-minute agent to its ceiling.
const waitMax = [...run.matchAll(/\bwait\.mjs\b[^|;&\n]*?--max[=\s]+(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
const toolTimeout = Number(input.tool_input?.timeout);
// Only a command that waits is judged by the cache it keeps; the rest skip reading the transcript.
const waits = waitMax.length > 0 || loop || wait > 0 || toolTimeout > 300000;
const hourCache = waits && await (async () => {
  try {
    const { transcriptOf, lastUsage } = await import('../tools/transcript.mjs');
    const file = transcriptOf(input) ?? (input.agent_id ? null : input.transcript_path);
    if (file && existsSync(file) && lastUsage(file)?.cache_creation?.ephemeral_1h_input_tokens > 0) return true;
  } catch { /* no reading of the transcript: the frontmatter decides */ }
  const type = String(input.agent_type ?? '');
  if (input.agent_id && /^[\w.-]+$/.test(type)) {
    const { homedir } = await import('node:os');
    const where = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
    for (const folder of [resolve(where, '.claude', 'agents'), resolve(homedir(), '.claude', 'agents'), fileURLToPath(new URL('../agents/', import.meta.url))]) {
      let text;
      try { text = readFileSync(join(folder, `${type}.md`), 'utf8'); } catch { continue; }
      return /^\s+cacheTtl:\s*1h\s*$/m.test(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '');
    }
  }
  return actsAsMain(input);
})();
const MAX_WAIT_S = hourCache ? 570 : 270;
const MAX_CALL_MS = MAX_WAIT_S * 1000 + 30000;
const MIN_POLL_S = 120;
// The main thread of an interactive session (no agent_id, no SDD_UNATTENDED=1) does not hold its turn at all: it watches.
const watches = !input.agent_id && process.env.SDD_UNATTENDED !== '1';
const WAIT_WITH = (watches
  ? 'Run it in the background and watch it without holding the turn, so the person can talk meanwhile: a `Monitor` whose command is ' +
    "`node .claude/tools/wait.mjs <log> --until '<regex>' [--fail '<regex>'] --monitor --max 1790`, with `timeout_ms: 1800000`; " +
    'end the turn: the final line wakes you, and so does its expiry after 30 minutes (re-arm it then). Otherwise ' : '') +
  'Wait in one process that ends on the line you need: ' +
  (hourCache
    ? "`node .claude/tools/wait.mjs <log> --until '<regex>' [--fail '<regex>'] --max 570` (exit 0 found, 1 failed, 2 timed out; "
    : "`node .claude/tools/wait.mjs <log> --until '<regex>' [--fail '<regex>'] --max 270` (exit 0 found, 1 failed, 2 timed out; ") +
  `give the call \`timeout: ${MAX_CALL_MS}\`). ` +
  'Alternatives go as repeated `--until` (or `--fail`), not a `|` inside one regex, which the Windows shell cuts. ' +
  'For a subagent launched in the background: `node .claude/tools/wait.mjs --agent <agentId> [--max 570]` (its `tasks/<id>.output` stays at 0 bytes, so it cannot be waited on through the output). ' +
  (hourCache ? '' : 'This agent keeps a five-minute prompt cache (its frontmatter has no `cacheTtl: 1h`): a wait past 270 s rewrites its whole context. ');
if (!hourCache && waitMax.some((n) => n > MAX_WAIT_S)) {
  reject(`wait.mjs --max ${Math.max(...waitMax)} is over ${MAX_WAIT_S} s, and this agent keeps a five-minute prompt cache (its frontmatter has no \`cacheTtl: 1h\`): ` +
    `a longer wait rewrites its whole context. Wait ${MAX_WAIT_S} s at most and ask again, or launch the work in the background and let it notify.`);
}
const cap = Math.max(timeoutCap, counterCap);
const boundedSubagent = !actsAsMain(input) &&
  ((toolTimeout > 0 && toolTimeout <= MAX_WAIT_S * 1000) || (cap > 0 && cap <= MAX_WAIT_S));
// What a loop that waits for a port or a URL does is a server coming up: a few seconds, and fine.
const waitsForEndpoint = /\b(curl|wget|nc|ncat|netcat|Test-NetConnection|Invoke-WebRequest|iwr)\b|\/dev\/tcp\//i.test(run);
// A `for` whose variable the body uses goes through items with a pause between them: that is pacing, not
// waiting for something to happen.
const pacing = /\bwhile\s+(?:IFS=\S*\s+)?read\b/.test(run) || (!/\b(until|while)\b/.test(run) &&
  [...run.matchAll(/\bfor\s+(\w+)\s+in\b/g)].some((m) => new RegExp(`\\$\\{?${m[1]}\\b`).test(run)));
const polling = loop && wait > 0 && !waitsForEndpoint && !pacing;
if (!background && polling && cap > 0 && cap < MIN_POLL_S) {
  reject(
    `This loop polls for at most ${cap} s: too short to be worth a loop, and the agent that sees it unmet polls again, each ` +
    'time a turn. ' + WAIT_WITH + 'A loop that waits for a port or a URL (curl, nc, Test-NetConnection) is the exception.'
  );
}
if (!background && polling && cap === 0 && !boundedSubagent) {
  reject(
    'This loop polls with no ceiling: nothing says when it stops, so it holds the turn for as long as what it waits for takes. ' +
    WAIT_WITH + 'A loop that waits for a port or a URL (curl, nc, Test-NetConnection) is the exception.'
  );
}
// A `timeout N` on each command of a loop that does not sleep bounds that command, not a wait.
if (!background && loop && (wait > 0 || watchesAgent) && !boundedSubagent && cap >= 60) {
  reject(
    `This loop can hold the turn for ${cap} s waiting in the foreground. ` +
    'A long process runs in the background and notifies when it ends, or a subagent waits for it; ' +
    'a foreground wait is for a server coming up, a few seconds. ' + WAIT_WITH +
    `A subagent may also wait in the foreground up to ${MAX_WAIT_S} s with an explicit \`timeout\` on the call or a loop with a ceiling of at most ${MAX_WAIT_S} s.`
  );
}
if (!background && loop && !boundedSubagent && (watchesAgent || wait >= 20)) {
  reject(
    'This loop waits blind: ' + (watchesAgent ? 'it asks whether another agent finished' : `it sleeps ${wait} s per turn`) +
    '. A subagent that what follows depends on is launched in the background and awaited with ' +
    '`node .claude/tools/wait.mjs --agent <agentId>`, and a long process is awaited through its own end, not by asking ' +
    'every so often. ' + WAIT_WITH + 'If a server really has to be waited for, use a half-second loop with its condition. A subagent that waits for its own agents or processes ' +
    `may do it in the foreground up to ${MAX_WAIT_S} s with an explicit \`timeout\` on the call or a loop with a ceiling.`
  );
}

// A sleep with no loop, next to a read of a log, is the same blind wait in one line: `sleep 60; tail x.log`.
// Short sleeps (a server coming up, a pause between two calls) are not that.
if (!background && (loop ? waitOutsideLoop : wait) >= 20 && /\b(tail|grep|rg|cat|Get-Content|gc|Select-String|sls|type)\b/i.test(cmd) && /\.(log|output|txt)\b/i.test(cmd)) {
  reject(
    `This command sleeps ${wait} s and then reads a log: it waits blind, and the agent that finds it unfinished does it again, each time a turn. ` + WAIT_WITH
  );
}

// A foreground call that can hold the turn past 10 minutes is a wait: it belongs in the background.
if (!background && toolTimeout > MAX_CALL_MS) {
  reject(
    `A foreground call with \`timeout\` ${toolTimeout} ms holds the turn past ${MAX_CALL_MS / 60000} minutes, long enough for the prompt cache to lapse and the context to be rewritten when it returns. ` +
    'Run it in the background with its output to a log. ' + WAIT_WITH
  );
}

// Killing by process name takes down those of other agents and of the user.
if (/\b(taskkill\b[^|;]*\/IM|pkill\b|killall\b|Stop-Process\b[^|;\n]*-Name\b|Get-Process\b[^\n]*\|\s*Stop-Process\b)/i.test(cmd)) {
  reject(
    'Killing by process name takes down the processes of other agents, of the editor and of the ' +
    'user, and there is no way to undo it. Kill by PID: save the pid of what you start, or ' +
    'find it by the port you reserved. If you do not know the pid, leave it alive and say so.'
  );
}

process.exit(0);
