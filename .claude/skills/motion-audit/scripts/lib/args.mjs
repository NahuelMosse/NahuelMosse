// Command-line parsing with validation: unknown flags and invalid numbers are usage errors.
import { DEFAULT_MAX_ELEMENTS } from './constants.mjs';

export class UsageError extends Error {}

// type: 'string' | 'int' | 'number' | 'ratio' | 'bool'; repeat: collected into an array.
const SPEC = {
  only: { type: 'string', repeat: true },
  max: { type: 'int', min: 1 },
  cpu: { type: 'number', min: 1 },
  click: { type: 'string' },
  interrupt: { type: 'bool' },
  interact: { type: 'bool' },
  frames: { type: 'string', repeat: true },
  entrances: { type: 'bool' },
  out: { type: 'string' },
  config: { type: 'string' },
  baseline: { type: 'string' },
  'storage-state': { type: 'string' },
  'wait-for': { type: 'string' },
  'allow-redirect': { type: 'bool' },
  'min-coverage': { type: 'ratio' },
  strict: { type: 'bool' },
  json: { type: 'bool' },
  help: { type: 'bool' },
};

export const USAGE = `motion-audit <url|file> [options]
motion-audit compare <ref.json> <mine.json>

  --only <selector>       audit only elements matching it (repeatable)
  --max <n>               audit at most n controls (default ${DEFAULT_MAX_ELEMENTS})
  --cpu <rate>            throttle the CPU (4 is a mid-range phone)
  --interact              also press and toggle controls for real (denylist applies); default is observe-only
  --click <selector>      record 1.5 s after a real click on it
  --interrupt             with --click: click again half-way
  --frames <selector>     write a contact sheet of its hover and press (repeatable)
  --entrances             report sections that appear without an entrance (info)
  --config <file>         config file (default ./motion-audit.config.json)
  --baseline <report>     ignore findings already present in an earlier report.json
  --storage-state <file>  Playwright storage state (logged-in session)
  --wait-for <selector>   wait for it before auditing (hydration)
  --allow-redirect        audit the page the URL redirects to (a login page is never audited)
  --min-coverage <0-1>    exit 2 when audited/candidates is lower (candidates include controls beyond --max)
  --out <dir>             report and contact sheets (default: a temp directory)
  --strict                warnings fail too
  --json                  print the report as JSON (schemaVersion 1)
  --help                  this text

Exit: 0 clean, 1 findings, 2 could not run or audited nothing.`;

const parseValue = (flag, spec, raw) => {
  if (raw === undefined || raw === null) throw new UsageError(`--${flag} needs a value`);
  if (spec.type === 'string') {
    if (raw === '' || raw.startsWith('--')) throw new UsageError(`--${flag} needs a value, got "${raw}"`);
    return raw;
  }
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(n)) throw new UsageError(`--${flag} must be a number, got "${raw}"`);
  if (spec.type === 'int' && !Number.isInteger(n)) throw new UsageError(`--${flag} must be an integer, got "${raw}"`);
  if (spec.type === 'ratio' && (n < 0 || n > 1)) throw new UsageError(`--${flag} must be between 0 and 1, got "${raw}"`);
  if (spec.min !== undefined && n < spec.min) throw new UsageError(`--${flag} must be at least ${spec.min}, got "${raw}"`);
  return n;
};

export const parseArgs = (argv) => {
  const opts = { only: [], frames: [] };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { positional.push(a); continue; }
    const eq = a.indexOf('=');
    const flag = eq < 0 ? a.slice(2) : a.slice(2, eq);
    const spec = SPEC[flag];
    if (!spec) throw new UsageError(`unknown option --${flag} (see --help)`);
    if (spec.type === 'bool') {
      if (eq >= 0) throw new UsageError(`--${flag} takes no value`);
      opts[flag.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = true;
      continue;
    }
    const raw = eq >= 0 ? a.slice(eq + 1) : argv[++i];
    const value = parseValue(flag, spec, raw);
    const key = flag.replace(/-(\w)/g, (_, c) => c.toUpperCase());
    if (spec.repeat) opts[key].push(value); else opts[key] = value;
  }
  if (opts.interrupt && !opts.click) throw new UsageError('--interrupt needs --click <selector>');
  return { opts, positional };
};
