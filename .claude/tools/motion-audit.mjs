#!/usr/bin/env node
// motion-audit.mjs [<url>] [--only <selector>]… [--max <n>] [--cpu <rate>] [--interact] [--click <selector> [--interrupt]]
//                  [--frames [<selector>]]… [--entrances] [--config <file>] [--baseline <report.json>] [--storage-state <file>]
//                  [--wait-for <selector>] [--allow-redirect] [--min-coverage <0-1>] [--out <dir>] [--strict] [--json]
// motion-audit.mjs <url> --measure [--kind product] [--scroll-story] [--frames [<selector>]]… [--click <selector> [--interrupt]]
// motion-audit.mjs compare <ref.json> <mine.json>
// Run from the root of the repo of the card. Without <url> it takes APP_URL from the environment; --out defaults
// to .validation/motion.
//
// Two modes, two engines.
// The gate mode (every call without --measure, --kind or --scroll-story) runs the motion-audit engine vendored at
// .claude/skills/motion-audit/ (its SKILL.md lists every finding kind and flag): whether each control responds on
// hover, press and focus, with what transition, curve and duration; controls revealed only on hover; hover not gated
// by (hover: hover); jumps and interruptions; long frames with their LoAF attribution; what moves, stays, loops or
// stays hidden with prefers-reduced-motion; a coverage contract (audited of candidates) and a repeat to confirm each
// finding; a redirect to a login page is never audited. It needs Playwright >= 1.59, from PLAYWRIGHT_ROOT, the
// repo's node_modules or KIT_PLAYWRIGHT_ROOT. --frames without a selector takes the --click target. Exit 0 clean,
// 1 findings to fix, 2 could not run or audited nothing; --json prints the report (schemaVersion 1).
// An external URL is checked first for a bot wall on its HTTP answer (status, title, text).
//
// The measure mode (--measure, --kind or --scroll-story) and `compare` run the kit's own engine
// (motion-curves.mjs) and judge nothing: they record a reference site for design-round and the designer.
// During hover, press, focus and the entrances on load and on scroll it samples the rect, opacity and
// transform of every moving element on every animation frame: observed duration, overshoot, curve shape
// and jumps. --click records everything that moves for 1500 ms after the click (delays, durations,
// stagger); --interrupt clicks again halfway; --scroll-story scrolls end to end and records parallax,
// pinned and scroll-linked elements. report.json carries `roles` and `grammar`; `compare` lines two
// reports up by role. --frames writes a contact sheet of the element's hover and press, one frame
// every 40 ms; without a selector it uses the --click target, or else the primary button.
// Measured: a screen that passed every validation moved nothing but colors in 100 ms, and nothing
// in the kit looked at whether each element responded.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { wallOf, wallMessage, isExternal, reasonOf, withoutScripts } from './bot-wall.mjs';
import { tracer, analyzeRecording, stagger, continuity, scrollStory, buildRoles, grammar, compare, primaryMove } from './motion-curves.mjs';

const USAGE_LINE = 'motion-audit.mjs [<url>] [--only <selector>]… [--cpu 4] [--frames [<selector>]]… [--click <selector>] [--interrupt] [--out <dir>] [--strict] [--json]   (without <url>: APP_URL of the environment)\nmotion-audit.mjs <url> --measure [--kind product] [--scroll-story] [--frames [<selector>]]… [--click <selector>] [--interrupt]';
const VISIBLE_PROPS = ['transform', 'opacity', 'background-color', 'background-image', 'color', 'box-shadow', 'border-color', 'outline-style', 'outline-width', 'outline-color', 'text-decoration-color', 'filter', 'scale', 'translate'];
const INTERACTIVE = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=menuitem], [role=checkbox], [role=link], [tabindex]:not([tabindex="-1"])';

