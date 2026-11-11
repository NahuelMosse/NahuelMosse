// Loader (port of Kokonut UI's loader): four rings drawn with conic gradients, each cut to a thin line by
// a radial mask, turning at their own pace around a breathing centre, over a title and a subtitle that rise
// in and breathe in opacity. Monochrome: the rings take the text colour, so light and dark need no pair.
// mount(el, opts) -> { destroy, set }. Auto-mounts on [data-motion="kk-loader"].
//   opts: title, subtitle, size ('sm' | 'md' | 'lg'). set({ title, subtitle }) changes the words.
// It is a status region; it runs only while it is on screen and the tab is showing.
import { escapeHtml, pauseOffscreen } from '../core.js';

const mounted = new WeakMap();
const SIZES = ['sm', 'md', 'lg'];

export const mount = (el, opts = {}) => {
  if (mounted.has(el)) return mounted.get(el);
  const original = el.innerHTML;
  const size = SIZES.includes(opts.size ?? el.dataset.size) ? (opts.size ?? el.dataset.size) : 'md';
  const title = opts.title ?? el.dataset.title ?? 'Importando el extracto bancario…';
  const subtitle = opts.subtitle ?? el.dataset.subtitle ?? 'Estamos conciliando los movimientos con tus facturas';
  el.classList.add('kl');
  el.dataset.size = size;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-busy', 'true');
  el.innerHTML = `
    <div class="kl__stage" aria-hidden="true">
      <i class="kl__ring kl__ring--outer"></i><i class="kl__ring kl__ring--main"></i><i class="kl__ring kl__ring--back"></i><i class="kl__ring kl__ring--dots"></i>
    </div>
    <div class="kl__text">
      <h3 class="kl__title"><span class="kl__title-in">${escapeHtml(title)}</span></h3>
      <p class="kl__sub"><span class="kl__sub-in">${escapeHtml(subtitle)}</span></p>
    </div>`;
  pauseOffscreen(el);
  const api = {
    set(next = {}) {
      if (next.title != null) el.querySelector('.kl__title-in').textContent = next.title;
      if (next.subtitle != null) el.querySelector('.kl__sub-in').textContent = next.subtitle;
    },
    destroy() {
      el.classList.remove('kl');
      el.removeAttribute('role');
      el.removeAttribute('aria-busy');
      delete el.dataset.size;
      delete el.dataset.offscreen;
      el.innerHTML = original;
      mounted.delete(el);
    },
  };
  mounted.set(el, api);
  return api;
};

if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-motion="kk-loader"]')) mount(el);
