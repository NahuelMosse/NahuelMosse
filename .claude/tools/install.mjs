#!/usr/bin/env node
// install.mjs — installs, adopts or updates the kit in another repo, run from the kit's own checkout:
//
//   node <kit>/.claude/tools/install.mjs --target <repo> --plan
//   node <kit>/.claude/tools/install.mjs --target <repo> --modules ui,data --off "ci=<reason>" [--stack node-ts]
//   node <kit>/.claude/tools/install.mjs --target <repo> --update [--from <kit>] [--major]
//   node <kit>/.claude/tools/install.mjs --target <repo> --adopt --modules … --off …
//   … --grade <poc|mvp|production> --grade-reason "<why>"    the grade the repo starts at (production without it);
//                                    an update or an adoption keeps the one the manifest already records
//
// `--update` with a card open needs `--card-open "<reason>"`: the card cannot close without a fix of the kit
// and the kit cannot update without closing. It appends `- L<n> · <date> · kit updated <old> → <new> · <reason>` to the
// card's `## Log`; grade and modules still change only between cards.
// `--update` without `--from` uses the kit checkout whose install.mjs runs (the source saved in kit.json when it runs
// from the repo's own copy) and prints which one it is; if that source is of another kit version than the installed
// one and no file changes, it exits 2 instead of passing.
// The person chooses the modules; the installer never chooses for them. `--plan` lists every module
// with what it does, its estimated cost per card and, pre-marked `[x]`, the signal found in the repo.
// With no terminal and no `--modules` it prints that list and exits 2, writing nothing. A module that
// has a signal and is left out needs `--off "<module>=<reason>"`: the reason is kept in
// `.claude/kit.json` and repeated in every closing. Needs a clean git tree: `git checkout .` and `git clean -fd` undo it (a
// new file is untracked, `git checkout` alone leaves it).
//
// A fresh install lists every file it would replace (the ones that already exist with other content) and exits 2 without
// writing; `--adopt` keeps them as they are, `--force` replaces them. `.claude/settings.json` is never replaced: the kit's
// hooks are merged into it and the repo's own keys stay.
// What the installer renders into the kit's files, so they are never edited by hand: `E2E=` in
// METHOD.md and the `paths:` of `.claude/rules/*.md`, both kept in kit.json. `E2E=` is the folder of
// scenario tests the target really has (`test/`, `tests/`, `apps/e2e`, …) unless `--e2e` says another;
// `kit.mjs e2e <path>` changes it later.
// An update replaces only the files that are as installed (their sha256 is in kit.json); a file the
// team edited is left alone and the new version goes to `.claude/.kit-incoming/<path>`.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { detectStack } from './doctor.mjs';
import { GRADES, RULE_PATHS, coreFiles, copiesOfProfile, detectE2e, filesOfModule, filesOfProfile, listKit, mcpAdd, openCard, profileOfFile, readManifest, readModules, recordedGrade, render, shaOf, writeManifest } from './kit.mjs';
import { cardIdOf, kitLogLine } from './card-doc.mjs';
import { describe, detect, evidenceOf } from './signals.mjs';

const SOURCE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const START = '<!-- sdd-kit:start -->';
const END = '<!-- sdd-kit:end -->';
const STACK_KEY = { 'react-shadcn': 'react-shadcn', 'node-ts': 'node-ts', '.NET': 'others', Java: 'others', Python: 'others' };

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
const today = () => new Date().toISOString().slice(0, 10);
const SETTINGS = '.claude/settings.json';
const SELF = fileURLToPath(import.meta.url);
const gitOut = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });

