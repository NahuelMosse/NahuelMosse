// importers.mjs — the code files of a repo that import a given file (by its name, with no extension), tests and the kit aside.
// risk.mjs --diff uses it to tell shared code from a file only its own module reads.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IS_CODE, IS_TEST, git } from './card.mjs';

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const importersOf = (root, file) => {
  const stem = escape(file.split('/').pop().replace(/\.[^.]+$/, ''));
  const js = new RegExp(`(?:from|import|require\\()\\s*['"][^'"]*/${stem}(?:\\.[cm]?[jt]sx?)?['"]`);
  const py = new RegExp(`^\\s*(?:from|import)\\s+[\\w.]*\\b${stem}\\b`, 'm');
  const listed = [git(root, ['ls-files']).stdout ?? '', git(root, ['ls-files', '--others', '--exclude-standard']).stdout ?? ''].join('\n');
  return [...new Set(listed.split('\n').map((f) => f.trim()).filter(Boolean))]
    .filter((f) => f !== file && IS_CODE.test(f) && !IS_TEST.test(f) && !/^(specs|\.claude)\//.test(f))
    .filter((f) => {
      try { const text = readFileSync(join(root, f), 'utf8'); return js.test(text) || py.test(text); } catch { return false; }
    });
};
