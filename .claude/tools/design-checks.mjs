// design-checks.mjs: the measures design-round.mjs adds to a round, each in a page or a browser step plus a pure rule:
// dead clicks (a sweep that activates every control), the composition of each viewport frame, image integration and the palette.
// Page functions run in the browser (`page.evaluate`), so they take their numbers as arguments and capture nothing.
import { join } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Ranges of `.claude/reference/composition.md`, calibrated on 49 Awwwards winners, 2025-2026. The first two frames are the strict ones: they carry the first look.
export const FRAME_MAX = 12;
export const COMPOSITION = {
  compact: { focal: [0.18, 0.44], competing: 3, axes: [2, 5], elements: [4, 17], empty: 0.7 },
  wide: { focal: [0.12, 0.6], competing: 3, axes: [2, 9], elements: [5, 24], empty: 0.7 },
  strict: { focal: [0.15, 0.6], empty: 0.7 },
};
export const VOID_EMPTY = 0.7;
export const PASTED_MARGIN = 24;
export const DPR = 2;
export const SWEEP_WAIT_MS = 1000;
export const SWEEP_MAX = 60;
export const SWEEP_BASELINE_MS = 400;

const swept = (width) => width < 600 || width >= 1200;
export const sweepsWidth = swept;

// The intent of a section family, declared as `intent:` in the `## Look` of the card. Under one, focal share, competing elements, axes and
// element count are reported and never flagged: a collage, a statement, a grid of equals or pinned full-bleed media break them on purpose.
export const INTENTS = ['collage', 'statement', 'grid', 'pinned-media'];
export const loadIntent = (arg) => {
  if (!arg) return null;
  if (INTENTS.includes(arg)) return arg;
  const look = readFileSync(arg, 'utf8').split(/^## /m).find((x) => /^Look\b/.test(x));
  const v = look?.match(/^\s*[-*]?\s*intent:\s*([\w-]+)/im)?.[1].toLowerCase();
  return INTENTS.includes(v) ? v : null;
};
const REPORT_ONLY = ['focal', 'competing', 'axes', 'elements'];

// A canvas is blank when the pixels painted over it vary by this much or less (per-channel standard deviation).
export const UNIFORM_SD = 1.5;

// Runs in the page: picks the primary CTA and tags it `data-kit-cta` for `measureResponsive` and `collectPalette`. Out: cookie and consent
// banners, language selectors, age gates, cards and menu links. In: a control, the first viewport before the rest; the primary is chosen by role:
// the filled control (opaque background that differs from its surroundings) with the highest contrast against it, the largest area breaking a tie.
// Words that say buy, subscribe, try, start, shop, add or order (en/es) or a price only break ties between controls of the same role.
// `override` is a CSS selector (`--cta`). Returns { text, selector, reason } or { none: true, reason }.
export const pickCta = (override) => {
  document.querySelectorAll('[data-kit-cta]').forEach((e) => e.removeAttribute('data-kit-cta'));
  const vw = innerWidth; const vh = innerHeight;
  const shown = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05; };
  const textOf = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
  const path = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 3; e = e.parentElement) parts.unshift(`${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${e.classList.length ? `.${[...e.classList].slice(0, 2).join('.')}` : ''}`);
    return parts.join(' > ');
  };
  const done = (el, reason) => { el.setAttribute('data-kit-cta', ''); return { text: textOf(el).slice(0, 60), selector: path(el), reason }; };
  if (override) {
    let el = null;
    try { el = document.querySelector(override); } catch { /* bad selector */ }
    return el ? done(el, `override ${override}`) : { none: true, reason: `override ${override} matches nothing` };
  }
  const WORDS = /\b(buy|subscribe|try|start|shop|add to|order|get (it|yours|started)|checkout|book|reserve|comprar|compr[aá]|suscrib\w*|probar|prueb\w*|empez\w*|comenz\w*|pedir|ped[ií]\w*|agregar|a[ñn]adir|reserv\w*|tienda)\b/i;
  const PRICE = /[$€£]\s?\d|\d\s?(€|usd|eur|ars|£)\b/i;
  const COOKIE = '[id*=cookie i], [class*=cookie i], [id*=consent i], [class*=consent i], [id*=gdpr i], [class*=gdpr i], [id*=onetrust], [class*=onetrust], [class*=cc-window], [class*=cmp-], [id*=cmp-], [aria-label*=cookie i], [aria-label*=consent i]';
  const COOKIE_TEXT = /\b(accept( all)?|reject( all)?|decline|allow all|manage (cookies|preferences)|cookie settings|aceptar( todas)?|rechazar|configurar cookies)\b/i;
  const LANG = '[class*=lang i], [id*=lang i], [class*=locale i], [id*=locale i], [class*=country i], [class*=currency i], [aria-label*=language i], [aria-label*=idioma i], a[hreflang]';
  const LANG_TEXT = /^(en|es|fr|de|it|pt|nl|ja|zh|ru|ko|english|espa[nñ]ol|fran[cç]ais|deutsch|italiano|portugu[eê]s)$/i;
  const AGE = /(^|[-_\s])(age[-_]?(gate|verif\w*|check|wall)|agegate|over-?18|adult)([-_\s]|$)/i;
  const AGE_TEXT = /\b(i am|i'm|soy) (over|older|mayor|of legal)|over 18|mayor de 18|legal age|enter (the )?site|yes,? i am/i;
  const reject = (el) => {
    const t = textOf(el);
    if (el.closest(COOKIE) || (COOKIE_TEXT.test(t) && [...(function* () { for (let e = el; e; e = e.parentElement) yield e; })()].some((e) => ['fixed', 'sticky'].includes(getComputedStyle(e).position)))) return 'cookie';
    if (el.closest(LANG) || LANG_TEXT.test(t)) return 'language';
    if ([...(function* () { for (let e = el; e && e !== document.body; e = e.parentElement) yield e; })()].some((e) => AGE.test(`${e.id} ${e.className}`)) || AGE_TEXT.test(t)) return 'age gate';
    const r = el.getBoundingClientRect();
    if (r.width * r.height > vw * vh * 0.25 || (r.height > 120 && el.querySelector('img, picture, h1, h2, h3, h4, p'))) return 'card';
    return null;
  };
  const buttonLike = (el) => el.matches('button, [role=button], input[type=submit], input[type=button], [type=submit], .btn, .cta, [data-cta]') || /(^|[-_\s])(btn|button|cta|primary)([-_\s]|$)/i.test(el.className);
  // Contrast of the control's own background against the nearest opaque ancestor background; 0 when it has no fill of its own.
  const rgb = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const filledContrast = (el) => {
    const bg = rgb(getComputedStyle(el).backgroundColor);
    if (!bg || bg.a < 0.9) return 0;
    let under = { r: 255, g: 255, b: 255, a: 1 };
    for (let e = el.parentElement; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c.a >= 0.9) { under = c; break; } }
    const [a, b] = [lum(bg), lum(under)];
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return ratio >= 1.2 ? ratio : 0;
  };
  const list = [];
  for (const el of document.querySelectorAll('a[href], button, [role=button], input[type=submit], [data-cta]')) {
    if (!shown(el) || el.disabled) continue;
    const r = el.getBoundingClientRect();
    const inView = r.top < vh && r.bottom > 0 && r.left < vw && r.right > 0;
    if (reject(el)) continue;
    const t = textOf(el);
    const words = WORDS.test(t) || PRICE.test(t);
    if (el.closest('nav, header, [role=navigation], [role=menubar]') && !words) continue;
    const filled = filledContrast(el);
    const tier = filled > 0 ? 3 : buttonLike(el) ? 1 : words ? 1 : 0;
    if (!tier) continue;
    list.push({ el, tier, filled, words, inView, area: r.width * r.height, why: filled > 0 ? 'filled control' : words ? (PRICE.test(t) ? 'price' : 'buy/start words') : 'button-like' });
  }
  list.sort((x, y) => y.inView - x.inView || y.tier - x.tier || y.filled - x.filled || y.words - x.words || y.area - x.area);
  return list.length ? done(list[0].el, `${list[0].why}${list[0].inView ? ', first viewport' : ', below the first viewport'}, largest`) : { none: true, reason: 'no candidate' };
};

// Runs in the page: tags every control with data-dc and says what can be told without a click.
export const collectClickables = () => {
  document.querySelectorAll('[data-dc]').forEach((e) => e.removeAttribute('data-dc'));
  const shown = (el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  // A control a person cannot reach after load: pointer-events none (own or inherited), an ancestor at opacity 0, or a fixed layer
  // parked outside the viewport (a transition curtain, a closed drawer).
  const unreachable = (el) => {
    if (getComputedStyle(el).pointerEvents === 'none') return true;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (parseFloat(cs.opacity) < 0.05) return true;
      if (cs.position === 'fixed') {
        const r = e.getBoundingClientRect();
        if (r.right <= 0 || r.left >= innerWidth || r.bottom <= 0 || r.top >= innerHeight) return true;
      }
    }
    return false;
  };
  const label = (el) => {
    const path = [];
    for (let e = el; e && e !== document.body && path.length < 3; e = e.parentElement) {
      path.unshift(`${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${e.classList.length ? `.${[...e.classList].slice(0, 2).join('.')}` : ''}`);
    }
    return `${path.join(' > ')} "${(el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`;
  };
  const set = new Set(document.querySelectorAll('a, button, [role=button], [onclick]'));
  for (const el of document.body.querySelectorAll('*')) {
    if (getComputedStyle(el).cursor === 'pointer' && el.parentElement && getComputedStyle(el.parentElement).cursor !== 'pointer') set.add(el);
  }
  const out = [];
  let i = 0;
  for (const el of set) {
    if (!shown(el) || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[inert]') || unreachable(el)) continue;
    const item = { i, selector: label(el), native: el.matches('a[href], button, [role=button], [onclick]'), verdict: 'click', reason: '' };
    // A form control the browser opens or edits by itself (a select's list, a date picker) moves nothing in a headless DOM.
    if (el.matches('select, input:not([type=button], [type=submit], [type=reset], [type=image]), textarea, option, summary')) item.verdict = 'ok';
    else if (el.tagName === 'A' && el.hasAttribute('href')) {
      const href = el.getAttribute('href').trim();
      const id = href.slice(1);
      let target = null;
      try { target = id ? document.getElementById(decodeURIComponent(id)) || document.getElementsByName(decodeURIComponent(id))[0] : null; } catch { /* bad escape */ }
      if (href === '' || href === '#') { item.verdict = 'dead'; item.reason = 'href="#"'; }
      else if (href.startsWith('#')) { item.verdict = target ? 'ok' : 'dead'; item.reason = target ? '' : `anchor to a missing id (${href})`; }
      else if (!/^javascript:/i.test(href)) item.verdict = 'ok';
    }
    el.setAttribute('data-dc', String(i));
    out.push(item); i++;
  }
  return out;
};

const centerOf = (page, i) => page.evaluate((n) => {
  const el = document.querySelector(`[data-dc="${n}"]`);
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect();
  return { x: Math.min(innerWidth - 1, Math.max(1, r.left + r.width / 2)), y: Math.min(innerHeight - 1, Math.max(1, r.top + r.height / 2)) };
}, i);

const mark = (page, i, on) => page.evaluate(([n, color]) => {
  const el = document.querySelector(`[data-dc="${n}"]`);
  if (el) el.style.outline = color ? `4px solid ${color}` : '';
}, [i, on ? 'red' : '']).catch(() => {});

// Runs in the page: starts the baseline window for one control. Everything the page does on its own in that window (a smooth-scroll
// library writing styles on every frame, idle animations, a scroll) is recorded as a key and does not count as the click's effect.
const startProbe = (n) => {
  const S = window.__dcS = { phase: 'base', baseKeys: new Set(), fresh: 0, ids: new WeakMap(), next: 1, clip: 0, baseAnims: false, baseScroll: false };
  const id = (t) => { if (!S.ids.has(t)) S.ids.set(t, S.next++); return S.ids.get(t); };
  const vars = () => {
    const o = {};
    for (const el of [document.documentElement, document.body]) for (const k of el.style) if (k.startsWith('--')) o[`${el.tagName}${k}`] = el.style.getPropertyValue(k);
    return o;
  };
  S.vars0 = vars(); S.vars = vars; S.baseVars = new Set();
  window.__dcObs?.disconnect();
  window.__dcObs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'attributes' && m.attributeName === 'data-dc') continue;
      const key = `${id(m.target)}|${m.type}|${m.attributeName || ''}`;
      if (S.phase === 'base') S.baseKeys.add(key); else if (!S.baseKeys.has(key)) S.fresh++;
    }
  });
  window.__dcObs.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  S.anims0 = new Set(document.getAnimations());
  if (navigator.clipboard && !navigator.clipboard.__dcWrapped) {
    for (const fn of ['writeText', 'write']) {
      const orig = navigator.clipboard[fn]?.bind(navigator.clipboard);
      if (orig) navigator.clipboard[fn] = (...a) => { window.__dcS.clip++; return orig(...a).catch(() => {}); };
    }
    navigator.clipboard.__dcWrapped = true;
  }
  if (!document.__dcCopy) { document.__dcCopy = true; document.addEventListener('copy', () => { window.__dcS.clip++; }, true); }
  const el = document.querySelector(`[data-dc="${n}"]`);
  S.y0 = scrollY; S.x0 = scrollX;
  return { y: scrollY, x: scrollX, active: document.activeElement && document.activeElement.getAttribute('data-dc'), href: location.href, el: Boolean(el) };
};