const parse = (argv) => {
  const o = { off: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--plan', '--update', '--adopt', '--force', '--major', '--help'].includes(a)) o[a.slice(2)] = true;
    else if (a === '--off') o.off.push(argv[++i] ?? '');
    else if (['--target', '--modules', '--profiles', '--stack', '--e2e', '--from', '--card-open', '--rule-paths', '--grade', '--grade-reason'].includes(a)) o[a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = argv[++i];
    else fail(`Unknown argument ${a}. See the header of install.mjs.`);
  }
  return o;
};

// What the repo shows, module by module, for the list and for the manifest.
const survey = (target, map) => {
  const found = detect(target);
  return Object.fromEntries(Object.entries(map.modules).filter(([, m]) => m.installable !== false).map(([name, m]) => {
    const evidence = evidenceOf(found, m.signals);
    return [name, { evidence, shown: evidence.map((e) => describe(found, e)) }];
  }));
};

const listLines = (map, seen) => Object.entries(seen).map(([name, s]) => {
  const m = map.modules[name];
  const cost = `~${m.cost.tokensPerCard} tokens and ${m.cost.minutesPerCard} min on a card that touches it (estimated)`;
  return `[${s.evidence.length ? 'x' : ' '}] ${name} — ${s.shown.length ? s.shown.join('; ') : 'no signal found'}\n      ${m.does}; ${cost}`;
});

// The rules' `paths:` and the scenarios folder: read from what is installed, rendered into the files.
const readRulePaths = (root) => {
  const dir = join(root, '.claude', 'rules');
  const out = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const m = readFileSync(join(dir, f), 'utf8').match(RULE_PATHS);
    if (m) try { out[f.replace(/\.md$/, '')] = JSON.parse(m[1]); } catch { /* a paths line that is not JSON stays as it is */ }
  }
  return out;
};
const readE2e = (root) => (existsSync(join(root, '.claude', 'METHOD.md')) ? readFileSync(join(root, '.claude', 'METHOD.md'), 'utf8').match(/^E2E=(\S+)/m)?.[1] : null);

const FRONT = /"(react|react-dom|vue|svelte|@angular\/core|solid-js|preact|next|nuxt|vite|astro|lit)"\s*:/;
const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };

// The profiles the repo's files point to: a front framework or an index.html (web), routes, a listener or data
// (backend), a Flutter pubspec (flutter).
const suggestProfiles = (target, seen) => {
  const out = [];
  const html = ['index.html', 'public/index.html', 'src/index.html'].some((f) => existsSync(join(target, f)));
  if (FRONT.test(read(join(target, 'package.json'))) || html || seen.ui?.evidence.length) out.push('web');
  if (['api', 'data'].some((m) => seen[m]?.evidence.length)) out.push('backend');
  if (/^flutter:|^\s+sdk:\s*flutter\b/m.test(read(join(target, 'pubspec.yaml')))) out.push('flutter');
  return out;
};

// `--profiles web,backend`: the modules of those profiles are on, a module with a signal that no profile
// owns is on, and the rest is off with the reason that follows from the choice.
const applyProfiles = (o, map, target) => {
  const names = o.profiles.split(',').map((s) => s.trim()).filter(Boolean);
  const all = map.profiles ?? {};
  const unknown = names.filter((n) => !all[n]);
  if (unknown.length) fail(`Unknown profile(s): ${unknown.join(', ')}. Profiles: ${Object.keys(all).join(', ')}.`);
  const planned = names.filter((n) => all[n].status === 'planned');
  if (planned.length) fail(`Profile ${planned.join(', ')} is planned, not available. Nothing was written.`);
  const seen = survey(target, map);
  const owned = new Map(Object.entries(all).flatMap(([p, d]) => [...d.modules, ...d.modulesIfSignal, ...d.optInModules].map((m) => [m, p])));
  const optIn = new Set(Object.values(all).flatMap((d) => d.optInModules));
  const on = new Set(o.modules === undefined ? [] : o.modules.split(',').map((s) => s.trim()).filter(Boolean));
  for (const n of names) {
    for (const m of all[n].modules) on.add(m);
    for (const m of all[n].modulesIfSignal) if (seen[m]?.evidence.length) on.add(m);
  }
  for (const [m, s] of Object.entries(seen)) if (!owned.has(m) && !optIn.has(m) && s.evidence.length) on.add(m);
  const named = new Set(o.off.map((x) => x.split('=')[0].trim()));
  for (const m of Object.keys(seen)) {
    if (on.has(m) || named.has(m)) continue;
    const p = owned.get(m);
    o.off.push(`${m}=${optIn.has(m) ? 'opt-in module, not chosen at install' : p && !names.includes(p) ? `profile ${p} not chosen at install` : p ? 'no signal found in the repo' : 'not chosen at install: no signal found in the repo'}`);
  }
  o.modules = [...on].filter((m) => seen[m]).join(',');
  return names;
};

