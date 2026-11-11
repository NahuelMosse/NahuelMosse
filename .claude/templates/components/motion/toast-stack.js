// Toast stack, ported from Arc (registry/components/toast-stack/toast-stack.tsx, MIT). New toasts rise from the bottom edge,
// older ones tuck behind (14 px peek, 5 % smaller per step), and hovering or focusing the stack fans it out into a list
// (12 px gap). Every toast's geometry lives in values (y, scale, height, opacity) retargeted on `smooth` springs, or on
// `morph` when the stack opens or closes, so rapid toasts and hover changes never queue. Reusing an id updates a toast in
// place: the icon turns into the new one, the lines rise from a blur, the height springs, and an Undo can fold away and
// leave only the result. Toasts pause while the stack is open, a toast is dragged or the tab is hidden; warnings and errors
// last 1.6 times longer; a toast with an action lasts at least 10 s (WCAG 2.2.1). Swipe right to dismiss (left resists
// like an overscroll), Escape dismisses the focused one, Alt+T moves focus into the stack, and a keyboard user whose
// toast leaves lands on the next one. The region is a named, polite live region. Reduced motion: fades of 160 ms.
import { messages, reduced, scope } from '../core.js';
import { EASE, SPRINGS, TOKENS, physical, springCurve, svgNode, swapper, value } from './arc-shared.js';
import { define, node } from './mu-shared.js';

