// Donut chart (Arc, `registry/components/donut-chart`, MIT): a ring of arcs and a synced legend.
//
//  · The arcs are keyed: a segment whose `key` survives a data change keeps its place and colour, so switching
//    datasets morphs the arcs (each edge on a critically damped spring, `visualDuration` .5) instead of redrawing
//    them. The first time the chart is seen, every segment leaves the top together on a .72 spring and each trailing
//    edge follows a beat (35 ms) behind the one before.
//  · Segments below `groupBelow` of the total join "Otros" (when at least two would, up to `maxSegments`);
//    hiding a segment closes it and the rest of the ring redistributes.
//  · The centre reads the total, or the active segment: the readouts share one cell and roll like a drum (the ones
//    before the active segment wait above, the ones after it below); every number counts to its new value.
//  · The active segment slides out along its middle and thickens (`snappy`); hover and focus preview, a click or
//    Enter pins it. The legend rows light the segments and the other way round.
//  · One pointer handler for the whole ring: the angle picks the segment, so crossing a gap never drops the hover.
//
// Port notes. Arcs are written to the DOM once per frame from the springs, as in the original. The legend rows
// open and close their height on `smooth`. Words are Spanish (`labels`) and numbers follow the page's locale.
// A screen-reader summary and a data table carry the numbers; the ring itself is hidden from them.
//
// mount(root, { data: [{ key, label, value, color }], label, unit, formatValue, totalLabel, size (208),
//   thickness (24), groupBelow (.04), maxSegments (6), otherLabel, defaultActiveKey, defaultHiddenKeys,
//   legendAction: 'toggle' | 'select', legend, emptyLabel, labels, onActiveChange(key), onHiddenKeysChange(keys) })
//   → { destroy, setData(data), setHidden(keys), setActive(key), hidden, active }
import { reduced, locale, uid } from '../core.js';
import { ARC, SPRINGS, Val, ms, physical, el, esc } from './arc-kit.js';

const OTHER = '__other';
const TAU = Math.PI * 2;
const LIFT = 4;
const GROW = 2;
const MARGIN = 7;
const GAP = 3;
const CORNER = 4;
const NEUTRAL = [56, 42, 32];
const REST = { restDelta: 0.0005, restSpeed: 0.001 };
const reveal = physical({ visualDuration: 0.72, bounce: 0 });
const settle = physical({ visualDuration: 0.5, bounce: 0 });
const pop = SPRINGS.snappy;
const rollSpring = physical({ visualDuration: 0.4, bounce: 0 });
const LABELS = {
  total: 'Total', other: 'Otros', empty: 'Sin datos todavía', ofTotal: (share, total) => `${share} del ${total.toLowerCase()}`,
  hint: 'Usá las flechas para leer cada segmento.', segments: 'segmentos', toggleHint: 'Tocá un segmento para mostrarlo u ocultarlo',
  hiddenRow: (l) => `${l}, oculto`, shown: 'visible', hiddenWord: 'oculto', includes: 'Incluye', more: (n) => `y ${n} más`, and: ' y ',
  segment: 'Segmento', value: 'Valor', share: 'Porcentaje', visibleTotal: 'Total',
};
const handles = new WeakMap();

