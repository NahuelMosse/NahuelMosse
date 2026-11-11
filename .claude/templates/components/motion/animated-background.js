// Animated background (Motion Primitives): one highlight that slides between the items of a list, a
// menu or a segmented control, following the pointer (hover mode) or the last click (click mode).
// It rides a spring (bounce/duration) or an eased tween, appears in place on the first item and
// fades out where it is when it leaves. Keyboard focus moves it like the pointer does.
//
// Markup: a root `[data-motion="animated-background"]` whose items carry `data-id`. Attributes (or
// options): `data-mode="hover|click"`, `data-default="<id>"`, `data-bounce`, `data-duration` (seconds),
// `data-ease="easeInOut|easeOut|easeIn|linear"` (a tween instead of a spring).
// mount(root, { mode, defaultValue, transition: { bounce, duration } | { ease, duration }, onValueChange })
// -> { value, set(id), destroy }. Emits `animated-background:change` { value } on the root.
import { reduced, stepSpring, SPRING_STEP, offsetIn } from '../core.js';
import { bounceSpring } from './mp-morph.js';

const BEZIER = { easeInOut: [0.42, 0, 0.58, 1], easeOut: [0, 0, 0.58, 1], easeIn: [0.42, 0, 1, 1], linear: [0, 0, 1, 1] };
const bezier = ([x1, y1, x2, y2]) => (x) => {
  const at = (t, a, b) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t * t + t ** 3;
  let t = x;
  for (let i = 0; i < 8; i++) { const d = (at(t, x1, x2) - x); const slope = 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * (1 - t) * t + 3 * (1 - x2) * t * t; if (Math.abs(d) < 1e-5 || !slope) break; t -= d / slope; }
  return at(Math.min(1, Math.max(0, t)), y1, y2);
};
const handles = new WeakMap();

