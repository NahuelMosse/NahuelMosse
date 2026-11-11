// The information architecture of a product screen: `## Information` of card.md. A dense screen (a loan file, an account, a case)
// is hard because of what it shows and where, not because of its components. Each decision the user makes on the screen is a
// line, and each field the screen shows names the decision it serves and its tier:
//   glance  seen without any interaction; the fields of D1, the screen's main decision, in the first viewport
//   detail  one interaction away (a tab, a disclosure, a drawer), but on the page
//   audit   kept out of the first view (ids, who changed what, timestamps)
// A field a rule bounds carries its limit (`· limit: ≤ 40 %`), and each `signal:` line names the states that mean something is
// wrong, as the screen writes them, with their tone. The user came to find what blocks the decision: a value past its limit and
// a signal state are toned, and one of them is in the first viewport. The fields of one decision form one group on the screen:
// ia-check.mjs measures all of it in the browser.
import { sectionOf } from './card-doc.mjs';

export const TIERS = ['glance', 'detail', 'audit'];
export const TONES = ['danger', 'warning'];
// A decision read from more than seven values at once is not read at a glance: the rest go to detail.
export const GLANCE_MAX = 7;
export const FORM = '`- decision: D1 · <what the user decides> · who: <role>`, then one line per field `- <label as on screen> · D<n>[,D<m>] · glance|detail|audit[ · limit: ≤ 40 %]` (`-` instead of the decision only for audit)';
export const SIGNAL_FORM = '`- signal: <state as on screen>[, <state>…] · danger|warning` (a policy not met, a missing document, an overdue amount), and `· limit: <op> <number>` on a field a rule bounds';

export const isProductLook = (doc) => /^\s*[-*]?\s*ref-kind:\s*product\b/im.test(sectionOf(doc, 'Look') ?? '');

