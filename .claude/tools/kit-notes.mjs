#!/usr/bin/env node
// kit-notes.mjs — what the kit learns about itself while it is used. It records, it never changes the kit.
//
//   add "<text>" [--key <key>]          a note from the agent or the person about the kit (kind `agent`)
//   list [--repo <name>]                the notes as they were recorded
//   report [--out <file>] [--min <n>]   the notes grouped by key across every repo, the candidates first
//   resolve <key> --by "<release or commit>"   a change addressed this key; a later note with it reads «returned»
//
// What feeds it, with no one asking: a hook that blocked or failed (hook-dispatch), a check the close left failed or not
// run, a `declared ·` waiver, a `rule … is wrong` and a `kit:` line of the Log (close.mjs), an inspector rule waived
// with --allow, a blueprint the designer adjusted, and a correction the person typed (hooks/kit-feedback.mjs).
// A key is a candidate when it shows up in two or more cards or sessions; a note of the person or the agent always is.
// The candidates are proposals for whoever maintains the kit: each becomes a change with its test, judged like any
// other (bench or blind A/B for design), and then `resolve` so the report watches for it coming back.
//
// The store lives outside every repo —`KIT_NOTES_DIR`, else ~/.claude/kit-notes/<repo>.jsonl— so a note never lands in
// a commit, and what the person typed stays on their machine, redacted and cut to 300 characters.
// `KIT_NOTES=off` turns recording off. Under `node --test` it records only where KIT_NOTES_DIR points.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const notesDir = (env = process.env) => env.KIT_NOTES_DIR || join(homedir(), '.claude', 'kit-notes');
const enabled = (env = process.env) => env.KIT_NOTES !== 'off' && (!env.NODE_TEST_CONTEXT || Boolean(env.KIT_NOTES_DIR));
const slug = (repo) => String(repo || 'none').replace(/[^\w.-]+/g, '-').slice(0, 80) || 'none';
const MAX = 300;

const SECRETS = [
  /\b(?:sk|pk|rk)-[\w-]{12,}/g, /\bgh[pousr]_[A-Za-z0-9]{20,}/g, /\bxox[abprs]-[\w-]{10,}/g, /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, /\b[A-Fa-f0-9]{32,}\b/g, /\b[A-Za-z0-9+/]{40,}={0,2}/g,
  /\b(?:password|passwd|pwd|token|secret|api[_-]?key|authorization|bearer)\b\s*[:=]?\s*\S+/gi,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
];
// The text that goes to disk: no credential, address or long opaque string, on one line, at most 300 characters.
export const redact = (text) => {
  let t = String(text ?? '').replace(/\s+/g, ' ').trim();
  for (const re of SECRETS) t = t.replace(re, '[redacted]');
  return t.length > MAX ? `${t.slice(0, MAX - 1)}…` : t;
};

const kitVersion = () => {
  try { return JSON.parse(readFileSync(join(import.meta.dirname, '..', 'modules.json'), 'utf8')).kit ?? null; } catch { return null; }
};
const idOf = (...parts) => createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 12);

// Appends one note. `once: true` gives it an id from what it says, so a check rerun on the same card is recorded once.
// Never throws: a note that cannot be written is lost, the call that produced it goes on.
export const record = ({ kind, key, text, repo, card = null, session = null, once = false }, env = process.env) => {
  try {
    if (!enabled(env) || !kind || !key) return null;
    const clean = redact(text);
    const at = new Date().toISOString();
    const id = once ? idOf(kind, key, clean, repo, card) : idOf(kind, key, clean, repo, card, session, at, Math.random());
    const dir = notesDir(env);
    const file = join(dir, `${slug(repo)}.jsonl`);
    if (once && existsSync(file) && readFileSync(file, 'utf8').includes(`"id":"${id}"`)) return null;
    mkdirSync(dir, { recursive: true });
    const note = { id, at, kind, key: String(key).slice(0, 120), text: clean, repo: slug(repo), card, session, kit: kitVersion() };
    appendFileSync(file, `${JSON.stringify(note)}\n`);
    return note;
  } catch { return null; }
};

// The repo and the card in progress for a path, from the kit's own helpers; nulls when there is no kit there.
export const contextOf = async (cwd) => {
  try {
    const card = await import('./card.mjs');
    const root = card.kitRootOf(cwd) ?? cwd;
    const dir = card.kitRootOf(cwd) ? card.currentCard(root) : null;
    return { repo: basename(root), card: dir ? basename(dir) : null };
  } catch { return { repo: basename(cwd), card: null }; }
};

