// Confirm morph (Arc, `registry/components/confirm-morph`, MIT): a button for a destructive or important
// action that asks in place. The same pill turns into a question with Cancel and Confirm, then into a spinner,
// then into a result with Undo. Only its width moves (a spring: `morph` when it grows, `smooth` when it
// shrinks); every face sits at its natural width against the pill's leading edge and is revealed by the
// clip, so text never squeezes. The old face fades out in 120 ms; the parts of the new one arrive in reading
// order, 35 ms apart, each clearing a 4 px blur. Escape, a press outside or the timeout (paused while the
// pointer rests on the control or the tab is hidden) return it to rest.
//
// Port notes. The width is animated as in the original (the controls beside the pill follow it); the surface is
// `overflow: clip` and the rest of the page never reflows. Keyboard focus is an inset ring (the original shows it
// only through fill, which is not enough for the set's AA rule). Words are Spanish by default and come from
// `labels`. `data-*` attributes configure an auto-mounted root.
//
// Markup: a root `[data-motion="confirm-morph"]` (empty; the module fills it).
// mount(root, { label, icon (an SVG string), prompt, tone: 'danger' | 'neutral', confirmMode: 'press' | 'hold' |
//   'countdown', holdDuration (ms), countdown (s), confirmTimeout / resultTimeout (ms, 0 = off),
//   cancelOnOutsidePress, disabled, labels: { confirm, cancel, pending, done, error, retry, undo, undoing,
//   countdown, … }, onConfirm, onUndo, onCancel, onStateChange })
//   → { destroy, state, setState(state), setDisabled(bool) }. Emits `confirm-morph:state` ({ state }).
// `onConfirm` / `onUndo` may return a promise: the pending face shows while it runs and a rejection shows the error face.
import { reduced, uid } from '../core.js';
import { ARC, SPRINGS, Val, bezier, bezierFn, blur, curve, el, esc, ms, physical, svgIcon, ICONS } from './arc-kit.js';

const ARM_MS = 280; // a press this soon after the question appears is the tail of the press that opened it
const LABELS = {
  confirm: 'Eliminar', cancel: 'Cancelar', pending: 'Eliminando', done: 'Eliminado', error: 'No se pudo completar', retry: 'Reintentar',
  undo: 'Deshacer', undoing: 'Restaurando', countdown: 'Eliminando en', undone: 'Deshecho', cancelled: 'Cancelado', hold: 'Mantené presionado', holdTo: 'Mantené presionado para', seconds: 'segundos', available: 'disponible',
};
const handles = new WeakMap();
const NUMERIC = ['holdDuration', 'countdown', 'confirmTimeout', 'resultTimeout'];

const fromData = (root) => {
  const d = root.dataset;
  const o = {};
  for (const k of ['label', 'prompt', 'tone', 'confirmMode']) if (d[k] !== undefined) o[k] = d[k];
  for (const k of NUMERIC) if (d[k] !== undefined) o[k] = Number(d[k]);
  if (d.disabled !== undefined) o.disabled = true;
  return o;
};