// The profiles an install or update leaves on: the recorded ones, or, with none recorded, those with a module on.
const profilesOn = (map, on, recorded) => Object.entries(map.profiles ?? {})
  .filter(([n, p]) => p.status !== 'planned' && (recorded ? recorded[n]?.state === 'on' : p.modules.some((m) => on.has(m)))).map(([n]) => n);

// Every file that goes to the target for a choice of modules, with its rendered content.
const bundle = (source, map, on, stack, settings, profiles = [], target = null) => {
  const all = listKit(source);
  const files = [...coreFiles(map, all, stack), ...[...on].flatMap((name) => filesOfModule(map, name, all)), ...profiles.flatMap((p) => filesOfProfile(map, p, all))];
  const copies = profiles.flatMap((p) => copiesOfProfile(map, p, target));
  const origin = new Map(copies.map((c) => [c.to, c.from]));
  return [...new Set([...files, ...copies.map((c) => c.to)])].sort().map((rel) => {
    const raw = readFileSync(join(source, origin.get(rel) ?? rel));
    const isText = /\.(md|json|mjs|js|ya?ml|txt|css|html)$/.test(rel);
    return { rel, content: isText ? Buffer.from(render(rel, raw.toString('utf8'), settings)) : raw };
  });
};

const putClaudeMd = (source, target) => {
  const own = join(source, 'CLAUDE.md');
  if (!existsSync(own)) return;
  const block = `${START}\n${readFileSync(own, 'utf8').trimEnd()}\n${END}\n`;
  const path = join(target, 'CLAUDE.md');
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const re = new RegExp(`${START}[\\s\\S]*?${END}\\n?`);
  writeFileSync(path, re.test(current) ? current.replace(re, () => block) : `${current}${current && !current.endsWith('\n\n') ? '\n' : ''}${block}`);
};

// The repo's settings.json with the kit's hooks added: a hook entry the repo already has (same commands) is not repeated,
// and every key the repo set stays. null when the repo's file is not JSON: it is left alone.
const hookKey = (entry) => JSON.stringify((entry?.hooks ?? []).map((h) => h.command ?? h));
const mergeSettings = (current, kit) => {
  let mine;
  let theirs;
  try { mine = JSON.parse(current); theirs = JSON.parse(kit); } catch { return null; }
  if (!mine || typeof mine !== 'object' || Array.isArray(mine)) return null;
  const out = { ...mine };
  for (const [k, v] of Object.entries(theirs)) {
    if (k === 'hooks' || out[k] !== undefined) continue;
    out[k] = v;
  }
  if (out.env && theirs.env) out.env = { ...theirs.env, ...out.env };
  const hooks = { ...(mine.hooks ?? {}) };
  for (const [event, entries] of Object.entries(theirs.hooks ?? {})) {
    const have = hooks[event] ?? [];
    hooks[event] = [...have, ...entries.filter((e) => !have.some((x) => hookKey(x) === hookKey(e)))];
  }
  if (Object.keys(hooks).length) out.hooks = hooks;
  return `${JSON.stringify(out, null, 2)}\n`;
};

