// Overdesign signals the gate can read without judgment (`rules/architecture.md`, «Simplest structure that works»):
//  - a method that only forwards to another of the same name with the same arguments,
//  - an interface or abstract class with exactly one implementation in the repo (a test fake counts as a second),
//  - a layer folder (or a folder inside a module) whose only file is a wrapper (re-exports or forwards) of fewer than 20 lines,
// The layer folders of a slice are expected even when empty: they are not flagged.
// What the card added fails (a method it added to an existing file included); what was already in the repo is only reported.
// `kit-overdesign: <reason>` anywhere in a file declares it.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IS_CODE, IS_TEST, NOT_PRODUCTION, cardFiles, cardStart, existedAt, git, originOf, ownBase } from './card.mjs';
import { IS_MIGRATION } from './migrations.mjs';
import { readCard } from './card-doc.mjs';

export const TINY_LINES = 20;
const LAYER_DIRS = /^(?:domain|application|infrastructure|interfaces?|services|use-?cases|repositories|ports|adapters|entities|dtos|mappers|factories|handlers|core)$/;
const posix = (f) => f.split('\\').join('/').replace(/^\.\//, '');
const HASH_COMMENTS = /\.(?:py|sh|rb)$/;
// Comments turned into spaces, same offsets. Text inside a string literal is kept (`'./pages/*.tsx'` is not a comment);
// `#` starts a comment only on Python and shell files (in JS it is a private field).
export const blank = (code, file = '') => {
  const hash = HASH_COMMENTS.test(file);
  let out = '';
  let i = 0;
  let lineStart = true;
  const spaces = (s) => s.replace(/[^\n\r]/g, ' ');
  while (i < code.length) {
    const c = code[i];
    const two = code.slice(i, i + 2);
    if (two === '/*') { const end = code.indexOf('*/', i + 2); const stop = end < 0 ? code.length : end + 2; out += spaces(code.slice(i, stop)); i = stop; continue; }
    if (two === '//' && code[i - 1] !== ':') { const end = code.indexOf('\n', i); const stop = end < 0 ? code.length : end; out += spaces(code.slice(i, stop)); i = stop; continue; }
    if (hash && c === '#' && lineStart) { const end = code.indexOf('\n', i); const stop = end < 0 ? code.length : end; out += spaces(code.slice(i, stop)); i = stop; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < code.length && code[j] !== c && (c === '`' || code[j] !== '\n')) j += code[j] === '\\' ? 2 : 1;
      const stop = code[j] === c ? j + 1 : Math.min(j, code.length);
      out += code.slice(i, stop); i = stop; lineStart = false; continue;
    }
    out += c; i++;
    if (c === '\n') lineStart = true; else if (c !== ' ' && c !== '\t') lineStart = false;
  }
  return out;
};
const declared = (text) => /kit-overdesign:\s*\S/.test(text);

