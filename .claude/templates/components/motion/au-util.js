// What the Animate UI group shares: a spring written as a CSS curve with the time it takes, a loop
// that pauses off screen and with the tab hidden, and the swap of one node for another.
import { SPRING_STEP, stepSpring, springEasing, reduced } from '../core.js';

// A spring (stiffness, damping, mass) as `{ easing, duration }` for a CSS transition or WAAPI: the
// curve is the integrator's output and the duration is how long it takes to rest.
export const springCurve = (stiffness, damping, mass = 1, points = 40) => {
  const spring = { stiffness, damping, mass };
  let x = 0;
  let v = 0;
  let steps = 0;
  while (steps < 240 * 4 && (steps < 3 || Math.abs(x - 1) > 0.0005 || Math.abs(v) > 0.005)) { [x, v] = stepSpring(spring, x, v, 1, SPRING_STEP); steps++; }
  return { easing: springEasing(stiffness, damping, mass, points), duration: Math.round(steps * SPRING_STEP * 1000) };
};

// Motion's `duration` + `bounce` spring as stiffness / damping / mass.
export const bounceSpring = (durationMs, bounce = 0) => {
  const w = (2 * Math.PI) / (durationMs / 1000);
  return { stiffness: w * w, damping: 2 * w * (1 - bounce), mass: 1 };
};

// The fade a component uses when motion is reduced: short, never zero.
export const REDUCED_FADE = 140;

// A block that is not moving off screen or with the tab hidden stops its loop: `start` returns the
// `stop`; it is called again when the block is back.
export const whileOnScreen = (el, start) => {
  let stop = null;
  let visible = true;
  const sync = () => {
    const should = visible && !document.hidden;
    if (should && !stop) stop = start();
    else if (!should && stop) { stop(); stop = null; }
  };
  const io = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; sync(); });
  io.observe(el);
  document.addEventListener('visibilitychange', sync);
  sync();
  return () => { io.disconnect(); document.removeEventListener('visibilitychange', sync); stop?.(); stop = null; };
};

export const NS = 'http://www.w3.org/2000/svg';
export const make = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids);
  return el;
};

// The ease Motion uses for a tween with only a duration.
export const EASE_TWEEN = 'cubic-bezier(0, 0, 0.58, 1)';
export const EASE_IN_OUT = 'cubic-bezier(0.42, 0, 0.58, 1)';

// An element that is in the way of a swap: scale, opacity and blur in and out (the copy button's).
export const swapAnimation = (el, entering, duration = 250) => {
  if (reduced()) {
    const still = { transform: 'none', filter: 'none' };
    return el.animate([{ ...still, opacity: entering ? 0 : 1 }, { ...still, opacity: entering ? 1 : 0 }], { duration: REDUCED_FADE, easing: 'ease-out', fill: 'both' });
  }
  const hidden = { transform: 'scale(0)', opacity: 0.4, filter: 'blur(4px)' };
  const shown = { transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' };
  // The original unmounts the one that leaves; here it stays in its cell, so it ends fully transparent.
  const keyframes = entering ? [hidden, shown] : [{ ...shown, offset: 0 }, { ...hidden, offset: 0.97 }, { ...hidden, opacity: 0, offset: 1 }];
  return el.animate(keyframes, { duration, easing: EASE_TWEEN, fill: 'both' });
};