const readJsonl = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : []);
export const readNotes = (env = process.env) => {
  const dir = notesDir(env);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.jsonl') && f !== 'resolutions.jsonl').flatMap((f) => readJsonl(join(dir, f)));
};
export const readResolutions = (env = process.env) => readJsonl(join(notesDir(env), 'resolutions.jsonl'));

export const resolve = (key, by, env = process.env) => {
  if (!key || !by) throw new Error('resolve needs a key and --by "<release or commit>"');
  mkdirSync(notesDir(env), { recursive: true });
  const entry = { key, by: redact(by), at: new Date().toISOString() };
  appendFileSync(join(notesDir(env), 'resolutions.jsonl'), `${JSON.stringify(entry)}\n`);
  return entry;
};

// What the person typed that is about the work: a note for the kit, or a correction (hooks/kit-feedback.mjs).
// A note for the kit, said in so many words.
export const KIT_NOTE = /^\s*(?:kit\s*(?:note)?|nota\s+(?:para\s+el|del)\s+kit)\s*:\s*(\S[\s\S]*)$/i;
// A correction of what was done. Openings that only make sense as one, and phrases that say it anywhere in the prompt.
const OPENS = /^\s*(?:no(?:\s*[,.!:]|\s+(?:era|es|eso|así|asi|me\s+gusta|anda|funciona|está|esta|quedó|quedo|hiciste))|nope|wrong|mal\b)/i;
const SAYS = new RegExp([
  'est[aá] mal', 'est[aá]s? equivocad', 'eso no (?:era|es|va|lo ped[ií])', 'no (?:es|era) lo que (?:ped[ií]|quer[ií]a|dije)', 'te dije',
  'otra vez (?:lo mismo|mal|igual)', 'de nuevo (?:lo mismo|mal)', 'sigue (?:mal|roto|igual|sin)', 'est[aá] roto', 'no funciona',
  'tiene (?:bugs|errores)', 'por qu[eé] (?:hiciste|cambiaste|borraste|no (?:lo )?hiciste)', 'no me gusta', 'no (?:est[aá]|qued[oó]) terminad',
  'se ve (?:mal|feo|gen[eé]ric|como plantilla)', 'parece (?:una )?plantilla', 'that(?:\'s| is) (?:wrong|not (?:what|right))', 'not what i (?:asked|wanted|meant)',
  'i (?:told|asked) you', 'still (?:broken|wrong|failing)', 'does(?:n\'t| not) work', 'why did you', 'you (?:broke|missed|forgot)',
].join('|'), 'i');
export const feedbackOf = (prompt) => {
  const text = String(prompt ?? '').trim();
  if (!text || text.startsWith('/') || text.startsWith('<')) return null;
  const note = text.match(KIT_NOTE);
  if (note) return { kind: 'agent', key: 'person', text: note[1] };
  if (OPENS.test(text) || SAYS.test(text)) return { kind: 'user', key: 'correction', text };
  return null;
};

const PERSONAL = new Set(['user', 'agent']);
// Notes grouped by key. A group's weight is the cards (or, with no card, the sessions) it shows up in; it is a candidate
// from `min` of them, or at once when a person or an agent wrote it. A resolved key whose notes go on after the resolution
// has `returned`: the change did not hold.
export const aggregate = (notes, resolutions = [], { min = 2 } = {}) => {
  const groups = new Map();
  for (const n of notes) {
    const key = PERSONAL.has(n.kind) ? `${n.kind}:${n.id}` : n.key;
    const g = groups.get(key) ?? { key, kind: n.kind, notes: [] };
    g.notes.push(n);
    groups.set(key, g);
  }
  const lastResolution = new Map();
  for (const r of resolutions) if (!lastResolution.has(r.key) || lastResolution.get(r.key).at < r.at) lastResolution.set(r.key, r);
  return [...groups.values()].map((g) => {
    const places = new Set(g.notes.map((n) => `${n.repo}/${n.card ?? `session:${n.session ?? n.id}`}`));
    const resolution = lastResolution.get(g.notes[0].key) ?? null;
    const after = resolution ? g.notes.filter((n) => n.at > resolution.at) : [];
    const status = !resolution ? 'open' : after.length ? 'returned' : 'resolved';
    const repos = [...new Set(g.notes.map((n) => n.repo))];
    const times = g.notes.map((n) => n.at).sort();
    return {
      key: PERSONAL.has(g.kind) ? `${g.notes[0].key} · ${g.notes[0].repo}${g.notes[0].card ? `/${g.notes[0].card}` : ''}` : g.notes[0].key, kind: g.kind, count: g.notes.length, places: places.size, repos, first: times[0], last: times.at(-1),
      kits: [...new Set(g.notes.map((n) => n.kit).filter(Boolean))], samples: [...new Set(g.notes.map((n) => n.text))].slice(0, 3),
      status, resolution, candidate: status !== 'resolved' && (PERSONAL.has(g.kind) || places.size >= min),
    };
  }).sort((a, b) => (b.status === 'returned') - (a.status === 'returned') || b.candidate - a.candidate || b.places - a.places || b.count - a.count || (a.last < b.last ? 1 : -1));
};

