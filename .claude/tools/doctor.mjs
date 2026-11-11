#!/usr/bin/env node
// doctor.mjs — run from the repo root, before the first card. Read-only.
//
// What the method needs and the machine may lack, one line per check: `ok`, `missing` or `could not
// run`, with what to do about it. Node's version; git present and the tree clean; the stack, read from
// its manifest, and the profile of .claude/stacks/ that goes with it; the `E2E=` folder of METHOD.md;
// the wiring of .claude/settings.json against .claude/hooks/; the modules it would pre-mark and the
// signal that decided each (`signals.mjs`; the manifest is written by install.mjs, never here); the tools of the profile (`npx
// --no-install`: nothing is downloaded) and the binaries (`--version`); the Playwright browser; and
// the `atlassian` MCP server, only whether the project's config declares it.
// It writes nothing: no .validation/, no install. Every process it starts has a 10 s timeout.
// Exits 0 if everything is ok, 1 if something is missing or could not run, 2 on its own error.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROUTES } from './hook-dispatch.mjs';
import { detectE2e, readManifest, readModules } from './kit.mjs';
import { describe, detect, evidenceOf } from './signals.mjs';

const NODE_MIN = 20;
const TIMEOUT_MS = 10_000;

// Runs a command with a timeout and reports how it ended; never throws.
const probe = (cmd, args, cwd) => new Promise((done) => {
  let out = '';
  let finished = false;
  const end = (r) => { if (!finished) { finished = true; clearTimeout(timer); done({ out: out.trim(), ...r }); } };
  let p;
  try {
    p = spawn(cmd, args, { cwd, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return done({ out: '', status: null, absent: true, error: e.message });
  }
  const timer = setTimeout(() => { p.kill(); end({ status: null, timedOut: true }); }, TIMEOUT_MS);
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('error', (e) => end({ status: null, absent: e.code === 'ENOENT', error: e.message }));
  p.on('close', (status) => end({ status }));
});

const STACKS = [
  { name: 'react-shadcn', profile: 'stacks/react-shadcn.md', manifest: (files) => files.includes('components.json') },
  { name: 'node-ts', profile: 'stacks/node-ts.md', manifest: (files) => files.includes('package.json') },
  { name: '.NET', profile: 'stacks/others.md', manifest: (files) => files.some((f) => f.endsWith('.csproj') || f.endsWith('.sln')) },
  { name: 'Java', profile: 'stacks/others.md', manifest: (files) => files.includes('pom.xml') || files.some((f) => /^build\.gradle/.test(f)) },
  { name: 'Python', profile: 'stacks/others.md', manifest: (files) => files.includes('pyproject.toml') || files.some((f) => /^requirements.*\.txt$/.test(f)) },
];

// The stack of a repo, read from the manifests among the files of its root; undefined if none matches.
export const detectStack = (files) => STACKS.find((s) => s.manifest(files));

const NODE_TOOLS = [['playwright', ['playwright', '--version']], ['tsc', ['tsc', '--version']], ['eslint', ['eslint', '--version']], ['c8', ['c8', '--version']], ['stryker', ['stryker', '--version']]];
const STACK_RUNTIME = { '.NET': ['dotnet', ['--version']], Java: ['java', ['-version']], Python: ['python', ['--version']] };
const BINARIES = ['docker', 'semgrep', 'gitleaks', 'squawk'];

const browsersDir = () => process.env.PLAYWRIGHT_BROWSERS_PATH
  || (process.platform === 'win32' ? join(process.env.LOCALAPPDATA ?? homedir(), 'ms-playwright')
    : process.platform === 'darwin' ? join(homedir(), 'Library', 'Caches', 'ms-playwright') : join(homedir(), '.cache', 'ms-playwright'));

const wiring = (root) => {
  const settings = join(root, '.claude', 'settings.json');
  if (!existsSync(settings)) return { status: 'missing', text: 'hook wiring — .claude/settings.json does not exist: install the kit' };
  let registered;
  const relative = [];
  try {
    // A hook is registered by its own command or by an event of the dispatcher, whose routes name it.
    // The dispatcher is addressed from $CLAUDE_PROJECT_DIR: a path relative to the cwd fails with
    // MODULE_NOT_FOUND once the session changes directory, and a hook error that is not exit 2 does not block.
    registered = new Set(Object.values(JSON.parse(readFileSync(settings, 'utf8')).hooks ?? {}).flat()
      .flatMap((g) => g.hooks ?? []).flatMap((h) => {
        const command = String(h.command);
        if (/^node \.claude\//.test(command)) relative.push(command);
        const event = command.match(/^node "\$CLAUDE_PROJECT_DIR\/\.claude\/tools\/hook-dispatch\.mjs" (\w+)$/)?.[1]
          ?? command.match(/^node \.claude\/tools\/hook-dispatch\.mjs (\w+)$/)?.[1];
        if (event) return (ROUTES[event] ?? []).flatMap(([, names]) => names.map((n) => `${n}.mjs`));
        return [command.match(/^node \.claude\/hooks\/([\w-]+\.mjs)$/)?.[1]].filter(Boolean);
      }));
  } catch (e) {
    return { status: 'missing', text: `hook wiring — .claude/settings.json is not valid JSON (${e.message})` };
  }
  if (relative.length)
    return { status: 'missing', text: `hook wiring — ${relative.length} command(s) addressed relative to the cwd (${relative[0]}): use node "$CLAUDE_PROJECT_DIR/.claude/tools/hook-dispatch.mjs" <event> in .claude/settings.json` };
  const dir = join(root, '.claude', 'hooks');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.mjs')) : [];
  const unregistered = files.filter((f) => !registered.has(f));
  const absent = [...registered].filter((f) => !files.includes(f));
  if (unregistered.length || absent.length)
    return { status: 'missing', text: `hook wiring — ${unregistered.length ? `not registered: ${unregistered.join(', ')}` : ''}${absent.length ? ` registered but absent: ${absent.join(', ')}` : ''}: fix .claude/settings.json` };
  return { status: 'ok', text: `hook wiring — ${registered.size} hooks registered, all present` };
};

// One line per module of the kit: pre-marked with what was found, or not marked. The list of modules is
// the kit's own `.claude/modules.json`; without it there is nothing to say.
export const modulePreMarks = (root) => {
  const map = readModules(root);
  if (!map) return [];
  const found = detect(root);
  return Object.entries(map.modules).filter(([, m]) => m.installable !== false).map(([name, m]) => {
    const seen = evidenceOf(found, m.signals).map((e) => describe(found, e));
    return seen.length ? `module ${name} — pre-marked: ${seen.join('; ')}` : `module ${name} — no signal found`;
  });
};

const mcp = (root) => {
  const configs = ['.mcp.json', '.claude/settings.json', '.claude/settings.local.json'].map((f) => join(root, f)).filter(existsSync);
  const declared = configs.some((f) => /"atlassian"/.test(readFileSync(f, 'utf8')) && /mcp/i.test(readFileSync(f, 'utf8')));
  const mcpConfig = configs.some((f) => /mcp/i.test(readFileSync(f, 'utf8')));
  if (declared) return { status: 'ok', text: 'MCP atlassian — configured in the project (not called)' };
  if (mcpConfig) return { status: 'missing', text: 'MCP atlassian — the project declares MCP servers but not `atlassian`: add it, or ask for the card text and freeze it as received' };
  return null;
};

export const checks = async (root) => {
  const results = [];
  const add = (status, text) => results.push({ status, text });

  const major = Number(process.versions.node.split('.')[0]);
  add(major >= NODE_MIN ? 'ok' : 'missing', major >= NODE_MIN ? `node — ${process.versions.node}` : `node — ${process.versions.node}, the kit needs ${NODE_MIN} or later: install it`);

  const git = await probe('git', ['--version'], root);
  if (git.status !== 0) add(git.timedOut ? 'could not run' : 'missing', 'git — not available: install git');
  else {
    const status = await probe('git', ['--no-optional-locks', 'status', '--porcelain'], root);
    if (status.status !== 0) add('could not run', `git status — ${status.out.split('\n')[0] || 'not a git repository'}: run \`git init\``);
    else add(status.out ? 'missing' : 'ok', status.out ? `git tree — ${status.out.split('\n').length} uncommitted path(s): commit or set them aside, the card's diff starts from a clean tree` : 'git tree — clean');
  }

  const files = readdirSync(root);
  const stack = detectStack(files);
  if (!stack) add('missing', 'stack — no manifest found (package.json, components.json, *.csproj, pom.xml, build.gradle, pyproject.toml, requirements.txt): the first card chooses the profile in .claude/stacks/');
  else add(existsSync(join(root, '.claude', stack.profile)) ? 'ok' : 'missing', `stack — ${stack.name}: profile .claude/${stack.profile}${existsSync(join(root, '.claude', stack.profile)) ? '' : ' does not exist'}`);

  // The scenarios folder is in kit.json when the kit was installed with modules, else in METHOD.md.
  const method = join(root, '.claude', 'METHOD.md');
  const e2e = readManifest(root)?.e2e ?? (existsSync(method) ? readFileSync(method, 'utf8').match(/^E2E=(\S+)/m)?.[1] : null);
  const found = detectE2e(root);
  if (!e2e) add('missing', `E2E= — .claude/METHOD.md does not name the scenarios folder: ${found ? `this repo has ${found}: run \`node .claude/tools/kit.mjs e2e ${found}\`` : 'set `E2E=<path>`'}`);
  else if (existsSync(join(root, e2e))) add('ok', `E2E — ${e2e}`);
  else add('missing', `E2E — ${e2e} does not exist${found ? `; this repo has ${found}: run \`node .claude/tools/kit.mjs e2e ${found}\`` : ': create it in the first card or point to the real one with `node .claude/tools/kit.mjs e2e <path>`'}. close.mjs finds the card's tests by their tag, whatever the folder`);

  const wired = wiring(root);
  add(wired.status, wired.text);

  // The modules the installer would pre-mark, and why: informational, nothing is written.
  for (const line of modulePreMarks(root)) add('ok', line);

  const probes = [];
  if (stack && ['node-ts', 'react-shadcn'].includes(stack.name))
    for (const [name, args] of NODE_TOOLS) probes.push(probe('npx', ['--no-install', ...args], root).then((r) => ({ name: `${name} (npx --no-install)`, r, hint: `npm i -D ${name === 'tsc' ? 'typescript' : name === 'stryker' ? '@stryker-mutator/core' : name}` })));
  if (stack && STACK_RUNTIME[stack.name]) {
    const [cmd, args] = STACK_RUNTIME[stack.name];
    probes.push(probe(cmd, args, root).then((r) => ({ name: cmd, r, hint: `install ${cmd}` })));
  }
  for (const b of BINARIES) probes.push(probe(b, ['--version'], root).then((r) => ({ name: b, r, hint: `install ${b} (an option, see .claude/stacks/)` })));
  for (const { name, r, hint } of await Promise.all(probes)) {
    if (r.timedOut) add('could not run', `${name} — no answer in ${TIMEOUT_MS / 1000} s`);
    else if (r.status === 0) add('ok', `${name} — ${r.out.split('\n')[0].slice(0, 60)}`);
    else add('missing', `${name} — not available: ${hint}`);
  }

  if (stack && ['node-ts', 'react-shadcn'].includes(stack.name)) {
    const dir = browsersDir();
    const has = existsSync(dir) && readdirSync(dir).some((d) => /^chromium/.test(d));
    add(has ? 'ok' : 'missing', has ? `Playwright browser — chromium in ${dir}` : `Playwright browser — no chromium in ${dir}: PLAYWRIGHT_SKIP_BROWSER_GC=1 npx playwright install chromium`);
  }

  const atlassian = mcp(root);
  if (atlassian) add(atlassian.status, atlassian.text);
  return results;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const results = await checks(process.cwd());
    for (const r of results) console.log(`${r.status.padEnd(13)} ${r.text}`);
    const bad = results.filter((r) => r.status !== 'ok').length;
    console.log(bad ? `\n${bad} of ${results.length} checks are not ok: what is missing goes to a background install, or is declared \`could not run\`.` : `\nAll ${results.length} checks ok.`);
    process.exit(bad ? 1 : 0);
  } catch (e) {
    console.error(`doctor.mjs failed on its own: ${e.message}`);
    process.exit(2);
  }
}
