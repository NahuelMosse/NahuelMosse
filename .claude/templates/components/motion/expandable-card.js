// Expandable card, ported from Aceternity UI (expandable-card-demo-standard). A card in a grid opens into a
// sheet centered over the page with a shared layout: the card, its picture, its title and its description
// each travel from where they were to where they land (Motion's layout transition, 450 ms,
// cubic-bezier(0.4, 0, 0.1, 1)), while a 20 % scrim fades in and the call to action and the detail fade in.
// On a phone the sheet fills the screen; from 640 px it is a 500 px card with 24 px corners, and from
// 768 px it is as tall as its content (90 % at most). Escape, a press outside the sheet and the close
// button all return it to the card.
//
// Each box is moved with transforms measured from its two rectangles, composed with the transform of the
// box that contains it, so the picture, the title and the description track their own rectangles and not
// the sheet's stretching. The sheet's corners are kept round while it stretches by counter-scaling the
// radius inside `clip-path`. The children of the element marked `data-card` are the cards: each holds
// `[data-part=media]`, `[data-part=title]` (text read from it), `[data-part=description]`, a
// `<template data-part=detail>` with the sheet's text, and optionally `data-cta-text` and `data-cta-href`.
// The page behind is `inert` and does not scroll while a sheet is open; focus returns to the card.
// Reduced motion fades the sheet in 140 ms in its final place.
import { messages, reduced } from '../core.js';
import { bezier, clamp, define, listeners, node } from './ac-shared.js';

const EASE = bezier(0.4, 0, 0.1, 1);
const DURATION = 450;
const FADE_MS = 140;
const CARD_RADIUS = 12;
let count = 0;