// A vector that goes to its target by spring or by tween, frame by frame; `snap` moves entries at once.
const driver = (apply) => {
  let pos = [0, 0, 0, 0, 0];
  let vel = [0, 0, 0, 0, 0];
  let target = [0, 0, 0, 0, 0];
  let from = [...pos];
  let started = 0;
  let raf = 0;
  let last = 0;
  let motion = { spring: bounceSpring(0.2, 0.3) };
  const eps = [0.05, 0.05, 0.05, 0.05, 0.002];
  const frame = (now) => {
    let rested;
    if (motion.spring) {
      let dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (; dt > 0; dt -= SPRING_STEP) {
        const h = Math.min(dt, SPRING_STEP);
        for (let i = 0; i < 5; i++) [pos[i], vel[i]] = stepSpring(motion.spring, pos[i], vel[i], target[i], h);
      }
      rested = pos.every((p, i) => Math.abs(p - target[i]) < eps[i] && Math.abs(vel[i]) < eps[i] * 20);
    } else {
      const t = Math.min(1, (now - started) / (motion.tween.duration * 1000));
      const k = motion.tween.ease(t);
      pos = from.map((f, i) => f + (target[i] - f) * k);
      rested = t >= 1;
    }
    if (rested) { pos = [...target]; vel = [0, 0, 0, 0, 0]; raf = 0; }
    apply(pos);
    if (!rested) raf = requestAnimationFrame(frame);
  };
  return {
    motion(next) { motion = next; },
    snap(rect, o) {
      for (let i = 0; i < 4; i++) { pos[i] = target[i] = rect[i]; vel[i] = 0; }
      if (o !== undefined) { pos[4] = target[4] = o; vel[4] = 0; }
      from = [...pos];
    },
    to(next) {
      target = [...next];
      from = [...pos];
      started = performance.now();
      last = started;
      if (!raf) raf = requestAnimationFrame(frame);
    },
    now(i) { return pos[i]; },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
};

export function mount(root, opts = {}) {
  if (handles.has(root)) return handles.get(root);
  const items = [...root.querySelectorAll('[data-id]')];
  const mode = opts.mode ?? root.dataset.mode ?? 'click';
  const defaultValue = opts.defaultValue ?? root.dataset.default ?? null;
  const t = opts.transition ?? (root.dataset.ease ? { ease: root.dataset.ease, duration: Number(root.dataset.duration ?? 0.2) } : { bounce: Number(root.dataset.bounce ?? 0.2), duration: Number(root.dataset.duration ?? 0.3) });
  const base = t.ease ? { tween: { duration: t.duration ?? 0.2, ease: bezier(BEZIER[t.ease] ?? BEZIER.easeInOut) } } : { spring: bounceSpring(t.bounce ?? 0.2, t.duration ?? 0.3) };
  const quiet = { tween: { duration: 0.12, ease: bezier(BEZIER.easeOut) } };
  let active = null;

  const pill = Object.assign(document.createElement('span'), { className: 'abg__hl' });
  pill.setAttribute('aria-hidden', 'true');
  const probe = Object.assign(document.createElement('span'), { className: 'abg__probe' });
  probe.setAttribute('aria-hidden', 'true');
  root.prepend(pill, probe);
  root.dataset.mode = mode;

  const radius = () => parseFloat(getComputedStyle(probe).borderTopLeftRadius) || 0;
  const paint = ([x, y, w, h, o]) => {
    const sx = Math.max(w, 0.01) / 100;
    const sy = Math.max(h, 0.01) / 100;
    const r = radius();
    pill.style.transform = `translate(${x}px, ${y}px) scale(${sx}, ${sy})`;
    pill.style.borderRadius = `${r / sx}px / ${r / sy}px`;
    pill.style.opacity = String(Math.min(1, Math.max(0, o)));
  };
  const motor = driver(paint);
  motor.motion(base);

  const rectOf = (item) => { const at = offsetIn(item, root) ?? [0, 0]; return [at[0], at[1], item.offsetWidth, item.offsetHeight]; };

  function set(id, silent = false) {
    if (id === active) return;
    active = id;
    for (const item of items) {
      item.dataset.checked = item.dataset.id === id ? 'true' : 'false';
      // Pressed is a state of buttons: a link marks where you are with `aria-current`, which the page owns.
      if (mode === 'click' && item.matches('button, [role="button"]')) item.setAttribute('aria-pressed', String(item.dataset.id === id));
    }
    const item = items.find((n) => n.dataset.id === id);
    const quick = reduced();
    motor.motion(quick ? quiet : base);
    if (!item) {
      motor.to([motor.now(0), motor.now(1), motor.now(2), motor.now(3), 0]);
    } else {
      const rect = rectOf(item);
      // Gone (or nearly): it appears in place on the item. Still there: it slides.
      if (motor.now(4) < 0.02 || quick) motor.snap(rect);
      motor.to([...rect, 1]);
    }
    root.dataset.active = id ?? '';
    if (!silent) {
      opts.onValueChange?.(id);
      root.dispatchEvent(new CustomEvent('animated-background:change', { detail: { value: id }, bubbles: true }));
    }
  }

  const listeners = [];
  const on = (el, type, fn, o) => { el.addEventListener(type, fn, o); listeners.push(() => el.removeEventListener(type, fn, o)); };
  for (const item of items) {
    const id = item.dataset.id;
    if (mode === 'hover') {
      on(item, 'pointerenter', (e) => { if (e.pointerType !== 'touch') set(id); });
      on(item, 'pointerleave', (e) => { if (e.pointerType !== 'touch') set(null); });
      on(item, 'pointerdown', (e) => { if (e.pointerType === 'touch') set(id); });
      on(item, 'focusin', () => { if (item.matches(':focus-visible')) set(id); });
      on(item, 'focusout', (e) => { if (!items.includes(e.relatedTarget?.closest?.('[data-id]'))) set(null); });
    } else {
      on(item, 'click', () => set(id));
    }
  }
  if (mode === 'hover') on(document, 'pointerdown', (e) => { if (e.pointerType === 'touch' && !root.contains(e.target)) set(null); });

  const watch = new ResizeObserver(() => {
    const item = items.find((n) => n.dataset.id === active);
    if (!item) return;
    const rect = rectOf(item);
    motor.snap(rect);
    motor.to([...rect, 1]);
  });
  watch.observe(root);
  for (const item of items) watch.observe(item);

  if (defaultValue !== null) {
    const item = items.find((n) => n.dataset.id === defaultValue);
    if (item) { const rect = rectOf(item); motor.snap(rect, 1); paint([...rect, 1]); set(defaultValue, true); }
  }

  const handle = {
    get value() { return active; },
    set: (id) => set(id),
    destroy() {
      handles.delete(root);
      motor.stop();
      watch.disconnect();
      for (const off of listeners) off();
      pill.remove();
      probe.remove();
      for (const item of items) { item.removeAttribute('data-checked'); item.removeAttribute('aria-pressed'); }
      delete root.dataset.active;
    },
  };
  handles.set(root, handle);
  return handle;
}

// Imported without a call to mount(), it mounts every marked root once the importing module has run.
if (typeof document !== 'undefined') queueMicrotask(() => { for (const el of document.querySelectorAll('[data-motion="animated-background"]')) mount(el); });