const clean = (s) => s.trim().replace(/^[`"«“]+|[`"»”]+$/g, '').trim();
const OPS = { '≤': '<=', '<=': '<=', '<': '<', '≥': '>=', '>=': '>=', '>': '>' };

// `≤ 40 %`, `>= 650`, `< 1.000.000`: the operator and the number.
export const limitOf = (text) => {
  const m = String(text).match(/^\s*(≤|<=|<|≥|>=|>)\s*(.+)$/);
  if (!m) return null;
  const n = numberOf(m[2]);
  return n === null ? null : { op: OPS[m[1]], n, text: text.trim() };
};

// The first number of a text, in either locale: `$ 18.500.000`, `41,7 %`, `1,234.50`, `712`. A separator followed by exactly
// three digits groups thousands; the last of two different separators is the decimal one.
export const numberOf = (text) => {
  const m = String(text).replace(/−/g, '-').match(/-?\d[\d.,   ]*\d|-?\d/);
  if (!m) return null;
  let s = m[0].replace(/[   ]/g, '');
  const dot = s.lastIndexOf('.'); const comma = s.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) s = dot > comma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  else for (const sep of ['.', ',']) {
    if (!s.includes(sep)) continue;
    const groups = s.split(sep);
    // A group of three after a lone separator is thousands (1.250), except after a leading zero (0.125).
    const thousands = groups.length > 2 || (groups[1].length === 3 && !/^-?0$/.test(groups[0]));
    s = thousands ? groups.join('') : groups.join('.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export const breaches = (value, limit) => {
  if (value === null || !limit) return false;
  const ok = { '<=': value <= limit.n, '<': value < limit.n, '>=': value >= limit.n, '>': value > limit.n }[limit.op];
  return !ok;
};

export const informationOf = (doc) => {
  const section = sectionOf(doc, 'Information');
  if (section === null) return null;
  const decisions = []; const fields = []; const signals = []; const bad = [];
  for (const raw of section.split('\n')) {
    const line = raw.trim();
    if (!/^[-*]\s+/.test(line)) continue;
    const body = line.replace(/^[-*]\s+/, '');
    if (/^declared\s*·/i.test(body)) continue;
    const d = body.match(/^decision:\s*(D\d+)\s*·\s*([^·]+?)\s*(?:·\s*who:\s*(.+))?$/i);
    if (d) { decisions.push({ id: d[1].toUpperCase(), text: d[2].trim(), who: d[3]?.trim() || null }); continue; }
    const s = body.match(/^signal:\s*([^·]+?)\s*·\s*(\w+)\s*$/i);
    if (s) { signals.push({ words: s[1].split(',').map(clean).filter(Boolean), tone: s[2].toLowerCase(), line }); continue; }
    const parts = body.split('·').map((p) => p.trim());
    if ((parts.length === 3 || parts.length === 4) && parts[0]) {
      const serves = parts[1] === '-' ? [] : parts[1].toUpperCase().split(/[\s,]+/).filter(Boolean);
      const extra = parts[3]?.match(/^limit:\s*(.+)$/i);
      if (parts.length === 4 && !extra) { bad.push(line); continue; }
      fields.push({ label: clean(parts[0]), serves, tier: parts[2].toLowerCase(), limit: extra ? limitOf(extra[1]) : null, limitText: extra?.[1] ?? null, line });
      continue;
    }
    bad.push(line);
  }
  return { decisions, fields, signals, bad };
};

// What plan.mjs asks of a product screen's card: the section, its decisions with who makes them, each decision with its glance
// fields and no more than GLANCE_MAX, what can go wrong on it (signals and limits), and the `ia:` line of the gate that measures it.
export const informationProblems = (doc, gateLines = []) => {
  if (!isProductLook(doc) || /declared\s*·[^\n]*\binformation\b/i.test(doc)) return [];
  const info = informationOf(doc);
  const closing = '· or `declared · information · <why the screen has no decisions to serve>`';
  if (!info) return [`no \`## Information\` section (product screen, \`ref-kind: product\`): what the user decides on the screen and the fields each decision needs: ${FORM} ${closing}`];
  const out = [];
  for (const b of info.bad) out.push(`## Information: \`${b}\` is neither a decision, a signal nor a field · ${FORM}`);
  if (!info.decisions.length) out.push(`## Information has no \`decision:\` line · ${FORM}`);
  for (const d of info.decisions) if (!d.who) out.push(`## Information ${d.id}: no \`who:\` (the role that makes the decision; its fields are read in that role's words)`);
  const ids = new Set(info.decisions.map((d) => d.id));
  const labels = new Map();
  for (const f of info.fields) {
    if (!TIERS.includes(f.tier)) out.push(`## Information \`${f.label}\`: tier \`${f.tier}\` is not one of ${TIERS.join(', ')}`);
    if (!f.serves.length && f.tier !== 'audit') out.push(`## Information \`${f.label}\`: serves no decision and is \`${f.tier}\` · name its decision, or it is \`audit\`, or it leaves the screen`);
    for (const s of f.serves) if (!ids.has(s)) out.push(`## Information \`${f.label}\`: serves ${s}, which is not a \`decision:\` line`);
    if (f.limitText !== null && !f.limit) out.push(`## Information \`${f.label}\`: limit \`${f.limitText}\` is not an operator and a number (\`≤ 40 %\`, \`>= 650\`)`);
    const key = f.label.toLowerCase();
    if (labels.has(key)) out.push(`## Information \`${f.label}\`: listed twice · one line, with every decision it serves`);
    labels.set(key, f);
  }
  for (const s of info.signals) if (!TONES.includes(s.tone)) out.push(`## Information \`${s.line}\`: tone \`${s.tone}\` is not one of ${TONES.join(', ')}`);
  if (!info.signals.length && !info.fields.some((f) => f.limit) && !/declared\s*·\s*signals\b/i.test(doc)) {
    out.push(`## Information names nothing that can go wrong: the user came to find what blocks the decision · ${SIGNAL_FORM} · or \`declared · signals · <why nothing on the screen can go wrong>\``);
  }
  for (const d of info.decisions) {
    const glance = info.fields.filter((f) => f.tier === 'glance' && f.serves.includes(d.id));
    if (!glance.length) out.push(`## Information ${d.id}: no \`glance\` field · the values ${d.who ?? 'the user'} decides from, seen without interaction`);
    if (glance.length > GLANCE_MAX) out.push(`## Information ${d.id}: ${glance.length} \`glance\` fields (max ${GLANCE_MAX}) · a decision read from more values is not read at a glance: move the rest to \`detail\``);
  }
  if (!gateLines.some((l) => /^ia\s*:/i.test(l))) out.push('no `ia:` line in ## Gate (product screen) · add `ia: node .claude/tools/ia-check.mjs specs/<card>` (profile web)');
  return out;
};
