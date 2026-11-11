// Morphing dialog (Motion Primitives): the trigger turns into the dialog. The box travels from the
// trigger's rect to its own place on a spring, the avatar, title and subtitle fly from where they are
// in the trigger to where they sit in the dialog, and the backdrop blurs the page behind.
//
// Markup: a root `[data-motion="morphing-dialog"]` with a `button[data-md="trigger"]` and a
// `template[data-md="content"]`. Elements marked `data-md="image" | "title" | "subtitle"` in both
// are shared; `data-md="description"` names the dialog's description.
// mount(root, { transition: { stiffness, damping, mass } | { bounce, duration }, closeLabel, onOpenChange })
import { reduced, uid, messages } from '../core.js';
import { createMorph, bounceSpring } from './mp-morph.js';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const X = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const handles = new WeakMap();

export function mount(root, opts = {}) {
  if (handles.has(root)) return handles.get(root);
  const trigger = root.querySelector('[data-md="trigger"]');
  const template = root.querySelector('template[data-md="content"]');
  const id = uid('mdlg-');
  const spring = opts.transition?.bounce !== undefined ? bounceSpring(opts.transition.bounce, opts.transition.duration ?? 0.4) : { stiffness: 200, damping: 24, mass: 1, ...opts.transition };
  let state = 'closed';
  let layer = null;
  let morph = null;
  let held = null;

  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', id);
  root.dataset.state = 'closed';

  const pairsOf = (box) => ['image', 'title', 'subtitle'].flatMap((name) => {
    const from = trigger.querySelector(`[data-md="${name}"]`);
    const to = box.querySelector(`[data-md="${name}"]`);
    return from && to ? [{ from, to, text: name !== 'image' }] : [];
  });

  const lockScroll = () => {
    const body = document.body;
    held = { overflow: body.style.overflow, padding: body.style.paddingRight };
    const bar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (bar > 0) body.style.paddingRight = `${bar}px`;
  };
  const unlockScroll = () => {
    if (!held) return;
    document.body.style.overflow = held.overflow;
    document.body.style.paddingRight = held.padding;
    held = null;
  };

  const build = () => {
    const el = document.createElement('div');
    el.className = 'mdlg-portal';
    el.innerHTML = `<div class="mdlg-backdrop" aria-hidden="true"></div><div class="mdlg-wrap"><div class="mdlg-box" id="${id}" role="dialog" aria-modal="true"><div class="mdlg-inner"><button type="button" class="mdlg-close" aria-label="${opts.closeLabel ?? messages.close}">${X}</button><div class="mdlg-scroll"></div></div></div></div>`;
    const box = el.querySelector('.mdlg-box');
    el.querySelector('.mdlg-scroll').append(template.content.cloneNode(true));
    const title = box.querySelector('[data-md="title"]');
    const description = box.querySelector('[data-md="description"]');
    if (title) { title.id ||= `${id}-title`; box.setAttribute('aria-labelledby', title.id); }
    if (description) { description.id ||= `${id}-description`; box.setAttribute('aria-describedby', description.id); }
    return el;
  };

  const focusables = () => [...layer.querySelectorAll('.mdlg-box *')].filter((n) => n.matches(FOCUSABLE) && !n.disabled);
  const onKey = (event) => {
    if (state !== 'open') return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const inside = layer.contains(document.activeElement);
    if (event.shiftKey && (document.activeElement === first || !inside)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !inside)) { event.preventDefault(); first.focus(); }
  };
  const onOutside = (event) => { if (state === 'open' && !layer.querySelector('.mdlg-box').contains(event.target)) close(); };
  const listen = () => {
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside, { passive: true });
  };
  const unlisten = () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('mousedown', onOutside);
    document.removeEventListener('touchstart', onOutside);
  };

  const fade = (el, from, to) => el.animate([{ opacity: from }, { opacity: to }], { duration: 120, easing: 'ease-out', fill: 'both' }).finished;

  function open() {
    if (state === 'open') return;
    const wasClosing = state === 'closing';
    state = 'open';
    root.dataset.state = 'open';
    trigger.setAttribute('aria-expanded', 'true');
    if (wasClosing) {
      morph?.go(1);
    } else {
      lockScroll();
      layer = build();
      document.body.append(layer);
      const box = layer.querySelector('.mdlg-box');
      const backdrop = layer.querySelector('.mdlg-backdrop');
      if (reduced()) {
        trigger.style.opacity = '0';
        fade(backdrop, 0, 1);
        fade(box, 0, 1);
      } else {
        box.style.opacity = '0';
        backdrop.style.opacity = '0';
        morph = createMorph({ source: trigger, box, inner: layer.querySelector('.mdlg-inner'), pairs: pairsOf(box), spring, onFrame: (p) => { backdrop.style.opacity = String(p); } });
        morph.measure();
        morph.jump(0);
        morph.go(1);
      }
      layer.querySelector('.mdlg-close').addEventListener('click', close);
      (focusables()[0] ?? box).focus({ preventScroll: true });
    }
    listen();
    opts.onOpenChange?.(true);
  }

  async function close() {
    if (state !== 'open') return;
    state = 'closing';
    root.dataset.state = 'closed';
    trigger.setAttribute('aria-expanded', 'false');
    unlisten();
    trigger.focus({ preventScroll: true });
    opts.onOpenChange?.(false);
    const current = layer;
    if (reduced() || !morph) {
      await Promise.all([fade(current.querySelector('.mdlg-box'), 1, 0), fade(current.querySelector('.mdlg-backdrop'), 1, 0)]);
      trigger.style.opacity = '';
    } else {
      if (!morph.moving) { morph.measure(); morph.jump(1); }
      await morph.go(0);
    }
    if (state !== 'closing' || layer !== current) return;
    morph?.destroy();
    morph = null;
    current.remove();
    layer = null;
    state = 'closed';
    unlockScroll();
  }

  const onTrigger = () => (state === 'open' ? close() : open());
  trigger.addEventListener('click', onTrigger);

  const handle = {
    open,
    close,
    destroy() {
      handles.delete(root);
      trigger.removeEventListener('click', onTrigger);
      unlisten();
      morph?.destroy();
      layer?.remove();
      layer = null;
      state = 'closed';
      unlockScroll();
      trigger.style.opacity = '';
      for (const a of ['aria-haspopup', 'aria-expanded', 'aria-controls']) trigger.removeAttribute(a);
      delete root.dataset.state;
    },
  };
  handles.set(root, handle);
  return handle;
}

// Imported without a call to mount(), it mounts every marked root once the importing module has run.
if (typeof document !== 'undefined') queueMicrotask(() => { for (const el of document.querySelectorAll('[data-motion="morphing-dialog"]')) mount(el); });