// Runs in the page: closes the baseline window and notes what moved by itself in it.
const endBaseline = () => {
  const S = window.__dcS;
  S.phase = 'live';
  const now = S.vars();
  for (const k of new Set([...Object.keys(S.vars0), ...Object.keys(now)])) if (S.vars0[k] !== now[k]) S.baseVars.add(k);
  S.baseScroll = Math.abs(scrollY - S.y0) > 2 || Math.abs(scrollX - S.x0) > 2;
  const cur = document.getAnimations();
  S.baseAnims = cur.some((a) => !S.anims0.has(a));
  S.anims0 = new Set(cur); S.vars0 = now; S.y0 = scrollY; S.x0 = scrollX;
};

// Runs in the page: true once the click moved something the baseline did not: a mutation on a node and attribute that was quiet,
// a clipboard write, a custom property on html/body, a new animation, focus on another control or a scroll.
const readEffect = (n) => {
  const S = window.__dcS;
  const el = document.querySelector(`[data-dc="${n}"]`);
  const a = document.activeElement;
  if (a && a !== document.body && el && !(a === el || el.contains(a) || a.contains(el))) return true;
  if (!S.baseScroll && (Math.abs(scrollY - S.y0) > 2 || Math.abs(scrollX - S.x0) > 2)) return true;
  if (S.fresh > 0 || S.clip > 0) return true;
  const now = S.vars();
  for (const k of new Set([...Object.keys(S.vars0), ...Object.keys(now)])) if (!S.baseVars.has(k) && S.vars0[k] !== now[k]) return true;
  return !S.baseAnims && document.getAnimations().some((x) => !S.anims0.has(x));
};

// Browser step: taps (touch) or clicks every control and waits up to SWEEP_WAIT_MS for an effect: a new URL, a DOM mutation
// the page does not make by itself (measured in a baseline window before the click), a clipboard write, a custom property, a new animation, focus on another element, a scroll, a dialog or a popup. Returns { checked, dead: [{ selector, width, reason, capture }] }.
export const sweepDeadClicks = async (ctx, page, url, { width, touch, dir }) => {
  const dead = [];
  let dialogs = 0; let popups = 0;
  page.on('dialog', (d) => { dialogs++; d.dismiss().catch(() => {}); });
  ctx.on('page', (p) => { if (p !== page) { popups++; p.close().catch(() => {}); } });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' }).catch(() => {});
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  let list = await page.evaluate(collectClickables);
  const capDir = join(dir, 'dead-clicks');
  const capture = async (item) => {
    mkdirSync(capDir, { recursive: true });
    const file = join(capDir, `dc-${String(dead.length + 1).padStart(2, '0')}.png`);
    await centerOf(page, item.i).catch(() => {});
    await mark(page, item.i, true);
    await page.screenshot({ path: file }).catch(() => {});
    await mark(page, item.i, false);
    return file;
  };
  let checked = 0;
  for (let k = 0; k < list.length && checked < SWEEP_MAX; k++) {
    const item = list[k];
    if (item.verdict === 'ok') { checked++; continue; }
    if (item.verdict === 'dead') { checked++; dead.push({ selector: item.selector, width, reason: item.reason, capture: await capture(item) }); continue; }
    checked++;
    const { x, y } = await centerOf(page, item.i);
    if (!touch) { await page.mouse.move(x, y); await page.waitForTimeout(250); }
    const before = await page.evaluate(startProbe, item.i);
    await page.waitForTimeout(SWEEP_BASELINE_MS);
    await page.evaluate(endBaseline);
    const d0 = dialogs; const p0 = popups;
    if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    let effect = false;
    for (let t = 0; t < SWEEP_WAIT_MS && !effect; t += 50) {
      await page.waitForTimeout(50);
      if (dialogs > d0 || popups > p0 || page.url() !== before.href) { effect = true; break; }
      effect = await page.evaluate(readEffect, item.i).catch(() => true);
    }
    if (!effect) dead.push({ selector: item.selector, width, reason: item.native ? 'no effect within 1 s' : 'pointer without handler', capture: await capture(item) });
    if (page.url().split('#')[0] !== before.href.split('#')[0]) {
      await page.goto(url, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
      await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' }).catch(() => {});
      list = await page.evaluate(collectClickables);
    }
  }
  return { checked, dead };
};

// Runs in the page: the composition of the current viewport frame. Chrome is not counted: nav, header and footer bars, cookie and consent
// layers and fixed or sticky layers under 15 % of the viewport. A fixed or pinned layer of 15 % or more (scene, canvas, pinned section) is content.
// Elements are text blocks and media of 4000 px² or more; the focal one is the biggest; the empty share is over a 24 px grid.
export const measureFrame = () => {
  const vw = innerWidth; const vh = innerHeight;
  const vis = (cs) => cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05;
  const CHROME = '[id*=cookie i], [class*=cookie i], [id*=consent i], [class*=consent i], [id*=gdpr i], [class*=gdpr i], [id*=onetrust], [class*=onetrust], [class*=cc-window], [class*=cmp-], [id*=cmp-], [aria-label*=cookie i], [aria-label*=consent i]';
  const area = (e) => { const r = e.getBoundingClientRect(); return Math.max(0, Math.min(vw, r.right) - Math.max(0, r.left)) * Math.max(0, Math.min(vh, r.bottom) - Math.max(0, r.top)); };
  const isChrome = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      if (e.matches(CHROME) || ['NAV'].includes(e.tagName) || e.getAttribute('role') === 'navigation') return true;
      if (['HEADER', 'FOOTER'].includes(e.tagName) && !e.parentElement.closest('article, section, main') ) return true;
      const pos = getComputedStyle(e).position;
      if ((pos === 'fixed' || pos === 'sticky') && area(e) < 0.15 * vw * vh) return true;
    }
    return false;
  };
  const clip = (r) => { const l = Math.max(0, r.left); const t = Math.max(0, r.top); const rr = Math.min(vw, r.right); const b = Math.min(vh, r.bottom); return rr > l && b > t ? { l, t, r: rr, b, w: rr - l, h: b - t } : null; };
  const textBy = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.textContent.trim().length < 2) continue;
    const el = n.parentElement;
    if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) || !vis(getComputedStyle(el)) || isChrome(el)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    const rs = [...rg.getClientRects()].map(clip).filter((r) => r && r.w > 2 && r.h > 4);
    if (!rs.length) continue;
    const key = el.closest('p,h1,h2,h3,h4,h5,h6,li,a,button,label,figcaption,dt,dd,td,th') || el;
    const o = textBy.get(key) || { rs: [], fs: 0 };
    o.rs.push(...rs); o.fs = Math.max(o.fs, parseFloat(getComputedStyle(el).fontSize)); textBy.set(key, o);
  }
  const all = [];
  for (const o of textBy.values()) {
    const l = Math.min(...o.rs.map((r) => r.l)); const t = Math.min(...o.rs.map((r) => r.t)); const r = Math.max(...o.rs.map((q) => q.r)); const b = Math.max(...o.rs.map((q) => q.b));
    all.push({ k: 'text', l, t, r, b, fs: o.fs });
  }
  const media = [];
  for (const el of document.querySelectorAll('img, video, canvas, svg, *')) {
    const cs = getComputedStyle(el);
    if (!vis(cs) || !(['IMG', 'VIDEO', 'CANVAS'].includes(el.tagName) || (el.tagName === 'svg' && el.getBoundingClientRect().width > 60) || /url\(/.test(cs.backgroundImage))) continue;
    const c = clip(el.getBoundingClientRect());
    if (!c || c.w * c.h < 4000 || isChrome(el)) continue;
    if (media.some((m) => Math.abs(m.l - c.l) < 4 && Math.abs(m.t - c.t) < 4 && Math.abs(m.r - c.r) < 4 && Math.abs(m.b - c.b) < 4)) continue;
    media.push({ k: 'media', ...c });
  }
  all.push(...media);
  const fa = vw * vh;
  for (const i of all) { i.w = i.r - i.l; i.h = i.b - i.t; i.a = i.w * i.h; }
  if (!all.length) return { n: 0, focalShare: 0, focalKind: 'none', competing: 0, axes: 0, empty: 1 };
  const G = 24; const gw = Math.ceil(vw / G); const gh = Math.ceil(vh / G); const cov = new Uint8Array(gw * gh);
  for (const i of all) {
    if (i.k === 'media' && i.a > 0.9 * fa) continue;
    for (let y = Math.floor(i.t / G); y < Math.ceil(i.b / G); y++) for (let x = Math.floor(i.l / G); x < Math.ceil(i.r / G); x++) if (x >= 0 && y >= 0 && x < gw && y < gh) cov[y * gw + x] = 1;
  }
  let empty = 0; for (const c of cov) if (!c) empty++;
  // A box over 90 % of the viewport is the backdrop (a scene, a pinned full-bleed image), not the focus; it leads only when it is all there is.
  const front = all.filter((i) => i.a <= 0.9 * fa);
  const sorted = [...(front.length ? front : all)].sort((a, b) => b.a - a.a);
  const f = sorted[0];
  const texts = all.filter((i) => i.k === 'text');
  const maxFs = Math.max(0, ...texts.map((t) => t.fs));
  const competing = (front.length ? front : all).filter((i) => i !== f && i.a >= 0.5 * f.a).length + (maxFs ? texts.filter((t) => t.fs >= 0.7 * maxFs && t !== f).length : 0);
  const centered = all.filter((i) => Math.abs((i.l + i.r) / 2 - vw / 2) < 10 && i.w < vw * 0.9);
  const edges = [];
  for (const l of all.filter((i) => !centered.includes(i) && !(i.k === 'media' && i.l <= 2)).map((i) => i.l).sort((a, b) => a - b)) if (!edges.length || l - edges[edges.length - 1] > 8) edges.push(l);
  return { n: all.length, focalShare: +(f.a / fa).toFixed(3), focalKind: f.k, competing, axes: edges.length + (centered.length ? 1 : 0), empty: +(empty / (gw * gh)).toFixed(3) };
};

