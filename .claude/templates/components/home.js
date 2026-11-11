// The Inicio view of Ledger: a bento grid whose cells host the figures of the month (a ticker that counts on
// entering), the latest activity (an animated list), the collection rings, the collection goal (a gauge) and the
// clients' logos (a marquee); under it what was billed by status (a donut), what was collected over 7, 30 or 90 days
// (a line chart that morphs between ranges) and the days of collections and due dates (a heatmap); and «Por revisar»:
// the draft invoices as a stack to approve or reject by swiping. Everything is computed from the data the screen
// hands over, so it says what the invoices say.
//
//   const home = mountHome({ bento, review, status, income, activity }, { invoices, clients, skip, onDecide, collected, today });
//   invoices: [{ number, client, status: 'paid' | 'sent' | 'overdue' | 'draft', amount, month, due }]
//   clients:  [{ name, contact }]
//   skip: a Set of draft numbers that are not offered for review (the ones already rejected).
//   onDecide(number, 'approved' | 'rejected'): the screen applies the decision.
//   status: the element that holds the donut. income: { total, delta, label, range, chart }, the figure of what was
//   collected, its change, the words that name the period, the segmented control of the range and the host of the chart.
//   activity: { host, readout }, the heatmap and the line under it that says what falls due on the chosen day.
//   collected: what was collected in each of the last six months, oldest first; today: 'YYYY-MM-DD'.
//   home.destroy()
import { escapeHtml, format, hueOf, currencyOf, locale } from './core.js';
import { ui, tooltips } from './components.js';
import { mount as bentoGrid } from './motion/bento-grid.js';
import { mount as animatedList } from './motion/animated-list.js';
import { mount as appleActivityCard } from './motion/apple-activity-card.js';
import { mount as circularProgress } from './motion/animated-circular-progress-bar.js';
import { mount as marquee } from './motion/marquee.js';
import { mount as numberTicker } from './motion/number-ticker.js';
import { mount as cardStack } from './motion/card-stack.js';
import { mount as donutChart } from './motion/donut-chart.js';
import { mount as lineChart } from './motion/line-chart.js';
import { mount as activityHeatmap } from './motion/activity-heatmap.js';

