// The browser side of `app.mjs probe`: drives the shared app (`.validation/app.json`) through a list of simple
// steps at several widths and writes, per step and width, `.validation/probe/w<width>-step<NN>.png` and `.json`.
// Playwright comes from the repo it runs in, or from KIT_PLAYWRIGHT_ROOT; axe from `axe-core` there, or AXE_CORE.
// `help.mjs judge` prints FLAGS, ACTION_DOC, EXAMPLE_STEPS, DEFAULT_OUT and RECORD_FIELDS from here: what a judge is told
// about the probe is what the code accepts.
// Measured: the reviewing agents each wrote their own script to read the same things from the app —
// the focus, what a status region says, whether the page scrolls sideways, whether a node was really gone, the
// contrast of a button —and each script's setup errors cost more than the judgment.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { wallOf, BotWall, productRefOf } from './bot-wall.mjs';

// One entry per flag: how it is written, what it does, and whether it may be repeated.
export const FLAGS = [
  { use: '--widths 320,390,1280', note: 'viewports, comma separated: a width in px (200 to 3000, height 900) or `<width>x<height>` (`1440x900,390x844`: the sizes the visual rounds are captured at); the default is 320,390,1280' },
  { use: '--route "METHOD /path=<status>|hold"', note: 'the app\'s backend answers that method and path with the status, or never (`hold`: the request stays pending)', repeat: true },
  { use: '--axe', note: 'axe violations of the page after each step' },
  { use: '--watch <locator>', note: 'count of the locator at t=0 and +500 ms after each step (a node that is really gone is 0 at t=0)', repeat: true },
  { use: '--contrast "<selector>[,<selector>…]"', note: 'per selector and step: text color, effective background, font size and weight, contrast ratio, AA yes or no' },
  { use: '--enter-skip "<selector>[,<selector>…]"', note: 'css selectors of the controls `enter-each` does not fail for (a control that does not submit on Enter by design)' },
  { use: '--url <app url>', note: 'probe another app than the one of APP_URL or .validation/app.json' },
  { use: '--out <folder>', note: 'write there instead of .validation/probe (relative to the repo or absolute; never the repo, a folder above it, or one with .git or specs)' },
  { use: '--quiet', note: 'print nothing' },
];
export const USAGE = `usage: node app.mjs probe <steps.json> ${FLAGS.map((f) => `[${f.use}]${f.repeat ? '…' : ''}`).join(' ')}`;

// One action per step; `value` and `on` go beside it.
export const ACTION_DOC = {
  goto: '{ "goto": "/path" }  navigates; only inside the app',
  fill: '{ "fill": "<locator>", "value": "text" }',
  click: '{ "click": "<locator>" }',
  press: '{ "press": "Enter" }  a key to the page, or to a locator with "on": "<locator>"',
  select: '{ "select": "<locator>", "value": "option" }',
  wait: '{ "wait": 300 }  milliseconds, or { "wait": "<locator>" } until it shows',
  scroll: '{ "scroll": "<locator>" }  brings the section to the top of the viewport: the capture of that step is that section, never the whole page',
  'enter-each': '{ "enter-each": "<form locator>" }  per field of the form that is not a textarea or a button: replays the steps before this one, focuses it, presses Enter and records whether the form submitted (`enter` in the JSON); one that did not fails the probe unless `--enter-skip` names it',
  'type-markup': '{ "type-markup": "<locator>" }  types `<b data-kit-markup>x</b>` into the field; if any `[data-kit-markup]` element exists afterwards the probe fails: a user text was read as HTML',
};
const ACTIONS = Object.keys(ACTION_DOC);
export const EXAMPLE_STEPS = [
  { goto: '/' },
  { fill: 'input[name=title]', value: 'Buy milk' },
  { select: 'select#status', value: 'done' },
  { press: 'Enter', on: 'input[name=title]' },
  { click: 'role=button[name="Add"]' },
  { wait: 'text=Added' },
  { wait: 300 },
];
export const DEFAULT_OUT = '.validation/probe';
export const RECORD_FIELDS = 'width, height, step, action, url, error, activeElement (tag, id, role, name, aria), announcements (role=status/alert texts), scrollWidth and clientWidth, animations running, axe (null without --axe), watch (per --watch locator: t0, t500), contrast (per --contrast selector; a disabled element is `skipped: disabled` unless it is busy: `aria-busy="true"` or a label ending in «…»), enter (per `enter-each` step: control, submitted), markup (after a `type-markup`: elements found), statusContrast (always: the alerts, live regions, invalid fields, what their aria-describedby points to and the busy buttons), design (always: font families and sizes in use, and the action controls with no transition or animation), reduced (the last step: the large or continuous movement left with prefers-reduced-motion)';

