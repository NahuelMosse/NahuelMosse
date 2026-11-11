// Draw signature, ported from Watermelon UI (animated-components/draw-signature, MIT, Copyright (c) 2025-present Watermelon Contributors).
// A three-step control: a "start signing" button turns into a signature pad (a dashed frame, a canvas, a clear button, a
// close button and a "finish" button), and finishing turns it into a "signed" chip with a pen to sign again. The frame grows
// and shrinks to its content on a spring (bounce .15, duration .7 s) and the previous step leaves up and to the left.
// Port notes. The original measures with `react-use-measure` and shares elements with `layoutId`; here the frame's width and
// height are animated with WAAPI between the sizes measured before and after the step, on the same spring as a `linear()`
// curve. Drawing uses pointer events (mouse, touch, pen; `touch-action: none` on the canvas), the canvas is scaled by the
// device pixel ratio, a stroke is a smoothed quadratic path, and the pen color is `--text`. Finish stays disabled until
// something is drawn, and the signature is kept when the pad is reopened. A signature cannot be drawn with the keyboard:
// the pad says so and keeps the clear and close buttons reachable; where the signature is legally required, offer a typed
// alternative next to it. Reduced motion changes step without the size animation.
//
//   <div data-motion="draw-signature"></div>
//   mount(el, { startLabel, finishLabel, doneLabel, step, onFinish(dataUrl), onClear, onStepChange })
//     →  { step, clear(), toDataURL(), destroy }
import { reduced, scope } from '../core.js';
import { define, node, springRun } from './mu-shared.js';

const ICON = {
  pen: '<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
  redo: '<path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4h4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>',
};
const svg = (name, size) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICON[name]}</svg>`;
const button = (className, label, html) => {
  const b = node('button', className, { html });
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  return b;
};

export const mount = define('draw-signature', (el, opts) => {
  const life = scope();
  const labels = { start: opts.startLabel ?? 'Empezar a firmar', finish: opts.finishLabel ?? 'Terminar firma', done: opts.doneLabel ?? 'Firmado', sign: 'Firmá acá', clear: 'Borrar la firma', close: 'Cerrar', again: 'Firmar de nuevo', hint: 'Zona de firma. Se dibuja con el mouse, el dedo o un lápiz.' };
  const curve = springRun(120, 12.5);
  const previous = el.innerHTML;
  const frame = node('div', 'mu-draw-signature__frame');
  const inner = node('div', 'mu-draw-signature__inner');
  frame.append(inner);
  const live = node('span', 'mu-draw-signature__live');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  el.classList.add('mu-draw-signature');
  el.replaceChildren(frame, live);

  let step = 'idle';
  let saved = null;
  let canvas = null;
  let ctx = null;
  let inked = false;
  let finishBtn = null;
  let motion = null;
  const SIZE = { w: 290, h: 200 };

  const penColor = () => getComputedStyle(el).color;
  const setupCanvas = () => {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = SIZE.w * ratio;
    canvas.height = SIZE.h * ratio;
    ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = penColor();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (saved) {
      const img = new Image();
      img.onload = () => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(img, 0, 0); ctx.restore(); };
      img.src = saved;
    }
  };
  const bindCanvas = () => {
    let last = null;
    let mid = null;
    const at = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * SIZE.w, y: ((e.clientY - r.top) / r.height) * SIZE.h }; };
    const stop = () => { last = null; mid = null; };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      last = at(e);
      mid = last;
      ctx.beginPath();
      ctx.arc(last.x, last.y, 0.1, 0, 2 * Math.PI);
      ctx.stroke();
      inked = true;
      finishBtn.disabled = false;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!last) return;
      const p = at(e);
      const m = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);
      ctx.quadraticCurveTo(last.x, last.y, m.x, m.y);
      ctx.stroke();
      last = p;
      mid = m;
    });
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
  };

  const view = (name) => {
    if (name === 'idle') {
      const b = button('mu-draw-signature__btn', null, `${svg('pen', 24)}<span></span>`);
      b.lastElementChild.textContent = labels.start;
      b.addEventListener('click', () => to('drawing'));
      return b;
    }
    if (name === 'drawing') {
      const pad = node('div', 'mu-draw-signature__pad');
      const head = node('div', 'mu-draw-signature__head');
      const clear = button('mu-draw-signature__icon', labels.clear, svg('redo', 22));
      const title = node('span', 'mu-draw-signature__title');
      title.textContent = labels.sign;
      const close = button('mu-draw-signature__close', labels.close, svg('x', 18));
      head.append(clear, title, close);
      canvas = node('canvas', 'mu-draw-signature__canvas');
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', labels.hint);
      inked = !!saved;
      finishBtn = button('mu-draw-signature__btn mu-draw-signature__btn--wide', null, `${svg('pen', 24)}<span></span>`);
      finishBtn.lastElementChild.textContent = labels.finish;
      finishBtn.disabled = !inked;
      pad.append(head, canvas, finishBtn);
      clear.addEventListener('click', () => { clearPad(); });
      close.addEventListener('click', () => to(saved ? 'done' : 'idle'));
      finishBtn.addEventListener('click', () => { saved = canvas.toDataURL(); to('done'); opts.onFinish?.(saved); el.dispatchEvent(new CustomEvent('finish', { detail: { dataUrl: saved } })); });
      pad.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); to(saved ? 'done' : 'idle'); } });
      return pad;
    }
    const row = node('div', 'mu-draw-signature__done');
    const chip = node('span', 'mu-draw-signature__chip', { html: `${svg('check', 24)}<span></span>` });
    chip.lastElementChild.textContent = labels.done;
    const again = button('mu-draw-signature__again', labels.again, svg('pen', 22));
    again.addEventListener('click', () => to('drawing'));
    row.append(chip, again);
    return row;
  };

  function clearPad() {
    if (ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore(); }
    saved = null;
    inked = false;
    if (finishBtn) finishBtn.disabled = true;
    opts.onClear?.();
  }
  function to(next, first = false) {
    const from = frame.getBoundingClientRect();
    const old = inner.firstElementChild;
    motion?.cancel();
    step = next;
    frame.dataset.step = next;
    const content = view(next);
    inner.replaceChildren(content);
    if (next === 'drawing') { setupCanvas(); bindCanvas(); }
    live.textContent = first ? '' : { idle: '', drawing: labels.sign, done: labels.done }[next];
    if (!first && !reduced() && old) {
      const dest = frame.getBoundingClientRect();
      motion = frame.animate([{ width: `${from.width}px`, height: `${from.height}px` }, { width: `${dest.width}px`, height: `${dest.height}px` }], { duration: curve.duration, easing: curve.easing });
      content.animate([{ opacity: 0, transform: 'translate(10%, 30%)' }, { opacity: 1, transform: 'none' }], { duration: 250, easing: 'ease-out' });
    }
    if (!first) {
      (content.matches('button') ? content : content.querySelector(next === 'done' ? 'button' : '.mu-draw-signature__close'))?.focus();
      opts.onStepChange?.(next);
      el.dispatchEvent(new CustomEvent('stepchange', { detail: { step: next } }));
    }
  }

  to(['idle', 'drawing', 'done'].includes(opts.step) ? opts.step : 'idle', true);

  return {
    get step() { return step; },
    clear: clearPad,
    toDataURL: () => saved,
    destroy() {
      motion?.cancel();
      life.destroy();
      el.innerHTML = previous;
      el.classList.remove('mu-draw-signature');
    },
  };
});
