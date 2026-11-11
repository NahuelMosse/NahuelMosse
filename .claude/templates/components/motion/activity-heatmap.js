// Activity heatmap, ported from Arc (registry/components/activity-heatmap/activity-heatmap.tsx, MIT). A contribution-style
// calendar: one square per day, weeks as columns, four accent tints for how busy a day was (levels at quarters of the
// busiest day unless `thresholds` says otherwise). Cells wave in once on view along the diagonal (the whole wave takes 420
// ms however many weeks there are), and a new range recolors the grid in a sweep, forward for a later range and back for
// an earlier one, instead of redrawing it. One tooltip glides between cells on `snappy` springs (its width on `morph`),
// jumping into place when it opens, and its text rolls with the count. The total in the summary rolls digit by digit and
// its frame springs to the new width. The legend previews a level on hover or focus (90 ms to let go) and pins it on a press.
// Arrows move by day and week, Home and End jump, Enter selects, Escape closes the tooltip; a selection ring glides
// between days. The grid is a named read-only grid with one label per day. Reduced motion: plain fades.
import { locale, reduced, scope, uid } from '../core.js';
import { EASE, SPRINGS, TOKENS, glide, springCurve, swapper, value } from './arc-shared.js';
import { define, node } from './mu-shared.js';

const DAY = 86_400_000;
const WAVE = 420;
const toUtc = (iso) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (t) => new Date(t).toISOString().slice(0, 10);
const SNAPPY = springCurve(SPRINGS.snappy);

const buildModel = (days, weekStartsOn, thresholds, loc) => {
  const dates = days.map((d) => toUtc(d.date)).filter(Number.isFinite);
  const start = dates.length ? Math.min(...dates) : toUtc('2025-01-01');
  const length = dates.length ? Math.round((Math.max(...dates) - start) / DAY) + 1 : 0;
  const counts = new Array(length).fill(0);
  for (const d of days) { const i = Math.round((toUtc(d.date) - start) / DAY); if (i >= 0 && i < length) counts[i] += Math.max(0, d.count); }
  const max = counts.reduce((a, b) => Math.max(a, b), 0);
  const bounds = thresholds ?? [Math.max(1, Math.ceil(max * 0.25)), Math.max(2, Math.ceil(max * 0.5)), Math.max(3, Math.ceil(max * 0.75))];
  const levels = counts.map((c) => (c <= 0 ? 0 : c <= bounds[0] ? 1 : c <= bounds[1] ? 2 : c <= bounds[2] ? 3 : 4));
  const lead = (new Date(start).getUTCDay() - weekStartsOn + 7) % 7;
  const weeks = Math.ceil((lead + length) / 7);
  const monthName = new Intl.DateTimeFormat(loc, { month: 'short', timeZone: 'UTC' });
  const months = [];
  for (let i = 0; i < length; i++) {
    const date = new Date(start + i * DAY);
    if (i === 0 || date.getUTCDate() === 1) months.push({ month: date.getUTCFullYear() * 12 + date.getUTCMonth(), col: Math.floor((lead + i) / 7), label: monthName.format(date) });
  }
  // A partial first month keeps its label only when there is room before the next one.
  if (months.length > 1 && months[1].col - months[0].col < 3) months.shift();
  const perLevel = [0, 0, 0, 0, 0];
  for (const l of levels) perLevel[l]++;
  return { start, length, lead, weeks, total: counts.reduce((a, b) => a + b, 0), counts, levels, thresholds: bounds, months, perLevel };
};

