// The cards of the Clientes view: each client is a card that opens into its record. On a computer the card morphs
// into a dialog (Morphing Dialog port); on a phone it opens into a sheet that fills the screen (Expandable Card port).
// The record shows the contact, the balance, the CUIT with a button that copies it, the team that looks after the
// account (Animated Tooltip: the name and role follow the pointer) and the invoices, each with its number to copy.
//
//   const cards = mountClientCards(host, { clients, invoicesOf });
//   clients: [{ name, contact, count, balance, tone, state }]
//   invoicesOf(name): [{ number, state, label, amount, due }]
//   cards.render(): draws them again (a client was added, an invoice changed); cards.destroy()
import { escapeHtml, format, hueOf } from './core.js';
import { mount as morphingDialog } from './motion/morphing-dialog.js';
import { mount as expandableCard } from './motion/expandable-card.js';
import { mount as copyButton } from './motion/copy-button.js';
import { mount as animatedTooltip } from './motion/animated-tooltip.js';
import { mount as magicCard } from './motion/magic-card.js';

const TEAM = [
  { name: 'María Soto', role: 'Cobranzas' },
  { name: 'Pablo Reyes', role: 'Contabilidad' },
  { name: 'Lucía Vega', role: 'Cuentas corrientes' },
  { name: 'Carla Ibáñez', role: 'Atención a clientes' },
];
const PHONE = '(max-width: 767px)';

const initials = (name) => name.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
// A CUIT that is always the same for the same name: the prefix of a company, eight digits and a check digit.
export const cuitOf = (name) => {
  let n = 0;
  for (const ch of name) n = (n * 131 + ch.charCodeAt(0)) % 100000000;
  const body = String(n).padStart(8, '0');
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = `30${body}`.split('').map(Number);
  const sum = digits.reduce((s, d, i) => s + d * weights[i], 0);
  const check = (11 - (sum % 11)) % 11 === 10 ? 9 : (11 - (sum % 11)) % 11;
  return `30-${body}-${check}`;
};
const teamOf = (name) => { const start = hueOf(name) % TEAM.length; return [0, 1, 2].map((i) => TEAM[(start + i) % TEAM.length]); };

const teamHtml = (name) => `<div class="client-team" data-motion="animated-tooltip" role="group" aria-label="Equipo asignado">${teamOf(name).map((m) => `<button type="button" class="ac-tip__item" data-name="${escapeHtml(m.name)}" data-role="${escapeHtml(m.role)}"><span class="ac-tip__face" style="--h: ${hueOf(m.name)}">${escapeHtml(initials(m.name))}</span></button>`).join('')}</div>`;
const invoicesHtml = (list) => (list.length
  ? `<table class="client-invoices"><thead><tr><th>Factura</th><th>Vence</th><th>Estado</th><th>Importe</th></tr></thead><tbody>${list.map((i) => `<tr><td><span class="client-invoices__number">${escapeHtml(i.number)}<button type="button" class="client-copy" data-motion="copy-button" data-copy="${escapeHtml(i.number)}" data-variant="ghost" data-size="sm" aria-label="Copiar número ${escapeHtml(i.number)}"></button></span></td><td>${escapeHtml(i.due)}</td><td><span class="badge"${i.tone ? ` data-tone="${i.tone}"` : ' data-plain'}>${escapeHtml(i.label)}</span></td><td>${format.currency(i.amount)}</td></tr>`).join('')}</tbody></table>`
  : '<p class="client-empty">Todavía no tiene facturas.</p>');
const recordHtml = (client, invoices) => `
  <dl class="client-dl">
    <dt>CUIT</dt><dd class="client-cuit"><span>${cuitOf(client.name)}</span><button type="button" class="client-copy" data-motion="copy-button" data-copy="${cuitOf(client.name)}" data-variant="ghost" data-size="sm" aria-label="Copiar CUIT de ${escapeHtml(client.name)}"></button></dd>
    <dt>Contacto</dt><dd>${escapeHtml(client.contact)}</dd>
    <dt>Saldo</dt><dd>${format.currency(client.balance)}</dd>
    <dt>Equipo</dt><dd>${teamHtml(client.name)}</dd>
  </dl>
  ${invoicesHtml(invoices)}`;

