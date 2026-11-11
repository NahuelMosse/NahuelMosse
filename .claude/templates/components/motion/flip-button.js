// Flip button, ported from Animate UI (primitives/buttons/flip + components/buttons/flip): the button is
// two button surfaces in one grid cell under a 1000 px perspective, each with its own look (the front is
// the secondary button, the back the primary one). On hover the front turns away (rotateX 0 → 90°,
// opacity 1 → 0, offset 0 → 50 %) while the back turns in (90° → 0, -50 % → 0) on one spring, stiffness
// 280 and damping 20, which overshoots a little; pressing shrinks the button to 95 %. `from` is the edge
// the front leaves toward: top and bottom turn on X, left and right on Y. The keyboard flips it too
// (focus-visible). A pointer that is touch does not: there is no hover to answer. The back is a
// decoration (aria-hidden): the button's name is the front text, or its aria-label. Reduced motion: no
// turn, the faces cross-fade.
//
//   <button data-motion="flip-button" data-from="top" data-front="Ver dorso" data-back="Girar la factura"
//           data-front-variant="default" data-back-variant="primary"></button>
//
// mount(el, { from, front, back, frontVariant, backVariant, size }) → { flip(on), flipped, destroy }.
// With your own `[data-face="front"]` and `[data-face="back"]` children the faces keep the classes you gave.
import { reduced, follower, springOf } from '../core.js';
import { make } from './au-util.js';

const instances = new WeakMap();
const FROM = { top: ['rotateX', 'translateY', '50%'], bottom: ['rotateX', 'translateY', '-50%'], left: ['rotateY', 'translateX', '50%'], right: ['rotateY', 'translateX', '-50%'] };
const VARIANTS = { default: '', primary: 'btn--primary', ghost: 'btn--ghost', destructive: 'btn--destructive' };

const variantOf = (value, what) => {
  if (!(value in VARIANTS)) throw new Error(`motion/flip-button: ${what} is ${Object.keys(VARIANTS).join(', ')}; not "${value}"`);
  return VARIANTS[value];
};

export const mount = (el, opts = {}) => {
  if (instances.has(el)) return instances.get(el);
  const from = opts.from ?? el.dataset.from ?? 'top';
  if (!(from in FROM)) throw new Error(`motion/flip-button: from is ${Object.keys(FROM).join(', ')}; not "${from}"`);
  const [rotate, move, offset] = FROM[from];
  const sign = parseFloat(offset) > 0 ? 1 : -1;
  const frontClass = variantOf(opts.frontVariant ?? el.dataset.frontVariant ?? 'default', 'frontVariant');
  const backClass = variantOf(opts.backVariant ?? el.dataset.backVariant ?? 'primary', 'backVariant');
  const size = opts.size ?? el.dataset.size ?? 'md';
  const original = [...el.childNodes];
  const frontText = opts.front ?? el.dataset.front;
  const backText = opts.back ?? el.dataset.back;
  const existing = [...el.querySelectorAll(':scope > [data-face]')];
  const built = existing.length === 0;
  if (built && (frontText === undefined || backText === undefined)) throw new Error('motion/flip-button: needs [data-face] children, or data-front and data-back');
  const front = existing.find((n) => n.dataset.face === 'front') ?? make('span', { 'data-face': 'front', text: frontText });
  const back = existing.find((n) => n.dataset.face === 'back') ?? make('span', { 'data-face': 'back', text: backText });
  const added = [];
  for (const [face, variant] of [[front, frontClass], [back, backClass]]) {
    const wanted = ['flip-btn__face', ...(built ? ['btn', ...(variant ? [variant] : []), ...(size === 'sm' ? ['btn--sm'] : [])] : [])].filter((c) => !face.classList.contains(c));
    face.classList.add(...wanted);
    added.push([face, wanted]);
  }
  back.setAttribute('aria-hidden', 'true');
  if (built) el.replaceChildren(front, back);
  const hadClass = el.classList.contains('flip-btn');
  el.classList.add('flip-btn');
  const addedType = el.tagName === 'BUTTON' && !el.hasAttribute('type');
  if (addedType) el.setAttribute('type', 'button');

  const follow = follower(springOf('--flip-button-spring', '280 20 1'), ([p]) => {
    const q = Math.min(1, Math.max(0, p));
    if (reduced()) {
      front.style.visibility = back.style.visibility = 'visible';
      front.style.transform = back.style.transform = 'none';
      front.style.opacity = String(1 - q);
      back.style.opacity = String(q);
      return;
    }
    front.style.visibility = q >= 1 ? 'hidden' : 'visible';
    back.style.visibility = q <= 0 ? 'hidden' : 'visible';
    front.style.transform = `${move}(${sign * 50 * p}%) ${rotate}(${90 * p}deg)`;
    front.style.opacity = String(1 - q);
    back.style.transform = `${move}(${-sign * 50 * (1 - p)}%) ${rotate}(${90 * (1 - p)}deg)`;
    back.style.opacity = String(q);
  }, 0.002, [front, back]);
  let hovered = false;
  let focused = false;
  let on = false;
  const sync = () => {
    const next = hovered || focused;
    if (next === on) return;
    on = next;
    el.dataset.flipped = String(on);
    follow.to([on ? 1 : 0], reduced());
  };
  el.dataset.flipped = 'false';
  follow.to([0], true);

  const off = [];
  const listen = (type, fn) => { el.addEventListener(type, fn); off.push(() => el.removeEventListener(type, fn)); };
  listen('pointerenter', (e) => { if (e.pointerType === 'touch') return; hovered = true; sync(); });
  listen('pointerleave', () => { hovered = false; sync(); });
  listen('focus', () => { focused = el.matches(':focus-visible'); sync(); });
  listen('blur', () => { focused = false; sync(); });

  const api = {
    get flipped() { return on; },
    flip(value) { hovered = Boolean(value); focused = false; sync(); },
    destroy() {
      off.forEach((fn) => fn());
      follow.stop();
      if (built) el.replaceChildren(...original);
      else for (const [face, classes] of added) { face.classList.remove(...classes); face.style.removeProperty('transform'); face.style.removeProperty('opacity'); face.style.removeProperty('visibility'); }
      back.removeAttribute('aria-hidden');
      if (!hadClass) el.classList.remove('flip-btn');
      delete el.dataset.flipped;
      if (addedType) el.removeAttribute('type');
      instances.delete(el);
    },
  };
  instances.set(el, api);
  return api;
};

if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-motion="flip-button"]')) mount(el);
