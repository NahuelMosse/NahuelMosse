// Profile dropdown (port of Kokonut UI's profile-dropdown): a profile card as the trigger — name, email and
// an avatar inside a gradient ring, with a bending line at its edge that turns accent while open — and a
// rounded menu that grows in from its top right corner (fade, zoom from 95 %, slide 8 px, 150 ms).
// mount(el, opts) -> { destroy, open, close }. Auto-mounts on [data-motion="profile-dropdown"].
//   opts: data { name, email, company, plan }, items [{ id, label, value, tone, icon, href, external }].
// Event on the root: profile:select ({ id }). The menu follows the menu pattern: ↓ ↑ Home End Esc Tab.
import { reduced, uid, escapeHtml, place, cascade, hueOf } from '../core.js';

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const mounted = new WeakMap();
const g = (inner) => `<svg class="pd__icon" viewBox="0 0 16 16" aria-hidden="true">${inner}</svg>`;
const ICONS = {
  user: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c.4-2.5 2.3-4 5-4s4.6 1.5 5 4"/>',
  building: '<path d="M3.5 13.5V3.5h6v10M9.5 6.5h3v7M5.5 6h2M5.5 8.5h2M5.5 11h2M2.5 13.5h11"/>',
  card: '<rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="M2 6.5h12M4.5 10h2.5"/>',
  sliders: '<path d="M2 4.5h6M11 4.5h3M2 11.5h3M8 11.5h6"/><circle cx="9.5" cy="4.5" r="1.5"/><circle cx="6.5" cy="11.5" r="1.5"/>',
  doc: '<path d="M4 2.5h5l3 3v8H4zM9 2.5v3h3M6 8.5h4M6 11h4"/>',
  logout: '<path d="M6.5 3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.5M9.5 5.5L12.5 8l-3 2.5M12 8H6.5"/>',
};
const initials = (name) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export const mount = (el, opts = {}) => {
  if (mounted.has(el)) return mounted.get(el);
  const original = el.innerHTML;
  const data = { name: 'Camila Ríos', email: 'camila@ledger.example', company: 'Kovix SRL', plan: 'PRO', ...opts.data };
  const items = opts.items ?? [
    { id: 'profile', label: 'Mi perfil', icon: 'user', href: '#' },
    { id: 'company', label: 'Empresa', value: data.company, tone: 'info', icon: 'building', href: '#' },
    { id: 'plan', label: 'Plan', value: data.plan, tone: 'accent', icon: 'card', href: '#' },
    { id: 'settings', label: 'Configuración', icon: 'sliders', href: '#' },
    { id: 'terms', label: 'Términos y políticas', icon: 'doc', href: '#', external: true },
  ];
  const id = uid('pd-');
  el.classList.add('pd');
  el.innerHTML = `
    <div class="pd__wrap">
      <button class="pd__trigger" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="${id}-menu">
        <span class="pd__who"><span class="pd__name">${escapeHtml(data.name)}</span><span class="pd__email">${escapeHtml(data.email)}</span></span>
        <span class="pd__ring" style="--hue:${hueOf(data.name)}"><span class="pd__face" aria-hidden="true">${escapeHtml(initials(data.name))}</span></span>
      </button>
      <span class="pd__bend" aria-hidden="true"><svg viewBox="0 0 12 24" width="12" height="24" fill="none"><path d="M2 4C6 8 6 16 2 20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
    </div>
    <div class="pd__menu" id="${id}-menu" role="menu" aria-label="Cuenta de ${escapeHtml(data.name)}" hidden>
      <div class="pd__list">${items.map((it) => `
        <a class="pd__item" role="menuitem" tabindex="-1" href="${escapeHtml(it.href ?? '#')}" data-id="${escapeHtml(it.id)}"${it.external ? ' target="_blank" rel="noopener"' : ''}>
          <span class="pd__lead">${g(ICONS[it.icon] ?? '')}<span class="pd__label">${escapeHtml(it.label)}</span></span>
          ${it.value ? `<span class="pd__badge" data-tone="${it.tone ?? 'accent'}">${escapeHtml(it.value)}</span>` : ''}
        </a>`).join('')}
      </div>
      <div class="pd__sep" role="separator"></div>
      <button class="pd__item pd__item--out" role="menuitem" tabindex="-1" type="button" data-id="signout">${g(ICONS.logout)}<span class="pd__label">Cerrar sesión</span></button>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const trigger = $('.pd__trigger');
  const menu = $('.pd__menu');
  const wrap = $('.pd__wrap');
  const rows = [...el.querySelectorAll('.pd__item')];
  let isOpen = false;
  let closeId = 0;
  let destroyed = false;
  const anims = new Set();
  const cleanups = [];
  const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); cleanups.push(() => t.removeEventListener(type, fn, o)); };
  const play = (node, frames, options) => { const a = node.animate(frames, options); anims.add(a); a.finished.then(() => anims.delete(a), () => anims.delete(a)); return a; };

  const open = (viaKeyboard) => {
    if (isOpen) return;
    isOpen = true;
    closeId += 1;
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    wrap.dataset.open = 'true';
    place(menu, trigger, { align: 'end', gap: 4 });
    play(menu, reduced()
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateY(-8px) scale(0.95)' }, { opacity: 1, transform: 'none' }], { duration: reduced() ? 120 : 150, easing: EASE });
    cascade(menu);
    if (viaKeyboard) rows[0].focus(); else menu.focus({ preventScroll: true });
  };
  const close = (returnFocus) => {
    if (!isOpen) return;
    isOpen = false;
    const mine = ++closeId;
    trigger.setAttribute('aria-expanded', 'false');
    delete wrap.dataset.open;
    play(menu, reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.95)' }], { duration: reduced() ? 100 : 150, easing: EASE }).finished.then(() => { if (mine === closeId && !destroyed) menu.hidden = true; }, () => {});
    if (returnFocus) trigger.focus();
  };

  menu.tabIndex = -1;
  on(trigger, 'click', (e) => { if (isOpen) close(false); else open(e.detail === 0); });
  on(trigger, 'keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(true); if (e.key === 'ArrowUp') rows.at(-1).focus(); } });
  on(menu, 'click', (e) => {
    const row = e.target.closest('.pd__item');
    if (!row) return;
    if (row.getAttribute('href') === '#') e.preventDefault();
    el.dispatchEvent(new CustomEvent('profile:select', { detail: { id: row.dataset.id }, bubbles: true }));
    close(true);
  });
  on(menu, 'keydown', (e) => {
    const i = rows.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); rows[(i + 1) % rows.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); rows[(i - 1 + rows.length) % rows.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); rows[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); rows.at(-1).focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close(false);
  });
  on(menu, 'pointermove', (e) => { const row = e.target.closest('.pd__item'); if (row && e.pointerType === 'mouse' && document.activeElement !== row) row.focus({ preventScroll: true }); });
  on(document, 'pointerdown', (e) => { if (isOpen && !el.contains(e.target)) close(false); });
  on(window, 'resize', () => close(false));

  const api = {
    open: () => open(false),
    close: () => close(false),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const a of anims) a.cancel();
      for (const off of cleanups) off();
      el.classList.remove('pd');
      el.innerHTML = original;
      mounted.delete(el);
    },
  };
  mounted.set(el, api);
  return api;
};

if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-motion="profile-dropdown"]')) mount(el);
