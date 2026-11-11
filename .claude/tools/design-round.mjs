#!/usr/bin/env node
// design-round.mjs <url> --out <dir> [--steps <steps.json>] [--widths 1440x900,1280x800,1024x768,768x1024,390x844] [--gpu] [--grain baked|none] [--brand <direction.json|DESIGN.md|brand.json|card.md>] [--intent <collage|statement|grid|pinned-media|card.md>] [--kind <product|card.md>] [--scrub]
// `--brand` reads the brand sheet (`brand.json`, the `## Brand` block of card.md, a DESIGN.md or the dealt `direction.json`): a text family
// outside its fonts, or a primary action or page background off its colors, fails a «brand:» row. round.json records the sheet, and the
// gate fails a round run without one (gate-checks.mjs `brand`).
// `--grain baked` (also what a card's `## Look` declares when the grain is baked into the image files) makes the grain rule pass
// without a global layer and prints «grain: baked (declared)»; `--grain none` declares that the page has no grain (a paper texture or an image is the texture).
// `--intent` (or the `intent:` line of the card's `## Look`) is what a section family is on purpose: under it the focal share, competing
// elements, axes and element count of a frame are reported with «report:» and never flagged.
// `--kind product` (or `ref-kind: product` in the card's `## Look`, `--kind <card.md>`) reads the screen as a product screen, a dashboard, a list or a tool: the
// composition ranges of a landing and the desktop hero rows give way to the PRODUCT rows (content span, card in card, row as card, hues, backdrop-filter,
// gradients, tabular numerals; `brand-chrome: glass, gradient` in `## Look` allows the last two).
// `--scrub` finds the pinned ranges (`position: sticky` blocks of half a viewport or more, and ScrollTrigger pins when `window.ScrollTrigger`
// exists), captures 5 frames across each pin and the first one after it into `<dir>/<width>/scrub/`, and reports each pin length and the
// share of the total scroll the pins take. Scrolling goes through Lenis when the page exposes it (`window.lenis`, `scrollTo(y, { immediate: true })`),
// else `window.scrollTo`; a site that hides its Lenis instance and ignores `scrollTo` needs a `wheel` step in `--steps` instead. The
// `section` captures use `scrollIntoView`, which Lenis does not intercept.
// `design-round.mjs --sheet <ref-dir> [--out <dir>]` is the other mode: it makes one downscaled contact sheet (JPEG, 1600 px wide, a label per
// thumbnail) per width from the `*.png`, `*.jpg` of the folder (the width is the `-<width>-<nn>` of the file name), so a reference is looked at in
// one image Read per width, not one per capture. Output `<out>/sheet-<width>[-<k>].jpg` (default out: the folder); 24 thumbnails at most per sheet.
// `design-round.mjs --ref <url> --name <genre>-<site> --out specs/<card>/ref` captures a reference site in one call, in the layout the
// gate's `ref` check reads: at 1440x900 and 390x844, 9 frames scrolling down (`<name>-<width>-01..09.png`) and the first inner page the site
// links (`-10`), `captures.json` merged, the contact sheets, and the site's motion (`motion-audit.mjs --measure --frames --scroll-story`)
// in `motion-<name>.json`, copied to `motion.json` for the first reference. A bot wall is retried once with a fresh context and a longer
// wait; a second one exits 2. About 2 min per site.
// One whole capture round of a screen in a single call, so the designer spends its turns looking and fixing, not taking captures.
// Per width it writes viewport captures, never a full page: the load at 0, 600 and 2000 ms; one per visible `section` or
// `[data-section]`, scrolled to the top of the viewport; and, with --steps, the ones of a probe steps file (`help.mjs judge`
// lists the actions; `{ "scroll": "<locator>" }` and `{ "wait": <ms> }` among them; a capture after every step).
// It measures with `page.evaluate`, against the ranges of `.claude/reference/excellence.md`: display/body ratio and display
// line height, display and body tracking, distinct font sizes in the first viewport, grain (a `grain` or `noise` class,
// `feTurbulence` or a `url(*noise*)`). It runs `motion-audit.mjs <url> --measure` and summarizes the load: waves (`startMs`
// grouped every 100 ms), their gap and the total duration. It lists the console errors and warnings.
// The WebGL renderer (`UNMASKED_RENDERER`) is always in the summary; a software one (SwiftShader) is flagged, because with it
// the motion times mean nothing. --gpu launches Chromium with `--use-angle=d3d11 --enable-gpu-rasterization
// --ignore-gpu-blocklist` on Windows (the last two elsewhere).
// Hero video: each autoplaying looping `video` in the first viewport must last 8 s or more and its last frame must look like its
// first when it is one continuous shot (a montage with cuts passes: its restart is one more cut) (the restart seam jumps no more than 1.5 times the video's own frame-to-frame step, measured with ffmpeg on the file).
// A page that answers a bot wall or an error page (status 400 or more, «Just a moment», a captcha) is not captured: exit 2.
// By window class (`.claude/reference/responsive-classes.md`): widths under 600 (compact) measure tap targets under 44x44,
// hover-only reveals, inputs under 16 px, document overflow, media queries (min-width against max-width), the share of the viewport
// covered by fixed layers (canvas and full-viewport scenes not counted), where the first primary button falls and the navigation (bottom bar or labeled menu, not a bare
// hamburger); from 840 up, no hamburger; from 1200, clicks of 24 px or more and buttons that do not all measure 48 or more.
// Per width it also writes: the composition of each viewport frame (focal share, competing elements, alignment axes, elements, empty
// share, flagged against the ranges of `design-checks.mjs`, a table per width); at 390 touch and from 1200 a dead-click sweep (every
// link, button and pointer element is activated; no effect within 1 s, `href="#"` and an anchor to a missing id fail; captures in
// `<dir>/<width>/dead-clicks/`); at DPR 2 the image checks (file width against shown width x 2, pasted boxes, repeated images, the LCP
// image not lazy and visible at t0).
// Output: `<dir>/round.json` with everything, a short table on stdout (each rule: value, range, pass or fail; then the captures).
// Exit 0 whenever it ran, a failed rule included; 2 when it could not run (bad arguments, no Playwright, the URL does not answer).
// Run from the root of the repo of the card; Playwright is found there or at KIT_PLAYWRIGHT_ROOT.
// Measured: a designer round spent most of its turns writing a capture script and a measuring script, and ran out of turns
// before it corrected anything.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parseSteps } from './probe.mjs';
import { wallOf, wallMessage } from './bot-wall.mjs';
import { DPR, FRAME_MAX, LCP_INIT, collectFonts, collectPalette, collectTextBoxes, crossWidthRows, loadBrand, loadIntent, loadProduct, measureProduct, mergePainted, paintedTexts, PASTED_MARGIN, designRows, frameFlags, frameReports, frameTable, markVisibleAtT0, measureFrame, measureImages, measureLayout, pickCta, sampleCanvases, sheetHashOf, sweepDeadClicks, sweepsWidth, typographyOf } from './design-checks.mjs';

