// Feature tour, ported from Watermelon UI (animated-components/feature-tour, MIT, Copyright (c) 2025-present Watermelon Contributors).
// A modal card that walks through a list of steps: an icon on a soft tile, a title and a description, and a row of dots.
// Changing step swaps the icon (opacity, scale .92, blur 3 px, 160 ms) and slides the text (20 px up in, 14 px up out), the card
// enters with opacity, scale .96, y 16 px and blur 4 px in 180 ms. ArrowLeft/ArrowRight move, Escape closes.
// Port notes. The original shares the icon between steps with `layoutId`; here the old step leaves and the new one enters
// with the same values, in sequence. Steps are `{ id, title, description, icon }` with `icon` an SVG string or node. The
// dialog is `role="dialog" aria-modal` with a label, the dots are real tabs (`role="tablist"`), focus is trapped and
// returns to what opened it, and the keys act on the dialog and not on the whole window. Reduced motion drops the
// movement and the blur and keeps a short fade.
//
//   mount(el, { steps, loop, closeOnBackdrop, onClose, onLearnMore })  →  { open(), close(), go(i), next(), prev(), index, destroy }
//   `el` is the host (a button that opens it can be `[data-tour-trigger]` inside).
import { reduced, scope } from '../core.js';
import { define, node } from './mu-shared.js';

const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const ease = 'cubic-bezier(0.16, 1, 0.3, 1)';

export const mount = define('feature-tour', (el, opts) => {
  const steps = opts.steps ?? [];
  if (!steps.length) throw new Error('motion/feature-tour: needs a `steps` option');
  const life = scope();
  const loop = opts.loop ?? el.dataset.loop === 'true';
  const closeOnBackdrop = opts.closeOnBackdrop ?? true;
  const trigger = el.querySelector('[data-tour-trigger]');
  let index = 0;
  let isOpen = false;
  let opener = null;
  let swap = 0;

  const layer = node('div', 'mu-feature-tour');
  layer.hidden = true;
  const card = node('div', 'mu-feature-tour__card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', opts.label ?? 'Recorrido de novedades');
  const x = node('button', 'mu-feature-tour__x', { html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' });
  x.type = 'button';
  x.setAttribute('aria-label', 'Cerrar recorrido');
  const stage = node('div', 'mu-feature-tour__stage');
  stage.setAttribute('aria-live', 'polite');
  const iconBox = node('div', 'mu-feature-tour__icon', { decorative: true });
  const text = node('div', 'mu-feature-tour__text');
  const title = node('h2', 'mu-feature-tour__title');
  const desc = node('p', 'mu-feature-tour__desc');
  const more = node('button', 'mu-feature-tour__more');
  more.type = 'button';
  more.textContent = opts.learnMoreLabel ?? 'Ver más';
  more.hidden = !opts.onLearnMore;
  text.append(title, desc, more);
  stage.append(iconBox, text);
  const dots = node('div', 'mu-feature-tour__dots');
  dots.setAttribute('role', 'tablist');
  dots.setAttribute('aria-label', 'Pasos');
  const tabs = steps.map((s, i) => {
    const b = node('button', 'mu-feature-tour__dot');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', `Ir a ${s.title}`);
    b.addEventListener('click', () => go(i), { signal: life.signal });
    return b;
  });
  dots.append(...tabs);
  card.append(x, stage, dots);
  layer.append(card);
  document.body.append(layer);

  const fill = () => {
    const s = steps[index];
    if (typeof s.icon === 'string') iconBox.innerHTML = s.icon; else iconBox.replaceChildren(s.icon?.cloneNode(true) ?? '');
    title.textContent = s.title;
    desc.textContent = s.description;
    tabs.forEach((t, i) => { t.setAttribute('aria-selected', String(i === index)); t.tabIndex = i === index ? 0 : -1; });
  };
  function go(to) {
    let next = to;
    if (next < 0) next = loop ? steps.length - 1 : 0;
    if (next >= steps.length) next = loop ? 0 : steps.length - 1;
    if (next === index) return;
    const dir = next > index ? 1 : -1;
    index = next;
    const run = ++swap;
    if (reduced()) { fill(); return; }
    iconBox.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'scale(.92) translateY(-6px)', filter: 'blur(3px)' }], { duration: 160, easing: ease, fill: 'forwards' });
    text.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateY(${-14 * dir}px)` }], { duration: 160, easing: ease, fill: 'forwards' }).finished.then(() => {
      if (run !== swap) return;
      fill();
      for (const a of [...iconBox.getAnimations(), ...text.getAnimations()]) a.cancel();
      iconBox.animate([{ opacity: 0, transform: 'scale(.92) translateY(8px)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 160, easing: ease });
      text.animate([{ opacity: 0, transform: `translateY(${20 * dir}px)` }, { opacity: 1, transform: 'none' }], { duration: 160, easing: ease });
    }).catch(() => {});
  }
  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    layer.hidden = true;
    opener?.focus?.();
    opts.onClose?.();
  };
  const open = (at = 0) => {
    if (isOpen) return;
    opener = document.activeElement;
    isOpen = true;
    index = Math.max(0, Math.min(steps.length - 1, at));
    swap++;
    fill();
    layer.hidden = false;
    if (!reduced()) card.animate([{ opacity: 0, transform: 'translateY(16px) scale(.96)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 180, easing: ease });
    else card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100 });
    (tabs[index] ?? x).focus();
  };

  x.addEventListener('click', close, { signal: life.signal });
  more.addEventListener('click', () => opts.onLearnMore?.(steps[index]), { signal: life.signal });
  layer.addEventListener('click', (e) => { if (closeOnBackdrop && e.target === layer) close(); }, { signal: life.signal });
  layer.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); tabs[index].focus(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); tabs[index].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') {
      const list = [...card.querySelectorAll(FOCUSABLE)].filter((b) => !b.hidden);
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, { signal: life.signal });
  trigger?.addEventListener('click', () => open(0), { signal: life.signal });
  fill();

  return {
    open,
    close,
    go,
    next: () => go(index + 1),
    prev: () => go(index - 1),
    get index() { return index; },
    get isOpen() { return isOpen; },
    destroy() { life.destroy(); layer.remove(); },
  };
});