const STEP_TIMEOUT_MS = 5000;
const WATCH_DELAY_MS = 500;

// The steps file, checked before a browser opens: a list of one-action objects, `goto` only inside the app.
export const parseSteps = (list, appUrl) => {
  if (!Array.isArray(list) || !list.length) return { error: 'the steps file is a non-empty JSON list of steps' };
  const origin = new URL(appUrl).origin;
  for (const [i, step] of list.entries()) {
    const n = i + 1;
    const actions = ACTIONS.filter((a) => step && typeof step === 'object' && a in step);
    if (actions.length !== 1) return { error: `step ${n}: unknown action (one of ${ACTIONS.join(', ')} per step)` };
    const value = step[actions[0]];
    if (actions[0] === 'wait' ? !(typeof value === 'number' && value >= 0 || typeof value === 'string' && value) : typeof value !== 'string' || !value)
      return { error: `step ${n}: ${actions[0]} needs ${actions[0] === 'wait' ? 'milliseconds or a locator' : 'a string'}` };
    if (actions[0] === 'goto' && new URL(value, appUrl).origin !== origin) return { error: `step ${n}: ${value} is outside the app (${origin})` };
  }
  return { steps: list };
};

// `POST /x=201`: the method, the path and what the app's backend answers; `hold` never answers.
export const parseRoute = (text) => {
  const m = text.match(/^([A-Za-z]+)\s+(\S+?)=(\d{3}|hold)$/);
  return m ? { method: m[1].toUpperCase(), path: m[2], answer: m[3] === 'hold' ? 'hold' : Number(m[3]) } : null;
};

// WCAG 2 contrast of two [r, g, b] colors (0-255), and the AA floor: 4.5:1, or 3:1 for large text
// (24 px, or 18.66 px in bold).
const channel = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
export const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
export const isLargeText = (fontSize, fontWeight) => fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
const hex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
export const contrastOf = ({ color, background, fontSize, fontWeight }) => {
  const ratio = contrastRatio(color, background);
  const large = isLargeText(fontSize, fontWeight);
  const needed = large ? 3 : 4.5;
  return { color: hex(color), background: hex(background), fontSize, fontWeight, large, ratio: Math.round(ratio * 100) / 100, needed, aa: ratio >= needed };
};
export const contrastLine = (c) => (c.found === false
  ? `  contrast ${c.selector} · not on the page`
  : c.skipped ? `  contrast ${c.selector} · skipped: ${c.skipped}`
  : `  contrast ${c.selector} · ${c.color} on ${c.background}${c.approximate ? ' (a background image is under it: approximate)' : ''} · ${c.fontSize}px/${c.fontWeight}${c.large ? ' large' : ''} · ${c.ratio}:1 · AA ${c.aa ? 'pass' : `fail (needs ${c.needed})`}`);

