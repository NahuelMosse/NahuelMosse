// AI prompt (port of Kokonut UI's ai-prompt): a layered prompt box — header, auto-growing textarea, a
// bottom bar with a selector whose label rolls on change, an attach button and a send arrow that lights up
// with text. Here it takes "Describí la factura" for the invoice form.
// mount(el, opts) -> { destroy, setValue }. Auto-mounts on [data-motion="ai-prompt"].
//   opts: types (list of names), defaultType, placeholder, headerText, headerAction, minHeight, maxHeight.
// Event on the root: aiprompt:submit ({ value, type, file }). Enter sends, Shift+Enter adds a line.
import { reduced, uid, escapeHtml, place, cascade } from '../core.js';

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const mounted = new WeakMap();
const svg = (inner, cls = 'ap__icon') => `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true">${inner}</svg>`;
const ICON = {
  sparkle: svg('<path d="M8 1.5c.4 3.4 1.6 5.1 5.5 6.5-3.9 1.4-5.1 3.1-5.5 6.5-.4-3.4-1.6-5.1-5.5-6.5C6.4 6.6 7.6 4.9 8 1.5z"/>', 'ap__icon ap__icon--mark'),
  chevron: svg('<path d="M4 6l4 4 4-4"/>', 'ap__icon ap__icon--chev'),
  clip: svg('<path d="M13 7.5l-4.9 4.9a3 3 0 0 1-4.2-4.2l5.2-5.2a2 2 0 0 1 2.8 2.8L6.7 11a1 1 0 0 1-1.4-1.4l4.6-4.6"/>'),
  arrow: svg('<path d="M3 8h10M9 4l4 4-4 4"/>', 'ap__icon ap__icon--arrow'),
  check: svg('<path d="M3.5 8.5l3 3 6-7"/>', 'ap__icon ap__icon--check'),
  doc: svg('<path d="M4 2.5h5l3 3v8H4zM9 2.5v3h3"/>'),
  x: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
};
const DEFAULT_TYPES = ['Factura A', 'Factura B', 'Factura C', 'Nota de crédito', 'Nota de débito'];

