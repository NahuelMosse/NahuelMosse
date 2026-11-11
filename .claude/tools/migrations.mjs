// A migration that exists on the main branch is assumed applied in every environment: it is never
// edited, renamed, moved or deleted, and a correction is a new migration (DB-MIG-12, DB-MIG-17). What
// the two guards and the close need to know about it, in one place. Core: the guard applies to any
// repo that has schema files, whether or not the module `data` is installed.
//
// The base is the merge-base of HEAD and origin/main, else main, else master; with none of them, HEAD:
// what is tracked there counts as applied. A migration created in the branch is not in the base, so it
// can still be edited. Outside a git repository, or in one with no commits, there is no base and
// nothing is applied. A `git` that cannot run throws: the callers block on any error.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const REFS = ['origin/main', 'main', 'master'];

// Only the folders that hold the history are protected, whatever the case: `migrations/` and
// `migration/` (Flyway's `db/migration`, Prisma's and Supabase's included), `Migrations/` (EF Core),
// `db/migrate/` (Rails), `alembic/versions/` and Liquibase's `db/changelog` and `db/changesets`. A `.sql`
// outside them (seeds, queries, views) and the Prisma model are edited as usual.
const PROTECTED = /(^|\/)(migrations?|db\/migrate|alembic\/versions|db\/changelogs?|db\/changesets?)\//i;
export const isProtected = (rel) => PROTECTED.test(rel);
// What counts as a migration of the history, for the evidence the close asks for.
export const IS_MIGRATION = /(^|\/)(migrations?|db\/migrate|alembic\/versions)\//i;

const git = (cwd, args) => {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 20_000 });
  if (r.error) throw new Error(`git could not run (${r.error.code})`);
  return r;
};

export const baseOf = (cwd) => {
  if (git(cwd, ['rev-parse', '--git-dir']).status !== 0) return null;
  for (const ref of REFS) {
    const r = git(cwd, ['merge-base', 'HEAD', ref]);
    const sha = r.status === 0 ? r.stdout.trim() : '';
    if (sha) return { sha, label: `the merge-base of HEAD and ${ref}` };
  }
  const head = git(cwd, ['rev-parse', '--verify', '-q', 'HEAD']);
  return head.status === 0 ? { sha: head.stdout.trim(), label: 'HEAD' } : null;
};

const trees = new Map();
const filesAt = (top, ref) => {
  const key = `${top}\0${ref}`;
  if (!trees.has(key)) {
    const r = git(top, ['ls-tree', '-r', '--full-tree', '--name-only', '-z', ref]);
    if (r.status !== 0) throw new Error(`git ls-tree ${ref} failed`);
    trees.set(key, r.stdout.split('\0').filter(Boolean));
  }
  return trees.get(key);
};

const native = (p) => (process.platform === 'win32' ? p.replace(/^\/([A-Za-z])(?=\/|$)/, '$1:') : p);

const nearestDir = (abs) => {
  let dir = abs;
  for (;;) {
    try { if (statSync(dir).isDirectory()) return dir; } catch { /* does not exist yet: look upwards */ }
    const up = dirname(dir);
    if (up === dir) return dir;
    dir = up;
  }
};

// Where a path sits: its repository, the base of that repository and the path relative to its top; null
// when it is outside a repository or the repository has no base.
const repos = new Map();
const locate = (abs) => {
  const dir = nearestDir(abs);
  if (!repos.has(dir)) {
    const top = git(dir, ['rev-parse', '--show-toplevel']);
    const base = top.status === 0 ? baseOf(dir) : null;
    repos.set(dir, base ? { top: realpathSync(top.stdout.trim()), base } : null);
  }
  const repo = repos.get(dir);
  if (!repo) return null;
  const rel = relative(repo.top, join(realpathSync(dir), relative(dir, abs))).split(sep).join('/');
  return rel === '..' || rel.startsWith('../') || isAbsolute(rel) ? null : { ...repo, rel };
};