const USAGE = 'usage: node design-round.mjs <url> --out <dir> [--steps <steps.json>] [--widths 1440x900,1280x800,1024x768,768x1024,390x844] [--gpu] [--grain baked|none] [--cta <selector>] [--brand <direction.json|DESIGN.md|brand.json|card.md>] [--intent <name|card.md>] [--kind <product|card.md>] [--scrub]';
const LOAD_MARKS = [0, 600, 2000];
const STEP_TIMEOUT_MS = 5000;
// Thresholds of the hero loop: a hero loop is 8 s or more (4 s when its seam is
// clean, as a searched loop is) and its restart jumps no more than 1.5 steps of the video.
const HERO_MIN_S = 8;
const HERO_SHORT_MIN_S = 4;
const SEAM_MAX_RATIO = 1.5;
const MEDIAN_FLOOR = 0.05;
const VIDEO_MAX_MB = 60;

const playwright = () => {
  for (const root of [process.cwd(), process.env.KIT_PLAYWRIGHT_ROOT].filter(Boolean)) {
    const req = createRequire(join(root, 'package.json'));
    for (const name of ['playwright', '@playwright/test']) {
      try { return req(name); } catch { /* next */ }
    }
  }
  return null;
};

// Runs in the page: whether the page declares a grain or noise layer. The typography comes from `collectTextBoxes` (design-checks.mjs).
export const measure = () => ({
  grain: !!document.querySelector('.grain, [class*="grain"], [class*="noise"]')
    || !!document.querySelector('feTurbulence')
    || [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => /feTurbulence|url\([^)]*noise/i.test(r.cssText)); } catch { return false; } })
    || [...document.querySelectorAll('[style]')].some((e) => /url\([^)]*noise/i.test(e.getAttribute('style'))),
});

