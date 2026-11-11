#!/usr/bin/env node
// card-cost.mjs [session_id|transcript.jsonl] [--since <ISO>] [--cwd <repo root>] — what a session really cost, by role.
// The main transcript plus every subagent transcript in the sibling folder `<session>/subagents/` (recursive). A
// `message.id` counts once, the last line winning (the output accumulates while the answer arrives). Prices by exact
// model id; cache writes are priced by their TTL (5 min and 1 h). With no argument it is the current session:
// `$CLAUDE_SESSION_ID` / `$CLAUDE_CODE_SESSION_ID`, else the most recent transcript of this folder's project.
// Claude home: `$KIT_CLAUDE_HOME`, else `$CLAUDE_CONFIG_DIR`, else `~/.claude`. close.mjs writes `costLine` in closing.md.
// USD per million tokens. A model that is not here has no price: it is listed and left out of the total.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { linesOf } from './transcript.mjs';

export const PRICE = {
  'claude-opus-5-5': { input: 4, output: 20, write5m: 5.00, write1h: 8.00, read: 0.20 },
  'claude-opus-5': { input: 5, output: 25, write5m: 6.25, write1h: 10.00, read: 0.50 },
  'claude-opus-4-8': { input: 5, output: 25, write5m: 6.25, write1h: 10.00, read: 0.50 },
  'claude-sonnet-5': { input: 2, output: 10, write5m: 2.50, write1h: 4.00, read: 0.20 },
  'claude-sonnet-5-5': { input: 2, output: 10, write5m: 2.50, write1h: 4.00, read: 0.20 },
  'claude-haiku-4-5': { input: 1, output: 5, write5m: 1.25, write1h: 2.00, read: 0.10 },
  'claude-fable-5-1': { input: 10, output: 50, write5m: 12.50, write1h: 20.00, read: 0.25 },
};

export const claudeHome = () => process.env.KIT_CLAUDE_HOME || process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');

const priced = (model = '') => {
  const clean = model.replace(/\[1m\]$/, '').replace(/-\d{8}$/, '');
  return PRICE[clean] ? clean : null;
};

const transcriptsUnder = (dir) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return transcriptsUnder(p);
    return e.endsWith('.jsonl') ? [p] : [];
  }).sort();
};

