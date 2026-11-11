// Morphing popover (Motion Primitives): the trigger button turns into the popover. The panel opens
// centered on the trigger, grows from its rect on a spring, and the trigger's label flies to the
// label inside the panel. Escape and a press outside close it; the draft inside survives a close.
//
// Markup: a root `[data-motion="morphing-popover"]` with `button[data-mpo="trigger"]` (its label is
// `[data-mpo="label"]`) and `template[data-mpo="content"]` (with an optional `[data-mpo="label"]`, a
// `form[data-mpo="form"]` and `[data-mpo="close"]` buttons). Submitting emits `morphing-popover:submit`
// with `{ value }` of the first textarea or input, clears it and closes.
// mount(root, { transition: { bounce, duration } | { stiffness, damping, mass }, label, onSubmit, onOpenChange })
import { reduced, uid } from '../core.js';
import { createMorph, bounceSpring } from './mp-morph.js';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const EDGE = 8;
const handles = new WeakMap();

export function mount(root, opts = {}) {
  if (handles.has(root)) return handles.get(root);
  const trigger = root.querySelector('[data-mpo="trigger"]');
  const template = root.querySelector('template[data-mpo="content"]');
  const id = uid('mpop-');
  const t = opts.transition ?? { bounce: 0.1, duration: 0.4 };
  const spring = t.bounce !== undefined ? bounceSpring(t.bounce, t.duration ?? 0.4) : { mass: 1, ...t };
  let state = 'closed';
  let box = null;
  let morph = null;

  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', id);
  root.dataset.state = 'closed';

  const build = () => {
    const el = document.createElement('div');
    el.className = 'mpop-box';
    el.id = id;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', opts.label ?? trigger.textContent.trim());
    el.innerHTML = '<div class="mpop-inner"></div>';
    el.firstElementChild.append(template.content.cloneNode(true));
    el.querySelector('[data-mpo="label"]')?.setAttribute('aria-hidden', 'true');
    const field = el.querySelector('textarea, input');
    field?.addEventListener('input', () => { el.toggleAttribute('data-filled', field.value !== ''); });
    el.addEventListener('click', (event) => { if (event.target.closest('[data-mpo="close"]')) close(); });
    el.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = field?.value ?? '';
      root.dispatchEvent(new CustomEvent('morphing-popover:submit', { detail: { value }, bubbles: true }));
      opts.onSubmit?.(value);
      if (field) { field.value = ''; el.removeAttribute('data-filled'); }
      close();
    });
    return el;
  };

  // Keeps the panel inside the viewport: it opens centered on the trigger, so near an edge it slides in.
  const keepInside = () => {
    box.style.translate = '';
    const r = box.getBoundingClientRect();
    const dx = r.left < EDGE ? EDGE - r.left : Math.min(0, innerWidth - EDGE - r.right);
    const dy = r.top < EDGE ? EDGE - r.top : Math.min(0, innerHeight - EDGE - r.bottom);
    if (dx || dy) box.style.translate = `${dx}px ${dy}px`;
  };

  const onKey = (event) => { if (event.key === 'Escape' && state === 'open') { event.preventDefault(); close(); } };
  const onOutside = (event) => { if (state === 'open' && !box.contains(event.target) && !trigger.contains(event.target)) close(true); };
  const listen = () => {
    // Capturing: the popover is the layer on top, so its Escape is taken before any layer under it (a panel, a selection) sees it.
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside, { passive: true });
  };
  const unlisten = () => {
    document.removeEventListener('keydown', onKey, true);
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
      box ??= build();
      root.append(box);
      keepInside();
      if (reduced()) {
        trigger.style.opacity = '0';
        fade(box, 0, 1);
      } else {
        box.style.opacity = '0';
        const label = trigger.querySelector('[data-mpo="label"]');
        const target = box.querySelector('[data-mpo="label"]');
        morph = createMorph({ source: trigger, box, inner: box.firstElementChild, pairs: label && target ? [{ from: label, to: target, text: true }] : [], spring });
        morph.measure();
        morph.jump(0);
        morph.go(1);
      }
      (box.querySelector('[autofocus]') ?? box.querySelector('textarea, input') ?? box.querySelector(FOCUSABLE) ?? box).focus({ preventScroll: true });
    }
    listen();
    opts.onOpenChange?.(true);
  }

  async function close(fromOutside = false) {
    if (state !== 'open') return;
    state = 'closing';
    root.dataset.state = 'closed';
    trigger.setAttribute('aria-expanded', 'false');
    unlisten();
    if (!fromOutside || box.contains(document.activeElement)) trigger.focus({ preventScroll: true });
    opts.onOpenChange?.(false);
    const current = box;
    if (reduced() || !morph) {
      await fade(current, 1, 0);
      trigger.style.opacity = '';
    } else {
      if (!morph.moving) { morph.measure(); morph.jump(1); }
      await morph.go(0);
    }
    if (state !== 'closing' || box !== current) return;
    morph?.destroy();
    morph = null;
    for (const a of current.getAnimations()) a.cancel();
    current.style.cssText = '';
    current.remove();
    state = 'closed';
  }

  const onTrigger = () => (state === 'open' ? close() : open());
  trigger.addEventListener('click', onTrigger);

  const handle = {
    open,
    close: () => close(),
    destroy() {
      handles.delete(root);
      trigger.removeEventListener('click', onTrigger);
      unlisten();
      morph?.destroy();
      box?.remove();
      box = null;
      state = 'closed';
      trigger.style.opacity = '';
      for (const a of ['aria-haspopup', 'aria-expanded', 'aria-controls']) trigger.removeAttribute(a);
      delete root.dataset.state;
    },
  };
  handles.set(root, handle);
  return handle;
}

// Imported without a call to mount(), it mounts every marked root once the importing module has run.
if (typeof document !== 'undefined') queueMicrotask(() => { for (const el of document.querySelectorAll('[data-motion="morphing-popover"]')) mount(el); });
