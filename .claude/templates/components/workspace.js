// The parts of Configuración that are not a form: the plan and what was used of it (Usage Meter), the integrations
// drawn as beams of light into Ledger (Animated Beam) with a button that syncs them behind a loader (Loader), the
// invoice templates as cards that focus one and blur the rest (Focus Cards), the seats of the team (Team Selector) and
// the walk-through «Cómo conciliar», whose steps scroll while a panel stays (Sticky Scroll Reveal).
//
//   const workspace = mountWorkspace({ usage, beam, sync, templates, team, steps }, { toast });
//   usage: { invoices, storage }, the hosts of the two meters. toast(message, options): how it says what happened.
//   workspace.setUsage({ paid, sent, overdue, draft }): the invoices issued this month by status; the meters show them
//   against the plan, and the space the PDFs take follows from them. workspace.destroy()
import { escapeHtml } from './core.js';
import { tooltips } from './components.js';
import { mount as usageMeter } from './motion/usage-meter.js';
import { mount as animatedBeam } from './motion/animated-beam.js';
import { mount as focusCards } from './motion/focus-cards.js';
import { mount as teamSelector } from './motion/team-selector.js';
import { mount as stickyScroll } from './motion/sticky-scroll-reveal.js';
import { mount as loader } from './motion/kk-loader.js';