// Pure: what a frame breaks, as { rule, text }. `index` 0 and 1 use the strict ranges.
const frameBreaks = (m, width, index) => {
  const c = width < 600 ? COMPOSITION.compact : COMPOSITION.wide;
  const strict = index < 2;
  const focal = strict ? COMPOSITION.strict.focal : c.focal;
  const emptyMax = strict ? COMPOSITION.strict.empty : c.empty;
  const out = [];
  if (m.focalShare < focal[0]) out.push({ rule: 'focal', text: `focal ${Math.round(m.focalShare * 100)}% under ${Math.round(focal[0] * 100)}%` });
  if (m.focalShare > focal[1]) out.push({ rule: 'focal', text: `focal ${Math.round(m.focalShare * 100)}% over ${Math.round(focal[1] * 100)}%` });
  if (m.competing > c.competing) out.push({ rule: 'competing', text: `${m.competing} compete (max ${c.competing})` });
  if (m.axes < c.axes[0] || m.axes > c.axes[1]) out.push({ rule: 'axes', text: `${m.axes} axes (${c.axes[0]}-${c.axes[1]})` });
  if (m.n < c.elements[0] || m.n > c.elements[1]) out.push({ rule: 'elements', text: `${m.n} elements (${c.elements[0]}-${c.elements[1]})` });
  if (m.empty > emptyMax) out.push({ rule: 'empty', text: `${Math.round(m.empty * 100)}% empty (max ${Math.round(emptyMax * 100)}%)` });
  return out;
};
// With an `intent`, focal, competing, axes and elements are not flags: `frameReports` lists them. The composition ranges are a landing's: with the `product` kind there are none.
export const frameFlags = (m, width, index, intent = null) => intent === 'product' ? [] : frameBreaks(m, width, index).filter((b) => !(intent && REPORT_ONLY.includes(b.rule))).map((b) => b.text);
export const frameReports = (m, width, index, intent = null) => (intent && intent !== 'product' ? frameBreaks(m, width, index).filter((b) => REPORT_ONLY.includes(b.rule)).map((b) => b.text) : []);

export const isVoidFrame = (m, width) => m.empty > VOID_EMPTY && m.focalShare < (width < 600 ? COMPOSITION.compact : COMPOSITION.wide).focal[0];

export const frameTable = (frames) => [
  '  frame  y     focal  kind   compete  axes  elements  empty  flags',
  ...frames.map((f) => `  ${String(f.frame).padEnd(5)}  ${String(f.y).padEnd(4)}  ${`${Math.round(f.focalShare * 100)}%`.padEnd(5)}  ${f.focalKind.padEnd(5)}  ${String(f.competing).padEnd(7)}  ${String(f.axes).padEnd(4)}  ${String(f.n).padEnd(8)}  ${`${Math.round(f.empty * 100)}%`.padEnd(5)}  ${[...f.flags, ...(f.reported ?? []).map((r) => `report: ${r}`)].join('; ') || '-'}`),
];

// Runs in the page, at the top of the document: the hero span (the horizontal extent of the content blocks of the first viewport, chrome left out)
// and, per top-level section, `cols`: the most blocks side by side in one row. Desktop is judged against the phone with these (`crossWidthRows`).
export const measureLayout = () => {
  const vw = innerWidth; const vh = innerHeight;
  const vis = (cs) => cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05;
  const CHROME = '[id*=cookie i], [class*=cookie i], [id*=consent i], [class*=consent i], [id*=gdpr i], [class*=gdpr i], [id*=onetrust], [class*=onetrust], [class*=cc-window], [class*=cmp-], [id*=cmp-]';
  const isChrome = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      if (e.matches(CHROME) || e.tagName === 'NAV' || e.tagName === 'FOOTER' || e.getAttribute('role') === 'navigation') return true;
      if (e.tagName === 'HEADER' && e.getBoundingClientRect().height < 0.3 * vh) return true;
      const pos = getComputedStyle(e).position;
      if ((pos === 'fixed' || pos === 'sticky') && e.getBoundingClientRect().width * e.getBoundingClientRect().height < 0.15 * vw * vh) return true;
    }
    return false;
  };
  const blocksIn = (root) => {
    const by = new Map();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (n.textContent.trim().length < 2 || !el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) || !vis(getComputedStyle(el)) || isChrome(el)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      const key = el.closest('p,h1,h2,h3,h4,h5,h6,li,a,button,label,figcaption,dt,dd,td,th') || el;
      for (const r of rg.getClientRects()) if (r.width > 2 && r.height > 4) by.set(key, [...(by.get(key) ?? []), r]);
    }
    const out = [];
    for (const rs of by.values()) out.push({ l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) });
    for (const el of root.querySelectorAll('img, video, canvas, svg')) {
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 4000 || (el.tagName === 'svg' && r.width < 60) || !vis(getComputedStyle(el)) || isChrome(el)) continue;
      out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
    }
    return out;
  };
  const colsOf = (blocks) => {
    const rows = [];
    for (const b of [...blocks].sort((x, y) => x.t - y.t)) {
      const row = rows.find((q) => Math.min(q.b, b.b) - Math.max(q.t, b.t) >= 0.5 * Math.min(q.b - q.t, b.b - b.t));
      if (row) { row.items.push(b); row.t = Math.min(row.t, b.t); row.b = Math.max(row.b, b.b); } else rows.push({ t: b.t, b: b.b, items: [b] });
    }
    let max = 0;
    for (const row of rows) {
      let cols = 0; let edge = -Infinity;
      for (const b of row.items.sort((x, y) => x.l - y.l)) if (b.l >= edge - 2) { cols++; edge = b.r; } else edge = Math.max(edge, b.r);
      max = Math.max(max, cols);
    }
    return max;
  };
  const first = blocksIn(document.body).map((b) => ({ l: Math.max(0, b.l), r: Math.min(vw, b.r), t: Math.max(0, b.t), b: Math.min(vh, b.b) })).filter((b) => b.b > b.t && b.r > b.l);
  const hero = first.length ? { n: first.length, span: +((Math.max(...first.map((b) => b.r)) - Math.min(...first.map((b) => b.l))) / vw).toFixed(3), widest: +(Math.max(...first.map((b) => b.r - b.l)) / vw).toFixed(3) } : { n: 0, span: 0, widest: 0 };
  const all = [...document.querySelectorAll('section, [data-section]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height >= 120 && vis(getComputedStyle(e)); });
  const top = all.filter((s) => !all.some((o) => o !== s && o.contains(s)));
  const sections = top.map((s, i) => ({ name: s.id ? `#${s.id}` : s.getAttribute('data-section') || `section ${i + 1}`, cols: colsOf(blocksIn(s)) }));
  return { hero, sections };
};

// Pure: the rows of the desktop composition. The hero of a wide window (1200 or more) spans half the width or more; of the sections
// that exist at both widths, two or more change their number of columns from the phone to the desktop (a stretched phone changes none).
export const HERO_SPAN_MIN = 0.5;
export const SECTIONS_RECOMPOSED_MIN = 2;
export const layoutHeroRows = (layout, width) => {
  if (!layout?.hero?.n || width < 1200 || (layout.sections?.length ?? 0) < 3) return [];
  const pct = Math.round(layout.hero.span * 100);
  return [{ rule: 'desktop hero span', value: `${pct}%`, range: `the hero content spans ${Math.round(HERO_SPAN_MIN * 100)}% of the width or more (widest block ${Math.round(layout.hero.widest * 100)}%)`, pass: layout.hero.span >= HERO_SPAN_MIN, detail: [`first-viewport blocks: ${layout.hero.n}`] }];
};
export const crossWidthRows = (widths) => {
  const parse = (k) => Number(k.split('x')[0]);
  const withLayout = Object.entries(widths).filter(([, w]) => w.layout?.sections?.length).map(([k, w]) => [parse(k), k, w.layout]);
  const wide = withLayout.filter(([w]) => w >= 1200).sort((a, b) => b[0] - a[0])[0];
  const phone = withLayout.filter(([w]) => w < 600).sort((a, b) => a[0] - b[0])[0];
  if (!wide || !phone) return [];
  const n = Math.min(wide[2].sections.length, phone[2].sections.length);
  if (n < 3) return [];
  const changed = []; const same = [];
  for (let i = 0; i < n; i++) {
    const [d, p] = [wide[2].sections[i], phone[2].sections[i]];
    (d.cols !== p.cols ? changed : same).push(`${d.name} ${p.cols} to ${d.cols} columns`);
  }
  return [{ rule: 'desktop composition: sections recomposed from 390', value: `${changed.length} of ${n}`, range: `${SECTIONS_RECOMPOSED_MIN} or more sections with another number of columns at ${wide[1]} than at ${phone[1]}`, pass: changed.length >= SECTIONS_RECOMPOSED_MIN, detail: same.map((x) => `same: ${x}`), widest: wide[1] }];
};

// Runs in the page, at DPR 2: file width against rendered width, pasted boxes, repeated sources, the LCP image.
export const measureImages = async ({ margin, dpr }) => {
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : ''} ${(el.getAttribute('alt') || (el.currentSrc || '').split('/').pop() || '').slice(0, 24)}`;
  const shown = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const imgs = [...document.querySelectorAll('img')].filter((i) => shown(i) && i.currentSrc && !/\.svg(\?|$)/i.test(i.currentSrc) && !i.currentSrc.startsWith('data:image/svg'));
  const fileWidth = async (src) => {
    const p = new Image(); p.src = src;
    try { await p.decode(); } catch { return null; }
    return p.naturalWidth;
  };
  // A broken image (finished loading with no pixels) paints its alt as text or an empty box; a lazy one still waiting is not complete.
  const broken = [...document.querySelectorAll('img')].filter((i) => {
    const cs = getComputedStyle(i);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && (i.hasAttribute('src') || i.hasAttribute('srcset')) && i.complete && i.naturalWidth === 0;
  });
  const brokenLabels = broken.map(label);
  const altShown = broken.filter((i) => (i.getAttribute('alt') || '').trim()).map((i) => `${label(i)}: "${i.getAttribute('alt').trim().slice(0, 40)}" is painted as page text`);
  const low = []; const sizes = [];
  for (const i of imgs) {
    const w = i.getBoundingClientRect().width;
    if (w < 64) continue;
    const nat = await fileWidth(i.currentSrc);
    if (nat != null && nat < Math.round(w * dpr) - 1) low.push(`${label(i)}: file ${nat} px, shown ${Math.round(w)} px (needs ${Math.round(w * dpr)})`);
    sizes.push({ img: label(i), file: nat, shown: Math.round(w) });
  }

  const textRects = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim() || !n.parentElement.getClientRects().length || ['SCRIPT', 'STYLE'].includes(n.parentElement.tagName)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) if (r.width > 1) textRects.push(r);
  }
  const bgOf = (el) => {
    for (let e = el.parentElement; e; e = e.parentElement) {
      const m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g);
      if (m && (m.length < 4 || parseFloat(m[3]) > 0.5)) return { el: e, rgb: m.slice(0, 3).map(Number) };
    }
    return { el: document.documentElement, rgb: [255, 255, 255] };
  };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const meanColor = (img) => {
    try {
      const c = document.createElement('canvas'); c.width = 8; c.height = 8;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 8, 8);
      const d = x.getImageData(0, 0, 8, 8).data; const s = [0, 0, 0];
      for (let k = 0; k < d.length; k += 4) { s[0] += d[k]; s[1] += d[k + 1]; s[2] += d[k + 2]; }
      return s.map((v) => v / 64);
    } catch { return null; }
  };
  const pasted = []; const unknown = [];
  for (const i of imgs) {
    const r = i.getBoundingClientRect();
    if (r.width < 120 || r.height < 80) continue;
    const { el: box, rgb } = bgOf(i);
    const b = box === document.documentElement ? { left: 0, right: innerWidth, top: -scrollY, bottom: document.documentElement.scrollHeight - scrollY } : box.getBoundingClientRect();
    const m = [r.left - b.left, b.right - r.right, r.top - b.top, b.bottom - r.bottom];
    if (m.some((v) => v < margin)) continue;
    if (textRects.some((t) => Math.min(t.right, r.right) > Math.max(t.left, r.left) && Math.min(t.bottom, r.bottom) > Math.max(t.top, r.top))) continue;
    const mean = meanColor(i);
    if (!mean) { unknown.push(label(i)); continue; }
    const [hi, lo] = [Math.max(lum(mean), lum(rgb)), Math.min(lum(mean), lum(rgb))];
    if ((hi + 0.05) / (lo + 0.05) >= 1.3) pasted.push(`${label(i)}: ${m.map(Math.round).join('/')} px of margin over a contrasting background`);
  }

  const seen = new Map();
  for (const i of imgs) {
    if (i.getBoundingClientRect().width < 64) continue;
    const s = i.currentSrc;
    const key = s.startsWith('data:') ? `data:${s.length}:${s.slice(-48)}` : s.split('?')[0].split('/').pop().replace(/-\d+(\.\w+)$/, '$1');
    seen.set(key, [...(seen.get(key) ?? []), label(i)]);
  }
  const repeated = [...seen.values()].filter((v) => v.length > 1).map((v) => `${v[0]} x${v.length}`);

  // Without an LCP entry (a canvas or a video is never one) the largest image is only a candidate if it was painted at t0.
  const top = [...imgs].filter((i) => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && (!window.__t0 || window.__t0.includes(label(i))); }).sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
  const entries = window.__lcp ?? [];
  const lastEl = entries.length ? entries[entries.length - 1].element : null;
  const lcpEl = lastEl && lastEl.isConnected ? lastEl : null;
  const cand = lcpEl && lcpEl.tagName === 'IMG' ? lcpEl : (!lcpEl ? top : null);
  let lcp = null;
  if (cand) lcp = { img: label(cand), lazy: cand.loading === 'lazy', visibleT0: window.__t0 ? window.__t0.includes(label(cand)) : true };
  return { low, pasted, unknown, repeated, lcp, sizes, broken: brokenLabels, altShown };
};

// Runs in the page right after load: which images are painted and in view at t0.
export const markVisibleAtT0 = () => {
  window.__t0 = [...document.querySelectorAll('img')].filter((i) => {
    const r = i.getBoundingClientRect(); const cs = getComputedStyle(i);
    let op = 1; for (let e = i; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && cs.visibility !== 'hidden' && cs.display !== 'none' && op > 0.05;
  }).map((i) => `${i.tagName.toLowerCase()}${i.id ? `#${i.id}` : ''}${i.classList.length ? `.${[...i.classList].slice(0, 2).join('.')}` : ''} ${(i.getAttribute('alt') || (i.currentSrc || '').split('/').pop() || '').slice(0, 24)}`);
};

export const LCP_INIT = () => {
  window.__lcp = [];
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lcp.push(e))).observe({ type: 'largest-contentful-paint', buffered: true }); } catch { /* no LCP */ }
};

// Palette of `.claude/reference/color.md`. Pure color math first, then the page function that reads computed styles, then the rows.
export const CTA_GRAY_DL = 0.15;
export const CTA_CHROMA_DC = 0.08;
export const CTA_HUE_DH = 40;
// Pure: how far two colors are in OKLCH. They separate by lightness, by chroma, or by hue when both have chroma (a lime and a cream
// share a luminance and still differ by chroma). `score` is the best component over its threshold; 1 or more passes.
export const oklchSeparation = (a, b) => {
  const [x, y] = [toOklch(a), toOklch(b)];
  const dL = Math.abs(x.L - y.L); const dC = Math.abs(x.C - y.C);
  const dh = Math.min(Math.abs(x.h - y.h), 360 - Math.abs(x.h - y.h));
  const hue = x.C >= 0.04 && y.C >= 0.04 ? dh / CTA_HUE_DH : 0;
  const score = Math.max(dL / CTA_GRAY_DL, dC / CTA_CHROMA_DC, hue);
  return { dL, dC, dh, score, ok: score >= 1 };
};
export const ACCENT_MAX_OTHER = 2;
export const VARIANT_DL = 0.03;
export const PHOTO_SPREAD = 0.15;
export const PHOTO_MIN_RATIO = 3;
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const toOklch = ([r, g, b]) => {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, Bb), h: ((Math.atan2(Bb, A) * 180) / Math.PI + 360) % 360 };
};
const relLum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export const wcagRatio = (a, b) => { const [hi, lo] = [Math.max(relLum(a), relLum(b)), Math.min(relLum(a), relLum(b))]; return (hi + 0.05) / (lo + 0.05); };
// APCA 0.0.98G-4g, signed: positive is dark text on a light background.
export const apcaLc = (fg, bg) => {
  const y = (c) => { const v = (c[0] / 255) ** 2.4 * 0.2126729 + (c[1] / 255) ** 2.4 * 0.7151522 + (c[2] / 255) ** 2.4 * 0.072175; return v < 0.022 ? v + (0.022 - v) ** 1.414 : v; };
  const [yt, yb] = [y(fg), y(bg)];
  if (Math.abs(yb - yt) < 0.0005) return 0;
  if (yb > yt) { const s = (yb ** 0.56 - yt ** 0.57) * 1.14; return s < 0.1 ? 0 : (s - 0.027) * 100; }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return s > -0.1 ? 0 : (s + 0.027) * 100;
};
export const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

// Runs in the page: computed fills and text colors, normalized to rgb. A background image makes a surface unknown (null), never guessed.
export const collectPalette = () => {
  const cx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = (v) => {
    const m = v.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\s*\)$/);
    if (m) { const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]); return [+m[1], +m[2], +m[3], a]; }
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = v; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
  const shown = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05; };
  const surface = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (!/^none(\s*,\s*none)*$/.test(cs.backgroundImage)) return null;
      const c = rgba(cs.backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255];
    for (const l of layers.reverse()) base = over(l, base);
    return base;
  };
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : ''} "${(el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 20)}"`;
  const CTL = 'a, button, [role=button], input[type=submit], .btn, .cta, [data-cta]';
  const fillOf = (el) => {
    const cs = getComputedStyle(el);
    if (!/^none(\s*,\s*none)*$/.test(cs.backgroundImage)) return null;
    const c = rgba(cs.backgroundColor);
    if (c[3] < 0.5) return null;
    const under = el.parentElement ? surface(el.parentElement) : [255, 255, 255];
    return under ? over(c, under) : c.slice(0, 3);
  };
  // The paint of a control under a gradient: its first stop that covers (alpha 0.5 or more), in any color syntax; with only
  // translucent stops (a glare, a fade from transparent), the background color under them.
  const STOP = /(?:rgba?|hsla?|oklch|oklab|lch|lab|color)\([^()]*(?:\([^()]*\)[^()]*)*\)|#[0-9a-f]{3,8}\b/gi;
  const paintOf = (el, cs) => {
    if (/^none(\s*,\s*none)*$/.test(cs.backgroundImage)) return null;
    const opaque = (cs.backgroundImage.match(STOP) ?? []).map(rgba).find((c) => c[3] >= 0.5);
    if (opaque) return opaque.slice(0, 3);
    const c = rgba(cs.backgroundColor);
    if (c[3] < 0.5) return null;
    const under = el.parentElement ? surface(el.parentElement) : [255, 255, 255];
    return under ? over(c, under) : c.slice(0, 3);
  };
  const controls = [...document.querySelectorAll(CTL)].filter(shown).map((el) => {
    const cs = getComputedStyle(el);
    const bw = parseFloat(cs.borderTopWidth);
    return { el, label: label(el), fill: fillOf(el), paint: paintOf(el, cs), under: el.parentElement ? surface(el.parentElement) : null, color: rgba(cs.color).slice(0, 3), border: bw > 0 && cs.borderTopStyle !== 'none' ? rgba(cs.borderTopColor).slice(0, 3) : null };
  });
  const pickPrimary = (list) => {
    const marked = list.find((c) => c.el.matches('[data-cta], [data-primary], .cta, .btn-primary') && c.fill);
    if (marked) return marked;
    const filled = list.filter((c) => c.fill);
    return filled.find((c) => Math.max(...c.fill) - Math.min(...c.fill) > 30) || filled[0] || null;
  };
  const tagged = document.querySelector('[data-kit-cta]');
  const primary = controls.find((c) => c.el === tagged && c.fill) || pickPrimary(controls);
  const variants = [];
  for (const attr of ['data-flavor', 'data-variant']) {
    const seen = new Set();
    for (const root of document.querySelectorAll(`[${attr}]`)) {
      const name = root.getAttribute(attr);
      if (seen.has(name)) continue;
      seen.add(name);
      const p = pickPrimary(controls.filter((c) => root.contains(c.el)));
      if (p) variants.push({ name: `${attr}=${name}`, fill: p.fill });
    }
  }
  const byKey = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim();
    const el = n.parentElement;
    if (t.length < 2 || !el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) || !shown(el)) continue;
    const cs = getComputedStyle(el);
    const bg = surface(el);
    if (!bg) continue;
    const fg = over(rgba(cs.color), bg);
    const fs = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = fs >= 24 || (fs >= 18.66 && bold);
    const key = `${fg.map(Math.round)}|${bg.map(Math.round)}|${large}`;
    const o = byKey.get(key) || { fg, bg, fs, large, chars: 0, ctl: Boolean(el.closest(CTL)), sample: label(el) };
    o.chars += t.length; byKey.set(key, o);
  }
  // The color the brand check reads: the tagged CTA's fill, or the paint of its gradient.
  const taggedCtl = controls.find((c) => c.el === tagged);
  const action = taggedCtl ? (taggedCtl.fill ?? taggedCtl.paint) : primary?.fill ?? null;
  return { primary: primary ? { label: primary.label, fill: primary.fill, under: primary.under } : null, action, controls: controls.map(({ el, ...c }) => ({ ...c, primary: primary ? el === primary.el : false })), variants, texts: [...byKey.values()].slice(0, 300) };
};

