// motion-audit.config.json: bands, duration tokens, per-kind severity and ignores with a reason.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { BANDS } from './constants.mjs';
import { KINDS, LEVELS } from './kinds.mjs';

export const CONFIG_FILE = 'motion-audit.config.json';
const TOP_KEYS = new Set(['bands', 'tokens', 'severity', 'ignore']);
const GESTURES = Object.keys(BANDS);

export class ConfigError extends Error {}

// Fingerprint of a finding: stable across runs because it uses the element's label and the
// moment/property that identifies the finding, never DOM indices or measured numbers.
// An `inconclusive` row carries the `check` it could not decide and the hash of that check's own finding.
export const fingerprint = (f) => `${f.kind}:${createHash('sha1').update(`${f.check ?? f.kind}\n${f.element}\n${f.key ?? ''}`).digest('hex').slice(0, 10)}`;

const ID_PATTERN = /^([a-z-]+):[0-9a-f]{10}$/;
const hasReason = (x) => typeof x?.reason === 'string' && x.reason.trim().length > 0;
const rank = (level) => LEVELS.indexOf(level);

// Everything that loosens the audit (bands, tokens, a lowered severity, an ignore) needs a reason.
export const validateConfig = (raw, source = CONFIG_FILE) => {
  const fail = (m) => { throw new ConfigError(`${source}: ${m}`); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('must be a JSON object');
  for (const k of Object.keys(raw)) if (!TOP_KEYS.has(k)) fail(`unknown key "${k}" (allowed: ${[...TOP_KEYS].join(', ')})`);
  const bands = { ...BANDS };
  const bandEntries = Object.entries(raw.bands ?? {}).filter(([g]) => g !== 'reason');
  if (bandEntries.length && !hasReason(raw.bands)) fail('bands needs a non-empty "reason"');
  for (const [g, v] of bandEntries) {
    if (!GESTURES.includes(g)) fail(`bands.${g}: unknown gesture (allowed: ${GESTURES.join(', ')})`);
    if (!Array.isArray(v) || v.length !== 2 || v.some((x) => typeof x !== 'number' || x < 0) || v[0] > v[1]) fail(`bands.${g} must be [min, max] in ms`);
    bands[g] = v;
  }
  const durations = raw.tokens?.durations ?? [];
  if (!Array.isArray(durations) || durations.some((x) => typeof x !== 'number' || x <= 0)) fail('tokens.durations must be an array of positive numbers (ms)');
  if (durations.length && !hasReason(raw.tokens)) fail('tokens needs a non-empty "reason"');
  const severity = {};
  for (const [k, v] of Object.entries(raw.severity ?? {})) {
    if (!KINDS[k]) fail(`severity.${k}: unknown kind`);
    const level = typeof v === 'string' ? v : v?.level;
    if (!LEVELS.includes(level)) fail(`severity.${k}: level must be one of ${LEVELS.join(', ')}`);
    if (rank(level) < rank(KINDS[k].level) && !(typeof v === 'object' && hasReason(v))) fail(`severity.${k}: lowering a kind needs { "level": "${level}", "reason": "..." }`);
    severity[k] = level;
  }
  const ignore = [];
  for (const [i, e] of (raw.ignore ?? []).entries()) {
    if (!e || typeof e !== 'object') fail(`ignore[${i}] must be an object`);
    if (!hasReason(e)) fail(`ignore[${i}] needs a non-empty "reason"`);
    if (e.id !== undefined) {
      const m = ID_PATTERN.exec(String(e.id));
      if (!m || !KINDS[m[1]]) fail(`ignore[${i}].id must be a finding id: a known kind, a colon and 10 hex digits`);
    } else {
      if (!e.kind || !KINDS[e.kind]) fail(`ignore[${i}] needs "id" (a finding id) or a known "kind" with an "element"`);
      if (typeof e.element !== 'string' || !/[^*\s]/.test(e.element)) fail(`ignore[${i}].element must name an element; a bare wildcard would silence the whole kind (lower its severity with a reason instead)`);
    }
    ignore.push({ id: e.id, kind: e.kind, element: e.element, reason: e.reason.trim() });
  }
  return { bands, tokens: { durations }, severity, ignore };
};

export const loadConfig = (path, cwd = process.cwd()) => {
  const file = path ? resolve(cwd, path) : join(cwd, CONFIG_FILE);
  if (!existsSync(file)) {
    if (path) throw new ConfigError(`config file not found: ${file}`);
    return validateConfig({});
  }
  let raw;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new ConfigError(`${file}: not valid JSON (${e instanceof SyntaxError ? 'syntax error; content not shown' : e.code ?? 'unreadable'})`); }
  return validateConfig(raw, file);
};

const globToRegExp = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
const ignoreMatches = (rule, f) => (rule.id ? rule.id === f.id : rule.kind === f.kind && (!rule.element || globToRegExp(rule.element).test(f.element)));

// Raw findings -> final findings: default level, config severity, ignores. Returns
// { findings, suppressed } where suppressed carries the reason of the rule that dropped it.
export const finalize = (raw, config, { devServer = false } = {}) => {
  const findings = [];
  const suppressed = [];
  const seen = new Set();
  // What an inconclusive row could not decide is settled when the check found something.
  const found = new Set(raw.filter((f) => f.kind !== 'inconclusive').map((f) => fingerprint(f).split(':')[1] + f.kind));
  for (const f of raw) {
    if (f.kind === 'inconclusive' && found.has(fingerprint(f).split(':')[1] + f.check)) continue;
    // One finding per fingerprint: several series can describe the same thing (two nodes of one component).
    const id = fingerprint(f);
    if (seen.has(id)) continue;
    seen.add(id);
    let level = f.level ?? KINDS[f.kind].level;
    if (f.kind === 'long-frame' && devServer) level = 'warning';
    level = config.severity[f.kind] ?? level;
    if (level === 'off') continue;
    const full = { id, level, kind: f.kind, ...(f.check ? { check: f.check } : {}), element: f.element, detail: f.detail, ...(f.cadence ? { cadence: f.cadence } : {}) };
    const rule = config.ignore.find((r) => ignoreMatches(r, full));
    if (rule) suppressed.push({ ...full, reason: rule.reason });
    else findings.push(full);
  }
  return { findings, suppressed };
};