// A parameter or argument down to its name: `@Param('id') id: string`, `long id`, `id=id`, `readonly x?: T = 1`.
const nameOf = (p) => {
  let s = p.replace(/@\w+(?:\([^)]*\))?\s*/g, '').replace(/^\s*\w+\s*=\s*(?=\w+\s*$)/, '').replace(/=.*$/, '').trim();
  if (s.includes(':')) s = s.split(':')[0];
  return s.replace(/\?$/, '').trim().split(/\s+/).pop() ?? '';
};
const namesOf = (list) => list.split(',').map(nameOf).filter((n) => n && n !== 'self' && n !== 'cls');
const argsOf = (list) => list.split(',').map((a) => a.trim().replace(/^\w+\s*=\s*(?!=)/, '')).filter(Boolean);
const PARAMS = '((?:[^()]|\\([^()]*\\))*)';
const CALL = '([\\w$]+(?:\\.[\\w$]+)*)';
const PASS_THROUGH = [
  // function or method: `[modifiers] [type] name(params) [: type] { return [await] a.b.name(args); }`
  new RegExp(`(?:^|\\n)([ \\t]*)(?:(?:export|default|public|private|protected|static|async|readonly|function|override)\\s+)*(?:[\\w<>\\[\\],.?]+\\s+)?([\\w$]+)\\s*\\(${PARAMS}\\)\\s*(?::\\s*[^{=;]+?)?\\s*\\{\\s*return\\s+(?:await\\s+)?${CALL}\\(${PARAMS}\\)\\s*;?\\s*\\}`, 'g'),
  // arrow: `const name = [async] (params) => [{ return] [await] a.name(args)`
  new RegExp(`(?:^|\\n)([ \\t]*)(?:export\\s+)?(?:const|let)\\s+([\\w$]+)\\s*=\\s*(?:async\\s*)?\\(${PARAMS}\\)\\s*(?::\\s*[^=]+?)?=>\\s*(?:\\{\\s*return\\s+)?(?:await\\s+)?${CALL}\\(${PARAMS}\\)[ \\t]*;?[ \\t]*\\}?[ \\t]*(?=\\r?\\n|$)`, 'g'),
  // C# and Java expression body: `Type Name(params) => a.Name(args);`
  new RegExp(`(?:^|\\n)([ \\t]*)(?:(?:public|private|protected|internal|static|async|override)\\s+)*(?:[\\w<>\\[\\],.?]+\\s+)?([\\w$]+)\\s*\\(${PARAMS}\\)\\s*=>\\s*(?:await\\s+)?${CALL}\\(${PARAMS}\\)\\s*;`, 'g'),
];
const PY_PASS_THROUGH = new RegExp(`^([ \\t]*)(?:async\\s+)?def\\s+(\\w+)\\s*\\(${PARAMS}\\)\\s*(?:->\\s*[^:]+)?:[ \\t]*\\n?[ \\t]*return\\s+(?:await\\s+)?${CALL}\\(${PARAMS}\\)[ \\t]*$`, 'gm');
// Names an interface or protocol requires: a method that forwards under one of them is not a choice of the card.
const NOT_METHODS = new Set(['if', 'for', 'while', 'switch', 'catch', 'constructor', 'function', 'return',
  'GetEnumerator', 'Dispose', 'DisposeAsync', 'toString', 'toJSON', 'valueOf', 'equals', 'hashCode', 'iterator',
  '__iter__', '__len__', '__str__', '__repr__', '__eq__', '__hash__']);

// Whether the decorator or attribute block right above `before` (the code up to a method) belongs to the method.
// Comments are already blank; the block may span lines: `@Decorator({ ... })`, `[HttpGet("{id}")]`.
const decoratedAbove = (before) => {
  const s = before.trimEnd();
  const last = s.at(-1);
  if (last === ')' || last === ']') {
    const open = last === ')' ? '(' : '[';
    let depth = 0;
    let i = s.length - 1;
    for (; i >= 0; i--) { if (s[i] === last) depth++; else if (s[i] === open && --depth === 0) break; }
    if (i < 0) return false;
    const rest = s.slice(0, i);
    return last === ')' ? /@[\w.$]+\s*$/.test(rest) : /(?:^|\n)[ \t]*$/.test(rest);
  }
  return /(?:^|\n)[ \t]*@[\w.$]+$/.test(s);
};

// Methods and functions of a file whose whole body forwards to a call of the same name with the same arguments: [{ line, name }].
export const passThroughs = (file, text) => {
  if (declared(text)) return [];
  const code = blank(text, file);
  const out = [];
  const isPy = /\.py$/.test(file);
  for (const re of isPy ? [PY_PASS_THROUGH] : PASS_THROUGH) {
    re.lastIndex = 0;
    for (const m of code.matchAll(re)) {
      const [, , name, params, callee, args] = m;
      if (NOT_METHODS.has(name) || callee.split('.').length < 2 || callee.split('.').at(-1) !== name) continue;
      const head = code.slice(0, m.index + (m[0].startsWith('\n') ? 1 : 0));
      if (decoratedAbove(head)) continue; // a routed or decorated method adapts, it does not only forward
      const p = namesOf(params);
      const a = argsOf(args);
      if (p.length !== a.length || p.some((x, i) => x !== a[i])) continue;
      out.push({ line: head.split('\n').length, name });
    }
  }
  return out;
};

