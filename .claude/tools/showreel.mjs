#!/usr/bin/env node
// showreel.mjs <url> [--out <dir>] [--seconds 40] [--width 1440] [--height 900] [--no-checks]
// Frame checks run on each scene before the judge and land in checks.json; one failing exits 1.
// Run from the root of the repo of the card; Playwright is found there or at KIT_PLAYWRIGHT_ROOT.
//
// Records the tour a person would show in a video —the first seconds still, a slow scroll through
// the whole page, the pointer over what can be touched, back to the top— as a .webm, and builds a
// strip of key frames for whoever judges it, plus one settled still per section (`scenes.png`, and each at full size as `scene-N.png`). A screen that has to impress is judged the way it is
// going to be seen: moving.
// Measured: still captures of three versions of a site came out almost identical; the differences
// were all in the motion.
import { createRequire } from 'node:module';
import { mkdirSync, renameSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { endsWithLine } from './final-line.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const url = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const out = resolve(opt('--out', join('.validation', 'showreel')));
const seconds = Number(opt('--seconds', 40));
const width = Number(opt('--width', 1440));
const height = Number(opt('--height', 900));

// Waits until what entered has finished entering: no finite animation running and no style, text
// or node changing for 400 ms, up to `cap`. A loop that never stops —a beam, a globe— does not hold
// it. Measured: frames taken a fixed second after scrolling caught headlines blurred and counters
// at 0, and the judge scored those as defects.
export const settle = (page, cap = 4000) => page.evaluate((cap) => new Promise((done) => {
  const t0 = performance.now();
  let last = performance.now();
  const mo = new MutationObserver(() => { last = performance.now(); });
  mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] });
  const finite = () => document.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming?.().endTime));
  const tick = () => {
    const now = performance.now();
    if (now - t0 > cap || (!finite() && now - last > 400)) { mo.disconnect(); done(); } else setTimeout(tick, 100);
  };
  tick();
}), cap);

