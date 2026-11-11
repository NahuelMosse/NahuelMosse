// Hover preview. Written from scratch for this set (no third-party code): a floating preview that follows the pointer along
// its trigger, for the number of an invoice in a table. It opens after a short intent delay (120 ms) when the pointer
// rests on a trigger, immediately when it comes from another trigger (the card then glides to the new place on a spring and
// its content swaps with a blur instead of closing), and leaves in 150 ms. The card sits beside the trigger (to its right,
// or its left when there is no room, or under/over it when neither side fits) so the column of triggers stays reachable; it
// follows the pointer along the trigger on a spring and tilts a few degrees with the speed it is moved at (6 at most, back
// to level as it settles). It is a `role="tooltip"` the trigger points to with `aria-describedby`: it opens on keyboard
// focus too, Escape closes it, and the pointer can move onto the card without it closing (WCAG 1.4.13). Touch does
// nothing: the row's own link is the way in. Triggers carry `data-preview` (a JSON of the invoice) and are links or
// buttons; `render(trigger)` returns a node to show something else. Reduced motion: a fade, no tilt, no glide.
import { format, locale, reduced, scope, uid } from '../core.js';
import { EASE, SPRINGS, TOKENS, value } from './arc-shared.js';
import { define, node } from './mu-shared.js';

const GAP = 10;
const EDGE = 8;
const ENTER_MS = 200;
const EXIT_MS = 150;
const FOLLOW = 0.6;
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