const args = process.argv.slice(2);
const opt = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const url = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? process.env.APP_URL;
const only = opt('--only');
const val = (name) => opt(name).filter((v) => v && !v.startsWith('--'));
const frames = val('--frames');
const framesFlag = args.includes('--frames');
const click = val('--click')[0];
const interrupt = args.includes('--interrupt');
const story = args.includes('--scroll-story');
const cpu = Number(opt('--cpu')[0] ?? 0);
const DEFAULT_OUT = join('.validation', 'motion');
const out = resolve(opt('--out')[0] ?? DEFAULT_OUT);
const max = Number(opt('--max')[0] ?? 40);
const MEASURE_MODE = args[0] === 'compare' || ['--measure', '--kind', '--scroll-story'].some((f) => args.includes(f));
const ENGINE = '../skills/motion-audit/scripts/lib';
const BOT_WALL_TIMEOUT_MS = 15000;

// A bot wall read from the HTTP answer alone: status, title and visible text. The rendered page is the engine's
// own browser, so the rules that need its DOM (challenge markers, thin text beside media) are not applied here.
const httpWall = async (target) => {
  if (!isExternal(target)) return null;
  const response = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(BOT_WALL_TIMEOUT_MS) }).catch(() => null);
  if (!response) return null;
  const html = await response.text().catch(() => '');
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  const text = withoutScripts(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return reasonOf({ status: response.status, title, text, html, media: { share: 1, nodes: 0 } });
};

// `--frames` with no selector takes the --click target; without one it is dropped.
const withFramesTarget = (argv) => {
  const at = argv.findIndex((a, i) => a === '--click' && argv[i + 1]);
  const target = at >= 0 ? argv[at + 1] : argv.find((a) => a.startsWith('--click='))?.slice('--click='.length);
  return argv.flatMap((a, i) => {
    if (a !== '--frames' || (argv[i + 1] && !argv[i + 1].startsWith('--'))) return [a];
    return target ? ['--frames', target] : [];
  });
};

// The gate mode: the vendored engine's `main`, with the kit's defaults. Returns the exit code.
const gate = async (argv) => {
  if (!process.env.PLAYWRIGHT_ROOT && !existsSync(join(process.cwd(), 'node_modules', 'playwright')) && process.env.KIT_PLAYWRIGHT_ROOT) {
    process.env.PLAYWRIGHT_ROOT = process.env.KIT_PLAYWRIGHT_ROOT;
  }
  let engine;
  try {
    engine = { ...(await import(`${ENGINE}/cli.mjs`)), ...(await import(`${ENGINE}/args.mjs`)) };
  } catch (e) {
    console.error(`could not run: the motion-audit engine is not installed at .claude/skills/motion-audit (${e.message}); the web profile brings it`);
    return 2;
  }
  const a = withFramesTarget(argv);
  if (!a.some((x) => x === '--out' || x.startsWith('--out='))) a.push('--out', resolve(DEFAULT_OUT));
  let positional = [];
  try { positional = engine.parseArgs(a).positional; } catch { return engine.main(a); }
  if (!positional.length && process.env.APP_URL) { a.push(process.env.APP_URL); positional = [process.env.APP_URL]; }
  if (a.includes('--help')) {
    console.log(`${USAGE_LINE}\n\n${engine.USAGE}`);
    return positional.length ? 0 : 2;
  }
  if (positional.length === 1) {
    const wall = await httpWall(positional[0]);
    if (wall) { console.error(wallMessage(positional[0], wall)); return 2; }
  }
  return engine.main(a);
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

// The values of a duration list like "0.15s, 200ms" in milliseconds.
const ms = (list) => String(list).split(',').map((s) => s.trim()).map((s) => (s.endsWith('ms') ? parseFloat(s) : parseFloat(s) * 1000));

const snapshotIn = (handle, props) => handle.evaluate((node, props) => {
  const cs = getComputedStyle(node);
  return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
}, props);

const diff = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);
const shot = async (page, box) => (await page.screenshot({ clip: { x: Math.max(0, box.x - 6), y: Math.max(0, box.y - 6), width: box.width + 12, height: box.height + 12 } })).toString('base64');

// Traces one element and its descendants from `begin` until the snapshot taken by `end`.
const traceBegin = (handle) => handle.evaluate((n) => window.__mt?.begin('m', { root: n, every: 1 })).catch(() => {});
const traceEnd = async (page) => {
  const rec = await page.evaluate(() => window.__mt?.end('m') ?? null).catch(() => null);
  if (!rec) return [];
  return analyzeRecording(rec, { origin: rec.t0 }).map(({ label, root, primary, startMs, endMs, moves }) => ({ label, root, primary, startMs, endMs, moves }));
};