const playwright = () => {
  for (const root of [process.cwd(), process.env.KIT_PLAYWRIGHT_ROOT].filter(Boolean)) {
    const req = createRequire(join(root, 'package.json'));
    for (const name of ['playwright', '@playwright/test']) {
      try { return req(name); } catch { /* next */ }
    }
  }
  return null;
};
const axeFile = () => {
  for (const root of [process.cwd(), process.env.KIT_PLAYWRIGHT_ROOT].filter(Boolean)) {
    try { return createRequire(join(root, 'package.json')).resolve('axe-core/axe.min.js'); } catch { /* next */ }
  }
  return process.env.AXE_CORE && existsSync(process.env.AXE_CORE) ? process.env.AXE_CORE : null;
};

// Runs in the page.
const snapshotPage = () => {
  const el = document.activeElement;
  const aria = {};
  if (el && el !== document.body) for (const a of el.attributes) if (a.name.startsWith('aria-')) aria[a.name] = a.value;
  // The browser decides when a ring is due (`:focus-visible`); then an outline or a box-shadow has to draw it.
  const cs = el && el !== document.body ? getComputedStyle(el) : null;
  const visible = cs ? el.matches(':focus-visible') : false;
  const drawn = (p) => !['none', 'normal'].includes(getComputedStyle(el, p).content);
  const ring = cs ? (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none' || drawn('::before') || drawn('::after') : false;
  const focus = el && el !== document.body
    ? { tag: el.tagName.toLowerCase(), id: el.id, role: el.getAttribute('role'), name: (el.getAttribute('aria-label') || el.innerText || el.value || '').trim().slice(0, 60), aria, ringDue: visible, ring }
    : null;
  const announcements = [...document.querySelectorAll('[role=status],[role=alert]')]
    .map((e) => ({ role: e.getAttribute('role'), text: e.textContent.trim() })).filter((a) => a.text);
  const animations = document.getAnimations().filter((a) => a.playState === 'running')
    .map((a) => ({ name: a.animationName ?? a.transitionProperty ?? 'unnamed', type: a.constructor.name }));
  const doc = document.documentElement;
  const label = (e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}`;
  // `aria-busy=""` or "false" on a control the page keeps busy is read as not busy.
  const busyNotTrue = [...document.querySelectorAll('[aria-busy]')].filter((e) => e.getAttribute('aria-busy') !== 'true' && e.getAttribute('aria-busy') !== 'false').map(label);
  // A spinner inside a busy control that takes no box is never seen.
  const hiddenSpinners = [...document.querySelectorAll('[aria-busy=true], [aria-disabled=true], button:disabled')]
    .flatMap((c) => [...c.querySelectorAll('svg, [role=progressbar], [class*=spin], [class*=loader]')])
    .filter((s) => { const r = s.getBoundingClientRect(); return r.width === 0 || r.height === 0 || getComputedStyle(s).visibility === 'hidden'; })
    .map(label);
  // A spinner shown in a button that is neither busy nor disabled says "working" while nothing is.
  const idleSpinners = [...document.querySelectorAll('button')]
    .filter((b) => b.getAttribute('aria-busy') !== 'true' && !b.disabled && b.getAttribute('aria-disabled') !== 'true')
    .flatMap((b) => [...b.querySelectorAll('[role=progressbar], [class*=spin], [class*=loader]')])
    .filter((s) => { const r = s.getBoundingClientRect(); const st = getComputedStyle(s); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; })
    .map(label);
  const submits = document.querySelectorAll('form, button[type=submit], input[type=submit]').length;
  return { activeElement: focus, announcements, submits, scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, animations, lang: doc.getAttribute('lang') || '', text: (document.body?.innerText ?? '').slice(0, 600), busyNotTrue, hiddenSpinners, idleSpinners };
};

// Runs in the page: the colors, size and weight of the first element of each selector. The background is the
// effective one: the element's own and each ancestor's, up to the first opaque one (white under the page),
// composited from the bottom. Any CSS color is read through a canvas, so oklch(), color-mix() and the rest arrive as sRGB.
// The elements that carry a status or an error are measured on every step whether or not they were declared: `[role=alert]`,
// `[aria-live]`, `[aria-invalid=true]` and what the fields' `aria-describedby` points to. Only the ones that show something.
const measureContrast = ([selectors, withStatus]) => {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = (value) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a === 0 ? [0, 0, 0, 0] : [r, g, b, a / 255];
  };
  const over = (top, under) => [0, 1, 2].map((i) => Math.round(top[i] * top[3] + under[i] * (1 - top[3])));
  // A box with text is not enough: `visibility: hidden` and `opacity: 0` keep the box and show nothing.
  const shows = (e) => {
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0 && (e.textContent.trim() || e.value))) return false;
    if (getComputedStyle(e).visibility !== 'visible') return false;
    for (let a = e; a && a.nodeType === 1; a = a.parentElement) if (parseFloat(getComputedStyle(a).opacity) === 0) return false;
    return true;
  };
  const nameOf = (e) => (e.id ? `#${e.id}` : `${e.tagName.toLowerCase()}${e.getAttribute('role') ? `[role=${e.getAttribute('role')}]` : ''}`);
  const busy = (e) => e.matches('[aria-busy=true]') || !!e.closest('[aria-busy=true]') || /(…|\.\.\.)\s*$/.test(e.textContent || e.value || '');
  const entries = selectors.map((selector) => ({ selector, el: document.querySelector(selector) }));
  if (withStatus) {
    const found = new Set([...document.querySelectorAll('[role=alert],[role=status],[aria-live],[aria-invalid=true]')]);
    for (const field of document.querySelectorAll('[aria-describedby]')) {
      for (const id of field.getAttribute('aria-describedby').split(/\s+/).filter(Boolean)) { const target = document.getElementById(id); if (target) found.add(target); }
    }
    for (const el of document.querySelectorAll('button,[role=button],input[type=submit]')) if (busy(el)) found.add(el);
    for (const el of found) if (shows(el) && !entries.some((e) => e.el === el)) entries.push({ selector: nameOf(el), el, auto: true });
  }
  return entries.map(({ selector, el, auto }) => {
    if (!el) return { selector, found: false };
    // An empty live region waiting for its message has no text to read at this step.
    if (!shows(el)) return { selector, found: true, auto, skipped: 'no text shown at this step' };
    // WCAG exempts inactive controls; a control disabled while it works («Enviando…») still says something the person reads.
    if ((el.matches(':disabled,[aria-disabled=true]') || el.closest('[aria-disabled=true]')) && !busy(el)) return { selector, found: true, auto, skipped: 'disabled' };
    const style = getComputedStyle(el);
    const layers = [];
    let approximate = false;
    for (let node = el; node; node = node.parentElement) {
      const s = getComputedStyle(node);
      const layer = rgba(s.backgroundColor);
      if (!/^none(\s*,\s*none)*$/.test(s.backgroundImage)) approximate = true;
      if (layer[3] > 0) layers.push(layer);
      if (layer[3] === 1) break;
    }
    const own = rgba(style.backgroundColor)[3] > 0;
    let background = [255, 255, 255];
    let under = background;
    layers.reverse().forEach((layer, i) => { background = over(layer, background); if (!own || i < layers.length - 1) under = background; });
    let color = over(rgba(style.color), background);
    // Opacity fades the text and its ground into what lies beneath (a disabled «Enviando…» at .7 is paler than its colors say).
    let fade = 1;
    for (let node = el; node; node = node.parentElement) fade *= parseFloat(getComputedStyle(node).opacity);
    if (fade < 1) {
      const mix = (c) => c.map((v, i) => Math.round(v * fade + under[i] * (1 - fade)));
      color = mix(color);
      background = mix(background);
    }
    return { selector, auto, found: true, color, background, fontSize: parseFloat(style.fontSize), fontWeight: Number(style.fontWeight) || 400, approximate };
  });
};

// Runs in the page: what the computed CSS says about type and about the response of the controls. Cheap and deterministic.
const measureDesign = () => {
  const shown = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const families = new Set();
  const sizes = new Set();
  for (const e of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(e.tagName) || !shown(e)) continue;
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const s = getComputedStyle(e);
    const family = s.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
    sizes.add(Math.round(parseFloat(s.fontSize) * 10) / 10);
    // icon fonts, and the monospace of code, are not the page's type families
    if (/icon|symbols|awesome|glyph|material/.test(family) || (/mono/.test(family) && e.closest('code,pre,kbd,samp'))) continue;
    families.add(family);
  }
  const secs = (v) => Math.max(0, ...String(v).split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) / 1000 : parseFloat(x)) || 0));
  const painted = (c) => c !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(c);
  const buttonLike = (e) => {
    const s = getComputedStyle(e);
    const pad = parseFloat(s.paddingTop) > 0 && parseFloat(s.paddingLeft) > 0;
    return e.getAttribute('role') === 'button' || (pad && (painted(s.backgroundColor) || (parseFloat(s.borderTopWidth) > 0 && painted(s.borderTopColor))));
  };
  const isAction = (e) => (e.tagName === 'A' ? e.hasAttribute('href') && !e.closest('p') && buttonLike(e) : true);
  const controls = [...document.querySelectorAll('a[href],a[role=button],button,input:not([type=hidden]),select,textarea,summary,[role=button]')].filter((e) => shown(e) && isAction(e));
  const label = (e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/)[0]}` : ''}`;
  const unanimated = controls.filter((e) => {
    const s = getComputedStyle(e);
    return !((secs(s.transitionDuration) > 0 && s.transitionProperty !== 'none') || (s.animationName !== 'none' && secs(s.animationDuration) > 0));
  }).map(label);
  // A select still on its placeholder option («Elegí un plan», value "") painted in the color of typed text reads as chosen,
  // when the page's inputs draw their own placeholder in another color.
  const inputs = [...document.querySelectorAll('input[placeholder]')].filter(shown);
  const typedColor = inputs[0] && getComputedStyle(inputs[0]).color;
  const hintColor = inputs[0] && getComputedStyle(inputs[0], '::placeholder').color;
  const selectHints = typedColor && hintColor !== typedColor
    ? [...document.querySelectorAll('select')].filter((s) => shown(s) && s.value === '' && getComputedStyle(s).color === typedColor).map(label)
    : [];
  return { families: [...families].sort(), sizes: [...sizes].sort((a, b) => a - b), controls: controls.length, unanimated: [...new Set(unanimated)].slice(0, 8), unanimatedCount: unanimated.length, selectHints };
};