const KIND = {
  block: 'a hook blocked', 'hook-failed': 'a hook failed', waiver: 'a check was waived', failed: 'the close left it failed',
  'could-not-run': 'the close could not run it', 'rule-wrong': 'a rule was declared wrong', adjusted: 'a dealt design was adjusted',
  user: 'the person corrected', agent: 'a note for the kit',
};
export const reportOf = (groups) => {
  const line = (g) => [`### ${g.status === 'returned' ? 'RETURNED · ' : ''}${g.key}`,
    `${KIND[g.kind] ?? g.kind} · ${g.count} time(s) in ${g.places} card(s)/session(s) · ${g.repos.join(', ')} · ${g.first.slice(0, 10)} → ${g.last.slice(0, 10)}${g.kits.length ? ` · kit ${g.kits.join(', ')}` : ''}`,
    ...(g.resolution ? [`resolved by ${g.resolution.by} on ${g.resolution.at.slice(0, 10)}`] : []),
    ...g.samples.map((s) => `> ${s}`), ''].join('\n');
  const candidates = groups.filter((g) => g.candidate);
  const rest = groups.filter((g) => !g.candidate && g.status !== 'resolved');
  const resolved = groups.filter((g) => g.status === 'resolved');
  return ['# Kit notes', '',
    'Proposals, not changes: each candidate becomes a change with its test, judged like any other (the bench, or a blind A/B for',
    'design), and then `node .claude/tools/kit-notes.mjs resolve <key> --by "<release>"`, so a note that comes back reads RETURNED.', '',
    `## Candidates (${candidates.length})`, '', ...(candidates.length ? candidates.map(line) : ['none', '']),
    `## Seen once (${rest.length})`, '', ...(rest.length ? rest.map((g) => `- ${g.key} · ${KIND[g.kind] ?? g.kind} · ${g.samples[0] ?? ''}`) : ['none']), '',
    `## Resolved and quiet (${resolved.length})`, '', ...(resolved.length ? resolved.map((g) => `- ${g.key} · by ${g.resolution.by}`) : ['none']), ''].join('\n');
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args.splice(at, 2)[1] : undefined; };
  const [command] = args;
  try {
    if (command === 'add') {
      const key = option('--key');
      const text = args.slice(1).join(' ').trim();
      if (!text) throw new Error('add needs the text of the note');
      const ctx = await contextOf(process.cwd());
      const note = record({ kind: 'agent', key: key ?? 'agent', text, ...ctx, session: process.env.CLAUDE_SESSION_ID ?? null });
      console.log(note ? `Noted for the kit (${note.id}) in ${notesDir()}.` : 'Not recorded: KIT_NOTES=off.');
    } else if (command === 'list') {
      const repo = option('--repo');
      for (const n of readNotes().filter((n) => !repo || n.repo === slug(repo))) console.log(`${n.at.slice(0, 16)} · ${n.repo}${n.card ? `/${n.card}` : ''} · ${n.kind} · ${n.key} · ${n.text}`);
    } else if (command === 'report') {
      const out = option('--out');
      const min = Number(option('--min')) || 2;
      const text = reportOf(aggregate(readNotes(), readResolutions(), { min }));
      if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, text); console.log(`Wrote ${out}.`); } else console.log(text);
    } else if (command === 'resolve') {
      const by = option('--by');
      const r = resolve(args[1], by);
      console.log(`${r.key} resolved by ${r.by}: the report marks it RETURNED if it shows up again.`);
    } else {
      console.error('kit-notes.mjs add "<text>" [--key k] | list [--repo r] | report [--out f] [--min n] | resolve <key> --by "<release>"');
      process.exit(2);
    }
  } catch (e) { console.error(`kit-notes.mjs: ${e.message}`); process.exit(1); }
}
