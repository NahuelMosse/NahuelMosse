// The public bar: the code of a card is written as if the repo were public and a strict maintainer read every added line.
// It reads the lines a diff adds and names what a public repo never carries: a secret, a local path, a personal email, an
// internal host, a debug leftover, commented-out code, a TODO without its issue, a trace of the chat or of the process.
// At poc only the first three (`poc`); from mvp all of them (`full`). gate-checks.mjs runs it over the card's diff and
// commit-why.mjs over the staged lines; both read the card's exceptions from `## Gate`:
//   `public-allow: <file or glob> [<kind>] · <why>`  a line a public repo does carry (an author's email in LICENSE)
//   `public-skip: <the user's words>`                 the user ordered the bar skipped for this card; guard.mjs lets the
//                                                     line in only when the user's last message orders it
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gateBlock } from './card-doc.mjs';

const gateLinesOf = (doc) => (gateBlock(doc) ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

const IS_CODE = /\.(m?[jt]sx?|cjs|cts|py|go|cs|java|kt|rb|php|dart|rs|swift|sh|ps1)$/;
const ENTRY = /(^|\/)(bin|cli|scripts?|tools?)\/|(^|\/)(server|main|index|cli|app)\.[cm]?[jt]s$/;
const TESTS = /(^|\/)(e2e|tests?|__tests__|__mocks__|fixtures|integration_test|cypress)\/|(^|\/)[^/]*\.(test|spec)\.|(^|\/)(test_[^/]*|[^/]*_test|conftest)\.py$|_test\.go$/;
// Generated or vendored text: a lockfile or a minified bundle is not read line by line by a maintainer.
const SKIPPED = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.lock|poetry\.lock|go\.sum|composer\.lock)$|\.min\.[jt]s$|\.(png|jpe?g|gif|webp|avif|ico|pdf|woff2?|ttf|mp4|webm|glb|zip)$|(^|\/)(vendor|node_modules|dist|build)\//;
// Files whose job is to name a person or a contact.
const CONTACT_FILE = /(^|\/)(LICEN[CS]E|NOTICE|AUTHORS|CONTRIBUTORS|CODEOWNERS|SECURITY|CODE_OF_CONDUCT|CITATION)(\.\w+)?$/i;