// Runs in the page with prefers-reduced-motion emulated: the large or continuous movement still running: CSS or WAAPI
// animations that loop forever or last over 1 s and change transform or position. Short hover and focus transitions and
// opacity or color changes are allowed.
const measureReduced = () => {
  const MOVES = /^(transform|translate|rotate|scale|offsetDistance|offsetPath|top|left|right|bottom|inset|margin.*|insetBlock.*|insetInline.*)$/;
  const big = document.getAnimations().filter((a) => {
    if (a.playState !== 'running' || !a.effect?.getKeyframes) return false;
    const t = a.effect.getComputedTiming();
    if (!(t.iterations === Infinity || t.duration > 1000)) return false;
    return a.effect.getKeyframes().some((k) => Object.keys(k).some((p) => MOVES.test(p))) || a.transitionProperty === 'transform';
  });
  const label = (a) => `${a.animationName ?? a.transitionProperty ?? 'unnamed'}${a.effect.target?.id ? `#${a.effect.target.id}` : ''}`;
  return { moving: big.length, items: [...new Set(big.map(label))].slice(0, 5) };
};

const MARKUP = '<b data-kit-markup>x</b>';
// The controls of a form that Enter submits from: every field but textareas and buttons.
const ENTER_CONTROLS = 'input:not([type=hidden],[type=submit],[type=button],[type=reset],[type=image],[type=file],[disabled]),select:not([disabled])';