// The primary button: a link or button on the first screen, by solid background times area.
const scoreOf = (handle) => handle.evaluate((n) => {
  if (!/^(A|BUTTON)$/.test(n.tagName) && n.getAttribute('role') !== 'button') return 0;
  const r = n.getBoundingClientRect();
  if (r.top + scrollY >= innerHeight || r.width < 2 || r.height < 2) return 0;
  const m = getComputedStyle(n).backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
  const alpha = m.length > 3 ? m[3] : 1;
  return alpha > 0.5 ? Math.round(r.width * r.height) : 0;
}).catch(() => 0);

const auditElement = async (page, original, label) => {
  // A visually hidden input (custom checkbox or switch) is felt through its label.
  const proxy = await original.evaluateHandle((n) => (n.matches('input') && getComputedStyle(n).opacity === '0' ? n.closest('label') ?? n : n));
  const handle = proxy.asElement() ?? original;
  const selected = await original.evaluate((n) => n.getAttribute('aria-selected') === 'true' || n.getAttribute('aria-checked') === 'true');
  const box = await handle.boundingBox();
  if (!box || box.width < 2 || box.height < 2) return null;
  const transition = await handle.evaluate((node) => {
    const cs = getComputedStyle(node);
    return { properties: cs.transitionProperty.split(',').map((s) => s.trim()), durations: cs.transitionDuration, easings: cs.transitionTimingFunction.split(/,(?![^(]*\))/).map((s) => s.trim()) };
  });
  transition.durations = ms(transition.durations);
  // Inputs, scroll regions made focusable with tabindex and skip links only owe a visible focus.
  const kind = await handle.evaluate((n) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName) && getComputedStyle(n).opacity !== '0') return 'input';
    const role = n.getAttribute('role');
    if ((!role && !/^(A|BUTTON|SUMMARY)$/.test(n.tagName)) || /^(region|group|table|figure|img|document|tabpanel|list|article)$/.test(role ?? '')) return 'focus-only';
    const cs = getComputedStyle(n);
    if (cs.opacity === '0' || n.getBoundingClientRect().bottom <= 0 || n.getBoundingClientRect().top >= innerHeight + scrollY + 2000) return 'focus-only';
    return role ?? n.tagName.toLowerCase();
  });
  const moments = {};
  const rest = await snapshotIn(handle, VISIBLE_PROPS);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (kind === 'focus-only') {
    const beforePx = await shot(page, box);
    await traceBegin(handle);
    await page.keyboard.press('Shift');
    await handle.focus().catch(() => {});
    await page.waitForTimeout(250);
    const focused = await snapshotIn(handle, VISIBLE_PROPS);
    const motion = await traceEnd(page);
    const pixels = (await shot(page, box)) !== beforePx;
    await handle.evaluate((n) => n.blur?.());
    return { label, kind, selected, score: 0, transition, moments: { focus: { changed: diff(rest, focused), pixels, transitioned: transition.properties, values: {}, motion } } };
  }
  const restPx = await shot(page, box);
  // Hover
  await traceBegin(handle);
  await page.mouse.move(cx, cy);
  await page.waitForTimeout(450);
  const hover = await snapshotIn(handle, VISIBLE_PROPS);
  const hoverMotion = await traceEnd(page);
  const hoverPx = await shot(page, box);
  moments.hover = { changed: diff(rest, hover), pixels: hoverPx !== restPx, transitioned: transition.properties, values: Object.fromEntries(diff(rest, hover).map((k) => [k, [rest[k], hover[k]]])), motion: hoverMotion };
  // Press: down on the element, up away from it, so that nothing is clicked.
  if (kind !== 'input') {
    await traceBegin(handle);
    await page.mouse.down();
    await page.waitForTimeout(200);
    const pressed = await snapshotIn(handle, VISIBLE_PROPS);
    const pressMotion = await traceEnd(page);
    const pressPx = await shot(page, box);
    moments.press = { changed: diff(hover, pressed), pixels: pressPx !== hoverPx, transitioned: transition.properties, values: Object.fromEntries(diff(hover, pressed).map((k) => [k, [hover[k], pressed[k]]])), motion: pressMotion };
    await page.mouse.move(1, 1);
    await page.mouse.up();
  } else {
    await page.mouse.move(1, 1);
  }
  await page.waitForTimeout(300);
  // Focus by keyboard semantics: focus() plus a keydown elsewhere first makes :focus-visible apply.
  // The ring of a hidden input is drawn on the element after it.
  const ring = await original.evaluateHandle((n) => (n.matches('input') && getComputedStyle(n).opacity === '0' ? n.nextElementSibling ?? n : n));
  const ringEl = ring.asElement() ?? original;
  const before = await snapshotIn(ringEl, VISIBLE_PROPS);
  const beforePx = await shot(page, box);
  await traceBegin(ringEl);
  await page.keyboard.press('Shift');
  await original.focus().catch(() => {});
  await page.waitForTimeout(250);
  const focused = await snapshotIn(ringEl, VISIBLE_PROPS);
  const focusMotion = await traceEnd(page);
  moments.focus = { changed: diff(before, focused), pixels: (await shot(page, box)) !== beforePx, transitioned: transition.properties, values: Object.fromEntries(diff(before, focused).map((k) => [k, [before[k], focused[k]]])), motion: focusMotion };
  await original.evaluate((n) => n.blur?.());
  return { label, kind, selected, score: await scoreOf(handle), transition, moments };
};

