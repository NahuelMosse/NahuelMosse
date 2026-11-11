// Charts: a line chart and a bar chart, drawn from `data-line` / `data-bars` (+ `data-labels`,
// `data-format`, `data-current`, `data-readout`). The axes are real HTML text at the type scale, never text
// inside a scaled drawing, so a label is as legible in a narrow card as in a wide one; the Y axis is compact
// ($ 10 mil) and each tick carries its number in `data-value`; the line is drawn at the size of its box
// (and redrawn when the box changes), the bars are columns clipped to their value. The scale is round —
// ticks from zero in steps of 1, 2 or 5 × a power of ten — and the top is the first tick that covers
// the data. The point being read is said in the header of the card, never over the plot: the month, the
// figure rolling to its value and how it changed on the month before; at rest it reads the current month.
// Over the plot there is only a fine guide and the active point, which follow the pointer on a spring.
// The header is the element `data-readout` names (an id; it takes the markup of a `.figure`), or a row the
// chart adds above itself. Arrows, Home and End walk the points and a polite live region says the month and
// the figure; a drag on a touch screen walks them too. The accent is the data that matters: the line, the
// current month (`data-current`, the last one by default) and the bar being read; the other bars are a
// tint of it. `setChart(el, values)` gives a chart new data in place: the bars move their clip, they are
// not rebuilt.
import { forever, once, uid, locale, messages, describeChange, escapeHtml, reduced } from './core.js';
import { mount as slidingNumber } from './motion/sliding-number.js';

const read = (el, key) => JSON.parse(el.dataset[key] ?? '[]');
const axisY = (ticks, compact) => `<div class="chart__y">${ticks.map((t) => `<span class="chart__axis" data-value="${t}">${compact.format(t)}</span>`).join('')}</div>`;
// The Y axis is compact: thousands as « k», millions as « M», in the unit of the figure ($ 10 k). The
// suffix is written here, not taken from the locale's short notation, which is not the same one for every
// magnitude.
const formats = (el) => {
  const options = JSON.parse(el.dataset.format ?? '{}');
  const plain = new Intl.NumberFormat(locale(el), { ...options, maximumFractionDigits: 1, minimumFractionDigits: 0 });
  const compact = { format: (v) => { const a = Math.abs(v); const [by, suffix] = a >= 1e9 ? [1e9, ' B'] : a >= 1e6 ? [1e6, ' M'] : a >= 1e3 ? [1e3, ' k'] : [1, '']; return `${plain.format(v / by)}${suffix}`; } };
  return { fmt: new Intl.NumberFormat(locale(el), options), compact, options };
};

// The header that says the point being read: month, figure and change.
const readoutOf = (el, { values, labels, fmt, options }) => {
  const host = (el.dataset.readout && document.getElementById(el.dataset.readout)) || Object.assign(document.createElement('div'), { className: 'figure' });
  if (!host.isConnected) el.before(host);
  host.classList.add('chart__readout');
  host.innerHTML = '<span class="figure__label chart__rd-label"></span><span class="figure__value chart__rd-value"></span><span class="figure__delta chart__rd-delta" hidden></span>';
  const label = host.querySelector('.chart__rd-label');
  const value = host.querySelector('.chart__rd-value');
  const delta = host.querySelector('.chart__rd-delta');
  const live = Object.assign(document.createElement('span'), { className: 'chart__live visually-hidden' });
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  el.append(live);
  let counter = null;
  let shown = -1;
  const say = (i) => `${labels[i] ?? ''}: ${fmt.format(values[i])}`;
  return {
    host,
    // `announce` is for the keyboard: a pointer sweeping the chart must not talk.
    show(i, { announce = false, instant = false } = {}) {
      if (i === shown && !instant) return;
      const first = shown < 0;
      shown = i;
      label.textContent = labels[i] ?? '';
      if (counter) counter.set(values[i], { instant: instant || first }); else counter = slidingNumber(value, { value: values[i], format: options, locale: locale(el) });
      const change = i > 0 ? describeChange(values[i], values[i - 1], { el }) : null;
      delta.hidden = !change;
      if (change) {
        delta.textContent = change.text;
        delta.dataset.trend = change.trend;
        delta.dataset.tone = change.tone;
        delta.title = describeChange(values[i], values[i - 1], { versus: messages.previousPeriod, el }).text;
      }
      if (reduced() && !first && !instant) host.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' });
      if (announce) live.textContent = say(i);
    },
    // New values: the reading is redone for the point it was on.
    values(next) { values = next; shown = -1; },
  };
};

