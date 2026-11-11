// Magnetic, ported from Motion Primitives (components/core/magnetic.tsx, MIT, Copyright (c) 2024 ibelick). While the pointer is
// inside `range` px of the element's center, the element is pulled toward it by distance * intensity * (1 - distance / range),
// on a spring (stiffness 26.7, damping 4.1, mass .2). `actionArea`: `self` (pointer over the element), `parent`, or `global`.
// Port notes. Only a mouse pulls: touch and pen do nothing, so the element stays where it is and stays tappable; reduced
// motion does nothing either. The wrapper is the element itself, so its children are untouched.
import { reduced, follower, scope } from '../core.js';
import { define, numberOf } from './mu-shared.js';

const SPRING = { stiffness: 26.7, damping: 4.1, mass: 0.2 };

export const mount = define('magnetic', (el, opts) => {
  const intensity = numberOf(opts, el, 'intensity', 0.6);
  const range = numberOf(opts, el, 'range', 100);
  const area = opts.actionArea ?? el.dataset.actionArea ?? 'self';
  const spring = { ...SPRING, ...(opts.springOptions ?? {}) };
  const life = scope();
  const move = follower(spring, ([x, y]) => { el.style.transform = x === 0 && y === 0 ? '' : `translate3d(${x}px, ${y}px, 0)`; }, 0.05, [el]);
  el.classList.add('mu-magnetic');
  move.to([0, 0], true);

  let inside = area === 'global';
  const home = () => move.to([0, 0]);
  const track = (e) => {
    if (e.pointerType !== 'mouse' || reduced()) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (inside && d <= range) { const k = intensity * (1 - d / range); move.to([dx * k, dy * k]); } else home();
  };
  document.addEventListener('pointermove', track, { signal: life.signal });

  const host = area === 'parent' ? el.parentElement : area === 'self' ? el : null;
  if (host) {
    host.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') inside = true; }, { signal: life.signal });
    host.addEventListener('pointerleave', () => { inside = false; home(); }, { signal: life.signal });
  }
  return {
    destroy() { move.stop(); life.destroy(); el.style.transform = ''; el.classList.remove('mu-magnetic'); },
  };
});