const ICONS = {
  bank: '<path d="M3 9.5L12 4l9 5.5M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 20h18"/>',
  shield: '<path d="M12 3l7 3v5.5c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  ledger: '<path d="M6 4h11a1 1 0 0 1 1 1v15H7a1 1 0 0 1-1-1z"/><path d="M6 17h12M9.5 8h5M9.5 11.5h5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  sheet: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M4 9h16M4 14.5h16M10 9v11.5"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
// Each node carries its name under it (the beams still start at the circle's center); the number orders their arrival.
const node = (id, label, name, n, hub = false) => `<div class="mu-beam__cell" style="--n:${n}"><div class="mu-beam__node${hub ? ' mu-beam__node--hub' : ''}" data-beam-node="${id}" role="img" aria-label="${label}">${icon(name)}</div><span class="mu-beam__name" aria-hidden="true">${label}</span></div>`;
const SPINNER = '<svg class="spinner" viewBox="0 0 16 16" aria-hidden="true"><circle class="spinner__track" cx="8" cy="8" r="6" pathLength="100"/><circle class="spinner__arc" cx="8" cy="8" r="6" pathLength="100"/></svg>';
const CHECK = '<svg class="icon check-draw" viewBox="0 0 16 16" stroke-width="2" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';

const L = (cls = '') => `<span class="tpl__line ${cls}"></span>`;
const table = (n) => `<div class="tpl__table">${Array.from({ length: n }, (_, i) => L(i % 2 ? 'tpl__line--w3' : 'tpl__line--w4')).join('')}</div>`;
const TEMPLATES = [
  { id: 'classic', name: 'Clásica', note: 'Logo a la izquierda, detalle en tabla', hue: 40, sheet: `<div class="tpl__row"><span class="tpl__mark"></span><div class="tpl__head">${L('tpl__line--w4 tpl__line--strong')}${L('tpl__line--w3')}</div></div>${L('tpl__line--w2')}${table(5)}<span class="tpl__total"></span>` },
  { id: 'minimal', name: 'Minimalista', note: 'Solo lo necesario, mucho aire', hue: 200, sheet: `${L('tpl__line--w1 tpl__line--strong')}${L('tpl__line--w2')}${table(3)}<span class="tpl__total"></span>` },
  { id: 'band', name: 'Con banda de color', note: 'Encabezado de marca', hue: 150, sheet: `<span class="tpl__band"></span>${L('tpl__line--w2')}${L('tpl__line--w3')}${table(4)}<span class="tpl__total"></span>` },
];

const VISUALS = [
  `<div class="viz__row"><span style="width:55%"></span></div><div class="viz__row"><span style="width:70%"></span></div><div class="viz__row"><span style="width:42%"></span></div><div class="viz__row"><span style="width:63%"></span></div>`,
  [60, 45, 70].map((w, i) => `<div class="viz__pair"><div class="viz__row"><span style="width:${w}%"></span></div><span class="viz__link"></span><div class="viz__row viz__row--on"><span style="width:${[60, 75, 50][i]}%"></span></div></div>`).join(''),
  '<span class="viz__done"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.25 12.75l4.5 4.5 9-10.5"/></svg></span>',
];
const STEPS = [
  ['Importás el extracto', 'Subís el archivo de tu banco y Ledger lee cada movimiento: fecha, concepto, importe y referencia. No hace falta preparar nada antes.'],
  ['Ledger propone coincidencias', 'Cada cobro se cruza con la factura que mejor le calza por cliente, importe y referencia. Lo dudoso queda aparte para que lo revises vos.'],
  ['Confirmás y cerrás el mes', 'Aceptás las coincidencias de una vez o una por una. Al terminar, el mes queda cerrado y cada factura dice cuándo y cómo se cobró.'],
];

// What the plan includes and what a stored invoice weighs: one PDF is about 0.42 MB; the attachments and the templates are
// what the account already held.
const PLAN = { invoices: 50, storageMb: 100 };
const PDF_MB = 0.42;
// `used` is the participle that agrees with what is measured: «usadas» for invoices, «usados» for megabytes.
const meterWords = (used) => ({
  free: 'Disponibles', over: 'Excedidos', almostFull: 'Casi completo',
  freeBadge: (t) => `${t} disponibles`, overBadge: (t) => `${t} de más`,
  used: (u, limit) => `${u ? `${u} ` : ''}de ${limit} ${used}`, srUsed: (t, limit) => `${t} de ${limit} ${used}`,
  inCategory: (u, label, share) => `${u ? `${u} ` : ''}en ${label} · ${share}% del plan`,
  freeCaption: (u) => `${u ? `${u} ` : ''}disponibles`, overCaption: (u) => `${u ? `${u} ` : ''}por encima del límite`,
  summary: (label, total, limit, parts, status, over, free) => `${label}: ${total} de ${limit} ${used}. ${parts}. ${status === 'over' ? `Superaste el límite por ${over}.` : `Quedan ${free}${status === 'near' ? ', casi completo' : ''}.`}`,
  announce: (status, over, free) => (status === 'over' ? `Superaste el límite del plan por ${over}.` : status === 'near' ? `Casi completo. Quedan ${free}.` : `Dentro del límite. Quedan ${free}.`),
  byCategory: (label) => `${label} por categoría`,
});
const issuedSegments = ({ paid, sent, overdue, draft }) => [{ id: 'paid', label: 'Pagadas', value: paid }, { id: 'sent', label: 'Enviadas', value: sent }, { id: 'overdue', label: 'Vencidas', value: overdue }, { id: 'draft', label: 'Borradores', value: draft }];
const storageSegments = (issued) => [{ id: 'pdf', label: 'PDF', value: +(issued * PDF_MB).toFixed(1) }, { id: 'attach', label: 'Adjuntos', value: 38.6 }, { id: 'tpl', label: 'Plantillas', value: 4.2 }];

export const mountWorkspace = ({ usage, beam, sync, templates, team, steps }, { toast }) => {
  const handles = [];
  let timer = 0;
  let settle = 0;

  // Plan and use: the meters are mounted with the first figures they are given, and moved to the new ones after that.
  let meters = null;
  const setUsage = (counts) => {
    const issued = counts.paid + counts.sent + counts.overdue + counts.draft;
    if (meters) { meters.invoices.update({ segments: issuedSegments(counts) }); meters.storage.update({ segments: storageSegments(issued) }); return; }
    meters = {
      invoices: usageMeter(usage.invoices, { label: 'Facturas emitidas este mes', unit: { one: 'factura', other: 'facturas' }, decimals: 0, limit: PLAN.invoices, segments: issuedSegments(counts), labels: meterWords('usadas') }),
      storage: usageMeter(usage.storage, { label: 'Almacenamiento de PDFs', unit: 'MB', decimals: 1, limit: PLAN.storageMb, segments: storageSegments(issued), labels: meterWords('usados') }),
    };
    handles.push(meters.invoices, meters.storage);
  };

  // Integrations: the four services and Ledger, with a light running between them.
  beam.innerHTML = `<div class="mu-beam" role="group" aria-label="Integraciones de Ledger"><div class="mu-beam__layout">
    <div class="mu-beam__col">${node('banco', 'Banco', 'bank', 0)}${node('afip', 'AFIP', 'shield', 1)}</div>
    <div class="mu-beam__col">${node('ledger', 'Ledger', 'ledger', 2, true)}</div>
    <div class="mu-beam__col">${node('mail', 'Correo', 'mail', 3)}${node('planilla', 'Planilla', 'sheet', 4)}</div>
  </div></div>`;
  const drawBeams = () => animatedBeam(beam.firstElementChild, { duration: 3, beams: [{ from: 'banco', to: 'ledger' }, { from: 'afip', to: 'ledger' }, { from: 'ledger', to: 'mail' }, { from: 'ledger', to: 'planilla' }] });
  let beams = drawBeams();

  // Sync: the button is in its loading state and the diagram gives its place to a loader while the services answer;
  // then the diagram comes back and the button says it is done before it is ready again.
  const syncHtml = sync.innerHTML;
  const syncName = sync.textContent.trim();
  sync.innerHTML = `<span class="btn__label">${escapeHtml(syncName)}</span><span class="btn__state btn__state--loading">${SPINNER}Sincronizando…</span><span class="btn__state btn__state--success">${CHECK}Sincronizado</span>`;
  sync.setAttribute('aria-label', syncName);
  const onSync = () => {
    if (sync.dataset.busy !== undefined) return;
    sync.dataset.busy = '';
    sync.dataset.state = 'loading';
    sync.setAttribute('aria-busy', 'true');
    sync.setAttribute('aria-disabled', 'true');
    beams.destroy();
    beam.hidden = true;
    const holder = Object.assign(document.createElement('div'), { className: 'ws-loader' });
    beam.after(holder);
    const spinner = loader(holder, { size: 'sm', title: 'Sincronizando con el banco…', subtitle: 'Conciliando movimientos con tus facturas' });
    timer = setTimeout(() => {
      spinner.destroy();
      holder.remove();
      beam.hidden = false;
      beams = drawBeams();
      sync.dataset.state = 'success';
      sync.removeAttribute('aria-busy');
      toast('Sincronizado: 6 movimientos conciliados', { tone: 'success' });
      settle = setTimeout(() => {
        delete sync.dataset.state;
        delete sync.dataset.busy;
        sync.removeAttribute('aria-disabled');
      }, 1400);
    }, 2400);
  };
  sync.addEventListener('click', onSync);

  // Templates: a drawn invoice each; choosing one says so.
  templates.innerHTML = TEMPLATES.map((t) => `<button type="button" class="ac-focus__card" data-card data-template="${t.id}" aria-pressed="${t.id === 'classic'}"><span class="tpl" style="--h:${t.hue}" aria-hidden="true"><span class="tpl__sheet">${t.sheet}</span></span><span class="ac-focus__cap"><span class="ac-focus__title">${escapeHtml(t.name)}</span><span class="ac-focus__sub">${escapeHtml(t.note)}</span></span></button>`).join('');
  handles.push(focusCards(templates));
  const onTemplate = (e) => {
    const card = e.target.closest('[data-template]');
    if (!card) return;
    for (const c of templates.querySelectorAll('[data-template]')) c.setAttribute('aria-pressed', String(c === card));
    toast(`Plantilla «${card.querySelector('.ac-focus__title').textContent}» para la próxima factura`);
  };
  templates.addEventListener('click', onTemplate);

  // Team: how many people issue invoices.
  handles.push(teamSelector(team, { label: 'Puestos de facturación', defaultValue: 2 }));
  tooltips(team);

  // The walk-through of reconciling.
  steps.innerHTML = STEPS.map(([title, text], i) => `<section data-step><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p><div data-visual class="viz">${VISUALS[i]}</div></section>`).join('');
  handles.push(stickyScroll(steps));

  return {
    setUsage,
    destroy() {
      clearTimeout(timer);
      clearTimeout(settle);
      sync.removeEventListener('click', onSync);
      sync.innerHTML = syncHtml;
      sync.removeAttribute('aria-label');
      for (const attr of ['data-state', 'data-busy', 'aria-busy', 'aria-disabled']) sync.removeAttribute(attr);
      templates.removeEventListener('click', onTemplate);
      beams.destroy();
      for (const h of handles) h.destroy();
    },
  };
};
