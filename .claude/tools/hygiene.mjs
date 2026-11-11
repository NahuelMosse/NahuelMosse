// Hygiene signals over what a card added or removed, read without judgment:
//  - dead code (K5): a symbol the card declared that nothing uses, or only its tests; a symbol whose last use the card removed
//    (the old version left behind after a replacement); a file the card created, or stopped importing, that nothing imports;
//    code the card left commented out. Git keeps the history: the current code carries only what runs.
//  - slow code (`rules/speed.md`): a query or a request per iteration of a loop (N+1), an `await` per iteration where the
//    steps are independent, `forEach` with an async callback, a `*Sync` call inside a function on the server, a `fetch` in a
//    mount effect, a whole table read without a limit.
// `kit-keep: <why>` in a comment on the line or the one before keeps that line; `declared · dead-code|slow-code · <file> · <why>`
// in the Log keeps a whole file. Both stay notes the close lists for a person.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { IS_CODE, IS_TEST, NOT_PRODUCTION, cardFiles, cardStart, existedAt, git, originOf, ownBase } from './card.mjs';
import { IS_MIGRATION } from './migrations.mjs';
import { readCard } from './card-doc.mjs';
import { addedOfAll } from './kit.mjs';
import { blank } from './overdesign.mjs';

const posix = (f) => f.split('\\').join('/').replace(/^\.\//, '');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const JS = /\.(?:m?[jt]sx?|cjs|cts)$/;
const PY = /\.py$/;
const GO = /\.go$/;
const DART = /\.dart$/;
const TEST_DIR = /(^|\/)(?:e2e|tests?|__tests__|__mocks__|integration_test|cypress|fixtures|testing)\//;
const NOT_A_USE = /^(?:specs|\.claude|docs)\/|\.(?:md|mdx|txt|lock|log|map|svg|csv)$|(?:^|\/)(?:package-lock|pnpm-lock|yarn\.lock|composer\.lock)|\.min\.[jt]s$/i;
const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|pdf|zip|gz|mp4|webm|mov|mp3|wav|glb|gltf|bin|wasm|jar|class|exe|dll|so)$/i;
const isProduction = (f) => IS_CODE.test(f) && !NOT_PRODUCTION.test(f) && !IS_TEST.test(f) && !IS_MIGRATION.test(f);
const KEEP = /kit-keep:\s*\S/;

// Comments and the inside of strings turned into spaces, same offsets: brackets in a string do not open a block.
export const mask = (code, file = '') => {
  const hash = /\.(?:py|sh|rb)$/.test(file);
  const py = PY.test(file);
  const sp = (s) => s.replace(/[^\n\r]/g, ' ');
  let out = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    const two = code.slice(i, i + 2);
    if (!hash && two === '/*') { const end = code.indexOf('*/', i + 2); const stop = end < 0 ? code.length : end + 2; out += sp(code.slice(i, stop)); i = stop; continue; }
    if (!hash && two === '//' && code[i - 1] !== ':') { const end = code.indexOf('\n', i); const stop = end < 0 ? code.length : end; out += sp(code.slice(i, stop)); i = stop; continue; }
    if (hash && c === '#') { const end = code.indexOf('\n', i); const stop = end < 0 ? code.length : end; out += sp(code.slice(i, stop)); i = stop; continue; }
    if (py && (code.startsWith('"""', i) || code.startsWith("'''", i))) {
      const q = code.slice(i, i + 3);
      const end = code.indexOf(q, i + 3);
      const stop = end < 0 ? code.length : end + 3;
      out += q + sp(code.slice(i + 3, Math.max(i + 3, stop - 3))) + (end < 0 ? '' : q); i = stop; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < code.length && code[j] !== c && (c === '`' || code[j] !== '\n')) j += code[j] === '\\' ? 2 : 1;
      const closed = code[j] === c;
      out += c + sp(code.slice(i + 1, Math.min(j, code.length))) + (closed ? c : '');
      i = closed ? j + 1 : Math.min(j, code.length); continue;
    }
    out += c; i++;
  }
  return out;
};

const lineStarts = (t) => { const s = [0]; for (let i = 0; i < t.length; i++) if (t[i] === '\n') s.push(i + 1); return s; };
const lineAt = (starts, off) => { let lo = 0; let hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= off) lo = m; else hi = m - 1; } return lo + 1; };
const closeOf = (t, open) => {
  const o = t[open];
  const c = { '(': ')', '{': '}', '[': ']' }[o];
  let d = 0;
  for (let i = open; i < t.length; i++) { if (t[i] === o) d++; else if (t[i] === c && --d === 0) return i; }
  return t.length - 1;
};