// `.kit-incoming/` is excluded locally (`info/exclude`, which git resolves in a worktree too), never through the repo's
// .gitignore: a repo that checks its product commits carry no kit file flagged the .gitignore line an update added.
const ensureIgnored = (target) => {
  const line = '.claude/.kit-incoming/';
  const has = (path) => existsSync(path) && readFileSync(path, 'utf8').split(/\r?\n/).includes(line);
  if (has(join(target, '.gitignore'))) return;
  const where = gitOut(target, 'rev-parse', '--git-path', 'info/exclude');
  if (where.status !== 0 || !where.stdout?.trim()) return;
  const exclude = resolve(target, where.stdout.trim());
  if (has(exclude)) return;
  mkdirSync(dirname(exclude), { recursive: true });
  const text = existsSync(exclude) ? readFileSync(exclude, 'utf8') : '';
  appendFileSync(exclude, `${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`);
};

const commitOf = (source) => gitOut(source, 'rev-parse', 'HEAD').stdout?.trim() || 'unknown';

// Which modules are on, from the flags: `--modules` is the whole list of what is on.
const decide = (o, map, seen) => {
  const known = Object.keys(seen);
  let chosen = o.modules === undefined ? null : o.modules.split(',').map((s) => s.trim()).filter(Boolean);
  if (chosen === null) return null;
  const unknown = [...chosen, ...o.off.map((x) => x.split('=')[0].trim())].filter((n) => !known.includes(n));
  if (unknown.length) fail(`Unknown module(s): ${[...new Set(unknown)].join(', ')}. Modules: ${known.join(', ')}.`);
  const reasons = {};
  for (const entry of o.off) {
    const i = entry.indexOf('=');
    const name = entry.slice(0, i < 0 ? undefined : i).trim();
    const reason = i < 0 ? '' : entry.slice(i + 1).trim();
    if (!reason) fail(`--off needs a reason: --off "${name}=<why it is left out>". It is kept in kit.json and repeated in every closing.`);
    if (chosen.includes(name)) fail(`${name} is both in --modules and in --off.`);
    reasons[name] = reason;
  }
  const state = {};
  for (const name of known) {
    if (chosen.includes(name)) { state[name] = { state: 'on' }; continue; }
    if (!reasons[name] && seen[name].evidence.length)
      fail(`${name} has a signal in the repo (${seen[name].shown.join('; ')}) and is left out without a reason: add --off "${name}=<why>" or put it in --modules.`);
    state[name] = { state: 'off', reason: reasons[name] ?? 'not chosen at install: no signal found in the repo', by: 'person', at: today(), signalsAtDecision: seen[name].evidence };
  }
  return state;
};

// The grade the repo starts at, from `--grade` and its reason; undefined when the flag is absent. Unattended
// nobody chooses poc, as in `kit.mjs grade`.
const gradeChoice = (o, map) => {
  if (o.grade === undefined) return undefined;
  if (!map.grades) fail('This kit has no grades: .claude/modules.json has no `grades`.');
  if (!GRADES.includes(o.grade)) fail(`Unknown grade “${o.grade}”. Grades: ${GRADES.join(', ')}.`);
  if (!String(o.gradeReason ?? '').trim()) fail('--grade needs its reason: --grade-reason "<why>". It is kept in kit.json and repeated in every closing.');
  if (process.env.SDD_UNATTENDED === '1' && o.grade !== 'production') fail('Unattended nobody chooses a grade below production: that decision is a person\'s.');
  return { level: o.grade, reason: o.gradeReason.trim(), by: 'person', at: today(), history: [] };
};

const writeBundle = (target, files) => {
  for (const { rel, content } of files) {
    mkdirSync(dirname(join(target, rel)), { recursive: true });
    writeFileSync(join(target, rel), content);
  }
};

