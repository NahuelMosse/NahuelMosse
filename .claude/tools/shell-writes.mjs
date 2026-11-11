// What a shell line does to the production files of the repo, read from its text: the segments it runs
// (`commandsOf`) and the files it writes (`shellWrites`). guard-shell.mjs refuses a subagent's line that writes
// production code, and compares a verification line with the plan, through the same segments.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { IS_CODE, isProductionPath, relativeTo } from './card.mjs';

// The commands a shell line runs, one per segment: heredoc bodies are text, not commands; `;`, `&&`, `||`, `|`, a
// single `&` and line breaks outside quotes separate, parentheses and braces group nothing here; a redirection's
// `&` (`2>&1`, `&>`) is not a separator. A prefix that only wraps (`nohup`, `time`, `timeout N`, `VAR=x`, `env`) is
// removed, and what `sh -c '…'` or `cmd /c "…"` runs is split in turn.
const WRAPPER = /^(?:(?:nohup|setsid|time|exec|command|stdbuf(?:\s+-\w+)*|nice(?:\s+-n\s*\d+)?|env(?:\s+-\w+)*)\s+|timeout(?:\s+-\S+)*\s+\d+[smhd]?\s+|[A-Za-z_]\w*=\S*\s+)+/;
const SHELL_C = /^(?:\S*[\\/])?(?:sh|bash|zsh|dash)(?:\.exe)?\s+(?:-\w+\s+)*-\w*c\s+(["'])([\s\S]*)\1$|^cmd(?:\.exe)?\s+\/[cC]\s+(["']?)([\s\S]*?)\3$/;
const HEREDOC = /<<-?\s*(['"]?)(\w+)\1([^\n]*)\n([\s\S]*?)\n\s*\2[ \t]*(?=\n|$)/g;
export const commandsOf = (text, depth = 0) => {
  const bare = text.replace(HEREDOC, (_, __, ___, rest) => rest);
  const parts = [];
  let current = '';
  let quote = '';
  for (let i = 0; i < bare.length; i++) {
    const ch = bare[i];
    if (quote) { current += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    const redirect = ch === '&' && (bare[i - 1] === '>' || bare[i + 1] === '>');
    if (ch === ';' || ch === '\n' || ch === '|' || (ch === '&' && !redirect)) { parts.push(current); current = ''; continue; }
    current += /[(){}]/.test(ch) ? ' ' : ch;
  }
  parts.push(current);
  return parts.flatMap((part) => {
    const one = part.trim().replace(WRAPPER, '').trim();
    const shell = depth < 3 ? one.match(SHELL_C) : null;
    return shell ? commandsOf(shell[2] ?? shell[4], depth + 1) : [one];
  }).filter(Boolean);
};

// What a script does to write a file, in Node, Python's neighbours and PowerShell.
export const WRITERS = /\b(?:(?:write|append)File(?:Sync)?|copyFile(?:Sync)?|renameSync|fs\.rename|fs\.write\w*|createWriteStream|WriteAll(?:Text|Lines|Bytes)|Set-Content|Add-Content|Out-File)\b/;
const INTERPRETER = /^(?:node|nodejs|deno|bun|tsx|ts-node|python3?|py|pwsh|powershell)(?:\.exe)?(?=\s|$)/i;
// The files whose change is a change of the product: code and what a screen is made of.
const SOURCE = new RegExp(`${IS_CODE.source.slice(0, -2)}|html?|css|scss|sass|less|vue|svelte|sql|sh)$`, 'i');
export const isSourceFile = (path) => SOURCE.test(path);
const MAX_SCRIPT = 200_000;
// A module a script imports is not a file it writes, and the kit's own tools write only their reports. Measured: 14 refusals
// of risk.mjs, required.mjs and verify.mjs, which import `./card.mjs` and spawn `once.mjs` by name.
const KIT_TOOL = /[\\/]\.claude[\\/](?:tools|hooks)[\\/][^\\/]+$/;
const IMPORTS = /\bimport\s*(?:[\w*{}\s,]+from\s*)?(["'])[^"'\n]+\1|\b(?:import|require)\s*\(\s*(["'])[^"'\n]+\2\s*\)/g;

// A script HEAD holds unmodified is the project's own code, reviewed with the rest; one that is new, only staged or
// changed is read for the writes it makes.
const tracked = (file) => {
  const opts = { cwd: dirname(file), stdio: 'ignore', timeout: 5000 };
  return spawnSync('git', ['cat-file', '-e', `HEAD:./${basename(file)}`], opts).status === 0 &&
    spawnSync('git', ['diff', '--quiet', 'HEAD', '--', basename(file)], opts).status === 0;
};
const unquote = (token) => token.replace(/^["'`]|["'`]$/g, '');
const wordsOf = (segment) => [...segment.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
const maskQuoted = (segment) => segment.replace(/"[^"]*"|'[^']*'/g, (q) => `${q[0]}${'_'.repeat(q.length - 2)}${q[0]}`);

// `{ root, cwd, tool }`: the production file a path token names, relative to the repo, or null.
const sourceIn = ({ root, cwd }, token) => {
  const t = unquote(token);
  if (!t || t.startsWith('-') || !/\.[A-Za-z0-9]+$/.test(t)) return null;
  const abs = resolve(cwd, t);
  return SOURCE.test(abs) && isProductionPath(root, abs) ? relativeTo(root, abs) : null;
};

// The production files a shell line writes, `{ files, via }` (empty `files` when it writes none, or none it can read
// from the text): `sed -i`, `perl -i`, a redirection or `tee` onto one, and a script —`node -e`, a script file it runs,
// a heredoc— that calls a write function with a production path in it. A path it only reads, a log, a test, a document
// and anything under a dot folder (`.validation/`) are not production.
export const shellWrites = (command, { root, cwd, tool = 'Bash' }) => {
  const ctx = { root, cwd };
  const files = new Set();
  const via = new Set();
  const take = (found, how) => { for (const f of found) if (f) { files.add(f); via.add(how); } };
  const quotedPaths = (text) => [...text.matchAll(/["'`]([^"'`\s]+\.[A-Za-z0-9]+)["'`]/g)].map((m) => sourceIn(ctx, m[1]));
  for (const m of command.matchAll(HEREDOC)) {
    const header = command.slice(0, m.index).split('\n').at(-1).trim();
    if (!/^(?:\S+\s+)*git\s/.test(header) && WRITERS.test(m[4])) take(quotedPaths(m[4]), 'a script in a heredoc');
  }
  let where = cwd;
  for (const segment of commandsOf(command)) {
    const cd = segment.match(/^cd\s+(\S+)$/);
    if (cd) { where = resolve(where, unquote(cd[1])); continue; }
    const here = { root, cwd: where };
    const masked = maskQuoted(segment);
    for (const m of masked.matchAll(/(?<![\d&<>])>>?(?!&)\s*(\S+)/g))
      take([sourceIn(here, segment.slice(m.index + m[0].length - m[1].length, m.index + m[0].length))], 'a redirection');
    if (/^tee\b/.test(segment)) take(wordsOf(segment).slice(1).map((w) => sourceIn(here, w)), '`tee`');
    if (/^sed\b/.test(segment) && /\s(?:-[A-Za-z]*i|--in-place)/.test(masked)) take(wordsOf(segment).map((w) => sourceIn(here, w)), '`sed -i`');
    if (/^perl\b/.test(segment) && /\s-[A-Za-z]*i/.test(masked)) take(wordsOf(segment).map((w) => sourceIn(here, w)), '`perl -i`');
    if (/^(?:Set-Content|Add-Content|Out-File|Tee-Object)\b/i.test(segment)) take(wordsOf(segment).map((w) => sourceIn(here, w)), 'a PowerShell write');
    if (INTERPRETER.test(segment) || tool === 'PowerShell') {
      let text = segment;
      for (const w of wordsOf(segment).filter((x) => /\.(?:[cm]?[jt]s|py|ps1)$/.test(x))) {
        const file = resolve(where, unquote(w));
        if (KIT_TOOL.test(file) || (existsSync(file) && tracked(file))) continue;
        try { if (existsSync(file)) text += `\n${readFileSync(file, 'utf8').slice(0, MAX_SCRIPT).replace(IMPORTS, '')}`; } catch { /* unreadable: the text it has */ }
      }
      if (WRITERS.test(text)) take(quotedPaths(text), 'a script that writes files');
    }
  }
  return { files: [...files], via: [...via] };
};