// Round ticks that cover the data: from zero (or the first step below the lowest value), evenly
// spaced, the step 1, 2 or 5 × a power of ten. A short chart asks for fewer intervals.
export const niceScale = (values, intervals) => {
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values, lo + 1e-9);
  const raw = (hi - lo) / intervals;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const count = Math.round((max - min) / step);
  return { min, max, ticks: Array.from({ length: count + 1 }, (_, i) => +(min + i * step).toFixed(10)) };
};
const intervalsFor = (el) => ((parseFloat(getComputedStyle(el).getPropertyValue('--chart-h')) || 152) >= 120 ? 4 : 2);
const currentOf = (el, n) => Math.min(n - 1, Math.max(0, Number(el.dataset.current ?? n - 1)));

const lineChart = (el, life = forever) => {
  if (!once(el, 'uiChart')) return;
  let values = read(el, 'line');
  const labels = read(el, 'labels');
  const { fmt, compact, options } = formats(el);
  const n = values.length;
  let { min, max, ticks } = niceScale(values, intervalsFor(el));
  const now = currentOf(el, n);
  const gid = uid('fill-');
  el.innerHTML = `${axisY(ticks, compact)}<div class="chart__plot"><svg class="chart__svg" role="img" aria-label="${escapeHtml(el.dataset.label ?? '')}"></svg><span class="chart__cross"></span><span class="chart__dot"></span></div><div class="chart__x">${labels.map((l, i) => (l ? `<span class="chart__axis" style="--p: ${(i / (n - 1)) * 100}%"${i === 0 ? ' data-edge="start"' : i === n - 1 ? ' data-edge="end"' : ''}>${escapeHtml(l)}</span>` : '')).join('')}</div>`;
  const plot = el.querySelector('.chart__plot');
  const svg = el.querySelector('.chart__svg');
  const cross = el.querySelector('.chart__cross');
  const dot = el.querySelector('.chart__dot');
  const reading = readoutOf(el, { values, labels, fmt, options });
  let w = 0;
  let h = 0;
  const x = (i) => (i / (n - 1)) * w;
  const y = (v) => (1 - (v - min) / (max - min)) * h;
  const draw = () => {
    w = plot.clientWidth;
    h = Math.max(0, plot.clientHeight - 16);
    if (!w || !h) return;
    const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.innerHTML = `<defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color: var(--accent)" stop-opacity=".28"/><stop offset="1" style="stop-color: var(--accent)" stop-opacity="0"/></linearGradient></defs>
      <g class="chart__grid">${ticks.map((t) => `<line x1="0" x2="${w}" y1="${y(t)}" y2="${y(t)}"/>`).join('')}</g>
      <path class="chart__area" fill="url(#${gid})" d="${d}L${x(n - 1).toFixed(1)},${y(min).toFixed(1)}L${x(0).toFixed(1)},${y(min).toFixed(1)}Z"/>
      <path class="chart__line" d="${d}"/>
      <circle class="chart__ring" cx="${x(now).toFixed(1)}" cy="${y(values[now]).toFixed(1)}" r="4"/><circle class="chart__ring" cx="${x(now).toFixed(1)}" cy="${y(values[now]).toFixed(1)}" r="4"/>
      <circle class="chart__now" cx="${x(now).toFixed(1)}" cy="${y(values[now]).toFixed(1)}" r="4"/>`;
    svg.querySelector('.chart__line').style.setProperty('--_len', svg.querySelector('.chart__line').getTotalLength());
  };
  let index = now;
  const show = (i, opts) => {
    index = i;
    cross.style.transform = `translateX(${x(i)}px)`;
    dot.style.transform = `translate(${x(i) - 3.5}px, ${y(values[i]) + 8 - 3.5}px)`;
    reading.show(i, opts);
    el.setAttribute('data-hover', '');
  };
  const rest = () => {
    el.removeAttribute('data-hover');
    index = now;
    reading.show(now);
  };
  el.update = (next) => {
    values = next;
    reading.values(next);
    ({ min, max, ticks } = niceScale(values, intervalsFor(el)));
    el.querySelector('.chart__y').outerHTML = axisY(ticks, compact);
    draw();
    ping(el);
    reading.show(el.hasAttribute('data-hover') ? index : now, { instant: true });
  };
  draw();
  reading.show(now, { instant: true });
  life.watch(new ResizeObserver(draw)).observe(plot);
  el.tabIndex = 0;
  const reach = (e) => {
    const r = plot.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
    if (i !== index || !el.hasAttribute('data-hover')) show(i);
  };
  plot.addEventListener('pointermove', reach);
  plot.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { plot.setPointerCapture(e.pointerId); reach(e); } });
  el.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && document.activeElement !== el) rest(); });
  plot.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') rest(); });
  el.addEventListener('focus', () => show(index, { announce: true }));
  el.addEventListener('blur', rest);
  el.addEventListener('keydown', (e) => {
    const to = { ArrowRight: Math.min(n - 1, index + 1), ArrowLeft: Math.max(0, index - 1), Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    show(to, { announce: true });
  });
};

