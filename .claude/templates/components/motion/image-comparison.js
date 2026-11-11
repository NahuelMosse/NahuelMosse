// Image comparison, ported from Motion Primitives (components/core/image-comparison.tsx, MIT, Copyright (c) 2024 ibelick).
// Two images and a divider at a percentage (50 at rest). The `left` image is clipped to what is right of the divider, the
// `right` one to what is left of it. The divider follows a drag or, with `enableHover`, the pointer. Upstream springs the
// position with `{ bounce: 0, duration: 0 }`, which is no spring at all, so the position is written directly.
// Port notes. Drag uses pointer events with capture, so it works with mouse, touch and pen; the divider is a focusable
// `role="slider"` that answers the arrow keys (5 %), Home and End. `enableHover` only applies where hover exists; on touch
// the drag is the way in. Pass the images as the two `<img data-position="left|right">` children (the first is `left`
// and the second `right` when unmarked) and an optional `[data-slider]` child to replace the default handle. Nothing here
// moves by itself, so reduced motion changes nothing.
import { scope } from '../core.js';
import { define, node } from './mu-shared.js';

export const mount = define('image-comparison', (el, opts) => {
  const hover = (opts.enableHover ?? el.dataset.enableHover === 'true') && matchMedia('(hover: hover)').matches;
  const life = scope();
  const images = [...el.querySelectorAll(':scope > img')];
  images.forEach((img, i) => { if (!img.dataset.position) img.dataset.position = i === 0 ? 'left' : 'right'; });
  let slider = el.querySelector(':scope > [data-slider]');
  const made = !slider;
  if (made) slider = node('div', '');
  slider.classList.add('mu-image-comparison__slider');
  slider.tabIndex = 0;
  slider.setAttribute('role', 'slider');
  slider.setAttribute('aria-label', el.dataset.label ?? 'Comparar imágenes');
  slider.setAttribute('aria-orientation', 'horizontal');
  slider.setAttribute('aria-valuemin', '0');
  slider.setAttribute('aria-valuemax', '100');
  el.classList.add('mu-image-comparison');
  el.classList.toggle('mu-image-comparison--hover', hover);
  if (made) el.append(slider);

  let value = 50;
  const set = (next) => {
    value = Math.min(100, Math.max(0, next));
    el.style.setProperty('--mu-compare', `${value}%`);
    slider.setAttribute('aria-valuenow', String(Math.round(value)));
    el.dispatchEvent(new CustomEvent('compare', { detail: { value } }));
  };
  const at = (e) => { const r = el.getBoundingClientRect(); set(r.width ? ((e.clientX - r.left) / r.width) * 100 : value); };
  set(Number(opts.value ?? el.dataset.value ?? 50));

  let dragging = false;
  el.addEventListener('pointerdown', (e) => {
    if (hover || (e.pointerType === 'mouse' && e.button !== 0)) return;
    dragging = true;
    el.setPointerCapture(e.pointerId);
    at(e);
  }, { signal: life.signal });
  el.addEventListener('pointermove', (e) => { if (dragging || (hover && e.pointerType === 'mouse')) at(e); }, { signal: life.signal });
  const stop = () => { dragging = false; };
  el.addEventListener('pointerup', stop, { signal: life.signal });
  el.addEventListener('pointercancel', stop, { signal: life.signal });
  slider.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }[e.key];
    if (step !== undefined) set(value + step);
    else if (e.key === 'Home') set(0);
    else if (e.key === 'End') set(100);
    else return;
    e.preventDefault();
  }, { signal: life.signal });

  return {
    set,
    get value() { return value; },
    destroy() {
      life.destroy();
      el.classList.remove('mu-image-comparison', 'mu-image-comparison--hover');
      el.style.removeProperty('--mu-compare');
      if (made) slider.remove();
    },
  };
});
