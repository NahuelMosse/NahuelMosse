// Dialog stack, ported from Watermelon UI (animated-components/dialog-stack, MIT, Copyright (c) 2025-present Watermelon Contributors).
// One modal that holds a stack of cards: the card in front is live, the ones behind it peek out above, smaller and dimmed
// (y -35 px, scale .94, opacity .5), and a card that is not reached yet waits below (y 50 px, scale .95, opacity 0). Moving
// forward or back is a spring (stiffness 300, damping 28) on those three values.
// Port notes. The cards are caller content (`content`: a node or an HTML string) instead of two hard-coded layouts; buttons
// inside a card with `data-stack="next | back | close"` drive the stack. The original has no focus handling: here the dialog
// is `role="dialog" aria-modal`, focus goes to the front card, Tab stays inside it, Escape goes back one card (or closes at
// the first) and focus returns to the trigger. Cards that are not in front are `inert`. Reduced motion cross-fades.
//
//   <div data-motion="dialog-stack"><button type="button" data-stack-trigger>Nueva factura</button></div>
//   mount(el, { stack: [{ id, title, content }], onClose })  →  { open(), close(), next(), back(), index, isOpen, destroy }
import { reduced } from '../core.js';
import { define, node, springRun } from './mu-shared.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const mount = define('dialog-stack', (el, opts) => {
  const stack = opts.stack ?? [];
  if (!stack.length) throw new Error('motion/dialog-stack: needs a `stack` option with at least one card');
  const trigger = el.querySelector('[data-stack-trigger]') ?? el.querySelector('button');
  const curve = springRun(300, 28);
  let index = 0;
  let isOpen = false;
  let layer = null;
  let cards = [];
  let closing = 0;

  const paint = () => {
    cards.forEach((card, i) => {
      card.dataset.state = i < index ? 'under' : i === index ? 'front' : 'ahead';
      card.style.zIndex = String(i);
      card.inert = i !== index;
    });
  };
  const focusFront = () => (cards[index].querySelector('input, textarea, select') ?? cards[index].querySelector('.mu-dialog-stack__body button') ?? cards[index].querySelector('button'))?.focus();
  const go = (to) => {
    const next = Math.max(0, Math.min(stack.length - 1, to));
    if (next === index) return;
    index = next;
    paint();
    focusFront();
  };
  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    layer.dataset.open = 'false';
    const done = () => { layer.hidden = true; index = 0; paint(); };
    if (reduced()) done(); else closing = setTimeout(done, 250);
    trigger?.focus();
    trigger?.setAttribute('aria-expanded', 'false');
    opts.onClose?.();
  };
  const open = () => {
    if (isOpen) return;
    clearTimeout(closing);
    isOpen = true;
    layer.hidden = false;
    index = 0;
    paint();
    void layer.offsetWidth;
    layer.dataset.open = 'true';
    trigger?.setAttribute('aria-expanded', 'true');
    focusFront();
  };

  layer = node('div', 'mu-dialog-stack');
  layer.hidden = true;
  layer.dataset.open = 'false';
  layer.style.setProperty('--mu-dialog-stack-ease', curve.easing);
  layer.style.setProperty('--mu-dialog-stack-ms', `${curve.duration}ms`);
  const scrim = node('div', 'mu-dialog-stack__scrim', { decorative: true });
  const stage = node('div', 'mu-dialog-stack__stage');
  stage.setAttribute('role', 'dialog');
  stage.setAttribute('aria-modal', 'true');
  const uid = Math.random().toString(36).slice(2, 7);
  cards = stack.map((item, i) => {
    const card = node('section', 'mu-dialog-stack__card');
    const head = node('header', 'mu-dialog-stack__head');
    const title = node('h3', 'mu-dialog-stack__title');
    title.id = `mu-dialog-stack-${uid}-${i}`;
    title.textContent = item.title;
    const x = node('button', 'mu-dialog-stack__x', { html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' });
    x.type = 'button';
    x.dataset.stack = 'back';
    x.setAttribute('aria-label', i === 0 ? 'Cerrar' : 'Volver');
    head.append(title, x);
    const body = node('div', 'mu-dialog-stack__body');
    if (typeof item.content === 'string') body.innerHTML = item.content; else if (item.content) body.append(item.content);
    card.setAttribute('aria-labelledby', title.id);
    card.append(head, body);
    return card;
  });
  stage.append(...cards);
  layer.append(scrim, stage);
  document.body.append(layer);
  paint();

  const onClick = (e) => {
    const t = e.target.closest('[data-stack]');
    if (!t || !cards.some((c) => c.contains(t))) return;
    const action = t.dataset.stack;
    if (action === 'next') go(index + 1);
    else if (action === 'close' || (action === 'back' && index === 0)) close();
    else go(index - 1);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); if (index > 0) go(index - 1); else close(); return; }
    if (e.key !== 'Tab') return;
    const list = [...cards[index].querySelectorAll(FOCUSABLE)];
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const onOpen = () => open();
  layer.addEventListener('click', onClick);
  layer.addEventListener('keydown', onKey);
  scrim.addEventListener('click', close);
  trigger?.setAttribute('aria-haspopup', 'dialog');
  trigger?.setAttribute('aria-expanded', 'false');
  trigger?.addEventListener('click', onOpen);

  return {
    open,
    close,
    next: () => go(index + 1),
    back: () => go(index - 1),
    get index() { return index; },
    get isOpen() { return isOpen; },
    destroy() {
      clearTimeout(closing);
      trigger?.removeEventListener('click', onOpen);
      trigger?.removeAttribute('aria-haspopup');
      trigger?.removeAttribute('aria-expanded');
      layer.remove();
    },
  };
});