const install = (o, target, map) => {
  const seen = survey(target, map);
  const lines = listLines(map, seen);
  const decided = decide(o, map, seen);
  const suggested = suggestProfiles(target, seen);
  if (o.profiles === undefined && Object.keys(map.profiles ?? {}).length && (o.plan || decided !== null))
    console.log(`Profiles the repo points to: ${suggested.join(', ') || 'none'}. Choose with --profiles <list>; without the flag the modules decide, as before.`);
  if (o.plan || decided === null) {
    console.log(`Modules of the kit (${map.kit}); [x] means the repo shows a signal for it:\n${lines.join('\n')}\n`);
    if (o.plan) process.exit(0);
    if (process.stdin.isTTY) return null;
    console.error('Choose the modules: --modules <list of the ones that are on> and, for each one with a signal that is left out, --off "<module>=<reason>". Nothing was written.');
    process.exit(2);
  }
  return { decided, seen };
};

const choose = async (map, seen) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const names = Object.keys(seen);
  const marked = names.filter((n) => seen[n].evidence.length);
  const answer = (await rl.question(`Modules that are on, comma separated [${marked.join(',')}]: `)).trim();
  const chosen = answer ? answer.split(',').map((s) => s.trim()) : marked;
  const off = [];
  for (const n of names.filter((x) => !chosen.includes(x) && seen[x].evidence.length)) {
    const reason = (await rl.question(`${n} has a signal and is left out. Reason: `)).trim();
    off.push(`${n}=${reason}`);
  }
  rl.close();
  return { modules: chosen.join(','), off };
};

