#!/usr/bin/env node
// help.mjs [tool] — how a kit tool is used, without reading its code.
// help.mjs judge — the tools that look at a card and its screen, in one read: judge-context, `app.mjs probe` (every flag, the
// steps format with an example, where the captures and JSON go), motion-audit and overflow. The plan judge runs none (agents/judge.md).
//
// With no argument, one line per tool; with a name, the comment at the head of that tool, which says what it runs, its
// arguments and its exit codes.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = import.meta.dirname;
const l0 = (lines) => (lines[0].startsWith('#!') ? 1 : 0);
const head = (file) => {
  const lines = readFileSync(join(DIR, file), 'utf8').split('\n');
  const out = [];
  for (const l of lines.slice(l0(lines))) {
    if (!l.startsWith('//')) break;
    out.push(l.replace(/^\/\/ ?/, ''));
  }
  return out;
};

// What the judge needs of the tools, in one read: everything comes from the tools themselves —the flags, the actions and the
// example of the probe are the constants its code parses with; the rest, the head comment of each tool up to its «Measured:»
// line—, so it cannot go stale. Whoever needs these tools reads this, not their code.
const installed = (file) => existsSync(join(DIR, file));
const notInstalled = (tool, profile) => `${tool}: not installed (profile ${profile} off)`;
const judge = async () => {
  const probe = installed('probe.mjs') ? await import('./probe.mjs') : null;
  const probeLines = !probe ? [notInstalled('probe', 'web')] : [
    '=== app.mjs probe: drive the running app, measure, capture ===',
    probe.USAGE,
    ...probe.FLAGS.map((f) => `  ${f.use}${f.repeat ? ' (repeatable)' : ''} — ${f.note}`),
    'steps.json is a JSON list, one action per object; a locator is a Playwright one (css, `text=Save`, `role=button[name="Save"]`):',
    ...Object.values(probe.ACTION_DOC).map((l) => `  ${l}`),
    'example:',
    JSON.stringify(probe.EXAMPLE_STEPS, null, 1).replace(/\n\s*/g, ' ').replace(/^\[ /, '[\n  ').replace(/\}, \{/g, '},\n  {').replace(/ \]$/, '\n]'),
    `output: per step and width \`${probe.DEFAULT_OUT}/w<width>-step<NN>.png\` and \`.json\`; the JSON has ${probe.RECORD_FIELDS}.`,
    'A step that fails is written with its `error` and the run exits 1. Contrast: `--contrast "button,.error"` before writing a script to measure colors.',
  ];
  const usage = (file) => { const lines = head(file); const end = lines.findIndex((l) => l.startsWith('Measured')); return (end < 0 ? lines : lines.slice(0, end)).join('\n').trimEnd(); };
  console.log([
    '=== help.mjs judge · the kit tools that look at a card and its screen; do not read their code ===',
    'The plan judge runs no tool: it reads card.md, risk.json and the questions of its lenses in reference/lenses.md, and writes judge.md.',
    'Run from the root of the repo of the card. The app is shared: `APP_URL` in your prompt, or `url` in `.validation/app.json`; start no other.',
    'Playwright is the repo\'s, or the one at `KIT_PLAYWRIGHT_ROOT`. Your own files (scripts, captures, logs) go in `.validation/judge/`.',
    '',
    '=== what you read of the card, in one call ===',
    usage('judge-context.mjs'),
    '',
    ...probeLines,
    '',
    ...(installed('motion-audit.mjs') ? ['=== motion-audit.mjs ===', usage('motion-audit.mjs')] : [notInstalled('motion-audit', 'web')]),
    '',
    ...(installed('overflow.mjs') ? ['=== overflow.mjs ===', usage('overflow.mjs')] : [notInstalled('overflow', 'web')]),
  ].join('\n'));
};

const name = process.argv[2]?.replace(/\.mjs$/, '');
if (name === 'judge') {
  await judge();
  process.exit(0);
}
const tools = readdirSync(DIR).filter((f) => f.endsWith('.mjs')).sort();
if (!name) {
  for (const f of tools) console.log(head(f)[0] ?? f);
  console.log('\nnode .claude/tools/help.mjs <tool> — how one is used');
  console.log('node .claude/tools/help.mjs judge — judge-context, probe, motion-audit and overflow, in one read (the plan judge runs none)');
  process.exit(0);
}
if (!tools.includes(`${name}.mjs`)) {
  console.error(`There is no ${name}.mjs. Tools: ${tools.map((f) => f.replace('.mjs', '')).join(', ')}`);
  process.exit(1);
}
console.log(head(`${name}.mjs`).join('\n'));
