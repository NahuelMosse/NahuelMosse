// A shell line read as the shell reads it, for the guards: segments of words with their quotes resolved, the files each
// segment writes, and the inline scripts it hands to an interpreter. A guard that matches the raw text is dodged by a
// quote inside a word (`ca''rd.md`), a `cd` before a relative path, or a writer it did not list; and it blocks text that
// only mentions a path (a commit message, a heredoc body, a quoted `->`).
import { globSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { native } from './guard-paths.mjs';

// A heredoc body and a PowerShell here-string are text the command receives, not words of the line. What follows the
// delimiter on the header line (`cat <<EOF > file`) stays.
const HEREDOC = /<<-?[ \t]*(['"]?)(\w+)\1([^\n]*)\n(?:[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)|[\s\S]*$)/g;
const HERE_STRING = /@(["'])\r?\n[\s\S]*?\r?\n\1@/g;
export const withoutBodies = (text) => String(text).replace(HEREDOC, (_, __, ___, rest) => ` ${rest}`).replace(HERE_STRING, "''");

// The heredocs whose body a program runs as a script: `bash <<EOF`, `node <<'EOF'`, `python - <<EOF`, `sh -s <<EOF`, and
// `cat <<EOF | bash`. `{ name, body }`; a heredoc into `cat > file` or `git commit -F-` is data and is not listed.
const HEREDOC_BODY = /<<-?[ \t]*(['"]?)(\w+)\1([^\n]*)\n(?:([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)|([\s\S]*)$)/g;
export const heredocScripts = (text) => {
  const found = [];
  const runs = (words) => {
    const { name, args } = commandOf(words);
    const script = SHELLS.has(name) ? !args.some((a) => /^-[A-Za-z]*c[A-Za-z]*$/.test(a)) : NODES.has(name) || isPython(name) || name === 'ruby' || name === 'perl' || PWSH.has(name);
    return script ? name : null;
  };
  for (const m of String(text).matchAll(HEREDOC_BODY)) {
    const before = segmentsOf(m.input.slice(0, m.index).split(/\n|;|&&|\|\|/).pop()).at(-1);
    const piped = m[3].includes('|') ? m[3].split('|').slice(1).flatMap((part) => segmentsOf(part).slice(0, 1)) : [];
    const name = [before, ...piped].map((s) => s && runs(s.words)).find(Boolean);
    if (name) found.push({ name, body: m[4] ?? m[5] ?? '' });
  }
  return found;
};

// Segments of `{ words, redirects }`: `;`, `&&`, `||`, `|`, `&`, parentheses and line breaks outside quotes separate;
// quotes are removed from inside words and leading backslashes from their start (`\rm`, `ca''rd.md`). A redirection is
// `{ op: '>' | '>>', target }`; one to another descriptor (`2>&1`) has no target and an input one (`<`) is not kept.
export const segmentsOf = (text) => {
  const src = withoutBodies(text);
  const segments = [];
  let words = [];
  let redirects = [];
  let word = '';
  let has = false;
  let pending = null;
  const endWord = () => {
    if (!has) return;
    const value = word.replace(/^\\+/, '');
    if (pending === 'skip') pending = null;
    else if (pending) { redirects.push({ op: pending, target: value }); pending = null; }
    else words.push(value);
    word = '';
    has = false;
  };
  const endSegment = () => {
    endWord();
    pending = null;
    if (words.length || redirects.length) segments.push({ words, redirects });
    words = [];
    redirects = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "'") {
      const close = src.indexOf("'", i + 1);
      const end = close < 0 ? src.length : close;
      word += src.slice(i + 1, end); has = true; i = end; continue;
    }
    if (c === '"') {
      let j = i + 1;
      for (; j < src.length && src[j] !== '"'; j++) {
        if (src[j] === '\\' && (src[j + 1] === '"' || src[j + 1] === '\\')) j++;
        word += src[j];
      }
      has = true; i = j; continue;
    }
    if (c === '#' && !has) { while (i < src.length && src[i] !== '\n') i++; i--; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { endWord(); continue; }
    if (c === '\n' || c === ';' || c === '(' || c === ')') { endSegment(); continue; }
    if (c === '|') { if (src[i + 1] === '|') i++; endSegment(); continue; }
    if (c === '>') {
      let n = 1;
      while (src[i + n] === '>') n++;
      // Three or more are a conflict marker a `grep` looks for, not a redirection.
      if (n >= 3) { word += src.slice(i, i + n); has = true; i += n - 1; continue; }
      // A descriptor number or `&`/`*` right before the operator belongs to it.
      if (has && /^(?:\d+|&|\*)$/.test(word)) { word = ''; has = false; }
      endWord();
      i += n - 1;
      if (src[i + 1] === '|') i++;
      if (src[i + 1] === '&') {
        i++;
        if (/\d|-/.test(src[i + 1] ?? '')) { i++; continue; }
      }
      pending = n === 2 ? '>>' : '>';
      continue;
    }
    if (c === '<') {
      endWord();
      while (src[i + 1] === '<') i++;
      pending = 'skip';
      continue;
    }
    if (c === '&') {
      if (src[i + 1] === '>') { endWord(); word = '&'; has = true; continue; }
      if (src[i + 1] === '&') i++;
      endSegment();
      continue;
    }
    word += c; has = true;
  }
  endSegment();
  return segments;
};

// What only wraps the command: `sudo`, `nohup`, `time`, `env -i`, `VAR=x`, `timeout 30`, a group's brace.
const WRAPPERS = new Set(['sudo', 'nohup', 'setsid', 'time', 'exec', 'command', 'builtin', 'nice', 'stdbuf', 'env', '{', '!', 'then', 'do', 'else', 'if', 'while', 'until', 'xargs']);
export const commandOf = (words) => {
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    const name = w.toLowerCase();
    if (/^[A-Za-z_]\w*=/.test(w)) { i++; continue; }
    if (name === 'timeout') { i++; while (i < words.length && words[i].startsWith('-')) i++; i++; continue; }
    if (WRAPPERS.has(name)) { i++; while (i < words.length && /^-/.test(words[i])) i++; continue; }
    break;
  }
  const raw = words[i] ?? '';
  return { name: basename(raw.replaceAll('\\', '/')).toLowerCase().replace(/\.exe$/, ''), args: words.slice(i + 1), at: i };
};

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const NODES = new Set(['node', 'nodejs', 'deno', 'bun']);
const PWSH = new Set(['pwsh', 'powershell']);
const isPython = (name) => /^(?:python[\d.]*|py)$/.test(name);

// The script an interpreter runs from the line itself (`node -e`, `python -c`, `ruby -e`, `perl -e`, `pwsh -c`), or null.
export const inlineScriptOf = ({ name, args }) => {
  const valueAfter = (test) => {
    for (let i = 0; i < args.length; i++) {
      const hit = test(args[i]);
      if (hit === true) return args[i + 1] ?? '';
      if (typeof hit === 'string') return hit;
    }
    return null;
  };
  if (NODES.has(name)) return valueAfter((a) => (/^(?:-e|-p|-pe|--eval|--print)$/.test(a) ? true : a.match(/^--(?:eval|print)=([\s\S]*)$/)?.[1] ?? false));
  if (isPython(name)) return valueAfter((a) => /^-[A-Za-z]*c$/.test(a));
  if (name === 'ruby') return valueAfter((a) => /^-[A-Za-z]*e$/.test(a));
  if (name === 'perl') {
    const parts = [];
    for (let i = 0; i < args.length; i++) if (/^-[A-Za-z]*[eE]$/.test(args[i])) parts.push(args[i + 1] ?? '');
    return parts.length ? parts.join('\n') : null;
  }
  if (PWSH.has(name)) {
    const at = args.findIndex((a) => /^-(?:c|co|com|comm|comma|comman|command)$/i.test(a));
    return at >= 0 ? args.slice(at + 1).join(' ') : null;
  }
  return null;
};

// The script a shell runs from the line (`sh -c '…'`, `cmd /c …`), split in turn by the caller.
export const shellScriptOf = ({ name, args }) => {
  if (SHELLS.has(name)) {
    const at = args.findIndex((a) => /^-[A-Za-z]*c[A-Za-z]*$/.test(a));
    return at >= 0 ? args[at + 1] ?? '' : null;
  }
  if (name === 'cmd') {
    const at = args.findIndex((a) => /^\/[ck]$/i.test(a));
    return at >= 0 ? args.slice(at + 1).join(' ') : null;
  }
  return null;
};

const positional = (args, takesValue = () => false) => {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { out.push(...args.slice(i + 1)); break; }
    if (a.startsWith('-') && a !== '-') { if (takesValue(a)) i++; continue; }
    out.push(a);
  }
  return out;
};
const PS_SWITCHES = /^-(?:append|force|nonewline|whatif|confirm|passthru|noclobber|recurse|container)$/i;
const psValue = (args, names) => {
  for (let i = 0; i < args.length; i++) {
    const m = args[i].match(/^-([A-Za-z]+)(?::(.+))?$/);
    if (m && names.test(m[1])) return m[2] ?? args[i + 1] ?? null;
  }
  return null;
};
const psPositional = (args) => positional(args, (a) => !PS_SWITCHES.test(a));
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

// The files a segment writes, `[{ path, append, via }]`, with paths as written; `cwd` resolves a destination folder.
export const writesOf = ({ words, redirects }, cwd) => {
  const found = redirects.filter((r) => r.target && !/^&/.test(r.target)).map((r) => ({ path: r.target, append: r.op === '>>', via: 'a redirection' }));
  const { name, args } = commandOf(words);
  const add = (paths, via, append = false) => { for (const p of paths) if (p) found.push({ path: p, append, via }); };
  const options = args.filter((a) => a.startsWith('-'));
  if (name === 'tee' || name === 'tee-object') {
    const append = options.some((a) => /^(?:-a|--append|-append)$/i.test(a));
    add(name === 'tee' ? positional(args) : [psValue(args, /^(?:file)?path$|^literalpath$/i) ?? psPositional(args)[0]], `\`${name}\``, append);
  }
  if (name === 'sed' && options.some((a) => /^-[A-Za-z]*i|^--in-place/.test(a))) {
    const scripted = options.some((a) => /^(?:-[A-Za-z]*[ef]|--expression|--file)/.test(a));
    const files = positional(args, (a) => /^(?:-[A-Za-z]*[ef]|--expression|--file|-l)$/.test(a));
    add(scripted ? files : files.slice(1), '`sed -i`');
  }
  if (name === 'perl' && options.some((a) => /^-[A-Za-z]*i/.test(a))) {
    const scripted = options.some((a) => /^-[A-Za-z]*[eE]$/.test(a));
    const files = positional(args, (a) => /^-[A-Za-z]*[eE]$/.test(a));
    add(scripted ? files : files.slice(1), '`perl -i`');
  }
  if (name === 'curl') {
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-o' || a === '--output') add([args[++i]], '`curl -o`');
      else if (/^--output=./.test(a)) add([a.slice(9)], '`curl -o`');
      else if (/^-[A-Za-z]*o.+/.test(a) && !a.startsWith('--')) add([a.replace(/^-[A-Za-z]*?o/, '')], '`curl -o`');
    }
  }
  if (name === 'sort') {
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-o' || a === '--output') add([args[++i]], '`sort -o`');
      else if (/^--output=./.test(a)) add([a.slice(9)], '`sort -o`');
      else if (/^-o./.test(a)) add([a.slice(2)], '`sort -o`');
    }
  }
  if ((name === 'awk' || name === 'gawk') && args.some((a, i) => /^-i$|^--include$/.test(a) ? /^inplace$/.test(args[i + 1] ?? '') : /^-i\s*inplace$|^--include=inplace$/.test(a))) {
    const files = positional(args, (a) => /^(?:-[Fvfi]|--include|--assign|--file|--field-separator)$/.test(a));
    add(args.includes('-f') || args.includes('--file') ? files : files.slice(1), '`awk -i inplace`');
  }
  if (name === 'git') {
    let i = 0;
    for (; i < args.length && args[i].startsWith('-'); i++) if (/^(?:-C|-c|--git-dir|--work-tree|--namespace|--exec-path|--config-env)$/.test(args[i])) i++;
    const sub = args[i];
    const rest = args.slice(i + 1);
    const dash = rest.indexOf('--');
    if (sub === 'checkout' && dash >= 0) add(rest.slice(dash + 1), '`git checkout --`');
    if (sub === 'restore') add(positional(rest, (a) => /^(?:-s|--source|--pathspec-from-file)$/.test(a)), '`git restore`');
    if (sub === 'rm') add(positional(rest, (a) => a === '--pathspec-from-file'), '`git rm`');
    if (sub === 'apply' && !rest.some((a) => /^--(?:check|stat|numstat|summary)$/.test(a))) {
      for (const patch of positional(rest, (a) => /^(?:-p|-C|--directory|--include|--exclude|--whitespace)$/.test(a))) {
        let text = null;
        try { text = readFileSync(resolve(cwd, patch), 'utf8'); } catch { /* not readable */ }
        if (text === null) found.push({ path: patch, unresolved: true, append: false, via: '`git apply`' });
        else add([...text.matchAll(/^(?:\+\+\+|---) (?:[ab]\/)?(\S+)/gm)].map((m) => m[1]).filter((p) => p !== '/dev/null'), '`git apply`');
      }
      if (!rest.some((a) => !a.startsWith('-'))) found.push({ path: '-', unresolved: true, append: false, via: '`git apply`' });
    }
  }
  if (name === 'dd') add(args.filter((a) => a.startsWith('of=')).map((a) => a.slice(3)), '`dd of=`');
  if (name === 'truncate') add(positional(args, (a) => /^(?:-s|-r|--size|--reference)$/.test(a)), '`truncate`');
  if (['cp', 'mv', 'install', 'copy', 'move', 'copy-item', 'move-item', 'cpi', 'mi', 'ln'].includes(name)) {
    const ps = /-item$|^(?:cpi|mi|copy|move)$/.test(name);
    const target = ps ? psValue(args, /^destination$/i) : args.find((a, i) => args[i - 1] === '-t') ?? args.find((a) => a.startsWith('--target-directory='))?.slice(19);
    const plain = ps ? psPositional(args) : positional(args, (a) => /^(?:-t|-m|-o|-g|-S|--suffix)$/.test(a));
    const sources = target ? plain : plain.slice(0, -1);
    // A move takes its source out of its place: that is a write to it as much as to the destination.
    if (['mv', 'move', 'move-item', 'mi'].includes(name)) add([...sources, ...(ps ? [psValue(args, /^(?:literal)?path$/i)] : [])], `\`${name}\``);
    const dest = target ?? (plain.length > 1 ? plain.at(-1) : null);
    if (dest) {
      const folder = Boolean(target && !ps) || /[\\/]$/.test(dest) || isDir(resolve(cwd, dest));
      add(folder ? sources.map((s) => `${dest.replace(/[\\/]+$/, '')}/${basename(s.replaceAll('\\', '/'))}`) : [dest], `\`${name}\``);
    }
  }
  if (['rm', 'unlink', 'rmdir', 'rd', 'del', 'erase', 'remove-item', 'ri'].includes(name)) {
    const ps = /^(?:remove-item|ri|del|erase|rd)$/.test(name);
    add(ps ? [psValue(args, /^(?:literal)?path$/i), ...psPositional(args)] : positional(args), `\`${name}\``);
  }
  if (['set-content', 'add-content', 'out-file', 'sc', 'ac'].includes(name)) {
    const append = ['add-content', 'ac'].includes(name) || options.some((a) => /^-append$/i.test(a));
    add([psValue(args, /^(?:file)?path$|^literalpath$|^pspath$/i) ?? psPositional(args)[0]], 'a PowerShell write', append);
  }
  return found;
};

// `[IO.File]::WriteAllText('x', …)` and its `Append*` siblings, from a segment's raw text: `{ path, append }`, with a null
// path when the first argument is not a literal.
export const fileApiWrites = (text) => [...String(text).matchAll(/\[(?:System\.)?IO\.File\]::(Write|Append)\w*\s*\(\s*(?:(['"])([^'"]*)\2)?/gi)]
  .map((m) => ({ path: m[3] ?? null, append: /^append$/i.test(m[1]), via: '[IO.File]' }));

// Walks a line: every segment with the folder it runs in (`cd`, `pushd`, `Set-Location` move it) and its inline scripts;
// a shell's `-c` script is walked in turn. `visit({ segment, cwd, name, args, script })`.
const CHANGES_DIR = new Set(['cd', 'pushd', 'set-location', 'sl', 'chdir']);
export const walk = (text, cwd, visit, depth = 0) => {
  let where = cwd;
  for (const segment of segmentsOf(text)) {
    const command = commandOf(segment.words);
    if (CHANGES_DIR.has(command.name)) {
      const dir = positional(command.args)[0];
      if (dir && dir !== '-' && !dir.startsWith('~')) where = resolve(where, native(dir));
      continue;
    }
    const inner = depth < 3 ? shellScriptOf(command) : null;
    if (inner !== null) { walk(inner, where, visit, depth + 1); continue; }
    const script = inlineScriptOf(command);
    visit({ segment, cwd: where, name: command.name, args: command.args, script });
    if (script !== null && PWSH.has(command.name) && depth < 3) walk(script, where, visit, depth + 1);
  }
};

// The files a glob in a write target reaches now: braces and `*?[` expanded against the disk from `cwd`, as paths as
// written. A pattern that matches nothing reaches nothing.
export const expandGlob = (pattern, cwd) => {
  try { return globSync(pattern.replaceAll('\\', '/'), { cwd }); } catch { return []; }
};
export const isGlob = (path) => /[*?[]|\{[^{}]*,[^{}]*\}/.test(path);
export const isUnresolved = (path) => /[$`]/.test(path);