const describe = (handle, i) => handle.evaluate((n, i) => {
  const text = (n.getAttribute('aria-label') || n.textContent || n.getAttribute('placeholder') || n.getAttribute('name') || '').trim().replace(/\s+/g, ' ').slice(0, 32);
  return `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${text ? ` “${text}”` : ''} [${i}]`;
}, i);

const entrances = async (page) => page.evaluate(async () => {
  // Each heading below the first screen stands for its section: its closest block container.
  const sections = [...new Set([...document.querySelectorAll('h2, h3')]
    .map((h) => h.closest('section, article, li, div') ?? h)
    .filter((c) => c.getBoundingClientRect().top + scrollY > innerHeight))]
    .filter((c, _, all) => !all.some((o) => o !== c && o.contains(c)));
  const moved = new Set();
  const owner = (t) => sections.find((s) => s === t || s.contains(t));
  const mark = (e) => { const s = owner(e.target); if (s) moved.add(s); };
  document.addEventListener('animationstart', mark, true);
  document.addEventListener('transitionstart', mark, true);
  const mo = new MutationObserver((list) => { for (const m of list) { const s = owner(m.target); if (s && m.attributeName === 'style') moved.add(s); } });
  mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] });
  for (let y = 0; y < document.documentElement.scrollHeight; y += 160) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 90));
    for (const a of document.getAnimations()) { const s = a.effect?.target && owner(a.effect.target); if (s) moved.add(s); }
  }
  await new Promise((r) => setTimeout(r, 600));
  mo.disconnect();
  window.scrollTo(0, 0);
  return sections.slice(0, 30).map((s) => ({ section: (s.querySelector('h2, h3')?.textContent ?? s.tagName).trim().slice(0, 40), animated: moved.has(s) }));
});

const longFrames = (page) => page.evaluate(() => new Promise((done) => {
  const frames = [];
  try {
    new PerformanceObserver((list) => frames.push(...list.getEntries().map((e) => Math.round(e.duration)))).observe({ type: 'long-animation-frame', buffered: false });
  } catch { done(null); return; }
  let y = 0;
  const step = () => {
    y += innerHeight / 2;
    window.scrollTo(0, y);
    if (y < document.body.scrollHeight) setTimeout(step, 120); else setTimeout(() => { window.scrollTo(0, 0); done(frames.filter((d) => d > 50)); }, 400);
  };
  step();
}));

