// What the demo pages of the Magic UI ports share: the light/dark switch, the icons they draw and the
// Ledger content they show (a back office of invoices and clients). Not part of any component.
import { escapeHtml } from '../core.js';

const ICONS = {
  coin: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>',
  invoice: '<path d="M6 3.5h8l4 4V20.5H6z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-3.6 3.4-5.5 7-5.5s6.4 1.9 7 5.5"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2.25"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  bank: '<path d="M3 9.5L12 4l9 5.5M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 20h18"/>',
  shield: '<path d="M12 3l7 3v5.5c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  sheet: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M4 9h16M4 14.5h16M10 9v11.5"/>',
  ledger: '<path d="M6 4h11a1 1 0 0 1 1 1v15H7a1 1 0 0 1-1-1z"/><path d="M6 17h12M9.5 8h5M9.5 11.5h5"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5h4"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12v.01"/>',
  users: '<circle cx="9" cy="8.5" r="3"/><path d="M3 19.5c.5-3.2 2.8-4.8 6-4.8s5.5 1.6 6 4.8"/><path d="M16 5.8a3 3 0 0 1 0 5.4M18 14.8c1.8.6 2.8 2 3 4.2"/>',
  trend: '<path d="M3.5 17l5.5-6 4 4 7-8M15 7h5v5"/>',
  rings: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/>',
};
export const svgIcon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// A notification card of the list: tone is success, warning, danger, info or accent.
export const notice = ({ icon, tone, title, time, text, href }) => {
  const figure = document.createElement('figure');
  figure.className = 'mu-notice';
  const name = href ? `<a class="mu-notice__link" href="${escapeHtml(href)}">${escapeHtml(title)}</a>` : escapeHtml(title);
  figure.innerHTML = `<div class="mu-notice__icon" data-tone="${tone}">${svgIcon(icon)}</div><div class="mu-notice__body"><figcaption class="mu-notice__title"><span>${name}</span><span class="mu-notice__dot" aria-hidden="true">·</span><span class="mu-notice__time">${escapeHtml(time)}</span></figcaption><p class="mu-notice__text">${escapeHtml(text)}</p></div>`;
  return figure;
};

export const activity = [
  { icon: 'coin', tone: 'success', title: 'Cobro recibido', time: 'hace 2 min', text: 'Transferencia de $ 184.500 · Ferretería Alvear' },
  { icon: 'invoice', tone: 'accent', title: 'Factura emitida', time: 'hace 5 min', text: 'A-0004-00001284 · Estudio Quiroga' },
  { icon: 'user', tone: 'info', title: 'Cliente nuevo', time: 'hace 12 min', text: 'Bodega Los Álamos se sumó a tu cartera' },
  { icon: 'clock', tone: 'warning', title: 'Cobro vencido', time: 'hace 18 min', text: 'Taller Morán · 15 días de atraso' },
  { icon: 'check', tone: 'success', title: 'Pagos conciliados', time: 'hace 25 min', text: '6 movimientos del banco coinciden con facturas' },
  { icon: 'mail', tone: 'info', title: 'Recordatorios enviados', time: 'hace 40 min', text: '3 mails de cobranza salieron esta mañana' },
  { icon: 'coin', tone: 'success', title: 'Cobro recibido', time: 'hace 1 h', text: 'Depósito de $ 92.300 · Librería Del Sur' },
  { icon: 'invoice', tone: 'accent', title: 'Factura emitida', time: 'hace 2 h', text: 'A-0004-00001283 · Transportes Cuyo' },
];

export const clients = ['Ferretería Alvear', 'Estudio Quiroga', 'Bodega Los Álamos', 'Taller Morán', 'Café Palermo', 'Librería Del Sur', 'Transportes Cuyo', 'Clínica Belgrano'];
// A client "logo": a monogram tile in a hue taken from the name and the name beside it.
export const logo = (name) => {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const initials = name.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('');
  const figure = document.createElement('figure');
  figure.className = 'mu-logo';
  figure.innerHTML = `<span class="mu-logo__mark" style="--h: ${h}" aria-hidden="true">${escapeHtml(initials)}</span><figcaption>${escapeHtml(name)}</figcaption>`;
  return figure;
};

// The light/dark switch of a demo page: buttons `[data-mu-theme]` inside a `role="radiogroup"`.
export const themeSwitch = () => {
  const buttons = [...document.querySelectorAll('[data-mu-theme]')];
  const apply = (theme) => {
    document.documentElement.dataset.theme = theme;
    for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.muTheme === theme));
  };
  for (const b of buttons) b.addEventListener('click', () => apply(b.dataset.muTheme));
  buttons.forEach((b, i) => b.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = buttons[(i + step + buttons.length) % buttons.length];
    next.focus();
    apply(next.dataset.muTheme);
  }));
  apply(new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light');
};