const DECLARES = [
  /^[ \t]*(?:export\s+)?(?:default\s+)?(?:public\s+)?interface\s+(\w+)/gm,
  /^[ \t]*(?:export\s+)?(?:default\s+)?(?:public\s+)?abstract\s+class\s+(\w+)/gm,
  /^class\s+(\w+)\((?:[\w.]+,\s*)*(?:ABC|abc\.ABC|Protocol)\b/gm,
];
const bareName = (s) => s.trim().replace(/[<(].*$/s, '').split('.').pop().trim();
const implementorsIn = (text, file = '') => {
  const code = blank(text, file);
  const names = [];
  for (const m of code.matchAll(/\bclass\s+\w+(?:<[^>{]*>)?(?:\s+extends\s+[\w.<>, ]+?)?\s+implements\s+([^{]+)\{/g)) names.push(...m[1].split(',').map(bareName));
  for (const m of code.matchAll(/\bclass\s+\w+(?:<[^>{]*>)?\s+extends\s+([\w.]+)/g)) names.push(bareName(m[1]));
  for (const m of code.matchAll(/\bclass\s+\w+(?:<[^>{]*>)?\s*:\s*([^{;]+?)\s*\{/g)) names.push(...m[1].split(',').map(bareName));
  for (const m of code.matchAll(/^[ \t]*class\s+\w+\(([^)]*)\)\s*:/gm)) names.push(...m[1].split(',').map(bareName));
  // C# primary constructor: `class OrderRepo(AppDb db) : IOrderRepo {`
  for (const m of code.matchAll(/\bclass\s+\w+(?:<[^>{]*>)?\s*\((?:[^()]|\([^()]*\))*\)\s*:\s*([^{;]+?)\s*(?:\{|;)/g)) names.push(...m[1].split(',').map(bareName));
  return names;
};
// A fake of `name` in a test: an object literal typed with it, or a mocking library's double (`new Mock<IX>()`, `mock<X>()`, `jest.Mocked<X>`...).
const fakesOf = (text, name, file = '') => (blank(text, file).match(new RegExp(`:\\s*${name}\\s*=\\s*\\{|\\bsatisfies\\s+${name}\\b|\\bas\\s+${name}\\b|<${name}>\\s*\\{|\\b(?:new\\s+Mock|mock|mockDeep|createMock|Substitute\\.For|jest\\.Mocked|jest\\.MockedObject|Mocked|MockProxy|DeepMockProxy)\\s*<${name}\\b`, 'g')) ?? []).length;

// Interfaces and abstract classes declared in `files` with exactly one implementing class in `all` and no fake: [{ file, name, by }].
// `all` is [{ file, text }] of every code file of the repo, tests included.
export const singleImplementations = (files, all) => {
  const implementors = new Map();
  for (const { file, text } of all) for (const n of implementorsIn(text, file)) implementors.set(n, [...(implementors.get(n) ?? []), file]);
  const declarations = new Map();
  const where = new Map(all.map((x) => [x.file, x.text]));
  for (const { file, text } of all) {
    if (IS_TEST.test(file) || NOT_PRODUCTION.test(file) || declared(text)) continue;
    const code = blank(text, file);
    for (const re of DECLARES) { re.lastIndex = 0; for (const m of code.matchAll(re)) declarations.set(m[1], [...(declarations.get(m[1]) ?? []), file]); }
  }
  return files.flatMap((file) => {
    const text = where.get(file) ?? '';
    const code = blank(text, file);
    const names = new Set();
    for (const re of DECLARES) { re.lastIndex = 0; for (const m of code.matchAll(re)) names.add(m[1]); }
    return [...names].flatMap((name) => {
      if (declarations.get(name)?.length !== 1 || declared(text)) return [];
      const by = implementors.get(name) ?? [];
      if (by.length !== 1) return [];
      if (all.some((x) => x.file !== file && fakesOf(x.text, name, x.file) > 0)) return [];
      return [{ file, name, by: by[0] }];
    });
  });
};

const significant = (text) => text.split('\n').filter((l) => l.trim()).length;
const isProduction = (f) => IS_CODE.test(f) && !NOT_PRODUCTION.test(f) && !IS_TEST.test(f) && !IS_MIGRATION.test(f);

// A file that only re-exports, or whose methods only forward: it adds nothing the parent folder would not hold.
const isWrapper = (file, text) => {
  const lines = blank(text, file).split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.every((l) => /^(?:import\b|export\b.*\bfrom\b)/.test(l)) || passThroughs(file, text).length > 0;
};

// Layer folders (or any folder inside a module) whose only file is a wrapper of fewer than TINY_LINES lines: [{ dir, file }].
// A small file alone in the folder of a new module is not flagged: only a wrapper is. The layer folders of a slice
// (`presentation/`, `domain/`, `application/`, `data/`) are its shape and hold one file as well as ten.
const SLICE_LAYER = /(?:^|\/)(?:modules|features)\/[^/]+\/(?:presentation|domain|application|data)$/;
export const tinyFolders = (repo, readText) => {
  const byDir = new Map();
  for (const f of repo) { const dir = f.slice(0, f.lastIndexOf('/')); if (dir) byDir.set(dir, [...(byDir.get(dir) ?? []), f]); }
  const out = [];
  for (const [dir, list] of byDir) {
    const name = dir.split('/').at(-1);
    const inModule = /(?:^|\/)(?:modules|features)\/[^/]+\//.test(`${dir}/`);
    if (SLICE_LAYER.test(dir)) continue;
    if (!(LAYER_DIRS.test(name) || (inModule && !/(?:^|\/)(?:modules|features)\/[^/]+$/.test(dir)))) continue;
    if (list.length !== 1 || repo.some((f) => f !== list[0] && f.startsWith(`${dir}/`))) continue;
    const [file] = list;
    if (!isProduction(file)) continue;
    const text = readText(file);
    if (text !== null && !declared(text) && significant(text) < TINY_LINES && isWrapper(file, text)) out.push({ dir, file });
  }
  return out;
};

// `declared · overdesign · <file> · <why>` in the Log: the card keeps a finding on purpose (a Protocol the layer rule asks for, say);
// it stays a note and the close lists it for a person.
export const DECLARED_OVERDESIGN = /declared\s*·\s*overdesign\s*·\s*`?([^\s·:`]+)`?\s*·\s*(.+?)\s*$/;
export const declaredOverdesign = (cardDir) => {
  const doc = readCard(cardDir) ?? '';
  return new Map((doc.split(/^## Log\b.*$/m)[1] ?? '').split('\n').map((l) => l.match(DECLARED_OVERDESIGN)).filter(Boolean).map((m) => [m[1].replaceAll('\\', '/'), m[2]]));
};

const read = (root, f) => { try { return readFileSync(join(root, f), 'utf8').replace(/\r\n/g, '\n'); } catch { return null; } };

// `{ blocking, notes, declared }`: what the card added, what was already there, and what the card added and declared in the Log.
export const overdesignFindings = (root, cardDir) => {
  const base = cardStart(root, cardDir);
  const mine = cardFiles(root, base).map(posix);
  // A file the card only moved is not created: what it carried was already in the repo.
  const created = new Set(mine.filter((f) => existsSync(join(root, f)) && !existedAt(root, ownBase(root, base), f) && !originOf(root, base, f)));
  const repo = (git(root, ['ls-files', '-co', '--exclude-standard', '-z']).stdout ?? '').split('\0').map(posix).filter(Boolean);
  const code = repo.filter((f) => IS_CODE.test(f) && !/^(?:specs|\.claude)\//.test(f));
  const texts = code.map((file) => ({ file, text: read(root, file) ?? '' }));
  const declared = declaredOverdesign(cardDir);
  const blocking = [];
  const notes = [];
  const kept = [];
  const put = (file, message, touched = created.has(file)) => {
    const line = `${file}: ${message}`;
    if (touched && !declared.has(file)) blocking.push(line);
    else { notes.push(line); if (touched) kept.push(line); }
  };
  const production = texts.filter((x) => isProduction(x.file));
  const touchedFiles = new Set(mine);

  for (const { file, text } of production) {
    // In a file the card did not create, only the methods it added count: those the base already had stay notes.
    const before = created.has(file) || !touchedFiles.has(file) ? null : (git(root, ['show', `${ownBase(root, base)}:${originOf(root, base, file) ?? file}`]).stdout ?? '').replace(/\r\n/g, '\n');
    const had = new Map();
    for (const p of before === null ? [] : passThroughs(file, before)) had.set(p.name, (had.get(p.name) ?? 0) + 1);
    for (const p of passThroughs(file, text)) {
      const old = had.get(p.name) ?? 0;
      if (old > 0) had.set(p.name, old - 1);
      const added = created.has(file) || (touchedFiles.has(file) && old === 0);
      put(file, `line ${p.line}: \`${p.name}\` only forwards to another \`${p.name}\` with the same arguments · call the callee from where \`${p.name}\` is called and delete it`, added);
    }
  }
  for (const s of singleImplementations(production.map((x) => x.file), texts)) put(s.file, `\`${s.name}\` has one implementation (${s.by}) and no test fake · export the concrete one; the interface is born with the second implementation or the fake; if a rule of the repo asks for it, add to the Log \`declared · overdesign · <file> · <the rule>\``);
  for (const t of tinyFolders(repo, (f) => read(root, f))) put(t.file, `the only file of \`${t.dir}/\`, a wrapper under ${TINY_LINES} lines · keep it in the parent folder; a folder is born with its second file`);
  return { blocking, notes, declared: kept };
};