const SHEET_MAX_HEIGHT = 1600;
const contactSheet = async (page, browser, target) => {
  const selector = typeof target === 'string' ? target : 'primary';
  const handle = typeof target === 'string' ? await page.$(target) : target;
  if (!handle) return null;
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) return null;
  const pad = 16;
  const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 };
  const shots = [];
  const take = async () => shots.push((await page.screenshot({ clip })).toString('base64'));
  await take();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 8; i++) { await page.waitForTimeout(40); await take(); }
  await page.mouse.down();
  for (let i = 0; i < 5; i++) { await page.waitForTimeout(40); await take(); }
  await page.mouse.move(1, 1);
  await page.mouse.up();
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(40); await take(); }
  const sheet = await browser.newPage({ viewport: { width: 1200, height: 200 } });
  await sheet.setContent(`<body style="margin:0;background:#888;display:flex;flex-wrap:wrap;align-content:flex-start;gap:4px;padding:4px">${shots.map((s, i) => `<figure style="margin:0;font:10px sans-serif;color:#fff"><img src="data:image/png;base64,${s}"><figcaption>${i * 40} ms${i === 1 ? ' hover' : i === 9 ? ' press' : i === 14 ? ' out' : ''}</figcaption></figure>`).join('')}</body>`);
  const base = join(out, selector.replace(/[^\w-]+/g, '_').slice(0, 60));
  // Each file stays within what light-images lets be read (SHEET_MAX_HEIGHT): a taller sheet goes in parts.
  const total = await sheet.evaluate(() => document.documentElement.scrollHeight);
  const parts = Math.max(1, Math.ceil(total / SHEET_MAX_HEIGHT));
  const files = [];
  for (let i = 0; i < parts; i++) {
    const file = `${base}${i ? `-${i + 1}` : ''}.png`;
    const y = i * SHEET_MAX_HEIGHT;
    await sheet.screenshot({ path: file, fullPage: true, clip: { x: 0, y, width: 1200, height: Math.min(SHEET_MAX_HEIGHT, total - y) } });
    files.push(file);
  }
  await sheet.close();
  return files;
};

const CAP = 80;
const reload = async (page) => { await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => !window.__mt?.active('load'), null, { timeout: 8000 }).catch(() => {}); };

// The selector's element, in view and with its centre, ready for a real mouse click.
const clickTarget = async (page, selector) => {
  const h = await page.$(selector);
  if (!h) return null;
  await h.scrollIntoViewIfNeeded().catch(() => {});
  const box = await h.boundingBox();
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
};

// --click: everything that moves for 1500 ms after a real click. With `again` (a wait in ms) clicks a
// second time that long after the first and returns the recording for the continuity check.
const clickRun = async (page, selector, again = 0) => {
  await reload(page);
  const at = await clickTarget(page, selector);
  if (!at) return null;
  await page.evaluate(() => window.__mt.begin('click', { every: 1 }));
  await page.waitForTimeout(250);
  try {
    await page.mouse.click(at.x, at.y);
    if (again) { await page.waitForTimeout(again); await page.mouse.click(at.x, at.y); }
    await page.waitForTimeout(again ? 900 : 1500);
    return await page.evaluate(() => window.__mt.end('click'));
  } catch { return null; }
};

const storyRun = async (page) => {
  await reload(page);
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const view = await page.evaluate(() => innerHeight);
  const steps = [];
  const metas = new Map();
  for (let y = 0; y <= Math.max(0, total - view) && steps.length < 400; y += 100) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y);
    await page.waitForTimeout(110);
    const s = await page.evaluate(() => window.__mt.snapshot());
    for (const [id, m] of s.fresh) metas.set(id, m);
    steps.push({ y: s.y, rows: s.rows });
  }
  return scrollStory(steps, metas, total);
};