export function mount(root, options = {}) {
  if (handles.has(root)) return handles.get(root);
  const o = {
    label: 'Eliminar', icon: svgIcon(ICONS.trash), tone: 'danger', confirmMode: 'press', holdDuration: 1000, countdown: 3, confirmTimeout: 6000, resultTimeout: 5000, cancelOnOutsidePress: true, disabled: false,
    ...fromData(root), ...options,
  };
  const L = { ...LABELS, ...o.labels };
  const id = uid('cm-');
  const promptId = `${id}-prompt`;
  const holdHintId = `${id}-hold`;
  const prompt = o.prompt ?? `¿${o.label}?`;

  let state = o.defaultState ?? 'idle';
  let working = 'confirm';
  let counting = false;
  let current = null; // the face on screen: { key, node }
  let fillNode = null;
  let askedAt = 0;
  let run = 0;
  let pendingFocus = false;
  let secondsShown = o.countdown;
  let digit = null;
  let ring = null;
  let leaving = new Set();
  const life = new AbortController();

  root.classList.add('cm');
  root.tabIndex = -1;
  const surface = el('div', 'cm-surface');
  const live = el('span', 'arc-sr', { role: 'status', 'aria-live': 'polite' });
  root.replaceChildren(surface, live);
  const say = (text) => { live.textContent = ''; live.textContent = text; };

  const faceKey = () => (state === 'confirming' && counting ? 'counting' : state);
  const attrs = () => {
    root.dataset.state = state;
    root.dataset.face = faceKey();
    root.dataset.tone = o.tone;
    root.dataset.mode = o.confirmMode;
    root.toggleAttribute('data-disabled', o.disabled);
    if (state === 'pending') root.setAttribute('aria-busy', 'true'); else root.removeAttribute('aria-busy');
  };

  // ── The shape: one pill whose width springs to whichever face is current. At rest it is auto. ──
  let auto = true;
  let target = 0;
  let flight = 0;
  const width = new Val(0, (w) => { surface.style.width = `${w}px`; });
  const setAuto = () => { auto = true; surface.style.width = ''; };
  const onFaceSize = (w) => {
    if (Math.abs(w - target) < 0.25) return;
    const from = target;
    target = w;
    if (!from || reduced()) { flight++; width.stop(); setAuto(); return; }
    const now = auto ? from : width.get();
    if (auto) { width.jump(from); auto = false; }
    const token = ++flight;
    width.to(w, w > now ? SPRINGS.morph : SPRINGS.smooth, { restDelta: 0.25 }).then(() => { if (token === flight) setAuto(); });
  };

  // ── The timeout runs as an invisible clock; a pointer resting on the control holds it, and so does a hidden tab. ──
  const drain = new Val(1);
  let clock = null;
  const holds = { hover: false, hidden: false };
  const syncClock = () => { if (clock) { if (holds.hover || holds.hidden) clock.pause(); else clock.play(); } };
  const stopClock = () => { drain.stop(); clock = null; };
  const startClock = () => {
    stopClock();
    const seconds = (state === 'confirming' && !counting ? o.confirmTimeout : state === 'done' || state === 'error' ? o.resultTimeout : 0) / 1000;
    if (!seconds) return;
    drain.jump(1);
    const c = drain.tween(0, seconds);
    clock = c;
    c.then((landed) => { if (landed && clock === c) { clock = null; if (state === 'confirming') cancel(); else toIdle(); } });
    syncClock();
  };
  document.addEventListener('visibilitychange', () => { holds.hidden = document.hidden; syncClock(); }, { signal: life.signal });
  // The listeners of the root go with `destroy()`, so a root that is mounted again does not answer twice.
  const listen = (type, fn) => root.addEventListener(type, fn, { signal: life.signal });
  listen('pointerenter', () => { holds.hover = true; syncClock(); });
  listen('pointerleave', () => { holds.hover = false; syncClock(); });
  listen('pointercancel', () => { holds.hover = false; syncClock(); });

  // ── Countdown: a short grace period after the answer, drawn as a draining ring and ticking seconds. ──
  const remaining = new Val(1, (v) => {
    ring?.setAttribute('stroke-dasharray', `${Math.max(0, v).toFixed(4)} 1`);
    showSeconds(Math.max(1, Math.ceil(v * o.countdown)));
  });
  const startCountdown = () => {
    remaining.jump(1);
    remaining.tween(0, o.countdown).then((landed) => { if (landed) perform('confirm'); });
  };

  // ── Hold: the confirm button fills with the danger colour from the left while pressed, and drains back if let go early. ──
  let holding = null;
  const hold = new Val(0, (v) => { if (fillNode) fillNode.style.clipPath = `inset(0 ${(1 - v) * 100}% 0 0 round 999px)`; });
  const startHold = () => {
    if (holding) return;
    const c = hold.tween(1, (o.holdDuration / 1000) * (1 - hold.get()));
    holding = c;
    c.then((landed) => { if (landed && holding === c) { holding = null; perform('confirm'); } });
  };
  const releaseHold = () => {
    if (!holding) return;
    holding = null;
    hold.stop();
    if (hold.get() < 1) {
      if (reduced()) hold.jump(0); else hold.to(0, physical({ visualDuration: 0.3, bounce: 0 }), { restDelta: 0.002, restSpeed: 0.01 });
      say(`${L.holdTo} ${L.confirm.toLowerCase()}`);
    }
  };

  // ── Faces ──
  const part = (html, extra = '') => `<span class="cm-part ${extra}">${html}</span>`;
  const status = (icon, text, extra = '') => part(`${icon}<span class="cm-status-text">${text}</span>`, `cm-status ${extra}`);
  const spinner = () => svgIcon(ICONS.loader, 16, 'cm-spinner');
  const check = () => `<svg class="cm-check" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle class="cm-check-disc" cx="9" cy="9" r="8"/><path class="cm-check-tick" d="M5.6 9.3 7.8 11.4 12.4 6.7" pathLength="1" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ringSvg = () => `<svg class="cm-ring" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle class="cm-ring-track" cx="8" cy="8" r="6.25" stroke-width="1.75"/><circle class="cm-ring-fill" cx="8" cy="8" r="6.25" pathLength="1" stroke-dasharray="1 1" stroke-width="1.75" stroke-linecap="round" transform="rotate(-90 8 8)"/></svg>`;

  const faceHtml = (key) => {
    switch (key) {
      case 'confirming': {
        const confirmButton = o.confirmMode === 'hold'
          ? `<button type="button" class="cm-confirm" data-autofocus data-action="hold" aria-describedby="${holdHintId}"><span>${esc(L.confirm)}</span><span class="cm-fill" aria-hidden="true"><span>${esc(L.confirm)}</span></span></button>`
          : `<button type="button" class="cm-confirm" data-autofocus data-action="confirm">${esc(L.confirm)}</button>`;
        return `${part(`<span id="${promptId}">${esc(prompt)}</span>`, 'cm-prompt')}${part(`<button type="button" class="cm-secondary" data-action="cancel">${esc(L.cancel)}</button>`)}${part(confirmButton)}${o.confirmMode === 'hold' ? `<span id="${holdHintId}" class="arc-sr">${esc(L.hold)}</span>` : ''}`;
      }
      case 'counting':
        return `${status(ringSvg(), `${esc(L.countdown)} <span class="cm-seconds"><span class="cm-digit">${o.countdown}</span></span>`)}${part(`<button type="button" class="cm-secondary" data-action="cancel">${esc(L.cancel)}</button>`)}`;
      case 'pending':
        return status(spinner(), esc(working === 'undo' ? L.undoing : L.pending));
      case 'done':
        return `${status(check(), esc(L.done))}${o.onUndo ? part(`<button type="button" class="cm-secondary" data-autofocus data-action="undo">${esc(L.undo)}</button>`) : ''}`;
      case 'error':
        return `${status(svgIcon(ICONS.alert, 16, 'cm-alert'), esc(L.error))}${part(`<button type="button" class="cm-secondary" data-autofocus data-action="retry">${esc(L.retry)}</button>`)}`;
      default:
        return part(`<button type="button" class="cm-trigger" data-autofocus data-action="open"${o.disabled ? ' disabled' : ''}>${o.icon ? `<span class="cm-icon" aria-hidden="true">${o.icon}</span>` : ''}<span>${esc(o.label)}</span></button>`);
    }
  };

  const enterParts = (node) => {
    if (reduced()) { node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: bezier('standard') }); return; }
    [...node.querySelectorAll(':scope > .cm-part')].forEach((p, i) => {
      p.animate([{ opacity: 0, filter: blur(ARC.blur.soft) }, { opacity: 1, filter: 'blur(0px)' }], { duration: 260, delay: ms(0.05 + i * ARC.stagger.item), easing: bezier('enter'), fill: 'backwards' });
    });
  };
  const celebrate = (node) => {
    if (reduced()) return;
    const disc = node.querySelector('.cm-check-disc');
    const spring = curve(SPRINGS.snappy);
    disc?.animate([{ scale: 0.5 }, { scale: 1 }], { duration: spring.duration, easing: spring.easing, fill: 'backwards' });
    disc?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, fill: 'backwards' });
    node.querySelector('.cm-check-tick')?.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 300, delay: 140, easing: bezier('enter'), fill: 'backwards' });
  };
  const leave = (face) => {
    face.node.setAttribute('inert', '');
    face.node.dataset.leaving = '';
    face.observer?.disconnect();
    leaving.add(face);
    const a = face.node.animate(reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: blur(ARC.blur.subtle) }], { duration: reduced() ? 100 : ms(ARC.duration.instant), easing: bezier('standard'), fill: 'forwards' });
    a.finished.then(() => { face.node.remove(); leaving.delete(face); }, () => { face.node.remove(); leaving.delete(face); });
  };

  const showSeconds = (n) => {
    const box = current?.node.querySelector('.cm-seconds');
    if (!box || n === secondsShown) return;
    secondsShown = n;
    const old = digit;
    digit = el('span', 'cm-digit', {}, String(n));
    box.append(digit);
    const isReduced = reduced();
    digit.animate(isReduced ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(6px)', filter: blur(ARC.blur.subtle) }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: 220, easing: bezier('enter'), fill: 'backwards' });
    if (old) {
      old.animate(isReduced ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none', filter: 'blur(0px)' }, { opacity: 0, transform: 'translateY(-6px)', filter: blur(ARC.blur.subtle) }], { duration: 220, easing: bezier('enter'), fill: 'forwards' }).finished.then(() => old.remove(), () => old.remove());
    }
  };

  const build = (key, initial) => {
    const node = el('div', 'cm-face', { 'data-face': key }, faceHtml(key));
    if (key === 'confirming') { node.setAttribute('role', 'group'); node.setAttribute('aria-labelledby', promptId); }
    fillNode = key === 'confirming' ? node.querySelector('.cm-fill') : null;
    ring = key === 'counting' ? node.querySelector('.cm-ring-fill') : null;
    digit = key === 'counting' ? node.querySelector('.cm-digit') : null;
    if (key === 'counting') secondsShown = o.countdown;
    surface.append(node);
    const face = { key, node, observer: null };
    onFaceSize(node.getBoundingClientRect().width);
    if (typeof ResizeObserver !== 'undefined') {
      face.observer = new ResizeObserver(() => onFaceSize(node.getBoundingClientRect().width));
      face.observer.observe(node);
    }
    if (!initial) { enterParts(node); if (key === 'done') celebrate(node); }
    if (fillNode) hold.jump(0);
    return face;
  };

  // Focus follows the control between faces, but only when it was already inside; a timeout never steals focus from elsewhere.
  const keepFocus = () => { pendingFocus = root.contains(document.activeElement) || document.activeElement === document.body; };

  let outside = null;
  const sync = (initial = false) => {
    attrs();
    const key = faceKey();
    if (!current || current.key !== key) {
      if (current) leave(current);
      current = build(key, initial);
      if (key !== 'confirming') { holding = null; hold.stop(); hold.jump(0); }
      if (key === 'counting') startCountdown(); else remaining.stop();
      if (pendingFocus) {
        pendingFocus = false;
        (current.node.querySelector('[data-autofocus]:not(:disabled)') ?? root).focus({ preventScroll: true });
      }
      startClock();
    }
    // An outside press answers the question with no.
    if (state === 'confirming' && o.cancelOnOutsidePress && !outside) {
      outside = (event) => { if (!root.contains(event.target)) cancel(); };
      document.addEventListener('pointerdown', outside);
    } else if ((state !== 'confirming' || !o.cancelOnOutsidePress) && outside) {
      document.removeEventListener('pointerdown', outside);
      outside = null;
    }
  };

  const go = (next) => {
    if (next !== 'confirming') counting = false;
    if (next === state) { sync(); return; }
    keepFocus();
    if (next === 'confirming') askedAt = performance.now();
    state = next;
    o.onStateChange?.(next);
    root.dispatchEvent(new CustomEvent('confirm-morph:state', { detail: { state: next }, bubbles: true }));
    sync();
  };
  const toIdle = () => { run++; go('idle'); };
  const cancel = () => { o.onCancel?.(); toIdle(); say(L.cancelled); };

  async function perform(kind) {
    const handler = kind === 'confirm' ? o.onConfirm : o.onUndo;
    const token = ++run;
    working = kind;
    counting = false;
    let result;
    try { result = handler?.(); } catch { go('error'); say(L.error); return; }
    if (result && typeof result.then === 'function') {
      go('pending');
      say(kind === 'confirm' ? L.pending : L.undoing);
      try { await result; } catch {
        if (token !== run) return;
        go('error');
        say(L.error);
        return;
      }
      if (token !== run) return;
    }
    if (kind === 'undo') { go('idle'); say(L.undone); return; }
    go('done');
    say(o.onUndo ? `${L.done}. ${L.undo} ${L.available}.` : L.done);
  }

  const answer = () => {
    if (performance.now() - askedAt < ARM_MS) return;
    if (o.confirmMode === 'countdown') {
      keepFocus();
      counting = true;
      say(`${L.countdown} ${o.countdown} ${L.seconds}`);
      sync();
      return;
    }
    perform('confirm');
  };

  // ── Events ──
  listen('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || !root.contains(button)) return;
    const action = button.dataset.action;
    if (action === 'open') { say(prompt); go('confirming'); } else if (action === 'cancel') cancel();
    else if (action === 'confirm') answer();
    else if (action === 'undo') perform('undo');
    else if (action === 'retry') perform(working);
  });
  listen('keydown', (event) => {
    if (event.key === 'Escape') {
      if (state === 'confirming') { event.preventDefault(); event.stopPropagation(); cancel(); } else if (state === 'done' || state === 'error') { event.preventDefault(); event.stopPropagation(); toIdle(); }
      return;
    }
    // Enter answers yes from anywhere in the question except a button of its own (Cancel keeps meaning Cancel).
    if (event.key === 'Enter' && state === 'confirming' && !event.repeat && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      if (counting) perform('confirm'); else if (o.confirmMode !== 'hold') answer();
      return;
    }
    const holdButton = event.target.closest?.('button[data-action="hold"]');
    if (holdButton && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); if (!event.repeat) startHold(); return; }
    if (event.target.closest?.('button[data-action="confirm"]') && event.repeat) event.preventDefault();
  });
  listen('keyup', (event) => {
    if (event.target.closest?.('button[data-action="hold"]') && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); releaseHold(); }
  });
  listen('pointerdown', (event) => {
    const b = event.target.closest?.('button[data-action="hold"]');
    if (!b || event.button !== 0) return;
    b.setPointerCapture?.(event.pointerId);
    startHold();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(type, (event) => { if (event.target.closest?.('button[data-action="hold"]')) releaseHold(); });
  listen('focusout', (event) => { if (event.target.closest?.('button[data-action="hold"]')) releaseHold(); });
  listen('contextmenu', (event) => { if (o.confirmMode === 'hold' && event.target.closest?.('button[data-action="hold"]')) event.preventDefault(); });

  sync(true);
  const handle = {
    get state() { return state; },
    setState(next) { go(next); },
    setDisabled(value) { o.disabled = value; const t = root.querySelector('.cm-trigger'); if (t) t.disabled = value; attrs(); },
    destroy() {
      handles.delete(root);
      life.abort();
      width.stop(); drain.stop(); remaining.stop(); hold.stop();
      if (outside) document.removeEventListener('pointerdown', outside);
      for (const f of leaving) f.observer?.disconnect();
      current?.observer?.disconnect();
      root.replaceChildren();
      root.classList.remove('cm');
      root.removeAttribute('tabindex');
      for (const a of ['data-state', 'data-face', 'data-tone', 'data-mode', 'data-disabled', 'aria-busy']) root.removeAttribute(a);
    },
  };
  handles.set(root, handle);
  return handle;
}

if (typeof document !== 'undefined') queueMicrotask(() => { for (const node of document.querySelectorAll('[data-motion="confirm-morph"]')) mount(node); });