const lerp = (a, b, t) => a + (b - a) * t;
const rectOf = (n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
const textOf = (n) => n.textContent.trim().replace(/\s+/g, ' ');
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const mount = define('expandable-card', (el, opts) => {
  const cards = [...el.querySelectorAll('[data-card]')];
  if (!cards.length) throw new RangeError('expandable-card: needs children with data-card');
  const parts = cards.map((card) => {
    const get = (name) => card.querySelector(`[data-part=${name}]`);
    const [media, title, description] = ['media', 'title', 'description'].map(get);
    if (!media || !title || !description) throw new RangeError('expandable-card: a card needs data-part media, title and description');
    return { card, media, title, description, detail: get('detail'), trigger: card.querySelector('button, a[href]') };
  });
  const closeLabel = opts.closeLabel ?? el.dataset.closeLabel ?? messages.close;
  const on = listeners();
  const open$ = listeners();
  let sheet = null;

  const build = (c) => {
    const id = `ac-xc-${++count}`;
    const layer = node('div', 'ac-xc__layer');
    const scrim = node('div', 'ac-xc__scrim', { decorative: true });
    const panel = node('section', 'ac-xc__panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', `${id}-title`);
    panel.tabIndex = -1;
    const close = node('button', 'ac-xc__close');
    close.type = 'button';
    close.setAttribute('aria-label', closeLabel);
    close.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>';
    const media = node('div', 'ac-xc__pmedia');
    media.append(...[...c.media.childNodes].map((n) => n.cloneNode(true)));
    for (const k of [...c.media.classList]) media.classList.add(k);
    media.style.cssText = c.media.style.cssText;
    const head = node('div', 'ac-xc__head');
    const copy = node('div', 'ac-xc__copy');
    const title = node('h3', 'ac-xc__ptitle', { text: textOf(c.title) });
    title.id = `${id}-title`;
    const description = node('p', 'ac-xc__pdesc', { text: textOf(c.description) });
    copy.append(title, description);
    head.append(copy);
    let cta = null;
    if (c.card.dataset.ctaText) {
      cta = node('a', 'ac-xc__cta', { text: c.card.dataset.ctaText });
      cta.href = c.card.dataset.ctaHref ?? '#';
      head.append(cta);
    }
    const body = node('div', 'ac-xc__body');
    const detail = node('div', 'ac-xc__detail');
    if (c.detail) detail.append(c.detail.content.cloneNode(true));
    body.append(detail);
    panel.append(close, media, head, body);
    layer.append(scrim, panel);
    return { layer, scrim, panel, close, media, title, description, cta, body, c, p: 0, raf: 0, dir: 0, from: null, to: null, fades: [close, ...(cta ? [cta] : []), body] };
  };

  const measureFrom = (s) => ({ panel: rectOf(s.c.card), media: rectOf(s.c.media), title: rectOf(s.c.title), description: rectOf(s.c.description) });
  const measureTo = (s) => ({ panel: rectOf(s.panel), media: rectOf(s.media), title: rectOf(s.title), description: rectOf(s.description) });

  // The affine map of a box that goes from rectangle `a` (final) to `b` (current) about the page origin.
  const axis = (a, b, size, pos) => { const sc = size(b) / size(a); return { s: sc, t: pos(b) - sc * pos(a) }; };
  const world = (a, b) => ({ x: axis(a, b, (r) => r.w, (r) => r.x), y: axis(a, b, (r) => r.h, (r) => r.y) });
  const PAGE = { x: { s: 1, t: 0 }, y: { s: 1, t: 0 } };
  // The CSS transform (about the box's own corner) that, inside a parent already drawn with `parent`,
  // lands the box on `w`.
  const local = (a, w, parent) => {
    const f = (k, pos) => { const s = w[k].s / parent[k].s; return { s, d: (w[k].t - parent[k].t) / parent[k].s - pos * (1 - s) }; };
    return { x: f('x', a.x), y: f('y', a.y) };
  };

  const render = (s, p) => {
    s.p = p;
    s.scrim.style.opacity = String(p);
    const fade = clamp((p - 0.3) / 0.7, 0, 1);
    for (const f of s.fades) f.style.opacity = String(fade);
    if (s.reduced) { s.panel.style.opacity = String(p); return; }
    const at = (name) => { const a = s.to[name]; const b = s.from[name]; return { x: lerp(b.x, a.x, p), y: lerp(b.y, a.y, p), w: lerp(b.w, a.w, p), h: lerp(b.h, a.h, p) }; };
    const wp = world(s.to.panel, at('panel'));
    const radius = lerp(CARD_RADIUS, s.radius, p);
    if (p >= 1) {
      s.panel.style.transform = '';
      s.panel.style.clipPath = `inset(0 round ${s.radius}px)`;
      for (const n of ['media', 'title', 'description']) s[n].style.transform = '';
      return;
    }
    const draw = (n, l) => {
      n.style.transformOrigin = '0 0';
      n.style.transform = `translate(${l.x.d.toFixed(2)}px, ${l.y.d.toFixed(2)}px) scale(${l.x.s.toFixed(4)}, ${l.y.s.toFixed(4)})`;
    };
    draw(s.panel, local(s.to.panel, wp, PAGE));
    s.panel.style.clipPath = `inset(0 round ${(radius / wp.x.s).toFixed(2)}px / ${(radius / wp.y.s).toFixed(2)}px)`;
    for (const n of ['media', 'title', 'description']) {
      draw(s[n], local(s.to[n], world(s.to[n], at(n)), wp));
    }
  };

  const run = (s, target, done) => {
    cancelAnimationFrame(s.raf);
    const start = s.p;
    const span = Math.abs(target - start);
    if (!span) { done?.(); return; }
    const total = (s.reduced ? FADE_MS : DURATION) * Math.max(0.4, span);
    const t0 = performance.now();
    const tick = (now) => {
      const t = clamp((now - t0) / total, 0, 1);
      render(s, s.reduced ? start + (target - start) * t : start + (target - start) * EASE(t));
      if (t < 1) s.raf = requestAnimationFrame(tick);
      else { s.raf = 0; render(s, target); done?.(); }
    };
    s.raf = requestAnimationFrame(tick);
  };

  let locked = null;
  const lock = () => {
    const root = document.documentElement;
    locked = { overflow: root.style.overflow, padding: root.style.paddingRight };
    const gap = window.innerWidth - root.clientWidth;
    root.style.overflow = 'hidden';
    if (gap > 0) root.style.paddingRight = `${gap}px`;
  };
  const unlock = () => {
    if (!locked) return;
    document.documentElement.style.overflow = locked.overflow;
    document.documentElement.style.paddingRight = locked.padding;
    locked = null;
  };

  const finish = (s) => {
    open$.off();
    s.layer.remove();
    s.c.card.style.visibility = '';
    el.removeAttribute('inert');
    unlock();
    sheet = null;
    (s.c.trigger ?? s.c.card).focus?.({ preventScroll: true });
  };

  const close = () => {
    const s = sheet;
    if (!s || s.dir < 0) return;
    s.dir = -1;
    if (!s.reduced) {
      if (s.p >= 1) s.to = measureTo(s);
      s.from = measureFrom(s);
    }
    run(s, 0, () => finish(s));
  };

  const open = (c) => {
    if (sheet) return;
    const s = build(c);
    s.reduced = reduced();
    sheet = s;
    s.dir = 1;
    document.body.append(s.layer);
    s.radius = parseFloat(getComputedStyle(s.panel).getPropertyValue('--ac-xc-radius')) || 0;
    s.to = measureTo(s);
    s.from = measureFrom(s);
    lock();
    el.setAttribute('inert', '');
    c.card.style.visibility = 'hidden';
    render(s, 0);
    run(s, 1);
    s.close.focus({ preventScroll: true });
    open$(s.close, 'click', close);
    open$(window, 'keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const items = [...s.panel.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === s.panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    open$(s.layer, 'pointerdown', (e) => { if (!s.panel.contains(e.target)) close(); });
  };

  for (const c of parts) {
    c.card.classList.add('ac-xc__card');
    if (c.trigger) { c.trigger.setAttribute('aria-haspopup', 'dialog'); on(c.trigger, 'click', () => open(c)); }
    else on(c.card, 'click', () => open(c));
  }
  el.classList.add('ac-xc');

  return {
    close,
    destroy() {
      on.off();
      if (sheet) { cancelAnimationFrame(sheet.raf); finish(sheet); }
      for (const c of parts) { c.card.classList.remove('ac-xc__card'); c.trigger?.removeAttribute('aria-haspopup'); c.card.style.visibility = ''; }
      el.classList.remove('ac-xc');
    },
  };
});