const globOf = (glob, exact) => new RegExp(`^(?:${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  .replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*').replace(/\?/g, '[^/]')})${exact ? '' : '(?:/.*)?'}$`);

// The file of the base that the path names: the file itself, or, unless `exact`, a folder that holds one.
// Globs are read as the shell would expand them; case does not matter, as on Windows and macOS.
const appliedUnder = (loc, exact) => {
  const want = loc.rel.toLowerCase().replace(/\/+$/, '');
  const glob = /[*?]/.test(want) ? globOf(want, exact) : null;
  return filesAt(loc.top, loc.base.sha).filter(isProtected).find((file) => {
    const lower = file.toLowerCase();
    if (glob) return glob.test(lower);
    return lower === want || (!exact && (want === '' || lower.startsWith(`${want}/`)));
  });
};

// The top of the repository the hook works in (the card's); null when the cwd is in none. A path of another repository
// is not evaluated: its migrations are not the card's base.
const cardTop = (cwd) => {
  const top = git(nearestDir(resolve(cwd)), ['rev-parse', '--show-toplevel']);
  return top.status === 0 ? realpathSync(top.stdout.trim()) : null;
};
const outside = (loc, mine) => mine !== null && loc.top !== mine;

// For the Edit/Write guard: the file, if it is a protected one that already exists in the base.
export const appliedMigration = (path, cwd = process.cwd()) => {
  if (!isProtected(path.replaceAll('\\', '/'))) return null;
  const loc = locate(resolve(cwd, native(path)));
  if (!loc || !isProtected(loc.rel) || outside(loc, cardTop(cwd))) return null;
  return appliedUnder(loc, true) ? { file: loc.rel, label: loc.base.label } : null;
};

export const IMMUTABLE_ADVICE = ({ file, label }) =>
  `${file} is a migration that already exists in ${label}: it is assumed applied in every environment, ` +
  'so it is never edited, renamed, moved or deleted (DB-MIG-12). Create a new migration that corrects it ' +
  '(DB-MIG-17): it sorts after the last one of the base. Only a migration created in this branch can be edited.';

export const ESCAPE_ADVICE = (name) =>
  `\`${name}\` silences an integrity error of the migration history instead of fixing it (DB-MIG-13). ` +
  'If a migration that is already applied is wrong, a new migration corrects it; if the history itself has ' +
  'to be repaired, a person runs it and records the approval.';