// The default card: an invoice, built with text nodes only.
const invoiceCard = (trigger) => {
  let data;
  try { data = JSON.parse(trigger.dataset.preview); } catch { return null; }
  if (!data || typeof data !== 'object' || typeof data.number !== 'string') return null;
  const loc = locale(trigger);
  const day = new Intl.DateTimeFormat(loc, { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
  const date = (iso) => (iso ? day.format(Date.parse(`${iso}T00:00:00Z`)) : '—');
  const money = (n) => format.currency(n, data.currency ?? 'ARS', {}, trigger);
  const text = (tag, cls, content) => { const n = node(tag, cls); n.textContent = content; return n; };
  const card = node('div', 'hover-preview__invoice');
  const head = node('div', 'hover-preview__head');
  const status = text('span', 'hover-preview__status', data.status ?? '');
  if (data.tone) status.dataset.tone = data.tone;
  head.append(text('strong', 'hover-preview__number', data.number), status);
  card.append(head, text('p', 'hover-preview__client', data.client ?? ''));
  const dates = node('dl', 'hover-preview__dates');
  for (const [label, iso] of [[data.issuedLabel ?? 'Issued', data.issued], [data.dueLabel ?? 'Due', data.due]]) {
    const cell = node('div');
    cell.append(text('dt', '', label), text('dd', '', date(iso)));
    dates.append(cell);
  }
  card.append(dates);
  if (Array.isArray(data.lines) && data.lines.length) {
    const lines = node('ul', 'hover-preview__lines');
    for (const l of data.lines.slice(0, 4)) { const li = node('li'); li.append(text('span', '', String(l.label)), text('span', 'hover-preview__amount', money(Number(l.amount)))); lines.append(li); }
    card.append(lines);
  }
  const total = node('div', 'hover-preview__total');
  total.append(text('span', '', data.totalLabel ?? 'Total'), text('strong', 'hover-preview__amount', money(Number(data.total))));
  card.append(total);
  return card;
};

export const mount = define('hover-preview', (el, opts) => {
  const selector = opts.selector ?? el.dataset.selector ?? '[data-preview]';
  const delay = opts.delay ?? 120;
  const maxTilt = opts.maxTilt ?? 6;
  const side = opts.side ?? el.dataset.side ?? 'right';
  if (typeof selector !== 'string' || !selector) throw new RangeError('hover-preview: selector is a CSS selector');
  if (opts.render !== undefined && typeof opts.render !== 'function') throw new TypeError('hover-preview: render is a function that takes the trigger');
  if (!(delay >= 0) || !(maxTilt >= 0)) throw new RangeError('hover-preview: delay and maxTilt are zero or more');
  if (!['right', 'left', 'bottom', 'top'].includes(side)) throw new RangeError(`hover-preview: unknown side "${side}"`);
  const render = opts.render ?? invoiceCard;
  const life = scope();

  const id = uid('hpv');
  const card = node('div', 'hover-preview');
  card.id = id;
  card.setAttribute('role', 'tooltip');
  card.dataset.state = 'closed';
  const panel = node('div', 'hover-preview__panel');
  const body = node('div', 'hover-preview__body');
  panel.append(body);
  card.append(panel);
  document.body.append(card);

  let open = false;
  let trigger = null;
  let pointer = null;
  let enterTimer = 0;
  let leaveTimer = 0;
  let content = null;
  let token = 0;
  // The tilt follows how fast the card is moving, so it levels out by itself as the spring settles.
  const tilt = () => (reduced() ? 0 : clamp((x.speed() * 0.006 + y.speed() * 0.008), -maxTilt, maxTilt));
  const paint = () => { card.style.transform = `translate(${x.get()}px, ${y.get()}px) rotate(${tilt().toFixed(2)}deg)`; };
  const x = value(0, paint);
  const y = value(0, paint);
  const height = value(0, (h) => { card.style.height = `${h}px`; });

  // Where the card goes for a trigger: beside it when there is room, following the pointer along the trigger.
  const place = (t, h) => {
    const r = t.getBoundingClientRect();
    const w = card.offsetWidth;
    const cx = clamp(pointer?.x ?? r.left + r.width / 2, r.left, r.right);
    const cy = clamp(pointer?.y ?? r.top + r.height / 2, r.top, r.bottom);
    const fitsRight = r.right + GAP + w <= innerWidth - EDGE;
    const fitsLeft = r.left - GAP - w >= EDGE;
    const fitsBelow = r.bottom + GAP + h <= innerHeight - EDGE;
    const fitsAbove = r.top - GAP - h >= EDGE;
    let where = side;
    if (side === 'right' || side === 'left') {
      const wantsRight = side === 'right';
      if (wantsRight ? !fitsRight : !fitsLeft) where = (wantsRight ? fitsLeft : fitsRight) ? (wantsRight ? 'left' : 'right') : fitsBelow || !fitsAbove ? 'bottom' : 'top';
    } else if (side === 'bottom' ? !fitsBelow && fitsAbove : !fitsAbove && fitsBelow) where = side === 'bottom' ? 'top' : 'bottom';
    if (where === 'right' || where === 'left') {
      const mid = r.top + r.height / 2;
      return { where, left: where === 'right' ? r.right + GAP : r.left - GAP - w, top: clamp(mid - h / 2 + (cy - mid) * FOLLOW, EDGE, innerHeight - h - EDGE) };
    }
    const left = clamp(r.left - 12 + (cx - r.left) * FOLLOW, EDGE, innerWidth - w - EDGE);
    return { where, left, top: where === 'bottom' ? r.bottom + GAP : r.top - GAP - h };
  };
  const follow = () => {
    if (!open || !trigger) return;
    const { left, top } = place(trigger, card.offsetHeight);
    if (reduced()) { x.jump(left); y.jump(top); return; }
    x.to(left, { spring: SPRINGS.gentle, rest: 0.05 });
    y.to(top, { spring: SPRINGS.gentle, rest: 0.05 });
  };

  const setContent = (next, animated) => {
    const old = content;
    content = next;
    const h0 = card.offsetHeight;
    if (old) {
      old.setAttribute('aria-hidden', 'true');
      Object.assign(old.style, { position: 'absolute', left: `${old.offsetLeft}px`, top: `${old.offsetTop}px`, width: `${old.offsetWidth}px` });
      const gone = () => old.remove();
      const out = animated && !reduced()
        ? old.animate([{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: `blur(${TOKENS.blur.subtle}px)` }], { duration: 120, easing: EASE.standard, fill: 'forwards' })
        : old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'forwards' });
      out.onfinish = gone;
      out.oncancel = gone;
    }
    body.append(next);
    const h1 = card.offsetHeight;
    if (!old) return;
    if (animated && !reduced()) {
      next.animate([{ opacity: 0, filter: `blur(${TOKENS.blur.soft}px)` }, { opacity: 1, filter: 'blur(0px)' }], { duration: ENTER_MS, easing: EASE.enter, delay: 40, fill: 'backwards' });
      height.jump(h0);
      height.to(h1, { spring: SPRINGS.smooth, done: () => { card.style.height = ''; } });
    } else next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140 });
  };

  const OFFSET = { right: 'translateX(-6px)', left: 'translateX(6px)', bottom: 'translateY(-6px)', top: 'translateY(6px)' };
  const show = (t, instant = false) => {
    const next = render(t);
    if (!(next instanceof Node)) { hide(); return; }
    clearTimeout(leaveTimer);
    if (trigger && trigger !== t) trigger.removeAttribute('aria-describedby');
    const was = open;
    trigger = t;
    t.setAttribute('aria-describedby', id);
    token += 1;
    for (const a of panel.getAnimations()) a.cancel();
    card.dataset.state = 'open';
    open = true;
    setContent(next, was);
    const { where, left, top } = place(t, card.offsetHeight);
    card.dataset.side = where;
    if (!was || reduced() || instant) {
      x.jump(left); y.jump(top);
      if (reduced()) panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' });
      else if (!was) panel.animate([{ opacity: 0, transform: `${OFFSET[where]} scale(.96)`, filter: `blur(${TOKENS.blur.soft}px)` }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: ENTER_MS, easing: EASE.enter });
    } else {
      x.to(left, { spring: SPRINGS.gentle, rest: 0.05 });
      y.to(top, { spring: SPRINGS.gentle, rest: 0.05 });
    }
  };
  const hide = () => {
    clearTimeout(enterTimer);
    clearTimeout(leaveTimer);
    if (!open) return;
    open = false;
    trigger?.removeAttribute('aria-describedby');
    trigger = null;
    const mine = ++token;
    const done = () => {
      if (mine !== token || open) return;
      card.dataset.state = 'closed';
      for (const n of [...body.children]) n.remove();
      content = null;
      x.stop(); y.stop(); height.stop();
      card.style.height = '';
    };
    const out = reduced()
      ? panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'forwards' })
      : panel.animate([{ opacity: 1, transform: 'none', filter: 'blur(0px)' }, { opacity: 0, transform: 'scale(.97)', filter: `blur(${TOKENS.blur.subtle}px)` }], { duration: EXIT_MS, easing: EASE.standard, fill: 'forwards' });
    out.onfinish = () => { done(); out.cancel(); };
  };
  const hideSoon = (wait = 100) => { clearTimeout(enterTimer); clearTimeout(leaveTimer); leaveTimer = setTimeout(hide, wait); };

  const triggerOf = (from) => { const t = from?.closest?.(selector); return t && el.contains(t) ? t : null; };
  el.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const t = triggerOf(e.target);
    if (!t) return;
    pointer = { x: e.clientX, y: e.clientY };
    clearTimeout(leaveTimer);
    if (open && trigger === t) return;
    clearTimeout(enterTimer);
    enterTimer = setTimeout(() => show(t), open ? 0 : delay);
  }, { signal: life.signal });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !open) return;
    const t = triggerOf(e.target);
    if (!t || t !== trigger) return;
    pointer = { x: e.clientX, y: e.clientY };
    follow();
  }, { signal: life.signal });
  el.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse') return;
    const t = triggerOf(e.target);
    if (!t || t.contains(e.relatedTarget) || card.contains(e.relatedTarget) || triggerOf(e.relatedTarget)) return;
    hideSoon();
  }, { signal: life.signal });
  card.addEventListener('pointerenter', () => { clearTimeout(leaveTimer); clearTimeout(enterTimer); }, { signal: life.signal });
  card.addEventListener('pointerleave', (e) => { if (!triggerOf(e.relatedTarget)) hideSoon(); }, { signal: life.signal });
  el.addEventListener('focusin', (e) => {
    const t = triggerOf(e.target);
    if (!t) return;
    let visible = true;
    try { visible = t.matches(':focus-visible'); } catch { /* an engine without :focus-visible shows it on any focus */ }
    if (!visible) return;
    pointer = null;
    clearTimeout(enterTimer);
    show(t);
  }, { signal: life.signal });
  el.addEventListener('focusout', (e) => { if (triggerOf(e.target)) hide(); }, { signal: life.signal });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) hide(); }, { signal: life.signal });
  addEventListener('scroll', () => { if (open) hide(); }, { capture: true, passive: true, signal: life.signal });

  return {
    get open() { return open; },
    get card() { return card; },
    hide,
    destroy() {
      clearTimeout(enterTimer);
      clearTimeout(leaveTimer);
      x.stop(); y.stop(); height.stop();
      trigger?.removeAttribute('aria-describedby');
      life.destroy();
      card.remove();
    },
  };
});