export const tour = async (page, { seconds: total }) => {
  const frames = [];
  const shoot = async (label) => { await settle(page); frames.push({ label, png: (await page.screenshot()).toString('base64') }); };
  const start = Date.now();
  await page.waitForTimeout(3000);
  frames.push({ label: '3 s', png: (await page.screenshot()).toString('base64') });
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const budget = Math.max(8000, total * 1000 - 9000);
  const steps = Math.max(12, Math.round(budget / 450));
  const touchables = await page.$$('a[href], button, [role=button], [role=tab], [data-interactive], .card, [class*="card"]');
  let touched = 0;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.wheel(0, scrollHeight / steps);
    await page.waitForTimeout(350);
    // Every few steps, the pointer rests on something visible that can be touched.
    if (i % 4 === 0) {
      for (const h of touchables.slice(touched)) {
        touched++;
        const box = await h.boundingBox().catch(() => null);
        if (box && box.y > 40 && box.y + box.height < height - 40 && box.width > 20) {
          await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 12 });
          await page.waitForTimeout(500);
          await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 12 });
          await page.waitForTimeout(300);
          break;
        }
      }
    }
    if (i % Math.ceil(steps / 8) === 0) await shoot(`scroll ${Math.round((i / steps) * 100)} %`);
  }
  await page.waitForTimeout(800);
  await page.mouse.move(width / 2, height / 3, { steps: 10 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(Math.max(1500, total * 1000 - (Date.now() - start)));
  await shoot('end');
  return frames;
};

const MIN_TEXT_PX = 16;
const MIN_COVERAGE = 0.15;
const MIN_SECTION = 0.9;

// What the judge would score as a defect of the product, found in the page first: visible text under
// 16 px (13 px stays allowed in label, th and captions), a frame whose content covers under 15 % of
// the viewport, text clipped by overflow, and canvases that sample all near black (a WebGL scene
// that did not draw). Measured: each of these reached the judge in earlier runs.
export const frameChecks = async (page) => {
  const dom = await page.evaluate(({ MIN_TEXT_PX }) => {
    const SMALL_OK = new Set(['LABEL', 'TH', 'CAPTION', 'FIGCAPTION', 'LEGEND']);
    const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE', 'HEAD']);
    const rectOf = (el) => el.getBoundingClientRect();
    const visible = (el, r) => {
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0 && r.width > 0 && r.height > 0 &&
        r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    };
    const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const smallText = [];
    const clipped = [];
    const boxes = [];
    const canvases = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (SKIP.has(el.tagName)) continue;
      const r = rectOf(el);
      if (!visible(el, r)) continue;
      const s = getComputedStyle(el);
      const area = (Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * (Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      if (hasText(el)) {
        const size = parseFloat(s.fontSize);
        const text = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40);
        if (size < MIN_TEXT_PX && !(SMALL_OK.has(el.tagName) && size >= 13)) smallText.push(`"${text}" ${Math.round(size * 10) / 10} px`);
        if (/hidden|clip/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) clipped.push(`"${text}"`);
        boxes.push(r);
      } else if (/^(IMG|SVG|VIDEO|CANVAS|PICTURE|IFRAME)$/i.test(el.tagName)) boxes.push(r);
      else if (el !== document.documentElement && el !== document.body &&
        (!/^none(\s*,\s*none)*$/.test(s.backgroundImage) || !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)|transparent/.test(s.backgroundColor)) &&
        area < innerWidth * innerHeight * 0.9) boxes.push(r);
      if (el.tagName === 'CANVAS') {
        const x = Math.max(r.left, 0), y = Math.max(r.top, 0);
        canvases.push({ x, y, width: Math.min(r.right, innerWidth) - x, height: Math.min(r.bottom, innerHeight) - y });
      }
    }
    const COLS = 48, ROWS = 30;
    let covered = 0;
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const cx = ((i + 0.5) / COLS) * innerWidth, cy = ((j + 0.5) / ROWS) * innerHeight;
        if (boxes.some((r) => cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom)) covered++;
      }
    }
    return { smallText, clipped, canvases, coverage: covered / (COLS * ROWS) };
  }, { MIN_TEXT_PX });

  let blackCanvases = 0;
  for (const c of dom.canvases) {
    if (c.width < 2 || c.height < 2) continue;
    const png = (await page.screenshot({ clip: c })).toString('base64');
    const dark = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
      const step = Math.max(1, Math.floor(data.length / 4 / 400));
      for (let p = 0; p < data.length / 4; p += step) if (Math.max(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) > 20) return false;
      return true;
    }, png);
    if (dark) blackCanvases++;
  }

  const failures = [];
  if (dom.smallText.length) failures.push(`text under ${MIN_TEXT_PX} px: ${dom.smallText.length} element(s), e.g. ${dom.smallText.slice(0, 3).join(', ')}`);
  if (dom.coverage < MIN_COVERAGE) failures.push(`content covers ${Math.round(dom.coverage * 100)} % of the viewport (under ${MIN_COVERAGE * 100} %)`);
  if (dom.clipped.length) failures.push(`text clipped by overflow: ${dom.clipped.slice(0, 3).join(', ')}`);
  if (blackCanvases) failures.push(`black canvas: ${blackCanvases} canvas(es) sampled all near black`);
  return {
    smallText: { count: dom.smallText.length, samples: dom.smallText.slice(0, 5) },
    coverage: dom.coverage,
    clipped: dom.clipped,
    blackCanvases,
    failures,
  };
};

// A section shorter than the viewport shows two scenes in one frame. Page-level, not per frame.
export const sectionChecks = async (page) => {
  const { short, viewport } = await page.evaluate(() => ({
    viewport: innerHeight,
    short: [...document.querySelectorAll('section, [data-scene]')]
      .filter((s) => !s.parentElement.closest('section, [data-scene]') && getComputedStyle(s).display !== 'none' && s.offsetHeight > 0 && s.offsetHeight < innerHeight * 0.9)
      .map((s) => `"${(s.querySelector('h1, h2')?.innerText || s.tagName.toLowerCase()).trim().slice(0, 40)}" is ${s.offsetHeight} px`),
  }));
  return {
    short,
    failures: short.map((s) => `section ${s}, shorter than ${MIN_SECTION * 100} % of the viewport height (${Math.round(viewport * MIN_SECTION)} px)`),
  };
};

