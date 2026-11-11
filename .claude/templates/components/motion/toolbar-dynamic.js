// Toolbar dynamic (Motion Primitives): a toolbar that adjusts its width to what is needed. It starts
// small, with its icons; the search icon opens the bar into a field on a spring, and Back, Escape or a
// press outside gives it back. The row inside swaps at once and the width is what travels.
//
// Markup: a root `[data-motion="toolbar-dynamic"]` > `[data-td="box"]` holding `[data-td="closed"]`
// (with the `[data-td="expand"]` button) and `[data-td="open"]` (with `[data-td="back"]` and
// `[data-td="input"]`). The open width is `--toolbar-dynamic-open-width`.
// mount(root, { transition: { bounce, duration }, onOpenChange }) -> { open, close, destroy }.
// Emits `toolbar-dynamic:input` { value } and `toolbar-dynamic:submit` { value } on Enter.
import { reduced } from '../core.js';
import { bounceSpring, springCurve } from './mp-morph.js';
import { flipClip, flipSurface, surfaceRect, visibleRect } from './flip-size.js';

const handles = new WeakMap();

export function mount(root, opts = {}) {
  if (handles.has(root)) return handles.get(root);
  const box = root.querySelector('[data-td="box"]');
  const closedRow = root.querySelector('[data-td="closed"]');
  const openRow = root.querySelector('[data-td="open"]');
  const expand = root.querySelector('[data-td="expand"]');
  const back = root.querySelector('[data-td="back"]');
  const input = root.querySelector('[data-td="input"]');
  const t = opts.transition ?? { bounce: 0.1, duration: 0.2 };
  const curve = springCurve(bounceSpring(t.bounce, t.duration));
  let isOpen = false;
  let anims = [];
  const stop = () => { for (const a of anims) a.cancel(); anims = []; };

  root.dataset.state = 'closed';
  openRow.hidden = true;
  expand.setAttribute('aria-expanded', 'false');

  function setOpen(next, { focus = true } = {}) {
    if (next === isOpen) return;
    const surface = surfaceRect(root);
    const shown = visibleRect(box);
    stop();
    isOpen = next;
    root.dataset.state = next ? 'open' : 'closed';
    expand.setAttribute('aria-expanded', String(next));
    closedRow.hidden = next;
    openRow.hidden = !next;
    if (reduced()) {
      anims = [(next ? openRow : closedRow).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' })];
    } else {
      // The width is already the final one: the surface travels to it and the row is shown through a clip that follows it.
      const timing = { duration: curve.duration, easing: curve.easing };
      anims = [flipSurface(root, surface, timing), flipClip(box, shown, undefined, timing, getComputedStyle(root).borderTopLeftRadius)];
    }
    const own = anims;
    Promise.all(own.map((a) => a.finished)).then(() => { if (anims === own) anims = []; }, () => {});
    if (focus) (next ? input : expand).focus({ preventScroll: true });
    opts.onOpenChange?.(next);
  }

  const onExpand = () => setOpen(true);
  const onBack = () => setOpen(false);
  const onKey = (event) => { if (event.key === 'Escape' && isOpen) { event.preventDefault(); setOpen(false); } };
  const onOutside = (event) => { if (isOpen && !root.contains(event.target)) setOpen(false, { focus: false }); };
  const onInput = () => root.dispatchEvent(new CustomEvent('toolbar-dynamic:input', { detail: { value: input.value }, bubbles: true }));
  const onEnter = (event) => { if (event.key === 'Enter') root.dispatchEvent(new CustomEvent('toolbar-dynamic:submit', { detail: { value: input.value }, bubbles: true })); };
  expand.addEventListener('click', onExpand);
  back.addEventListener('click', onBack);
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onEnter);
  root.addEventListener('keydown', onKey);
  document.addEventListener('mousedown', onOutside);
  document.addEventListener('touchstart', onOutside, { passive: true });

  const handle = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    destroy() {
      handles.delete(root);
      stop();
      expand.removeEventListener('click', onExpand);
      back.removeEventListener('click', onBack);
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onEnter);
      root.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
      closedRow.hidden = false;
      openRow.hidden = true;
      expand.removeAttribute('aria-expanded');
      delete root.dataset.state;
    },
  };
  handles.set(root, handle);
  return handle;
}

// Imported without a call to mount(), it mounts every marked root once the importing module has run.
if (typeof document !== 'undefined') queueMicrotask(() => { for (const el of document.querySelectorAll('[data-motion="toolbar-dynamic"]')) mount(el); });
