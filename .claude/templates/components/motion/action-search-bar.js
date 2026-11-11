// Action search bar (port of Kokonut UI's action-search-bar): a search field that opens a list of
// suggested actions — a reveal, items rising in 100 ms apart — filters it as you type (200 ms debounce)
// and swaps its magnifier for a send arrow when there is text.
// mount(el, opts) -> { destroy, open, close }. Auto-mounts on [data-motion="action-search-bar"].
//   opts: actions [{ id, label, icon, description, short, end, tone }], placeholder, label.
//   icons: receipt-plus | coins | user-plus | download | link | search. tone: accent|info|success|warning|danger.
// Event on the root: actionsearch:select ({ action }). ⌘K / Ctrl K focuses the field from anywhere.
import { reduced, uid, escapeHtml, fold, flip, keyLabel } from '../core.js';

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const mounted = new WeakMap();

const ICONS = {
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
  send: '<path d="M14 2L7 9M14 2l-4.5 12-2.5-5.5L1.5 6z"/>',
  'receipt-plus': '<path d="M3.5 2.5h9v11l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1zM8 5.5v4M6 7.5h4"/>',
  coins: '<ellipse cx="6.5" cy="5.5" rx="4" ry="2"/><path d="M2.5 5.5v3c0 1.1 1.8 2 4 2s4-.9 4-2v-3M10.5 7.3c1.7.2 3 .9 3 1.7v3c0 1.1-1.8 2-4 2-1.6 0-3-.5-3.6-1.2"/>',
  'user-plus': '<circle cx="6.5" cy="5.5" r="2.5"/><path d="M2 13.5c.4-2.5 2.2-4 4.5-4s4.1 1.5 4.5 4M13 4.5v4M11 6.5h4"/>',
  download: '<path d="M8 2.5v8M5 7.5l3 3 3-3M3 13h10"/>',
  link: '<path d="M6.8 9.2a2.5 2.5 0 0 0 3.5 0l2.2-2.2a2.5 2.5 0 0 0-3.5-3.5L8.2 4.3M9.2 6.8a2.5 2.5 0 0 0-3.5 0L3.5 9a2.5 2.5 0 0 0 3.5 3.5l.8-.8"/>',
};
const icon = (name, cls = 'asb__icon') => `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;

const DEFAULT_ACTIONS = [
  { id: 'new-invoice', label: 'Nueva factura', icon: 'receipt-plus', description: 'Comprobante', short: 'Mod N', end: 'Crear', tone: 'accent' },
  { id: 'register-payment', label: 'Registrar cobro', icon: 'coins', description: 'Tesorería', short: 'Mod P', end: 'Acción', tone: 'success' },
  { id: 'new-client', label: 'Cargar cliente', icon: 'user-plus', description: 'Clientes', short: '', end: 'Crear', tone: 'info' },
  { id: 'export', label: 'Exportar a Excel', icon: 'download', description: 'Facturas del mes', short: '', end: 'Archivo', tone: 'warning' },
  { id: 'reconcile', label: 'Conciliar con el banco', icon: 'link', description: 'Extractos', short: '', end: 'Vínculo', tone: 'accent' },
];

export const mount = (el, opts = {}) => {
  if (mounted.has(el)) return mounted.get(el);
  const original = el.innerHTML;
  const actions = opts.actions ?? DEFAULT_ACTIONS;
  const id = uid('asb-');
  el.classList.add('asb');
  el.innerHTML = `
    <label class="asb__label" for="${id}-input">${escapeHtml(opts.label ?? 'Buscar acciones')}</label>
    <div class="asb__field">
      <input class="asb__input" id="${id}-input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" autocomplete="off" placeholder="${escapeHtml(opts.placeholder ?? '¿Qué necesitás hacer?')}">
      <span class="asb__icons" aria-hidden="true"><span class="asb__ico" data-ico="search">${icon('search')}</span><span class="asb__ico" data-ico="send" hidden>${icon('send')}</span></span>
    </div>
    <div class="asb__panel" id="${id}-list" role="listbox" aria-label="Acciones sugeridas" hidden>
      <ul class="asb__list" role="none">${actions.map((a) => `
        <li class="asb__item" role="option" aria-selected="false" id="${id}-${a.id}" data-id="${a.id}" data-tone="${a.tone ?? 'accent'}">
          <span class="asb__lead"><span class="asb__glyph" aria-hidden="true">${icon(a.icon ?? 'search')}</span><span class="asb__name">${escapeHtml(a.label)}</span>${a.description ? `<span class="asb__desc">${escapeHtml(a.description)}</span>` : ''}</span>
          <span class="asb__trail">${a.short ? `<kbd class="asb__short" aria-label="Atajo: ${escapeHtml(keyLabel(a.short))}">${escapeHtml(keyLabel(a.short))}</kbd>` : ''}${a.end ? `<span class="asb__end">${escapeHtml(a.end)}</span>` : ''}</span>
        </li>`).join('')}
      </ul>
      <p class="asb__empty" hidden></p>
      <div class="asb__foot"><span>Presioná <kbd>${escapeHtml(keyLabel('Mod K'))}</kbd> para abrir las acciones</span><span><kbd>Esc</kbd> para cancelar</span></div>
    </div>
    <p class="asb__live" role="status" aria-live="polite"></p>`;

  const $ = (s) => el.querySelector(s);
  const input = $('.asb__input');
  const panel = $('.asb__panel');
  const list = $('.asb__list');
  const empty = $('.asb__empty');
  const live = $('.asb__live');
  const items = [...el.querySelectorAll('.asb__item')];
  const byId = new Map(actions.map((a, i) => [a.id, { action: a, node: items[i] }]));
  const icoSearch = $('[data-ico="search"]');
  const icoSend = $('[data-ico="send"]');

  let isOpen = false;
  let query = '';
  let applied = '';
  let visible = [...items];
  let active = -1;
  let debounce = 0;
  let closeId = 0;
  let destroyed = false;
  const anims = new Set();
  const cleanups = [];
  const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); cleanups.push(() => t.removeEventListener(type, fn, o)); };
  const play = (node, frames, options) => { const a = node.animate(frames, options); anims.add(a); a.finished.then(() => anims.delete(a), () => anims.delete(a)); return a; };

  const setActive = (i) => {
    active = i;
    items.forEach((n) => n.setAttribute('aria-selected', 'false'));
    const node = visible[i];
    if (node) { node.setAttribute('aria-selected', 'true'); input.setAttribute('aria-activedescendant', node.id); node.scrollIntoView?.({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  };

  const open = () => {
    closeId += 1;
    if (isOpen) return;
    isOpen = true;
    input.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
    if (reduced()) { play(panel, [{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: EASE }); return; }
    play(panel, [{ clipPath: 'inset(0 0 100% 0 round var(--radius-control))' }, { clipPath: 'inset(0 0 0 0 round var(--radius-control))' }], { duration: 400, easing: EASE });
    play(panel, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: EASE });
    visible.forEach((n, i) => play(n, [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: i * 100, easing: EASE, fill: 'backwards' }));
  };
  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
    const id = ++closeId;
    const out = reduced()
      ? play(panel, [{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: EASE })
      : play(panel, [{ clipPath: 'inset(0 0 0 0 round var(--radius-control))', opacity: 1 }, { clipPath: 'inset(0 0 100% 0 round var(--radius-control))', opacity: 0 }], { duration: 300, easing: EASE });
    out.finished.then(() => { if (id === closeId && !isOpen && !destroyed) panel.hidden = true; }, () => {});
  };

  // The icon in the field rolls: the one leaving drops 20 px and fades, the one arriving comes down from above.
  let icoShown = icoSearch;
  const swapIcon = (next) => {
    if (next === icoShown) return;
    const out = icoShown;
    icoShown = next;
    next.hidden = false;
    if (reduced()) { play(next, [{ opacity: 0 }, { opacity: 1 }], { duration: 120 }); out.hidden = true; return; }
    play(next, [{ opacity: 0, transform: 'translateY(-20px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE });
    play(out, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(20px)' }], { duration: 200, easing: EASE }).finished.then(() => { if (out !== icoShown) out.hidden = true; }, () => {});
  };

  const filter = () => {
    applied = query;
    const q = fold(applied.trim());
    const next = items.filter((n) => { const { action: a } = byId.get(n.dataset.id); return !q || fold(`${a.label} ${a.description ?? ''}`).includes(q); });
    const entering = next.filter((n) => !visible.includes(n));
    flip(next.filter((n) => visible.includes(n)), () => { items.forEach((n) => { n.hidden = !next.includes(n); }); });
    if (!reduced()) for (const n of entering) play(n, [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: EASE });
    visible = next;
    empty.hidden = next.length > 0;
    empty.textContent = next.length ? '' : `Sin acciones para «${applied.trim()}»`;
    setActive(-1);
    live.textContent = next.length ? `${next.length} ${next.length === 1 ? 'acción' : 'acciones'}` : 'Sin resultados';
  };

  const choose = (node) => {
    const { action } = byId.get(node.dataset.id);
    close();
    live.textContent = `Elegiste ${action.label}`;
    el.dispatchEvent(new CustomEvent('actionsearch:select', { detail: { action }, bubbles: true }));
  };

  on(input, 'focus', open);
  on(input, 'click', open);
  on(input, 'blur', close);
  on(input, 'input', () => {
    query = input.value;
    swapIcon(query.length ? icoSend : icoSearch);
    open();
    clearTimeout(debounce);
    debounce = setTimeout(filter, 200);
  });
  on(input, 'keydown', (e) => {
    if (e.key === 'Escape') { if (isOpen) { e.preventDefault(); close(); } return; }
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) open();
    if (!visible.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active < visible.length - 1 ? active + 1 : 0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active > 0 ? active - 1 : visible.length - 1); }
    else if (e.key === 'Home' && active >= 0) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && active >= 0) { e.preventDefault(); setActive(visible.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) choose(visible[active]); }
  });
  // The pointer never takes focus from the field, so the list stays open until a choice is made.
  on(panel, 'mousedown', (e) => e.preventDefault());
  on(panel, 'click', (e) => { const n = e.target.closest('.asb__item'); if (n) choose(n); });
  on(panel, 'pointermove', (e) => { const n = e.target.closest('.asb__item'); if (n && e.pointerType === 'mouse') { const i = visible.indexOf(n); if (i !== active) setActive(i); } });
  on(document, 'keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); open(); } });
  on(document, 'pointerdown', (e) => { if (isOpen && !el.contains(e.target)) close(); });

  const api = {
    open() { input.focus(); open(); },
    close,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(debounce);
      for (const a of anims) a.cancel();
      for (const off of cleanups) off();
      el.classList.remove('asb');
      el.innerHTML = original;
      mounted.delete(el);
    },
  };
  mounted.set(el, api);
  return api;
};

if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-motion="action-search-bar"]')) mount(el);
