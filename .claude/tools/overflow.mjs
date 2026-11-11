#!/usr/bin/env node
// overflow.mjs [<url>] [--only <selector>]… [--pseudo 1.4]
// Run from the root of the repo of the card; Playwright is found there or at KIT_PLAYWRIGHT_ROOT.
//
// Whether any text overflows its box, measured in the browser: every text element —inside the
// `--only` selectors, or the whole page— at 320, 390 and 1280 px wide, first with the real text and
// then with pseudo-localized text (accents, and the text lengthened by the `--pseudo` factor, 1.4 by
// default: translations are longer than the language the screen was drawn in). A finding is an
// element whose content is wider or taller than its box with no scroll declared, text clipped with
// no intentional ellipsis, or a page that scrolls sideways.
// Exits 0 if nothing overflows, 1 with one line per finding, 2 if it could not run.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const WIDTHS = [320, 390, 1280];

// Accented, and longer by `factor`: the extra characters repeat the start of the word, so the text
// still wraps at the same places a longer real word would.
export const pseudo = (text, factor = 1.4) => {
  const accented = text.replace(/[aeiouAEIOU]/g, (c) => ({ a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' }[c]));
  const extra = Math.max(0, Math.ceil(accented.length * (factor - 1)));
  return accented + accented.slice(0, extra);
};

// Playwright from the repo the tool runs in; failing that, from KIT_PLAYWRIGHT_ROOT (the kit's own tests,
// a machine where Playwright lives in another repo). The output always goes under the cwd.
const playwright = () => {
  for (const root of [process.cwd(), process.env.KIT_PLAYWRIGHT_ROOT].filter(Boolean)) {
    const req = createRequire(join(root, 'package.json'));
    for (const name of ['playwright', '@playwright/test']) {
      try { return req(name); } catch {}
    }
  }
  return null;
};

// Runs in the page: what overflows among the text elements of `roots`.
const measure = ({ selectors }) => {
  const roots = selectors.length ? selectors.flatMap((s) => [...document.querySelectorAll(s)]) : [document.body];
  const seen = new Set();
  const found = [];
  const name = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : ''}`;
  const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  // A box that does not clip spills whole lines onto what follows it; less than half a line is the ink of
  // a display face set with a line-height under 1, which overlaps nothing.
  const spill = (cs) => (Number.parseFloat(cs.lineHeight) || Number.parseFloat(cs.fontSize) * 1.2) / 2;
  for (const root of roots) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (seen.has(el)) continue;
      const cs = getComputedStyle(el);
      const scrollsX = /auto|scroll/.test(cs.overflowX);
      const scrollsY = /auto|scroll/.test(cs.overflowY);
      const clips = /hidden|clip/.test(cs.overflowX) || /hidden|clip/.test(cs.overflowY);
      // A box that clips is measured whichever node holds the text (a span inside a button): its own
      // scroll size includes what its children push out.
      const clipsText = (clips || cs.textOverflow === 'ellipsis') && el.textContent.trim();
      if (!hasText(el) && !clipsText) continue;
      seen.add(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const ellipsis = cs.textOverflow === 'ellipsis' || /-webkit-line-clamp|line-clamp/.test(el.getAttribute('style') ?? '') || cs.getPropertyValue('-webkit-line-clamp') !== 'none' && cs.getPropertyValue('-webkit-line-clamp') !== '';
      const label = `${name(el)} “${el.textContent.trim().slice(0, 30)}”`;
      if (el.scrollWidth > el.clientWidth + 1 && !scrollsX) {
        found.push(`${label}: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}${clips && !ellipsis ? ' (text cut off, no ellipsis)' : ''}`);
      } else if (el.scrollHeight > el.clientHeight + 1 && !scrollsY && (clips || el.scrollHeight - el.clientHeight >= spill(cs))) {
        found.push(`${label}: scrollHeight ${el.scrollHeight} > clientHeight ${el.clientHeight}${clips && !ellipsis ? ' (text cut off, no ellipsis)' : ''}`);
      }
    }
  }
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) found.push(`page: scrolls sideways (${doc.scrollWidth} > ${doc.clientWidth})`);
  return found;
};

// Runs in the page: lengthens the text nodes inside the roots.
const lengthen = ({ selectors, factor, source }) => {
  const make = new Function(`return ${source}`)();
  const roots = selectors.length ? selectors.flatMap((s) => [...document.querySelectorAll(s)]) : [document.body];
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement && /^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)) continue;
      if (n.textContent.trim()) n.textContent = make(n.textContent, factor);
    }
  }
};

export const check = async (url, { selectors = [], factor = 1.4 } = {}) => {
  const pw = playwright();
  if (!pw) return { error: 'Playwright is not installed in this repo: `npm i -D playwright` and `npx playwright install chromium`.' };
  const browser = await pw.chromium.launch({ channel: 'chromium' }).catch(() => pw.chromium.launch());
  const problems = [];
  try {
    for (const width of WIDTHS) {
      for (const mode of ['real text', 'pseudo-localized']) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
        const response = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
        // An error page is not the page to measure: nothing was audited.
        if (response && response.status() >= 400) throw new Error(`${url} answered HTTP ${response.status()}: the page did not load, nothing was measured.`);
        await page.waitForTimeout(400);
        if (mode !== 'real text') await page.evaluate(lengthen, { selectors, factor, source: pseudo.toString() });
        for (const f of await page.evaluate(measure, { selectors })) problems.push(`${width} px · ${mode} · ${f}`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  return { problems };
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
  const url = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? process.env.APP_URL;
  if (!url || args.includes('--help')) {
    console.log('overflow.mjs [<url>] [--only <selector>]… [--pseudo 1.4]   (without <url>: APP_URL of the environment)');
    process.exit(url ? 0 : 2);
  }
  const factor = Number(opt('--pseudo')[0] ?? 1.4);
  if (!(factor >= 1)) { console.error('--pseudo is a factor of 1 or more.'); process.exit(2); }
  const r = await check(url, { selectors: opt('--only'), factor }).catch((e) => ({ error: e.message }));
  if (r.error) { console.error(r.error); process.exit(2); }
  if (!r.problems.length) { console.log(`No text overflows at ${WIDTHS.join(', ')} px, with real and pseudo-localized text.`); process.exit(0); }
  console.log(`${r.problems.length} to fix:`);
  for (const p of r.problems) console.log(`- ${p}`);
  process.exit(1);
}
