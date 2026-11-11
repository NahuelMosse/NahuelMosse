// Card swipe, ported from Watermelon UI (animated-components/card-swipe, MIT, Copyright (c) 2025-present Watermelon Contributors).
// A row of cards you drag sideways: the row follows the finger, every card turns on Y up to 90 degrees as it leaves the
// center (perspective 1000 px), and on release the row settles on a card with a spring (stiffness 330, damping 30). A drag
// past 50 px, or a flick faster than 500 px/s, moves one card; the row is held between the first and the last.
// Port notes. Pointer events cover mouse, touch and pen (`touch-action: pan-y` leaves vertical scroll to the page). The
// original is mouse and touch only: here the region takes ArrowLeft/ArrowRight/Home/End, the dots are real buttons, and the
// cards off center are `inert`. Reduced motion moves the row without the spring and without the turn.
//
//   <div data-motion="card-swipe"><article>…</article><article>…</article></div>   (the children are the cards)
//   mount(el, { index, onChange })  →  { index, go(i), next(), prev(), destroy }
import { follower, reduced, scope, springOf } from '../core.js';
import { define, node, numberOf } from './mu-shared.js';

const DRAG_BUFFER = 50;
const FLICK = 500;

export const mount = define('card-swipe', (el, opts) => {
  const life = scope();
  const cards = [...el.children];
  if (!cards.length) throw new Error('motion/card-swipe: needs at least one child card');
  const original = [...el.childNodes];
  const startAt = numberOf(opts, el, 'index', 0);
  let index = Math.max(0, Math.min(cards.length - 1, startAt));
  let x = 0;
  let step = 0;
  let drag = null;

  const viewport = node('div', 'mu-card-swipe__viewport');
  const track = node('div', 'mu-card-swipe__track');
  track.append(...cards);
  viewport.append(track);
  const dots = node('div', 'mu-card-swipe__dots');
  dots.setAttribute('role', 'group');
  dots.setAttribute('aria-label', 'Elegir tarjeta');
  const buttons = cards.map((_, i) => {
    const b = node('button', 'mu-card-swipe__dot');
    b.type = 'button';
    b.setAttribute('aria-label', `Tarjeta ${i + 1} de ${cards.length}`);
    b.addEventListener('click', () => go(i), { signal: life.signal });
    return b;
  });
  dots.append(...buttons);
  el.classList.add('mu-card-swipe');
  el.setAttribute('role', 'region');
  el.setAttribute('aria-roledescription', 'carrusel');
  if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) el.setAttribute('aria-label', 'Tarjetas');
  if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
  cards.forEach((c, i) => { c.classList.add('mu-card-swipe__card'); c.setAttribute('role', 'group'); c.setAttribute('aria-roledescription', 'tarjeta'); c.setAttribute('aria-label', `${i + 1} de ${cards.length}`); });
  el.replaceChildren(viewport, dots);

  const measure = () => {
    const first = cards[0].getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    step = (cards[0].offsetWidth || first.width) + gap;
  };
  const paint = (pos) => {
    x = pos[0];
    track.style.transform = `translate3d(${x}px, 0, 0)`;
    if (reduced()) return;
    cards.forEach((c, i) => {
      const d = step ? (x + i * step) / step : 0;
      c.style.transform = `rotateY(${Math.max(-90, Math.min(90, d * 90))}deg)`;
    });
  };
  const mover = follower(springOf('--card-swipe-spring', '330 30 1'), paint, 0.1, [track]);
  const settle = (jump) => {
    buttons.forEach((b, i) => b.setAttribute('aria-current', String(i === index)));
    cards.forEach((c, i) => { c.inert = i !== index; });
    mover.to([-index * step], jump || reduced());
  };
  function go(i) {
    const next = Math.max(0, Math.min(cards.length - 1, i));
    const changed = next !== index;
    index = next;
    settle(false);
    if (changed) { opts.onChange?.(index); el.dispatchEvent(new CustomEvent('change', { detail: { index } })); }
  }

  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('input, textarea, select')) return;
    drag = { id: e.pointerId, x0: e.clientX, from: x, last: e.clientX, t: performance.now(), v: 0, moved: false };
  };
  const move = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    if (!drag.moved && Math.abs(dx) < 4) return;
    if (!drag.moved) { drag.moved = true; viewport.setPointerCapture(e.pointerId); el.dataset.dragging = 'true'; }
    const now = performance.now();
    drag.v = ((e.clientX - drag.last) / Math.max(1, now - drag.t)) * 1000;
    drag.last = e.clientX;
    drag.t = now;
    const min = -(cards.length - 1) * step;
    mover.to([Math.max(min - 40, Math.min(40, drag.from + dx))], true);
  };
  const up = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { moved, v } = drag;
    const offset = e.clientX - drag.x0;
    drag = null;
    delete el.dataset.dragging;
    if (!moved) return;
    if (offset < -DRAG_BUFFER || v < -FLICK) go(index + 1);
    else if (offset > DRAG_BUFFER || v > FLICK) go(index - 1);
    else settle(false);
  };
  const clickGuard = (e) => { if (el.dataset.dragging) e.stopPropagation(); };
  viewport.addEventListener('pointerdown', down, { signal: life.signal });
  viewport.addEventListener('pointermove', move, { signal: life.signal });
  viewport.addEventListener('pointerup', up, { signal: life.signal });
  viewport.addEventListener('pointercancel', up, { signal: life.signal });
  viewport.addEventListener('click', clickGuard, { capture: true, signal: life.signal });
  el.addEventListener('keydown', (e) => {
    if (e.target !== el) return;
    const to = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: cards.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    go(to);
  }, { signal: life.signal });

  measure();
  settle(true);
  life.watch(new ResizeObserver(() => { measure(); mover.to([-index * step], true); })).observe(viewport);

  return {
    get index() { return index; },
    go,
    next: () => go(index + 1),
    prev: () => go(index - 1),
    destroy() {
      mover.stop();
      life.destroy();
      for (const c of cards) {
        c.classList.remove('mu-card-swipe__card');
        for (const a of ['role', 'aria-roledescription', 'aria-label']) c.removeAttribute(a);
        c.style.transform = '';
        c.inert = false;
      }
      el.replaceChildren(...original);
      el.classList.remove('mu-card-swipe');
      el.removeAttribute('role');
      el.removeAttribute('aria-roledescription');
    },
  };
});
