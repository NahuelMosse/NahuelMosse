// Cursor, ported from Motion Primitives (components/core/cursor.tsx, MIT, Copyright (c) 2024 ibelick). The element's content
// follows the mouse, centered on it, and appears and disappears with a scale and fade (initial scale .5, opacity 0). The
// position goes through a spring when `springConfig` is given, and straight otherwise (upstream default `{ duration: 0 }`).
// Port notes. Upstream's `attachToParent` is the only mode here: the cursor lives inside its parent, the system cursor is
// hidden in the parent only while the pointer is over it, and the page cursor is never touched. Where there is no fine hover
// pointer (touch) nothing mounts and the parent keeps its normal behavior; with reduced motion the cursor still follows but
// appears without scale or fade, and the spring is dropped. `onPositionChange(x, y)` is kept.
import { reduced, follower, scope } from '../core.js';
import { define, node } from './mu-shared.js';

export const mount = define('cursor', (el, opts) => {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return { destroy() {} };
  const host = el.parentElement;
  const life = scope();
  const body = node('span', 'mu-cursor__body');
  const content = [...el.childNodes];
  body.append(...content);
  el.append(body);
  el.classList.add('mu-cursor');
  el.setAttribute('aria-hidden', 'true');
  host.classList.add('mu-cursor-host');

  const spring = opts.springConfig && !reduced() ? opts.springConfig : null;
  const place = ([x, y]) => { el.style.transform = `translate3d(${x}px, ${y}px, 0)`; };
  const move = follower(spring ?? { stiffness: 1, damping: 1, mass: 1 }, place, 0.05, [el]);
  let seen = false;
  const show = (on) => {
    el.dataset.on = String(on);
    host.dataset.muCursor = on ? 'on' : 'off';
  };
  const track = (e) => {
    if (e.pointerType !== 'mouse') return;
    const target = [e.clientX, e.clientY];
    move.to(target, !spring || !seen);
    seen = true;
    opts.onPositionChange?.(e.clientX, e.clientY);
  };
  host.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; seen = false; track(e); show(true); }, { signal: life.signal });
  host.addEventListener('pointermove', track, { signal: life.signal });
  host.addEventListener('pointerleave', () => show(false), { signal: life.signal });
  show(false);

  return {
    destroy() {
      move.stop();
      life.destroy();
      host.classList.remove('mu-cursor-host');
      delete host.dataset.muCursor;
      el.classList.remove('mu-cursor');
      el.removeAttribute('aria-hidden');
      el.style.transform = '';
      delete el.dataset.on;
      el.replaceChildren(...content);
    },
  };
});
