// Progressive blur, ported from Motion Primitives (components/core/progressive-blur.tsx, MIT, Copyright (c) 2024 ibelick).
// `blurLayers` (8, at least 2) absolutely positioned layers; layer i blurs what is behind it by i * blurIntensity (.25) px
// through a mask whose band of the gradient sits at i / (layers + 1), so the blur grows along `direction` (top, right,
// bottom, left). Port notes. The element is the host: put it over the content to soften, with a size and `pointer-events: none`
// it lets clicks through. Static, so reduced motion needs nothing; the layers are hidden from assistive technology.
import { define, node, numberOf } from './mu-shared.js';

const ANGLES = { top: 0, right: 90, bottom: 180, left: 270 };

export const mount = define('progressive-blur', (el, opts) => {
  const direction = opts.direction ?? el.dataset.direction ?? 'bottom';
  const layers = Math.max(numberOf(opts, el, 'blurLayers', 8), 2);
  const intensity = numberOf(opts, el, 'blurIntensity', 0.25);
  const segment = 1 / (layers + 1);
  const angle = ANGLES[direction] ?? ANGLES.bottom;
  const made = [];
  el.classList.add('mu-progressive-blur');
  for (let i = 0; i < layers; i++) {
    const stops = [i, i + 1, i + 2, i + 3].map((n, k) => `rgba(255, 255, 255, ${k === 1 || k === 2 ? 1 : 0}) ${n * segment * 100}%`);
    const mask = `linear-gradient(${angle}deg, ${stops.join(', ')})`;
    const layer = node('span', 'mu-progressive-blur__layer', { decorative: true });
    Object.assign(layer.style, { maskImage: mask, webkitMaskImage: mask, backdropFilter: `blur(${i * intensity}px)`, webkitBackdropFilter: `blur(${i * intensity}px)` });
    el.append(layer);
    made.push(layer);
  }
  return {
    destroy() { for (const l of made) l.remove(); el.classList.remove('mu-progressive-blur'); },
  };
});
