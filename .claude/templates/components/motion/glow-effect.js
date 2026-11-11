// Glow effect, ported from Motion Primitives (components/core/glow-effect.tsx, MIT, Copyright (c) 2024 ibelick). A blurred
// gradient layer behind the element in six modes: rotate, pulse, breathe, colorShift, flowHorizontal, static. Blur is a number
// of px or a preset (softest 4, soft 8, medium 12, strong 16, stronger 24, strongest 24, none 0, the Tailwind blur scale).
// Port notes. The parent gets `position: relative` and `isolation: isolate` when it has neither, so the layer at z-index -1
// stays behind the content and inside the card. Rotate runs in CSS on a registered angle; the other modes animate background,
// scale and opacity with the Web Animations API, mirrored, as upstream. Reduced motion draws the first frame and does not run.
import { reduced } from '../core.js';
import { define, gate, node, numberOf } from './mu-shared.js';

const BLUR = { softest: 4, soft: 8, medium: 12, strong: 16, stronger: 24, strongest: 24, none: 0 };
const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F1C40F'];

export const mount = define('glow-effect', (el, opts) => {
  const colors = opts.colors ?? (el.dataset.colors ? el.dataset.colors.split(',').map((c) => c.trim()) : COLORS);
  const mode = opts.mode ?? el.dataset.mode ?? 'rotate';
  const blurOption = opts.blur ?? el.dataset.blur ?? 'medium';
  const blur = Number.isFinite(Number(blurOption)) ? Number(blurOption) : (BLUR[blurOption] ?? BLUR.medium);
  const scale = numberOf(opts, el, 'scale', 1);
  const duration = numberOf(opts, el, 'duration', 5);

  const layer = node('span', `mu-glow${mode === 'rotate' ? ' mu-glow--rotate' : ''}`, { decorative: true });
  layer.style.filter = blur ? `blur(${blur}px)` : 'none';
  layer.style.setProperty('--mu-glow-scale', scale);
  layer.style.setProperty('--mu-glow-colors', colors.join(', '));
  layer.style.setProperty('--mu-glow-duration', `${duration}s`);
  const placed = getComputedStyle(el).position === 'static';
  if (placed) el.style.position = 'relative';
  const isolated = getComputedStyle(el).isolation !== 'isolate';
  if (isolated) el.style.isolation = 'isolate';
  el.prepend(layer);

  const radial = (c) => `radial-gradient(circle at 50% 50%, ${c} 0%, transparent 100%)`;
  const after = (i) => colors[(i + 1) % colors.length];
  const frames = {
    pulse: colors.map((c, i) => ({ background: radial(c), transform: `scale(${scale * [1, 1.1, 1][i % 3]})`, opacity: [0.5, 0.8, 0.5][i % 3] })),
    breathe: colors.map((c, i) => ({ background: radial(c), transform: `scale(${scale * [1, 1.05, 1][i % 3]})` })),
    colorShift: colors.map((c, i) => ({ background: `conic-gradient(from 0deg at 50% 50%, ${c} 0%, ${after(i)} 50%, ${c} 100%)` })),
    flowHorizontal: colors.map((c, i) => ({ background: `linear-gradient(to right, ${c}, ${after(i)})` })),
  };
  if (mode === 'static') layer.style.background = `linear-gradient(to right, ${colors.join(', ')})`;
  else if (frames[mode]) layer.style.background = frames[mode][0].background;

  let run = null;
  if (frames[mode] && !reduced()) {
    run = layer.animate(frames[mode], { duration: duration * 1000, easing: 'linear', iterations: Infinity, direction: 'alternate' });
    run.pause();
  }
  const watch = gate(el, (on) => {
    if (run) { if (on) run.play(); else run.pause(); }
    if (mode === 'rotate') layer.style.animationPlayState = on && !reduced() ? 'running' : 'paused';
  });
  return {
    destroy() {
      watch.destroy();
      run?.cancel();
      layer.remove();
      if (placed) el.style.position = '';
      if (isolated) el.style.isolation = '';
    },
  };
});