// What silences the integrity check of the history: each tool's way to say “this changed on purpose”.
const ESCAPES = [
  ['flyway repair', /\bflyway\b[^\n]*\brepair\b|\bflywayRepair\b/i],
  ['liquibase clear-checksums', /\bliquibase\b[^\n]*\bclear-?checksums\b|\bclearCheckSums\b/i],
  ['atlas migrate hash', /\batlas\s+migrate\s+hash\b/i],
  ['migrate reset / migrate resolve', /\bmigrate\s+(reset|resolve)\b/i],
  ['alembic stamp', /\balembic\b[^\n]*\bstamp\b/i],
  ['validCheckSum', /validCheckSum/i],
  ['a delete over the history table', /\b(delete\s+from|truncate(\s+table)?|drop\s+table)\s+[\w."`[\]]*?(schema_migrations|flyway_schema_history|__EFMigrationsHistory|_prisma_migrations|DATABASECHANGELOG|alembic_version)\b/i],
];

// Commands that only read or search: a `rg "flyway repair" .github/` is the rule's own check.
const READ_ONLY = new Set(['rg', 'grep', 'egrep', 'fgrep', 'ag', 'ack', 'cat', 'echo', 'printf', 'type', 'findstr', 'select-string',
  'sls', 'write-output', 'write-host', 'head', 'tail', 'less', 'more', 'man', 'gh']);
const READ_ONLY_GIT = new Set(['commit', 'log', 'show', 'diff', 'grep', 'tag', 'add', 'status', 'notes', 'blame', 'config']);

const withoutHeredocs = (text) => {
  const out = [];
  let end = null;
  for (const line of text.split('\n')) {
    if (end !== null) {
      if (line.trim() === end) end = null;
      continue;
    }
    out.push(line);
    end = line.match(/(?<!<)<<(?!<)-?\s*(["']?)([\w-]+)\1/)?.[2] ?? null;
  }
  return out.join('\n');
};

// The commands of a line, split on `;`, `|`, `&` and line breaks that are not inside quotes.
export const splitCommands = (text) => {
  const out = [];
  let current = '';
  let quote = '';
  for (const ch of withoutHeredocs(text)) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (';|&\n'.includes(ch)) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
};

const tokensOf = (command) => [...command.matchAll(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)].map((m) => m[0]);
const bare = (token) => token.replace(/["']/g, '');
const WRAPPERS = new Set(['sudo', 'command', 'nohup', 'exec', 'env', 'time', 'then', 'do', 'else', '{', '(', '!']);
const firstWord = (raw) => {
  let i = 0;
  while (i < raw.length && (/^\w+=/.test(raw[i]) || WRAPPERS.has(raw[i]))) i++;
  return i;
};
const verbOf = (word = '') => word.toLowerCase().replace(/^.*[\\/]/, '').replace(/\.exe$/, '');
const isFlag = (t) => /^-/.test(t) || /^\/[a-z]$/i.test(t);

const AFFECT_ALL = new Set(['rm', 'rmdir', 'unlink', 'truncate', 'shred', 'del', 'erase', 'ren', 'rename', 'remove-item',
  'move-item', 'rename-item', 'set-content', 'clear-content', 'out-file', 'add-content']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'pwsh', 'powershell', 'cmd']);
const IN_PLACE = /^-[a-zA-Z]*i|^--in-place/;

const gitSub = (toks, i) => {
  let j = i + 1;
  let dir = null;
  while (j < toks.length && /^-/.test(toks[j])) {
    if (toks[j] === '-C') dir = toks[j + 1];
    j += ['-C', '-c'].includes(toks[j]) ? 2 : 1;
  }
  return { name: toks[j]?.toLowerCase(), dir, from: j + 1 };
};

// The paths a command writes to: `exact` ones are written as files, the others may be a folder whose
// files are removed or moved.
const targetsOf = (command, cwd, depth) => {
  const raw = tokensOf(command);
  const toks = raw.map(bare);
  const i = firstWord(raw);
  const verb = verbOf(toks[i]);
  const out = [];
  const at = (path, where, exact) => { if (path && !/^(&|\/dev\/null$|-$)/.test(path)) out.push({ path, cwd: where, exact }); };

  raw.forEach((token, k) => {
    const m = token.match(/^\d*>>?\|?(.*)$/);
    if (m) at(m[1] ? bare(m[1]) : toks[k + 1], cwd, true);
  });

  let args = toks.slice(i + 1).filter((t) => t && !isFlag(t));
  let where = cwd;
  let effective = verb;
  if (verb === 'git') {
    const sub = gitSub(toks, i);
    effective = ['rm', 'mv'].includes(sub.name) ? sub.name : '';
    args = toks.slice(sub.from).filter((t) => t && !isFlag(t));
    if (sub.dir) where = resolve(cwd, native(sub.dir));
  }
  if (effective === 'tee') args.forEach((p) => at(p, where, true));
  else if (effective === 'mv' || effective === 'move' || effective === 'move-item') {
    const dest = args.at(-1);
    args.slice(0, -1).forEach((p) => at(p, where, false));
    const folder = dest && existsSync(resolve(where, native(dest))) && statSync(resolve(where, native(dest))).isDirectory();
    if (args.length > 1 && folder) args.slice(0, -1).forEach((p) => at(join(dest, basename(p)), where, true));
    else if (args.length > 1) at(dest, where, true);
    if (args.length === 1) at(args[0], where, false);
  } else if (effective === 'cp' || effective === 'copy-item' || effective === 'copy') {
    const dest = args.at(-1);
    const folder = dest && existsSync(resolve(where, native(dest))) && statSync(resolve(where, native(dest))).isDirectory();
    if (args.length > 1 && folder) args.slice(0, -1).forEach((p) => at(join(dest, basename(p)), where, true));
    else if (args.length > 1) at(dest, where, true);
  } else if (AFFECT_ALL.has(effective)) args.forEach((p) => at(p, where, false));
  else if ((effective === 'sed' || effective === 'perl') && toks.slice(i + 1).some((t) => IN_PLACE.test(t))) args.forEach((p) => at(p, where, false));
  else if (SHELLS.has(effective) && depth < 3) {
    const nested = effective === 'cmd'
      ? toks.slice(toks.findIndex((t) => /^\/[ck]$/i.test(t)) + 1).join(' ')
      : raw.slice(i + 1).filter((t) => /^["']/.test(t)).map((t) => t.slice(1, -1)).join('\n');
    if (nested) out.push(...splitCommands(nested).flatMap((c) => targetsOf(c, where, depth + 1)));
  }
  return out;
};

// What a shell command does to the history: a way to silence its integrity check, or a write to a
// protected file that exists in the base. Null when it does neither.
export const shellViolation = (text, cwd) => {
  let here = cwd;
  // The top costs a git call: it is asked only when a command names a target (most commands name none).
  let top;
  const mine = () => (top === undefined ? (top = cardTop(cwd)) : top);
  for (const command of splitCommands(text)) {
    const raw = tokensOf(command);
    const toks = raw.map(bare);
    const i = firstWord(raw);
    const verb = verbOf(toks[i]);
    const readOnly = READ_ONLY.has(verb) || (verb === 'git' && READ_ONLY_GIT.has(gitSub(toks, i).name));
    if (!readOnly) {
      const escape = ESCAPES.find(([, re]) => re.test(command));
      if (escape) return { escape: escape[0] };
    }
    for (const target of targetsOf(command, here, 0)) {
      const loc = locate(resolve(target.cwd, native(target.path)));
      if (!loc || outside(loc, mine()) || (target.exact && !isProtected(loc.rel))) continue;
      const file = appliedUnder(loc, target.exact);
      if (file) return { file, label: loc.base.label };
    }
    if (['cd', 'pushd', 'set-location'].includes(verb) && toks[i + 1]) here = resolve(here, native(toks[i + 1]));
  }
  return null;
};

// ── The close ──────────────────────────────────────────────────────────────────────────────────────

// DB-MIG-12: the protected files that exist in the base and that the working tree modifies, renames or
// deletes. It compares the working tree, so what is not committed yet counts.
export const editedFromBase = (root) => {
  const base = baseOf(root);
  if (!base) return [];
  const r = git(root, ['diff', '--name-status', '-M', '--diff-filter=MDRT', base.sha]);
  return r.stdout.split('\n').filter(Boolean)
    .map((line) => { const [status, file] = line.split('\t'); return { status, file, label: base.label }; })
    .filter((change) => isProtected(change.file));
};

// A migration is a file, or a folder that holds `migration.sql`, `up.sql` or `down.sql` (Prisma, Knex).
const unitOf = (file) => {
  const parts = file.split('/');
  const name = parts.at(-1);
  if (/^(migration|up|down)\.\w+$/i.test(name) && parts.length > 2) return { group: parts.slice(0, -2).join('/'), name: parts.at(-2), file };
  return { group: parts.slice(0, -1).join('/'), name: name.replace(/(\.(up|down|designer))*\.\w+$/i, ''), file };
};

// `0003_x`, `20240101120000_x`, `V2__x`, `20251231_01_z`: the sequence is what sorts it. Alembic names are
// hashes: its order is the graph of revisions, not the name.
const seqOf = (name) => {
  const m = name.match(/^([VU]?)(\d+(?:[._]\d+)*)(?=__|_|-|$)/);
  return m ? { letter: m[1], parts: m[2].split(/[._]/).map(BigInt), key: `${m[1]}${m[2].replace(/_/g, '.')}` } : null;
};
const compareSeq = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0n) - (b[i] ?? 0n);
    if (d) return d < 0n ? -1 : 1;
  }
  return 0;
};

const ALEMBIC = /(^|\/)alembic\/versions$/i;
const alembicHeads = (root, files) => {
  const revisions = new Set();
  const parents = new Set();
  for (const f of files.filter((x) => x.endsWith('.py'))) {
    const text = readFileSync(join(root, f), 'utf8');
    const rev = text.match(/^\s*revision(?:\s*:[^=\n]+)?\s*=\s*['"]([^'"]+)['"]/m)?.[1];
    if (rev) revisions.add(rev);
    const down = text.match(/^\s*down_revision(?:\s*:[^=\n]+)?\s*=\s*(.+)$/m)?.[1] ?? '';
    for (const m of down.matchAll(/['"]([^'"]+)['"]/g)) parents.add(m[1]);
  }
  return [...revisions].filter((r) => !parents.has(r));
};

// DB-MIG-14, and the migrations new in the branch: the ones in the working tree that the base does not
// have. They sort after the last migration of the base and of the tip of main, no sequence is used by
// two migrations, and an Alembic history has one head.
export const migrationsOutlook = (root) => {
  const base = baseOf(root);
  if (!base) return { fresh: [], problems: [] };
  const inBase = new Set(filesAt(root, base.sha));
  const tip = REFS.find((ref) => git(root, ['rev-parse', '--verify', '-q', `${ref}^{commit}`]).status === 0);
  const known = [...new Set([...inBase, ...(tip ? filesAt(root, tip) : [])])].filter((f) => IS_MIGRATION.test(f));
  const present = git(root, ['ls-files', '-co', '--exclude-standard', '-z']).stdout.split('\0')
    .filter((f) => f && IS_MIGRATION.test(f) && existsSync(join(root, f)));
  const fresh = present.filter((f) => !inBase.has(f));
  const problems = [];

  const groups = new Map();
  const add = (u, isFresh) => {
    if (!groups.has(u.group)) groups.set(u.group, new Map());
    const units = groups.get(u.group);
    if (!units.has(u.name)) units.set(u.name, { ...u, fresh: false, seq: seqOf(u.name) });
    if (isFresh) units.get(u.name).fresh = true;
  };
  known.forEach((f) => add(unitOf(f), false));
  fresh.forEach((f) => add(unitOf(f), true));

  for (const [group, units] of groups) {
    if (ALEMBIC.test(group)) continue;
    const settled = [...units.values()].filter((u) => !u.fresh && u.seq);
    const last = settled.reduce((a, u) => (!a || compareSeq(u.seq.parts, a.seq.parts) > 0 ? u : a), null);
    for (const u of [...units.values()].filter((x) => x.fresh && x.seq)) {
      if (last && compareSeq(u.seq.parts, last.seq.parts) < 0)
        problems.push(`${u.file} sorts before ${last.name}, the last migration of main: renumber it on top of main's (DB-MIG-17)`);
    }
    const bySequence = new Map();
    for (const u of [...units.values()].filter((x) => x.seq)) {
      if (!bySequence.has(u.seq.key)) bySequence.set(u.seq.key, []);
      bySequence.get(u.seq.key).push(u);
    }
    for (const [key, same] of bySequence)
      if (same.length > 1 && same.some((u) => u.fresh))
        problems.push(`the sequence ${key} is used by ${same.map((u) => u.name).join(' and ')} in ${group || '.'}: one of them is renumbered (DB-MIG-17)`);
  }

  for (const dir of new Set(fresh.map((f) => dirname(f)).filter((d) => ALEMBIC.test(d)))) {
    const heads = alembicHeads(root, present.filter((f) => dirname(f) === dir));
    if (heads.length > 1) problems.push(`${dir} has ${heads.length} heads (${heads.join(', ')}): \`alembic merge heads\` adds the join revision (DB-MIG-17)`);
  }
  return { fresh, problems };
};
