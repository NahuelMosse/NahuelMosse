// Animated beam, ported from Magic UI (registry/magicui/animated-beam.tsx). An SVG laid over the container
// draws a quadratic curve between the centers of two nodes: a faint line (opacity 0.2, 2 px) and over it
// the same path stroked with a gradient (transparent, start color, stop color at 32.5 %, transparent)
// whose two ends travel across the container with the easeOutExpo curve of the original, repeating.
// The nodes are `[data-beam-node="name"]` and the beams `data-beams="bank>ledger, ledger>mail"`
// (`a<b` runs the light right to left), or `opts.beams` with the original's props: from, to, curvature,
// reverse, duration (s), delay (s), repeatDelay (s), pathWidth, pathOpacity and the four offsets.
import { reduced, offsetIn, uid } from '../core.js';
import { bezier, define, gate, numberOf } from './mu-shared.js';

const NS = 'http://www.w3.org/2000/svg';
const ease = bezier(0.16, 1, 0.3, 1);
const svg = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
// Where the two ends of the gradient sit, as a fraction of the width, at the start and the end of a lap.
const FLOW = { forward: { x1: [0.1, 1.1], x2: [0, 1] }, reverse: { x1: [0.9, -0.1], x2: [1, 0] } };
// What reduced motion shows: the light parked over the middle of the line.
const PARKED = { forward: { x1: 0.75, x2: 0.25 }, reverse: { x1: 0.25, x2: 0.75 } };

const parse = (el, opts) => {
  if (opts.beams) return opts.beams;
  return (el.dataset.beams ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((pair) => {
    const reverse = pair.includes('<');
    const [from, to] = pair.split(/[<>]/).map((s) => s.trim());
    return { from, to, reverse };
  });
};

export const mount = define('animated-beam', (el, opts) => {
  const defaults = { curvature: numberOf(opts, el, 'curvature', 0), duration: numberOf(opts, el, 'duration', 5), delay: numberOf(opts, el, 'delay', 0), repeatDelay: numberOf(opts, el, 'repeatDelay', 0) };
  const lookup = (ref) => (typeof ref === 'string' ? el.querySelector(`[data-beam-node="${ref}"]`) : ref);
  const layer = svg('svg', { fill: 'none', class: 'mu-beam__svg', 'aria-hidden': 'true', focusable: 'false' });
  const defs = svg('defs');
  layer.append(defs);
  const beams = parse(el, opts).map((spec) => ({ ...defaults, ...spec, from: lookup(spec.from), to: lookup(spec.to) })).filter((b) => b.from && b.to).map((b) => {
    const id = uid('mu-beam-');
    b.track = svg('path', { class: 'mu-beam__track', 'stroke-linecap': 'round' });
    b.light = svg('path', { class: 'mu-beam__light', stroke: `url(#${id})`, 'stroke-linecap': 'round' });
    b.gradient = svg('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: 0, y2: 0 });
    b.gradient.append(
      svg('stop', { class: 'mu-beam__from', 'stop-opacity': 0 }),
      svg('stop', { class: 'mu-beam__from' }),
      svg('stop', { class: 'mu-beam__to', offset: '32.5%' }),
      svg('stop', { class: 'mu-beam__to', offset: '100%', 'stop-opacity': 0 }),
    );
    if (b.pathWidth !== undefined) { b.track.style.strokeWidth = `${b.pathWidth}px`; b.light.style.strokeWidth = `${b.pathWidth}px`; }
    if (b.pathOpacity !== undefined) b.track.style.strokeOpacity = b.pathOpacity;
    defs.append(b.gradient);
    layer.append(b.track);
    return b;
  });
  for (const b of beams) layer.append(b.light);
  el.classList.add('mu-beam');
  el.prepend(layer);

  let width = 0;
  const center = (target, dx = 0, dy = 0) => {
    const at = offsetIn(target, el);
    if (at) return [at[0] + target.offsetWidth / 2 + dx, at[1] + target.offsetHeight / 2 + dy];
    const c = el.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    return [r.left - c.left + r.width / 2 + dx, r.top - c.top + r.height / 2 + dy];
  };
  const layout = () => {
    width = el.clientWidth;
    const height = el.clientHeight;
    layer.setAttribute('width', width);
    layer.setAttribute('height', height);
    layer.setAttribute('viewBox', `0 0 ${width} ${height}`);
    for (const b of beams) {
      const [sx, sy] = center(b.from, b.startXOffset, b.startYOffset);
      const [ex, ey] = center(b.to, b.endXOffset, b.endYOffset);
      const d = `M ${sx},${sy} Q ${(sx + ex) / 2},${sy - b.curvature} ${ex},${ey}`;
      b.track.setAttribute('d', d);
      b.light.setAttribute('d', d);
    }
    paint();
  };

  let clock = 0;
  const place = (b, x1, x2) => { b.gradient.setAttribute('x1', x1 * width); b.gradient.setAttribute('x2', x2 * width); };
  function paint() {
    for (const b of beams) {
      const flow = b.reverse ? 'reverse' : 'forward';
      if (reduced()) { place(b, PARKED[flow].x1, PARKED[flow].x2); continue; }
      const lap = b.duration * 1000;
      const t = clock - b.delay * 1000;
      if (t < 0) { place(b, 0, 0); continue; }
      const phase = t % (lap + b.repeatDelay * 1000);
      const p = phase >= lap ? 1 : ease(phase / lap);
      const f = FLOW[flow];
      place(b, f.x1[0] + (f.x1[1] - f.x1[0]) * p, f.x2[0] + (f.x2[1] - f.x2[0]) * p);
    }
  }

  let raf = 0;
  let last = 0;
  const frame = (now) => {
    clock += Math.min(100, now - last);
    last = now;
    paint();
    raf = requestAnimationFrame(frame);
  };
  const run = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const halt = () => { cancelAnimationFrame(raf); raf = 0; };

  const resize = new ResizeObserver(layout);
  resize.observe(el);
  layout();

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let on = false;
  const sync = () => { if (on && !motion.matches) run(); else halt(); };
  const settle = () => { sync(); if (motion.matches) { paint(); layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' }); } };
  motion.addEventListener('change', settle);
  if (motion.matches) settle();
  const watcher = gate(el, (visible) => { on = visible; sync(); });

  return {
    layout,
    get running() { return raf !== 0; },
    destroy() {
      halt();
      resize.disconnect();
      watcher.destroy();
      motion.removeEventListener('change', settle);
      layer.remove();
      el.classList.remove('mu-beam');
    },
  };
});