// Pure: the rows of the palette from what `collectPalette` read. A row with no data to measure is left out, never passed.
export const paletteRows = (pal) => {
  const row = (rule, value, range, pass, detail = []) => ({ rule, value, range, pass, detail });
  if (!pal) return [];
  const out = [];
  const fmt = (c) => `${hex(c)} L ${toOklch(c).L.toFixed(2)}`;
  // Colors painted under the text (`paintedTexts`) when the round sampled them; else the computed ones.
  const texts = pal.painted?.length ? pal.painted : (pal.texts ?? []);
  if (pal.primary?.fill) {
    const cta = toOklch(pal.primary.fill);
    const plain = texts.filter((t) => !t.ctl);
    const body = [...plain].sort((a, b) => b.chars - a.chars)[0];
    const sameAs = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 2);
    const gap = (t) => Math.abs(toOklch(t.fg).L - toOklch(t.bg).L);
    // Roles stay apart: a muted text color shares the body's surface and polarity; a light ink on another surface is not muted.
    const polarity = (t) => Math.sign(toOklch(t.fg).L - toOklch(t.bg).L);
    const bodyBg = body && toOklch(body.bg).L;
    const muted = plain.filter((t) => body && !sameAs(t.fg, body.fg) && t.chars >= 8 && polarity(t) === polarity(body) && Math.abs(toOklch(t.bg).L - bodyBg) < 0.15 && !sameAs(t.fg, t.bg)).sort((a, b) => gap(a) - gap(b))[0];
    const adjacent = pal.primary.under ? [['adjacent background', { fg: pal.primary.under }]] : [];
    const pairs = [...adjacent, ['body text', body], ['muted text', muted]].filter(([, t]) => t);
    const seps = pairs.map(([n, t]) => [n, t, oklchSeparation(pal.primary.fill, t.fg)]);
    if (seps.length) out.push(row('palette: CTA separation (OKLCH)', +Math.min(...seps.map((s) => s[2].score)).toFixed(2), `>= 1: ΔL ${CTA_GRAY_DL}, or ΔC ${CTA_CHROMA_DC}, or hue ${CTA_HUE_DH}° (both chromatic) from adjacent background, body and muted text`, seps.every((s) => s[2].ok), [`CTA ${pal.primary.label} fill ${fmt(pal.primary.fill)}`, ...seps.map(([n, t, s]) => `${n} ${fmt(t.fg)}: ΔL ${s.dL.toFixed(2)} ΔC ${s.dC.toFixed(2)} Δh ${Math.round(s.dh)}°`)]));
    const near = (c) => { const k = toOklch(c); const dh = Math.min(Math.abs(k.h - cta.h), 360 - Math.abs(k.h - cta.h)); return k.C > 0.04 && Math.abs(k.L - cta.L) < 0.05 && dh < 12 && Math.abs(k.C - cta.C) < 0.06; };
    if (cta.C > 0.04) {
      const others = pal.controls.filter((c) => !c.primary && [c.fill, c.color, c.border].some((x) => x && near(x)));
      // The accent is reserved only when it also colors non-actions; an accent that is the action color everywhere is valid.
      const nonActions = plain.filter((t) => near(t.fg) && t.chars >= 2);
      out.push(nonActions.length
        ? row('palette: accent reserved', others.length, `<= ${ACCENT_MAX_OTHER} other controls (the accent also colors non-actions)`, others.length <= ACCENT_MAX_OTHER, [...others.map((c) => c.label), ...nonActions.slice(0, 3).map((t) => `non-action ${t.sample}`)])
        : row('palette: accent reserved', others.length, 'n/a: the accent only colors actions', true, others.map((c) => c.label)));
    }
    const surfaces = [...new Map(texts.map((t) => [hex(t.bg), t.bg])).values()];
    const inks = [...new Map(texts.map((t) => [hex(t.fg), t.fg])).values()];
    out.push({ ...row('palette: roles', `${inks.length} text / ${surfaces.length} background`, 'report only: text colors and background colors apart', true, [`text ${inks.slice(0, 8).map(fmt).join(', ')}`, `background ${surfaces.slice(0, 8).map(fmt).join(', ')}`]), report: true });
  }
  if (texts.length) {
    const fails = texts.filter((t) => wcagRatio(t.fg, t.bg) < (t.large ? 3 : 4.5));
    out.push(row('palette: text contrast (WCAG AA)', fails.length, '0 pairs under 4.5:1 (3:1 large)', fails.length === 0, fails.slice(0, 8).map((t) => `${t.sample} ${hex(t.fg)} on ${hex(t.bg)} ${wcagRatio(t.fg, t.bg).toFixed(2)}:1`)));
    const lcs = texts.map((t) => ({ t, lc: apcaLc(t.fg, t.bg) })).sort((a, b) => Math.abs(a.lc) - Math.abs(b.lc));
    out.push(row('palette: APCA Lc (report)', +Math.abs(lcs[0].lc).toFixed(0), 'reported: body >= 75, loose text >= 30', true, lcs.slice(0, 5).map(({ t, lc }) => `${t.sample} ${hex(t.fg)} on ${hex(t.bg)} Lc ${lc.toFixed(0)} (${t.fs}px)`)));
  }
  // Over a photo or a gradient the mean pixel hides the bright patch under a word: the worst tenth of the pixels is what is read.
  const busy = texts.filter((t) => t.lo && t.spread >= PHOTO_SPREAD);
  if (busy.length) {
    const worst = (t) => (wcagRatio(t.fg, t.lo) < wcagRatio(t.fg, t.hi) ? t.lo : t.hi);
    const bad = busy.filter((t) => wcagRatio(t.fg, worst(t)) < PHOTO_MIN_RATIO);
    out.push(row('palette: text over images', bad.length, `0 of ${busy.length} texts under ${PHOTO_MIN_RATIO}:1 against the worst tenth of the pixels behind them (a scrim or a calmer crop)`, bad.length === 0, bad.slice(0, 8).map((t) => `${t.sample} ${hex(t.fg)} on ${hex(worst(t))} ${wcagRatio(t.fg, worst(t)).toFixed(2)}:1`)));
  }
  const vs = (pal.variants ?? []).filter((v) => v.fill);
  if (vs.length >= 2) {
    const ls = vs.map((v) => toOklch(v.fill).L);
    const mean = ls.reduce((a, b) => a + b, 0) / ls.length;
    const off = vs.filter((v, i) => Math.abs(ls[i] - mean) > VARIANT_DL);
    out.push(row('palette: variant CTA fills', +(Math.max(...ls) - Math.min(...ls)).toFixed(2), `each within ±${VARIANT_DL} L of the mean`, off.length === 0, vs.map((v) => `${v.name} ${fmt(v.fill)}${off.includes(v) ? ' (off)' : ''}`)));
  }
  return out;
};