// For each control of the form: the state the step started from is rebuilt (the steps before it run again on a blank page),
// the control is focused, Enter is pressed and a capture-phase `submit` listener says whether the form submitted. The flag
// lives in sessionStorage: a form that navigates away on submit still leaves it.
const enterEach = async (page, step, ctx, appUrl) => {
  const form = () => page.locator(step['enter-each']).first();
  const count = await form().locator(ENTER_CONTROLS).count();
  const skips = ctx.skip;
  const out = [];
  for (let k = 0; k < count; k++) {
    if (k > 0) {
      await page.goto('about:blank');
      for (const before of ctx.steps.slice(0, ctx.i)) await run(page, before, appUrl, { ...ctx, silent: true });
    }
    const control = form().locator(ENTER_CONTROLS).nth(k);
    const label = await control.evaluate((el) => `${el.tagName.toLowerCase()}${el.name ? `[name=${el.name}]` : el.id ? `#${el.id}` : ''}${el.tagName === 'INPUT' && el.type !== 'text' ? `[type=${el.type}]` : ''}`);
    let skipped = false;
    for (const s of skips) skipped ||= await control.evaluate((el, sel) => { try { return el.matches(sel); } catch { return false; } }, s);
    await page.evaluate(() => sessionStorage.removeItem('kitSubmit'));
    await form().evaluate((f) => f.addEventListener('submit', () => sessionStorage.setItem('kitSubmit', '1'), true));
    await control.focus({ timeout: STEP_TIMEOUT_MS });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const submitted = await page.evaluate(() => sessionStorage.getItem('kitSubmit') === '1');
    out.push({ control: label, submitted, ...(skipped ? { skipped: true } : {}) });
  }
  return out;
};

const run = async (page, step, appUrl, ctx) => {
  const loc = (s) => page.locator(s).first();
  if ('enter-each' in step) { if (!ctx.silent) ctx.found.enter = await enterEach(page, step, ctx, appUrl); }
  else if ('type-markup' in step) { await loc(step['type-markup']).fill(MARKUP, { timeout: STEP_TIMEOUT_MS }); ctx.found.typed = true; }
  else if ('goto' in step) {
    const target = new URL(step.goto, appUrl).href;
    const response = await page.goto(target, { waitUntil: 'load', timeout: STEP_TIMEOUT_MS * 3 });
    const why = await wallOf(page, response, target);
    if (why) throw new BotWall(target, why);
    // A local error page is a failed step, not a page to probe.
    if (response && response.status() >= 400) throw new Error(`${target} answered HTTP ${response.status()}`);
    const notProduct = await productRefOf(page, target);
    if (notProduct) throw new BotWall(target, null, notProduct);
  } else if ('fill' in step) await loc(step.fill).fill(step.value ?? '', { timeout: STEP_TIMEOUT_MS });
  else if ('click' in step) await loc(step.click).click({ timeout: STEP_TIMEOUT_MS });
  else if ('press' in step) await (step.on ? loc(step.on).press(step.press, { timeout: STEP_TIMEOUT_MS }) : page.keyboard.press(step.press));
  else if ('select' in step) await loc(step.select).selectOption(step.value ?? '', { timeout: STEP_TIMEOUT_MS });
  else if ('scroll' in step) { await loc(step.scroll).evaluate((el) => el.scrollIntoView({ block: 'start' })); await page.waitForTimeout(400); }
  else if (typeof step.wait === 'number') await page.waitForTimeout(step.wait);
  else await loc(step.wait).waitFor({ timeout: STEP_TIMEOUT_MS });
};

// Whether `selector` is on the page the app at `appUrl` serves at `route`, within a few seconds. `app.mjs pairs` asks it of the
// base: true when it cannot tell (no Playwright), so the pairs go on and the probe reports the missing browser.
export const shownAt = async (appUrl, route, selector) => {
  const pw = playwright();
  if (!pw) return true;
  const browser = await (pw.chromium ?? pw.default.chromium).launch();
  try {
    const page = await browser.newPage();
    await page.goto(new URL(route, appUrl).href, { waitUntil: 'load', timeout: STEP_TIMEOUT_MS * 3 });
    await page.locator(selector).first().waitFor({ state: 'attached', timeout: STEP_TIMEOUT_MS / 2 });
    return true;
  } catch { return false; } finally { await browser.close(); }
};

export const probe = async (argv, root = process.cwd()) => {
  const args = [...argv];
  const take = (name) => { const found = []; for (let i = args.indexOf(name); i >= 0; i = args.indexOf(name)) found.push(args.splice(i, 2)[1]); return found; };
  const axe = args.includes('--axe');
  if (axe) args.splice(args.indexOf('--axe'), 1);
  const viewports = (take('--widths')[0] ?? '320,390,1280').split(',').map((v) => { const [w, h = '900'] = v.trim().split('x'); return { width: Number(w), height: Number(h) }; });
  const routeTexts = take('--route');
  const watches = take('--watch');
  const contrastFlags = take('--contrast');
  const contrasts = contrastFlags.flatMap((v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  // `--url` probes another app than the shared one and `--out` writes elsewhere: `app.mjs pairs` takes the base this way.
  const enterSkip = take('--enter-skip').flatMap((v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const [urlFlag] = take('--url');
  const [outFlag] = take('--out');
  const quiet = args.includes('--quiet');
  if (quiet) args.splice(args.indexOf('--quiet'), 1);
  const log = (...a) => { if (!quiet) console.log(...a); };
  const [stepsPath, ...extra] = args;
  if (!stepsPath || extra.length || viewports.some(({ width, height }) => !(width >= 200 && width <= 3000 && height >= 200 && height <= 3000)) || [...routeTexts, ...watches].some((v) => !v)
    || contrastFlags.length && !contrasts.length) {
    console.error(USAGE);
    return 2;
  }
  const routes = routeTexts.map(parseRoute);
  if (routes.includes(null)) { console.error(`${USAGE}\n--route is METHOD /path=<status>|hold`); return 2; }

  let appUrl = urlFlag ?? process.env.APP_URL;
  if (!appUrl) try { appUrl = JSON.parse(readFileSync(join(root, '.validation', 'app.json'), 'utf8')).url; } catch { /* no state */ }
  if (!appUrl) { console.error('No app: `node .claude/tools/app.mjs up` writes .validation/app.json first.'); return 1; }
  let list;
  try { list = JSON.parse(readFileSync(join(root, stepsPath), 'utf8')); } catch (e) { console.error(`${stepsPath}: ${e.message}`); return 2; }
  const parsed = parseSteps(list, appUrl);
  if (parsed.error) { console.error(parsed.error); return 2; }

  const out = resolve(root, outFlag ?? DEFAULT_OUT);
  // `--out` is emptied before writing: the repo root, a folder above it or one holding `.git` or `specs` is never a probe folder.
  const rel = relative(out, resolve(root));
  if (rel === '' || !rel.startsWith('..') && !isAbsolute(rel) || existsSync(join(out, '.git')) || existsSync(join(out, 'specs'))) {
    console.error(`--out ${out} is the repo, a folder above it or one with .git or specs: it is emptied before writing; pick a folder of its own`);
    return 2;
  }
  const pw = playwright();
  if (!pw) { console.error('could not run: Playwright is not installed here nor at KIT_PLAYWRIGHT_ROOT'); return 2; }
  const axePath = axe ? axeFile() : null;
  if (axe && !axePath) { console.error('could not run --axe: axe-core is not installed here nor at KIT_PLAYWRIGHT_ROOT, and AXE_CORE does not name an axe.min.js'); return 2; }
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const browser = await (pw.chromium ?? pw.default.chromium).launch();
  let failed = false;
  let wall = null;
  try {
    for (const { width, height } of viewports) {
      if (wall) break;
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      for (const r of routes) {
        await page.route(`**${r.path}`, (route) => {
          if (route.request().method() !== r.method) return route.continue();
          if (r.answer === 'hold') return undefined;
          return route.fulfill({ status: r.answer, contentType: 'application/json', body: '{}' });
        });
      }
      const found = {};
      let markupHit = 0;
      for (const [i, step] of parsed.steps.entries()) {
        const name = `w${width}${height === 900 ? '' : `x${height}`}-step${String(i + 1).padStart(2, '0')}`;
        let error = null;
        delete found.enter;
        try { await run(page, step, appUrl, { steps: parsed.steps, i, skip: enterSkip, found }); } catch (e) { error = `${JSON.stringify(step)}: ${String(e.message).split('\n')[0]}`; if (e.botWall) wall = e.message; }
        const record = { width, height, step: i + 1, action: step, url: page.url(), error };
        if (found.enter) {
          record.enter = found.enter;
          const stuck = found.enter.filter((c) => !c.submitted && !c.skipped).map((c) => c.control);
          if (stuck.length) { failed = true; log(`${name} enter-each · Enter did not submit from: ${stuck.join(', ')}`); }
        }
        if (found.typed) {
          const n = await page.locator('[data-kit-markup]').count().catch(() => 0);
          record.markup = { found: n };
          if (n) markupHit = n;
        }
        try {
          const t0 = {};
          for (const w of watches) t0[w] = await page.locator(w).count();
          Object.assign(record, await page.evaluate(snapshotPage));
          // Colors are measured once the finite animations end: a message fading in is not its final contrast.
          await page.evaluate(() => Promise.race([
            Promise.all(document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity).map((a) => a.finished.catch(() => {}))),
            new Promise((r) => setTimeout(r, 1500)),
          ]));
          const measures = (await page.evaluate(measureContrast, [contrasts, true])).map((c) => (c.skipped ? c : c.found ? { selector: c.selector, ...contrastOf(c), approximate: c.approximate, auto: c.auto } : c));
          if (contrasts.length) record.contrast = measures.filter((c) => !c.auto);
          record.statusContrast = measures.filter((c) => c.auto);
          if (axePath) {
            if (await page.evaluate(() => typeof window.axe) === 'undefined') await page.addScriptTag({ path: axePath });
            const result = await page.evaluate(() => window.axe.run());
            record.axe = { violations: result.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) })) };
          } else record.axe = null;
          record.design = await page.evaluate(measureDesign);
          await page.screenshot({ path: join(out, `${name}.png`) });
          record.watch = {};
          if (watches.length) await page.waitForTimeout(WATCH_DELAY_MS);
          for (const w of watches) record.watch[w] = { t0: t0[w], t500: await page.locator(w).count() };
          if (i === parsed.steps.length - 1) {
            await page.emulateMedia({ reducedMotion: 'reduce' });
            record.reduced = await page.evaluate(measureReduced);
          }
        } catch (e) { record.error ??= String(e.message).split('\n')[0]; }
        writeFileSync(join(out, `${name}.json`), JSON.stringify(record, null, 1));
        log(`${name} ${Object.keys(step)[0]} · focus ${record.activeElement ? `${record.activeElement.tag}${record.activeElement.id ? `#${record.activeElement.id}` : ''}` : 'none'} · announcements ${record.announcements?.length ?? 0} · scroll ${record.scrollWidth}/${record.clientWidth} · animations ${record.animations?.length ?? 0}${record.axe ? ` · axe ${record.axe.violations.length}` : ''}${error ? ` · ERROR ${error}` : ''}`);
        for (const c of [...(record.contrast ?? []), ...(record.statusContrast ?? [])]) log(contrastLine(c));
        if (error || record.error) { failed = true; break; }
      }
      if (markupHit) { failed = true; log(`w${width} type-markup · un texto del usuario se interpretó como HTML (${markupHit} [data-kit-markup])`); }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  if (wall) { rmSync(out, { recursive: true, force: true }); console.error(wall); return 2; }
  log(`probe written to ${out}`);
  return failed ? 1 : 0;
};
