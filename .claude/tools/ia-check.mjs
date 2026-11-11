#!/usr/bin/env node
// ia-check.mjs specs/<card> [<url>]
// Run from the root of the repo of the card; Playwright is found there or at KIT_PLAYWRIGHT_ROOT. Without <url>: APP_URL.
//
// Whether a product screen shows what `## Information` of the card says, measured in the browser at 1440x900 and 390x844 on load,
// with no interaction. A field is found by its label as the card writes it (case and a trailing colon aside). Findings:
//   - a glance or detail field whose label is not on the page;
//   - a glance field of D1 (the main decision) outside the first viewport; another glance field not visible without interaction;
//   - an audit field in the first viewport;
//   - a glance value that does not stand out from its label (not larger, heavier or of more contrast, or smaller), or that is cut;
//   - a `signal:` state of the card shown without its tone (red for danger; amber or red for warning, in its text, background,
//     border or an icon beside it), a value past the `limit:` of its field in plain text, and, when any of them is on the page,
//     none in the first viewport;
//   - fields not grouped by decision: under 70 % of the visible fields have, as their nearest field, one of the same decision;
//   - at 1024 px or wider, on a page taller than two viewports: scrolled to the end, no glance field of D1 is still in view (the
//     key facts stay in a header that sticks, as Salesforce's highlights panel, the Dynamics 365 header and Fiori's object page do);
//   - a label-value list (`dl`) whose values, beside their labels, start at more than one x: the eye loses the column;
//   - under 640 px, a control (button, select, a text input, summary, role=button) under 44 px tall;
//   - scrolled to the middle of the page, bars that stay on screen (fixed, or sticky and stuck, as wide as most of the viewport)
//     covering more than 35 % of it: on a phone the reading area is what is left;
//   - disclosures (`details`) nested more than two deep, and a table inside a table;
//   - the information rows of design-checks.mjs: numbers right-aligned in their cells, no table built of divs, data in the first
//     viewport, one spacing scale.
// Exits 0 if nothing is found, 1 with one line per finding, 2 if it could not run.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCard } from './card-doc.mjs';
import { TONES, breaches, informationOf, numberOf } from './information.mjs';
import { INFORMATION_ROWS, informationRows, measureProduct } from './design-checks.mjs';

export const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
export const GROUPED = 0.7;
export const KEPT_FROM = 1024;
export const TOUCH_MIN = 44;
export const TOUCH_BELOW = 640;
export const COVER_MAX = 0.35;
export const DEPTH_MAX = 2;

const playwright = () => {
  for (const root of [process.cwd(), process.env.KIT_PLAYWRIGHT_ROOT].filter(Boolean)) {
    const req = createRequire(join(root, 'package.json'));
    for (const name of ['playwright', '@playwright/test']) {
      try { return req(name); } catch {}
    }
  }
  return null;
};