// Values with the shape of a credential. A placeholder (`changeme`, `<token>`, `${VAR}`, `process.env.X`) is not one.
const SECRET = [
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\b[rs]k_live_[0-9a-zA-Z]{20,}/,
  /\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/,
  /(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)["']?\s*[:=]\s*["'](?![^"']*(?:\$\{|<|changeme|example|placeholder|xxx|\*\*\*|your[_-]))[^"'\s]{8,}["']/i,
];
const PATH = /(?<![\w.])[A-Za-z]:[\\/]{1,2}(?:Users|home|projects|dev|work|repos?|src|code|Documents|Desktop|Downloads|Temp)\b|(?<![\w.])\/(?:Users|home)\/(?!user\b|runner\b|node\b|app\b|me\b|you\b|example\b|\$|<|\{)[a-z][\w.-]*/i;
const EMAIL = /\b([\w.+-]+)@((?:[\w-]+\.)+[a-z]{2,})\b/gi;
const NEUTRAL_DOMAIN = /(^|\.)(example\.(com|org|net)|test|invalid|localhost|example|users\.noreply\.github\.com)$/i;
const NEUTRAL_LOCAL = /^(git|noreply|no-reply|user|test|someone|you|name|email|security|support|hello|info|contact)$/i;
const HOST = /\b[\w-]+(?:\.[\w-]+)*\.(?:internal|intranet|corp|lan)\b|\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/i;
const DEBUG = /\bconsole\.(?:log|debug|trace)\s*\(|^\s*debugger\s*;?\s*$|\bbreakpoint\s*\(\s*\)|\bpdb\.set_trace\s*\(|\bdbg!\s*\(|\bvar_dump\s*\(|\bdebugPrint\s*\(/;
const LINE_COMMENT = /^\s*(?:\/\/|#(?!!))\s?(.*)$/;
// A comment whose text is a statement: a declaration, a call or an assignment that ends like code.
const CODE_IN_COMMENT = /^(?:const|let|var)\s+[\w$]+\s*=|^import\s+.+\s+from\s+['"]|^(?:def|function|class)\s+\w+\s*[(:{]|^(?:if|for|while|elif)\s*\(.*\)\s*\{?$|^(?:return|await)\s+.*;\s*$|^[\w$.[\]'"]+\s*(?:\([^)]*\)|=\s*[^=\s].*)\s*;\s*$|^[\w$.]+\([^)]*\)\s*$|^\}\s*(?:else\b.*)?$/;
const TODO = /\b(TODO|FIXME|XXX|HACK)\b/;
const TICKET = /#\d+|\b[A-Z][A-Z0-9]+-\d+\b|https?:\/\//;
const TRACE = /\bas (?:requested|you asked|discussed)\b|\bper (?:your|the user'?s?) request\b|\bseg[uú]n lo (?:pedido|solicitado|hablado)\b|\bcomo (?:pediste|me pediste|pidi[oó]|se pidi[oó])\b|\bNUEVO\b|^\s*(?:fix|fixed|new|updated|changed|actualizado|cambiado)\s*:|\bpreviously\b|\bused to be\b|\bwas changed to\b|\bClaude\b/i;

export const KINDS = ['secret', 'path', 'email', 'host', 'debug', 'commented-code', 'todo', 'trace'];
const POC_KINDS = new Set(['secret', 'path', 'email']);

const commentText = (file, line) => {
  if (IS_CODE.test(file)) {
    const m = line.match(LINE_COMMENT) ?? line.match(/^\s*(?:\/\*+|\*)\s?(.*?)\s*(?:\*\/)?$/);
    return m ? m[1] : null;
  }
  return /\.(md|mdx|txt|rst)$/i.test(file) ? line : null;
};

// The problems of one added line of `file`, as `[kind, detail]`.
export const lineProblems = (file, line, level = 'full') => {
  if (SKIPPED.test(file)) return [];
  const out = [];
  const add = (kind, detail) => { if (level === 'full' || POC_KINDS.has(kind)) out.push([kind, detail]); };
  if (SECRET.some((re) => re.test(line))) add('secret', 'a value with the shape of a credential · read it from the environment and list the name in .env.example');
  const path = line.match(PATH);
  if (path) add('path', `a local path (${path[0]}) · use a path relative to the repo, or an environment variable`);
  if (!CONTACT_FILE.test(file) && !/^\s*["']?(author|maintainers?|contributors?|email)["']?\s*[:=]/i.test(line)) {
    for (const [mail, local, domain] of line.matchAll(EMAIL)) {
      if (NEUTRAL_DOMAIN.test(domain) || NEUTRAL_LOCAL.test(local) || /^\d/.test(domain)) continue;
      add('email', `a real email (${mail}) · use name@example.com`);
      break;
    }
  }
  const host = line.match(HOST);
  if (host) add('host', `an internal host or address (${host[0]}) · read it from the configuration`);
  const comment = commentText(file, line);
  if (IS_CODE.test(file) && !TESTS.test(file) && !ENTRY.test(file) && comment === null && DEBUG.test(line)) add('debug', `a debug leftover: ${line.trim().slice(0, 80)} · remove it, or log through the app's logger`);
  if (comment !== null && IS_CODE.test(file) && LINE_COMMENT.test(line) && CODE_IN_COMMENT.test(comment.trim()) && !TODO.test(comment)) {
    add('commented-code', `commented-out code: ${line.trim().slice(0, 80)} · delete it; git keeps the history`);
  }
  if (comment !== null && TODO.test(comment) && !TICKET.test(comment)) add('todo', `${comment.match(TODO)[1]} without its issue: ${line.trim().slice(0, 80)} · link the issue (#12, GST-208) or do it now`);
  if (comment !== null && TRACE.test(comment)) add('trace', `a trace of the chat or of the change: ${line.trim().slice(0, 80)} · say what the code is and why, not how it came to be`);
  return out;
};

// The `## Gate` declarations of the card: the files and kinds a public repo does carry, and the user's skip.
const globRe = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*')}$`);
export const publicDeclarations = (doc) => {
  const lines = gateLinesOf(doc ?? '');
  const allow = lines.flatMap((l) => {
    // The kind goes bare or in the brackets the usage shows it with (`[email]`).
    const m = l.match(/^public-allow\s*:\s*(\S+)(?:\s+\[?([a-z-]+)\]?)?\s*·\s*(\S.*)$/i);
    return m ? [{ file: globRe(m[1]), kind: KINDS.includes(m[2]) ? m[2] : null, why: m[3].trim() }] : [];
  });
  const skip = lines.map((l) => l.match(/^public-skip\s*:\s*(\S.*)$/i)?.[1]?.trim()).find(Boolean) ?? null;
  return { allow, skip };
};

// The added lines of a unified diff (`git diff -U0`), as `{ file, line }`.
export const addedLines = (diff) => {
  const out = [];
  let file = '';
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) { file = l.slice(4).replace(/^b\//, ''); continue; }
    if (l.startsWith('+') && file && file !== '/dev/null') out.push({ file, line: l.slice(1) });
  }
  return out;
};

// Every problem of the added lines that no `public-allow:` covers, as `<file>: <detail>`.
export const publicFindings = (lines, { level = 'full', allow = [] } = {}) => lines.flatMap(({ file, line }) =>
  lineProblems(file, line, level).filter(([kind]) => !allow.some((a) => a.file.test(file) && (!a.kind || a.kind === kind)))
    .map(([kind, detail]) => `${file} [${kind}]: ${detail}`));

// The repo declares `Visibility: public` in its CLAUDE.md: then it carries the files of an open-source project, a SemVer
// version, a CHANGELOG that every card touches, and commits and PR titles in English.
export const isPublic = (root) => {
  const path = join(root ?? '.', 'CLAUDE.md');
  return existsSync(path) && /^\W*visibility\**\s*:\s*`?public\b/im.test(readFileSync(path, 'utf8'));
};
const HYGIENE = [
  ['LICENSE', (has) => has(/^LICEN[CS]E(\.\w+)?$/i)],
  ['CHANGELOG.md', (has) => has(/^CHANGELOG\.md$/i)],
  ['CONTRIBUTING.md', (has) => has(/^(\.github\/)?CONTRIBUTING\.md$/i)],
  ['SECURITY.md', (has) => has(/^(\.github\/)?SECURITY\.md$/i)],
  ['a PR template', (has) => has(/^\.github\/(PULL_REQUEST_TEMPLATE\.md|pull_request_template\.md|PULL_REQUEST_TEMPLATE\/)/i)],
  ['an issue template', (has) => has(/^\.github\/ISSUE_TEMPLATE\//i)],
];
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
// What a `public` repo lacks, given its tracked files, the card's files and a reader.
export const visibilityProblems = ({ tracked, changed, read }) => {
  const has = (re) => tracked.some((f) => re.test(f));
  const out = HYGIENE.filter(([, test]) => !test(has)).map(([name]) => `no ${name}`);
  const readme = tracked.find((f) => /^README\.md$/i.test(f));
  if (!readme) out.push('no README.md');
  else if (!/^#{1,3}\s+(install|installation|getting started|quick ?start|usage|setup)\b/im.test(read(readme))) out.push('README.md has no Install, Getting started or Usage section a stranger can follow from a fresh clone');
  if (tracked.includes('package.json')) {
    let version;
    try { version = JSON.parse(read('package.json')).version; } catch { version = undefined; }
    if (version !== undefined && !SEMVER.test(String(version))) out.push(`package.json version ${version} is not SemVer`);
  }
  const product = changed.filter((f) => IS_CODE.test(f) && !TESTS.test(f) && !/^(specs|\.claude)\//.test(f));
  if (product.length && !changed.some((f) => /^CHANGELOG\.md$/i.test(f))) out.push('the card changes the product and CHANGELOG.md is not in its diff · add its line under Unreleased');
  return out;
};
export const trackedFiles = (root) => spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }).stdout.split('\n').filter(Boolean);

// Prose in Spanish: two distinct function words of Spanish that English does not use.
const SPANISH_WORDS = /(?<![\wáéíóúñ])(el|la|de|en|y|se|es|al|lo|los|las|del|que|para|con|por|una|como|pero|más|sin|sobre|cuando|también|está|esto|según)(?![\wáéíóúñ])/gi;
export const looksSpanish = (text) => new Set((String(text).match(SPANISH_WORDS) ?? []).map((w) => w.toLowerCase())).size >= 2 || /[áéíóúñ¿¡]/i.test(text);

// What the user's message has to say for a `public-skip:` line: a verb of skipping next to the bar, and no question.
export const ordersSkip = (text) => !!text && !text.includes('?') &&
  /\b(?:salte\w*|salt[aá]\w*|skip\w*|omit\w*|ignor\w*|sac[aá]\w*|deshabilit\w*|disable\w*)\b[\s\S]{0,80}\b(?:p[uú]blic\w*|public-bar)\b|\b(?:p[uú]blic\w*|public-bar)\b[\s\S]{0,80}\b(?:salte\w*|salt[aá]\w*|skip\w*|omit\w*|ignor\w*|sac[aá]\w*|deshabilit\w*|disable\w*)\b/i.test(text);