export const audit = async () => {
  const pw = playwright();
  if (!pw) return { error: 'Playwright is not installed in this repo: `npm i -D playwright` and `npx playwright install chromium`.' };
  mkdirSync(out, { recursive: true });
  // The old headless shell draws WebGL black —a globe or a shader vanishes from the video—; the new
  // headless mode (`channel: 'chromium'`) renders with the real GPU. Falls back if it is not there.
  const browser = await pw.chromium.launch({ channel: 'chromium' }).catch(() => pw.chromium.launch());
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(tracer);
  const page = await context.newPage();
  const response = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(1500);
  const wall = await wallOf(page, response, url);
  if (wall) { await browser.close(); return { error: wallMessage(url, wall) }; }
  // The load trace runs by itself for 4000 ms from the start of the document.
  await page.waitForFunction(() => !window.__mt?.active('load'), null, { timeout: 8000 }).catch(() => {});
  const loadRec = await page.evaluate(() => window.__mt?.end('load') ?? null).catch(() => null);
  const load = loadRec ? analyzeRecording(loadRec, { origin: 0 }) : [];
  if (cpu > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  }
  // Entrances first, on the untouched page: auditing the elements scrolls through it.
  await page.evaluate(() => window.__mt?.begin('scroll', { every: 3 })).catch(() => {});
  const sections = await entrances(page);
  const scrollRec = await page.evaluate(() => window.__mt?.end('scroll') ?? null).catch(() => null);
  const scroll = scrollRec ? analyzeRecording(scrollRec, { origin: scrollRec.t0 }) : [];
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);
  const handles = only.length ? (await Promise.all(only.map((s) => page.$$(s)))).flat() : await page.$$(INTERACTIVE);
  const visible = [];
  for (const h of handles) {
    if (visible.length >= max) break;
    const shown = await h.evaluate((n) => {
      if (n.disabled || n.getAttribute('aria-disabled') === 'true') return false;
      const target = n.matches('input') && getComputedStyle(n).opacity === '0' ? n.closest('label') ?? n : n;
      for (let e = target; e; e = e.parentElement) {
        const c = getComputedStyle(e);
        if (c.opacity === '0' || c.visibility === 'hidden' || c.display === 'none') return false;
      }
      const r = target.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    }).catch(() => false);
    if (shown) visible.push(h);
  }
  const elements = [];
  const handleOf = new Map();
  for (const [i, h] of visible.entries()) {
    await h.scrollIntoViewIfNeeded().catch(() => {});
    const label = await describe(h, i);
    const el = await auditElement(page, h, label).catch(() => null);
    if (el) { elements.push(el); handleOf.set(el, h); }
  }
  const long = await longFrames(page);

  const primary = elements.filter((e) => e.score > 0).sort((a, b) => b.score - a.score)[0] ?? null;
  const primaryHandle = primary ? handleOf.get(primary) ?? null : null;
  const sheets = [];
  for (const s of frames) sheets.push(await contactSheet(page, browser, s));
  if (framesFlag && !frames.length) {
    const target = click ?? primaryHandle;
    if (target) sheets.push(await contactSheet(page, browser, target));
  }

  // Choreography runs on reloaded pages: the audit above leaves state behind.
  let clickReport = null;
  let interruptReport = null;
  let storyReport = null;
  let clickEls = [];
  if (click) {
    const rec = await clickRun(page, click);
    if (rec) {
      clickEls = analyzeRecording(rec, { origin: rec.marks[0] ?? rec.t0, ambientBefore: -34 });
      const st = stagger(clickEls);
      const totalMs = clickEls.length ? Math.max(...clickEls.map((e) => e.endMs)) - Math.min(...clickEls.map((e) => e.startMs)) : 0;
      clickReport = { selector: click, count: clickEls.length, totalMs, stagger: st, elements: clickEls.slice(0, CAP) };
    } else clickReport = { selector: click, error: 'the selector matches nothing visible, or the click left the page' };
  }
  if (interrupt && click && clickReport && !clickReport.error) {
    const half = clickReport.totalMs ? Math.min(600, Math.max(60, clickReport.totalMs / 2)) : 120;
    const rec = await clickRun(page, click, half);
    if (rec && rec.marks.length > 1) {
      const jumps = continuity(rec, rec.marks[1]);
      interruptReport = { selector: click, afterMs: Math.round(half), continuous: !jumps.length, jumps };
    } else interruptReport = { selector: click, error: 'the second click was not recorded' };
  }
  if (story) storyReport = await storyRun(page);
  await browser.close();

  const roles = buildRoles({ load, scroll, click: clickEls, hover: primary, story: storyReport });
  const hoverMoves = (name) => elements.filter((e) => (e.moments[name]?.motion ?? []).some((m) => m.moves.length)).length;
  const grammarOf = grammar([...load, ...scroll, ...clickEls], roles, { hover: hoverMoves('hover'), press: hoverMoves('press'), focus: hoverMoves('focus'), of: elements.length });
  return {
    url, cpu, elements, sections, longFrames: long, sheets: sheets.flat().filter(Boolean),
    load: load.slice(0, CAP), scrollEntrances: scroll.slice(0, CAP), click: clickReport, interrupt: interruptReport, scrollStory: storyReport,
    roles, grammar: grammarOf,
  };
};