const barChart = (el) => {
  if (!once(el, 'uiChart')) return;
  let values = read(el, 'bars');
  const labels = read(el, 'labels');
  const { fmt, compact, options } = formats(el);
  const n = values.length;
  let scale = niceScale(values, intervalsFor(el));
  const now = currentOf(el, n);
  const grid = () => scale.ticks.map((t) => `<span style="--p: ${(t / scale.max) * 100}%"></span>`).join('');
  el.innerHTML = `${axisY(scale.ticks, compact)}<div class="chart__plot chart__bars" role="img" aria-label="${escapeHtml(el.dataset.label ?? '')}"><div class="chart__grid">${grid()}</div>${values.map((v, i) => `<div class="chart__col" style="--i: ${i}"><div class="chart__bar"${i === now ? ' data-current' : ''} style="--v: ${v / scale.max}"></div></div>`).join('')}</div><div class="chart__x chart__x--bars">${labels.map((l) => `<span class="chart__axis">${escapeHtml(l)}</span>`).join('')}</div>`;
  const plot = el.querySelector('.chart__plot');
  const bars = [...el.querySelectorAll('.chart__bar')];
  const reading = readoutOf(el, { values, labels, fmt, options });
  let index = now;
  const show = (i, opts) => {
    index = i;
    bars.forEach((b, j) => b.toggleAttribute('data-active', j === i));
    reading.show(i, opts);
    el.setAttribute('data-hover', '');
  };
  const rest = () => {
    el.removeAttribute('data-hover');
    bars.forEach((b) => b.removeAttribute('data-active'));
    index = now;
    reading.show(now);
  };
  // New data moves the clip of each bar and redraws the axis and the grid; the bars stay the same elements.
  el.update = (next) => {
    values = next;
    reading.values(next);
    scale = niceScale(values, intervalsFor(el));
    el.querySelector('.chart__y').outerHTML = axisY(scale.ticks, compact);
    el.querySelector('.chart__grid').innerHTML = grid();
    bars.forEach((b, i) => b.style.setProperty('--v', String(values[i] / scale.max)));
    reading.show(el.hasAttribute('data-hover') ? index : now, { instant: true });
  };
  reading.show(now, { instant: true });
  el.tabIndex = 0;
  // The hit area of a column is its whole band —from the top of the plot to its foot, and half the
  // gap on each side— not just the bar, so the reading never depends on aiming at a short bar.
  const reach = (e) => {
    const r = plot.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
    if (i !== index || !el.hasAttribute('data-hover')) show(i);
  };
  plot.addEventListener('pointermove', reach);
  plot.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') plot.setPointerCapture(e.pointerId); reach(e); });
  el.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && document.activeElement !== el) rest(); });
  plot.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') rest(); });
  el.addEventListener('focus', () => show(index, { announce: true }));
  el.addEventListener('blur', rest);
  el.addEventListener('keydown', (e) => {
    const to = { ArrowRight: Math.min(n - 1, index + 1), ArrowLeft: Math.max(0, index - 1), Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    show(to, { announce: true });
  });
};

export const setChart = (el, values) => el.update?.(values);

// The current point of a line chart sends out two rings, when the chart is revealed and when its data
// changes. `data-ping` plays them (the stylesheet hides them with reduced motion or celebrations off) and
// comes off when the second has gone, so a redraw of the line does not play them again.
export const ping = (el) => {
  if (!el.matches('.chart[data-line]') || reduced()) return;
  el.removeAttribute('data-ping');
  void el.offsetWidth;
  el.setAttribute('data-ping', '');
  const rings = el.querySelectorAll('.chart__ring');
  rings[rings.length - 1]?.addEventListener('animationend', () => el.removeAttribute('data-ping'), { once: true });
  setTimeout(() => el.removeAttribute('data-ping'), 2400);
};

export const initCharts = (root = document, life = forever) => {
  root.querySelectorAll('.chart[data-line]').forEach((c) => lineChart(c, life));
  root.querySelectorAll('.chart[data-bars]').forEach(barChart);
};