// Small parts join one "Otros" segment, but only when at least two would.
function sliceData(data, groupBelow, maxSegments, otherLabel) {
  const parts = data.filter((item) => item.value > 0);
  const total = parts.reduce((s, i) => s + i.value, 0);
  if (!total) return [];
  const ranked = [...parts].sort((a, b) => b.value - a.value);
  const keep = new Set(ranked.filter((item, rank) => item.value / total >= groupBelow && rank < maxSegments - 1).map((i) => i.key));
  const rest = parts.filter((i) => !keep.has(i.key));
  if (rest.length < 2) return parts.map((i) => ({ ...i }));
  return [...parts.filter((i) => keep.has(i.key)).map((i) => ({ ...i })), { key: OTHER, label: otherLabel, value: rest.reduce((s, i) => s + i.value, 0), members: rest }];
}
// Turns of the ring for each slice in data order; a hidden slice closes to a point where it sits.
function layout(slices, hidden) {
  const total = slices.reduce((s, i) => s + (hidden.has(i.key) ? 0 : i.value), 0) || 1;
  let at = 0;
  return new Map(slices.map((item) => { const arc = { start: at, end: at + (hidden.has(item.key) ? 0 : item.value / total) }; at = arc.end; return [item.key, arc]; }));
}
// Half the width, in pixels, of a sector's outer edge once the gap is cut; below a couple of pixels a segment fades.
function breadth(R, t0, t1, gap) {
  const turns = t1 - t0;
  if (turns >= 1 - 1e-6) return Infinity;
  return Math.sin(Math.min(turns * Math.PI, Math.PI / 2)) * R - Math.min(gap / 2, ((1 - turns) * TAU * R) / 2);
}
const n2 = (v) => (Math.round(v * 100) / 100).toString();
// An annular sector between two turns of the ring, clockwise from the top, with rounded corners. Its sides run
// parallel to the radius at a fixed distance, so the gap between neighbours is the same from the inner edge to the
// outer one. A thin sector narrows to a wedge and then to nothing, so a closing segment never pops.
function sector(c, R, r, t0, t1, gap, corner) {
  const turns = t1 - t0;
  if (turns <= 1e-6) return '';
  const at = (radius, angle) => `${n2(c + radius * Math.cos(angle))} ${n2(c + radius * Math.sin(angle))}`;
  if (turns >= 1 - 1e-6) return `M${at(R, -Math.PI / 2)}A${n2(R)} ${n2(R)} 0 1 1 ${at(R, Math.PI / 2)}A${n2(R)} ${n2(R)} 0 1 1 ${at(R, -Math.PI / 2)}ZM${at(r, -Math.PI / 2)}A${n2(r)} ${n2(r)} 0 1 0 ${at(r, Math.PI / 2)}A${n2(r)} ${n2(r)} 0 1 0 ${at(r, -Math.PI / 2)}Z`;
  const p = Math.min(gap / 2, ((1 - turns) * TAU * R) / 2);
  const a0 = t0 * TAU - Math.PI / 2;
  const a1 = t1 * TAU - Math.PI / 2;
  const half = (a1 - a0) / 2;
  const s = Math.sin(Math.min(half, Math.PI / 2));
  if (s * R <= p + 1e-6) return '';
  const side = (t, angle, sign) => `${n2(c + t * Math.cos(angle) - sign * p * Math.sin(angle))} ${n2(c + t * Math.sin(angle) + sign * p * Math.cos(angle))}`;
  const band = (R - r) / 2;
  const ro = Math.max(0, Math.min(corner, band, s >= 0.9999 ? Infinity : (s * R - p) / (1 + s)));
  const dO = Math.asin(Math.min(1, (p + ro) / (R - ro)));
  const tO = Math.sqrt(Math.max(0, (R - ro) ** 2 - (p + ro) ** 2));
  const bigO = a1 - a0 - 2 * dO > Math.PI ? 1 : 0;
  let d = `M${side(tO, a0, 1)}`;
  if (ro > 0.01) d += `A${n2(ro)} ${n2(ro)} 0 0 1 ${at(R, a0 + dO)}`;
  d += `A${n2(R)} ${n2(R)} 0 ${bigO} 1 ${at(R, a1 - dO)}`;
  if (ro > 0.01) d += `A${n2(ro)} ${n2(ro)} 0 0 1 ${side(tO, a1, -1)}`;
  if (s * r > p + 1e-6 || s >= 0.9999) {
    const ri = Math.max(0, Math.min(corner, band, s >= 0.9999 ? Infinity : (s * r - p) / (1 - s)));
    const dI = Math.asin(Math.min(1, (p + ri) / (r + ri)));
    const tI = Math.sqrt(Math.max(0, (r + ri) ** 2 - (p + ri) ** 2));
    const bigI = a1 - a0 - 2 * dI > Math.PI ? 1 : 0;
    d += `L${side(tI, a1, -1)}`;
    if (ri > 0.01) d += `A${n2(ri)} ${n2(ri)} 0 0 1 ${at(r, a1 - dI)}`;
    d += `A${n2(r)} ${n2(r)} 0 ${bigI} 0 ${at(r, a0 + dI)}`;
    if (ri > 0.01) d += `A${n2(ri)} ${n2(ri)} 0 0 1 ${side(tI, a0, 1)}`;
  } else d += `L${at(p / s, (a0 + a1) / 2)}`;
  return `${d}Z`;
}

