#!/usr/bin/env node
// review-range.mjs [<card folder | repo>] — read-only.
//
// What a review of the card's diff (the judge's) has to look at: the repo of the card in progress, its base, and the files
// changed since. A review that takes the session's cwd or `main` looks at the wrong code, and stacked branches list the files
// of the cards below as if they were this one's.
// The repo is the one the argument sits in; without it, the one `hookCard` finds from the cwd.
// `--base` prints only the base ref. Exits 2 when there is no card to review.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cardFiles, cardStart, currentCard, hookCard, kitRootOf, rootOf } from './card.mjs';

export const reviewRange = (arg, cwd = process.cwd(), env = process.env) => {
  let root;
  let cardDir;
  if (arg) {
    const path = resolve(cwd, arg);
    root = (existsSync(path) && rootOf(resolve(path, '_'))) || kitRootOf(path);
    // A card folder given is the card; a repo or any other path takes the card in progress.
    cardDir = root && (existsSync(join(path, 'card.md')) ? path : currentCard(root));
  } else {
    const found = hookCard(cwd, env);
    if (found) ({ root, card: cardDir } = found);
  }
  if (!root || !cardDir) return null;
  const base = cardStart(root, cardDir);
  return { root, cardDir, base, files: cardFiles(root, base) };
};

if (process.argv[1] && import.meta.url ===pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const r = reviewRange(args.find((a) => !a.startsWith('--')));
  if (!r) {
    console.error('No card in progress found. Pass the card folder or its repo: review-range.mjs <path>.');
    process.exit(2);
  }
  if (args.includes('--base')) {
    console.log(r.base);
    process.exit(0);
  }
  console.log(`repo: ${r.root}\ncard: ${r.cardDir}\nbase: ${r.base}\ndiff: git -C "${r.root}" diff ${r.base}`);
  console.log(`files (${r.files.length}):`);
  for (const f of r.files) console.log(`  ${f}`);
}
