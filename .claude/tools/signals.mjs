// What a repo or a card shows that a module of the kit is about, in one place. Core: the late signal
// is looked for precisely when the module is not installed, so nothing here can live in a module.
// The patterns are heuristics: a false positive is settled with `kit.mjs confirm-off`, a false
// negative is caught by `required.mjs` over the diff or by the judge.
// Two readings of the same patterns: `detect(root)` looks at the whole repo (install, doctor,
// status); `detectIn({ files, added, texts, asks })` looks at what one card touches. Both answer
// `{ <signal id>: [evidence, …] }` with only the signals that are present; the evidence is the line
// the person reads («dep: pg», «3 .tsx files») and the one `kit.json` keeps as signalsAtDecision.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// A screen: a file that is a view by its extension, or a code file whose text writes markup.
export const IS_SCREEN = /\.(css|scss|html?|jsx|tsx|vue|svelte)$/;
export const SCREEN_MARKUP = /<(html|style|body|main|button|input|form|table|section)\b/i;

// A route: an HTTP handler registered for a path. A method counts as one when the request's is compared
// (`req.method === 'POST'`, `event.requestContext.http.method`; a form's `form.method` is the client's) or sits in a
// route-table object next to its `path`/`route`/`url`; a bare `method: 'POST'` is what a client's `fetch` passes, not a
// server, and from a `fetch(` to the end of its line is a request whatever its body holds. A call on a client object
// (`axios.get('/x')`, `http.post(`, `this.http.get(`, `api.`, `client.`) is a request, not a declaration, and does not count.
const routeMethod = (verbs) => `\\b(?:req|request|ctx|context|event|c\\.req)\\.method\\s*={2,3}\\s*['"](?:${verbs})['"]|(?<!\\b(?:form|el|element|target|init|options|opts|config|xhr)\\.)\\b(?:http)?[mM]ethod\\s*={2,3}\\s*['"](?:${verbs})['"]|\\b(?:path|route|url)['"]?\\s*:[^\\n]*\\bmethod['"]?\\s*:\\s*['"](?:${verbs})['"]|\\bmethod['"]?\\s*:\\s*['"](?:${verbs})['"][^\\n]*\\b(?:path|route|url)['"]?\\s*:`;
export const ROUTE = new RegExp(`(?<!\\b(?:axios|http|api|client|httpClient|superagent)|\\$http)\\.(get|post|put|patch|delete)\\(\\s*['"\`]\\/|@(Get|Post|Put|Patch|Delete)(Mapping)?\\b|\\bexport\\s+(?:async\\s+)?function\\s+(?:GET|POST|PUT|PATCH|DELETE)\\s*\\(|\\bexport\\s+const\\s+(?:GET|POST|PUT|PATCH|DELETE)\\b\\s*[:=]|\\bexport\\s+(?:const\\s*)?\\{[^}]*\\b(?:GET|POST|PUT|PATCH|DELETE)\\b[^}]*\\}|${routeMethod('GET|POST|PUT|PATCH|DELETE')}`);
// A receiver named like a client (`api`, `client`, `http`) is a server when the same file makes it a router or an app.
const SERVER_RECEIVER = /\b(api|client|http)\s*=\s*(?:new\s+)?(?:express(?:\.Router)?\s*\(|Router\s*\(|Hono\s*\(|fastify\s*\(|Elysia\s*\(|Koa\s*\(|\w+\.Router\s*\()/g;
export const routeIn = (text) => {
  if (ROUTE.test(String(text).replace(/\bfetch\s*\([^\n]*/g, ''))) return true;
  const names = [...String(text).matchAll(SERVER_RECEIVER)].map((m) => m[1]);
  return names.some((n) => new RegExp(`\\b${n}\\.(?:get|post|put|patch|delete)\\(\\s*['"\`]\\/`).test(text));
};
// A long-lived process: it listens on a port, or consumes a queue, or runs on a schedule.
export const LISTEN = /\blisten\s*\(|\buvicorn\.run\(|\bapp\.run\(/;
export const WORKER = /\bnew\s+Worker\(|\bcron\.schedule\(|@Cron\(|@Scheduled\b|\bconsumer\.run\(|@(Rabbit|Kafka)Listener\b/;

export const IS_INFRA = /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml|[^/]+\.(tf|tfvars)|Chart\.yaml|fly\.toml|render\.yaml|vercel\.json|netlify\.toml|app\.yaml|serverless\.ya?ml|Procfile)$|(^|\/)(k8s|helm|infra|deploy|terraform)\//;
export const IS_SCHEMA = /(^|\/)(migrations?|db\/migrate|alembic\/versions)\/|\.sql$|(^|\/)schema\.prisma$/;
export const IS_CI = /^\.github\/workflows\/|(^|\/)(\.gitlab-ci\.yml|azure-pipelines\.yml|bitbucket-pipelines\.yml|Jenkinsfile)$/;

// A package name on a line added to a manifest, captured, so the evidence can say which one.
const dependency = (names) => new RegExp(`(?:^|[\\s"'=,:])@?(${names})(?=$|[\\s"'=<>~^@/.,:-])`);
const DATA_NAMES = 'pg|mysql2|mariadb|mongodb|mongoose|redis|ioredis|prisma|typeorm|sequelize|knex|psycopg|sqlalchemy|Npgsql|EntityFrameworkCore';
const CLOUD_NAMES = 'redis|ioredis|kafkajs|amqplib|bullmq|aws-sdk|google-cloud|azure|stripe|sendgrid|twilio|elastic|celery|boto3';
const HTTP_NAMES = 'express|fastify|koa|hono|@nestjs/core|hapi|restify|flask|fastapi|django|aiohttp|sanic|spring-boot-starter-web|Microsoft\\.AspNetCore|gin-gonic';
const AUTH_NAMES = 'jsonwebtoken|jose|passport|next-auth|@auth/core|bcrypt|bcryptjs|argon2|@clerk/[\\w-]+|auth0|oauth4webapi|openid-client|pyjwt|passlib|django-allauth|stripe|Microsoft\\.AspNetCore\\.Identity|spring-security';
export const DATA_DEPENDENCY = dependency(DATA_NAMES);
export const CLOUD_DEPENDENCY = dependency(CLOUD_NAMES);
export const HTTP_DEPENDENCY = dependency(HTTP_NAMES);
export const AUTH_DEPENDENCY = dependency(AUTH_NAMES);
// A new piece of infrastructure the app talks to: a datastore or a cloud service.
export const INFRA_DEPENDENCY = dependency(`${DATA_NAMES}|${CLOUD_NAMES}`);

// The signals that a repo is internationalized (reference/i18n.md, activation): a dependency in
// the manifest, a catalog path, a framework config. A single language tag in `<html lang>` is not one.
export const I18N = {
  DEPENDENCY: /["'](i18next|react-i18next|next-i18next|next-intl|react-intl|vue-i18n|@nuxtjs\/i18n|@angular\/localize|@ngx-translate\/core|svelte-i18n|typesafe-i18n|rosetta|node-polyglot|@formatjs\/[\w-]+|@lingui\/[\w-]+|@fluent\/[\w-]+)["']/,
  CATALOG: /(^|\/)(locales|i18n|lang|translations)\/|(^|\/)messages\/[^/]+\.json$|\.(po|pot|mo|ftl|xlf|xliff|arb|xcstrings|strings)$|\.lproj\/|(^|\/)res\/values-[^/]+\/strings\.xml$|\.[a-z]{2}(-[A-Z]{2})?\.resx$|(^|\/)messages_[\w-]+\.properties$/,
  CONFIG: /(^|\/)(lingui\.config\.[cm]?[jt]s|\.linguirc|i18next-parser\.config\.[cm]?[jt]s|crowdin\.yml|lokalise\.yml|\.phrase\.yml|l10n\.toml)$/,
  // Python and .NET have no quoted name in a manifest line: Babel, gettext and the Django helper.
  PYTHON: /(^|[\s"'=,:])(babel|flask-babel|django\.utils\.translation|gettext)(?=$|[\s"'=<>~^@/.,:-])/i,
  ASKED: /\b(i18n|l10n|locali[sz]ation|locali[sz]e|locale|translations?|translated|internacionaliz\w*|idiomas?|traducci[oó]n(es)?|traducir)\b/i,
};

const CODE = /\.(m?[jt]sx?|cjs|cts|py|go|cs|java|kt|rb|php)$/;
const MANIFEST = /(^|\/)(package\.json|pyproject\.toml|requirements[^/]*\.txt|Pipfile|go\.mod|Gemfile|composer\.json|pom\.xml|build\.gradle[^/]*|[^/]+\.csproj)$/;
// What `docs/` holds for the core (the decision records and the technical documents the core asks
// for) does not say the repo has a documentation site.
const CORE_DOCS = /^docs\/(adr\/|technical\/(system-design|infra-cost|dependencies)\.md$)/;

// The signals `detectIn` answers with; `modules.json` names them by these ids.
export const SIGNAL_IDS = ['screen', 'route', 'listen', 'http-dependency', 'worker', 'schema', 'data-dependency', 'infra', 'cloud-dependency', 'ci', 'i18n', 'docs', 'auth-dependency'];

const SIGNAL_LIMIT = 4;
// Where each piece of evidence was seen, kept next to the result without being part of it.
const PROVENANCE = new WeakMap();
const push = (found, id, evidence, file = null) => {
  const list = (found[id] ??= []);
  if (!list.includes(evidence) && list.length < SIGNAL_LIMIT) list.push(evidence);
  if (file) {
    if (!PROVENANCE.has(found)) PROVENANCE.set(found, {});
    PROVENANCE.get(found)[evidence] ??= file;
  }
};

// The line a person reads: «found pg in package.json» for a dependency, the evidence itself otherwise.
export const describe = (found, evidence) => {
  const file = PROVENANCE.get(found)?.[evidence];
  return evidence.startsWith('dep: ') && file ? `found ${evidence.slice(5)} in ${file}` : evidence;
};

// What makes two pieces of evidence «the same signal»: a second migration is not a new signal, a
// package that was not there is. `kit.json` compares by kind.
export const kindOf = (evidence) => {
  if (evidence.startsWith('dep: ')) return evidence;
  const files = evidence.match(/^\d+ (\.\w+) files?$/);
  if (files) return `${files[1]} files`;
  return evidence.match(/^(schema file|infrastructure file|pipeline|catalog|config|docs\/ file|route in|listen in|worker or schedule in|markup in|more than one lang in the markup)\b/)?.[1] ?? evidence;
};

// What one card shows. `files`: relative paths it names or touches; `added`: [{ f, text }] lines
// it adds (manifests and code); `texts`: free text that names dependencies (the plan's sections); `asks`: the
// text of the requirement, the only one that can ask for a language (the plan's words are the plan's, and
// «locales» in Spanish is «local»).
export const detectIn = ({ files = [], added = [], texts = [], asks = [] } = {}) => {
  const found = {};
  const screens = {};
  for (const f of files.map((x) => String(x).replaceAll('\\', '/'))) {
    if (IS_SCREEN.test(f)) { const ext = f.match(/\.(\w+)$/)[1]; screens[ext] = (screens[ext] ?? 0) + 1; }
    if (IS_SCHEMA.test(f)) push(found, 'schema', `schema file: ${f}`);
    if (IS_INFRA.test(f)) push(found, 'infra', `infrastructure file: ${f}`);
    if (IS_CI.test(f)) push(found, 'ci', `pipeline: ${f}`);
    if (I18N.CATALOG.test(f)) push(found, 'i18n', `catalog: ${f}`);
    if (I18N.CONFIG.test(f)) push(found, 'i18n', `config: ${f}`);
    if (/^docs\//.test(f) && !CORE_DOCS.test(f)) push(found, 'docs', `docs/ file: ${f}`);
  }
  for (const [ext, n] of Object.entries(screens)) push(found, 'screen', `${n} .${ext} file${n > 1 ? 's' : ''}`);
  const lines = [...added, ...texts.flatMap((t) => String(t).split('\n').map((text) => ({ f: null, text })))];
  for (const { f, text } of lines) {
    const manifest = f === null || MANIFEST.test(f);
    if (manifest) {
      for (const [id, re] of [['data-dependency', DATA_DEPENDENCY], ['cloud-dependency', CLOUD_DEPENDENCY], ['http-dependency', HTTP_DEPENDENCY], ['auth-dependency', AUTH_DEPENDENCY]]) {
        const m = text.match(re);
        if (m) push(found, id, `dep: ${m[1]}`, f);
      }
      const lib = text.match(I18N.DEPENDENCY)?.[1] ?? text.match(I18N.PYTHON)?.[2];
      if (lib) push(found, 'i18n', `dep: ${lib}`, f);
    }
    if (f !== null && CODE.test(f)) {
      if (!IS_SCREEN.test(f) && SCREEN_MARKUP.test(text)) push(found, 'screen', `markup in ${f}`);
      if (routeIn(text)) push(found, 'route', `route in ${f}`);
      if (LISTEN.test(text)) push(found, 'listen', `listen in ${f}`);
      if (WORKER.test(text)) push(found, 'worker', `worker or schedule in ${f}`);
      if (/\blang\s*=\s*["']([\w-]+)["']/.test(text)) push(found, 'i18n-lang', text.match(/\blang\s*=\s*["']([\w-]+)["']/)[1]);
    }
  }
  if (asks.some((t) => I18N.ASKED.test(String(t)))) push(found, 'i18n', 'the card asks for a language, a translation or a locale');
  // Two different `lang` values in the markup mean two languages; one alone is not a signal.
  const langs = found['i18n-lang'] ?? [];
  delete found['i18n-lang'];
  if (langs.length > 1) push(found, 'i18n', `more than one lang in the markup: ${langs.join(', ')}`);
  return found;
};

const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'specs', 'dist', 'build', 'coverage', '.venv', 'venv', '__pycache__', 'target', 'bin', 'obj']);
export const repoFiles = (root) => {
  const tracked = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (tracked.status === 0 && tracked.stdout) return tracked.stdout.split('\0').filter((f) => f && !/^(\.claude|specs)\//.test(f));
  const out = [];
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(dir, e.name), r); else out.push(r);
    }
  };
  walk(root, '');
  return out;
};

const READ_LIMIT = 400;
const SIZE_LIMIT = 200_000;
// What the whole repo shows: every path, the manifests and the code files (a bounded sample).
export const detect = (root) => {
  const files = repoFiles(root);
  const readable = (f) => {
    try { return statSync(join(root, f)).size <= SIZE_LIMIT ? readFileSync(join(root, f), 'utf8') : ''; } catch { return ''; }
  };
  const added = [];
  for (const f of files.filter((x) => MANIFEST.test(x)))
    for (const text of readable(f).split('\n')) added.push({ f, text });
  for (const f of files.filter((x) => CODE.test(x) || /\.(html?|vue|svelte)$/.test(x)).slice(0, READ_LIMIT))
    for (const text of readable(f).split('\n')) added.push({ f, text });
  return detectIn({ files, added });
};

// The evidence of a module: the union of what its signals found.
export const evidenceOf = (found, signalIds) => [...new Set(signalIds.flatMap((id) => found[id] ?? []))];