export const mount = define('activity-heatmap', (el, opts) => {
  let days = opts.days;
  if (days === undefined && el.dataset.days) { try { days = JSON.parse(el.dataset.days); } catch { throw new RangeError('activity-heatmap: data-days is not valid JSON'); } }
  if (!Array.isArray(days)) throw new RangeError('activity-heatmap: days is a list of {date: "YYYY-MM-DD", count}');
  for (const d of days) if (typeof d?.date !== 'string' || !Number.isFinite(toUtc(d.date)) || !Number.isFinite(d.count)) throw new RangeError('activity-heatmap: every day needs a YYYY-MM-DD date and a numeric count');
  const label = opts.label ?? el.dataset.label;
  if (!label) throw new RangeError('activity-heatmap: a label names the grid');
  let period = opts.period ?? el.dataset.period ?? '';
  const weekStartsOn = opts.weekStartsOn ?? (el.dataset.weekStartsOn === undefined ? 1 : Number(el.dataset.weekStartsOn));
  if (weekStartsOn !== 0 && weekStartsOn !== 1) throw new RangeError('activity-heatmap: weekStartsOn is 0 (Sunday) or 1 (Monday)');
  const thresholds = opts.thresholds;
  if (thresholds && (thresholds.length !== 3 || !thresholds.every((t, i) => Number.isFinite(t) && (i === 0 || t > thresholds[i - 1])))) throw new RangeError('activity-heatmap: thresholds are three increasing numbers');
  const unit = opts.unit ?? { one: 'contribution', other: 'contributions' };
  const loc = opts.locale ?? locale(el);
  const onSelect = opts.onSelectDate;
  const noun = (n) => (n === 1 ? unit.one : unit.other);
  const nf = new Intl.NumberFormat(loc);
  const words = {
    in: 'in', less: 'Less', more: 'More',
    cell: (count, u, date) => `${count ? nf.format(count) : 'No'} ${u}, ${date}`,
    none: (u) => `No ${u.other}`,
    legendHelp: (u, ranges) => `Darker squares mean more ${u.other}. Levels: ${ranges.join(', ')}.`,
    ranges: (b, u) => ({
      long: [`no ${u.other}`, b[0] === 1 ? `1 ${u.one}` : `1 to ${b[0]} ${u.other}`, `${b[0] + 1} to ${b[1]} ${u.other}`, `${b[1] + 1} to ${b[2]} ${u.other}`, `${b[2] + 1} or more ${u.other}`],
      short: [`no ${u.other}`, b[0] === 1 ? `1 ${u.one}` : `1–${b[0]} ${u.other}`, `${b[0] + 1}–${b[1]} ${u.other}`, `${b[1] + 1}–${b[2]} ${u.other}`, `${b[2] + 1}+ ${u.other}`],
    }),
    days: (n) => `${nf.format(n)} ${n === 1 ? 'day' : 'days'}`,
    caption: (dayCount, range) => `${dayCount} with ${range}`,
    highlight: (range) => `Highlight days with ${range}`,
    levels: 'Highlight days by level',
    ...opts.labels,
  };
  const fmts = {
    long: new Intl.DateTimeFormat(loc, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
    short: new Intl.DateTimeFormat(loc, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
    weekday: new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }),
  };

  const previous = el.innerHTML;
  const life = scope();
  const id = uid('arhm');
  el.classList.add('ar-heat');

  // ── Parts ──
  const header = node('div', 'ar-heat__header');
  const summary = node('p', 'ar-heat__summary');
  const totalEl = node('span', 'ar-heat__total');
  const rollFrame = node('span', 'ar-heat__rolling-frame', { decorative: true });
  const rolling = node('span', 'ar-heat__rolling');
  rollFrame.append(rolling);
  const nounEl = node('span');
  totalEl.append(rollFrame, ' ', nounEl);
  const periodEl = node('span', 'ar-heat__period');
  const riseHost = node('span', 'ar-heat__rise', { decorative: true });
  const inWord = node('span');
  inWord.textContent = `${words.in} `;
  periodEl.append(inWord, riseHost);
  const status = node('span', 'ar-sr');
  status.setAttribute('role', 'status');
  summary.append(totalEl, ' ', periodEl, status);
  header.append(summary);
  if (opts.actions instanceof Node) { const a = node('div', 'ar-heat__actions'); a.append(opts.actions); header.append(a); }
  const scroller = node('div', 'ar-heat__scroller');
  const canvas = node('div', 'ar-heat__canvas');
  const months = node('div', 'ar-heat__months', { decorative: true });
  const weekdays = node('div', 'ar-heat__weekdays', { decorative: true });
  const plot = node('div', 'ar-heat__plot');
  const grid = node('div', 'ar-heat__grid');
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', label);
  grid.setAttribute('aria-readonly', 'true');
  grid.setAttribute('aria-describedby', `${id}-legend`);
  const ring = node('span', 'ar-heat__ring', { decorative: true });
  plot.append(grid, ring);
  canvas.append(months, weekdays, plot);
  scroller.append(canvas);
  const legend = node('div', 'ar-heat__legend');
  const legendHelp = node('span', 'ar-sr');
  legendHelp.id = `${id}-legend`;
  const captionEl = node('span', 'ar-heat__caption');
  captionEl.setAttribute('aria-live', 'polite');
  const captionHost = node('span', 'ar-heat__rise', { decorative: true });
  const captionSr = node('span', 'ar-sr');
  captionEl.append(captionHost, captionSr);
  const scale = node('span', 'ar-heat__scale');
  const lessEl = node('span', 'ar-heat__legend-text', { decorative: true });
  lessEl.textContent = words.less;
  const swatches = node('div', 'ar-heat__swatches');
  swatches.setAttribute('role', 'group');
  swatches.setAttribute('aria-label', words.levels);
  const moreEl = node('span', 'ar-heat__legend-text', { decorative: true });
  moreEl.textContent = words.more;
  scale.append(lessEl, swatches, moreEl);
  legend.append(legendHelp, captionEl, scale);
  const tip = node('div', 'ar-heat__tip', { decorative: true });
  const bubble = node('div', 'ar-heat__bubble');
  const tipBody = node('span', 'ar-heat__tip-body');
  const tipMeasure = node('span', 'ar-heat__tip-measure');
  const tipLinesHost = node('span', 'ar-heat__tip-lines-host');
  tipBody.append(tipMeasure, tipLinesHost);
  bubble.append(tipBody);
  tip.append(bubble);
  el.replaceChildren(header, scroller, legend, tip);
  bubble.style.opacity = '0';

  // ── State ──
  let model = buildModel(days, weekStartsOn, thresholds, loc);
  let selectedDate = opts.selectedDate ?? null;
  let range = { start: model.start, direction: 1 };
  let reveal = 'hidden';
  let focusIndex = null;
  let preview = null;
  let pinned = null;
  let legendFocus = 0;
  let previewTimer = 0;
  let hideTimer = 0;
  let open = false;
  let openRef = false;
  let current = null;
  let lastTotal = model.total;
  let armedUntil = 0;
  let rollWidth = null;
  const cells = [];
  const monthEls = new Map();
  const places = [];

  // ── The rolling total: one window per place value, turning the way the number moved ──
  const frameW = value(0, (w) => { rollFrame.style.width = `${w}px`; });
  const roll = (n, direction, instant) => {
    const chars = [...nf.format(n)];
    while (places.length < chars.length) {
      const host = node('span', 'ar-heat__place');
      rolling.prepend(host);
      places.push({ host, swap: swapper(host, { className: 'ar-heat__place-char' }) });
    }
    while (places.length > chars.length) { const p = places.pop(); p.swap.destroy(); p.host.remove(); }
    chars.forEach((ch, i) => {
      const place = chars.length - i;
      const p = places[place - 1];
      p.swap.set(ch, direction, { instant, wait: Math.min(place * 0.018, 0.09) });
    });
  };
  life.watch(new ResizeObserver(() => {
    const next = rolling.getBoundingClientRect().width;
    if (reduced() || rollWidth === null || performance.now() > armedUntil) frameW.jump(next); else frameW.to(next, { spring: SPRINGS.morph, rest: 0.01 });
    rollWidth = next;
  })).observe(rolling);

  const periodSwap = swapper(riseHost, { className: 'ar-heat__rise-line' });
  const captionSwap = swapper(captionHost, { className: 'ar-heat__rise-line' });

  // ── The grid ──
  const dateOf = (index) => new Date(model.start + index * DAY);
  const levelRanges = () => words.ranges(model.thresholds, unit);
  const render = (first) => {
    const { weeks, lead, length } = model;
    canvas.style.setProperty('--weeks', String(weeks));
    const maxDiagonal = Math.max(1, weeks - 1 + 6);
    const step = Math.min(12, WAVE / maxDiagonal);
    const tabDay = focusIndex !== null && focusIndex < length ? focusIndex : selectedIndex() >= 0 && selectedIndex() < length ? selectedIndex() : length - 1;
    const rows = [...grid.children];
    for (let r = rows.length; r < 7; r++) { const row = node('div', 'ar-heat__row'); row.setAttribute('role', 'row'); grid.append(row); rows.push(row); cells[r] = []; }
    for (let r = 0; r < 7; r++) {
      const list = cells[r];
      while (list.length < weeks) { const c = node('span', 'ar-heat__cell'); rows[r].append(c); list.push(c); }
      while (list.length > weeks) list.pop().remove();
      for (let col = 0; col < weeks; col++) {
        const c = list[col];
        const index = col * 7 + r - lead;
        const inRange = index >= 0 && index < length;
        c.style.setProperty('--wave', `${Math.round((col + r) * step)}ms`);
        c.style.setProperty('--wave-back', `${Math.round((maxDiagonal - col - r) * step)}ms`);
        if (!inRange) {
          for (const a of ['role', 'data-index', 'data-level', 'aria-label', 'aria-selected', 'tabindex']) c.removeAttribute(a);
          c.dataset.empty = '';
          c.setAttribute('aria-hidden', 'true');
          continue;
        }
        delete c.dataset.empty;
        c.removeAttribute('aria-hidden');
        c.setAttribute('role', 'gridcell');
        c.dataset.index = String(index);
        c.dataset.level = String(model.levels[index]);
        c.tabIndex = index === tabDay ? 0 : -1;
        if (onSelect) c.setAttribute('aria-selected', String(index === selectedIndex())); else c.removeAttribute('aria-selected');
        c.setAttribute('aria-label', words.cell(model.counts[index], noun(model.counts[index]), fmts.long.format(dateOf(index))));
      }
    }
    // month labels glide to their new week when a range starts on a different weekday
    const keyed = model.months.map((m, order) => ({ ...m, key: `${m.month % 12}-${model.months.findIndex((x) => x.month % 12 === m.month % 12) === order ? 0 : 1}` }));
    for (const [k, n] of [...monthEls]) if (!keyed.some((m) => m.key === k)) { n.remove(); monthEls.delete(k); }
    for (const m of keyed) {
      let n = monthEls.get(m.key);
      if (!n) { n = node('span', 'ar-heat__month'); months.append(n); monthEls.set(m.key, n); if (!first) { n.style.transition = 'none'; requestAnimationFrame(() => { n.style.transition = ''; }); } }
      n.textContent = m.label;
      n.style.setProperty('--col', String(m.col));
    }
    weekdays.replaceChildren(...Array.from({ length: 7 }, (_, row) => {
      const wd = (row + weekStartsOn) % 7;
      const s = node('span', 'ar-heat__weekday');
      // January 4, 1970 was a Sunday.
      s.textContent = wd % 2 === 1 ? fmts.weekday.format(new Date((3 + wd) * DAY)) : '';
      return s;
    }));
    const selected = selectedIndex();
    const has = selected >= 0 && selected < length;
    ring.style.setProperty('--col', String(has ? Math.floor((selected + lead) / 7) : 0));
    ring.style.setProperty('--row', String(has ? (selected + lead) % 7 : 0));
    ring.toggleAttribute('data-shown', has && reveal !== 'hidden');
    grid.dataset.reveal = reveal;
    if (range.direction < 0) grid.dataset.direction = 'back'; else delete grid.dataset.direction;
    nounEl.textContent = noun(model.total);
    status.textContent = `${nf.format(model.total)} ${noun(model.total)} ${words.in} ${period}`;
    periodSwap.set(period, 1, { instant: first });
    const r = levelRanges();
    legendHelp.textContent = words.legendHelp(unit, r.long);
    swatches.replaceChildren(...[0, 1, 2, 3, 4].map((level) => {
      const b = node('button', 'ar-heat__swatch');
      b.type = 'button';
      b.dataset.levelKey = String(level);
      b.dataset.level = String(level);
      b.tabIndex = level === legendFocus ? 0 : -1;
      b.setAttribute('aria-pressed', String(pinned === level));
      b.setAttribute('aria-label', words.highlight(r.long[level]));
      b.addEventListener('click', () => { pinned = pinned === level ? null : level; paintLegend(); }, { signal: life.signal });
      b.addEventListener('pointerenter', () => previewLevel(level), { signal: life.signal });
      b.addEventListener('pointerleave', () => previewLevel(null), { signal: life.signal });
      b.addEventListener('focus', () => { legendFocus = level; previewLevel(level); }, { signal: life.signal });
      b.addEventListener('blur', () => previewLevel(null), { signal: life.signal });
      return b;
    }));
    paintLegend(first);
  };
  const selectedIndex = () => (selectedDate ? Math.round((toUtc(selectedDate) - model.start) / DAY) : -1);

  // Legend: hovering or focusing a level previews it on the grid, clicking pins it.
  const paintLegend = (first = false) => {
    const highlight = preview ?? pinned;
    if (highlight === null) delete grid.dataset.highlight; else grid.dataset.highlight = String(highlight);
    swatches.querySelectorAll('button').forEach((b, level) => b.setAttribute('aria-pressed', String(pinned === level)));
    const r = levelRanges();
    const dayCount = highlight === null ? '' : words.days(model.perLevel[highlight]);
    const long = highlight === null ? '' : words.caption(dayCount, r.short[highlight]);
    // Narrow cards keep the day count and let the highlighted squares say which level it is.
    const text = highlight === null ? '' : el.clientWidth <= 440 ? dayCount : long;
    captionSwap.set(text, 1, { instant: first });
    captionSr.textContent = long;
  };
  const previewLevel = (level) => {
    clearTimeout(previewTimer);
    if (level !== null) { preview = level; paintLegend(); } else previewTimer = setTimeout(() => { preview = null; paintLegend(); }, 90);
  };
  life.watch(new ResizeObserver(() => paintLegend(true))).observe(el);

  // ── Tooltip: one bubble for the whole grid ──
  const tipX = value(0, (x) => { tip.style.transform = `translate(${x}px, ${tipY.get()}px)`; });
  const tipY = value(0, (y) => { tip.style.transform = `translate(${tipX.get()}px, ${y}px)`; });
  const tipW = value(0, (w) => { tipBody.style.width = `${w}px`; });
  const linesSwap = (() => {
    let node_ = null;
    return {
      set(content, change) {
        const old = node_;
        const lines = node('span', 'ar-heat__tip-lines');
        const a = node('span', 'ar-heat__tip-primary');
        const b = node('span', 'ar-heat__tip-secondary');
        a.textContent = content.primary;
        b.textContent = content.secondary;
        lines.append(a, b);
        if (old) {
          old.setAttribute('aria-hidden', 'true');
          Object.assign(old.style, { position: 'absolute', left: `${old.offsetLeft}px`, top: `${old.offsetTop}px` });
          const gone = () => old.remove();
          const dir = change || 1;
          const out = change === 'instant' || reduced()
            ? old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1, fill: 'forwards' })
            : old.animate([{ opacity: 1, transform: 'none', filter: 'blur(0px)' }, { opacity: 0, transform: `translateY(${-0.3 * dir}em)`, filter: `blur(${TOKENS.blur.subtle}px)` }], { duration: TOKENS.duration.instant * 1000, easing: EASE.standard, fill: 'forwards' });
          out.onfinish = gone;
          out.oncancel = gone;
        }
        node_ = lines;
        tipLinesHost.append(lines);
        tipMeasure.replaceChildren(a.cloneNode(true), b.cloneNode(true));
        if (change === 'instant') return;
        if (reduced()) { lines.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140 }); return; }
        lines.animate([{ opacity: 0, transform: `translateY(${0.3 * (change || 1)}em)`, filter: `blur(${change ? TOKENS.blur.soft : TOKENS.blur.subtle}px)` }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: TOKENS.duration.standard * 1000, easing: EASE.enter });
      },
    };
  })();
  const contentFor = (index, anchor) => {
    const count = model.counts[index];
    const date = dateOf(index);
    return { key: `day-${toIso(date.getTime())}`, primary: count ? `${nf.format(count)} ${noun(count)}` : words.none(unit), secondary: fmts.short.format(date), value: count, anchor };
  };
  const placeTip = (animated) => {
    if (!current) return;
    const box = el.getBoundingClientRect();
    const cell = current.anchor.getBoundingClientRect();
    const width = Math.ceil(tipMeasure.getBoundingClientRect().width);
    const half = width / 2 + 13;
    const x = Math.min(Math.max(cell.left - box.left + cell.width / 2, half + 2), box.width - half - 2);
    const y = cell.top - box.top;
    if (animated) { tipX.to(x, { spring: SPRINGS.snappy }); tipY.to(y, { spring: SPRINGS.snappy }); tipW.to(width, { spring: SPRINGS.morph }); } else { tipX.jump(x); tipY.jump(y); tipW.jump(width); }
  };
  const bubbleTo = (isOpen) => {
    if (reduced()) { glide(bubble, { opacity: isOpen ? '1' : '0' }, { duration: isOpen ? TOKENS.duration.fast * 1000 : TOKENS.duration.instant * 1000 }); return; }
    if (isOpen) {
      glide(bubble, { scale: '1' }, { duration: SNAPPY.duration, easing: SNAPPY.easing });
      glide(bubble, { opacity: '1' }, { duration: TOKENS.duration.fast * 1000, easing: EASE.enter });
    } else glide(bubble, { opacity: '0', scale: '0.96' }, { duration: TOKENS.duration.instant * 1000, easing: EASE.standard });
  };
  const show = (next) => {
    clearTimeout(hideTimer);
    const change = current && openRef ? Math.sign(next.value - current.value) : 'instant';
    const sameKey = current?.key === next.key;
    current = next;
    if (!sameKey || !open) linesSwap.set(next, change);
    open = true;
    placeTip(openRef && !reduced());
    if (!openRef) bubbleTo(true);
    openRef = true;
  };
  const hideSoon = (delay = 110) => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!open) return; open = false; openRef = false; bubbleTo(false); }, delay);
  };
  const cellOf = (target) => { const c = target?.closest?.('[data-index]'); return c && grid.contains(c) ? { cell: c, index: Number(c.dataset.index) } : null; };
  const focusDay = (index) => grid.querySelector(`[data-index="${index}"]`)?.focus();

  grid.addEventListener('pointerover', (e) => { const hit = cellOf(e.target); if (hit) show(contentFor(hit.index, hit.cell)); }, { signal: life.signal });
  grid.addEventListener('pointerleave', (e) => {
    // A keyboard user keeps their bubble on the focused day; where a tap does not focus, it lingers long enough to read.
    const f = cellOf(document.activeElement);
    if (f?.cell.matches(':focus-visible')) show(contentFor(f.index, f.cell)); else hideSoon(e.pointerType === 'touch' ? 2400 : 110);
  }, { signal: life.signal });
  grid.addEventListener('focusin', (e) => {
    const hit = cellOf(e.target);
    if (!hit) return;
    focusIndex = hit.index;
    for (const c of grid.querySelectorAll('[data-index]')) c.tabIndex = Number(c.dataset.index) === focusIndex ? 0 : -1;
    show(contentFor(hit.index, hit.cell));
  }, { signal: life.signal });
  grid.addEventListener('focusout', (e) => { if (!grid.contains(e.relatedTarget)) hideSoon(0); }, { signal: life.signal });
  grid.addEventListener('click', (e) => { const hit = cellOf(e.target); if (hit && onSelect) onSelect(toIso(model.start + hit.index * DAY)); }, { signal: life.signal });
  grid.addEventListener('keydown', (e) => {
    const hit = cellOf(e.target);
    if (!hit) return;
    const moves = { ArrowUp: hit.index - 1, ArrowDown: hit.index + 1, ArrowLeft: hit.index - 7, ArrowRight: hit.index + 7, Home: 0, End: model.length - 1 };
    if (e.key in moves) { e.preventDefault(); focusDay(Math.min(Math.max(moves[e.key], 0), model.length - 1)); } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(toIso(model.start + hit.index * DAY)); } else if (e.key === 'Escape' && open) { e.preventDefault(); open = false; openRef = false; bubbleTo(false); }
  }, { signal: life.signal });
  swatches.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { previewLevel(null); return; }
    const moves = { ArrowLeft: legendFocus - 1, ArrowRight: legendFocus + 1, Home: 0, End: 4 };
    if (!(e.key in moves)) return;
    e.preventDefault();
    swatches.querySelector(`[data-level-key="${Math.min(Math.max(moves[e.key], 0), 4)}"]`)?.focus();
  }, { signal: life.signal });
  // The grid scrolls sideways on narrow screens; the bubble stays pinned to its cell while it does.
  scroller.addEventListener('scroll', () => { if (open) placeTip(false); }, { passive: true, signal: life.signal });

  // ── Reveal ──
  const startReveal = () => {
    if (reveal !== 'hidden') return;
    requestAnimationFrame(() => {
      reveal = reduced() ? 'done' : 'revealing';
      grid.dataset.reveal = reveal;
      ring.toggleAttribute('data-shown', selectedIndex() >= 0 && selectedIndex() < model.length);
      if (reveal === 'revealing') setTimeout(() => { reveal = 'done'; grid.dataset.reveal = 'done'; }, WAVE + 700);
    });
  };
  const io = life.watch(new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { startReveal(); io.disconnect(); } }, { threshold: 0.35 }));

  roll(model.total, 1, true);
  render(true);
  if (reduced()) startReveal(); else io.observe(plot);

  return {
    // New data: the grid recolors in a sweep, the total rolls and the period text rises.
    update(next = {}) {
      const nextDays = next.days ?? days;
      if (!Array.isArray(nextDays)) throw new RangeError('activity-heatmap: days is a list of {date, count}');
      for (const d of nextDays) if (typeof d?.date !== 'string' || !Number.isFinite(toUtc(d.date)) || !Number.isFinite(d.count)) throw new RangeError('activity-heatmap: every day needs a YYYY-MM-DD date and a numeric count');
      days = nextDays;
      if (next.period !== undefined) period = next.period;
      if (next.selectedDate !== undefined) selectedDate = next.selectedDate;
      const prev = model;
      model = buildModel(days, weekStartsOn, thresholds, loc);
      if (model.start !== range.start) range = { start: model.start, direction: model.start > range.start ? 1 : -1 };
      const direction = model.total >= prev.total ? 1 : -1;
      armedUntil = performance.now() + 600;
      lastTotal = model.total;
      roll(model.total, direction, false);
      render(false);
      if (open && current) { const c = grid.querySelector(`[data-index="${Number(current.anchor.dataset.index)}"]`); if (!c) { open = false; openRef = false; bubbleTo(false); } }
    },
    select(date) { selectedDate = date; render(false); },
    get total() { return lastTotal; },
    destroy() {
      clearTimeout(previewTimer);
      clearTimeout(hideTimer);
      for (const v of [frameW, tipX, tipY, tipW]) v.stop();
      life.destroy();
      el.innerHTML = previous;
      el.classList.remove('ar-heat');
    },
  };
});