const roleOf = (file) => {
  try { return JSON.parse(readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8')).agentType ?? 'unknown'; } catch { return 'unknown'; }
};

// The last message of each id inside one transcript.
const norm = (p) => resolve(String(p).replace(/\\/g, '/')).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
// `root` is one folder or several: a card built in a worktree of the repo is driven by a session whose cwd is the main
// checkout, so the repo and every worktree of it count. Measured: 39 of 41 closings of a repo said "no message of this
// repo" because the card lived in a worktree under another folder.
const inside = (cwd, root) => typeof cwd === 'string' && [root].flat().some((r) => norm(cwd) === r || norm(cwd).startsWith(`${r}/`));

// `card` ({ own, names }): the card's checkout and the strings that name it (key, folder, paths). A session that manages
// several cards, or runs one in a worktree from the main checkout, shares its transcript among them; a message counts for
// the card when its cwd is the card's checkout or it names the card, and a subagent whose prompt names it counts whole
// (a `card-runner`, the card's `builder`). Without `card` every message of the repo counts.
// A name counts as a whole token: CRM-12 is not in CRM-123 nor in XCRM-12.
const wholeToken = new Map();
const tokenOf = (n) => {
  if (!wholeToken.has(n)) wholeToken.set(n, new RegExp(`(?<![\\w-])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`));
  return wholeToken.get(n);
};
const names = (value, card) => { const text = JSON.stringify(value ?? '').toLowerCase().replace(/\\\\/g, '/'); return card.names.some((n) => tokenOf(n).test(text)); };
// The messages of one transcript, streamed: a long session's main transcript passes 512 MB. Only a line with `"usage"` is
// parsed; the first user line is the prompt that tells a subagent of this card from another one.
const messagesOf = (file, sinceMs = null, root = null, card = null) => {
  const last = new Map();
  let prompt = null;
  let i = 0;
  for (const line of linesOf(file)) {
    i += 1;
    if (prompt === null && line.includes('"user"')) {
      try { const entry = JSON.parse(line); if (entry.type === 'user') prompt = entry.message?.content ?? ''; } catch { /* a half-written line */ }
    }
    if (!line.includes('"usage"')) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const m = entry.message;
    if (!m?.usage || !m.model) continue;
    if (sinceMs !== null && !(Date.parse(entry.timestamp) >= sinceMs)) continue;
    if (root !== null && !inside(entry.cwd, root)) continue;
    const whole = card !== null && file !== card.main && names(prompt ?? '', card);
    if (card !== null && !whole && !inside(entry.cwd, card.own) && !names(m.content, card)) continue;
    last.set(m.id ?? `no-id-${file}-${i}`, m);
  }
  return last;
};

// `since` (Date or ISO string): only the messages whose `timestamp` is at or after it count.
// `root`: only the messages whose `cwd` is inside that folder count (a session can span several repos).
export const costOf = (main, since = null, root = null, card = null) => {
  const rootNorm = root === null || root === undefined ? null : [root].flat().map(norm);
  const cardNorm = card ? { main, own: [norm(card.own)], names: [norm(card.own), ...card.names.map((n) => String(n).toLowerCase())].filter(Boolean) } : null;
  const sinceMs = since === null || since === undefined ? null : new Date(since).getTime();
  if (Number.isNaN(sinceMs)) throw new Error(`invalid since: ${since}`);
  const sessionDir = join(dirname(main), basename(main, '.jsonl'));
  const subs = transcriptsUnder(join(sessionDir, 'subagents'));
  const sources = [{ file: main, role: 'main' }, ...subs.map((file) => ({ file, role: roleOf(file) }))];
  // The same message id in two transcripts is one message: the last source wins.
  const all = new Map();
  for (const { file, role } of sources) if (existsSync(file)) for (const [id, m] of messagesOf(file, sinceMs, rootNorm, cardNorm)) all.set(id, { m, role });
  const byRole = {};
  const unpriced = new Set();
  let total = 0;
  for (const { m, role } of all.values()) {
    const model = priced(m.model);
    if (!model) { unpriced.add(m.model); continue; }
    const p = PRICE[model];
    const u = m.usage;
    const cc = u.cache_creation ?? {};
    const write1h = cc.ephemeral_1h_input_tokens ?? 0;
    const write5m = Math.max(0, cc.ephemeral_5m_input_tokens ?? ((u.cache_creation_input_tokens ?? 0) - write1h));
    const usd = ((u.input_tokens ?? 0) * p.input + (u.output_tokens ?? 0) * p.output + write5m * p.write5m + write1h * p.write1h + (u.cache_read_input_tokens ?? 0) * p.read) / 1e6;
    byRole[role] = (byRole[role] ?? 0) + usd;
    total += usd;
  }
  return { total, byRole, messages: all.size, subagents: subs.length, unpriced: [...unpriced], main };
};

// The transcript an argument names: a `.jsonl` path, or a session id looked up in every project of the Claude home.
export const findTranscript = (arg, home = claudeHome()) => {
  if (arg.endsWith('.jsonl')) return existsSync(arg) ? resolve(arg) : null;
  const projects = join(home, 'projects');
  if (!existsSync(projects)) return null;
  for (const d of readdirSync(projects)) {
    const f = join(projects, d, `${arg}.jsonl`);
    if (existsSync(f)) return f;
  }
  return null;
};

// The current session: the id Claude Code exports, else the newest transcript of the project of `cwd` (its folder is
// the path with every character that is not a letter or digit turned into `-`).
export const currentTranscript = (cwd = process.cwd(), home = claudeHome(), env = process.env) => {
  const id = env.CLAUDE_SESSION_ID || env.CLAUDE_CODE_SESSION_ID;
  if (id) return findTranscript(id, home);
  const dir = join(home, 'projects', resolve(cwd).replace(/[^A-Za-z0-9]/g, '-'));
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
};

export const costLine = (cost) => {
  const roles = Object.entries(cost.byRole).sort((a, b) => b[1] - a[1]).map(([role, usd]) => `${role} ${usd.toFixed(2)}`);
  return `Cost: USD ${cost.total.toFixed(2)} (${roles.join(', ') || 'no messages'})${cost.unpriced.length ? ` · no price for ${cost.unpriced.join(', ')}: not in the total` : ''}`;
};

// `Cost: …` for closing.md, or `Cost: could not run: <why>`.
// `cwd` is the repo root and `since` the card's start; without `since` it is the commit that added a `card.md`.
// Only the messages of this repo since then count, never the whole session.
const cardCommitDate = (root) => {
  const r = spawnSync('git', ['log', '-1', '--diff-filter=A', '--format=%cI', '--', '*card.md'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() || null : null;
};

// The repo's main checkout and its worktrees; the folder alone when git cannot list them.
export const checkoutsOf = (cwd) => {
  const r = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd, encoding: 'utf8' });
  const list = r.status === 0 ? [...r.stdout.matchAll(/^worktree (.+)$/gm)].map((m) => m[1].trim()) : [];
  return list.length ? [...new Set([cwd, ...list])] : [cwd];
};

export const closingCost = (cwd = process.cwd(), arg = null, since = null) => {
  try {
    const file = arg ? findTranscript(arg) : currentTranscript(cwd);
    if (!file) return `Cost: could not run: no transcript ${arg ? `for ${arg}` : `of this session or of the project of ${cwd}`}`;
    const from = since || cardCommitDate(cwd);
    if (!from) return 'Cost: could not run: no commit of card.md to date the start of the card';
    const checkouts = checkoutsOf(cwd);
    // With worktrees, several cards can share the session: only what is this card's counts.
    const folder = existsSync(join(cwd, 'specs', '.current')) ? readFileSync(join(cwd, 'specs', '.current'), 'utf8').trim().split(/[\\/]/).pop() : '';
    const key = folder.match(/^[A-Za-z]\w*-\d+[A-Za-z0-9.]*/)?.[0];
    const card = checkouts.length > 1 ? { own: cwd, names: [folder, key].filter(Boolean) } : null;
    const cost = costOf(file, from, checkouts, card);
    if (cost.messages === 0) return `Cost: could not run: no message of this repo since ${from}`;
    return `${costLine(cost)}${card ? ' · the messages of this card' : ''}`;
  } catch (e) { return `Cost: could not run: ${e.message}`; }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--since');
  const since = at >= 0 ? args.splice(at, 2)[1] : null;
  const at2 = args.indexOf('--cwd');
  const root = at2 >= 0 ? args.splice(at2, 2)[1] : null;
  const arg = args[0] ?? null;
  const file = arg ? findTranscript(arg) : currentTranscript();
  if (!file) { console.error(`card-cost: no transcript found ${arg ? `for ${arg}` : 'for this session'}`); process.exit(1); }
  const cost = costOf(file, since, root);
  console.log(costLine(cost));
  console.log(`${cost.messages} messages · ${cost.subagents} subagents · ${file}`);
}