// A number that counts to each new value, written straight to the DOM. Whole targets count in whole steps.
function counter(node, format) {
  let target = null;
  const val = new Val(0, (now) => { node.textContent = format(Number.isInteger(target) ? Math.round(now) : now); });
  return {
    set(value) {
      if (target === null) { target = value; val.jump(value); return; }
      if (value === target) return;
      target = value;
      if (reduced()) { val.jump(value); return; }
      val.to(value, rollSpring, { restDelta: Math.max(Math.abs(value - val.get()) * 0.001, 1e-6), restSpeed: 1e-4 });
    },
    destroy() { val.stop(); },
  };
}

// Opens or closes the height of a legend row, so the rows below and the card around them glide instead of jumping.
function collapse(node, from, to, done) {
  if (reduced()) { done?.(); return null; }
  node.style.overflow = 'hidden';
  const val = new Val(from, (h) => { node.style.height = `${h}px`; node.style.opacity = String(to ? 1 : Math.max(0, Math.min(1, h / (from || 1)))); });
  val.jump(from);
  val.to(to, SPRINGS.smooth, { restDelta: 0.3 }).then((landed) => { if (landed) { if (to) { node.style.height = ''; node.style.opacity = ''; } done?.(); } });
  return val;
}

export function mount(root, options = {}) {
  if (handles.has(root)) return handles.get(root);
  const o = { size: 208, thickness: 24, groupBelow: 0.04, maxSegments: 6, unit: '', legend: true, legendAction: 'toggle', ...options };
  const L = { ...LABELS, ...o.labels };
  const totalLabel = o.totalLabel ?? L.total;
  const otherLabel = o.otherLabel ?? L.other;
  const emptyLabel = o.emptyLabel ?? L.empty;
  const loc = options.locale ?? locale(root);
  const grouped = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(loc, { style: 'percent', maximumFractionDigits: 0 });
  const formatValue = o.formatValue ?? ((v) => grouped.format(v));
  const shareText = (share) => (share > 0 && share < 0.01 ? '<1%' : percent.format(share));
  const suffix = o.unit ? ` ${o.unit}` : '';
  const format = (v) => `${formatValue(v)}${suffix}`;
  const life = new AbortController();
  const legendId = uid('dn-');

  let data = [...o.data];
  let hiddenList = [...(o.defaultHiddenKeys ?? [])];
  let selected = o.defaultActiveKey ?? null;
  let preview = null;
  let shown = reduced();
  let slices = [];
  let visible = [];
  let hidden = new Set();
  let total = 0;
  let drawn = [];
  let signature = '';
  let palette = new Map();
  let targets = new Map();
  const segments = new Map(); // key -> { start, end, lift }
  const paths = new Map();
  const rowsByKey = new Map();
  const readouts = new Map();
  const counters = [];

  const c = o.size / 2;
  const outer = c - MARGIN;
  const inner = Math.max(8, outer - o.thickness);
  const corner = Math.min(CORNER, o.thickness / 4);

  root.classList.add('dn');
  root.setAttribute('aria-label', o.label);
  if (o.legend) root.setAttribute('data-legend', '');
  root.innerHTML = `<div class="dn-ring" style="width:${o.size}px;--inner:${((inner * 2) / o.size) * 100}%"${o.legend ? '' : ` tabindex="0" role="group" aria-label="${esc(`${o.label}. ${L.hint}`)}"`}><svg class="dn-svg" viewBox="0 0 ${o.size} ${o.size}" aria-hidden="true" focusable="false"><circle class="dn-track" cx="${c}" cy="${c}" r="${(outer + inner) / 2}" stroke-width="${outer - inner}" data-idle=""/></svg><div class="dn-center" aria-hidden="true"></div></div>${o.legend ? `<ul class="dn-legend" id="${legendId}"></ul>` : ''}<p class="arc-sr" data-summary></p><p class="arc-sr" aria-live="polite" data-live></p><div class="arc-sr" data-table></div>`;
  const ring = root.querySelector('.dn-ring');
  const svg = root.querySelector('.dn-svg');
  const track = root.querySelector('.dn-track');
  const center = root.querySelector('.dn-center');
  const legend = root.querySelector('.dn-legend');
  const summary = root.querySelector('[data-summary]');
  const liveEl = root.querySelector('[data-live]');
  const tableBox = root.querySelector('[data-table]');
  const announce = (text) => { liveEl.textContent = ''; liveEl.textContent = text; };
  const emit = (name, detail) => root.dispatchEvent(new CustomEvent(`donut-chart:${name}`, { detail, bubbles: true }));

  const seriesColor = (index) => (index < 4 ? `var(--dn-series-${index + 1})` : `color-mix(in oklab, var(--text) ${NEUTRAL[(index - 4) % NEUTRAL.length]}%, var(--surface-raised))`);
  const colorFor = (item) => item.color ?? (item.key === OTHER ? 'color-mix(in oklab, var(--text) 26%, var(--surface-raised))' : seriesColor(palette.get(item.key) ?? 0));

  // One paint per frame, whatever moved: every path's shape and lift are written straight to the DOM.
  let raf = 0;
  const paint = () => {
    raf = 0;
    for (const [key, node] of paths) {
      const seg = segments.get(key);
      if (!seg) { node.setAttribute('d', ''); continue; }
      const start = seg.start.get();
      const end = seg.end.get();
      const lift = Math.max(0, seg.lift.get());
      const R = outer + lift * GROW;
      node.setAttribute('d', sector(c, R, inner - lift * GROW * 0.5, start, end, GAP, corner));
      node.setAttribute('fill-opacity', n2(Math.min(1, Math.max(0, (breadth(R, start, end, GAP) - 1) / 3))));
      const middle = ((start + end) / 2) * TAU - Math.PI / 2;
      const distance = lift * LIFT;
      node.setAttribute('transform', `translate(${n2(Math.cos(middle) * distance)} ${n2(Math.sin(middle) * distance)})`);
    }
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };

  const current = () => [preview, selected].find((k) => k && visible.some((i) => i.key === k)) ?? null;
  const describe = (item) => `${item.label}, ${format(item.value)}, ${shareText(item.value / (total || 1))}${item.members ? `. ${L.includes} ${item.members.map((m) => m.label).join(', ')}` : ''}`;

  // ── Data → structure ──
  const derive = () => {
    slices = sliceData(data, o.groupBelow, o.maxSegments, otherLabel);
    hidden = new Set(hiddenList.filter((k) => slices.some((i) => i.key === k)));
    visible = slices.filter((i) => !hidden.has(i.key));
    total = visible.reduce((s, i) => s + i.value, 0);
    // Colours follow a key from the first time it is seen, so a segment keeps its colour through every dataset.
    for (const item of data) if (!palette.has(item.key)) palette.set(item.key, palette.size);
    const next = slices.map((i) => `${i.key}:${i.value}${hidden.has(i.key) ? 'h' : ''}`).join('|');
    const changed = next !== signature;
    signature = next;
    return changed;
  };

  const syncDrawn = () => {
    // Leaving segments stay drawn in their old place while they close, then drop out once they have.
    const next = [...slices];
    drawn.forEach((item, index) => {
      if (next.some((s) => s.key === item.key)) return;
      const before = drawn.slice(0, index).reverse().find((prior) => next.some((s) => s.key === prior.key));
      next.splice(before ? next.findIndex((s) => s.key === before.key) + 1 : 0, 0, { ...item, value: 0 });
    });
    drawn = next;
    for (const item of drawn) {
      let node = paths.get(item.key);
      if (!node) {
        node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        node.setAttribute('class', 'dn-segment');
        node.dataset.key = item.key;
        svg.append(node);
        paths.set(item.key, node);
      }
      node.style.setProperty('--slice', colorFor(item));
    }
    // Keep the DOM in drawn order.
    drawn.forEach((item) => svg.append(paths.get(item.key)));
  };

  const retarget = () => {
    if (!shown) return;
    const goal = layout(slices, hidden);
    targets = goal;
    const first = segments.size === 0;
    const place = (index) => { const before = drawn.slice(0, index).reverse().find((i) => goal.has(i.key)); return before ? goal.get(before.key).end : 0; };
    const drop = (key) => {
      if (slices.some((i) => i.key === key)) return;
      const seg = segments.get(key);
      seg?.start.stop(); seg?.end.stop(); seg?.lift.stop();
      segments.delete(key);
      paths.get(key)?.remove();
      paths.delete(key);
      drawn = drawn.filter((i) => i.key !== key);
      schedule();
    };
    drawn.forEach((item, index) => {
      const leaving = !goal.has(item.key);
      const to = goal.get(item.key) ?? { start: place(index), end: place(index) };
      let seg = segments.get(item.key);
      if (!seg) {
        // A new segment opens from the edge of the one before it, as it is right now.
        const prior = drawn.slice(0, index).reverse().map((e) => segments.get(e.key)).find(Boolean);
        const from = first ? 0 : prior ? prior.end.get() : 0;
        seg = { start: new Val(from, schedule), end: new Val(from, schedule), lift: new Val(0, schedule) };
        segments.set(item.key, seg);
      }
      if (reduced()) { seg.start.jump(to.start); seg.end.jump(to.end); if (leaving) drop(item.key); return; }
      if (first) {
        // One sweep: every segment leaves the top together, and each trailing edge follows a beat behind the one before.
        seg.start.to(to.start, reveal, REST);
        setTimeout(() => { if (segments.get(item.key) === seg) seg.end.to(to.end, reveal, REST); }, ms(0.04 + index * ARC.stagger.item));
        return;
      }
      seg.start.to(to.start, settle, REST);
      seg.end.to(to.end, settle, REST).then((landed) => { if (landed && leaving) drop(item.key); });
    });
    track.toggleAttribute('data-idle', !total);
    schedule();
  };

  const liftActive = () => {
    const now = current();
    for (const [key, seg] of segments) {
      const to = key === now ? 1 : 0;
      if (reduced()) seg.lift.jump(to); else if (seg.lift.get() !== to || seg.lift.moving) seg.lift.to(to, pop, { restDelta: 0.002, restSpeed: 0.004 });
    }
  };

  // ── The centre: one readout per segment plus the total, rolling like a drum ──
  const centre = () => {
    const now = current();
    const active = slices.find((i) => i.key === now && !hidden.has(i.key)) ?? null;
    const identity = active ? active.key : '__total';
    const list = [{ key: '__total', label: total ? totalLabel : emptyLabel, value: total, meta: null }, ...slices.map((i) => ({ key: i.key, label: i.label, value: i.value, meta: i }))];
    for (const [key, entry] of readouts) if (!list.some((l) => l.key === key)) { entry.node.remove(); entry.counters.forEach((x) => x.destroy()); readouts.delete(key); }
    const activeIndex = Math.max(0, list.findIndex((l) => l.key === identity));
    list.forEach((item, index) => {
      let entry = readouts.get(item.key);
      if (!entry) {
        const node = el('span', 'dn-readout', {}, '<span class="dn-center-label"></span><span class="dn-center-value"></span><span class="dn-center-meta"></span>');
        center.append(node);
        const valueC = counter(node.querySelector('.dn-center-value'), formatValue);
        entry = { node, counters: [valueC], valueC, shareC: null, meta: node.querySelector('.dn-center-meta') };
        readouts.set(item.key, entry);
        node.style.opacity = '0';
      }
      entry.node.querySelector('.dn-center-label').textContent = item.label;
      const meta = entry.meta;
      if (item.meta) {
        if (!entry.shareC) {
          meta.innerHTML = `<span class="dn-share"></span> ${esc(L.ofTotal('', totalLabel).replace(/^\s*/, ''))}`;
          entry.shareC = counter(meta.querySelector('.dn-share'), shareText);
          entry.counters.push(entry.shareC);
        }
      } else meta.textContent = o.unit || ' ';
      if (item.value || item.meta) entry.valueC.set(item.value); else entry.node.querySelector('.dn-center-value').textContent = ' ';
      entry.shareC?.set(total && !hidden.has(item.key) ? item.value / total : 0);
      const place = index - activeIndex;
      entry.node.toggleAttribute('data-active', place === 0);
      entry.node.style.opacity = place === 0 ? '1' : '0';
      entry.node.style.translate = `0 ${0.45 * Math.sign(place)}em`;
    });
  };

  // ── Legend rows mirror the segments: hovering either lights both ──
  const rowHtml = (item) => `<button type="button" class="dn-row"><span class="dn-dot" aria-hidden="true"></span><span class="dn-row-text"><span class="dn-row-label"></span><span class="dn-row-members"></span></span><span class="dn-row-value" aria-hidden="true"></span><span class="dn-row-share" aria-hidden="true"></span></button>`;
  const members = (item) => (item.members ? (item.members.length > 2 ? `${item.members.slice(0, 2).map((m) => m.label).join(', ')} ${L.more(item.members.length - 2)}` : item.members.map((m) => m.label).join(L.and)) : '');
  const legendSync = () => {
    if (!legend) return;
    for (const [key, entry] of [...rowsByKey]) {
      if (slices.some((i) => i.key === key)) continue;
      rowsByKey.delete(key);
      entry.counters.forEach((x) => x.destroy());
      entry.li.setAttribute('inert', '');
      collapse(entry.li, entry.li.offsetHeight, 0, () => entry.li.remove());
    }
    legend.setAttribute('aria-label', `${o.label}, ${L.segments}${o.legendAction === 'toggle' ? `. ${L.toggleHint}` : ''}`);
    slices.forEach((item, index) => {
      let entry = rowsByKey.get(item.key);
      if (!entry) {
        const li = el('li', 'dn-item', {}, rowHtml(item));
        const button = li.firstElementChild;
        entry = { li, button, counters: [counter(li.querySelector('.dn-row-value'), formatValue), counter(li.querySelector('.dn-row-share'), shareText)] };
        entry.valueC = entry.counters[0];
        entry.shareC = entry.counters[1];
        rowsByKey.set(item.key, entry);
        legend.append(li);
        if (shown && legend.children.length > 1 && signature !== '') { const h = li.offsetHeight; li.style.height = '0px'; li.style.opacity = '0'; collapse(li, 0, h); }
        button.addEventListener('click', () => (o.legendAction === 'toggle' ? toggleHidden(item.key) : select(selected === item.key ? null : item.key)));
        button.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') setPreview(hidden.has(item.key) ? null : item.key); });
        button.addEventListener('focus', () => { if (button.matches(':focus-visible')) setPreview(hidden.has(item.key) ? null : item.key); });
        button.addEventListener('blur', (event) => { if (!legend.contains(event.relatedTarget)) setPreview(null); });
        button.addEventListener('keydown', (event) => onLegendKey(event, item.key));
      }
      const off = hidden.has(item.key);
      const now = current();
      entry.button.style.setProperty('--slice', colorFor(item));
      entry.button.setAttribute('aria-pressed', String(o.legendAction === 'toggle' ? !off : selected === item.key));
      entry.button.setAttribute('aria-label', off ? L.hiddenRow(item.label) : describe(item));
      entry.button.toggleAttribute('data-active', item.key === now);
      entry.button.toggleAttribute('data-pinned', selected === item.key);
      entry.button.toggleAttribute('data-hidden', off);
      entry.li.querySelector('.dn-row-label').textContent = item.label;
      entry.li.querySelector('.dn-row-members').textContent = members(item);
      entry.valueC.set(item.value);
      entry.shareC.set(off || !total ? 0 : item.value / total);
    });
    // Rows keep the order of the data; a node is only moved when it is out of place (a move drops its focus).
    const want = slices.map((i) => rowsByKey.get(i.key).li);
    const have = [...legend.children].filter((n) => want.includes(n));
    if (want.some((n, i) => n !== have[i])) want.forEach((n) => legend.append(n));
  };

  const a11y = () => {
    summary.textContent = total ? `${o.label}. ${totalLabel} ${format(total)}. ${visible.map(describe).join('. ')}.` : `${o.label}. ${emptyLabel}.`;
    const rows = visible.flatMap((i) => (i.members ? i.members.map((m) => ({ key: m.key, label: `${m.label} (${otherLabel})`, value: m.value })) : [i]));
    tableBox.innerHTML = total > 0 ? `<table><caption>${esc(o.label)}</caption><thead><tr><th scope="col">${esc(L.segment)}</th><th scope="col">${esc(L.value)}</th><th scope="col">${esc(L.share)}</th></tr></thead><tbody>${rows.map((i) => `<tr><th scope="row">${esc(i.label)}</th><td>${esc(format(i.value))}</td><td>${esc(shareText(i.value / total))}</td></tr>`).join('')}</tbody></table>` : '';
  };
  const marks = () => {
    const now = current();
    for (const [key, node] of paths) {
      node.toggleAttribute('data-active', key === now);
      node.toggleAttribute('data-dim', now !== null && key !== now);
    }
    svg.toggleAttribute('data-hovering', now !== null);
    legendSync();
    centre();
    liftActive();
  };

  const render = () => {
    const changed = derive();
    syncDrawn();
    if (changed || !segments.size) retarget();
    marks();
    a11y();
  };

  // ── Interaction ──
  function setPreview(key) { if (key !== preview) { preview = key; marks(); } }
  function select(key) { selected = key; o.onActiveChange?.(key); emit('active', { key }); marks(); }
  function toggleHidden(key) {
    const isHidden = hidden.has(key);
    if (!isHidden && visible.length <= 1) return;
    hiddenList = isHidden ? hiddenList.filter((k) => k !== key) : [...hiddenList, key];
    o.onHiddenKeysChange?.(hiddenList);
    emit('hidden', { keys: hiddenList });
    const item = slices.find((s) => s.key === key);
    const nextTotal = slices.reduce((s, i) => s + (hiddenList.includes(i.key) ? 0 : i.value), 0);
    render();
    if (item) announce(`${item.label} ${isHidden ? L.shown : L.hiddenWord}. ${totalLabel} ${format(nextTotal)}.`);
  }
  const rows = () => [...(legend?.querySelectorAll('.dn-row') ?? [])];
  const step = (key, index, count) => ({ ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: count - 1 })[key];
  function onLegendKey(event) {
    if (event.key === 'Escape' && selected) { event.preventDefault(); select(null); return; }
    const list = rows();
    const index = list.indexOf(event.currentTarget);
    const next = step(event.key, index, list.length);
    if (next === undefined) return;
    event.preventDefault();
    list[(next + list.length) % list.length]?.focus();
  }
  const hit = (event) => {
    const box = svg.getBoundingClientRect();
    if (!box.width) return undefined;
    const scale = o.size / box.width;
    const x = (event.clientX - box.left) * scale - c;
    const y = (event.clientY - box.top) * scale - c;
    const radius = Math.hypot(x, y);
    if (radius < inner - 6 || radius > c) return null;
    let turn = (Math.atan2(y, x) + Math.PI / 2) / TAU;
    if (turn < 0) turn += 1;
    for (const [key, arc] of targets) if (arc.end > arc.start && turn >= arc.start && turn < arc.end && visible.some((i) => i.key === key)) return key;
    return undefined;
  };
  svg.addEventListener('pointermove', (event) => { if (event.pointerType !== 'mouse') return; const key = hit(event); if (key !== undefined) setPreview(key); });
  svg.addEventListener('pointerleave', () => setPreview(null));
  svg.addEventListener('click', (event) => { const key = hit(event); if (key) select(selected === key ? null : key); });
  legend?.addEventListener('pointerleave', () => setPreview(null));
  if (!o.legend) {
    ring.addEventListener('blur', () => setPreview(null));
    ring.addEventListener('keydown', (event) => {
      if (!visible.length) return;
      if (event.key === 'Escape') { event.preventDefault(); setPreview(null); if (selected) select(null); return; }
      const now = current();
      if ((event.key === 'Enter' || event.key === ' ') && now) { event.preventDefault(); select(selected === now ? null : now); return; }
      const index = visible.findIndex((i) => i.key === now);
      const next = step(event.key, index < 0 ? (event.key.endsWith('Up') || event.key.endsWith('Left') ? 0 : -1) : index, visible.length);
      if (next === undefined) return;
      event.preventDefault();
      const item = visible[(next + visible.length) % visible.length];
      setPreview(item.key);
      announce(describe(item));
    });
  }

  // The first sweep waits until the chart is seen (35 % of it, once).
  let io = null;
  const reveal1 = () => { shown = true; retarget(); marks(); };
  if (shown) { render(); } else {
    render();
    io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { io.disconnect(); reveal1(); } }, { threshold: 0.35 });
    io.observe(root);
  }

  const handle = {
    get hidden() { return [...hiddenList]; },
    get active() { return selected; },
    setData(next) { data = [...next]; render(); },
    setHidden(keys) { hiddenList = [...keys]; render(); },
    setActive(key) { selected = key; marks(); },
    destroy() {
      handles.delete(root);
      life.abort();
      io?.disconnect();
      cancelAnimationFrame(raf);
      for (const seg of segments.values()) { seg.start.stop(); seg.end.stop(); seg.lift.stop(); }
      for (const e of readouts.values()) e.counters.forEach((x) => x.destroy());
      for (const e of rowsByKey.values()) e.counters.forEach((x) => x.destroy());
      root.replaceChildren();
      root.classList.remove('dn');
      root.removeAttribute('aria-label');
      root.removeAttribute('data-legend');
    },
  };
  handles.set(root, handle);
  return handle;
}
