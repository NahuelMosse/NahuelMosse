// Border trail, ported from Motion Primitives (components/core/border-trail.tsx, MIT, Copyright (c) 2024 ibelick). A spot of
// light travels the edge of the element on `offset-path: rect(...)`, linear, repeating, 5 s a lap. Port note. The element gets
// `position: relative` when it is static; the loop is CSS, paused while off screen or with the tab hidden. Reduced motion
// leaves the spot still at the corner.
import { reduced } from '../core.js';
import { define, gate, node, numberOf } from './mu-shared.js';

export const mount = define('border-trail', (el, opts) => {
  const size = numberOf(opts, el, 'size', 60);
  const duration = numberOf(opts, el, 'duration', 5);
  const trail = node('span', 'mu-border-trail', { decorative: true });
  const spot = node('span', 'mu-border-trail__spot');
  spot.style.width = `${size}px`;
  spot.style.setProperty('--mu-trail-size', `${size}px`);
  spot.style.setProperty('--mu-trail-duration', `${duration}s`);
  if (opts.color) spot.style.setProperty('--mu-trail-color', opts.color);
  trail.append(spot);
  const placed = getComputedStyle(el).position === 'static';
  if (placed) el.style.position = 'relative';
  el.append(trail);
  const watch = gate(el, (on) => { spot.style.animationPlayState = on && !reduced() ? 'running' : 'paused'; });
  return {
    destroy() { watch.destroy(); trail.remove(); if (placed) el.style.position = ''; },
  };
});