// Runs in the page: every text run in the viewport, one box per text node; a run at opacity 0 (an entrance not played yet) stays with its
// `alpha` so the type scale still reads, and the paint-dependent steps skip it. Left out: copies that cannot be seen (display none, sr-only and clip-path copies, lines clipped away by an `overflow: hidden` ancestor). `g` groups the runs of one
// block (a split heading is one block); `area` is what shows inside the viewport.
export const collectTextBoxes = () => {
  const vw = innerWidth; const vh = innerHeight;
  const cx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = (v) => {
    const m = v.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\s*\)$/);
    if (m) { const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]); return [+m[1], +m[2], +m[3], a]; }
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = v; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255];
  };
  const CTL = 'a, button, [role=button], input[type=submit], .btn, .cta, [data-cta]';
  const BLOCK = 'h1,h2,h3,h4,h5,h6,p,li,a,button,label,figcaption,blockquote,dt,dd,td,th';
  const hiddenClip = (cs) => /^rect\(\s*[01](px)?[ ,]+[01](px)?[ ,]+[01](px)?[ ,]+[01](px)?\s*\)/.test(cs.clip) || /^inset\((50|100)%/.test(cs.clipPath);
  const area = (r) => Math.max(0, r.r - r.l) * Math.max(0, r.b - r.t);
  const groups = new Map();
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim();
    const el = n.parentElement;
    if (!text || !el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
    let alpha = 1; let seen = true; const clips = []; let abs = false; let fixed = false;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || hiddenClip(cs)) { seen = false; break; }
      alpha *= parseFloat(cs.opacity);
      // an absolute or fixed box leaves the clip of ancestors that are not its containing block
      const clips1 = (cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible') && !fixed && !(abs && e !== el && cs.position === 'static');
      if (e !== el && cs.position !== 'static') abs = false;
      if (cs.position === 'fixed') fixed = true; else if (cs.position === 'absolute') abs = true;
      if (clips1) { const r = e.getBoundingClientRect(); clips.push({ l: r.left, t: r.top, r: r.right, b: r.bottom }); }
    }
    if (!seen) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    const rs = [];
    for (const q of rg.getClientRects()) {
      let r = { l: Math.max(0, q.left), t: Math.max(0, q.top), r: Math.min(vw, q.right), b: Math.min(vh, q.bottom) };
      for (const c of clips) r = { l: Math.max(r.l, c.l), t: Math.max(r.t, c.t), r: Math.min(r.r, c.r), b: Math.min(r.b, c.b) };
      if (r.r - r.l > 2 && r.b - r.t > 4) rs.push(r);
    }
    if (!rs.length) continue;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    let g = el.closest(BLOCK) || el;
    for (let up = 0; !el.closest(BLOCK) && up < 3 && g.parentElement && g.parentElement !== document.body && getComputedStyle(g.parentElement).fontSize === cs.fontSize; up++) {
      const pr = g.parentElement.getBoundingClientRect();
      if (pr.width * pr.height > 0.9 * vw * vh) break;
      g = g.parentElement;
    }
    if (!groups.has(g)) groups.set(g, groups.size);
    const label = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : ''} "${text.replace(/\s+/g, ' ').slice(0, 20)}"`;
    out.push({
      g: groups.get(g), l: Math.min(...rs.map((r) => r.l)), t: Math.min(...rs.map((r) => r.t)), r: Math.max(...rs.map((r) => r.r)), b: Math.max(...rs.map((r) => r.b)),
      area: rs.reduce((s, r) => s + area(r), 0), fs, bold: parseInt(cs.fontWeight, 10) >= 700,
      lh: cs.lineHeight === 'normal' ? 1.2 : parseFloat(cs.lineHeight) / fs, em: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) / fs,
      color: rgba(cs.color), alpha, chars: text.length, ctl: Boolean(el.closest(CTL)), sample: label,
    });
  }
  const body = getComputedStyle(document.body);
  return { boxes: out, bodyPx: parseFloat(body.fontSize), bodyEm: body.letterSpacing === 'normal' ? 0 : parseFloat(body.letterSpacing) / parseFloat(body.fontSize) };
};

// Pure: the typography numbers of the first viewport from `collectTextBoxes`. The display is the block with the largest font size among
// the blocks that paint at least a word (two characters, 600 px2), ties by painted area: a long small paragraph never outranks a headline,
// and a screen-reader copy or a small `h1` over a huge drawn headline never stands in for it.
export const typographyOf = ({ boxes, bodyPx, bodyEm }) => {
  const round = (v, d) => (v == null ? null : +v.toFixed(d));
  const blocks = new Map();
  // A run at exactly opacity 0 is a decoy copy; one barely above 0 is an entrance that has not played yet and still counts.
  const painted = boxes.filter((b) => b.alpha > 0);
  for (const b of painted) {
    const o = blocks.get(b.g) ?? { area: 0, fs: 0, chars: 0, b };
    o.area += b.area; o.chars += b.chars; o.fs = Math.max(o.fs, b.fs); if (b.fs >= o.b.fs) o.b = b; blocks.set(b.g, o);
  }
  const all = [...blocks.values()];
  const real = all.filter((o) => o.chars >= 2 && o.area >= 600);
  const late = (o) => o.b.alpha < 0.05;
  const best = (real.length ? real : all).sort((x, y) => y.fs - x.fs || y.area - x.area)[0];
  const sizes = [...new Set(painted.map((b) => Math.round(b.fs)))].sort((a, b) => a - b);
  return {
    displayPx: best ? best.b.fs : null, ratio: round(best && best.b.fs / bodyPx, 2), displayLineHeight: round(best && best.b.lh, 3), displayTrackingEm: round(best && best.b.em, 3),
    displaySample: best?.b.sample ?? null, displayLate: Boolean(best && late(best)), bodyTrackingEm: round(bodyEm, 3), sizes, sizeCount: sizes.length,
  };
};

// Pure: the (ink, surface) pairs of the painted texts, merged by color. `bgs` are the pixels measured under each box; the ink is
// composited with its own opacity over them. A box with no measured pixel is left out, never guessed.
export const paintedPairs = (boxes, bgs, ranges = []) => {
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
  const byKey = new Map();
  boxes.forEach((b, i) => {
    if (b.chars < 2 || b.alpha < 0.05 || !bgs[i]) return;
    const bg = bgs[i]; const fg = over([b.color[0], b.color[1], b.color[2], b.color[3] * b.alpha], bg);
    const large = b.fs >= 24 || (b.fs >= 18.66 && b.bold);
    const key = `${fg.map(Math.round)}|${bg.map(Math.round)}|${large}`;
    const o = byKey.get(key) ?? { fg, bg, fs: b.fs, large, chars: 0, ctl: b.ctl, sample: b.sample };
    const r = ranges[i];
    if (r && (o.spread ?? -1) < r.spread) Object.assign(o, { lo: r.lo, hi: r.hi, spread: r.spread });
    o.chars += b.chars; byKey.set(key, o);
  });
  return [...byKey.values()];
};
export const mergePainted = (lists) => {
  const byKey = new Map();
  for (const t of lists.flat()) {
    const key = `${t.fg.map(Math.round)}|${t.bg.map(Math.round)}|${t.large}`;
    const o = byKey.get(key);
    if (o) { o.chars += t.chars; if ((o.spread ?? -1) < (t.spread ?? -1)) Object.assign(o, { lo: t.lo, hi: t.hi, spread: t.spread }); } else byKey.set(key, { ...t });
  }
  return [...byKey.values()].slice(0, 300);
};

// Runs in the page: decodes a PNG (base64) and returns, for each box [l, t, r, b] in CSS px, the mean rgb of the pixels inside it.
export const sampleUnder = async ({ b64, boxes, scale }) => {
  const img = new Image(); img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  return boxes.map(([l, t, r, b]) => {
    const [x0, y0, x1, y1] = [Math.max(0, Math.floor(l * scale)), Math.max(0, Math.floor(t * scale)), Math.min(c.width, Math.ceil(r * scale)), Math.min(c.height, Math.ceil(b * scale))];
    if (x1 <= x0 || y1 <= y0) return null;
    const d = x.getImageData(x0, y0, x1 - x0, y1 - y0).data; const step = Math.max(1, Math.floor(d.length / 4 / 200)) * 4; const s = [0, 0, 0]; let n = 0;
    for (let k = 0; k < d.length; k += step) { s[0] += d[k]; s[1] += d[k + 1]; s[2] += d[k + 2]; n++; }
    return s.map((v) => v / n);
  });
};

// Runs in the page: like `sampleUnder`, but for each box the darkest and lightest tenth of the pixels (rgb at the 10th and 90th percentile of
// luminance) and the relative-luminance gap between them: a photo or a gradient behind the text has a wide one, a flat surface none.
export const sampleRange = async ({ b64, boxes, scale }) => {
  const img = new Image(); img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (p) => 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]);
  return boxes.map(([l, t, r, b]) => {
    const [x0, y0, x1, y1] = [Math.max(0, Math.floor(l * scale)), Math.max(0, Math.floor(t * scale)), Math.min(c.width, Math.ceil(r * scale)), Math.min(c.height, Math.ceil(b * scale))];
    if (x1 <= x0 || y1 <= y0) return null;
    const d = x.getImageData(x0, y0, x1 - x0, y1 - y0).data; const step = Math.max(1, Math.floor(d.length / 4 / 400)) * 4; const px = [];
    for (let k = 0; k < d.length; k += step) px.push([d[k], d[k + 1], d[k + 2]]);
    px.sort((p, q) => lum(p) - lum(q));
    const lo = px[Math.floor((px.length - 1) * 0.1)]; const hi = px[Math.floor((px.length - 1) * 0.9)];
    return { lo, hi, spread: lum(hi) - lum(lo) };
  });
};

// Runs in the page: the per-channel standard deviation of a PNG (base64).
export const pixelSpread = async (b64) => {
  const img = new Image(); img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement('canvas'); c.width = Math.min(64, img.naturalWidth); c.height = Math.min(64, img.naturalHeight);
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data; const n = d.length / 4;
  let worst = 0;
  for (let ch = 0; ch < 3; ch++) {
    let m = 0; for (let k = ch; k < d.length; k += 4) m += d[k]; m /= n;
    let v = 0; for (let k = ch; k < d.length; k += 4) v += (d[k] - m) ** 2;
    worst = Math.max(worst, Math.sqrt(v / n));
  }
  return worst;
};

// Browser step: the text of the current viewport with the pixels painted under it. The text is made transparent for one screenshot, so what
// is measured is the surface (image, video, gradient, a pinned layer) and not a color guessed from the ancestors.
export const paintedTexts = async (page) => {
  const { boxes } = await page.evaluate(collectTextBoxes);
  const live = boxes.filter((b) => b.chars >= 2 && b.alpha >= 0.05);
  if (!live.length) return [];
  await page.evaluate(() => { const s = document.createElement('style'); s.id = '__kit-hide-text'; s.textContent = '*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}'; document.head.append(s); });
  let png;
  try { png = await page.screenshot({ type: 'png' }); } finally { await page.evaluate(() => document.getElementById('__kit-hide-text')?.remove()); }
  const arg = { b64: png.toString('base64'), boxes: live.map((b) => [b.l, b.t, b.r, b.b]), scale: 1 };
  const bgs = await page.evaluate(sampleUnder, arg);
  const ranges = await page.evaluate(sampleRange, arg).catch(() => []);
  return paintedPairs(live, bgs, ranges);
};

// Runs in the page: the canvases that show in the viewport (32 px or more, not hidden, not at opacity 0).
export const visibleCanvases = () => [...document.querySelectorAll('canvas')].flatMap((el) => {
  const r = el.getBoundingClientRect();
  let alpha = 1; let seen = true;
  for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') seen = false; alpha *= parseFloat(cs.opacity); }
  const l = Math.max(0, r.left); const t = Math.max(0, r.top); const w = Math.min(innerWidth, r.right) - l; const h = Math.min(innerHeight, r.bottom) - t;
  return seen && alpha >= 0.05 && w * h >= 0.04 * innerWidth * innerHeight ? [{ label: `canvas${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : ''} ${Math.round(r.width)}x${Math.round(r.height)}`, l, t, w, h }] : [];
});

// Browser step: each visible canvas as painted (a screenshot of its box, so WebGL counts), with how much its pixels vary.
export const sampleCanvases = async (page, when) => {
  const out = [];
  for (const c of (await page.evaluate(visibleCanvases)).slice(0, 6)) {
    const png = await page.screenshot({ type: 'png', clip: { x: c.l, y: c.t, width: c.w, height: c.h } }).catch(() => null);
    if (!png) continue;
    const sd = await page.evaluate(pixelSpread, png.toString('base64'));
    out.push({ when, label: c.label, sd: +sd.toFixed(2), blank: sd < UNIFORM_SD });
  }
  return out;
};

// Pure: the row of the canvas samples; no canvas, no row.
export const canvasRows = (samples) => {
  if (!samples?.length) return [];
  const blank = samples.filter((s) => s.blank);
  return [{ rule: 'canvas-nonblank', value: `${blank.length} blank of ${samples.length} samples`, range: `0 uniform canvases (sd < ${UNIFORM_SD}) at t0+2 s and after a scroll`, pass: blank.length === 0, detail: blank.map((s) => `${s.label} · ${s.when} · sd ${s.sd}`) }];
};

// The brand sheet of a card. Four kinds: `brand.json` (`fonts`, `wordmark`, `palette`, `icon`, `voice`; its `palette` gives the colors),
// the direction the taste skill dealt for a page (`direction.json`: `type` and `palette`) or for an app screen (`kind: app`, `style.tokens`),
// and a Markdown file, whose `## Brand` block gives `fonts:` (and its colors, the hex of its lines, when there is no front matter) and whose
// front matter, in a DESIGN.md, gives the colors under a `colors:` map (at any depth, `theme: colors:` too) and the `fontFamily` of each type style.
// `actions` are the colors a primary action may take: the dealt accent, or the DESIGN.md colors whose key path names primary, accent,
// brand, cta or action and no state, text or on-color segment (a terracotta CTA is not Airbnb's error red; `brand-pink` is a brand color).
const HEX = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const hex6 = (h) => (h.length === 4 ? `#${[...h.slice(1)].map((c) => c + c).join('')}` : h);
const hexesIn = (v) => [...new Set((JSON.stringify(v ?? null).match(HEX) ?? []).map(hex6))];
const firstFamily = (stack) => String(stack).replace(/^\s*\[|\]\s*$/g, '').split(',')[0].trim().replace(/^["'`]+|["'`]+$/g, '');
const ACTION_SEGMENT = /^(?:primary|accent|brand|cta|action)$/i;
const NOT_BACKGROUND_SEGMENT = /^(?:text|ink|on|foreground|fg|border|outline|stroke|icon)$/i;
const NOT_ACTION_SEGMENT =/^(?:error|danger|destructive|disabled|text|ink|on|foreground|fg|muted|subtle|border|outline|bg|background|surface|hover|active|pressed|focus|light|lighter|dark|darker)$/i;
// The colors of a YAML front matter with their key paths (`colors.primary.base`), read by indentation.
const frontColors = (front) => {
  const stack = []; const out = [];
  for (const line of front.split(/\r?\n/)) {
    const m = line.match(/^(\s*)(?:-\s+)?["']?([\w.-]+)["']?\s*:\s*(.*)$/);
    if (!m) continue;
    const indent = m[1].length;
    while (stack.length && stack.at(-1).indent >= indent) stack.pop();
    const path = [...stack.map((s) => s.key), m[2]];
    const value = m[3].replace(/(?:^|\s+)#\s.*$/, '').trim();
    if (!value) { stack.push({ indent, key: m[2] }); continue; }
    if (!path.slice(0, -1).some((k) => /^(?:colou?rs|palette)$/i.test(k))) continue;
    for (const h of value.match(HEX) ?? []) out.push({ path, hex: hex6(h) });
  }
  return out;
};
// sha256 of the sheet's text with line endings normalised: the round records it, the gate hashes the sheet again.
export const sheetHashOf = (file) => createHash('sha256').update(readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n')).digest('hex');
export const loadBrand = (file) => {
  const raw = readFileSync(file, 'utf8').replace(/^﻿/, '');
  if (/\.json$/i.test(file)) {
    const b = JSON.parse(raw);
    if (b.kind === 'app' && b.style?.tokens) {
      const t = b.style.tokens;
      return { fonts: [...new Set([t.font?.family, t.font?.second && firstFamily(t.font.second)].filter(Boolean))], colors: hexesIn([t.ground, t.surface, t.raised, t.active, t.text, t.muted, t.accent]), actions: hexesIn([t.accent]), backgrounds: hexesIn([t.ground, t.surface, t.raised, t.active]) };
    }
    if (b.palette && b.type) {
      const p = b.palette;
      return { fonts: [...new Set([b.type.display?.family, b.type.text?.family].filter(Boolean))], colors: hexesIn([p.bg, p.surface, p.ink, p.muted, p.accent, p.accentInk, p.fields]), actions: hexesIn([p.accent]), backgrounds: hexesIn([p.bg, p.surface, (p.fields ?? []).map((f) => f?.bg)]) };
    }
    const fonts = [b.wordmark?.font, b.text, ...(b.fonts ?? [])].filter(Boolean);
    const colors = hexesIn(b.palette ?? {});
    return colors.length ? { fonts, colors } : { fonts };
  }
  const front = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const block = raw.split(/^## /m).find((x) => /^Brand\b/.test(x));
  const found = frontColors(front);
  if (!found.length && block) for (const m of block.matchAll(/^\s*[-*]?\s*([\w .-]+?)\s*:\s*(.*)$/gm)) for (const h of m[2].match(HEX) ?? []) found.push({ path: ['palette', ...m[1].trim().split(/\s+/)], hex: hex6(h) });
  // A DESIGN.md with no front matter (the Spotify template) lists its colours as `- **Name** (`#hex`): role` bullets under a Color heading.
  if (!found.length) {
    const section = raw.match(/^## [^\n]*colou?r[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/im)?.[1] ?? '';
    for (const m of section.matchAll(/^\s*[-*]\s+\*\*([^*]+)\*\*\s*\(`?(#(?:[0-9a-f]{6}|[0-9a-f]{3}))`?\)\s*:?\s*(.*)$/gim)) found.push({ path: ['palette', ...m[1].trim().split(/\s+/), ...(/^primary\b/i.test(m[3]) ? ['primary'] : [])], hex: hex6(m[2]) });
  }
  const colors = [...new Set(found.map((c) => c.hex))];
  const segmentsOf = (path) => path.flatMap((k) => k.split(/[-_.]/)).filter(Boolean);
  const actions = [...new Set(found.filter(({ path }) => segmentsOf(path).some((s) => ACTION_SEGMENT.test(s)) && !segmentsOf(path).some((s) => NOT_ACTION_SEGMENT.test(s))).map((c) => c.hex))];
  const backgrounds = [...new Set(found.filter(({ path }) => !segmentsOf(path).some((s) => NOT_BACKGROUND_SEGMENT.test(s))).map((c) => c.hex))];
  const stacks = [...front.matchAll(/^\s*fontFamily:\s*(.+)$/gm)].map((m) => firstFamily(m[1].trim().replace(/^"|"$/g, '')));
  if (!front) stacks.push(...[...(raw.match(/^#{2,3} Font Families[^\n]*\n([\s\S]*?)(?=^#{2,3} |(?![\s\S]))/im)?.[1] ?? '').matchAll(/^\s*[-*]\s+\*\*[^*]+\*\*\s*:\s*`([^`]+)`/gm)].map((m) => m[1]));
  const line = block?.match(/^\s*[-*]?\s*fonts:\s*(.+)$/im);
  const fonts = line ? line[1].split(',').map((f) => f.trim().replace(/^["'`]|["'`]$/g, '')).filter(Boolean) : [...new Set(stacks)];
  return colors.length ? { fonts, colors, ...(actions.length ? { actions } : {}), ...(backgrounds.length && backgrounds.length < colors.length ? { backgrounds } : {}) } : { fonts };
};

// Runs in the page: the first family of the computed font-family of every shown text element, with its count and a sample.
export const collectFonts = () => {
  const found = new Map();
  const SEL = 'h1, h2, h3, h4, h5, h6, p, li, a, button, label, figcaption, blockquote, [data-wordmark], .wordmark, .logo';
  for (const el of document.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    const t = (el.innerText || el.getAttribute('aria-label') || '').trim();
    if (!t || r.width <= 0 || r.height <= 0 || cs.display === 'none' || cs.visibility === 'hidden') continue;
    const family = cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    const o = found.get(family) || { family, count: 0, sample: `${el.tagName.toLowerCase()} "${t.replace(/\s+/g, ' ').slice(0, 20)}"` };
    o.count++; found.set(family, o);
  }
  return [...found.values()];
};

// Pure: the brand rows. With a brand sheet, a family outside its fonts fails; with no sheet, or a sheet with no fonts, the fonts are only reported.
// A sheet with colors also holds the primary action and the page background to them: a model left to choose its own palette returns the
// same default on every project (a cream canvas, a terracotta action), whatever the business.
// The action may sit over a translucent layer: it is held to 0.06 OKLab. On a light background what reads is the tint, not the lightness:
// it is held to 0.008 of OKLab chroma and 0.03 of lightness (a cream #fbf4ea is 0.015 of tint from the gray #f7f7f7; #fffdf8 is 0.007 from white).
export const BRAND_COLOR_DE = { action: 0.06, backgroundTint: 0.008, backgroundL: 0.03 };
const oklab = (rgb) => { const k = toOklch(rgb); const r = (k.h * Math.PI) / 180; return [k.L, k.C * Math.cos(r), k.C * Math.sin(r)]; };
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const gapTo = (rgb, h) => { const a = oklab(rgb); const b = oklab(rgbOf(h)); return { h, d: Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), dL: Math.abs(a[0] - b[0]), tint: Math.hypot(a[1] - b[1], a[2] - b[2]) }; };
const inSheet = { action: (g) => g.d <= BRAND_COLOR_DE.action, background: (g) => g.tint <= BRAND_COLOR_DE.backgroundTint && g.dL <= BRAND_COLOR_DE.backgroundL };
const nearestBrand = (rgb, colors, role) => colors.map((h) => gapTo(rgb, h)).sort((a, b) => (inSheet[role](b) - inSheet[role](a)) || a.d - b.d)[0];
export const brandRows = (fonts, brand, palette = null) => {
  if (!fonts?.length) return [];
  const row = (rule, value, range, pass, detail = [], report = false) => ({ rule, value, range, pass, detail, ...(report ? { report: true } : {}) });
  const used = fonts.map((f) => `${f.family} x${f.count} (${f.sample})`);
  const out = [];
  if (!brand?.fonts?.length) out.push(row('brand: fonts', fonts.length, 'report only: no brand sheet with fonts', true, used, true));
  else {
    const allowed = brand.fonts.map((f) => f.toLowerCase());
    const off = fonts.filter((f) => !allowed.includes(f.family.toLowerCase()));
    out.push(row('brand: fonts in the brand sheet', off.length, `0 families outside ${brand.fonts.join(', ')}`, off.length === 0, off.map((f) => `${f.family} x${f.count} (${f.sample})`)));
  }
  if (brand?.colors?.length && palette) {
    const texts = palette.painted?.length ? palette.painted : (palette.texts ?? []);
    const body = [...texts].filter((t) => !t.ctl).sort((a, b) => b.chars - a.chars)[0];
    const roles = [['primary action', palette.action ?? palette.primary?.fill, 'action', `<= ${BRAND_COLOR_DE.action} OKLab from an action color of the sheet`],
      ['page background', body?.bg, 'background', `tint <= ${BRAND_COLOR_DE.backgroundTint} and lightness <= ${BRAND_COLOR_DE.backgroundL} from a background color of the sheet`]].filter(([, c]) => c);
    for (const [name, c, role, range] of roles) {
      const own = role === 'action' ? brand.actions : brand.backgrounds;
      const n = nearestBrand(c, own?.length ? own : brand.colors, role);
      out.push(row(`brand: ${name} color in the brand sheet`, +(role === 'action' ? n.d : n.tint).toFixed(3), range, inSheet[role](n), [`${name} ${hex(c)}, nearest ${n.h} (ΔL ${n.dL.toFixed(3)}, tint ${n.tint.toFixed(3)})`]));
    }
  }
  return out;
};

// A product screen (`ref-kind: product` in `## Look`: a dashboard, a list, a tool) is read by another class than a landing: the ranges of
// `COMPOSITION` (a focal element, few elements) break on a dense board and pass a tidy pile of cards. The numbers come from 9 public product
// pages measured at 1440 (reference/modern-interface.md rules 2, 7 and 9; rules of the study in the critic's rubric). `hues` counts 30° buckets of
// saturated color: one accent and the three states (ok, warning, error). A glass or gradient surface is allowed only when `## Look` declares it.
export const PRODUCT = { span: 0.85, spanFrom: 1200, cardNest: 2, rowCards: 0, hues: 4, blur: 0, gradients: 0, tabular: 0.9, numeralsMin: 6, rightAlign: 0.9, cellsMin: 4, divRows: 0, firstView: 8, firstViewNarrow: 4, spaceGrid: 0.8, spaceTop: 0.85, spaceFrom: 8 };
// The rows about how the information is laid out (the gate's `ia:` line fails on them); the others are the designer's.
export const INFORMATION_ROWS = ['product: numbers right-aligned', 'product: table built of divs', 'product: data in the first viewport', 'product: spacing scale'];
export const CHROME_KINDS = ['glass', 'gradient'];
export const PRODUCT_KINDS = ['product'];
// `--kind product`, or the card: `ref-kind: product` (and `brand-chrome: glass, gradient` when the brand itself is glass or a gradient).
export const loadProduct = (arg) => {
  if (!arg) return null;
  if (PRODUCT_KINDS.includes(arg)) return { chrome: [] };
  const look = readFileSync(arg, 'utf8').split(/^## /m).find((x) => /^Look\b/.test(x));
  if (!PRODUCT_KINDS.includes(look?.match(/^\s*[-*]?\s*ref-kind:\s*([\w-]+)/im)?.[1].toLowerCase())) return null;
  const chrome = look.match(/^\s*[-*]?\s*brand-chrome:\s*(.+)$/im)?.[1].toLowerCase().split(/[\s,;]+/).filter((k) => CHROME_KINDS.includes(k)) ?? [];
  return { chrome };
};

// Runs in the page, at the top of the document: what makes a product screen read as a tool. A container is a box with a fill that differs from
// what is behind it, or a border on three or four sides (a hairline on one side is a divider, not a box).
export const measureProduct = () => {
  const vw = innerWidth; const vh = innerHeight;
  const rgba = (c) => { const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1]; };
  const shown = (el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && b.bottom > 0 && b.top < vh && b.right > 0 && b.left < vw; };
  const all = [...document.body.querySelectorAll('*')].filter(shown);
  const behind = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const c = rgba(getComputedStyle(p).backgroundColor); if (c[3] > 0.04) return c; } return [255, 255, 255, 1]; };
  const full = (el) => {
    const s = getComputedStyle(el); const b = el.getBoundingClientRect();
    if (b.width < 100 || b.height < 40 || b.width >= 0.98 * vw) return false;
    const sides = ['Top', 'Right', 'Bottom', 'Left'].filter((k) => parseFloat(s[`border${k}Width`]) > 0 && s[`border${k}Style`] !== 'none' && rgba(s[`border${k}Color`])[3] > 0.04).length;
    const fill = rgba(s.backgroundColor); const under = behind(el);
    const filled = fill[3] > 0.04 && fill.slice(0, 3).some((v, i) => Math.abs(v - under[i]) > 6);
    const shadow = s.boxShadow !== 'none' && !/inset/.test(s.boxShadow) && parseFloat((s.boxShadow.match(/(-?[\d.]+)px/g) ?? [])[2] ?? '0') > 0;
    return sides >= 3 || filled || (shadow && sides >= 1);
  };
  const boxes = all.filter(full);
  const set = new Set(boxes);
  const depth = (el) => { let d = 0; for (let p = el; p && p !== document.body; p = p.parentElement) if (set.has(p)) d++; return d; };
  let nest = 0; let deepest = null;
  for (const el of boxes) { const d = depth(el); if (d > nest) { nest = d; deepest = el; } }
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : ''}`;
  // Rows as boxes: three or more siblings of a list height, each a box, inside a box or each with a radius of 8 px or more.
  let rowBoxes = 0; let rowSample = null;
  for (const p of all) {
    const kids = [...p.children].filter((k) => shown(k) && set.has(k) && k.getBoundingClientRect().height >= 24 && k.getBoundingClientRect().height <= 140);
    if (kids.length < 3) continue;
    const inBox = [...(function* () { for (let a = p; a && a !== document.body; a = a.parentElement) yield a; })()].some((a) => set.has(a));
    const round = kids.every((k) => parseFloat(getComputedStyle(k).borderTopLeftRadius) >= 8);
    if (inBox || round) { rowBoxes += kids.length; rowSample ||= `${label(p)} > ${label(kids[0])} x${kids.length}`; }
  }
  const hueSet = new Set();
  for (const e of all) {
    const s = getComputedStyle(e);
    for (const c of [s.backgroundColor, e.children.length === 0 ? s.color : 'rgba(0,0,0,0)', s.borderTopColor]) {
      const [r, g, b, a] = rgba(c); if (a < 0.3) continue;
      const mx = Math.max(r, g, b) / 255; const mn = Math.min(r, g, b) / 255; const sat = mx - mn; if (sat < 0.25 || mx < 0.25) continue;
      const [R, G, B] = [r, g, b].map((v) => v / 255);
      let h = mx === R ? ((G - B) / sat) % 6 : mx === G ? (B - R) / sat + 2 : (R - G) / sat + 4;
      hueSet.add(Math.floor(((h * 60 + 360) % 360) / 30) % 12);
    }
  }
  const numeric = all.filter((e) => e.children.length === 0 && /\d/.test(e.textContent) && /^[\s\d.,:%+\-–−$€£kKmMgGbBsx/]+[A-Za-z%]{0,3}$/.test(e.textContent.trim()));
  // A number in a table cell is read down its column: aligned to the end of the cell, so units and decimals line up.
  const cellOf = (e) => e.closest('td,[role=cell],[role=gridcell]');
  const textRight = (e) => { const rg = document.createRange(); rg.selectNodeContents(e); return rg.getBoundingClientRect().right; };
  const inCells = numeric.filter((e) => cellOf(e) && /^[\s\d$€£+\-–−(]/.test(e.textContent));
  const leftNumbers = inCells.filter((e) => {
    const c = cellOf(e); const s = getComputedStyle(c);
    return c.getBoundingClientRect().right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth) - textRight(e) > 2;
  });
  // What is laid out on the whole page, above the fold or below: the table of divs and the spacing are judged there.
  const rendered = [...document.body.querySelectorAll('*')].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  const drawn = new Set(rendered);
  // A table drawn with divs: five or more stacked siblings of one kind, each with three or more children whose columns line up,
  // outside a table or a grid role. A screen reader reads it as loose text, with no column header for a value.
  let divRows = 0; let divSample = null;
  for (const p of rendered) {
    if (p.closest('table,[role=table],[role=grid],[role=treegrid],form')) continue;
    const groups = new Map();
    for (const k of [...p.children].filter((c) => drawn.has(c))) { const key = `${k.tagName}.${[...k.classList].sort().join('.')}`; groups.set(key, [...(groups.get(key) ?? []), k]); }
    for (const rows of groups.values()) {
      if (rows.length < 5 || rows.some((r) => r.getAttribute('role') === 'row')) continue;
      const cols = rows.map((r) => [...r.children].filter((c) => drawn.has(c)).map((c) => Math.round(c.getBoundingClientRect().left)));
      if (cols.some((c) => c.length < 3)) continue;
      const tops = new Set(rows.map((r) => Math.round(r.getBoundingClientRect().top)));
      if (tops.size !== rows.length || new Set(rows.map((r) => Math.round(r.getBoundingClientRect().left))).size !== 1) continue;
      const n = Math.min(...cols.map((c) => c.length));
      let aligned = 0; for (let i = 0; i < n; i++) if (cols.every((c) => Math.abs(c[i] - cols[0][i]) <= 2)) aligned++;
      // Columns are side by side: a child wrapped under another (a list item's second line) shares its x and is not one.
      if (aligned >= 3 && new Set(cols[0].slice(0, n)).size >= 3) { divRows += rows.length; divSample ||= `${label(p)} > ${label(rows[0])} x${rows.length}`; }
    }
  }
  // The numbers of the whole page, not only the first viewport: a data screen whose values all wait below the fold.
  const NUMERIC = /^[\s\d.,:%+\-–−$€£kKmMgGbBsx/]+[A-Za-z%]{0,3}$/;
  const numeralsDoc = rendered.filter((e) => e.children.length === 0 && /\d/.test(e.textContent) && NUMERIC.test(e.textContent.trim())).length;
  // The layout spacing (margins, paddings, gaps of 8 px or more) of the page: on a 4 px grid, and most of it from a
  // handful of steps, the rhythm a dense screen is read by. What is under 8 px is the inside of a control, not layout.
  const spaces = [];
  for (const e of rendered) {
    const s = getComputedStyle(e);
    for (const k of ['marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'rowGap', 'columnGap']) {
      const v = parseFloat(s[k]); if (v >= 8 && v < 200) spaces.push(Math.round(v * 2) / 2);
    }
  }
  const offGrid = [...new Set(spaces.filter((v) => v % 4 !== 0))].sort((a, b) => a - b);
  const steps = new Map(); for (const v of spaces) steps.set(v, (steps.get(v) ?? 0) + 1);
  const topSix = [...steps.values()].sort((a, b) => b - a).slice(0, 6).reduce((t, c) => t + c, 0);
  const tabular = numeric.filter((e) => { const s = getComputedStyle(e); return /tabular/.test(s.fontVariantNumeric) || /mono|consolas|menlo|courier/i.test(s.fontFamily); }).length;
  const side = all.filter((e) => { const b = e.getBoundingClientRect(); return (e.tagName === 'ASIDE' || e.tagName === 'NAV' || /sidebar/i.test(String(e.className))) && b.left <= 4 && b.width >= 48 && b.width <= 340 && b.height >= 0.6 * vh; });
  const sideW = Math.max(0, ...side.map((e) => e.getBoundingClientRect().right));
  let minX = vw; let maxX = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) || !shown(el) || side.some((s) => s.contains(el))) continue;
    const rg = document.createRange(); rg.selectNodeContents(n); const r = rg.getBoundingClientRect();
    if (!r.width || r.top > vh || r.bottom < 0) continue;
    minX = Math.min(minX, r.left); maxX = Math.max(maxX, r.right);
  }
  const avail = vw - sideW;
  return {
    span: maxX > minX ? +((maxX - minX) / avail).toFixed(3) : 0, sidebar: Math.round(sideW),
    cardNest: nest, cardCount: boxes.length, nestAt: deepest ? label(deepest) : null, rowBoxes, rowSample,
    hues: hueSet.size, blur: all.filter((e) => { const v = getComputedStyle(e).backdropFilter; return v && v !== 'none'; }).length,
    gradients: all.filter((e) => /gradient/.test(getComputedStyle(e).backgroundImage)).length,
    numerals: numeric.length, tabular,
    cellNumerals: inCells.length, leftNumbers: leftNumbers.length, leftSample: leftNumbers[0] ? `${label(cellOf(leftNumbers[0]))} “${leftNumbers[0].textContent.trim()}”` : null,
    divRows, divSample, numeralsDoc,
    spaces: spaces.length, onGrid: spaces.filter((v) => v % 4 === 0).length, spaceValues: steps.size, topSix, offGrid: offGrid.slice(0, 8),
  };
};

// Pure: the PRODUCT rows from what `measureProduct` read. `look` is `loadProduct`'s result: the chrome kinds the brand declares are allowed.
export const productRows = (m, width, look = { chrome: [] }) => {
  if (!m) return [];
  const row = (rule, value, range, pass, detail = []) => ({ rule, value, range, pass, detail });
  const out = [];
  if (width >= PRODUCT.spanFrom) {
    const pct = Math.round(m.span * 100);
    out.push(row('product: content span', `${pct}%`, `span ${Math.round(PRODUCT.span * 100)}% or more of the width${m.sidebar ? ` beside the ${m.sidebar} px sidebar` : ''}`, m.span >= PRODUCT.span, [`span ${pct}% under ${Math.round(PRODUCT.span * 100)}%`]));
  }
  out.push(
    row('product: card in card', m.cardNest, `depth ${PRODUCT.cardNest} or less (${m.cardCount} boxes with a fill or three sides of border)`, m.cardNest <= PRODUCT.cardNest, [`card-in-card depth ${m.cardNest} (max ${PRODUCT.cardNest}) at ${m.nestAt}`]),
    row('product: row as card', m.rowBoxes, `${PRODUCT.rowCards}: a list row is a line with a hairline, not a box`, m.rowBoxes <= PRODUCT.rowCards, [`row-as-card: ${m.rowBoxes} rows with fill or border (${m.rowSample})`]),
    row('product: hues', m.hues, `${PRODUCT.hues} or less: one accent and the states`, m.hues <= PRODUCT.hues, [`${m.hues} hues (max ${PRODUCT.hues})`]),
  );
  const allowed = (kind, n) => (look.chrome.includes(kind) ? `${n} (declared by the brand)` : n);
  out.push(
    row('product: backdrop-filter', allowed('glass', m.blur), `${PRODUCT.blur} unless \`brand-chrome: glass\``, m.blur <= PRODUCT.blur || look.chrome.includes('glass'), [`blur ${m.blur} (max ${PRODUCT.blur})`]),
    row('product: background gradients', allowed('gradient', m.gradients), `${PRODUCT.gradients} unless \`brand-chrome: gradient\``, m.gradients <= PRODUCT.gradients || look.chrome.includes('gradient'), [`gradients ${m.gradients} (max ${PRODUCT.gradients})`]),
  );
  if (m.numerals >= PRODUCT.numeralsMin) {
    const share = m.tabular / m.numerals;
    out.push(row('product: tabular numerals', `${Math.round(share * 100)}%`, `${Math.round(PRODUCT.tabular * 100)}% or more of ${m.numerals} numerals in \`tabular-nums\` or mono`, share >= PRODUCT.tabular, [`${m.tabular} of ${m.numerals} numerals`]));
  }
  out.push(...informationRows(m, width));
  return out;
};

// How the information is laid out: numbers aligned down their column, tabular data in a table, the data of the screen in its
// first viewport, and one spacing scale. Measured by `measureProduct`; a reading without these fields gives no row.
export const informationRows = (m, width) => {
  const row = (rule, value, range, pass, detail = []) => ({ rule, value, range, pass, detail });
  const out = [];
  if (!m) return out;
  if ((m.cellNumerals ?? 0) >= PRODUCT.cellsMin) {
    const share = 1 - m.leftNumbers / m.cellNumerals;
    out.push(row('product: numbers right-aligned', `${Math.round(share * 100)}%`, `${Math.round(PRODUCT.rightAlign * 100)}% or more of ${m.cellNumerals} numbers in table cells aligned to the end`, share >= PRODUCT.rightAlign, [`${m.leftNumbers} of ${m.cellNumerals} numbers not at the end of their cell (${m.leftSample})`]));
  }
  if (m.divRows !== undefined) out.push(row('product: table built of divs', m.divRows, `${PRODUCT.divRows}: rows of three or more aligned columns are a <table> (or role=grid) with its column headers`, m.divRows <= PRODUCT.divRows, [`${m.divRows} rows of aligned columns outside a table (${m.divSample})`]));
  if ((m.numeralsDoc ?? 0) >= PRODUCT.firstViewNarrow) {
    const min = Math.min(width >= PRODUCT.spanFrom ? PRODUCT.firstView : PRODUCT.firstViewNarrow, m.numeralsDoc);
    out.push(row('product: data in the first viewport', m.numerals, `${min} or more of the ${m.numeralsDoc} numbers of the page before scrolling`, m.numerals >= min, [`${m.numerals} numbers in the first viewport (min ${min}): a header, a hero or empty space comes before the data`]));
  }
  if ((m.spaces ?? 0) >= 10) {
    const share = m.onGrid / m.spaces; const top = m.topSix / m.spaces;
    out.push(row('product: spacing scale', `${Math.round(share * 100)}% on 4 px, six steps cover ${Math.round(top * 100)}%`, `of the margins, paddings and gaps of ${PRODUCT.spaceFrom} px or more, ${Math.round(PRODUCT.spaceGrid * 100)}% on a 4 px grid and ${Math.round(PRODUCT.spaceTop * 100)}% from its six most used values`, share >= PRODUCT.spaceGrid && top >= PRODUCT.spaceTop, [`off the 4 px grid: ${m.offGrid.join(', ')} px · ${m.spaceValues} distinct values, the six most used cover ${Math.round(top * 100)}%`]));
  }
  return out;
};

// The rows of the round for the sweep, the frames, the images, the palette and the brand fonts (same shape as the other rules).
// `product` (from `measureProduct`) with `look` (from `loadProduct`) swaps the landing rows of composition for the PRODUCT ones.
export const designRows = ({ sweep, frames, width, images, palette, fonts, brand, canvas, layout, product, look }) => {
  const row = (rule, value, range, pass, detail = []) => ({ rule, value, range, pass, detail });
  const out = [];
  if (sweep) out.push(row('dead clicks', sweep.dead.length, '0', sweep.dead.length === 0, sweep.dead.map((d) => `${d.selector} · ${d.reason} · ${d.width} px · ${d.capture}`)));
  if (frames?.length && !look) {
    const bad = frames.filter((f) => f.flags.length >= 2);
    out.push(row('frames with 2+ flags', bad.length, '0', bad.length === 0, bad.map((f) => `frame ${f.frame}: ${f.flags.join('; ')}`)));
    const voids = frames.filter((f) => isVoidFrame(f, width));
    out.push(row('void frames (>70% empty, no focal)', voids.length, '0', voids.length === 0, voids.map((f) => `frame ${f.frame}: ${Math.round(f.empty * 100)}% empty, focal ${Math.round(f.focalShare * 100)}%`)));
  }
  if (images) {
    out.push(
      row(`image file width >= shown x ${DPR}`, images.low.length, '0', images.low.length === 0, images.low),
      row('pasted boxes', images.pasted.length, '0', images.pasted.length === 0, images.pasted),
      row('repeated images', images.repeated.length, '0', images.repeated.length === 0, images.repeated),
      row('broken images (naturalWidth 0)', (images.broken ?? []).length, '0', !(images.broken ?? []).length, images.broken ?? []),
      row('alt text painted as page text', (images.altShown ?? []).length, '0', !(images.altShown ?? []).length, images.altShown ?? []),
      images.lcp
        ? row('LCP image', `${images.lcp.lazy ? 'lazy' : 'eager'}, ${images.lcp.visibleT0 ? 'visible' : 'hidden'} at t0`, 'not lazy, visible at t0', !images.lcp.lazy && images.lcp.visibleT0, [images.lcp.img])
        : row('LCP image', 'not an image', 'n/a', true),
    );
  }
  out.push(...(look ? productRows(product, width, look) : layoutHeroRows(layout, width)), ...canvasRows(canvas), ...paletteRows(palette), ...brandRows(fonts, brand, palette));
  return out;
};