const main = async () => {
  const o = parse(process.argv.slice(2));
  if (o.help || !o.target) fail('install.mjs --target <repo> [--plan | --modules … --off "<module>=<reason>" | --update | --adopt]');
  const target = join(o.target);
  if (!existsSync(target)) fail(`${target} does not exist.`);
  // An update takes the kit whose install.mjs runs; the source saved in kit.json only when that is the repo's own copy.
  const same = (a, b) => { try { return realpathSync(a).toLowerCase() === realpathSync(b).toLowerCase(); } catch { return false; } };
  const source = o.from ?? (o.update && same(SOURCE, target) ? readManifest(target)?.source?.path : null) ?? SOURCE;
  const map = readModules(source);
  if (!map) fail(`${source} is not a kit: no .claude/modules.json.`);

  if (o.update) return update(o, target, source, map);

  if (readManifest(target) && !o.adopt) fail('This repo already has .claude/kit.json: use --update, or `kit.mjs on|off` for a module.');
  const chosenProfiles = o.profiles === undefined ? null : applyProfiles(o, map, target);
  let args = o;
  let result = install(args, target, map);
  if (result === null) { args = { ...o, ...(await choose(map, survey(target, map))) }; result = install(args, target, map); }
  const { decided } = result;
  if (o.adopt) { if (openCard(target, { named: true })) fail('There is a card open: adopt between cards.'); }
  else if (gitOut(target, 'rev-parse', '--git-dir').status !== 0 || gitOut(target, 'status', '--porcelain').stdout?.trim() !== '')
    fail('The target must be a git repo with a clean tree (`git checkout .` and `git clean -fd` are the undo): commit or set aside what is pending.');
  const on = new Set(Object.keys(decided).filter((n) => decided[n].state === 'on'));
  const stack = o.stack ?? STACK_KEY[detectStack(readdirSync(target))?.name] ?? null;
  if (stack === 'react-shadcn' && !on.has('ui')) fail('The stack react-shadcn requires the module ui.');

  const settings = {
    // The folder the repo really has comes before the kit's default: a default that does not exist in the
    // target made the scenario checks pass over nothing.
    e2e: o.e2e ?? (o.adopt && existsSync(join(target, readE2e(target) ?? '\0')) ? readE2e(target) : null) ?? detectE2e(target) ?? (o.adopt ? readE2e(target) : null) ?? readE2e(source),
    rulePaths: { ...readRulePaths(source), ...(o.adopt ? readRulePaths(target) : {}), ...(o.rulePaths ? Object.fromEntries(o.rulePaths.split(';').map((p) => { const [k, v] = p.split('='); return [k, v.split(',')]; })) : {}) },
  };
  const profiles = profilesOn(map, on, chosenProfiles ? Object.fromEntries(chosenProfiles.map((n) => [n, { state: 'on' }])) : null);
  const files = bundle(source, map, on, stack, settings, profiles, target);
  const manifest = {
    kit: map.kit, stack, e2e: settings.e2e, rulePaths: settings.rulePaths,
    source: { path: source, commit: commitOf(source) },
    modules: Object.fromEntries(Object.entries(decided).map(([n, d]) => [n, d.state === 'on' ? { state: 'on', version: map.modules[n].version, since: `install ${today()}` } : d])),
    files: {},
  };
  const grade = gradeChoice(o, map) ?? (o.adopt ? readManifest(target)?.grade : undefined);
  if (grade) manifest.grade = grade;
  const owner = (rel) => { const p = profileOfFile(map, rel, profiles); return p ? `profile:${p}` : (Object.keys(map.modules).find((n) => filesOfModule(map, n, [rel]).length) ?? 'core'); };
  const local = [];
  // Everything that exists with other content is listed before anything is written: a repo that gitignores `.claude/`
  // passes the clean-tree check and would lose those files with no undo.
  if (!o.adopt && !o.force) {
    const clash = files.filter(({ rel, content }) => rel !== SETTINGS && existsSync(join(target, rel)) && shaOf(readFileSync(join(target, rel)), rel) !== shaOf(content, rel)).map((f) => f.rel);
    if (clash.length)
      fail(`These files already exist here with other content (${clash.length}) and the install would replace them:\n${clash.map((r) => `  ${r}`).join('\n')}\nNothing was written. --adopt keeps them as they are, --force replaces them; ${SETTINGS} is never replaced, the kit's hooks are merged into it.`);
  }
  // Each file is recorded as it is written and the manifest is written even if one fails, so a retry resumes from there.
  let current = null;
  try {
    for (const { rel, content } of files) {
      current = rel;
      const path = join(target, rel);
      const exists = existsSync(path);
      if (rel === SETTINGS && exists) {
        const merged = mergeSettings(readFileSync(path, 'utf8'), content.toString('utf8'));
        if (merged === null) local.push(rel);
        else {
          if (shaOf(merged, rel) !== shaOf(readFileSync(path), rel)) writeFileSync(path, merged);
          manifest.files[rel] = { module: owner(rel), sha256: shaOf(merged, rel) };
          continue;
        }
      }
      if (o.adopt && exists) {
        if (shaOf(readFileSync(path), rel) !== shaOf(content, rel) && !local.includes(rel)) local.push(rel);
        manifest.files[rel] = { module: owner(rel), sha256: shaOf(content, rel) };
        continue;
      }
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
      manifest.files[rel] = { module: owner(rel), sha256: shaOf(content, rel) };
    }
    current = 'CLAUDE.md';
    putClaudeMd(source, target);
    current = '.gitignore';
    ensureIgnored(target);
    if (chosenProfiles) {
      manifest.profiles = {};
      for (const [n, p] of Object.entries(map.profiles).filter(([, d]) => d.status !== 'planned')) {
        if (!profiles.includes(n)) { manifest.profiles[n] = { state: 'off', reason: 'not chosen at install', by: 'person', at: today() }; continue; }
        const mcp = mcpAdd(target, p.mcp);
        manifest.profiles[n] = { state: 'on', since: `install ${today()}`, reason: 'chosen at install', ...(Object.keys(mcp).length ? { mcp } : {}) };
      }
    }
  } catch (e) {
    throw new Error(`could not write ${current}: ${e.message}. What was written is recorded in .claude/kit.json; fix it and resume with: node ${SELF} --target ${target} --update`);
  } finally {
    writeManifest(target, manifest);
  }
  const off = Object.keys(decided).filter((n) => decided[n].state === 'off');
  console.log(`${o.adopt ? 'Adopted' : 'Installed'} kit ${map.kit} in ${target}: ${files.length} files; on: ${[...on].join(', ') || 'none'}; off: ${off.join(', ') || 'none'}; grade: ${recordedGrade(manifest) ?? 'production'}.`);
  if (local.length) console.log(`Local editions kept as they are (${local.length}): ${local.join(', ')}.`);
  if (o.adopt && off.length) console.log('The files of the modules left out were not deleted: `kit.mjs off <module> --reason …` removes the ones that are as installed.');
};

