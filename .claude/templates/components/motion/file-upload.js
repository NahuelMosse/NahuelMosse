// File upload (port of Kokonut UI's file-upload): a drop zone that answers a drag, shows the upload as a
// ring of counter-rotating dashed circles that a progress wipe reveals, and ends in a "done" pane.
// mount(el, opts) -> { destroy, select }. Auto-mounts on [data-motion="file-upload"].
//   opts: accept (mime types / extensions), maxSize (bytes), uploadDelay (ms of the simulated upload, 0 =
//   instant), upload(file, progress) (a real upload: call progress(0..100), resolve when done),
//   validate(file) -> { message, code } | null, onDone(file), onError(error), onRemove().
// Events on the root: fileupload:done, fileupload:error, fileupload:remove.
import { reduced, whileVisible, pauseOffscreen, uid, escapeHtml, locale } from '../core.js';

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const UNITS = ['bytes', 'KB', 'MB', 'GB'];
const STEP = 5;
const mounted = new WeakMap();

export const formatBytes = (n) => {
  if (!+n) return '0 bytes';
  const i = Math.min(UNITS.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(n / 1024 ** i)} ${UNITS[i]}`;
};

const svg = (inner, cls = 'fu__icon') => `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true">${inner}</svg>`;
const CLOUD = svg('<path d="M4.5 11.5a3 3 0 0 1-.4-5.97A4 4 0 0 1 11.8 5.6 2.9 2.9 0 0 1 11.5 11.5M8 13V8M6 9.7L8 7.7l2 2"/>');

const illustration = () => `
  <svg class="fu__art" viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false">
    <circle class="fu__art-dash" cx="50" cy="50" r="45" stroke-dasharray="4 4" stroke-width="2"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="60s" repeatCount="indefinite"/></circle>
    <path class="fu__art-box" stroke-width="2" d="M30 35H70C75 35 75 40 75 40V65C75 70 70 70 70 70H30C25 70 25 65 25 65V40C25 35 30 35 30 35Z"><animate attributeName="d" dur="2s" repeatCount="indefinite" values="M30 35H70C75 35 75 40 75 40V65C75 70 70 70 70 70H30C25 70 25 65 25 65V40C25 35 30 35 30 35Z;M30 38H70C75 38 75 43 75 43V68C75 73 70 73 70 73H30C25 73 25 68 25 68V43C25 38 30 38 30 38Z;M30 35H70C75 35 75 40 75 40V65C75 70 70 70 70 70H30C25 70 25 65 25 65V40C25 35 30 35 30 35Z"/></path>
    <path class="fu__art-line" stroke-width="2" d="M30 35C30 35 35 35 40 35C45 35 45 30 50 30C55 30 55 35 60 35C65 35 70 35 70 35"/>
    <g transform="translate(0 8)">
      <line class="fu__art-line" stroke-width="2" stroke-linecap="round" x1="50" x2="50" y1="45" y2="60"><animate attributeName="y2" dur="2s" repeatCount="indefinite" values="60;55;60"/></line>
      <polyline class="fu__art-line" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="42,52 50,45 58,52"><animate attributeName="points" dur="2s" repeatCount="indefinite" values="42,52 50,45 58,52;42,47 50,40 58,47;42,52 50,45 58,52"/></polyline>
    </g>
  </svg>`;

const rings = (maskId) => {
  const circles = Array.from({ length: 14 }, (_, i) => {
    const dh = ((i % 7) - 3) * 12;
    const dl = [-7, 0, 7][i % 3];
    return `<circle cx="120" cy="120" r="${150 - i * 10}" style="--dh:${dh};--dl:${dl}%"/>`;
  }).join('');
  return `
  <svg class="fu__rings" viewBox="0 0 240 240" fill="none" aria-hidden="true" focusable="false">
    <defs><mask id="${maskId}"><rect width="240" height="240" fill="black"/><circle class="fu__wipe" cx="120" cy="120" r="60" stroke="white" stroke-width="120" stroke-dasharray="0 377" transform="rotate(-90 120 120)"/></mask></defs>
    <circle class="fu__track" cx="120" cy="120" r="116" stroke-dasharray="4 8"/>
    <g class="fu__spin" mask="url(#${maskId})" stroke-dasharray="18% 40%" stroke-width="10">${circles}</g>
  </svg>`;
};

const attrNum = (el, name, fallback) => (el.dataset[name] != null && el.dataset[name] !== '' ? Number(el.dataset[name]) : fallback);

export const mount = (el, opts = {}) => {
  if (mounted.has(el)) return mounted.get(el);
  const original = el.innerHTML;
  const o = {
    accept: opts.accept ?? (el.dataset.accept ? el.dataset.accept.split(',').map((s) => s.trim()) : ['application/pdf']),
    maxSize: opts.maxSize ?? attrNum(el, 'maxSize', 5 * 1024 * 1024),
    uploadDelay: opts.uploadDelay ?? attrNum(el, 'uploadDelay', 2000),
    upload: opts.upload,
    validate: opts.validate,
    onDone: opts.onDone,
    onError: opts.onError,
    onRemove: opts.onRemove,
  };
  const names = o.accept.map((t) => (t.includes('/') ? t.split('/')[1] : t.replace('.', '')).toUpperCase()).join(', ');
  const maskId = uid('fu-mask-');

  el.classList.add('fu');
  el.dataset.state = 'idle';
  el.innerHTML = `
    <div class="fu__ring">
      <span class="fu__hairline" aria-hidden="true"></span>
      <div class="fu__inner">
        <div class="fu__frame">
          <div class="fu__drag" aria-hidden="true"><i class="fu__edge fu__edge--t"></i><i class="fu__edge fu__edge--b"></i><i class="fu__edge fu__edge--l"></i><i class="fu__edge fu__edge--r"></i><i class="fu__pulse"></i></div>
          <span class="fu__corner" aria-hidden="true"></span>
          <div class="fu__stage">
            <div class="fu__pane" data-pane="idle">
              <div class="fu__art-wrap">${illustration()}</div>
              <div class="fu__copy">
                <h3 class="fu__title">Arrastrá y soltá o</h3>
                <p class="fu__hint">${escapeHtml(names)} hasta ${formatBytes(o.maxSize)}</p>
              </div>
              <button class="fu__btn" type="button" data-pick><span>Subir factura</span>${CLOUD}</button>
              <p class="fu__alt">o soltá tu archivo acá</p>
            </div>
            <div class="fu__pane" data-pane="uploading" hidden>
              <div class="fu__art-wrap" role="progressbar" aria-label="Progreso de la subida" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${rings(maskId)}</div>
              <div class="fu__copy">
                <h3 class="fu__name" data-name></h3>
                <p class="fu__meta"><span data-size></span><b class="fu__pct" data-pct>0%</b></p>
              </div>
              <button class="fu__btn" type="button" data-cancel>Cancelar</button>
            </div>
            <div class="fu__pane" data-pane="done" hidden>
              <div class="fu__art-wrap"><svg class="fu__done-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="32" cy="32" r="28" pathLength="1"/><path d="M20 33l8 8 16-17" pathLength="1"/></svg></div>
              <div class="fu__copy">
                <h3 class="fu__name" data-name></h3>
                <p class="fu__meta"><span data-size></span><b class="fu__ok">Listo</b></p>
              </div>
              <div class="fu__row"><button class="fu__btn fu__btn--half" type="button" data-replace>Reemplazar</button><button class="fu__btn fu__btn--half" type="button" data-remove>Quitar</button></div>
            </div>
          </div>
          <div class="fu__error" role="alert" hidden></div>
        </div>
      </div>
    </div>
    <p class="fu__live" role="status" aria-live="polite"></p>
    <input class="fu__input" type="file" tabindex="-1" aria-label="Archivo de la factura" accept="${escapeHtml(o.accept.join(','))}">`;

  const $ = (s) => el.querySelector(s);
  const frame = $('.fu__frame');
  const input = $('.fu__input');
  const live = $('.fu__live');
  const errorBox = $('.fu__error');
  const panes = Object.fromEntries([...el.querySelectorAll('.fu__pane')].map((p) => [p.dataset.pane, p]));
  const wipe = $('.fu__wipe');
  const bar = $('[role=progressbar]');
  const pct = $('[data-pct]');

  let state = 'idle';
  let progress = 0;
  let timer = 0;
  let errorTimer = 0;
  let swapId = 0;
  let runId = 0;
  let dragDepth = 0;
  let announced = -1;
  let file = null;
  let destroyed = false;
  const anims = new Set();

  const play = (node, frames, duration, easing = EASE) => {
    const a = node.animate(frames, { duration, easing });
    anims.add(a);
    a.finished.then(() => anims.delete(a), () => anims.delete(a));
    return a;
  };
  const enter = (pane) => {
    if (reduced()) return play(pane, [{ opacity: 0 }, { opacity: 1 }], 120);
    const frames = pane.dataset.pane === 'idle' ? [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }] : [{ opacity: 0, transform: 'scale(0.95)' }, { opacity: 1, transform: 'none' }];
    return play(pane, frames, pane.dataset.pane === 'idle' ? 200 : 300);
  };
  const exit = (pane) => {
    if (reduced()) return play(pane, [{ opacity: 1 }, { opacity: 0 }], 100);
    const frames = pane.dataset.pane === 'idle' ? [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px)' }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.95)' }];
    return play(pane, frames, pane.dataset.pane === 'idle' ? 200 : 300);
  };
  let current = null;
  // The panes cross-fade: the one arriving shows at once, over the one leaving, so the card is never empty.
  const showPane = (name, initial) => {
    const to = panes[name];
    const from = current;
    const id = ++swapId;
    current = to;
    if (initial || !from) { for (const p of Object.values(panes)) p.hidden = p !== to; enter(to); return; }
    if (from === to) return;
    for (const p of Object.values(panes)) if (p !== to && p !== from) p.hidden = true;
    to.hidden = false;
    enter(to);
    exit(from).finished.then(() => {
      if (id !== swapId || destroyed) return;
      from.hidden = true;
    }, () => {});
  };
  const setState = (next) => { state = next; el.dataset.state = next; };
  const say = (text) => { live.textContent = text; };

  const setProgress = (value) => {
    progress = Math.max(0, Math.min(100, value));
    wipe.setAttribute('stroke-dasharray', `${(progress / 100) * 377} 377`);
    pct.textContent = `${Math.round(progress)}%`;
    bar.setAttribute('aria-valuenow', String(Math.round(progress)));
    const quarter = Math.floor(progress / 25);
    if (quarter !== announced) { announced = quarter; say(`Subiendo ${file?.name ?? 'archivo'}: ${Math.round(progress)}%`); }
  };

  const clearError = () => { clearTimeout(errorTimer); frame.removeAttribute('data-error'); if (!errorBox.hidden) { const gone = errorBox; play(gone, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px)' }], reduced() ? 120 : 200).finished.then(() => { if (frame.dataset.error == null) gone.hidden = true; }, () => {}); } };
  const fail = (error) => {
    clearTimeout(errorTimer);
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    frame.dataset.error = error.code;
    play(errorBox, reduced() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], reduced() ? 120 : 200);
    say(error.message);
    el.dispatchEvent(new CustomEvent('fileupload:error', { detail: error, bubbles: true }));
    o.onError?.(error);
    errorTimer = setTimeout(clearError, 3000);
  };

  const check = (f) => {
    if (f.size > o.maxSize) return { message: `El archivo supera ${formatBytes(o.maxSize)}`, code: 'FILE_TOO_LARGE' };
    if (o.accept.length) {
      const type = (f.type || '').toLowerCase();
      const ext = `.${f.name.split('.').pop().toLowerCase()}`;
      const ok = o.accept.some((a) => { const t = a.toLowerCase(); return t.startsWith('.') ? ext === t : t.endsWith('/*') ? type.startsWith(t.slice(0, -1)) : type === t; });
      if (!ok) return { message: `El archivo tiene que ser ${names}`, code: 'INVALID_FILE_TYPE' };
    }
    return o.validate?.(f) ?? null;
  };

  const finish = (f) => {
    clearInterval(timer);
    setProgress(100);
    setState('done');
    panes.done.querySelector('[data-name]').textContent = f.name;
    panes.done.querySelector('[data-size]').textContent = formatBytes(f.size);
    showPane('done');
    say(`${f.name} listo`);
    el.dispatchEvent(new CustomEvent('fileupload:done', { detail: { file: f }, bubbles: true }));
    o.onDone?.(f);
  };

  const start = (f) => {
    const id = ++runId;
    file = f;
    announced = -1;
    clearError();
    setState('uploading');
    panes.uploading.querySelector('[data-name]').textContent = f.name;
    panes.uploading.querySelector('[data-size]').textContent = formatBytes(f.size);
    setProgress(0);
    showPane('uploading');
    if (o.upload) {
      o.upload(f, (v) => { if (id === runId && state === 'uploading') setProgress(v); }).then(() => { if (id === runId && !destroyed) finish(f); }, (e) => { if (id !== runId || destroyed) return; reset(false); fail({ message: e?.message ?? 'No se pudo subir el archivo', code: 'UPLOAD_FAILED' }); });
      return;
    }
    if (!o.uploadDelay) { finish(f); return; }
    let p = 0;
    clearInterval(timer);
    timer = setInterval(() => {
      p += STEP;
      if (p >= 100) finish(f); else setProgress(p);
    }, o.uploadDelay / (100 / STEP));
  };

  const select = (f) => {
    if (!f || state === 'uploading') return;
    const error = check(f);
    if (error) { fail(error); return; }
    start(f);
  };
  const reset = (notify = true) => {
    runId += 1;
    clearInterval(timer);
    file = null;
    setState('idle');
    setProgress(0);
    showPane('idle');
    if (notify) { el.dispatchEvent(new CustomEvent('fileupload:remove', { bubbles: true })); o.onRemove?.(); }
  };

  const pick = () => { if (state !== 'uploading') input.click(); };
  const on = (target, type, fn, options) => { target.addEventListener(type, fn, options); cleanups.push(() => target.removeEventListener(type, fn, options)); };
  const cleanups = [];

  on(el, 'click', (e) => {
    const b = e.target.closest('button');
    if (!b || !el.contains(b)) return;
    if (b.hasAttribute('data-pick') || b.hasAttribute('data-replace')) pick();
    else if (b.hasAttribute('data-cancel') || b.hasAttribute('data-remove')) reset();
  });
  on(input, 'change', () => { const f = input.files?.[0]; input.value = ''; select(f); });
  const hasFiles = (e) => e.dataTransfer?.types?.includes('Files') ?? true;
  on(frame, 'dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth += 1; if (state === 'idle') setState('dragging'); });
  on(frame, 'dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = state === 'uploading' ? 'none' : 'copy'; if (state === 'idle') setState('dragging'); });
  on(frame, 'dragleave', (e) => { e.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!frame.contains(e.relatedTarget) && (dragDepth === 0 || !e.relatedTarget) && state === 'dragging') setState('idle'); });
  on(frame, 'drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    if (state === 'dragging') setState('idle');
    if (state === 'idle' || state === 'done') { const f = e.dataTransfer?.files?.[0]; if (f) { if (state === 'done') reset(false); select(f); } }
  });

  // The decorative loops (the box floating, the rings turning) run only while the card is on screen.
  const art = [...el.querySelectorAll('.fu__art')];
  for (const a of art) a.pauseAnimations();
  const gate = whileVisible(el, () => { for (const a of art) a.unpauseAnimations(); return () => { for (const a of art) a.pauseAnimations(); }; });

  pauseOffscreen(el);
  showPane('idle', true);

  const api = {
    select,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearInterval(timer);
      clearTimeout(errorTimer);
      runId += 1;
      swapId += 1;
      for (const a of anims) a.cancel();
      for (const off of cleanups) off();
      gate.destroy();
      el.classList.remove('fu');
      delete el.dataset.state;
      delete el.dataset.offscreen;
      el.innerHTML = original;
      mounted.delete(el);
    },
  };
  mounted.set(el, api);
  return api;
};

if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-motion="file-upload"]')) mount(el);