// Runs in the page: what `responsive-classes.md` asks of the window class. Same-origin style sheets only.
export const measureResponsive = () => {
  const vw = innerWidth; const vh = innerHeight;
  const shown = (el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : ''}`;
  const rectOf = (el) => el.getBoundingClientRect();
  const size = (el) => `${label(el)} ${Math.round(rectOf(el).width)}x${Math.round(rectOf(el).height)}`;
  // Inline links inside running text are exempt from the target size (WCAG 2.5.8).
  const interactive = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [tabindex]:not([tabindex="-1"])')]
    .filter((el) => shown(el) && !(el.tagName === 'A' && getComputedStyle(el).display === 'inline'));
  const tapSmall = interactive.filter((el) => rectOf(el).width < 44 || rectOf(el).height < 44).map(size);
  const clickSmall = interactive.filter((el) => rectOf(el).width <= 24 || rectOf(el).height <= 24).map(size);
  // A card that is a button as a whole (a plan, a product) is not a control: past 64 px tall it is left out of the median.
  const heights = interactive.filter((el) => el.matches('button, [role=button], input[type=submit], input[type=button]')).map((el) => rectOf(el).height)
    .filter((h) => h <= 64).sort((a, b) => a - b);
  const medianButton = heights.length ? Math.round(heights[Math.floor(heights.length / 2)]) : null;

  const rules = [];
  const walk = (list) => { for (const r of list) { rules.push(r); if (r.cssRules) walk(r.cssRules); } };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch { /* cross-origin sheet */ } }
  const styled = rules.filter((r) => r.selectorText);
  const tailsOf = (sel, pseudo) => sel.split(',').map((part) => { const i = part.lastIndexOf(pseudo); return i < 0 ? null : part.slice(i + pseudo.length).trim(); }).filter((t) => t);
  const focusTails = new Set(styled.flatMap((r) => [':focus-within', ':focus-visible', ':focus'].flatMap((p) => tailsOf(r.selectorText, p))));
  const hoverOnly = [];
  for (const r of styled) {
    if (!r.selectorText.includes(':hover') || !(r.style.display || r.style.visibility || r.style.opacity)) continue;
    if (tailsOf(r.selectorText, ':hover').some((tail) => !focusTails.has(tail))) hoverOnly.push(r.selectorText);
  }
  const smallFields = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea')]
    .filter((el) => shown(el) && parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => `${label(el)} ${parseFloat(getComputedStyle(el).fontSize)}px`);
  const queries = rules.filter((r) => r.media).map((r) => r.media.mediaText);
  const minQ = queries.filter((q) => /min-width/.test(q)).length;
  const maxQ = queries.filter((q) => /max-width/.test(q)).length;

  const pinned = (el) => ['fixed', 'sticky'].includes(getComputedStyle(el).position);
  let covered = 0;
  for (const el of document.body.querySelectorAll('*')) {
    if (!pinned(el) || !shown(el)) continue;
    const r = rectOf(el);
    const share = (Math.max(0, Math.min(r.right, vw) - Math.max(0, r.left)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(0, r.top))) / (vw * vh);
    if (el.tagName === 'CANVAS' || el.querySelector('canvas') || share >= 0.9) continue;
    covered += Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  }
  const primary = document.querySelector('[data-kit-cta]');
  let cta = null;
  if (primary) {
    let fixedBottom = false;
    for (let p = primary; p; p = p.parentElement) if (pinned(p) && rectOf(p).bottom >= vh - 4) fixedBottom = true;
    cta = { name: size(primary), topPct: Math.round((rectOf(primary).top / vh) * 100), bottomPct: Math.round((rectOf(primary).bottom / vh) * 100), pinned: fixedBottom };
  }
  const bottomBar = [...document.body.querySelectorAll('*')].some((el) => pinned(el) && shown(el) && rectOf(el).bottom >= vh - 4 && rectOf(el).width >= vw * 0.8 && el.querySelectorAll('a[href], button').length >= 3);
  const burger = interactive.find((el) => /burger|menu-toggle|nav-toggle|menu-btn|toggle-menu|menu-button|navbar-toggler/i.test(`${el.className} ${el.id}`)
    || (el.matches('button, [role=button]') && /^(menu|menú|open menu|toggle menu|navigation)$/i.test((el.getAttribute('aria-label') || '').trim()))
    || (el.matches('button, [role=button]') && el.hasAttribute('aria-expanded') && el.closest('header, nav') && !(el.textContent || '').trim()));
  return {
    width: vw, tapSmall, clickSmall, medianButton, hoverOnly, smallFields,
    overflow: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    queries: { min: minQ, max: maxQ }, coveredPct: Math.min(100, Math.round((covered / (vw * vh)) * 100)), cta,
    nav: { bottomBar, hamburger: !!burger, hamburgerLabeled: !!burger && /menu|menú/i.test((burger.textContent || '').trim()) },
  };
};

// The rules of `responsive-classes.md` that apply to the window class of the width.
export const responsiveRules = (m) => {
  const row = (rule, value, range, pass, detail = []) => ({ rule, value, range, pass, detail });
  const out = [];
  if (m.width < 600) {
    out.push(
      row('tap targets under 44x44', m.tapSmall.length, '0', m.tapSmall.length === 0, m.tapSmall),
      row('hover-only reveals', m.hoverOnly.length, '0', m.hoverOnly.length === 0, m.hoverOnly),
      row('inputs under 16 px', m.smallFields.length, '0', m.smallFields.length === 0, m.smallFields),
      row('document overflow', m.overflow.scrollWidth > m.overflow.clientWidth ? `${m.overflow.scrollWidth} > ${m.overflow.clientWidth}` : 'none', 'none', m.overflow.scrollWidth <= m.overflow.clientWidth),
      row('media queries', `min ${m.queries.min} / max ${m.queries.max}${m.queries.max > m.queries.min ? ' · desktop-first' : ''}`, 'min >= max', m.queries.max <= m.queries.min),
      row('fixed layers (% of viewport, no canvas or scene)', m.coveredPct, '<= 20', m.coveredPct <= 20),
      m.cta
        ? { ...row('cta in first viewport (% of height)', m.cta.pinned ? `${m.cta.topPct} (pinned)` : `${m.cta.topPct}-${m.cta.bottomPct}`, 'inside the first viewport; lower half recommended', m.cta.pinned || m.cta.bottomPct <= 100, [m.cta.name]), warn: !m.cta.pinned && m.cta.bottomPct <= 100 && m.cta.topPct < 50 }
        : row('cta in first viewport (% of height)', 'no button or link', 'n/a', true),
      row('navigation, compact', m.nav.bottomBar ? 'bottom bar' : m.nav.hamburger ? (m.nav.hamburgerLabeled ? 'labeled menu' : 'bare hamburger') : 'none', 'bottom bar or labeled menu', m.nav.bottomBar || !m.nav.hamburger || m.nav.hamburgerLabeled),
    );
  }
  if (m.width >= 840) out.push(row('hamburger, expanded', m.nav.hamburger ? 'yes' : 'no', 'no', !m.nav.hamburger));
  if (m.width >= 1200) {
    out.push(
      row('clicks of 24x24 or less', m.clickSmall.length, '0', m.clickSmall.length === 0, m.clickSmall),
      row('median button height', m.medianButton ?? 'no buttons', '< 48 (all 48+ is a stretched mobile)', m.medianButton == null || m.medianButton < 48),
    );
  }
  return out;
};

// Runs in the page: each autoplaying looping video that shows in the first viewport.
export const measureVideos = async () => {
  const shown = [...document.querySelectorAll('video')].filter((v) => {
    const r = v.getBoundingClientRect(); const cs = getComputedStyle(v);
    return v.loop && (v.autoplay || v.hasAttribute('autoplay')) && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && cs.display !== 'none' && cs.visibility !== 'hidden';
  });
  const out = [];
  for (const v of shown) {
    if (v.readyState < 1) await new Promise((done) => { v.addEventListener('loadedmetadata', done, { once: true }); setTimeout(done, 4000); });
    out.push({ src: v.currentSrc || v.src || v.querySelector('source')?.src || '', duration: Number.isFinite(v.duration) ? v.duration : null });
  }
  return out;
};

const ffmpegOk = () => spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0;

// The video as a local file: a file: URL as it is, an http one downloaded (up to VIDEO_MAX_MB) into `dir`. Null when it cannot be had.
const localCopy = async (src, dir) => {
  let url;
  try { url = new URL(src); } catch { return null; }
  if (url.protocol === 'file:') return fileURLToPath(url);
  if (!/^https?:$/.test(url.protocol)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok || !res.body || Number(res.headers.get('content-length') ?? 0) > VIDEO_MAX_MB * 1048576) return null;
    const file = join(dir, 'hero-video');
    await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
    return statSync(file).size > VIDEO_MAX_MB * 1048576 ? null : file;
  } catch { return null; }
};

// Duration and seam of a video file. The seam is the jump from the last frame to the first over the median jump between
// neighbours (64x36 gray, every decoded frame), what the eye sees when the loop restarts: one continuous shot is ~1.
export const seamOf = (file) => {
  const duration = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim()) || null;
  if (!ffmpegOk()) return { duration, ratio: null };
  const raw = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-an', '-vf', 'scale=64:36,format=gray', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], { timeout: 120000, maxBuffer: 1 << 29 });
  const size = 64 * 36;
  const n = raw.status === 0 ? Math.floor(raw.stdout.length / size) : 0;
  if (n < 3) return { duration, ratio: null };
  const mad = (i, j) => { let t = 0; for (let k = 0; k < size; k++) t += Math.abs(raw.stdout[i * size + k] - raw.stdout[j * size + k]); return t / size; };
  const steps = Array.from({ length: n - 1 }, (_, i) => mad(i, i + 1)).sort((x, y) => x - y);
  const median = steps.length % 2 ? steps[(steps.length - 1) / 2] : (steps[steps.length / 2 - 1] + steps[steps.length / 2]) / 2;
  const ratio = Math.round(mad(n - 1, 0) / Math.max(median, MEDIAN_FLOOR) * 100) / 100;
  // A montage cut inside the video (scene score over 0.3) makes the restart one more cut.
  const scenes = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-vf', "scale=160:-2,select='gt(scene,0.3)',showinfo", '-an', '-f', 'null', '-'], { encoding: 'utf8', timeout: 120000 });
  const cuts = (scenes.stderr?.match(/pts_time:/g) ?? []).length;
  return { duration, ratio, cuts };
};

// Rules for the hero loops of the first viewport: 8 s or more (4 s with a clean searched seam) and a restart that is not a jump.
const seamCache = new Map();
export const videoRules = async (videos, pageUrl) => {
  const row = (rule, value, range, pass, detail = []) => ({ rule, value, range, pass, detail });
  const out = [];
  const dir = mkdtempSync(join(tmpdir(), 'kit-hero-'));
  try {
    for (const v of videos) {
      const name = v.src.split('/').pop().split('?')[0] || 'video';
      const href = new URL(v.src, pageUrl).href;
      if (!seamCache.has(href)) { const file = await localCopy(href, dir); seamCache.set(href, file ? seamOf(file) : { duration: null, ratio: null }); }
      const seam = seamCache.get(href);
      const duration = v.duration ?? seam.duration;
      const clean = seam.ratio != null && !seam.cuts && seam.ratio <= SEAM_MAX_RATIO;
      out.push(duration == null
        ? row(`hero video duration (${name})`, 'not measurable', `>= ${HERO_MIN_S} s`, false, [v.src])
        : row(`hero video duration (${name})`, `${duration.toFixed(1)} s`, `>= ${HERO_MIN_S} s, or >= ${HERO_SHORT_MIN_S} s with a clean seam`, duration >= HERO_MIN_S || (duration >= HERO_SHORT_MIN_S && clean)));
      out.push(seam.ratio == null
        ? row(`hero video seam (${name})`, 'not measurable (no ffmpeg, or the file cannot be fetched)', `seam ratio <= ${SEAM_MAX_RATIO}`, false, [v.src])
        : seam.cuts > 0
        ? row(`hero video seam (${name})`, `${seam.cuts} cuts inside: the restart is one more cut (seam ratio ${seam.ratio})`, `single shot: seam ratio <= ${SEAM_MAX_RATIO}`, true)
        : row(`hero video seam (${name})`, `seam ratio ${seam.ratio}`, `seam ratio <= ${SEAM_MAX_RATIO}`, clean, clean ? [] : ['the last frame jumps to the first more than a step of the video: search the loop point or crossfade it with ffmpeg']));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return out;
};

// Runs in the page: the WebGL renderer, or null without WebGL.
const rendererOf = () => {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : null);
  } catch { return null; }
};

// The rules of `excellence.md` that a measure decides: value, range and whether it passes.
// A product page (`product` true) keeps the rows that hold on any screen: tracking and grain are landing rules, and grain is never required.
export const rulesOf = (m, grainDecl = false, product = false) => {
  const grainBaked = grainDecl === true || grainDecl === 'baked';
  const row = (rule, value, range, pass) => ({ rule, value, range, pass: value == null ? false : pass });
  return [
    { ...row('display/body ratio', m.ratio, 'report only: winners median 2.9x, 2-9x', true), report: true },
    { ...row('display line height', m.displayLineHeight, 'report only: winners median 1.0', true), report: true },
    ...(product ? [] : [
    row('display tracking (em)', m.displayTrackingEm, '-0.03..-0.02', m.displayTrackingEm <= -0.02 && m.displayTrackingEm >= -0.05),
    row('body tracking (em)', m.bodyTrackingEm, '0..0.02', m.bodyTrackingEm >= 0 && m.bodyTrackingEm <= 0.02)]),
    row('font sizes, first viewport', m.sizeCount, '<= 9', m.sizeCount <= 9),
    ...(product ? [] : [row('grain or noise', m.grain ? 'yes' : grainBaked ? 'baked (declared)' : grainDecl === 'none' ? 'none (declared)' : 'no', 'a texture, or none declared', m.grain || grainBaked || grainDecl === 'none')]),
  ];
};

// The load waves out of motion-audit's `load` list: `startMs` grouped every 100 ms.
export const loadWaves = (load) => {
  const moving = load.filter((l) => l.endMs > l.startMs);
  if (!moving.length) return { waves: [], gapsMs: [], totalMs: 0 };
  const starts = moving.map((l) => l.startMs).sort((a, b) => a - b);
  const waves = [...new Set(starts.map((s) => Math.floor(s / 100) * 100))];
  return { waves, gapsMs: waves.slice(1).map((w, i) => w - waves[i]), totalMs: Math.round(Math.max(...moving.map((l) => l.endMs)) - starts[0]) };
};
// The load waves are a landing rule: a product page has no rows here.
export const loadRules = (w, product = false) => {
  const row = (rule, value, range, pass) => ({ rule, value, range, pass });
  if (product) return [];
  return [
    row('load waves', w.waves.length, '2-3', w.waves.length >= 2 && w.waves.length <= 3),
    row('load wave gap (ms)', w.gapsMs.length ? w.gapsMs.join('/') : '-', '200-300', w.gapsMs.length > 0 && w.gapsMs.every((g) => g >= 200 && g <= 300)),
    row('load total (ms)', w.totalMs, '900-2000', w.totalMs >= 900 && w.totalMs <= 2000),
  ];
};

// Runs in the page: scrolls to y through Lenis when the page exposes it, else window.scrollTo, then lets ScrollTrigger read the position.
const scrollPath = (y) => {
  const lenis = window.lenis || window.__lenis;
  if (lenis && typeof lenis.scrollTo === 'function') lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
  window.ScrollTrigger?.update?.();
};

// Runs in the page, at scroll 0: the pinned ranges in scroll px (sticky blocks of half a viewport or more, ScrollTrigger pins) and the total scroll.
export const findPins = () => {
  const vh = innerHeight;
  const total = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - vh;
  const docTop = (el) => el.getBoundingClientRect().top + scrollY;
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : ''}`;
  const pins = [];
  for (const t of window.ScrollTrigger?.getAll?.() ?? []) if (t.pin) pins.push({ kind: 'ScrollTrigger', label: label(t.pin), start: Math.round(t.start), end: Math.round(t.end) });
  for (const el of document.body.querySelectorAll('*')) {
    if (getComputedStyle(el).position !== 'sticky' || !el.parentElement) continue;
    const h = el.getBoundingClientRect().height;
    if (h < 0.5 * vh) continue;
    const top = parseFloat(getComputedStyle(el).top) || 0;
    const start = Math.round(docTop(el.parentElement) - top); const end = Math.round(docTop(el.parentElement) + el.parentElement.offsetHeight - h - top);
    if (end - start >= 0.25 * vh) pins.push({ kind: 'sticky', label: label(el), start, end });
  }
  return { pins, total };
};

