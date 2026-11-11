// What the ports of Arc (uiarc.dev, MIT) share: its motion tokens, its springs and a few helpers. The values
// are those of `registry/motion-tokens.ts` and of the helper `physical()` that each Arc component repeats:
// a spring given as `visualDuration` + `bounce` is restated as stiffness and damping, so that retargeting a
// value mid-flight keeps the velocity it already has.
//
// Two ways to move something, both on the set's integrator (core.js `stepSpring`, 1/240 s):
//   · `Val`     a number that follows a spring (or a linear tween) and can be retargeted, jumped or read. It is
//               what Motion's `useMotionValue` + `animate` are: the width of a pill, the angle of an arc.
//   · `curve`   the same spring played once, from rest to 1, as a CSS `linear()` plus the time it takes to
//               settle: for what only travels (a `scale`, a `translate`) and is handed to the compositor.
// A `Val` runs one rAF loop while it moves and none at rest.
import { reduced, stepSpring, SPRING_STEP } from '../core.js';

export const ARC = {
  duration: { instant: 0.12, fast: 0.16, exit: 0.18, standard: 0.24, considered: 0.48 },
  ease: { enter: [0.16, 1, 0.3, 1], exit: [0.7, 0, 0.84, 0], standard: [0.22, 1, 0.36, 1], inOut: [0.65, 0, 0.35, 1] },
  spring: { snappy: { visualDuration: 0.26, bounce: 0.12 }, smooth: { visualDuration: 0.4, bounce: 0 }, morph: { visualDuration: 0.42, bounce: 0.16 } },
  stagger: { item: 0.035 },
  blur: { subtle: 2, soft: 4, text: 8 },
};

// `{ visualDuration, bounce }` as the stiffness and damping Motion derives from it.
export const physical = ({ visualDuration, bounce }, rest = {}) => {
  const root = (2 * Math.PI) / (visualDuration * 1.2);
  return { stiffness: root * root, damping: 2 * (1 - bounce) * root, mass: 1, ...rest };
};
export const SPRINGS = { snappy: physical(ARC.spring.snappy), smooth: physical(ARC.spring.smooth), morph: physical(ARC.spring.morph) };

export const bezier = (name) => `cubic-bezier(${ARC.ease[name].join(', ')})`;
export const ms = (seconds) => Math.round(seconds * 1000);
export const blur = (px) => (px ? `blur(${px}px)` : 'none');

// A cubic-bezier as a function of time, for the tweens that run on the integrator's clock.
export const bezierFn = (name) => {
  const [x1, y1, x2, y2] = ARC.ease[name];
  const at = (t, a, b) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  return (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = at(t, x1, x2) - x;
      const slope = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
      if (Math.abs(err) < 1e-5 || Math.abs(slope) < 1e-6) break;
      t -= err / slope;
    }
    return at(Math.min(1, Math.max(0, t)), y1, y2);
  };
};

// The spring from rest to 1 as `{ easing: 'linear(…)', duration }` (ms), memoized by its numbers.
const curves = new Map();
export const curve = (spring, points = 28) => {
  const id = `${spring.stiffness}|${spring.damping}|${points}`;
  if (curves.has(id)) return curves.get(id);
  let x = 0;
  let v = 0;
  const run = [0];
  while (run.length < 240 * 4 && (run.length < 3 || Math.abs(x - 1) > 0.0005 || Math.abs(v) > 0.005)) { [x, v] = stepSpring({ ...spring, mass: 1 }, x, v, 1, SPRING_STEP); run.push(x); }
  const at = (i) => (i === points ? 1 : run[Math.round((i * (run.length - 1)) / points)]);
  const result = { easing: `linear(${Array.from({ length: points + 1 }, (_, i) => +at(i).toFixed(4)).join(', ')})`, duration: Math.round((run.length - 1) * SPRING_STEP * 1000) };
  curves.set(id, result);
  return result;
};

// A number that moves on a spring (`to`), on a linear or eased clock (`tween`), or not at all (`jump`).
// `on` is called with the value every frame and once more when it lands. Retargeting keeps the velocity.
export class Val {
  constructor(value, on) {
    this.value = value;
    this.velocity = 0;
    this.on = on;
    this.raf = 0;
    this.run = null;
  }

  get() { return this.value; }

  get moving() { return this.raf !== 0; }

  jump(value) {
    this.stop();
    this.value = value;
    this.velocity = 0;
    this.on?.(value);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.run = null;
  }

