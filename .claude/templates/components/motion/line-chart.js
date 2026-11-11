// Line chart (Arc, `registry/components/line-chart`, MIT): one or more measures over time, with a crosshair
// and a tooltip you scrub with the pointer or the keyboard.
//
//  · A series keeps its line across data changes, so switching ranges morphs the path instead of redrawing it:
//    every line is sampled densely on shared x positions and flows from the shape on screen to the new one on a
//    critically damped spring (`visualDuration` .4), even when the range gains or loses points.
//  · The value scale rides the same spring: the gridlines and tick labels slide to their new rows while rows that
//    did not exist fade in and the ones that go fade out in 120 ms.
//  · The first time the chart is seen (35 % of it) the lines draw left to right (840 ms, in-out).
//  · A hidden series flattens into the baseline as it fades; the ones that stay rescale around it.
//  · The crosshair appears on the first scrubbed point and glides between the ones after it (`snappy`); the tooltip
//    follows on its own spring, flips sides before leaving the plot and centres on the points it describes.
//  · A previous period is a dashed line. `loading` keeps the current lines on screen, dimmed, while the next range
//    loads.
//
// Port notes. Curves are monotone cubic (never past the data) or linear. The plot is a `role="slider"` (arrows,
// Home/End, PageUp/PageDown, Escape) and a hidden data table carries every number; words are Spanish (`labels`),
// numbers follow the page's locale. This port coexists with the line chart of `charts.js` (a single series with its
// reading in the card header and no morph): the screen that wants the morph, the dashed period or the tooltip
// mounts this one; `update({ data })` is its counterpart of `setChart(el, values)`.
//
// mount(root, { data: [{ key, label, axisLabel, values: { [seriesKey]: number } }], series: [{ key, label, color,
//   dashed, area }], label, unit, height (220, or 'fill': the height its box leaves, never under 220), formatValue(value, series), formatTick(value), hiddenSeries,
//   onActiveChange(index, datum), loading, emptyLabel, legend, categoryLabel, curve: 'smooth' | 'linear', labels })
//   → { destroy, update({ data, series }), setHidden(keys), setLoading(bool), active }
import { reduced, locale, uid } from '../core.js';
import { ARC, Val, bezier, bezierFn, physical, el, esc } from './arc-kit.js';

const TOP = 12;
const GAP = 14;
const settle = physical(ARC.spring.smooth);
const glide = physical(ARC.spring.snappy);
const follow = { stiffness: glide.stiffness, damping: glide.damping, mass: 1 };
const PALETTE = ['var(--accent)', 'color-mix(in oklab, var(--text) 46%, var(--surface-raised))', 'color-mix(in oklab, var(--text) 26%, var(--surface-raised))'];
const LABELS = { empty: 'Sin datos para este período', category: 'Fecha', choose: 'Elegí una serie para mostrar', loading: 'Cargando', shown: (n, t) => `${n} de ${t} series visibles`, explore: (c) => `explorar por ${c}`, to: 'a', latest: 'último' };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clean = (v) => Number(v.toPrecision(12));
const handles = new WeakMap();
const SVGNS = 'http://www.w3.org/2000/svg';
const GRID = Array.from({ length: 241 }, (_, i) => i / 240);

// Clean gridlines: the smallest step of 1, 2, 2.5 or 5 that covers the data in four rows or fewer.
function niceScale(low, high) {
  const lo = Math.min(0, low);
  const hi = Math.max(high, lo + 1);
  const magnitude = 10 ** Math.floor(Math.log10((hi - lo) / 4));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    const step = factor * magnitude;
    const bottom = Math.floor(lo / step) * step;
    const top = Math.ceil(hi / step) * step;
    if ((top - bottom) / step <= 4 + 1e-9) {
      const ticks = [];
      for (let v = bottom; v <= top + step / 2; v += step) ticks.push(clean(v));
      return { min: clean(bottom), max: clean(top), ticks };
    }
  }
  return { min: lo, max: hi, ticks: [lo, hi] };
}