// One still per section, scrolled to its top and settled: what the judge reads as a scene.
export const scenes = async (page, { checks = true } = {}) => {
  const frames = [];
  const tops = await page.evaluate(() => [...document.querySelectorAll('section, [data-scene]')]
    .filter((s) => s.offsetHeight > 200 && !s.parentElement.closest('section, [data-scene]'))
    .map((s) => ({ top: Math.round(s.getBoundingClientRect().top + scrollY), label: (s.querySelector('h1, h2')?.innerText || '').trim().slice(0, 40) })));
  const seen = [{ top: 0, label: 'first screen' }];
  for (const t of tops) if (t.top - seen.at(-1).top > 120) seen.push(t);
  for (const { top, label } of seen.slice(0, 12)) {
    await page.evaluate((y) => window.scrollTo(0, y), top);
    await page.waitForTimeout(300);
    await settle(page);
    frames.push({
      label: label || `y ${Math.round(top)}`,
      checks: checks ? await frameChecks(page) : null,
      png: (await page.screenshot()).toString('base64'),
    });
  }
  return frames;
};

const sheet = async (browser, frames, file) => {
  const p = await browser.newPage({ viewport: { width: 1600, height: 400 } });
  await p.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px;font:12px sans-serif;color:#ccc">${frames.map((f) => `<figure style="margin:0"><img style="width:100%;display:block" src="data:image/png;base64,${f.png}"><figcaption>${f.label}</figcaption></figure>`).join('')}</body>`);
  await p.screenshot({ path: file, fullPage: true });
  await p.close();
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  endsWithLine('showreel');
  if (!url || args.includes('--help')) {
    console.log('showreel.mjs <url> [--out <dir>] [--seconds 40] [--width 1440] [--height 900] [--no-checks]');
    process.exit(url ? 0 : 2);
  }
  let pw;
  // The repo of the card first, then KIT_PLAYWRIGHT_ROOT; the output goes under the cwd either way.
  for (const root of [process.cwd(), process.env.KIT_PLAYWRIGHT_ROOT].filter(Boolean)) {
    const req = createRequire(join(root, 'package.json'));
    for (const name of ['playwright', '@playwright/test']) { try { pw ??= req(name); } catch {} }
  }
  if (!pw) { console.error('Playwright is not installed in this repo.'); process.exit(2); }
  // A crash is "could not run" (2): exit 1 is read as findings.
  try {
    mkdirSync(out, { recursive: true });
    // The old headless shell draws WebGL black —a globe or a shader vanishes from the video—; the new
    // headless mode (`channel: 'chromium'`) renders with the real GPU. Falls back if it is not there.
    const browser = await pw.chromium.launch({ channel: 'chromium' }).catch(() => pw.chromium.launch());
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, recordVideo: { dir: out, size: { width, height } } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    const frames = await tour(page, { seconds });
    const video = await page.video()?.path();
    await context.close();
    await sheet(browser, frames, join(out, 'frames.png'));
    const still = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await still.goto(url, { waitUntil: 'load', timeout: 60000 });
    await settle(still);
    const runChecks = !args.includes('--no-checks');
    const sceneFrames = await scenes(still, { checks: runChecks });
    const sections = runChecks ? await sectionChecks(still) : null;
    if (sceneFrames.length) await sheet(browser, sceneFrames, join(out, 'scenes.png'));
    // The sheet shrinks each scene to a quarter: a judge reading it scores 16 px text as illegible.
    sceneFrames.forEach((f, i) => writeFileSync(join(out, `scene-${i + 1}.png`), Buffer.from(f.png, 'base64')));
    await browser.close();
    const final = join(out, 'showreel.webm');
    if (video && existsSync(video)) renameSync(video, final);
    console.log(`video: ${final}\nframes: ${join(out, 'frames.png')}${sceneFrames.length ? `\nscenes: ${join(out, 'scenes.png')}` : ''}`);
    if (runChecks) {
      const failures = [
        ...sceneFrames.flatMap((f) => f.checks.failures.map((m) => `scene "${f.label}": ${m}`)),
        ...sections.failures,
      ];
      writeFileSync(join(out, 'checks.json'), JSON.stringify({
        scenes: sceneFrames.map((f) => ({ label: f.label, ...f.checks })),
        sections,
        failures,
      }, null, 1));
      console.log(`checks: ${join(out, 'checks.json')} · ${failures.length ? `${failures.length} failing` : 'all pass'}`);
      for (const m of failures) console.log(`✗ ${m}`);
      if (failures.length) process.exit(1);
    }
  } catch (e) {
    console.error(`showreel could not run: ${e.message}`);
    process.exit(2);
  }
}
