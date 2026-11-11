// Copy button, ported from Animate UI (registry/components/buttons/copy + primitives/buttons/button):
// the copy icon and the check swap with scale 0 → 1, opacity 0.4 → 1 and blur 4 → 0 px in 150 ms (the old
// one leaves the same way, in the same cell), the button grows 5 % on hover and shrinks 5 % pressed, and
// after `delay` (3 s) it goes back. The icons are the animated ones (icons.js): the copy sheets part on
// hover and the check draws itself. What the original lacks and a back office needs: a clipboard that
// falls back to `execCommand` where the API is missing, a failure state (the x), and a live region that
// says what happened in words.
//
//   <button data-motion="copy-button" data-copy="30-71234567-8" aria-label="Copiar CUIT"></button>
//   <button data-motion="copy-button" data-copy="30-71234567-8">30-71234567-8</button>   (text + icon)
//
// mount(el, { content, delay, variant, size, labels, onCopiedChange })
//   → { copy(), state, destroy }; `copied` fires on `el` with the text; state is idle | copied | failed.
import { make, swapAnimation } from './au-util.js';
import { iconSvg, mount as mountIcon, play } from './icons.js';

const instances = new WeakMap();
const VARIANTS = { default: '', primary: 'btn--primary', ghost: 'btn--ghost', destructive: 'btn--destructive' };
// The check is whole in 150 ms: a copy is confirmed at the speed of the click that asked for it.
const SWAP_MS = 150;
const LABELS ={ copy: 'Copiar', copied: 'Copiado al portapapeles', failed: 'No se pudo copiar' };

const writeClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch { /* no clipboard API, or no permission: the old way below */ }
  const area = Object.assign(document.createElement('textarea'), { value: text });
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.append(area);
  area.select();
  const ok = document.execCommand?.('copy');
  area.remove();
  if (!ok) throw new Error('motion/copy-button: the clipboard refused the text');
};

export const mount = (el, opts = {}) => {
  if (instances.has(el)) return instances.get(el);
  const variant = opts.variant ?? el.dataset.variant ?? 'default';
  if (!(variant in VARIANTS)) throw new Error(`motion/copy-button: no variant "${variant}" (${Object.keys(VARIANTS).join(', ')})`);
  const size = opts.size ?? el.dataset.size ?? 'md';
  const delay = opts.delay ?? Number(el.dataset.delay ?? 3000);
  const labels = { ...LABELS, ...opts.labels };
  const source = opts.content ?? el.dataset.copy;
  if (typeof source !== 'string' && typeof source !== 'function') throw new Error('motion/copy-button: needs the text to copy (data-copy or the content option)');
  const original = [...el.childNodes];
  const hasText = el.textContent.trim() !== '';
  const classes = ['btn', ...(VARIANTS[variant] ? [VARIANTS[variant]] : []), ...(size === 'sm' ? ['btn--sm'] : []), ...(hasText ? [] : ['btn--icon']), 'cb'];
  const added = classes.filter((c) => !el.classList.contains(c));
  el.classList.add(...classes);
  const hadLabel = el.hasAttribute('aria-label');
  if (!hadLabel && !hasText) el.setAttribute('aria-label', labels.copy);
  const addedType = el.tagName === 'BUTTON' && !el.hasAttribute('type');
  if (addedType) el.setAttribute('type', 'button');

  const cell = make('span', { class: 'cb__icons', 'aria-hidden': 'true' });
  const faces = { idle: make('span', { class: 'cb__icon' }), copied: make('span', { class: 'cb__icon' }), failed: make('span', { class: 'cb__icon' }) };
  const copyIcon = mountIcon(faces.idle, { name: 'copy', size: 16, host: el });
  faces.copied.innerHTML = iconSvg('check', { size: 16 });
  faces.failed.innerHTML = iconSvg('x', { size: 16 });
  for (const key of ['copied', 'failed']) Object.assign(faces[key].style, { opacity: '0', transform: 'scale(0)' });
  cell.append(...Object.values(faces));
  if (hasText) el.replaceChildren(make('span', { class: 'cb__label' }, ...original), cell); else el.replaceChildren(cell);
  const live = make('span', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  el.after(live);

  let state = 'idle';
  let timer = 0;
  let motions = [];
  const show = (next) => {
    if (next === state) return;
    for (const m of motions) m.cancel();
    motions = [swapAnimation(faces[state], false, SWAP_MS), swapAnimation(faces[next], true, SWAP_MS)];
    state = next;
    el.dataset.state = next;
    if (next === 'copied') play(faces.copied.firstElementChild, 'quick');
  };

  const copy = async () => {
    if (state !== 'idle') return;
    const text = typeof source === 'function' ? source() : source;
    clearTimeout(timer);
    try {
      await writeClipboard(text);
      show('copied');
      live.textContent = labels.copied;
      opts.onCopiedChange?.(true, text);
      el.dispatchEvent(new CustomEvent('copied', { detail: { text } }));
    } catch {
      show('failed');
      live.textContent = labels.failed;
    }
    timer = setTimeout(() => {
      show('idle');
      live.textContent = '';
      opts.onCopiedChange?.(false);
    }, delay);
  };

  const onClick = () => { copy(); };
  el.addEventListener('click', onClick);

  const api = {
    get state() { return state; },
    copy,
    destroy() {
      clearTimeout(timer);
      el.removeEventListener('click', onClick);
      for (const m of motions) m.cancel();
      copyIcon.destroy();
      live.remove();
      el.replaceChildren(...original);
      el.classList.remove(...added);
      delete el.dataset.state;
      if (!hadLabel) el.removeAttribute('aria-label');
      if (addedType) el.removeAttribute('type');
      instances.delete(el);
    },
  };
  instances.set(el, api);
  return api;
};

if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-motion="copy-button"]')) mount(el);