// ---------- declarations ----------

const KEYWORDS = new Set('if for while switch catch return function constructor super new await typeof else do try finally with yield delete void in of'.split(' '));
const FRAMEWORK = new Set([
  // Next.js, Remix, SvelteKit, Astro, Nuxt: names the framework reads from a route file.
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'metadata', 'generateMetadata', 'generateStaticParams', 'generateViewport',
  'viewport', 'revalidate', 'dynamic', 'dynamicParams', 'runtime', 'preferredRegion', 'maxDuration', 'fetchCache', 'config', 'loader',
  'action', 'actions', 'meta', 'links', 'headers', 'handle', 'ErrorBoundary', 'HydrateFallback', 'clientLoader', 'clientAction',
  'shouldRevalidate', 'getServerSideProps', 'getStaticProps', 'getStaticPaths', 'middleware', 'handler', 'load', 'prerender', 'entries',
  'getStaticPaths', 'register', 'onRequest', 'default',
  // Lifecycles and callbacks a framework calls by name.
  'render', 'componentDidMount', 'componentDidUpdate', 'componentWillUnmount', 'shouldComponentUpdate', 'getDerivedStateFromProps',
  'getSnapshotBeforeUpdate', 'componentDidCatch', 'getDerivedStateFromError', 'ngOnInit', 'ngOnDestroy', 'ngOnChanges', 'ngAfterViewInit',
  'ngAfterContentInit', 'ngDoCheck', 'onModuleInit', 'onModuleDestroy', 'onApplicationBootstrap', 'onApplicationShutdown',
  'beforeApplicationShutdown', 'canActivate', 'intercept', 'transform', 'catch', 'use', 'resolve', 'validate', 'toJSON', 'toString',
  'valueOf', 'connectedCallback', 'disconnectedCallback', 'attributeChangedCallback', 'adoptedCallback', 'data', 'setup', 'mounted',
  'created', 'beforeMount', 'beforeUnmount', 'unmounted', 'updated', 'build', 'initState', 'dispose', 'didChangeDependencies',
  'didUpdateWidget', 'createState', 'main', 'init', 'up', 'down', 'then', 'get', 'set', 'ServeHTTP', 'Error', 'String', 'MarshalJSON',
  'UnmarshalJSON', 'Len', 'Less', 'Swap', 'Scan', 'Value', 'save', 'clean', 'str', 'repr',
]);
const PY_PLAIN_DECORATORS = /^@(?:staticmethod|classmethod|property|functools\.\w+|lru_cache|cache|override)\b/;