// Pure: the pins without duplicates (same range within 8 px), the 5 frames across each and the first after it, and the share of the scroll they take.
export const scrubPlan = ({ pins, total }, vh) => {
  const list = [];
  for (const p of [...pins].sort((x, y) => x.start - y.start || x.end - y.end)) {
    if (p.end <= p.start) continue;
    if (!list.some((q) => Math.abs(q.start - p.start) <= 8 && Math.abs(q.end - p.end) <= 8)) list.push({ ...p, length: p.end - p.start });
  }
  let covered = 0; let edge = -Infinity;
  for (const p of list) { const from = Math.max(p.start, edge); if (p.end > from) covered += p.end - from; edge = Math.max(edge, p.end); }
  const clamp = (y) => Math.max(0, Math.min(total, Math.round(y)));
  const frames = list.flatMap((p, i) => [
    ...[0, 1, 2, 3, 4].map((k) => ({ y: clamp(p.start + (p.length * k) / 4), name: `pin-${i + 1}-${k + 1}` })),
    ...(clamp(p.end + 0.25 * vh) > clamp(p.end) ? [{ y: clamp(p.end + 0.25 * vh), name: `pin-${i + 1}-after` }] : []),
  ]);
  return { total, pins: list, frames, sharePct: total > 0 ? Math.round((covered / total) * 100) : 0 };
};