// Runs in the page: where each label is, whether it is seen on load, how its value weighs against it and its tone; and where
// each signal state of the card is shown, and in which tone.
export const locate = ({ labels, words = [] }) => {
  const norm = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().replace(/[:：]\s*$/, '').toLowerCase();
  const els = [...document.body.querySelectorAll('*')].filter((e) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(e.tagName));
  const seen = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (e.checkVisibility ? e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true); };
  // Any computed color (rgb, oklab or color() from a color-mix) as sRGB 0-255 and alpha, read off one painted pixel.
  const ink = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const painted = new Map();
  const rgba = (c) => {
    if (!painted.has(c)) {
      ink.clearRect(0, 0, 1, 1); ink.fillStyle = '#000'; ink.fillStyle = c; ink.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ink.getImageData(0, 0, 1, 1).data;
      painted.set(c, [r, g, b, a / 255]);
    }
    return painted.get(c);
  };
  const lum =([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const behind = (e) => { for (let p = e; p; p = p.parentElement) { const c = rgba(getComputedStyle(p).backgroundColor); if (c[3] > 0.5) return c; } return [255, 255, 255, 1]; };
  const contrast = (e) => { const a = lum(rgba(getComputedStyle(e).color)); const b = lum(behind(e)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const style = (e) => { const s = getComputedStyle(e); return { size: parseFloat(s.fontSize), weight: Number(s.fontWeight) || 400, contrast: contrast(e) }; };
  const leaf = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  // A value is cut when it, or the box that holds it, clips text wider than itself (an ellipsis, or overflow hidden).
  const cut = (v) => [v, v.parentElement].some((e) => e && e.clientWidth > 0 && getComputedStyle(e).overflowX !== 'visible' && e.scrollWidth > e.clientWidth + 1);
  // The tone an element is shown in: red (danger) or amber (warning) in its text, its background, a border or an icon beside it.
  const tones = (e) => {
    const hue = (c, bg) => {
      const [r, g, b, a] = rgba(c).map((v, i) => (i < 3 ? v / 255 : v));
      if (a < 0.1) return null;
      const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2; const d = max - min;
      const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      if (s < 0.3 || l < 0.12 || l > (bg ? 0.985 : 0.85)) return null;
      const h = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
      const deg = (h + 360) % 360;
      return deg >= 330 || deg < 18 ? 'danger' : deg < 65 ? 'warning' : null;
    };
    const h0 = e.getBoundingClientRect().height;
    const chain = [];
    for (let a = e, up = 0; a && a !== document.body && up < 4; a = a.parentElement, up++) { if (up && a.getBoundingClientRect().height > Math.max(3 * h0, h0 + 48)) break; chain.push(a); }
    const icons = [...(e.parentElement?.children ?? [])].filter((x) => x !== e && (!x.textContent.trim() || /^[^\p{L}\p{N}]{1,2}$/u.test(x.textContent.trim())));
    const out = new Set();
    // The element, the boxes around it, an icon beside it, an svg inside, and the mark a ::before or ::after draws (a dot, a bar).
    for (const x of [...chain, ...icons, ...e.querySelectorAll('svg')]) {
      const marks = [null, '::before', '::after'].map((p) => getComputedStyle(x, p)).filter((s, i) => !i || (s.content !== 'none' && s.display !== 'none'));
      for (const s of marks) {
        const found = [hue(s.color), hue(s.backgroundColor, true), x instanceof SVGElement ? hue(s.fill) : null,
          ...['Top', 'Right', 'Bottom', 'Left'].map((side) => (parseFloat(s[`border${side}Width`]) > 0 ? hue(s[`border${side}Color`]) : null))];
        for (const t of found) if (t) out.add(t);
      }
    }
    return [...out];
  };
  const valueOf = (l) => {
    if (l.matches('th,[role=columnheader],[role=rowheader]') || l.closest('th,[role=columnheader]')) return null;
    const lr = l.getBoundingClientRect();
    for (let a = l.parentElement, up = 0; a && a !== document.body && up < 3; a = a.parentElement, up++) {
      const cands = [...a.querySelectorAll('*')].filter((e) => e !== l && !l.contains(e) && !e.contains(l) && leaf(e) && seen(e));
      if (!cands.length) continue;
      const dist = (e) => { const r = e.getBoundingClientRect(); return Math.hypot(Math.max(0, r.left - lr.right, lr.left - r.right), Math.max(0, r.top - lr.bottom, lr.top - r.bottom)); };
      const v = cands.sort((x, y) => dist(x) - dist(y))[0];
      const r = v.getBoundingClientRect();
      return { text: v.textContent.trim().slice(0, 40), ...style(v), cut: cut(v), tones: tones(v), first: r.top < innerHeight && r.bottom > 0 };
    }
    return null;
  };
  const inView = (r) => r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0;
  const fields = labels.map((label) => {
    const want = norm(label);
    const hits = els.filter((e) => norm(e.textContent) === want || norm(e.getAttribute('aria-label')) === want)
      .filter((e, _, all) => !all.some((o) => o !== e && e.contains(o) && norm(o.textContent) === want));
    if (!hits.length) return { label, found: false };
    const shown = hits.filter(seen);
    const e = shown[0] ?? hits[0];
    const r = e.getBoundingClientRect();
    const visible = shown.length > 0;
    const first = visible && inView(r);
    return { label, found: true, visible, first, top: Math.round(r.top + scrollY), box: { left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY }, own: visible ? style(e) : null, value: visible ? valueOf(e) : null };
  });
  // Each visible element whose whole text is a signal state (marks around it aside), outside controls, options and headers.
  const bare = (t) => norm(t).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const wanted = new Map(words.map((w) => [bare(w), w]));
  const signals = [];
  for (const e of els) {
    const word = wanted.get(bare(e.textContent));
    if (!word || !seen(e) || e.closest('button,select,option,label,th,input,textarea,[role=tab],[role=option],[role=columnheader],[aria-hidden=true]')) continue;
    if ([...e.children].some((c) => bare(c.textContent) === bare(word))) continue;
    const r = e.getBoundingClientRect();
    signals.push({ word, tones: tones(e), top: Math.round(r.top + scrollY), first: inView(r) });
  }
  return { fields, signals };
};

// Runs in the page, scrolled to its middle: the label-value lists whose values do not share a column, the controls too
// short for a thumb, and how much of the viewport the bars that stay on screen cover.
export const measurePage = ({ touchMin, touchBelow }) => {
  const seen = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const name = (e) => (e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || e.getAttribute('name') || e.tagName.toLowerCase()).replace(/\s+/g, ' ').trim().slice(0, 30);
  const tag = (e) => (typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/)[0]}` : e.tagName.toLowerCase());
  // Starting points of a list of x values, 2 px apart at least.
  const starts = (xs) => xs.sort((a, b) => a - b).filter((x, i, all) => !i || x - all[i - 1] > 2);
  const ragged = [];
  for (const dl of document.querySelectorAll('dl')) {
    if (!seen(dl)) continue;
    // Pairs whose value sits beside its label, by the column of the label: a list laid out in two columns is not ragged.
    const columns = new Map();
    for (const dt of dl.querySelectorAll('dt')) {
      let dd = dt.nextElementSibling;
      while (dd && dd.tagName !== 'DD' && dd.tagName !== 'DT') dd = dd.nextElementSibling;
      if (!dd || dd.tagName !== 'DD' || !seen(dt) || !seen(dd)) continue;
      const a = dt.getBoundingClientRect(); const b = dd.getBoundingClientRect();
      if (b.left < a.right - 1 || b.top >= a.bottom || b.bottom <= a.top) continue;
      const key = [...columns.keys()].find((x) => Math.abs(x - a.left) <= 2) ?? a.left;
      columns.set(key, [...(columns.get(key) ?? []), b.left]);
    }
    for (const lefts of columns.values()) {
      const points = starts([...lefts]);
      if (lefts.length >= 3 && points.length > 1) { ragged.push({ label: name(dl.querySelector('dt')), pairs: lefts.length, columns: points.length, spread: Math.round(points.at(-1) - points[0]) }); break; }
    }
  }
  const small = innerWidth >= touchBelow ? [] : [...document.querySelectorAll('button, select, summary, [role=button], input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range])')]
    .filter((e) => seen(e) && !e.closest('[inert],[aria-hidden=true]') && e.getBoundingClientRect().height < touchMin - 0.5)
    .map((e) => ({ name: name(e), height: Math.round(e.getBoundingClientRect().height) }));
  const positioned = (e) => ['fixed', 'sticky'].includes(getComputedStyle(e).position);
  const stuck = (e) => {
    const s = getComputedStyle(e); const r = e.getBoundingClientRect();
    if (s.position === 'fixed') return true;
    const top = parseFloat(s.top); const bottom = parseFloat(s.bottom);
    return (!Number.isNaN(top) && Math.abs(r.top - top) < 1.5) || (!Number.isNaN(bottom) && Math.abs(innerHeight - r.bottom - bottom) < 1.5);
  };
  const bars = [...document.body.querySelectorAll('*')].filter((e) => positioned(e) && seen(e) && e.getBoundingClientRect().width >= innerWidth * 0.6 && stuck(e))
    .filter((e) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) if (positioned(a)) return false; return true; });
  const spans = bars.map((e) => { const r = e.getBoundingClientRect(); return [Math.max(0, r.top), Math.min(innerHeight, r.bottom)]; }).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let covered = 0; let end = 0;
  for (const [a, b] of spans) if (b > end) { covered += b - Math.max(a, end); end = b; }
  const depth = Math.max(0, ...[...document.querySelectorAll('details')].map((d) => { let n = 0; for (let a = d; a; a = a.parentElement?.closest('details')) n++; return n; }));
  return { ragged, small, cover: covered / innerHeight, bars: bars.map(tag), depth, nestedTables: document.querySelectorAll('table table').length };
};

// Pure: the findings of one viewport from what `locate` read for the fields of `## Information`.
export const findings = (fields, located, viewport, main = 'D1') => {
  const at = `${viewport.width} px`;
  const out = [];
  const name = (f) => `«${f.label}» (${f.tier}${f.serves.length ? `, ${f.serves.join(',')}` : ''})`;
  const by = new Map(located.map((l) => [l.label, l]));
  for (const f of fields) {
    const l = by.get(f.label);
    if (!l) continue;
    if (f.tier !== 'audit' && !l.found) { out.push(`${at} · ${name(f)} is not on the page: the screen labels it as the card does`); continue; }
    if (f.tier === 'glance') {
      if (f.serves.includes(main) && !l.first) out.push(`${at} · ${name(f)} is ${l.visible ? `below the first viewport (at ${l.top} px, the viewport ends at ${viewport.height})` : 'not visible on load'}: the main decision is read without scrolling`);
      else if (!f.serves.includes(main) && !l.visible) out.push(`${at} · ${name(f)} is not visible without interaction: a glance field is never behind a tab, a disclosure or a drawer`);
      const v = l.value; const o = l.own;
      if (v && o) {
        const smaller = v.size < o.size - 0.5;
        const stands = v.size > o.size + 0.5 || v.weight > o.weight || v.contrast > o.contrast * 1.1;
        if (smaller || !stands) out.push(`${at} · ${name(f)}: its value «${v.text}» (${v.size}px ${v.weight}) does not stand out from its label (${o.size}px ${o.weight}) · the value is larger, heavier or of more contrast, never smaller`);
      }
      if (v?.cut) out.push(`${at} · ${name(f)}: its value «${v.text}» is cut · a key value is read whole: give it the room, let it wrap or shorten its label, never an ellipsis`);
    }
    if (f.tier === 'audit' && l.found && l.first) out.push(`${at} · ${name(f)} is in the first viewport: audit data stays out of the first view (below, or one interaction away)`);
  }
  // Grouped by decision: the nearest visible field of each one serves one of its decisions.
  const placed = fields.filter((f) => f.serves.length && by.get(f.label)?.visible);
  const decisions = new Set(placed.flatMap((f) => f.serves));
  if (placed.length >= 4 && decisions.size >= 2) {
    const gap = (a, b) => Math.hypot(Math.max(0, a.left - b.right, b.left - a.right), Math.max(0, a.top - b.bottom, b.top - a.bottom));
    const strays = placed.filter((f) => {
      const near = placed.filter((g) => g !== f).sort((g, h) => gap(by.get(f.label).box, by.get(g.label).box) - gap(by.get(f.label).box, by.get(h.label).box))[0];
      return !near.serves.some((d) => f.serves.includes(d));
    });
    const share = 1 - strays.length / placed.length;
    if (share < GROUPED) out.push(`${at} · fields not grouped by decision: ${Math.round(share * 100)}% have a field of their own decision as the nearest (min ${Math.round(GROUPED * 100)}%) · strays: ${strays.slice(0, 5).map((f) => `«${f.label}»`).join(', ')}`);
  }
  return out;
};

// Pure: scrolled to the end of a long page, at least one glance field of the main decision is still in view.
export const kept = (fields, located, viewport, main = 'D1') => {
  const keys = fields.filter((f) => f.tier === 'glance' && f.serves.includes(main));
  if (!keys.length || located.some((l) => keys.some((f) => f.label === l.label) && l.first)) return [];
  return [`${viewport.width} px · scrolled to the end, no glance field of ${main} is in view (${keys.map((f) => `«${f.label}»`).join(', ')}): on a long record the key facts stay in a header that sticks`];
};

// Pure: what blocks the decision is shown as such. Each signal state in its tone (a warning may be shown as danger, never plain),
// each value past its limit toned, and on load one of them in the first viewport: the user came to find it.
export const signalFindings = (info, { fields: located, signals: shown }, viewport) => {
  const at = `${viewport.width} px`;
  const out = [];
  const color = { danger: 'red', warning: 'amber' };
  const toned = (want, got) => (want === 'danger' ? got.includes('danger') : got.some((t) => TONES.includes(t)));
  const blocking = [];
  for (const s of info.signals.filter((x) => TONES.includes(x.tone))) {
    const mine = shown.filter((o) => s.words.includes(o.word));
    blocking.push(...mine.map((o) => ({ name: `«${o.word}»`, first: o.first })));
    const plain = mine.filter((o) => !toned(s.tone, o.tones));
    for (const word of new Set(plain.map((o) => o.word))) {
      const n = plain.filter((o) => o.word === word).length;
      out.push(`${at} · «${word}» is shown ${n === 1 ? 'once' : `${n} times`} without its tone (${s.tone}) · a state that blocks the decision carries its word, a mark and its tone: a badge or an icon in ${color[s.tone]}`);
    }
  }
  const by = new Map(located.map((l) => [l.label, l]));
  for (const f of info.fields.filter((x) => x.limit)) {
    const v = by.get(f.label)?.value;
    if (!v || !breaches(numberOf(v.text), f.limit)) continue;
    blocking.push({ name: `«${f.label}» ${v.text}`, first: v.first });
    if (!v.tones?.length) out.push(`${at} · «${f.label}» is ${v.text}, past its limit (${f.limit.text}), in plain text · a value past its limit is toned and its limit is shown beside it`);
  }
  if (blocking.length && !blocking.some((b) => b.first)) out.push(`${at} · what blocks the decision (${[...new Set(blocking.map((b) => b.name))].slice(0, 4).join(', ')}) is not in the first viewport · the user came to find it: an exceptions strip under the header names each one and leads to it`);
  return out;
};

// Pure: the findings of one viewport from what `measurePage` read.
export const pageFindings = (m, viewport) => {
  const at = `${viewport.width} px`;
  const out = [];
  for (const d of m.ragged) out.push(`${at} · label-value list «${d.label}…»: its ${d.pairs} values start at ${d.columns} different x over ${d.spread} px · the values of a list share one column (a grid, or one label width)`);
  if (m.small.length) out.push(`${at} · ${m.small.length} control${m.small.length > 1 ? 's' : ''} under ${TOUCH_MIN} px tall: ${m.small.slice(0, 4).map((c) => `«${c.name}» ${c.height} px`).join(', ')} · on a phone a control is ${TOUCH_MIN} px tall at least`);
  if (m.cover > COVER_MAX) out.push(`${at} · mid-page, the bars that stay on screen (${[...new Set(m.bars)].join(', ')}) cover ${Math.round(m.cover * 100)} % of it (max ${Math.round(COVER_MAX * 100)} %) · a stuck header keeps two or three facts on a phone, the rest scrolls with the page`);
  if (m.depth > DEPTH_MAX) out.push(`${at} · disclosures nested ${m.depth} deep (max ${DEPTH_MAX}) · a section, then one «show more»: a third level hides what the user came for`);
  if (m.nestedTables) out.push(`${at} · ${m.nestedTables} table${m.nestedTables > 1 ? 's' : ''} inside a table · the detail of a row goes to its own row, a panel or the record it opens`);
  return out;
};

export const check = async (cardDir, url) => {
  const doc = readCard(cardDir);
  if (doc === null) return { error: `${cardDir}: no card.md` };
  const info = informationOf(doc);
  if (!info || !info.fields.length) return { error: `${cardDir}: card.md has no \`## Information\` with fields` };
  const pw = playwright();
  if (!pw) return { error: 'Playwright is not installed in this repo: `npm i -D playwright` and `npx playwright install chromium`.' };
  const main = info.decisions[0]?.id ?? 'D1';
  const browser = await pw.chromium.launch({ channel: 'chromium' }).catch(() => pw.chromium.launch());
  const problems = [];
  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(400);
      const ask = { labels: info.fields.map((f) => f.label), words: info.signals.flatMap((s) => s.words) };
      const seen = await page.evaluate(locate, ask);
      problems.push(...findings(info.fields, seen.fields, viewport, main), ...signalFindings(info, seen, viewport));
      if (viewport.width >= KEPT_FROM && await page.evaluate(() => document.documentElement.scrollHeight > 2 * innerHeight)) {
        await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(200);
        problems.push(...kept(info.fields, (await page.evaluate(locate, ask)).fields, viewport, main));
      }
      await page.evaluate(() => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2));
      await page.waitForTimeout(200);
      problems.push(...pageFindings(await page.evaluate(measurePage, { touchMin: TOUCH_MIN, touchBelow: TOUCH_BELOW }), viewport));
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(100);
      const m = await page.evaluate(measureProduct);
      for (const r of informationRows(m, viewport.width).filter((x) => INFORMATION_ROWS.includes(x.rule) && !x.pass)) problems.push(`${viewport.width} px · ${r.rule}: ${r.detail.join('; ')}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return { problems };
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const [cardDir, url = process.env.APP_URL] = args;
  if (!cardDir || !url || process.argv.includes('--help')) {
    console.log('ia-check.mjs specs/<card> [<url>]   (without <url>: APP_URL of the environment)');
    process.exit(cardDir && url ? 0 : 2);
  }
  const r = await check(cardDir, url).catch((e) => ({ error: e.message }));
  if (r.error) { console.error(r.error); process.exit(2); }
  if (!r.problems.length) { console.log(`The screen shows ## Information as planned at ${VIEWPORTS.map((v) => v.width).join(' and ')} px.`); process.exit(0); }
  console.log(`${r.problems.length} to fix:`);
  for (const p of r.problems) console.log(`- ${p}`);
  process.exit(1);
}
