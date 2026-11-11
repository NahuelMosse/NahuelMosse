// Flip card, ported from Animate UI (registry/components/community/flip-card): two faces under a 1000 px
// perspective, `rotateY` 0 → 180° on the front and 180° → 0 on the back in 500 ms, easeOut, both with
// `backface-visibility: hidden`. A mouse over the card turns it and leaving turns it back; a touch (or
// a pen) turns it on tap (`trigger: "click"` makes the mouse click turn it instead of hover). What the original lacks and a back office needs: a button on each face that
// turns it from the keyboard (`data-flip-toggle`, one is added if the markup has none), the face that
// is not showing is `inert`, and the focus follows to the toggle of the face that appears. Reduced
// motion: no turn, the faces cross-fade in 140 ms.
//
//   <div data-motion="flip-card" aria-label="Factura A 0001-00004821">
//     <div data-face="front">… <button data-flip-toggle>Ver dorso</button></div>
//     <div data-face="back">… <button data-flip-toggle>Ver frente</button></div>
//   </div>
//
// mount(el, { labels, onFlip }) → { flip(on), flipped, destroy }; `flip` fires on `el` with { flipped }.
import { make } from './au-util.js';

const instances = new WeakMap();
const LABELS = { toBack: 'Ver dorso', toFront: 'Ver frente' };
const INTERACTIVE = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

export const mount = (el, opts = {}) => {
  if (instances.has(el)) return instances.get(el);
  const front = el.querySelector(':scope > [data-face="front"]');
  const back = el.querySelector(':scope > [data-face="back"]');
  if (!front || !back) throw new Error('motion/flip-card: needs a [data-face="front"] and a [data-face="back"] child');
  const labels = { ...LABELS, ...opts.labels };
  const trigger = opts.trigger ?? el.dataset.trigger ?? 'hover';
  if (trigger !== 'hover' && trigger !== 'click') throw new Error(`motion/flip-card: trigger is "hover" or "click", not "${trigger}"`);
  el.classList.add('fc');
  front.classList.add('fc__face');
  back.classList.add('fc__face');
  const hadRole = el.hasAttribute('role');
  if (!hadRole) el.setAttribute('role', 'group');

  const made = [];
  for (const [face, text] of [[front, labels.toBack], [back, labels.toFront]]) {
    if (face.querySelector('[data-flip-toggle]')) continue;
    const toggle = make('button', { type: 'button', class: 'btn btn--ghost btn--sm fc__toggle', 'data-flip-toggle': '', text });
    face.append(toggle);
    made.push(toggle);
  }

  let flipped = false;
  let pinned = false;
  let hovering = false;
  let suppressHover = false;
  let pointerType = 'mouse';

  const paint = (focusFace) => {
    el.dataset.flipped = String(flipped);
    front.inert = flipped;
    back.inert = !flipped;
    front.setAttribute('aria-hidden', String(flipped));
    back.setAttribute('aria-hidden', String(!flipped));
    if (focusFace) focusFace.querySelector('[data-flip-toggle]')?.focus({ preventScroll: true });
  };
  const apply = (next) => {
    if (next === flipped) return;
    const hadFocus = el.contains(document.activeElement);
    flipped = next;
    paint(hadFocus ? (next ? back : front) : null);
    opts.onFlip?.(next);
    el.dispatchEvent(new CustomEvent('flip', { detail: { flipped: next } }));
  };
  paint(null);

  const off = [];
  const on = (target, type, fn) => { target.addEventListener(type, fn); off.push(() => target.removeEventListener(type, fn)); };
  on(el, 'pointerdown', (e) => { pointerType = e.pointerType; });
  on(el, 'pointerenter', (e) => {
    if (trigger !== 'hover' || e.pointerType !== 'mouse' || suppressHover) return;
    hovering = true;
    apply(true);
  });
  on(el, 'pointerleave', (e) => {
    suppressHover = false;
    if (trigger !== 'hover' || e.pointerType !== 'mouse') return;
    hovering = false;
    if (!pinned) apply(false);
  });
  on(el, 'click', (e) => {
    const toggle = e.target.closest('[data-flip-toggle]');
    if (toggle && el.contains(toggle)) {
      if (flipped) { pinned = false; suppressHover = hovering; apply(false); } else { pinned = true; apply(true); }
      return;
    }
    if ((trigger === 'hover' && pointerType === 'mouse') || e.target.closest(INTERACTIVE)) return;
    pinned = !flipped;
    apply(!flipped);
  });

  const api = {
    get flipped() { return flipped; },
    flip(value) { pinned = Boolean(value); apply(Boolean(value)); },
    destroy() {
      off.forEach((fn) => fn());
      for (const t of made) t.remove();
      for (const face of [front, back]) { face.inert = false; face.removeAttribute('aria-hidden'); face.classList.remove('fc__face'); }
      el.classList.remove('fc');
      delete el.dataset.flipped;
      if (!hadRole) el.removeAttribute('role');
      instances.delete(el);
    },
  };
  instances.set(el, api);
  return api;
};

if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-motion="flip-card"]')) mount(el);