// The row of the pins: report only, with the length of each and the share of the total scroll.
export const scrubRows = (s) => (!s ? [] : [{
  rule: 'pinned scroll', value: `${s.pins.length} pins, ${s.sharePct}% of ${s.total} px`, range: 'report only: pin lengths and their share of the scroll', pass: true, report: true,
  detail: s.pins.map((p, i) => `pin ${i + 1} ${p.kind} ${p.label}: ${p.start}-${p.end} px, ${p.length} px${p.end >= s.total ? ' (never releases before the end)' : ''}`),
}]);

const runStep = async (page, step, base) => {
  const loc = (s) => page.locator(s).first();
  if ('goto' in step) await page.goto(new URL(step.goto, base).href, { waitUntil: 'load', timeout: STEP_TIMEOUT_MS * 3 });
  else if ('fill' in step) await loc(step.fill).fill(step.value ?? '', { timeout: STEP_TIMEOUT_MS });
  else if ('click' in step) await loc(step.click).click({ timeout: STEP_TIMEOUT_MS });
  else if ('press' in step) await (step.on ? loc(step.on).press(step.press, { timeout: STEP_TIMEOUT_MS }) : page.keyboard.press(step.press));
  else if ('select' in step) await loc(step.select).selectOption(step.value ?? '', { timeout: STEP_TIMEOUT_MS });
  else if ('scroll' in step) { await loc(step.scroll).evaluate((el) => el.scrollIntoView({ block: 'start' })); await page.waitForTimeout(400); }
  else if (typeof step.wait === 'number') await page.waitForTimeout(step.wait);
  else if ('wait' in step) await loc(step.wait).waitFor({ timeout: STEP_TIMEOUT_MS });
};

const SHEET_MAX = 24;
const SHEET_W = 1600;
export const sheet = async (argv) => {
  const args = [...argv];
  const take = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args.splice(i, 2)[1]; };
  const dir = take('--sheet'); const out = take('--out') ?? dir;
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory() || args.length) return { code: 2, message: 'usage: node design-round.mjs --sheet <ref-dir> [--out <dir>]' };
  const files = readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f) && !/^sheet-/.test(f)).sort();
  if (!files.length) return { code: 2, message: `no png or jpg in ${dir}` };
  const pw = playwright();
  if (!pw) return { code: 2, message: 'could not run: Playwright not found in the repo or KIT_PLAYWRIGHT_ROOT' };
  const groups = new Map();
  for (const f of files) { const w = /-(\d{3,4})-\d+\.\w+$/.exec(f)?.[1] ?? 'all'; groups.set(w, [...(groups.get(w) ?? []), f]); }
  mkdirSync(out, { recursive: true });
  const browser = await pw.chromium.launch({ channel: 'chromium' }).catch(() => pw.chromium.launch());
  const lines = [];
  try {
    for (const [w, list] of groups) {
      const cols = w !== 'all' && Number(w) < 1000 ? 8 : 4;
      const cell = Math.floor(SHEET_W / cols) - 8;
      for (let k = 0; k * SHEET_MAX < list.length; k++) {
        const part = list.slice(k * SHEET_MAX, (k + 1) * SHEET_MAX);
        const cells = part.map((f) => {
          const mime = /\.png$/i.test(f) ? 'png' : 'jpeg';
          return `<figure><img src="data:image/${mime};base64,${readFileSync(join(dir, f)).toString('base64')}"><figcaption>${f.replace(/\.\w+$/, '')}</figcaption></figure>`;
        }).join('');
        const page = await browser.newPage({ viewport: { width: SHEET_W, height: 400 } });
        await page.setContent(`<style>body{margin:0;padding:4px;background:#222;display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:8px;align-items:start;font:11px sans-serif;color:#eee}figure{margin:0}img{width:${cell}px;height:auto;max-height:${Math.round(cell * 1.6)}px;object-fit:cover;object-position:top;display:block}figcaption{padding:2px 0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}</style>${cells}`);
        await page.waitForFunction(() => [...document.images].every((i) => i.complete));
        const file = join(out, `sheet-${w}${list.length > SHEET_MAX ? `-${k + 1}` : ''}.jpg`);
        await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 70 });
        await page.close();
        lines.push(`${file} (${part.length} captures, width ${w})`);
      }
    }
  } finally { await browser.close(); }
  return { code: 0, message: lines.join('\n') };
};