const update = (o, target, source, map) => {
  const manifest = readManifest(target);
  if (!manifest || manifest.invalid) fail('This repo has no valid .claude/kit.json: install or adopt first.');
  const open = openCard(target);
  const reason = String(o.cardOpen ?? '').trim();
  if (open && !reason)
    fail('There is a card open: update between cards, because the bar of the card in progress would change under it.\nIf the card needs the fix of the kit to close, run again with --card-open "<reason>"; it is recorded in the card\'s Log.');
  if (open && !cardIdOf(open)) fail(`The card in progress (${open}) has no ID in its folder name: the update cannot be recorded in it.`);
  const major = (v) => String(v).split('.')[0];
  if (major(map.kit) !== major(manifest.kit) && !o.major) {
    const list = Object.entries(map.breaking ?? {}).map(([k, v]) => `${k}: ${v}`);
    fail(`Kit ${manifest.kit} → ${map.kit} is a major change and may break what the repo has.${list.length ? `\nBreaking: ${list.join('; ')}` : ''}\nRun again with --major to apply it.`);
  }
  // The source is said before anything is replaced: the saved one may be an old checkout.
  console.log(`Updating from ${source} (kit ${map.kit}, commit ${commitOf(source)}${o.from || source === SOURCE ? '' : '; the source saved in kit.json, no --from'}); installed: kit ${manifest.kit}, commit ${manifest.source?.commit ?? 'unknown'}.`);
  const state = { ...manifest, modules: { ...manifest.modules }, files: { ...manifest.files } };
  // A module the manifest does not know counts as on: a new version never turns one off in silence.
  const on = new Set(Object.entries(map.modules).filter(([n, m]) => m.installable !== false && state.modules[n]?.state !== 'off').map(([n]) => n));
  for (const n of on) state.modules[n] ??= { state: 'on', version: map.modules[n].version, since: `update ${today()}` };
  const settings = { e2e: manifest.e2e, rulePaths: manifest.rulePaths };
  const profiles = profilesOn(map, on, manifest.profiles);
  const files = bundle(source, map, on, manifest.stack, settings, profiles, target);
  const wanted = new Set(files.map((f) => f.rel));
  const owner = (rel) => { const p = profileOfFile(map, rel, profiles); return p ? `profile:${p}` : (Object.keys(map.modules).find((n) => filesOfModule(map, n, [rel]).length) ?? 'core'); };
  // A repo that recorded no profiles gets them from its modules; the mcp entries of the ones on are written, never over what is there.
  state.profiles = { ...(manifest.profiles ?? {}) };
  for (const [n, p] of Object.entries(map.profiles ?? {}).filter(([n2, d]) => d.status !== 'planned' && !(manifest.profiles && !profiles.includes(n2)))) {
    if (!profiles.includes(n)) { state.profiles[n] = { state: 'off', reason: 'no module of the profile was on at update', by: 'derived', at: today() }; continue; }
    const mcp = mcpAdd(target, p.mcp);
    state.profiles[n] = { ...(state.profiles[n] ?? { since: `update ${today()}`, reason: 'derived from the modules that were on' }), state: 'on', ...(Object.keys(mcp).length ? { mcp: { ...(state.profiles[n]?.mcp ?? {}), ...mcp } } : {}) };
  }
  const replaced = [];
  const incoming = [];
  const removed = [];
  // Each file is recorded as it is written and the manifest is written even if one fails (kit and source stay at the old
  // version until the end), so the same update run again resumes.
  let current = null;
  try {
  for (const { rel, content } of files) {
    current = rel;
    const path = join(target, rel);
    const recorded = manifest.files?.[rel]?.sha256;
    if (rel === SETTINGS && existsSync(path)) {
      const merged = mergeSettings(readFileSync(path, 'utf8'), content.toString('utf8'));
      if (merged !== null) {
        if (shaOf(merged, rel) !== shaOf(readFileSync(path), rel)) { writeFileSync(path, merged); replaced.push(rel); }
        state.files[rel] = { module: owner(rel), sha256: shaOf(merged, rel) };
        continue;
      }
    }
    const next = shaOf(content, rel);
    if (!existsSync(path)) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); state.files[rel] = { module: owner(rel), sha256: next }; replaced.push(rel); continue; }
    const now = shaOf(readFileSync(path), rel);
    if (now === next) { state.files[rel] = { module: owner(rel), sha256: next }; continue; }
    if (recorded && now === recorded) { writeFileSync(path, content); state.files[rel] = { module: owner(rel), sha256: next }; replaced.push(rel); continue; }
    mkdirSync(dirname(join(target, '.claude', '.kit-incoming', rel.replace(/^\.claude\//, ''))), { recursive: true });
    writeFileSync(join(target, '.claude', '.kit-incoming', rel.replace(/^\.claude\//, '')), content);
    incoming.push(rel);
  }
  for (const [rel, rec] of Object.entries(manifest.files ?? {}).filter(([r, x]) => !wanted.has(r) && state.modules[x.module]?.state !== 'off')) {
    const path = join(target, rel);
    if (existsSync(path) && shaOf(readFileSync(path), rel) === rec.sha256) { rmSync(path); removed.push(rel); delete state.files[rel]; }
    // A record of a file the kit no longer places there, and that is not on disk, is only a stale line of the manifest.
    else if (!existsSync(path)) delete state.files[rel];
  }
  // A source of another version that changes nothing is not an update: it is a stale or wrong source.
  if (map.kit !== manifest.kit && !replaced.length && !removed.length)
    fail(`Nothing was updated: the source ${source} is kit ${map.kit} and the repo has kit ${manifest.kit}, yet no file changed. The source is stale or is not the kit to update from: pass it with --from <kit>.`);
  current = 'CLAUDE.md';
  putClaudeMd(source, target);
  current = '.gitignore';
  ensureIgnored(target);
  state.kit = map.kit;
  state.source = { path: source, commit: commitOf(source) };
  } catch (e) {
    throw new Error(`could not write ${current}: ${e.message}. What was written is recorded in .claude/kit.json; fix it and run the same update again: node ${SELF} --target ${target} --update`);
  } finally {
    writeManifest(target, state);
  }
  if (open) {
    const doc = join(open, 'card.md');
    const from = manifest.source?.commit ?? 'unknown';
    // The update is a line at the end of the card's Log (card.md ends with it); an older card keeps its record in ambiguities.md.
    if (existsSync(doc)) appendFileSync(doc, `${readFileSync(doc, 'utf8').endsWith('\n') ? '' : '\n'}${kitLogLine(readFileSync(doc, 'utf8'), from, state.source.commit, reason)}`);
    else appendFileSync(join(open, 'ambiguities.md'), `${cardIdOf(open)}-KIT · kit ${from} → ${state.source.commit} · reason: ${reason}\n`);
  }
  console.log(`Updated to kit ${map.kit}: ${replaced.length} replaced or added, ${removed.length} removed.`);
  if (incoming.length) console.log(`Edited here, not overwritten; the new version is in .claude/.kit-incoming/ (${incoming.length}): ${incoming.join(', ')}.`);
};
main().catch((e) => fail(`install.mjs failed: ${e.message}`));