export const mount = (el, opts = {}) => {
  if (mounted.has(el)) return mounted.get(el);
  const original = el.innerHTML;
  const types = opts.types ?? DEFAULT_TYPES;
  const minH = opts.minHeight ?? 72;
  const maxH = opts.maxHeight ?? 300;
  const id = uid('ap-');
  let type = opts.defaultType ?? types[0];
  el.classList.add('ap');
  el.innerHTML = `
    <div class="ap__shell">
      <div class="ap__head"><span class="ap__headline">${ICON.sparkle}<h3 class="ap__headtext">${escapeHtml(opts.headerText ?? 'Ledger arma el borrador de la factura')}</h3></span><p class="ap__headaction">${escapeHtml(opts.headerAction ?? 'Beta')}</p></div>
      <div class="ap__body">
        <div class="ap__scroll"><textarea class="ap__text" id="${id}-text" aria-label="Descripción de la factura" placeholder="${escapeHtml(opts.placeholder ?? 'Describí la factura: cliente, concepto, monto e IVA…')}" style="min-height:${minH}px"></textarea></div>
        <div class="ap__bar">
          <div class="ap__tools">
            <button class="ap__model" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Tipo de comprobante: ${escapeHtml(type)}" aria-controls="${id}-menu"><span class="ap__model-label">${escapeHtml(type)}</span>${ICON.chevron}</button>
            <span class="ap__sep" aria-hidden="true"></span>
            <label class="ap__attach" title="Adjuntar PDF" ><span class="ap__sr">Adjuntar archivo</span><input class="ap__file" type="file" accept="application/pdf,image/*">${ICON.clip}</label>
            <span class="ap__chip" hidden><span class="ap__chip-icon">${ICON.doc}</span><span class="ap__chip-name"></span><button class="ap__chip-x" type="button" aria-label="Quitar adjunto">${ICON.x}</button></span>
          </div>
          <button class="ap__send" type="button" aria-label="Crear borrador" disabled>${ICON.arrow}</button>
        </div>
      </div>
    </div>
    <div class="ap__menu" id="${id}-menu" role="menu" aria-label="Tipo de comprobante" hidden>${types.map((t) => `<button class="ap__opt" type="button" role="menuitemradio" aria-checked="${t === type}" data-type="${escapeHtml(t)}" tabindex="-1"><span>${escapeHtml(t)}</span>${ICON.check}</button>`).join('')}</div>
    <p class="ap__live" role="status" aria-live="polite"></p>`;

  const $ = (s) => el.querySelector(s);
  const text = $('.ap__text');
  const send = $('.ap__send');
  const model = $('.ap__model');
  const modelLabel = $('.ap__model-label');
  const menu = $('.ap__menu');
  const optNodes = [...el.querySelectorAll('.ap__opt')];
  const file = $('.ap__file');
  const chip = $('.ap__chip');
  const live = $('.ap__live');
  let attached = null;
  let menuOpen = false;
  let menuId = 0;
  let destroyed = false;
  const anims = new Set();
  const cleanups = [];
  const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); cleanups.push(() => t.removeEventListener(type, fn, o)); };
  const play = (node, frames, options) => { const a = node.animate(frames, options); anims.add(a); a.finished.then(() => anims.delete(a), () => anims.delete(a)); return a; };

  const grow = (reset) => {
    text.style.height = 'auto';
    const h = reset ? minH : Math.max(minH, Math.min(maxH, text.scrollHeight));
    text.style.height = `${h}px`;
    text.style.overflowY = text.scrollHeight > maxH ? 'auto' : 'hidden';
  };
  const sync = () => { send.disabled = !text.value.trim(); send.dataset.ready = send.disabled ? 'false' : 'true'; };

  const submit = () => {
    const value = text.value.trim();
    if (!value) return;
    el.dispatchEvent(new CustomEvent('aiprompt:submit', { detail: { value, type, file: attached }, bubbles: true }));
    text.value = '';
    grow(true);
    sync();
    live.textContent = 'Descripción enviada';
    if (!reduced()) play(send.querySelector('.ap__icon--arrow'), [{ transform: 'translateX(-4px)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: EASE });
  };

  // The label rolls on change: the old one drops 5 px and fades (150 ms), the new one comes down from above.
  const setType = (next) => {
    if (next === type) return;
    type = next;
    optNodes.forEach((n) => n.setAttribute('aria-checked', String(n.dataset.type === next)));
    model.setAttribute('aria-label', `Tipo de comprobante: ${next}`);
    if (reduced()) { modelLabel.textContent = next; play(modelLabel, [{ opacity: 0 }, { opacity: 1 }], { duration: 120 }); return; }
    play(modelLabel, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(5px)' }], { duration: 150, easing: EASE }).finished.then(() => {
      modelLabel.textContent = type;
      play(modelLabel, [{ opacity: 0, transform: 'translateY(-5px)' }, { opacity: 1, transform: 'none' }], { duration: 150, easing: EASE });
    }, () => {});
  };

  const openMenu = (focusSelected) => {
    if (menuOpen) return;
    menuOpen = true;
    menuId += 1;
    menu.hidden = false;
    model.setAttribute('aria-expanded', 'true');
    place(menu, model, { align: 'start', gap: 4 });
    if (reduced()) play(menu, [{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
    else play(menu, [{ opacity: 0, transform: 'translateY(var(--_sy, -4px)) scale(0.95)' }, { opacity: 1, transform: 'none' }], { duration: 150, easing: EASE });
    cascade(menu);
    if (focusSelected) (optNodes.find((n) => n.getAttribute('aria-checked') === 'true') ?? optNodes[0]).focus();
  };
  const closeMenu = (returnFocus) => {
    if (!menuOpen) return;
    menuOpen = false;
    const id = ++menuId;
    model.setAttribute('aria-expanded', 'false');
    const out = play(menu, reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.95)' }], { duration: reduced() ? 100 : 110, easing: EASE });
    out.finished.then(() => { if (id === menuId && !menuOpen && !destroyed) menu.hidden = true; }, () => {});
    if (returnFocus) model.focus();
  };

  on(text, 'input', () => { grow(); sync(); });
  on(text, 'keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });
  on(send, 'click', submit);
  on(model, 'click', () => (menuOpen ? closeMenu(false) : openMenu(false)));
  on(model, 'keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openMenu(true); } });
  on(menu, 'click', (e) => { const o = e.target.closest('.ap__opt'); if (o) { setType(o.dataset.type); closeMenu(true); } });
  on(menu, 'keydown', (e) => {
    const i = optNodes.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); optNodes[(i + 1) % optNodes.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); optNodes[(i - 1 + optNodes.length) % optNodes.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); optNodes[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); optNodes.at(-1).focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    else if (e.key === 'Tab') closeMenu(false);
  });
  on(document, 'pointerdown', (e) => { if (menuOpen && !menu.contains(e.target) && !model.contains(e.target)) closeMenu(false); });
  on(window, 'resize', () => closeMenu(false));
  on(file, 'change', () => {
    attached = file.files?.[0] ?? null;
    chip.hidden = !attached;
    chip.querySelector('.ap__chip-name').textContent = attached?.name ?? '';
    if (attached) { live.textContent = `Adjuntaste ${attached.name}`; if (!reduced()) play(chip, [{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE }); }
  });
  on(chip.querySelector('.ap__chip-x'), 'click', () => { attached = null; file.value = ''; chip.hidden = true; text.focus(); });

  grow(true);
  sync();

  const api = {
    setValue(v) { text.value = v; grow(); sync(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const a of anims) a.cancel();
      for (const off of cleanups) off();
      el.classList.remove('ap');
      el.innerHTML = original;
      mounted.delete(el);
    },
  };
  mounted.set(el, api);
  return api;
};

if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-motion="ai-prompt"]')) mount(el);