const REF_VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
const REF_SCROLLS = 9;
const REF_SETTLE_MS = 3000;
const REF_RETRY_SETTLE_MS = 8000;
const REF_GOTO_MS = 45000;
const REF_NAME = /^[a-z0-9]+(-[a-z0-9]+)+$/;
const pad = (n) => String(n).padStart(2, '0');
// The first same-origin page the site links to (header and nav first), never an anchor, a login or the page itself.
const innerLink = () => {
  const here = location.pathname.replace(/\/$/, '');
  const ok = (a) => { try { const u = new URL(a.href); return u.origin === location.origin && u.pathname.replace(/\/$/, '') !== here && !/log[-_]?in|sign[-_]?(in|up)|auth/i.test(u.pathname); } catch { return false; } };
  const links = [...document.querySelectorAll('header a[href], nav a[href]'), ...document.querySelectorAll('a[href]')];
  return links.find(ok)?.href ?? null;
};
const openRef = async (browser, url, viewport, settle) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const response = await page.goto(url, { waitUntil: 'load', timeout: REF_GOTO_MS }).catch(() => null);
  await page.waitForTimeout(settle);
  return { context, page, response, wall: response ? await wallOf(page, response, url) : 'no response' };
};
const captureEntry = async (page, response, file) => ({
  file, status: response?.status() ?? 0, title: await page.title(),
  text: ((await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')) || '').slice(0, 600),
});
export const capture = async (argv) => {
  const args = [...argv];
  const take = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args.splice(i, 2)[1]; };
  const url = take('--ref'); const name = take('--name'); const out = take('--out');
  if (!url || !/^https?:\/\//.test(url) || !REF_NAME.test(name ?? '') || !out || args.length) return { code: 2, message: 'usage: node design-round.mjs --ref <url> --name <genre>-<site> --out specs/<card>/ref' };
  const pw = playwright();
  if (!pw) return { code: 2, message: 'could not run: Playwright not found in the repo or KIT_PLAYWRIGHT_ROOT' };
  mkdirSync(out, { recursive: true });
  const browser = await pw.chromium.launch({ channel: 'chromium' }).catch(() => pw.chromium.launch());
  const entries = []; const lines = [];
  try {
    for (const viewport of REF_VIEWPORTS) {
      let r = await openRef(browser, url, viewport, REF_SETTLE_MS);
      if (r.wall) { await r.context.close(); r = await openRef(browser, url, viewport, REF_RETRY_SETTLE_MS); }
      if (r.wall) { await r.context.close(); return { code: 2, message: `${wallMessage(url, r.wall)}; retried once with a fresh context and ${REF_RETRY_SETTLE_MS} ms` }; }
      const { page, response } = r;
      for (let i = 1; i <= REF_SCROLLS; i++) {
        const file = `${name}-${viewport.width}-${pad(i)}.png`;
        await page.screenshot({ path: join(out, file) });
        entries.push(await captureEntry(page, response, file));
        await page.mouse.wheel(0, Math.round(viewport.height * 0.85));
        await page.waitForTimeout(600);
      }
      await page.evaluate(() => scrollTo(0, 0));
      const inner = await page.evaluate(innerLink).catch(() => null);
      if (inner) {
        const res = await page.goto(inner, { waitUntil: 'load', timeout: REF_GOTO_MS }).catch(() => null);
        await page.waitForTimeout(REF_SETTLE_MS);
        if (res && !(await wallOf(page, res, inner))) {
          const file = `${name}-${viewport.width}-${pad(REF_SCROLLS + 1)}.png`;
          await page.screenshot({ path: join(out, file) });
          entries.push(await captureEntry(page, res, file));
        }
      }
      await r.context.close();
      lines.push(`${viewport.width}: ${entries.filter((e) => e.file.includes(`-${viewport.width}-`)).length} captures${inner ? ` (inner page ${new URL(inner).pathname})` : ', no inner page linked'}`);
    }
  } finally { await browser.close(); }
  const manifestFile = join(out, 'captures.json');
  let manifest = [];
  try { manifest = JSON.parse(readFileSync(manifestFile, 'utf8')); } catch { /* first reference */ }
  const files = new Set(entries.map((e) => e.file));
  writeFileSync(manifestFile, JSON.stringify([...(Array.isArray(manifest) ? manifest : []).filter((e) => !files.has(e.file)), ...entries], null, 1));
  const sheets = await sheet(['--sheet', out]);
  // Serial, after the captures: a browser running beside motion-audit would move its timings.
  const motionDir = mkdtempSync(join(tmpdir(), 'ref-motion-'));
  const ma = spawnSync(process.execPath, [join(import.meta.dirname, 'motion-audit.mjs'), url, '--measure', '--frames', '--scroll-story', '--out', motionDir], { encoding: 'utf8', timeout: 240000, env: process.env });
  let motion;
  if (existsSync(join(motionDir, 'report.json'))) {
    const report = readFileSync(join(motionDir, 'report.json'));
    writeFileSync(join(out, `motion-${name}.json`), report);
    const first = !existsSync(join(out, 'motion.json'));
    if (first) writeFileSync(join(out, 'motion.json'), report);
    motion = `motion: ${out}/motion-${name}.json${first ? ', also motion.json' : ''}`;
  } else motion = `motion: could not run (motion-audit exit ${ma.status}): ${(ma.stderr || ma.stdout || '').trim().split('\n')[0]}`;
  rmSync(motionDir, { recursive: true, force: true });
  return { code: sheets.code, message: [`${url} → ${out}/${name}-<width>-<NN>.png`, ...lines, `captures.json: ${entries.length} entries`, sheets.message, motion].join('\n') };
};

const parseArgs = (argv) => {
  const args = [...argv];
  const take = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args.splice(i, 2)[1]; };
  const gpu = args.includes('--gpu');
  if (gpu) args.splice(args.indexOf('--gpu'), 1);
  const out = take('--out'); const steps = take('--steps'); const widths = take('--widths') ?? '1440x900,1280x800,1024x768,768x1024,390x844';
  const grainFlag = take('--grain'); const cta = take('--cta'); const brandFile = take('--brand'); const intentArg = take('--intent'); const kindArg = take('--kind');
  const scrub = args.includes('--scrub');
  if (scrub) args.splice(args.indexOf('--scrub'), 1);
  const [url, ...extra] = args;
  const viewports = widths.split(',').map((v) => { const [w, h = '900'] = v.trim().split('x'); return { width: Number(w), height: Number(h) }; });
  if (!url || extra.length || !out || (cta !== undefined && !cta) || (brandFile !== undefined && !brandFile) || (intentArg !== undefined && !intentArg) || (kindArg !== undefined && !kindArg) || (grainFlag !== undefined && !['baked', 'none'].includes(grainFlag)) || viewports.some(({ width, height }) => !(width >= 200 && width <= 3000 && height >= 200 && height <= 3000))) return { error: USAGE };
  return { url, out: resolve(out), steps, viewports, gpu, cta, brandFile, grain: grainFlag ?? false, intentArg, kindArg, scrub };
};

// Chromium answers «Unable to capture screenshot» when the compositor yields no frame, seen on documents tens of pages tall:
// the capture is tried again, then read straight from the surface. The caller records one that still fails and goes on.
export const UNCAPTURED = /Unable to capture screenshot/i;
export const viewportShot = async (page, ctx, file, timeout) => {
  try { return await page.screenshot({ path: file, timeout }); } catch (e) { if (!UNCAPTURED.test(e.message)) throw e; }
  await page.waitForTimeout(500);
  try { return await page.screenshot({ path: file, timeout, animations: 'disabled' }); } catch (e) { if (!UNCAPTURED.test(e.message)) throw e; }
  const cdp = await ctx.newCDPSession(page);
  try {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(file, Buffer.from(data, 'base64'));
  } finally { await cdp.detach().catch(() => {}); }
};

export const round = async (argv) => {
  if (argv.includes('--sheet')) return sheet(argv);
  if (argv.includes('--ref')) return capture(argv);
  const a = parseArgs(argv);
  if (a.error) return { code: 2, message: a.error };
  let steps = null;
  if (a.steps) {
    let list;
    try { list = JSON.parse(readFileSync(resolve(a.steps), 'utf8')); } catch (e) { return { code: 2, message: `${a.steps}: ${e.message}` }; }
    const parsed = parseSteps(list, a.url);
    if (parsed.error) return { code: 2, message: `${a.steps}: ${parsed.error}` };
    steps = parsed.steps;
  }
  const pw = playwright();
  if (!pw) return { code: 2, message: 'could not run: Playwright is not installed here nor at KIT_PLAYWRIGHT_ROOT' };
  let brand = null;
  if (a.brandFile) { try { brand = loadBrand(resolve(a.brandFile)); } catch (e) { return { code: 2, message: `${a.brandFile}: ${e.message}` }; } }
  let intent = null;
  if (a.intentArg) {
    try { intent = loadIntent(a.intentArg); } catch { intent = null; }
    if (!intent) return { code: 2, message: `--intent ${a.intentArg}: not one of collage, statement, grid, pinned-media, and no intent: line in the ## Look section` };
  }
  let look = null;
  if (a.kindArg) {
    try { look = loadProduct(a.kindArg); } catch { look = null; }
    if (!look) return { code: 2, message: `--kind ${a.kindArg}: not \`product\`, and no \`ref-kind: product\` line in the ## Look section` };
  }
  mkdirSync(a.out, { recursive: true });
  const launchArgs = a.gpu ? (process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] : ['--enable-gpu-rasterization', '--ignore-gpu-blocklist']) : [];
  const launch = (args) => pw.chromium.launch({ channel: 'chromium', args }).catch(() => pw.chromium.launch({ args }));
  let browser = await launch(launchArgs);
  // The sheet the round was held to, for the gate: relative to the working directory (the repo root) when it lies inside it.
  const sheetPath = a.brandFile ? relative(process.cwd(), resolve(a.brandFile)) : null;
  const held = brand ? { file: (sheetPath.startsWith('..') || isAbsolute(sheetPath) ? resolve(a.brandFile) : sheetPath).replace(/\\/g, '/'), ...brand, sheetHash: sheetHashOf(resolve(a.brandFile)) } : null;
  const result = { url: a.url, intent, kind: look ? 'product' : 'landing', brand: held, gpu: a.gpu, path: a.gpu ? 'gpu' : 'non-gpu', cta: {}, renderer: null, software: null, widths: {}, console: [], captures: [], load: null, motion: null };
  try {
    for (let vi = 0; vi < a.viewports.length; vi++) {
      const { width, height } = a.viewports[vi];
      const key = `${width}x${height}`;
      let ctx = null;
      try {
        const dir = join(a.out, key);
        mkdirSync(dir, { recursive: true });
        ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: width < 700, hasTouch: width < 700 });
        const page = await ctx.newPage();
        page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) result.console.push({ width: key, type: m.type(), text: m.text().slice(0, 300) }); });
        page.on('pageerror', (e) => result.console.push({ width: key, type: 'error', text: String(e.message).slice(0, 300) }));
        // With --gpu a timed-out capture is tried once more with a longer timeout; a second timeout moves the round to the non-GPU path.
        const patient = async (fn) => { try { return await fn(30000); } catch (e) { if (!(a.gpu && result.path === 'gpu' && /timeout/i.test(`${e.name} ${e.message}`))) throw e; return fn(90000); } };
        const shot = async (name) => {
          const file = join(dir, `${name}.png`);
          try { await patient((timeout) => viewportShot(page, ctx, file, timeout)); } catch (e) {
            if (!UNCAPTURED.test(e.message)) throw e;
            result.console.push({ width: key, type: 'step-error', text: `capture ${name}: ${String(e.message).split('\n')[0]}` });
            return;
          }
          result.captures.push(file);
        };
        const t0 = Date.now();
        let response;
        try { response = await page.goto(a.url, { waitUntil: 'commit', timeout: 20000 }); } catch (e) { await ctx.close(); return { code: 2, message: `could not run: ${a.url} does not answer (${String(e.message).split('\n')[0]})` }; }
        for (const mark of LOAD_MARKS) {
          const wait = mark - (Date.now() - t0);
          if (wait > 0) await page.waitForTimeout(wait);
          await shot(`load-${String(mark).padStart(4, '0')}ms`);
        }
        await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
        if (result.renderer === null) {
          result.renderer = await page.evaluate(rendererOf).catch(() => null);
          result.software = result.renderer ? /swiftshader|llvmpipe|software/i.test(result.renderer) : null;
        }
        const wall = await wallOf(page, response, a.url);
        if (wall) { await ctx.close(); return { code: 2, message: wallMessage(a.url, wall) }; }
        result.cta[key] = await page.evaluate(pickCta, a.cta ?? null).catch(() => ({ none: true, reason: 'could not measure' }));
        const tb = await page.evaluate(collectTextBoxes).catch(() => null);
        const m = { ...await page.evaluate(measure), ...(tb?.boxes.length ? typographyOf(tb) : {}) };
        const canvas = await sampleCanvases(page, 't0+2s').catch(() => []);
        const responsive = await page.evaluate(measureResponsive);
        result.widths[key] = { measure: m, responsive, rules: [...rulesOf(m, a.grain, !!look), ...responsiveRules(responsive), ...await videoRules(await page.evaluate(measureVideos).catch(() => []), page.url())] };
        const sections = await page.evaluate(() => {
          const els = [...document.querySelectorAll('section, [data-section]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; });
          els.forEach((e, i) => e.setAttribute('data-design-round', String(i)));
          return els.length;
        });
        for (let i = 0; i < sections; i++) {
          await patient((timeout) => page.locator(`[data-design-round="${i}"]`).evaluate((el) => el.scrollIntoView({ block: 'start' }), undefined, { timeout }));
          await page.waitForTimeout(500);
          await shot(`section-${String(i + 1).padStart(2, '0')}`);
        }
        await page.evaluate(() => { document.querySelectorAll('[data-design-round]').forEach((e) => e.removeAttribute('data-design-round')); window.scrollTo(0, 0); });
        const layout = await page.evaluate(measureLayout).catch(() => null);
        const product = look ? await page.evaluate(measureProduct).catch(() => null) : null;
        if (steps) {
          for (const [i, step] of steps.entries()) {
            try { await runStep(page, step, a.url); } catch (e) { result.console.push({ width: key, type: 'step-error', text: `${JSON.stringify(step)}: ${String(e.message).split('\n')[0]}` }); }
            await shot(`step-${String(i + 1).padStart(2, '0')}-${Object.keys(step)[0]}`);
          }
        }
        const frames = []; const painted = [];
        const pageH = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
        for (let f = 0; f < Math.min(FRAME_MAX, Math.max(1, Math.ceil(pageH / height))); f++) {
          const y = Math.min(f * height, Math.max(0, pageH - height));
          await page.evaluate(scrollPath, y);
          await page.waitForTimeout(f ? 350 : 500);
          const fm = await page.evaluate(measureFrame).catch(() => null);
          if (fm) frames.push({ frame: f + 1, y, ...fm, flags: frameFlags(fm, width, f, look ? 'product' : intent), reported: frameReports(fm, width, f, look ? 'product' : intent) });
          painted.push(await paintedTexts(page).catch((e) => { result.console.push({ width: key, type: 'step-error', text: `painted text at y=${y}: ${String(e.message).split('\n')[0]}` }); return []; }));
          canvas.push(...await sampleCanvases(page, `after scroll to y=${y}`).catch(() => []));
        }
        let scrub = null;
        if (a.scrub) {
          await page.evaluate(scrollPath, 0);
          await page.waitForTimeout(400);
          const found = await page.evaluate(findPins).catch(() => null);
          if (found) {
            scrub = scrubPlan(found, height);
            mkdirSync(join(dir, 'scrub'), { recursive: true });
            for (const fr of scrub.frames) {
              await page.evaluate(scrollPath, fr.y);
              await page.waitForTimeout(450);
              await shot(`scrub/${fr.name}`);
            }
          }
        }
        const palette = await page.evaluate(collectPalette).catch(() => null);
        if (palette) palette.painted = mergePainted(painted);
        const fonts = await page.evaluate(collectFonts).catch(() => null);
        await ctx.close();
        const device = { viewport: { width, height }, isMobile: width < 700, hasTouch: width < 700 };
        let images = null;
        try {
          const ictx = await browser.newContext({ ...device, deviceScaleFactor: DPR });
          await ictx.addInitScript(LCP_INIT);
          const ip = await ictx.newPage();
          await ip.goto(a.url, { waitUntil: 'load', timeout: 20000 });
          await ip.evaluate(markVisibleAtT0);
          await ip.waitForTimeout(400);
          const h = await ip.evaluate(() => document.documentElement.scrollHeight);
          for (let y = 0; y < h; y += height) { await ip.evaluate((to) => window.scrollTo(0, to), y); await ip.waitForTimeout(120); }
          await ip.evaluate(() => window.scrollTo(0, 0));
          await ip.waitForTimeout(300);
          images = await ip.evaluate(measureImages, { margin: PASTED_MARGIN, dpr: DPR });
          await ictx.close();
        } catch (e) { result.console.push({ width: key, type: 'step-error', text: `image checks: ${String(e.message).split('\n')[0]}` }); }
        let sweep = null;
        if (sweepsWidth(width)) {
          try {
            const sctx = await browser.newContext({ ...device, deviceScaleFactor: 1 });
            const sp = await sctx.newPage();
            await sp.goto(a.url, { waitUntil: 'load', timeout: 20000 });
            await sp.waitForTimeout(800);
            sweep = await sweepDeadClicks(sctx, sp, a.url, { width, touch: width < 700, dir });
            await sctx.close();
          } catch (e) { result.console.push({ width: key, type: 'step-error', text: `dead-click sweep: ${String(e.message).split('\n')[0]}` }); }
        }
        Object.assign(result.widths[key], { frames, images, sweep, canvas, scrub, layout, product });
        result.widths[key].rules.push(...designRows({ sweep, frames, width, images, palette, fonts, brand, canvas, layout, product, look }), ...scrubRows(scrub));
      } catch (e) {
        if (!(a.gpu && result.path === 'gpu' && /timeout/i.test(`${e.name} ${e.message}`))) throw e;
        await Promise.race([ctx?.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
        await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 10000))]);
        browser = await launch([]);
        result.path = `non-gpu (fallback at ${key}: ${String(e.message).split('\n')[0].slice(0, 120)})`;
        result.renderer = null; result.software = null;
        result.captures = result.captures.filter((f) => !f.startsWith(join(a.out, key)));
        result.console = result.console.filter((c) => c.width !== key);
        vi--;
      }
    }
  } finally { await browser.close(); }
  if (!look) for (const r of crossWidthRows(result.widths)) result.widths[r.widest].rules.push(r);

  // Serial, after the viewports: motion-audit times the load waves, and a browser running beside it would move them.
  // A report left by an earlier round is deleted first, so a crashed audit is not read as this round's.
  const motionDir = join(a.out, 'motion');
  const reportFile = join(motionDir, 'report.json');
  rmSync(reportFile, { force: true });
  const ma = spawnSync(process.execPath, [join(import.meta.dirname, 'motion-audit.mjs'), a.url, '--measure', ...(look ? ['--kind', 'product'] : []), '--out', motionDir], { encoding: 'utf8', timeout: 180000, env: process.env });
  if (existsSync(reportFile)) {
    const r = JSON.parse(readFileSync(reportFile, 'utf8'));
    result.load = loadWaves(r.load ?? []);
    result.load.rules = loadRules(result.load, !!look);
    result.motion = { report: reportFile, staggerMs: r.grammar?.staggerMs ?? null };
  } else result.motion = { error: `motion-audit did not write a report (exit ${ma.status}): ${(ma.stderr || ma.stdout || '').trim().split('\n')[0]}` };

  writeFileSync(join(a.out, 'round.json'), JSON.stringify(result, null, 1));
  const lines = [`design-round · ${a.url}${intent ? ` · intent: ${intent}` : ''}${look ? ' · kind: product' : ''}`, `path: ${result.path}`, `renderer: ${result.renderer ?? 'none (no WebGL)'}${result.software ? ' · SOFTWARE: motion times do not count' : ''}`];
  for (const [key, w] of Object.entries(result.widths)) {
    lines.push(`-- ${key}`);
    const c = result.cta[key];
    lines.push(c?.none ? `  cta: none (${c.reason})` : c ? `  cta: "${c.text}" ${c.selector} (${c.reason})` : '  cta: not measured');
    for (const r of w.rules) {
      if (r.value === 'baked (declared)') lines.push('  pass  grain: baked (declared)');
      else if (r.value === 'none (declared)') lines.push('  pass  grain: none (declared)');
      else lines.push(`  ${r.pass ? (r.report ? 'info' : r.warn ? 'warn' : 'pass') : 'FAIL'}  ${r.rule}: ${r.value ?? 'n/a'} (range ${r.range})${r.warn ? ' · above the lower half: out of the thumb zone' : ''}`);
      if (!r.pass && r.detail?.length) lines.push(...r.detail.slice(0, 8).map((d) => `        ${d}`));
    }
    if (w.frames?.length) lines.push(...frameTable(w.frames));
  }
  lines.push('-- load');
  if (result.load) for (const r of result.load.rules) lines.push(`  ${r.pass ? 'pass' : 'FAIL'}  ${r.rule}: ${r.value} (range ${r.range})`);
  else lines.push(`  could not measure: ${result.motion.error}`);
  lines.push(`-- console: ${result.console.length} error or warning lines`);
  for (const c of result.console.slice(0, 10)) lines.push(`  [${c.width}] ${c.type}: ${c.text}`);
  lines.push(`-- captures (${result.captures.length})`, ...result.captures.map((f) => `  ${f}`), `round.json: ${join(a.out, 'round.json')}`);
  return { code: 0, message: lines.join('\n') };
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    const doc = [];
    for (const l of readFileSync(import.meta.filename, 'utf8').split('\n').slice(1)) { if (!l.startsWith('//')) break; doc.push(l.replace(/^\/\/ ?/, '')); }
    console.log(doc.slice(0, doc.findIndex((l) => l.startsWith('Measured'))).join('\n'));
    process.exit(0);
  }
  try {
    const { code, message } = await round(argv);
    (code === 0 ? console.log : console.error)(message);
    process.exit(code);
  } catch (e) { console.error(`could not run: ${e.message}`); process.exit(2); }
}