const isEntry = import.meta.url === pathToFileURL(process.argv[1]).href;
// exitCode, not exit(): a large --json report on a pipe is written out before the process ends.
if (isEntry && !MEASURE_MODE) process.exitCode = await gate(args);
else if (isEntry) {
  if (args[0] === 'compare') {
    let ref, mine;
    try { ref = JSON.parse(readFileSync(args[1], 'utf8')); mine = JSON.parse(readFileSync(args[2], 'utf8')); } catch (e) { console.error(`compare: cannot read the reports (${e.message}); usage: motion-audit.mjs compare <ref.json> <mine.json>`); process.exit(2); }
    const c = compare(ref, mine);
    for (const l of c.lines) console.log(l);
    console.log(`${c.differ} of ${c.total} differ`);
    process.exit(0);
  }
  if (!url || args.includes('--help')) {
    console.log(`${USAGE_LINE}\nmotion-audit.mjs compare <ref.json> <mine.json>`);
    process.exit(url ? 0 : 2);
  }
  if (interrupt && !click) { console.error('--interrupt needs --click <selector>'); process.exit(2); }
  // A crash is "could not run" (2): exit 1 is read as findings.
  try {
    const r = await audit();
    if (r.error) { console.error(r.error); process.exit(2); }
    writeFileSync(join(out, 'report.json'), JSON.stringify(r, null, 1));
    const resp = (m) => r.elements.filter((e) => e.moments[m]?.changed.length || e.moments[m]?.pixels).length;
    // How rich the response is, not only whether it exists: movement or depth, not only color.
    const moves = (m) => r.elements.filter((e) => (e.moments[m]?.changed ?? []).some((p) => /transform|scale|translate|box-shadow|filter/.test(p))).length;
    const actionable = r.elements.filter((e) => e.kind !== 'focus-only').length;
    console.log(`${r.elements.length} elements · respond on hover ${resp('hover')} · press ${resp('press')} · focus ${resp('focus')} · sections with entrance ${r.sections.filter((s) => s.animated).length}/${r.sections.length} · long frames ${r.longFrames?.length ?? 'n/a'}${r.cpu > 1 ? ` (CPU ${r.cpu}×)` : ''}`);
    console.log(`richness · of ${actionable} actionable elements: press with movement ${moves('press')}, hover with depth or movement ${moves('hover')} — the audit checks that what exists responds well; how alive the screen is, is judged against the references in step 9`);
    const g = r.grammar;
    const d = g.durationsMs;
    console.log(`motion · durations ${d ? `${d.min}–${d.max} ms (median ${d.median})` : 'none measured'} · curves ${Object.entries(g.shapes).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'} · stagger ${g.staggerMs} ms${r.click?.totalMs !== undefined ? ` · click moves ${r.click.count} elements over ${r.click.totalMs} ms` : ''}${r.interrupt && !r.interrupt.error ? ` · interrupt ${r.interrupt.continuous ? 'continuous' : `${r.interrupt.jumps.length} jumps`}` : ''}${r.scrollStory ? ` · scroll story ${r.scrollStory.summary.narrative ? 'yes' : 'no'} (${r.scrollStory.summary.parallax} parallax, ${r.scrollStory.summary.pinned} pin, ${r.scrollStory.summary.linked} linked)` : ''}`);
    if (r.sheets.length) console.log(`contact sheets: ${r.sheets.join(', ')}`);
    console.log(`report: ${join(out, 'report.json')}`);
    process.exit(0);
  } catch (e) {
    console.error(`motion-audit could not run: ${e.message}`);
    process.exit(2);
  }
}