// The line through every value, sampled densely on x from 0 to 1 in data units. Monotone cubic tangents keep a smooth curve from swinging past the data.
function curveFor(values, smooth) {
  if (!values.length) return [];
  if (values.length === 1) return [[0, values[0]], [1, values[0]]];
  const last = values.length - 1;
  const step = 1 / last;
  if (!smooth) return values.map((v, i) => [i * step, v]);
  const slopes = values.slice(1).map((v, i) => (v - values[i]) / step);
  const tangents = values.map((_, i) => (i === 0 || i === last ? 0 : (Math.sign(slopes[i - 1]) + Math.sign(slopes[i])) * Math.min(Math.abs(slopes[i - 1]), Math.abs(slopes[i]), Math.abs(slopes[i - 1] + slopes[i]) / 4) || 0));
  if (last > 1) { tangents[0] = (3 * slopes[0] - tangents[1]) / 2; tangents[last] = (3 * slopes[last - 1] - tangents[last - 1]) / 2; } else { tangents[0] = slopes[0]; tangents[1] = slopes[0]; }
  const samples = Math.max(1, Math.min(16, Math.round(192 / last)));
  const points = [];
  for (let i = 0; i < last; i++) {
    const low = Math.min(values[i], values[i + 1]);
    const high = Math.max(values[i], values[i + 1]);
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const v = (2 * t3 - 3 * t2 + 1) * values[i] + (t3 - 2 * t2 + t) * step * tangents[i] + (3 * t2 - 2 * t3) * values[i + 1] + (t3 - t2) * step * tangents[i + 1];
      points.push([(i + t) * step, clamp(v, low, high)]);
    }
  }
  points.push([1, values[last]]);
  return points;
}
// Value of a sampled line at x, straight between samples.
function valueAt(shape, x) {
  if (!shape.length) return 0;
  let low = 0;
  let high = shape.length - 1;
  if (x <= shape[low][0]) return shape[low][1];
  if (x >= shape[high][0]) return shape[high][1];
  while (high - low > 1) { const mid = (low + high) >> 1; if (shape[mid][0] < x) low = mid; else high = mid; }
  const [x0, y0] = shape[low];
  const [x1, y1] = shape[high];
  return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}
// Axis labels that fit: at most one per 76 pixels, counted back from the latest so the newest date always shows.
function axisPicks(data, width) {
  const labeled = data.flatMap((item, i) => (item.axisLabel ? [i] : []));
  if (!width || !labeled.length) return [];
  const room = Math.max(2, Math.floor(width / 76));
  const stride = Math.ceil(labeled.length / room);
  return labeled.reverse().filter((_, rank) => rank % stride === 0).reverse();
}
const svgEl = (tag, attrs = {}) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