const PEEK = 14;
const GAP = 12;
const STEP = 0.05;
const BORDER = 2;
const SWIPE_FADE = 280;
const ACTION_MIN = 10_000;
const TYPES = ['success', 'info', 'warning', 'error', 'loading'];
const PATHS = {
  success: '<circle cx="9" cy="9" r="7.25"/><path d="M5.75 9.25l2.25 2.25 4.25-4.5"/>',
  info: '<circle cx="9" cy="9" r="7.25"/><path d="M9 8.25v4M9 5.75v.01"/>',
  warning: '<path d="M7.7 2.9L1.9 13.1a1.5 1.5 0 0 0 1.3 2.25h11.6a1.5 1.5 0 0 0 1.3-2.25L10.3 2.9a1.5 1.5 0 0 0-2.6 0z"/><path d="M9 7v3.25M9 12.75v.01"/>',
  error: '<circle cx="9" cy="9" r="7.25"/><path d="M6.5 6.5l5 5M11.5 6.5l-5 5"/>',
  close: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
};
const icon = (name, size = 18) => {
  const s = svgNode('svg', { viewBox: name === 'close' ? '0 0 16 16' : '0 0 18 18', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' });
  s.innerHTML = PATHS[name];
  return s;
};
// Where a release at this velocity would come to rest, using a fast scroll deceleration.
const project = (velocity) => ((velocity / 1000) * 0.99) / (1 - 0.99);
// Resistance past an edge: the pull keeps moving, but less and less, like an overscroll.
const rubberBand = (distance, dimension) => (1 - 1 / ((distance * 0.55) / dimension + 1)) * dimension;
const focusVisible = (n) => { try { return n.matches(':focus-visible'); } catch { return true; } };
const SMOOTH = springCurve(SPRINGS.smooth);
const SNAPPY = springCurve(SPRINGS.snappy);
const KEYS = ['y', 'scale', 'height', 'opacity', 'content', 'x'];

export const mount = define('toast-stack', (host, opts) => {
  const position = opts.position ?? host.dataset.position ?? 'bottom-right';
  if (!['bottom-right', 'bottom-center', 'bottom-left'].includes(position)) throw new RangeError(`toast-stack: unknown position "${position}"`);
  const contained = opts.contained ?? (host !== document.body && host !== document.documentElement);
  const visibleToasts = opts.visibleToasts ?? 3;
  const hotkey = opts.hotkey ?? true;
  const base = opts.duration ?? 5000;
  const limit = opts.limit ?? 12;
  if (!(visibleToasts >= 1) || !(limit >= 1) || !(base > 0)) throw new RangeError('toast-stack: visibleToasts, limit and duration are positive');
  const words = {
    region: opts.label ?? messages.notifications,
    dismiss: messages.dismiss,
    types: { success: 'Success', info: 'Info', warning: 'Warning', error: 'Error', loading: 'In progress' },
    ...opts.labels,
  };
  const life = scope();

  const viewport = node('section', 'ar-toast');
  viewport.dataset.position = position;
  if (contained) viewport.dataset.contained = '';
  viewport.setAttribute('aria-label', hotkey ? `${words.region} (Alt+T)` : words.region);
  viewport.setAttribute('aria-live', 'polite');
  viewport.setAttribute('aria-relevant', 'additions text');
  viewport.setAttribute('aria-atomic', 'false');
  const list = node('ol', 'ar-toast__list');
  viewport.append(list);
  host.append(viewport);

  let toasts = [];
  let seq = 0;
  let hovered = false;
  let focused = false;
  let tapped = false;
  let dragging = false;
  let returnFocus = null;
  const heights = new Map();

  const durationFor = (type, action) => {
    if (type === 'loading') return Infinity;
    const d = type === 'warning' || type === 'error' ? base * 1.6 : base;
    return action ? Math.max(d, ACTION_MIN) : d;
  };
  const expanded = () => toasts.length > 0 && (hovered || focused || tapped);
  const paused = () => expanded() || dragging || document.hidden;
  const stopAll = (t) => { for (const k of KEYS) t.view[k].stop(); };

  // Closed, tucked toasts take the front toast's height so their edges line up; open, each takes its own and they stack
  // with a gap. The list is the hover target and is sized to cover the gaps.
  const targets = () => {
    const open = expanded();
    const front = toasts.length ? heights.get(toasts[0].id) ?? 0 : 0;
    const tops = toasts.reduce((sum, t, i) => [...sum, sum[i] + (i < visibleToasts ? (heights.get(t.id) ?? 0) + GAP : 0)], [0]);
    const out = toasts.map((t, i) => {
      const visible = i < visibleToasts;
      const depth = Math.min(i, visibleToasts);
      return open
        ? { y: -tops[i], scale: 1, height: heights.get(t.id) ?? 0, opacity: visible ? 1 : 0, content: 1 }
        : { y: -PEEK * depth, scale: 1 - STEP * depth, height: i === 0 ? heights.get(t.id) ?? 0 : front, opacity: visible ? 1 : 0, content: i === 0 ? 1 : 0 };
    });
    const listHeight = !toasts.length ? 0 : open ? tops[toasts.length] - GAP : front + PEEK * (Math.min(toasts.length, visibleToasts) - 1);
    return { out, listHeight };
  };

  // Every stack change retargets the running springs from wherever they are.
  const retarget = (t, target, isOpen) => {
    const v = t.view;
    if (target.height <= 0) return;
    const entering = v.applied === null;
    const morph = !entering && v.applied !== isOpen;
    v.applied = isOpen;
    if (reduced()) {
      v.y.jump(target.y); v.scale.jump(target.scale); v.height.jump(target.height);
      v.opacity.to(target.opacity, { duration: TOKENS.duration.fast, ease: 'standard' });
      v.content.to(target.content, { duration: TOKENS.duration.fast, ease: 'standard' });
      return;
    }
    if (entering) { v.y.jump(target.y + target.height); v.scale.jump(target.scale); v.height.jump(target.height); v.content.jump(target.content); v.opacity.jump(0); }
    const spring = morph ? SPRINGS.morph : SPRINGS.smooth;
    v.y.to(target.y, { spring });
    v.scale.to(target.scale, { spring, rest: 0.0005 });
    if (!entering) v.height.to(target.height, { spring });
    v.opacity.to(target.opacity, entering ? { duration: TOKENS.duration.standard, ease: 'enter' } : { duration: TOKENS.duration.fast, ease: 'standard' });
    v.content.to(target.content, { duration: TOKENS.duration.fast, ease: 'standard' });
  };

  const layout = () => {
    const { out, listHeight } = targets();
    const isOpen = expanded();
    toasts.forEach((t, i) => {
      t.el.dataset.front = String(i === 0);
      t.el.dataset.expanded = String(isOpen);
      t.el.inert = i >= visibleToasts;
      retarget(t, out[i], isOpen);
    });
    list.style.height = `${listHeight}px`;
    list.dataset.expanded = String(isOpen);
    clocks();
  };

  // One clock per toast; pausing keeps whatever time is left, an update restarts it.
  const clocks = () => {
    const stop = paused();
    for (const t of toasts) {
      const run = !stop && Number.isFinite(t.remaining) && t.duration > 0;
      if (run && !t.timer) { t.started = performance.now(); t.timer = setTimeout(() => dismiss(t.id), Math.max(t.remaining, 0)); }
      else if (!run && t.timer) { clearTimeout(t.timer); t.timer = 0; t.remaining -= performance.now() - t.started; }
    }
  };

  const measure = (t) => {
    const h = t.content.offsetHeight + BORDER;
    if (heights.get(t.id) === h) return;
    heights.set(t.id, h);
    layout();
  };

  // ── What a toast shows ──
  const glyphOf = (type) => {
    const g = node('span', 'ar-toast__glyph');
    if (type === 'loading') g.append(node('span', 'ar-toast__spinner')); else g.append(icon(type));
    return g;
  };
  // The old glyph shrinks into a blur while the new one grows out of it.
  const showIcon = (t, instant) => {
    const holder = t.iconEl;
    holder.dataset.type = t.type;
    const old = holder.firstElementChild;
    const next = glyphOf(t.type);
    holder.append(next);
    if (old) {
      old.setAttribute('aria-hidden', 'true');
      Object.assign(old.style, { position: 'absolute', inset: '0' });
      const out = reduced()
        ? old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' })
        : old.animate([{ opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }, { opacity: 0, transform: 'scale(.6)', filter: `blur(${TOKENS.blur.subtle}px)` }], { duration: 160, easing: EASE.standard, fill: 'forwards' });
      out.onfinish = () => old.remove();
      out.oncancel = () => old.remove();
    }
    if (instant) return;
    if (reduced()) { next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); return; }
    next.animate([{ opacity: 0, transform: 'scale(.6)', filter: `blur(${TOKENS.blur.subtle}px)` }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }], { duration: SNAPPY.duration, easing: SNAPPY.easing });
  };
  // The action folds its width in and away, so the copy widens instead of snapping.
  const foldIn = (slot) => {
    slot.style.width = '';
    const w = slot.offsetWidth;
    slot.dataset.moving = 'true';
    const done = () => { delete slot.dataset.moving; };
    if (reduced()) { slot.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }).onfinish = done; return; }
    slot.animate({ width: ['0px', `${w}px`] }, { duration: SMOOTH.duration, easing: SMOOTH.easing }).onfinish = done;
    slot.animate({ opacity: [0, 1] }, { duration: TOKENS.duration.fast * 1000, easing: EASE.standard });
  };
  const foldAway = (slot) => {
    slot.dataset.moving = 'true';
    slot.inert = true;
    const w = slot.offsetWidth;
    const out = reduced()
      ? slot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' })
      : slot.animate({ width: [`${w}px`, '0px'], opacity: [1, 0] }, { duration: SMOOTH.duration, easing: SMOOTH.easing, fill: 'forwards' });
    out.onfinish = () => slot.remove();
    out.oncancel = () => slot.remove();
  };
  const setAction = (t, action) => {
    if (action && !t.actionSlot) {
      const slot = node('div', 'ar-toast__action-slot');
      const b = node('button', 'ar-toast__action');
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', (e) => runAction(t, e.currentTarget));
      slot.append(b);
      t.content.insertBefore(slot, t.closeEl);
      t.actionSlot = slot;
      t.actionBtn = b;
      if (!t.fresh) foldIn(slot);
    } else if (!action && t.actionSlot) {
      foldAway(t.actionSlot);
      t.actionSlot = null;
      t.actionBtn = null;
    } else if (action) t.actionBtn.textContent = action.label;
  };
  const render = (t, changed) => {
    const quiet = t.fresh;
    if (quiet || changed.type) { t.srType.textContent = `${words.types[t.type]}: `; showIcon(t, quiet); }
    if (quiet || changed.title) t.titleSwap.set(t.title, 1, { instant: quiet });
    if (quiet || changed.description) t.descSwap.set(t.description ?? null, 1, { instant: quiet });
    if (quiet || changed.action) setAction(t, t.action);
  };

  // Keyboard users land on the next toast; with none left they return to where they were before entering the stack.
  const hand = (leaving, keyboard) => {
    const items = [...list.children];
    const at = items.indexOf(leaving);
    const candidates = items.filter((n) => n !== leaving && !n.hasAttribute('inert'));
    const next = candidates.find((n) => items.indexOf(n) > at) ?? candidates.at(-1);
    const button = next?.querySelector('button');
    if (keyboard && button) button.focus();
    else if (keyboard && returnFocus?.isConnected) returnFocus.focus();
    else document.activeElement?.blur?.();
  };
  const runAction = (t, button) => {
    if (!t.action) return;
    const keyboard = focusVisible(button);
    const version = t.version;
    t.action.onClick?.(t.id);
    if (t.version === version) dismiss(t.id);
    // An action that updates its toast usually folds itself away; keyboard focus lands on the close button.
    else if (keyboard && !t.action && t.closeEl.isConnected) t.closeEl.focus();
  };

  // ── Swipe: right follows the finger 1:1, left resists; a throw past 40 % of the width dismisses ──
  const gesture = (t) => {
    const card = t.card;
    let g = null;
    let pointerType = 'mouse';
    let suppress = false;
    card.addEventListener('pointerdown', (e) => {
      pointerType = e.pointerType;
      suppress = false;
      if (e.button !== 0 || t.leaving || e.target.closest('button, a')) return;
      t.view.x.stop();
      g = { id: e.pointerId, sx: e.clientX, sy: e.clientY, origin: t.view.x.get(), active: false, samples: [] };
    }, { signal: life.signal });
    card.addEventListener('pointermove', (e) => {
      if (!g || g.id !== e.pointerId) return;
      if (!g.active) {
        const dx = e.clientX - g.sx;
        const dy = e.clientY - g.sy;
        if (Math.hypot(dx, dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) { g = null; return; }
        g.active = true;
        g.sx = e.clientX;
        suppress = true;
        card.setPointerCapture(e.pointerId);
        card.dataset.dragging = '';
        getSelection()?.removeAllRanges();
        dragging = true;
        clocks();
      }
      const raw = g.origin + e.clientX - g.sx;
      t.view.x.jump(raw >= 0 ? raw : -rubberBand(-raw, card.offsetWidth));
      g.samples.push({ t: e.timeStamp, x: raw });
      while (g.samples.length > 2 && e.timeStamp - g.samples[0].t > 100) g.samples.shift();
    }, { signal: life.signal });
    const end = (e, cancelled) => {
      if (!g || g.id !== e.pointerId) return;
      const cur = g;
      g = null;
      if (!cur.active) return;
      delete card.dataset.dragging;
      dragging = false;
      const first = cur.samples[0];
      const last = cur.samples.at(-1);
      // A finger that stopped before lifting carries no throw.
      const velocity = cancelled || !first || !last || last.t === first.t || e.timeStamp - last.t > 60 ? 0 : ((last.x - first.x) / (last.t - first.t)) * 1000;
      const width = card.offsetWidth;
      const offset = t.view.x.get();
      if (!cancelled && offset > 0 && velocity > -200 && offset + project(velocity) > width * 0.4) {
        t.swiped = true;
        if (!reduced()) t.view.x.to(width + 40, { spring: physical(0.32, 0), velocity: Math.max(velocity, 0) });
        dismiss(t.id);
        return;
      }
      clocks();
      if (reduced()) t.view.x.jump(0);
      else t.view.x.to(0, { spring: SPRINGS.snappy, velocity: offset < 0 ? velocity * 0.3 : velocity });
    };
    card.addEventListener('pointerup', (e) => end(e, false), { signal: life.signal });
    card.addEventListener('pointercancel', (e) => end(e, true), { signal: life.signal });
    card.addEventListener('click', (e) => {
      if (suppress) { suppress = false; return; }
      // Touch has no hover, so a tap on the card opens or closes the stack instead.
      if (pointerType !== 'mouse' && !e.target.closest('button, a')) { tapped = !tapped; layout(); }
    }, { signal: life.signal });
  };

  const build = (t) => {
    const li = node('li', 'ar-toast__item');
    const card = node('div', 'ar-toast__card');
    const content = node('div', 'ar-toast__content');
    const iconEl = node('span', 'ar-toast__icon', { decorative: true });
    const copy = node('div', 'ar-toast__copy');
    const srType = node('span', 'ar-sr');
    const titleHost = node('span', 'ar-toast__title');
    const descHost = node('span', 'ar-toast__description-host');
    const closeEl = node('button', 'ar-toast__close');
    closeEl.type = 'button';
    closeEl.setAttribute('aria-label', words.dismiss);
    closeEl.append(icon('close', 16));
    closeEl.addEventListener('click', () => dismiss(t.id));
    copy.append(srType, titleHost, descHost);
    content.append(iconEl, copy, closeEl);
    card.append(content);
    li.append(card);
    li.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); dismiss(t.id); } });
    li.style.zIndex = String(t.seq);
    // y, scale, height and opacity are written to the li together.
    const view = { applied: null };
    const paint = () => {
      li.style.transform = `translate3d(0, ${view.y.get()}px, 0) scale(${view.scale.get()})`;
      li.style.height = `${view.height.get()}px`;
      li.style.opacity = String(view.opacity.get());
    };
    view.y = value(0, paint);
    view.scale = value(1, paint);
    view.height = value(0, paint);
    view.opacity = value(0, paint);
    view.content = value(1, (o) => { content.style.opacity = String(o); });
    view.x = value(0, (x) => { card.style.transform = `translateX(${x}px)`; card.style.opacity = String(x > 0 ? 1 - Math.min(x / SWIPE_FADE, 1) * 0.75 : 1); });
    Object.assign(t, { el: li, card, content, iconEl, srType, closeEl, view, titleSwap: swapper(titleHost, { className: 'ar-toast__line' }), descSwap: swapper(descHost, { className: 'ar-toast__description' }), actionSlot: null, actionBtn: null });
    gesture(t);
  };

  // ── The public surface ──
  const update = (id, patch) => {
    const t = toasts.find((x) => x.id === id);
    if (!t) return;
    if (patch.type !== undefined && !TYPES.includes(patch.type)) throw new RangeError(`toast-stack: unknown type "${patch.type}"`);
    const changed = {};
    for (const k of ['type', 'title', 'description', 'action']) if (k in patch && patch[k] !== t[k] && !(k === 'type' && patch.type === undefined)) { t[k] = patch[k]; changed[k] = true; }
    t.duration = patch.duration ?? durationFor(t.type, t.action);
    t.version += 1;
    t.remaining = t.duration;
    clearTimeout(t.timer);
    t.timer = 0;
    render(t, changed);
    clocks();
  };
  const leave = (t) => {
    if (t.leaving) return;
    t.leaving = true;
    clearTimeout(t.timer);
    t.timer = 0;
    ro.unobserve(t.content);
    const li = t.el;
    const active = document.activeElement;
    if (active instanceof HTMLElement && li.contains(active)) hand(li, focusVisible(active));
    li.inert = true;
    const v = t.view;
    const done = () => { stopAll(t); li.remove(); heights.delete(t.id); layout(); };
    if (reduced()) { v.opacity.to(0, { duration: TOKENS.duration.fast, ease: 'standard', done }); return; }
    // A closed toast sinks toward its edge; a thrown one keeps flying.
    if (!t.swiped) { v.y.to(v.y.get() + 10, { spring: SPRINGS.smooth }); v.scale.to(v.scale.get() * 0.96, { spring: SPRINGS.smooth }); }
    v.opacity.to(0, { duration: t.swiped ? 0.22 : TOKENS.duration.exit, ease: 'standard', done });
  };
  const dismiss = (id) => {
    if (id === undefined) { const all = toasts; toasts = []; tapped = false; for (const t of all) leave(t); layout(); return; }
    const t = toasts.find((x) => x.id === id);
    if (!t) return;
    toasts = toasts.filter((x) => x !== t);
    if (!toasts.length) tapped = false;
    leave(t);
    layout();
  };
  const toast = (options) => {
    if (!options || typeof options.title !== 'string' || !options.title) throw new RangeError('toast-stack: a toast needs a title');
    if (options.type !== undefined && !TYPES.includes(options.type)) throw new RangeError(`toast-stack: unknown type "${options.type}"`);
    if (options.action !== undefined && (typeof options.action.label !== 'string' || !options.action.label)) throw new RangeError('toast-stack: an action needs a label');
    const { id: given, ...rest } = options;
    if (given && toasts.some((t) => t.id === given)) { update(given, rest); return given; }
    seq += 1;
    const type = rest.type ?? 'info';
    const t = { id: given ?? `toast-${seq}`, type, title: rest.title, description: rest.description, action: rest.action, seq, version: 0, timer: 0, started: 0, fresh: true, leaving: false, swiped: false };
    t.duration = rest.duration ?? durationFor(type, rest.action);
    t.remaining = t.duration;
    build(t);
    toasts = [t, ...toasts];
    list.prepend(t.el);
    render(t, {});
    measure(t);
    t.fresh = false;
    ro.observe(t.content);
    const over = toasts.slice(limit);
    toasts = toasts.slice(0, limit);
    for (const o of over) leave(o);
    layout();
    return t.id;
  };

  const ro = life.watch(new ResizeObserver((entries) => { for (const e of entries) { const t = toasts.find((x) => x.content === e.target); if (t) measure(t); } }));

  // ── The stack as a whole: hover, focus, tap and the hotkey ──
  list.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hovered = true; layout(); } }, { signal: life.signal });
  list.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !hovered) { hovered = true; layout(); } }, { signal: life.signal });
  list.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { hovered = false; layout(); } }, { signal: life.signal });
  viewport.addEventListener('focusin', (e) => {
    const from = e.relatedTarget;
    if (!(from instanceof Node) || !viewport.contains(from)) returnFocus = from instanceof HTMLElement ? from : null;
    // Only keyboard focus opens the stack; a mouse click on a button should not pin it open.
    if (focusVisible(e.target)) { focused = true; layout(); }
  }, { signal: life.signal });
  viewport.addEventListener('focusout', (e) => { if (!(e.relatedTarget instanceof Node) || !viewport.contains(e.relatedTarget)) { focused = false; layout(); } }, { signal: life.signal });
  document.addEventListener('pointerdown', (e) => { if (tapped && !viewport.contains(e.target)) { tapped = false; layout(); } }, { signal: life.signal });
  document.addEventListener('visibilitychange', clocks, { signal: life.signal });
  if (hotkey) {
    document.addEventListener('keydown', (e) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.code !== 'KeyT') return;
      const target = list.querySelector(':scope > li:not([inert]) button');
      if (!target) return;
      e.preventDefault();
      // Browsers skip the focus ring after a modifier shortcut, so the hotkey asks for it and opens the stack itself.
      target.focus({ focusVisible: true });
      focused = true;
      layout();
    }, { signal: life.signal });
  }

  return {
    toast,
    update,
    dismiss,
    get count() { return toasts.length; },
    get region() { return viewport; },
    destroy() {
      for (const t of toasts) { clearTimeout(t.timer); stopAll(t); }
      toasts = [];
      life.destroy();
      viewport.remove();
    },
  };
});