const cardHtml = (client, invoices) => `
  <span class="client-card__top"><span class="mdlg-avatar" data-md="image" style="--hue: ${hueOf(client.name)}" aria-hidden="true">${escapeHtml(initials(client.name))}</span><span class="badge"${client.tone ? ` data-tone="${client.tone}"` : ' data-plain'}>${escapeHtml(client.state)}</span></span>
  <span class="client-card__name" data-md="title">${escapeHtml(client.name)}</span>
  <span class="client-card__meta" data-md="subtitle">${escapeHtml(client.contact)} · ${client.count} ${client.count === 1 ? 'factura' : 'facturas'}</span>
  <span class="client-card__balance">${format.currency(client.balance)}<small>de saldo</small></span>`;

export const mountClientCards = (host, { clients, invoicesOf }) => {
  const handles = [];
  const media = matchMedia(PHONE);
  const enhance = (root) => {
    for (const el of root.querySelectorAll('[data-motion="copy-button"]')) copyButton(el);
    for (const el of root.querySelectorAll('[data-motion="animated-tooltip"]')) animatedTooltip(el);
  };
  // The record is built when a card opens, so what is inside it is mounted when it appears in the page.
  const watcher = new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1 && (n.matches('.mdlg-portal, .ac-xc__layer') || n.querySelector('.mdlg-portal, .ac-xc__layer'))) enhance(n);
  });
  watcher.observe(document.body, { childList: true });

  const clear = () => { while (handles.length) handles.pop().destroy(); host.replaceChildren(); host.removeAttribute('data-motion'); };

  const render = () => {
    clear();
    host.className = 'client-cards';
    if (media.matches) {
      host.dataset.motion = 'expandable-card';
      host.dataset.closeLabel = 'Cerrar ficha';
      host.setAttribute('role', 'list');
      for (const client of clients()) {
        const invoices = invoicesOf(client.name);
        const li = document.createElement('div');
        li.setAttribute('role', 'listitem');
        li.dataset.card = '';
        li.className = 'client-xc';
        li.innerHTML = `<div class="ac-xc__media" data-part="media"><span class="ac-xc__mono" aria-hidden="true" style="--h: ${hueOf(client.name)}">${escapeHtml(initials(client.name))}</span></div><div class="ac-xc__text"><h3 data-part="title"><button type="button" class="ac-xc__trigger">${escapeHtml(client.name)}</button></h3><p data-part="description">${escapeHtml(client.contact)} · saldo ${format.currency(client.balance)}</p></div><template data-part="detail">${recordHtml(client, invoices)}</template>`;
        host.append(li);
      }
      handles.push(expandableCard(host, { closeLabel: 'Cerrar ficha' }));
      return;
    }
    host.removeAttribute('role');
    for (const client of clients()) {
      const invoices = invoicesOf(client.name);
      const root = document.createElement('div');
      root.dataset.motion = 'morphing-dialog';
      root.className = 'client-card-root';
      root.innerHTML = `<button type="button" class="client-card" data-md="trigger">${cardHtml(client, invoices)}</button>
        <template data-md="content"><div class="mdlg-sheet client-sheet">
          <div class="mdlg-sheet__head"><span class="mdlg-avatar mdlg-avatar--lg" data-md="image" style="--hue: ${hueOf(client.name)}" aria-hidden="true">${escapeHtml(initials(client.name))}</span><div><div data-md="title">${escapeHtml(client.name)}</div><div data-md="subtitle">CUIT ${cuitOf(client.name)}</div></div></div>
          <div class="mdlg-sheet__body" data-md="description">${recordHtml(client, invoices)}</div>
        </div></template>`;
      host.append(root);
      handles.push(magicCard(root), morphingDialog(root, { closeLabel: 'Cerrar ficha' }));
    }
  };

  media.addEventListener('change', render);
  render();
  return {
    render,
    destroy() { media.removeEventListener('change', render); watcher.disconnect(); clear(); },
  };
};