export function mount(root, options = {}) {
  if (handles.has(root)) return handles.get(root);
  const o = { height: 220, unit: '', categoryLabel: undefined, curve: 'smooth', ...options };
  const L = { ...LABELS, ...o.labels };
  const loc = options.locale ?? locale(root);
  const grouped = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  const compact = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
  const formatTick = o.formatTick ?? ((v) => compact.format(v));
  const categoryLabel = o.categoryLabel ?? L.category;
  const emptyLabel = o.emptyLabel ?? L.empty;
  const fills = o.height === 'fill';
  let height = fills ? 220 : o.height;
  const uidv = uid('lc');
  const life = new AbortController();

  let data = [...o.data];
  let series = [...o.series];
  let hidden = [...(o.hiddenSeries ?? [])];
  let loading = !!o.loading;
  let active = null;
  let steady = niceScale(0, 100);
  let plotWidth = 0;
  let wasScrubbing = false;
  const tracks = new Map();
  const grids = new Map(); // tick value -> { line, label, leaving }
  const axisLabels = new Map();
  const groups = new Map();
  const lines = new Map();
  const areas = new Map();
  const dots = new Map();

  root.classList.add('lc');
  root.toggleAttribute('data-fill', fills);
  root.setAttribute('aria-label', o.label);
  root.innerHTML = `<div class="lc-legend" role="group" aria-label="${esc(`${o.label}`)}" hidden></div><div class="lc-chart"><div class="lc-plot" style="${fills ? `min-height:${height}px` : `height:${height}px`}" role="slider" aria-orientation="horizontal"><svg class="lc-svg" width="100%" height="${height}" aria-hidden="true" focusable="false"><defs><clipPath id="${uidv}-draw" clipPathUnits="userSpaceOnUse"><rect x="-8" y="-16" width="0" height="${height + 32}"/></clipPath></defs><g class="lc-grid"></g><line class="lc-baseline" x1="0" x2="100%" y1="${height - 0.5}" y2="${height - 0.5}"/><line class="lc-crosshair" y1="${TOP - 4}" y2="${height}"/><g class="lc-series" clip-path="url(#${uidv}-draw)"></g><g class="lc-dots"></g></svg><div class="lc-tooltip" aria-hidden="true"></div><p class="lc-message" hidden></p></div><div class="lc-gutter" aria-hidden="true"></div><div class="lc-axis" aria-hidden="true"></div></div><p class="arc-sr" data-summary></p><div class="arc-sr" data-table></div><p class="arc-sr" aria-live="polite" aria-atomic="true" data-live></p>`;
  const legendEl = root.querySelector('.lc-legend');
  const chart = root.querySelector('.lc-chart');
  const plot = root.querySelector('.lc-plot');
  const svg = root.querySelector('.lc-svg');
  const clip = root.querySelector('clipPath rect');
  const gridLayer = root.querySelector('.lc-grid');
  const crosshair = root.querySelector('.lc-crosshair');
  const seriesLayer = root.querySelector('.lc-series');
  const dotLayer = root.querySelector('.lc-dots');
  const tooltip = root.querySelector('.lc-tooltip');
  const message = root.querySelector('.lc-message');
  const gutter = root.querySelector('.lc-gutter');
  const axisEl = root.querySelector('.lc-axis');
  const summary = root.querySelector('[data-summary]');
  const tableBox = root.querySelector('[data-table]');
  const liveEl = root.querySelector('[data-live]');
  const colorOf = (s, i) => s.color ?? PALETTE[Math.min(i, PALETTE.length - 1)];
  const fmt = (v, s) => `${o.formatValue ? o.formatValue(v, s) : grouped.format(v)}${o.unit ? ` ${o.unit}` : ''}`;

  // ── Values that move ──
  const scaleMin = new Val(0, () => paint());
  const scaleMax = new Val(100, () => paint());
  const drawn = new Val(0, () => paint());
  const cursor = new Val(1, () => paint());
  const tipX = new Val(0, () => place());
  const tipY = new Val(0, () => place());
  let tipTarget = [0, 0];
  let tipSize = { w: 0, h: 0 };
  const morph = new Val(0);

  const visibleSeries = () => series.filter((s) => !hidden.includes(s.key));
  const last = () => data.length - 1;
  const empty = () => data.length === 0;
  const indexNow = () => (active === null || empty() ? null : Math.min(active, last()));

  const rowY = (value) => {
    const span = scaleMax.get() - scaleMin.get() || 1;
    return Math.round(TOP + (1 - (value - scaleMin.get()) / span) * (height - TOP)) + 0.5;
  };
  const place = () => { tooltip.style.transform = `translate(${tipX.get()}px, ${tipY.get()}px)`; };

  // One writer for every drawn attribute: morphs, toggles, the scale, the crosshair and the measured size repaint through here.
  function paint() {
    const w = plotWidth;
    if (!w) return;
    const lo = scaleMin.get();
    const span = scaleMax.get() - lo || 1;
    const toY = (v) => TOP + (1 - (v - lo) / span) * (height - TOP);
    const at = cursor.get();
    const dotYs = [];
    for (const s of series) {
      const track = tracks.get(s.key);
      if (!track) continue;
      const p = track.presence.get();
      const y = (v) => toY(lo + (v - lo) * p);
      const path = track.shape.length ? `M${track.shape.map(([x, v]) => `${(x * w).toFixed(1)},${y(v).toFixed(1)}`).join('L')}` : '';
      lines.get(s.key)?.setAttribute('d', path);
      areas.get(s.key)?.setAttribute('d', path ? `${path}L${w},${height}L0,${height}Z` : '');
      const group = groups.get(s.key);
      if (group) group.style.opacity = String(p);
      const dot = dots.get(s.key);
      if (dot && track.shape.length) {
        const cy = y(valueAt(track.shape, at));
        dot.setAttribute('cx', (at * w).toFixed(1));
        dot.setAttribute('cy', cy.toFixed(1));
        if (p > 0.5) dotYs.push(cy);
      }
    }
    for (const g of grids.values()) {
      const yv = rowY(g.value);
      g.line.setAttribute('y1', yv);
      g.line.setAttribute('y2', yv);
      g.label.style.transform = `translateY(${yv}px)`;
    }
    clip.setAttribute('width', String(drawn.get() * (w + 16)));
    const cx = Math.round(at * w) + 0.5;
    crosshair.setAttribute('x1', String(cx));
    crosshair.setAttribute('x2', String(cx));
    // The tooltip sits beside the crosshair, flips sides before it would leave the plot, and centres on the points it describes.
    const { w: tw, h: th } = tipSize;
    let x = cx + GAP;
    if (x + tw > w) x = cx - GAP - tw;
    const tx = clamp(x, 0, Math.max(0, w - tw));
    const middle = dotYs.length ? dotYs.reduce((a, b) => a + b, 0) / dotYs.length : height / 2;
    const ty = clamp(middle - th / 2, 0, Math.max(0, height - th));
    if (Math.abs(tx - tipTarget[0]) > 0.01 || Math.abs(ty - tipTarget[1]) > 0.01) {
      tipTarget = [tx, ty];
      if (reduced() || !chart.hasAttribute('data-scrubbing')) { tipX.jump(tx); tipY.jump(ty); } else {
        tipX.to(tx, follow, { restDelta: 0.01, restSpeed: 0.05 });
        tipY.to(ty, follow, { restDelta: 0.01, restSpeed: 0.05 });
      }
    }
  }

  // ── Gridlines, tick labels and axis labels: keyed, so they fade in and out while the ones that stay ride the scale ──
  const fadeIn = (node) => node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ARC.duration.standard * 1000, easing: bezier('standard'), fill: 'backwards' });
  const fadeOut = (node, done) => { node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ARC.duration.instant * 1000, easing: bezier('standard'), fill: 'forwards' }).finished.then(done, done); };
  const syncTicks = (initial) => {
    const want = new Set(steady.ticks);
    for (const [value, g] of grids) {
      if (want.has(value) || g.leaving) continue;
      g.leaving = true;
      if (initial || reduced()) { g.line.remove(); g.label.remove(); grids.delete(value); } else {
        fadeOut(g.line, () => g.line.remove());
        fadeOut(g.label, () => { g.label.remove(); grids.delete(value); });
      }
    }
    for (const value of steady.ticks) {
      const existing = grids.get(value);
      if (existing && !existing.leaving) continue;
      const line = svgEl('line', { class: 'lc-gridline', x1: '0', x2: '100%' });
      const label = el('span', 'lc-tick', {}, `<span class="lc-tick-text">${esc(formatTick(value))}</span>`);
      if (value !== steady.ticks[0]) gridLayer.append(line); // the first row is the baseline
      gutter.append(label);
      grids.set(value, { value, line, label, leaving: false });
      if (!initial) { fadeIn(line); fadeIn(label); }
    }
    for (const g of grids.values()) g.label.querySelector('.lc-tick-text').textContent = formatTick(g.value);
  };
  const syncAxis = (initial) => {
    const picks = axisPicks(data, plotWidth);
    const want = new Map(picks.map((i) => [`${data[i].key}:${data[i].axisLabel}`, i]));
    for (const [id, node] of axisLabels) if (!want.has(id)) { axisLabels.delete(id); if (initial || reduced()) node.remove(); else fadeOut(node, () => node.remove()); }
    for (const [id, i] of want) {
      const share = last() > 0 ? i / last() : 0.5;
      let node = axisLabels.get(id);
      if (!node) {
        node = el('span', 'lc-axis-label', {}, esc(data[i].axisLabel));
        axisEl.append(node);
        axisLabels.set(id, node);
        if (!initial) fadeIn(node);
      }
      node.style.left = `${share * 100}%`;
      node.style.translate = `${-share * 100}% 0`;
    }
  };

  // ── Series ──
  const buildSeries = () => {
    for (const [key, node] of [...groups]) if (!series.some((s) => s.key === key)) { node.remove(); groups.delete(key); lines.delete(key); areas.delete(key); dots.get(key)?.remove(); dots.delete(key); tracks.delete(key); }
    series.forEach((s, i) => {
      const color = colorOf(s, i);
      let group = groups.get(s.key);
      if (!group) {
        group = svgEl('g');
        if (s.area ?? i === 0) { const area = svgEl('path', { class: 'lc-area' }); group.append(area); areas.set(s.key, area); }
        const line = svgEl('path', { class: 'lc-line' });
        group.append(line);
        lines.set(s.key, line);
        seriesLayer.append(group);
        groups.set(s.key, group);
        const dot = svgEl('circle', { class: 'lc-dot', r: '4' });
        dotLayer.append(dot);
        dots.set(s.key, dot);
      }
      group.style.setProperty('--series', color);
      lines.get(s.key).toggleAttribute('data-dashed', !!s.dashed);
      dots.get(s.key).style.setProperty('--series', color);
      dots.get(s.key).toggleAttribute('data-hidden', hidden.includes(s.key));
    });
    legendEl.hidden = !(o.legend ?? series.length > 1);
    legendEl.innerHTML = series.map((s, i) => `<button type="button" class="lc-toggle" data-key="${esc(s.key)}" aria-pressed="${!hidden.includes(s.key)}" style="--series:${colorOf(s, i)}"><span class="lc-swatch"${s.dashed ? ' data-dashed' : ''} aria-hidden="true"></span><span class="lc-toggle-label">${esc(s.label)}</span></button>`).join('');
  };

  const range = () => {
    let low = Infinity;
    let high = -Infinity;
    for (const s of visibleSeries()) for (const item of data) { const v = item.values[s.key] ?? 0; low = Math.min(low, v); high = Math.max(high, v); }
    return Number.isFinite(low) ? niceScale(low, high) : null;
  };

  // New data morphs every line from the shape on screen, sampled on shared x positions so a range that gains or loses points still flows.
  const retarget = (first) => {
    const targets = new Map(series.map((s) => [s.key, curveFor(data.map((d) => d.values[s.key] ?? 0), o.curve === 'smooth')]));
    const moves = [];
    for (const [key, target] of targets) {
      const track = tracks.get(key);
      if (!track) { tracks.set(key, { shape: target, presence: new Val(hidden.includes(key) ? 0 : 1, () => paint()) }); continue; }
      if (!track.shape.length || !target.length || reduced() || first) { track.shape = target; continue; }
      const xs = [...new Set([...GRID, ...target.map(([x]) => x)])].sort((a, b) => a - b);
      moves.push({ track, xs, from: xs.map((x) => valueAt(track.shape, x)), to: xs.map((x) => valueAt(target, x)), target });
    }
    morph.stop();
    if (!moves.length) { paint(); return; }
    morph.jump(0);
    morph.to(1, settle, {
      restDelta: 0.0005, restSpeed: 0.001,
      onUpdate: (p) => { for (const m of moves) m.track.shape = m.xs.map((x, i) => [x, m.from[i] + (m.to[i] - m.from[i]) * p]); paint(); },
    }).then((landed) => { if (landed) { for (const m of moves) m.track.shape = m.target; paint(); } });
  };

  const settleScale = () => {
    const next = range();
    if (next) steady = next;
    if (reduced()) { scaleMin.jump(steady.min); scaleMax.jump(steady.max); } else {
      scaleMin.to(steady.min, settle, { restDelta: 0.01, restSpeed: 0.05 });
      scaleMax.to(steady.max, settle, { restDelta: 0.01, restSpeed: 0.05 });
    }
  };

  const hide = () => {
    for (const [key, track] of tracks) {
      const to = hidden.includes(key) ? 0 : 1;
      if (track.presence.get() === to && !track.presence.moving) continue;
      if (reduced()) track.presence.jump(to); else track.presence.to(to, settle, { restDelta: 0.001, restSpeed: 0.01 });
      dots.get(key)?.toggleAttribute('data-hidden', to === 0);
    }
    legendEl.querySelectorAll('.lc-toggle').forEach((b) => b.setAttribute('aria-pressed', String(!hidden.includes(b.dataset.key))));
  };

  // ── Reading ──
  const texts = () => {
    const i = indexNow();
    const reading = i === null ? null : data[i];
    const shownItem = reading ?? data[last()];
    tooltip.innerHTML = shownItem ? `<p class="lc-tip-title">${esc(shownItem.label)}</p>${visibleSeries().map((s) => `<p class="lc-tip-row" style="--series:${colorOf(s, series.indexOf(s))}"><span class="lc-tip-swatch"${s.dashed ? ' data-dashed' : ''}></span><span class="lc-tip-name">${esc(s.label)}</span><span class="lc-tip-value">${esc(fmt(shownItem.values[s.key] ?? 0, s))}</span></p>`).join('')}` : '';
    tipSize = { w: tooltip.offsetWidth, h: tooltip.offsetHeight };
    const vis = visibleSeries();
    const valueText = reading ? `${reading.label}: ${vis.map((s) => `${s.label} ${fmt(reading.values[s.key] ?? 0, s)}`).join(', ')}` : empty() ? emptyLabel : L.shown(vis.length, series.length);
    plot.setAttribute('aria-label', `${o.label}, ${L.explore(categoryLabel.toLowerCase())}`);
    plot.setAttribute('aria-valuemin', '1');
    plot.setAttribute('aria-valuemax', String(Math.max(1, data.length)));
    plot.setAttribute('aria-valuenow', String((i ?? last()) + 1));
    plot.setAttribute('aria-valuetext', valueText);
    plot.tabIndex = empty() ? -1 : 0;
    summary.textContent = empty() ? `${o.label}. ${emptyLabel}.` : `${o.label}, ${data[0].label} ${L.to} ${data[last()].label}. ${vis.map((s) => `${s.label}, ${L.latest} ${fmt(data[last()].values[s.key] ?? 0, s)}`).join('. ')}.`;
  };
  const tableSync = () => {
    tableBox.innerHTML = empty() ? '' : `<table><caption>${esc(o.label)}</caption><thead><tr><th scope="col">${esc(categoryLabel)}</th>${series.map((s) => `<th scope="col">${esc(s.label)}</th>`).join('')}</tr></thead><tbody>${data.map((d) => `<tr><th scope="row">${esc(d.label)}</th>${series.map((s) => `<td>${esc(fmt(d.values[s.key] ?? 0, s))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };
  const messageSync = () => {
    const all = !empty() && visibleSeries().length === 0;
    message.hidden = !((empty() || all) && !loading);
    message.textContent = empty() ? emptyLabel : L.choose;
    chart.toggleAttribute('data-loading', loading);
    root.toggleAttribute('aria-busy', loading);
    liveEl.textContent = loading ? L.loading : '';
  };

  // ── Scrub ──
  const setActive = (next) => {
    const before = indexNow();
    active = next;
    const i = indexNow();
    chart.toggleAttribute('data-scrubbing', i !== null);
    if (i === null) { wasScrubbing = false; } else {
      const to = last() > 0 ? i / last() : 0.5;
      if (reduced() || !wasScrubbing) { cursor.jump(to); texts(); paint(); tipX.jump(tipTarget[0]); tipY.jump(tipTarget[1]); } else cursor.to(to, glide, { restDelta: 0.0001, restSpeed: 0.001 });
      wasScrubbing = true;
    }
    texts();
    if (before !== i) { o.onActiveChange?.(i, i === null ? null : data[i] ?? null); }
  };
  const pointAt = (clientX) => {
    const rect = plot.getBoundingClientRect();
    if (!rect.width || last() < 1) return Math.max(0, last());
    return clamp(Math.round(((clientX - rect.left) / rect.width) * last()), 0, last());
  };
  plot.addEventListener('keydown', (event) => {
    const i = indexNow();
    if (event.key === 'Escape' && i !== null) { event.preventDefault(); setActive(null); return; }
    const from = i ?? last() + 1;
    const page = Math.max(1, Math.round(data.length / 6));
    const next = { ArrowLeft: from - 1, ArrowDown: from - 1, ArrowRight: i === null ? last() : from + 1, ArrowUp: i === null ? last() : from + 1, PageDown: from - page, PageUp: from + page, Home: 0, End: last() }[event.key];
    if (next === undefined || empty()) return;
    event.preventDefault();
    setActive(clamp(next, 0, last()));
  });
  plot.addEventListener('pointerdown', (event) => {
    if (empty()) return;
    if (event.pointerType !== 'mouse') plot.setPointerCapture?.(event.pointerId);
    setActive(pointAt(event.clientX));
  });
  plot.addEventListener('pointermove', (event) => { if (!empty() && (event.pointerType === 'mouse' || event.buttons)) setActive(pointAt(event.clientX)); });
  plot.addEventListener('pointerup', (event) => { if (event.pointerType !== 'mouse') setActive(null); });
  plot.addEventListener('pointercancel', () => setActive(null));
  plot.addEventListener('pointerleave', (event) => { if (event.pointerType === 'mouse') setActive(null); });
  plot.addEventListener('blur', () => setActive(null));
  plot.addEventListener('focus', () => { if (plot.matches(':focus-visible') && !empty()) setActive(indexNow() ?? last()); });
  legendEl.addEventListener('click', (event) => {
    const b = event.target.closest('.lc-toggle');
    if (!b) return;
    const key = b.dataset.key;
    hidden = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    o.onHiddenSeriesChange?.(hidden);
    hide(); settleScale(); texts(); messageSync();
  });

  // ── Measure ──
  const measure = () => {
    plotWidth = plot.clientWidth;
    if (fills && plot.clientHeight && plot.clientHeight !== height) {
      height = plot.clientHeight;
      svg.setAttribute('height', height);
      clip.setAttribute('height', height + 32);
      const baseline = root.querySelector('.lc-baseline');
      baseline.setAttribute('y1', height - 0.5);
      baseline.setAttribute('y2', height - 0.5);
      crosshair.setAttribute('y2', height);
    }
    tipSize = { w: tooltip.offsetWidth, h: tooltip.offsetHeight };
    syncAxis(false);
    paint();
  };
  const resizer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
  resizer?.observe(plot);
  resizer?.observe(tooltip);

  // ── First paint ──
  const rebuild = (first) => {
    buildSeries();
    const next = range();
    if (next) steady = next;
    retarget(first);
    if (first) { scaleMin.jump(steady.min); scaleMax.jump(steady.max); } else settleScale();
    syncTicks(first);
    plotWidth = plot.clientWidth;
    syncAxis(first);
    hide();
    texts();
    tableSync();
    messageSync();
    paint();
  };
  rebuild(true);
  cursor.jump(1);
  let io = null;
  if (empty()) drawn.jump(1); else if (reduced()) drawn.jump(1); else {
    io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      drawn.tween(1, ARC.duration.considered * 1.75, bezierFn('inOut'));
    }, { threshold: 0.3 });
    io.observe(root);
  }

  const handle = {
    get active() { return indexNow(); },
    update(next) {
      if (next.series) series = [...next.series];
      if (next.data) data = [...next.data];
      active = null;
      chart.removeAttribute('data-scrubbing');
      wasScrubbing = false;
      rebuild(false);
    },
    setHidden(keys) { hidden = [...keys]; hide(); settleScale(); texts(); messageSync(); },
    setLoading(value) { loading = !!value; messageSync(); },
    destroy() {
      handles.delete(root);
      life.abort();
      io?.disconnect();
      resizer?.disconnect();
      for (const v of [scaleMin, scaleMax, drawn, cursor, tipX, tipY, morph]) v.stop();
      for (const t of tracks.values()) t.presence.stop();
      root.replaceChildren();
      root.classList.remove('lc');
      root.removeAttribute('aria-label');
      root.removeAttribute('aria-busy');
    },
  };
  handles.set(root, handle);
  return handle;
}