const ICONS = {
  coin: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>',
  invoice: '<path d="M6 3.5h8l4 4V20.5H6z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.01"/>',
  draft: '<path d="M6 3.5h8l4 4V20.5H6z"/><path d="M14 3.5v4h4"/>',
  send: '<path d="M21 3l-9 9M21 3l-6 18-3-8-8-3z"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5h4"/>',
  users: '<circle cx="9" cy="8.5" r="3"/><path d="M3 19.5c.5-3.2 2.8-4.8 6-4.8s5.5 1.6 6 4.8"/><path d="M16 5.8a3 3 0 0 1 0 5.4M18 14.8c1.8.6 2.8 2 3 4.2"/>',
  trend: '<path d="M3.5 17l5.5-6 4 4 7-8M15 7h5v5"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12v.01"/>',
  rings: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const PAUSE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><g class="home-bg__pausebars"><path d="M5.5 3.5v9M10.5 3.5v9"/></g><path class="home-bg__play" d="M5 3.5l7 4.5-7 4.5z"/></svg>';
const DONE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.25 12.75l4.5 4.5 9-10.5"/></svg>';

const SENTENCE = {
  paid: { icon: 'coin', tone: 'success', title: 'Cobro recibido' },
  overdue: { icon: 'clock', tone: 'warning', title: 'Cobro vencido' },
  sent: { icon: 'send', tone: 'info', title: 'Factura enviada' },
  draft: { icon: 'draft', tone: 'accent', title: 'Borrador creado' },
};
// What the donut says by status: the colour is the status, the same one the badges of the table use.
const STATUS_LABEL = { paid: 'Pagada', sent: 'Enviada', overdue: 'Vencida', draft: 'Borrador' };
const STATUS_COLOR = { paid: 'var(--success)', sent: 'var(--info)', overdue: 'var(--danger)', draft: 'color-mix(in oklab, var(--text) 42%, var(--surface-raised))' };

const money = (value) => format.currency(value, undefined, { maximumFractionDigits: 0 });
const sum = (rows, pick = (r) => r.amount) => rows.reduce((total, r) => total + pick(r), 0);
const share = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const feedItem = (invoice, i) => {
  const s = SENTENCE[invoice.status];
  const figure = document.createElement('figure');
  figure.className = 'mu-notice';
  const ago = ['hace 2 min', 'hace 12 min', 'hace 25 min', 'hace 1 h', 'hace 3 h', 'ayer', 'ayer', 'hace 2 días'][i] ?? 'hace una semana';
  figure.innerHTML = `<div class="mu-notice__icon" data-tone="${s.tone}">${icon(s.icon)}</div><div class="mu-notice__body"><figcaption class="mu-notice__title"><span><a class="mu-notice__link" href="#/facturas/${escapeHtml(invoice.number)}">${escapeHtml(s.title)}</a></span><span class="mu-notice__dot" aria-hidden="true">·</span><span class="mu-notice__time">${ago}</span></figcaption><p class="mu-notice__text">${escapeHtml(invoice.number)} · ${escapeHtml(invoice.client)} · ${money(invoice.amount)}</p></div>`;
  return figure;
};

const logo = (name) => {
  const initials = name.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('');
  const figure = document.createElement('figure');
  figure.className = 'home-logo';
  figure.innerHTML = `<span class="home-logo__mark" style="--h: ${hueOf(name)}" aria-hidden="true">${escapeHtml(initials)}</span><figcaption>${escapeHtml(name)}</figcaption>`;
  return figure;
};

const cardOf = (invoice) => ({
  id: invoice.number,
  amount: money(invoice.amount),
  client: invoice.client,
  description: `Borrador ${invoice.number}, vence el ${invoice.due}.`,
  specs: [{ label: 'Número', value: invoice.number }, { label: 'Vence', value: invoice.due }, { label: 'IVA', value: '21 %' }, { label: 'Estado', value: 'Borrador' }],
});

// ── The days: what was collected each day (a deterministic series that follows the month it falls in) and how many
// collections and due dates each day had. The invoices of the screen are in them as they are; the rest is the history
// around them, the same every time. ──
const DAY = 86_400_000;
const toUtc = (iso) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (t) => new Date(t).toISOString().slice(0, 10);
const noise = (t, seed = 0) => (((Math.floor(t / DAY) * 7919 + seed * 104729) % 97) + 97) % 97 / 97;
const WEEK = [0.12, 1, 1.15, 1.05, 1.2, 0.95, 0.3];
const monthIndex = (t, endT, monthly) => {
  const a = new Date(t);
  const b = new Date(endT);
  return Math.min(monthly.length - 1, Math.max(0, monthly.length - 1 - ((b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth())));
};
const incomeOn = (t, endT, monthly) => Math.round((monthly[monthIndex(t, endT, monthly)] / 21) * WEEK[new Date(t).getUTCDay()] * (0.65 + 0.7 * noise(t, 3)));
const dueIso = (label) => { const [d, m, y] = label.split('/'); return `${y}-${m}-${d}`; };

export const mountHome = ({ bento, review, status, income, activity }, { invoices, clients, skip = new Set(), onDecide, collected, today }) => {
  const handles = [];
  const keep = (handle) => { handles.push(handle); return handle; };
  const host = (cls, inner = '') => Object.assign(document.createElement('div'), { className: `home-bg ${cls}`, innerHTML: inner });

  const month = Math.max(...invoices.map((i) => i.month));
  const thisMonth = invoices.filter((i) => i.month === month);
  const open = invoices.filter((i) => i.status !== 'paid');
  const clientsUpToDate = clients.filter((c) => !invoices.some((i) => i.client === c.name && i.status === 'overdue'));
  const collectedShare = share(sum(invoices.filter((i) => i.status === 'paid')), sum(invoices));

  const cells = [
    {
      name: 'Clientes', description: 'Con quiénes facturás este mes.', icon: icon('users'), href: '#/clientes', cta: 'Ver clientes', span: 1,
      background: (slot) => {
        const el = host('home-bg--clients');
        const row = (names, extra) => { const track = document.createElement('div'); track.dataset.fade = ''; for (const n of names) track.append(logo(n)); el.append(track); return marquee(track, { pauseOnHover: true, duration: 20, ...extra }); };
        const names = clients.map((c) => c.name);
        const a = row(names.slice(0, Math.ceil(names.length / 2)), {});
        const b = row(names.slice(Math.ceil(names.length / 2)), { reverse: true });
        // WCAG 2.2.2: the rows move on their own for longer than 5 s, so one button stops both. It is icon-only: its
        // name is the label and its tooltip says what the next press does.
        const pause = Object.assign(document.createElement('button'), { type: 'button', className: 'mu-marquee__control home-bg__pause', innerHTML: PAUSE_ICON });
        pause.setAttribute('aria-label', 'Pausar movimiento');
        pause.setAttribute('aria-pressed', 'false');
        pause.dataset.tooltip = 'Pausar movimiento';
        pause.addEventListener('click', () => {
          const stop = pause.getAttribute('aria-pressed') !== 'true';
          for (const handle of [a, b]) stop ? handle.pause() : handle.play();
          pause.setAttribute('aria-pressed', String(stop));
          pause.dataset.tooltip = stop ? 'Reanudar movimiento' : 'Pausar movimiento';
        });
        el.append(pause);
        slot.append(el);
        return { destroy: () => { a.destroy(); b.destroy(); } };
      },
    },
    {
      name: 'Actividad reciente', description: 'Cobros, envíos y vencimientos a medida que pasan.', icon: icon('bell'), href: '#/facturas', cta: 'Ver todas las facturas', span: 2,
      background: (slot) => {
        const el = host('home-bg--list');
        const inner = document.createElement('div');
        inner.setAttribute('aria-label', 'Actividad reciente');
        const latest = [...invoices].sort((a, b) => b.number.localeCompare(a.number)).slice(0, 8);
        latest.forEach((invoice, i) => inner.append(feedItem(invoice, i)));
        el.append(inner);
        slot.append(el);
        return animatedList(inner, { delay: 700 });
      },
    },
    {
      name: 'Facturado', description: 'Lo emitido en el mes y cuánto queda por cobrar.', icon: icon('trend'), href: '#/facturas', cta: 'Ver facturas', span: 2,
      background: (slot) => {
        const el = host('home-bg--figures', '<div class="home-figures__big"><span data-v="billed"></span></div><div class="home-figures__row"><div><strong data-v="count"></strong>facturas</div><div><strong data-v="owed"></strong>por cobrar</div></div>');
        slot.append(el);
        const tickers = [
          numberTicker(el.querySelector('[data-v="billed"]'), { value: sum(thisMonth), currency: currencyOf() }),
          numberTicker(el.querySelector('[data-v="count"]'), { value: thisMonth.length }),
          numberTicker(el.querySelector('[data-v="owed"]'), { value: sum(open), currency: currencyOf() }),
        ];
        return { destroy: () => tickers.forEach((t) => t.destroy()) };
      },
    },
    {
      name: 'Meta de cobro', description: 'Lo cobrado sobre lo facturado.', icon: icon('target'), href: '#/facturas', cta: 'Ver la meta', span: 1,
      background: (slot) => {
        const el = host('home-bg--gauge', '<div aria-label="Meta de cobro del mes"></div>');
        slot.append(el);
        return circularProgress(el.firstElementChild, { value: collectedShare });
      },
    },
    {
      name: 'Cobranza del mes', description: 'Facturas cobradas, clientes al día y facturas ya enviadas.', icon: icon('rings'), href: '#/facturas', cta: 'Ver la cobranza', span: 3,
      background: (slot) => {
        const el = host('home-bg--rings', '<div></div>');
        slot.append(el);
        return appleActivityCard(el.firstElementChild, {
          name: 'Cobranza del mes',
          rings: [
            { label: 'COBRADAS', current: invoices.filter((i) => i.status === 'paid').length, target: invoices.length, unit: 'FAC' },
            { label: 'CLIENTES AL DÍA', current: clientsUpToDate.length, target: clients.length, unit: 'CLI' },
            { label: 'ENVIADAS', current: invoices.filter((i) => i.status !== 'draft').length, target: invoices.length, unit: 'FAC' },
          ],
        });
      },
    },
  ];
  keep(bentoGrid(bento, { cells }));
  tooltips(bento);

  // ── Billed by status: the ring says how the total is split, and a row of the legend hides a status. ──
  keep(donutChart(status, {
    data: ['paid', 'sent', 'overdue', 'draft'].map((key) => ({ key, label: STATUS_LABEL[key], value: sum(invoices.filter((i) => i.status === key)), color: STATUS_COLOR[key] })).filter((d) => d.value > 0),
    label: 'Facturación por estado',
    totalLabel: 'Facturado',
    formatValue: (value) => format.currency(value, undefined, { notation: 'compact', maximumFractionDigits: 1 }),
    size: 208,
    thickness: 22,
  }));

  // ── Collected: the line morphs between 7, 30 and 90 days; the figure rolls and its change says how that went against the
  // period before. ──
  const endT = toUtc(today);
  const loc = locale(income.chart);
  const compact = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
  const short = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const long = new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const rangeData = (days) => {
    const every = days <= 7 ? 1 : days <= 30 ? 7 : 15;
    return Array.from({ length: days }, (_, i) => {
      const t = endT - (days - 1 - i) * DAY;
      const before = t - days * DAY;
      return { key: toIso(t), label: long.format(t), axisLabel: (days - 1 - i) % every === 0 ? short.format(t) : undefined, values: { current: incomeOn(t, endT, collected), previous: incomeOn(before, endT, collected) } };
    });
  };
  const ranges = { 7: rangeData(7), 30: rangeData(30), 90: rangeData(90) };
  const totalOf = (days, key) => ranges[days].reduce((s, d) => s + d.values[key], 0);
  let days = Number(income.range.querySelector('[aria-checked=true]')?.dataset.value ?? 30);
  const readout = () => {
    const now = totalOf(days, 'current');
    const before = totalOf(days, 'previous');
    ui.setNumber(income.total, now);
    ui.setDelta(income.delta, now, before, { good: 'up', mode: 'percent' });
    income.delta.title = `frente a los ${days} días anteriores`;
    income.label.textContent = `Cobrado en los últimos ${days} días`;
  };
  income.total.dataset.value = String(totalOf(days, 'current'));
  readout();
  const chart = keep(lineChart(income.chart, {
    data: ranges[days],
    label: 'Ingresos cobrados por día',
    height: 'fill',
    categoryLabel: 'Fecha',
    series: [{ key: 'current', label: 'Este período' }, { key: 'previous', label: 'Período anterior', dashed: true, area: false }],
    formatValue: (v) => money(v),
    formatTick: (v) => `$ ${compact.format(v)}`,
  }));
  const rangeChange = (e) => { days = Number(e.detail.value); chart.update({ data: ranges[days] }); readout(); };
  income.range.addEventListener('change', rangeChange);

  // ── Days: collections and due dates per day over the last six months. ──
  const events = new Map();
  for (const i of invoices) {
    const iso = dueIso(i.due);
    const own = events.get(iso) ?? [];
    own.push(i);
    events.set(iso, own);
  }
  const heatDays = (count) => Array.from({ length: count }, (_, i) => {
    const t = endT - (count - 1 - i) * DAY;
    const weekday = new Date(t).getUTCDay();
    const base = weekday === 0 || weekday === 6 ? (noise(t, 11) < 0.15 ? 1 : 0) : Math.floor(noise(t, 5) ** 1.6 * 6);
    return { date: toIso(t), count: base + (events.get(toIso(t)) ?? []).length * 2 };
  });
  const bar = Object.assign(document.createElement('div'), { className: 'segmented', innerHTML: '<span class="segmented__indicator" aria-hidden="true"></span><button class="segmented__option" role="radio" aria-checked="false" data-value="91">Trimestre</button><button class="segmented__option" role="radio" aria-checked="false" data-value="182">Semestre</button><button class="segmented__option" role="radio" aria-checked="true" data-value="364">Año</button>' });
  bar.setAttribute('role', 'radiogroup');
  bar.setAttribute('aria-label', 'Período del mapa');
  const PERIOD = { 91: 'el último trimestre', 182: 'el último semestre', 364: 'el último año' };
  // The squares grow to fill the width: the stylesheet sizes them by the number of weeks the range has.
  const weeksOf = (count) => { activity.host.style.setProperty('--weeks', String(Math.ceil(count / 7) + 1)); return heatDays(count); };
  const say = (iso) => {
    const list = events.get(iso) ?? [];
    const when = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(toUtc(iso));
    activity.readout.textContent = list.length ? `${when}: ${list.map((i) => `${i.number} · ${i.client} (${STATUS_LABEL[i.status].toLowerCase()})`).join(', ')}.` : `${when}: sin facturas que venzan ese día.`;
  };
  const heat = keep(activityHeatmap(activity.host, {
    label: 'Cobros y vencimientos por día',
    unit: { one: 'movimiento', other: 'movimientos' },
    locale: 'es-AR',
    days: weeksOf(364),
    period: PERIOD[364],
    actions: bar,
    onSelectDate: (date) => { heat.select(date); say(date); },
    labels: {
      in: 'en', less: 'Menos', more: 'Más',
      cell: (n, u, date) => `${n || 'Sin'} ${u}, ${date}`,
      none: (u) => `Sin ${u.other}`,
      legendHelp: (u, ranges) => `Los cuadrados más oscuros tuvieron más ${u.other}. Niveles: ${ranges.join(', ')}.`,
      ranges: (b, u) => ({
        long: [`sin ${u.other}`, b[0] === 1 ? `1 ${u.one}` : `1 a ${b[0]} ${u.other}`, `${b[0] + 1} a ${b[1]} ${u.other}`, `${b[1] + 1} a ${b[2]} ${u.other}`, `${b[2] + 1} o más ${u.other}`],
        short: [`sin ${u.other}`, b[0] === 1 ? `1 ${u.one}` : `1–${b[0]} ${u.other}`, `${b[0] + 1}–${b[1]} ${u.other}`, `${b[1] + 1}–${b[2]} ${u.other}`, `${b[2] + 1}+ ${u.other}`],
      }),
      days: (n) => `${n} ${n === 1 ? 'día' : 'días'}`,
      caption: (dayCount, range) => `${dayCount} con ${range}`,
      highlight: (range) => `Resaltar los días con ${range}`,
      levels: 'Resaltar días por nivel',
    },
  }));
  ui.init(activity.host);
  const periodChange = (e) => { heat.update({ days: weeksOf(Number(e.detail.value)), period: PERIOD[Number(e.detail.value)], selectedDate: null }); activity.readout.textContent = ''; };
  bar.addEventListener('change', periodChange);

  const drafts = invoices.filter((i) => i.status === 'draft' && !skip.has(i.number));
  const stack = drafts.length ? cardStack(review, { cards: drafts.map(cardOf) }) : null;
  const decide = (e) => onDecide?.(e.detail.id, e.detail.decision);
  review.addEventListener('cardstack:decide', decide);
  if (!stack) review.innerHTML = `<div class="home-empty"><span class="home-empty__mark">${DONE_ICON}</span><p>No hay facturas por revisar.</p></div>`;

  // How far through the drafts the review is, under the title; it follows the stack's own count of what is left.
  const copy = review.closest('.home-review')?.querySelector('.home-review__copy');
  const progress = copy && stack ? Object.assign(document.createElement('p'), { className: 'home-review__count' }) : null;
  let watcher = null;
  if (progress) {
    progress.setAttribute('role', 'status');
    const paint = () => {
      const left = Number(review.dataset.remaining ?? drafts.length);
      progress.innerHTML = left > 0 ? `<strong>${drafts.length - left + 1}</strong><span>de ${drafts.length} ${drafts.length === 1 ? 'borrador' : 'borradores'}</span>` : '<span>Todos revisados</span>';
    };
    paint();
    copy.append(progress);
    watcher = new MutationObserver(paint);
    watcher.observe(review, { attributes: true, attributeFilter: ['data-remaining'] });
  }

  return {
    destroy() {
      review.removeEventListener('cardstack:decide', decide);
      income.range.removeEventListener('change', rangeChange);
      bar.removeEventListener('change', periodChange);
      watcher?.disconnect();
      progress?.remove();
      stack?.destroy();
      for (const h of handles) h.destroy();
      bar.remove();
      activity.readout.textContent = '';
      if (!stack) review.replaceChildren();
    },
  };
};