  // Resolves when it lands; resolves false when something else takes it over first.
  to(target, spring, { restDelta = 0.5, restSpeed = 2, onUpdate } = {}) {
    this.stop();
    const run = { kind: 'spring', target, spring, restDelta, restSpeed, last: performance.now(), onUpdate };
    this.run = run;
    return new Promise((resolve) => {
      run.done = resolve;
      const frame = (now) => {
        if (this.run !== run) { resolve(false); return; }
        let dt = Math.min(0.05, Math.max(0, now - run.last) / 1000);
        run.last = now;
        for (; dt > 0; dt -= SPRING_STEP) {
          const [p, v] = stepSpring(spring, this.value, this.velocity, target, Math.min(dt, SPRING_STEP));
          this.value = p;
          this.velocity = v;
        }
        const rested = Math.abs(this.value - target) < restDelta && Math.abs(this.velocity) < restSpeed;
        if (rested) { this.value = target; this.velocity = 0; this.raf = 0; this.run = null; }
        this.on?.(this.value);
        onUpdate?.(this.value);
        if (rested) resolve(true); else this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    });
  }

  // A tween of `seconds` from the current value to `target`, `ease` a function of 0..1 (linear by default).
  // `pause()` and `play()` hold and release its clock.
  tween(target, seconds, ease = (t) => t) {
    this.stop();
    const from = this.value;
    const run = { kind: 'tween', paused: false, elapsed: 0, last: 0 };
    this.run = run;
    const promise = new Promise((resolve) => {
      const frame = (now) => {
        if (this.run !== run) { resolve(false); return; }
        if (!run.paused) run.elapsed += Math.min(0.1, (now - (run.last || now)) / 1000);
        run.last = now;
        const p = Math.min(1, run.elapsed / seconds);
        this.value = from + (target - from) * ease(p);
        this.on?.(this.value);
        if (p >= 1) { this.raf = 0; this.run = null; resolve(true); } else this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    });
    promise.pause = () => { run.paused = true; };
    promise.play = () => { run.paused = false; };
    return promise;
  }
}

// A reduced-motion fade, 100-150 ms and never zero.
export const fadeIn = (el, duration = 140) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: bezier('standard') });

// Text that rises in from the side it moves toward and lifts away on the other (`dir` 1 / -1), blur 4 px in and
// 2 px out. Returns the keyframes of each half; `reduced` is a plain fade.
export const rise = (dir = 1, isReducedNow = reduced()) => (isReducedNow
  ? { enter: [{ opacity: 0 }, { opacity: 1 }], leave: [{ opacity: 1 }, { opacity: 0 }] }
  : {
    enter: [{ opacity: 0, transform: `translateY(${0.3 * dir}em)`, filter: blur(ARC.blur.soft) }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' }],
    leave: [{ opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' }, { opacity: 0, transform: `translateY(${-0.3 * dir}em)`, filter: blur(ARC.blur.subtle) }],
  });
export const ENTER = { duration: ms(ARC.duration.standard), easing: bezier('enter'), fill: 'both' };
export const LEAVE = { duration: ms(ARC.duration.instant), easing: bezier('standard'), fill: 'both' };

// Escapes what a label puts into markup.
export const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const el = (tag, className, attrs = {}, html) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  if (html !== undefined) node.innerHTML = html;
  return node;
};

export const svgIcon = (paths, size = 16, className = '') => `<svg class="arc-icon ${className}" viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true" focusable="false">${paths}</svg>`;
export const ICONS = {
  plus: '<path d="M8 3v10M3 8h10"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8"/>',
  chevronRight: '<path d="M6 4l4 4-4 4"/>',
  chevronLeft: '<path d="M10 4L6 8l4 4"/>',
  check: '<path d="M3.5 8.5l3 3 6-7"/>',
  arrowUp: '<path d="M8 13V3M4 7l4-4 4 4"/>',
  trash: '<path d="M2 4h12M12.67 4v9.33c0 .67-.67 1.34-1.34 1.34H4.67c-.67 0-1.34-.67-1.34-1.34V4M5.33 4V2.67c0-.67.67-1.34 1.34-1.34h2.66c.67 0 1.34.67 1.34 1.34V4M6.67 7.33v4M9.33 7.33v4"/>',
  loader: '<path d="M8 2.5a5.5 5.5 0 1 0 5.5 5.5"/>',
  alert: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.5M8 11v.01"/>',
};