const DECL = {
  js: [
    /^export\s+(?:declare\s+)?(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/,
    /^(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/,
    /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
    /^(?:export\s+)?(?:declare\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/,
    /^(?:export\s+)?(?:declare\s+)?(?:const\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
    /^\s+(?:(?:public|private|protected|static|async|readonly|override)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\([^)]*\)\s*(?::\s*[^{=;]+)?\{\s*$/,
  ],
  py: [/^(?:async\s+)?def\s+(\w+)/, /^class\s+(\w+)/, /^\s+(?:async\s+)?def\s+(\w+)/],
  go: [/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/, /^type\s+([A-Za-z_]\w*)/],
  dart: [
    /^(?:(?:abstract|sealed|final|base|interface)\s+)*(?:class|mixin|enum|extension)\s+([A-Za-z_]\w*)/,
    /^\s*(?:static\s+)?(?:Future|Stream|void|int|double|String|bool|num|dynamic|List|Map|Set|[A-Z]\w*)(?:<[^>]*>)?\??\s+([a-z_]\w*)\s*\(/,
  ],
};
const langOf = (f) => (JS.test(f) ? 'js' : PY.test(f) ? 'py' : GO.test(f) ? 'go' : DART.test(f) ? 'dart' : null);
const ignoredName = (name, lang) => name.length < 3 || KEYWORDS.has(name) || FRAMEWORK.has(name) || /^__\w+__$/.test(name) ||
  (lang === 'py' && /^test/.test(name)) || (lang === 'go' && /^(?:Test|Benchmark|Example|Fuzz)/.test(name));
// A class of its own: no base a framework could call its methods through, nor an object literal handed to a library.
const PLAIN_CLASS = {
  js: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+[A-Za-z_$][\w$]*\s*(?:<[^>]*>)?\s*\{\s*$/,
  py: /^\s*class\s+\w+\s*(?:\(\s*(?:object)?\s*\))?\s*:\s*$/,
  dart: /^\s*(?:(?:abstract|final|base)\s+)*class\s+\w+\s*(?:<[^>]*>)?\s*\{\s*$/,
  go: /$^/,
};
const indentOf = (l) => l.match(/^\s*/)[0].length;
const GENERATED = /\.(?:g|freezed|gr|pb|generated|gen)\.\w+$|(?:^|\/)__generated__\/|_pb2\.py$/;

// The declarations of a file, one per line: [{ name, line }]. A name the framework reads, a decorated method, an override
// and a method of a class with a base (the framework may call it by name) are left out.
export const declarationsIn = (file, text) => {
  const lang = langOf(file);
  if (!lang || GENERATED.test(file)) return [];
  const lines = blank(text, file).split('\n');
  const out = [];
  lines.forEach((l, i) => {
    const name = DECL[lang].map((re) => l.match(re)?.[1]).find(Boolean);
    if (!name || ignoredName(name, lang)) return;
    let p = i - 1;
    while (p >= 0 && !lines[p].trim()) p--;
    const prev = (lines[p] ?? '').trim();
    if (prev.startsWith('@') && !(lang === 'py' && PY_PLAIN_DECORATORS.test(prev))) return;
    if (indentOf(l) > 0) {
      let h = i - 1;
      while (h >= 0 && (!lines[h].trim() || indentOf(lines[h]) >= indentOf(l))) h--;
      if (h < 0 || !PLAIN_CLASS[lang].test(lines[h])) return;
    }
    out.push({ name, line: i + 1 });
  });
  return out;
};

// ---------- the repo, read once ----------

const read = (root, f) => { try { if (statSync(join(root, f)).size > 1_000_000) return null; return readFileSync(join(root, f), 'utf8').replace(/\r\n/g, '\n'); } catch { return null; } };
const corpusOf = (root) => {
  const listed = (git(root, ['-c', 'core.quotePath=false', 'ls-files', '-co', '--exclude-standard', '-z']).stdout ?? '').split('\0').map(posix).filter(Boolean);
  return [...new Set(listed)].filter((f) => !NOT_A_USE.test(f) && !BINARY.test(f)).flatMap((file) => {
    const text = read(root, file);
    if (text === null) return [];
    return [{ file, raw: text, text: IS_CODE.test(file) ? blank(text, file) : text, test: IS_TEST.test(file) || TEST_DIR.test(file) }];
  });
};
// How many times each name appears in the repo, comments aside, split between tests and the rest: read once, asked per name.
const indexOf = (corpus) => {
  const counts = new Map();
  for (const c of corpus) {
    for (const w of c.text.match(/[A-Za-z_$][\w$]*/g) ?? []) {
      let n = counts.get(w);
      if (!n) counts.set(w, (n = { use: 0, test: 0 }));
      if (c.test) n.test++; else n.use++;
    }
  }
  return (name) => counts.get(name) ?? { use: 0, test: 0 };
};

// ---------- what the card removed ----------

const removedLines = (root, base, files) => {
  if (!files.length) return [];
  const d = git(root, ['-c', 'core.quotePath=false', 'diff', '-U0', '--no-color', ownBase(root, base), '--', ...files]).stdout ?? '';
  const out = [];
  let header = false;
  for (const l of d.split('\n')) {
    if (l.startsWith('diff --git ')) { header = true; continue; }
    if (header) { if (l.startsWith('@@')) header = false; continue; }
    if (l.startsWith('-')) out.push(l.slice(1));
  }
  return out;
};
const codeOfRemoved = (l) => (/^\s*(?:\*|#|\/\/)/.test(l) ? '' : l.replace(/\/\/.*$/, '').replace(/(['"`])(?:\\.|(?!\1).)*\1/g, (s) => (/^['"`][./@\w-]+['"`]$/.test(s) ? s : '""')));

// ---------- commented-out code ----------

const COMMENT = { js: /^\s*\/\/\s?(.*)$/, go: /^\s*\/\/\s?(.*)$/, dart: /^\s*\/\/\s?(.*)$/, py: /^\s*#\s?(.*)$/ };
const CODE_START = /^(?:const|let|var|return|await|import|export|if\s*\(|for\s*\(|while\s*\(|function\b|class\s+\w|console\.|this\.|throw\s|def\s|from\s+\S+\s+import|print\(|elif\b|else\s*[:{])/;
const looksLikeCode = (c, lang) => {
  const s = c.trim();
  if (!s || /^(?:eslint|@ts-|prettier|istanbul|c8|noqa|type:|pylint|ignore|TODO|FIXME|NOTE|XXX|kit-)/i.test(s) || /^[-=*#~]+$/.test(s)) return false;
  if (/^[\w$.]+\([^()]*\);$/.test(s)) return true;
  if (lang === 'py') return /^(?:def |class |import |from \S+ import|return\b.*\S|print\(|\w+(?:\.\w+)* = \S|(?:if|for|while|elif) .*:$)/.test(s);
  return CODE_START.test(s) && (/[;{}]$/.test(s) || /\s=\s|=>/.test(s) || /\)$/.test(s));
};

// ---------- loops ----------

// The bodies of the loops of a file, as offset ranges in its masked text: [{ from, to, kind: 'for' | 'for-await' | 'call' }].
const loopsOf = (file, m) => {
  const out = [];
  if (PY.test(file)) {
    const lines = m.split('\n');
    const starts = lineStarts(m);
    lines.forEach((l, i) => {
      const head = l.match(/^(\s*)(async\s+)?(?:for|while)\b.*:\s*$/);
      if (head) {
        const indent = head[1].length;
        let last = i;
        for (let j = i + 1; j < lines.length; j++) {
          if (!lines[j].trim()) continue;
          if (lines[j].match(/^\s*/)[0].length <= indent) break;
          last = j;
        }
        if (last > i) out.push({ from: starts[i + 1], to: starts[last] + lines[last].length, kind: head[2] ? 'for-await' : 'for' });
      } else if (/[[({][^\n]*\bfor\s+[\w, ()]+\s+in\b/.test(l)) out.push({ from: starts[i], to: starts[i] + l.length, kind: 'call' });
    });
    return out;
  }
  if (GO.test(file)) {
    for (const x of m.matchAll(/\bfor\b[^\n{]*\{/g)) { const open = x.index + x[0].length - 1; out.push({ from: open, to: closeOf(m, open), kind: 'for' }); }
  } else {
    for (const x of m.matchAll(/\b(for\s+await|for|while)\s*\(/g)) {
      const close = closeOf(m, x.index + x[0].length - 1);
      let k = close + 1;
      while (/\s/.test(m[k] ?? '')) k++;
      // A body without braces ends at its `;`, or at the `,` or bracket that closes a Dart collection element (`for (x in xs) Widget(…),`).
      const to = m[k] === '{' ? closeOf(m, k) : (() => {
        let d = 0;
        for (let j = k; j < m.length; j++) {
          const c = m[j];
          if ('([{'.includes(c)) d++;
          else if (')]}'.includes(c)) { if (d === 0) return j; d--; } else if (d === 0 && (c === ';' || c === ',')) return j;
        }
        return m.length;
      })();
      out.push({ from: k, to, kind: x[1].startsWith('for') && /await/.test(x[1]) ? 'for-await' : 'for' });
    }
  }
  for (const x of m.matchAll(/\.(?:forEach|map|flatMap|reduce|filter|some|every|forEachIndexed)\s*\(/g)) {
    const open = x.index + x[0].length - 1;
    out.push({ from: open + 1, to: closeOf(m, open), kind: 'call' });
  }
  return out;
};

// The bodies of the functions written inline (arrows, `function`): a call inside a handler built in a loop does not run per iteration.
const functionsOf = (m) => {
  const out = [];
  for (const x of m.matchAll(/=>|\bfunction\b[^(]*\(/g)) {
    let k = x.index + x[0].length;
    if (x[0] !== '=>') k = closeOf(m, k - 1) + 1;
    while (/\s/.test(m[k] ?? '')) k++;
    if (x[0] !== '=>') { while (m[k] && m[k] !== '{') k++; out.push({ from: x.index, to: closeOf(m, k) }); continue; }
    if (m[k] === '{') { out.push({ from: x.index, to: closeOf(m, k) }); continue; }
    let d = 0;
    let j = k;
    for (; j < m.length; j++) {
      const c = m[j];
      if ('([{'.includes(c)) d++;
      else if (')]}'.includes(c)) { if (d === 0) break; d--; } else if (d === 0 && (c === ',' || c === ';')) break;
    }
    out.push({ from: x.index, to: j });
  }
  return out;
};

const QUERY =/\b(?:prisma|db|knex|pool|tx|trx|em|entityManager|manager|session|supabase|sequelize|mongoose|conn|connection|cursor)\s*\.\s*(?:\w+\s*\.\s*)?(?:find\w*|create\w*|update\w*|upsert\w*|delete\w*|destroy|insert\w*|select\w*|query\w*|execute\w*|exec|get|count|aggregate|save|raw|\$queryRaw\w*|\$executeRaw\w*|from|filter_by|scalars?)\s*\(|\b\w*(?:Repository|Repo|repository|repo|Dao|dao)\s*\.\s*\w+\s*\(|\b[A-Z]\w*Model\s*\.\s*\w+\s*\(|\bthis\s*\.\s*\w*(?:[Rr]epo\w*|[Dd]b|prisma|[Dd]ao)\s*\.\s*\w+\s*\(|\.objects\.\w+\(|\bsql\s*`|\bfetch\s*\(|\$fetch\s*\(|\baxios\s*[.(]|\bhttp\s*\.\s*(?:get|post|put|patch|delete)\s*\(|\brequests\s*\.\s*(?:get|post|put|patch|delete)\s*\(|\bdio\s*\.\s*(?:get|post|put|patch|delete)\s*\(/;
const AWAIT = /\bawait\b(?!\s+(?:Promise\s*\.\s*(?:all|allSettled|race|any)|Future\s*\.\s*wait|asyncio\s*\.\s*gather|Task\s*\.\s*WhenAll)\b)/;
const SYNC = /\b(?:readFileSync|writeFileSync|appendFileSync|existsSync|readdirSync|statSync|lstatSync|mkdirSync|rmSync|unlinkSync|copyFileSync|renameSync|execSync|execFileSync|spawnSync|pbkdf2Sync|scryptSync|gzipSync|gunzipSync|deflateSync|inflateSync|brotliCompressSync|brotliDecompressSync|hashSync|compareSync|genSaltSync)\s*\(/;
const NOT_SERVER_PATH = /(?:^|\/)(?:bin|cli|tools|build|config|seed|seeds)\/|\.config\.[cm]?[jt]s$|(?:^|\/)(?:cli|build|setup|seed|migrate|vite|webpack|rollup|esbuild)\.[cm]?[jt]s$/;

// ---------- findings ----------

const DECLARED = /declared\s*·\s*(dead-code|slow-code)\s*·\s*`?([^\s·:`]+)`?\s*·\s*(.+?)\s*$/;
export const declaredHygiene = (cardDir) => {
  const log = ((readCard(cardDir) ?? '').split(/^## Log\b.*$/m)[1] ?? '').split('\n');
  const out = { 'dead-code': new Map(), 'slow-code': new Map() };
  for (const m of log.map((l) => l.match(DECLARED)).filter(Boolean)) out[m[1]].set(m[2].replaceAll('\\', '/'), m[3]);
  return out;
};

// Files a framework or a runtime loads by their name or their folder, not by an import.
const ENTRY = /(?:^|\/)(?:index|main|server|app|cli|manage|wsgi|asgi|__init__|__main__|conftest|setup|worker|instrumentation|middleware|page|layout|route|loading|error|global-error|not-found|template|default|_app|_document|models|admin|apps|urls|signals|tasks|settings|celery|\+[\w.]+)\.[\w.]+$|\.d\.ts$|\.config\.[\w.]+$|(?:^|\/)(?:pages|routes|bin|app)\//;
// How many times a name appeared at the base: a name that was already unused before the card is not this card's leftover.
const usesAtBase = (root, ref, name) => (git(root, ['grep', '-w', '-o', '-h', '-I', '-e', name, ref, '--', ':(exclude)specs', ':(exclude).claude', ':(exclude)*.md', ':(exclude)docs']).stdout ?? '').split('\n').filter(Boolean).length;

// `{ dead: { blocking, declared }, slow: { blocking, declared } }` over the card's production code.
export const hygieneFindings = (root, cardDir) => {
  const base = cardStart(root, cardDir);
  const own = ownBase(root, base);
  const mine = cardFiles(root, base).map(posix).filter((f) => IS_CODE.test(f) && !/^(?:specs|\.claude)\//.test(f));
  const corpus = corpusOf(root);
  const usesOf = indexOf(corpus);
  const byFile = new Map(corpus.map((c) => [c.file, c]));
  const production = mine.filter((f) => isProduction(f) && !GENERATED.test(f) && byFile.has(f));
  const added = addedOfAll(root, base, production);
  const declared = declaredHygiene(cardDir);
  const result = { dead: { blocking: [], declared: [] }, slow: { blocking: [], declared: [] } };
  const put = (kind, file, message) => {
    const line = `${file}: ${message}`;
    const log = declared[kind === 'dead' ? 'dead-code' : 'slow-code'];
    if (log.has(file)) result[kind].declared.push(line); else result[kind].blocking.push(line);
  };
  const kept = (raw, n) => KEEP.test(raw[n - 1] ?? '') || KEEP.test(raw[n - 2] ?? '');
  const flagged = new Set();

  // Dead code the card added.
  for (const file of production) {
    const lines = added.get(file) ?? [];
    if (!lines.length) continue;
    const at = new Set(lines.map((l) => l.n));
    const { raw } = byFile.get(file);
    const rawLines = raw.split('\n');
    for (const d of declarationsIn(file, raw).filter((x) => at.has(x.line))) {
      if (kept(rawLines, d.line)) continue;
      const { use, test } = usesOf(d.name);
      if (use > 1) continue;
      flagged.add(`${file}\0${d.name}`);
      put('dead', file, `line ${d.line}: \`${d.name}\` ${test ? 'is used only by tests' : 'is used nowhere'} · delete it${test ? ' and its tests' : ''}; git keeps it if it is ever needed`);
    }
    const lang = langOf(file);
    let run = 0;
    for (const l of lines) {
      const c = lang && l.text.match(COMMENT[lang])?.[1];
      if (c !== undefined && c !== null && looksLikeCode(c, lang) && !KEEP.test(l.text)) {
        if (run++ === 0) put('dead', file, `line ${l.n}: commented-out code (\`${c.trim().slice(0, 60)}\`) · delete it; git keeps the old version`);
      } else run = 0;
    }
  }

  // What the card left without use when it removed its last caller: the old version after a replacement.
  const removed = removedLines(root, base, mine.filter((f) => !IS_TEST.test(f) && !TEST_DIR.test(f)));
  const ids = new Set(removed.map(codeOfRemoved).flatMap((l) => l.match(/[A-Za-z_$][\w$]{2,}/g) ?? []));
  if (ids.size) {
    for (const c of corpus.filter((x) => isProduction(x.file))) {
      for (const d of declarationsIn(c.file, c.raw).filter((x) => ids.has(x.name))) {
        if (flagged.has(`${c.file}\0${d.name}`) || kept(c.raw.split('\n'), d.line)) continue;
        const { use, test } = usesOf(d.name);
        if (use > 1 || usesAtBase(root, own, d.name) <= 1) continue;
        flagged.add(`${c.file}\0${d.name}`);
        put('dead', c.file, `line ${d.line}: \`${d.name}\` lost its last use in this card${test ? ' (only tests call it)' : ''} · delete it${test ? ' and its tests' : ''}`);
      }
    }
  }

  // Files nothing imports: one the card created, or one whose import the card removed.
  const created = production.filter((f) => !existedAt(root, own, f) && !originOf(root, base, f));
  const importedBefore = new Set(removed.filter((l) => /\b(?:import|require|from|export|part)\b/.test(l)).flatMap((l) => l.match(/[\w$-]+/g) ?? []));
  const dropped = corpus.filter((c) => isProduction(c.file) && !ENTRY.test(c.file) && !GO.test(c.file) && !GENERATED.test(c.file))
    .filter((c) => importedBefore.has(c.file.split('/').pop().replace(/\.[^.]+$/, ''))).map((c) => c.file);
  for (const file of [...new Set([...created, ...dropped])]) {
    if (ENTRY.test(file) || GO.test(file)) continue;
    const stem = file.split('/').pop().replace(/\.[^.]+$/, '');
    const path = new RegExp(`[/'"\`]${esc(stem)}(?:\\.[\\w]+)?['"\`]|(?:from|import)\\s+[\\w.]*\\b${esc(stem)}\\b`);
    const users = corpus.filter((c) => c.file !== file && path.test(c.raw));
    if (users.some((c) => !c.test)) continue;
    put('dead', file, users.length ? 'only tests import this file · delete it and its tests, or wire it where it is used' : 'nothing imports this file · delete it, or wire it where it is used');
  }

  // Slow code on the lines the card added.
  for (const file of production) {
    const lines = added.get(file) ?? [];
    if (!lines.length) continue;
    const { raw } = byFile.get(file);
    const rawLines = raw.split('\n');
    const m = mask(raw, file);
    const starts = lineStarts(m);
    const mLines = m.split('\n');
    const fns = PY.test(file) ? [] : functionsOf(m);
    // A loop whose match sits inside a function written within its body (a handler, not the callback of `.map` itself) does not count.
    const loops = loopsOf(file, m).map((l) => ({ ...l, nested: (at) => fns.filter((f) => f.from >= l.from && at > f.from && at <= f.to).length > (l.kind === 'call' ? 1 : 0) }));
    const effects = JS.test(file) ? [...m.matchAll(/\buse(?:Layout)?Effect\s*\(/g)].map((x) => { const open = x.index + x[0].length - 1; return { from: open, to: closeOf(m, open) }; }) : [];
    const serverSync = JS.test(file) && !NOT_SERVER_PATH.test(file) && !/^#!/.test(raw);
    for (const { n } of lines) {
      const text = mLines[n - 1] ?? '';
      if (!text.trim() || kept(rawLines, n)) continue;
      const off = starts[n - 1];
      const inside = (re, kinds) => { const x = text.match(re); if (!x) return null; const at = off + x.index; return loops.find((l) => at >= l.from && at <= l.to && kinds.includes(l.kind) && !l.nested(at)) ?? null; };
      let message = null;
      if (/\.forEach\s*\(\s*async\b/.test(text)) message = '`forEach` does not wait for an async callback · `for…of` if each step needs the previous one, `Promise.all(items.map(…))` if not';
      else if (inside(QUERY, ['for', 'for-await', 'call'])) message = 'a query or a request per iteration (N+1) · load them all at once before the loop (`in`, include/join, one batch request) and look them up in a Map';
      else if (inside(AWAIT, ['for'])) message = 'an `await` per iteration runs the steps one after another · independent steps go together (`Promise.all`, `asyncio.gather`, `Future.wait`); if each needs the previous one, say so with `kit-keep: <why>`';
      else if (serverSync && /^\s/.test(text) && SYNC.test(text)) message = `\`${text.match(SYNC)[0].replace(/\s*\($/, '')}\` blocks the server while it runs · use the async API`;
      else if (JS.test(file) && /\bfetch\s*\(|\baxios\s*[.(]|\$fetch\s*\(/.test(text) && effects.some((e) => off >= e.from && off <= e.to)) message = 'a `fetch` in an effect: the first view waits for its render to ask · load it in the route\'s loader, a server component, or the data library with a prefetch';
      else if (/\.objects\.all\(\)(?!\s*(?:\[|\.(?:count|exists|first|last|delete|update|aggregate|values|values_list|only|order_by\([^)]*\)\s*\[)))/.test(text)) message = 'a whole table read without a limit · slice it (`[:limit]`) with a default and a maximum, and a total order';
      if (!message) {
        const call = text.match(/\.findMany\s*\(/);
        if (call) {
          const open = off + call.index + call[0].length - 1;
          const args = m.slice(open, closeOf(m, open) + 1);
          if (!/\b(?:take|where)\s*:/.test(args)) message = 'a whole table read without a limit · `take` with a default and a maximum, and an `orderBy` with a unique tiebreaker';
        }
      }
      if (!message) {
        const sel = (rawLines[n - 1] ?? '').match(/\bSELECT\b[\s\S]*?\bFROM\s+[\w."`[\]]+/);
        if (sel) {
          const from = off + sel.index;
          let open = from;
          while (open > 0 && !/['"`]/.test(m[open])) open--;
          const q = m[open];
          const end = m.indexOf(q, from);
          const query = raw.slice(from, end < 0 ? from + 600 : end);
          if (!/\b(?:LIMIT|TOP|FETCH\s+FIRST|WHERE|COUNT|SUM|MAX|MIN|AVG|EXISTS)\b/i.test(query)) message = 'a whole table read without a limit · `LIMIT` with a default and a maximum, and an `ORDER BY` with a unique tiebreaker';
        }
      }
      if (message) put('slow', file, `line ${n}: ${message}`);
    }
  }
  return result;
};
