// Usage meter, ported from Arc (registry/components/usage-meter/usage-meter.tsx, MIT). A segmented meter of a fixed allowance:
// each segment starts where the ones before it end, so growth in any of them pushes the rest along in the same frame, and
// stops two pixels short of the next one so neighbours read apart without an outline. Every amount is a value on the
// `smooth` spring (the first reveal, once the meter is seen, runs left to right on a .58 s spring, 70 ms apart); the bar
// spans the limit, or everything used once that is more, so crossing the limit is continuous; past the limit the bar is
// struck through by a hatch and a limit marker appears. Numbers are digit wheels keyed by place value (9,8 -> 10,4 keeps
// the ones column and a new tens column opens from zero width) that turn the way the number moved. The status mark hugs
// its words on a spring, and a warning icon pops in beside them near the limit. Hover or focus previews a category, a
// press pins it until it is pressed again or Escape; the legend is the keyboard path (arrows, Home, End). A screen reader
// gets the summary on the bar and one polite announcement when the status changes; reduced motion jumps and fades.
import { locale, reduced, scope, uid } from '../core.js';
import { SPRINGS, TOKENS, fadeIn, physical, popper, settle, svgNode, swapper, value } from './arc-shared.js';
import { define, node } from './mu-shared.js';

const GAP = 2;
const LAG = 40;
const SETTLE = SPRINGS.smooth;
const REVEAL = physical(TOKENS.duration.considered + 0.1, 0);
const FIT = SPRINGS.morph;
const WARN = '<path d="M7 1.9L1.4 11.6A1.2 1.2 0 0 0 2.4 13.4h11.2a1.2 1.2 0 0 0 1-1.8L9 1.9a1.2 1.2 0 0 0-2 0z" transform="translate(0 .4)"/><path d="M8 6.2v2.8M8 11.1v.01"/>';
const ALERT = '<circle cx="8" cy="8" r="6"/><path d="M8 5v3.4M8 10.8v.01"/>';
const glyph = (paths, size = 14, width = 2) => { const s = svgNode('svg', { viewBox: '0 0 16 16', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' }); s.innerHTML = paths; return s; };

// ── A rolling number: columns keyed by place value, each a clipped wheel that feathers at its edges ──
const makeTicker = (host, { loc, decimals }) => {
  const format = new Intl.NumberFormat(loc, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const cols = new Map();
  let last = null;
  const partsFor = (n) => {
    const parts = format.formatToParts(n);
    let place = parts.reduce((c, p) => c + (p.type === 'integer' ? p.value.length : 0), 0);
    let fraction = 0;
    return parts.flatMap((p, i) => {
      if (p.type === 'integer') return [...p.value].map((ch) => ({ key: `i${--place}`, digit: Number(ch) }));
      if (p.type === 'fraction') return [...p.value].map((ch) => ({ key: `f${fraction++}`, digit: Number(ch) }));
      return [{ key: p.type === 'group' ? `g${place}` : p.type === 'decimal' ? 'd' : `${p.type}${i}`, text: p.value }];
    });
  };
  const open = (c, first) => {
    c.el.style.width = '';
    const natural = c.el.getBoundingClientRect().width;
    if (first || reduced()) { if (!first) fadeIn(c.el); return; }
    c.presence = value(0, (p) => { c.el.style.width = `${p * natural}px`; c.el.style.opacity = String(Math.min(1, Math.max(0, p))); });
    c.presence.jump(0);
    c.presence.to(1, { spring: FIT, rest: 0.01, done: () => { c.el.style.width = ''; c.el.style.opacity = ''; } });
  };
  const wheel = (c, digit, direction) => {
    if (c.digit === digit) return;
    c.target += direction < 0 ? -((c.digit - digit + 10) % 10) : (digit - c.digit + 10) % 10;
    c.digit = digit;
    if (reduced()) { c.pos.jump(c.target); return; }
    c.pos.to(c.target, { spring: SETTLE, rest: 0.001 });
  };
  const make = (part) => {
    const el = node('span');
    if ('digit' in part) {
      el.className = 'ar-meter__column';
      const sizer = node('span', 'ar-meter__sizer');
      sizer.textContent = '0';
      el.append(sizer);
      const glyphs = [...Array(10).keys()].map((d) => { const g = node('span', 'ar-meter__glyph'); g.textContent = String(d); el.append(g); return g; });
      const c = { key: part.key, el, digit: part.digit, target: part.digit, glyphs };
      c.pos = value(part.digit, (current) => {
        glyphs.forEach((g, d) => {
          const off = ((((d - current) % 10) + 15) % 10) - 5;
          const a = Math.abs(off);
          g.style.transform = `translateY(${off}em)`;
          g.style.opacity = String(Math.max(0, 1 - a));
          g.style.filter = a < 0.02 || a >= 1 ? 'none' : `blur(${(a * TOKENS.blur.subtle).toFixed(2)}px)`;
        });
      });
      c.pos.jump(part.digit);
      return c;
    }
    el.className = 'ar-meter__symbol';
    el.textContent = part.text;
    return { key: part.key, el, text: part.text };
  };
  const exit = (c) => {
    c.leaving = true;
    c.pos?.stop();
    const gone = () => { c.el.remove(); if (cols.get(c.key) === c) cols.delete(c.key); };
    if (reduced()) { gone(); return; }
    const w = c.el.getBoundingClientRect().width;
    c.presence?.stop();
    c.presence = value(1, (p) => { c.el.style.width = `${p * w}px`; c.el.style.opacity = String(Math.min(1, Math.max(0, p))); });
    c.presence.jump(1);
    c.presence.to(0, { spring: FIT, rest: 0.01, done: gone });
  };
  return {
    set(n) {
      const first = last === null;
      const direction = first || n >= last ? 1 : -1;
      last = n;
      const parts = partsFor(n);
      const wanted = new Set(parts.map((p) => p.key));
      const ordered = [];
      const fresh = [];
      for (const part of parts) {
        let c = cols.get(part.key);
        if (c?.leaving) { c.presence?.stop(); c.el.remove(); c = undefined; }
        if (!c || ('digit' in part) !== ('digit' in c)) {
          c?.el.remove();
          c = make(part);
          cols.set(part.key, c);
          fresh.push(c);
        } else if ('digit' in part) wheel(c, part.digit, direction);
        else if (c.text !== part.text) { c.text = part.text; c.el.textContent = part.text; }
        ordered.push(c.el);
      }
      const gone = [...cols.values()].filter((c) => !wanted.has(c.key));
      settle(host, ordered, gone.map((c) => c.el));
      for (const c of fresh) open(c, first);
      for (const c of gone) if (!c.leaving) exit(c);
    },
    destroy() { for (const c of cols.values()) { c.pos?.stop(); c.presence?.stop(); } cols.clear(); host.replaceChildren(); },
  };
};

export const mount = define('usage-meter', (el, opts) => {
  let data = opts.segments;
  if (data === undefined && el.dataset.segments) { try { data = JSON.parse(el.dataset.segments); } catch { throw new RangeError('usage-meter: data-segments is not valid JSON'); } }
  const titleText = opts.label ?? el.dataset.label;
  if (!titleText) throw new RangeError('usage-meter: a label names what is measured');
  // The unit is a word, or `{ one, other, ... }` keyed by the plural category of the amount it follows («1 factura», «12 facturas»).
  const unitOpt = opts.unit ?? el.dataset.unit ?? '';
  if (typeof unitOpt !== 'string' && !(unitOpt && typeof unitOpt === 'object' && typeof unitOpt.other === 'string')) throw new RangeError('usage-meter: unit is a text, or an object with the plural forms and an "other"');
  const unit = typeof unitOpt === 'string' ? unitOpt : unitOpt.other;
  const decimals = opts.decimals ?? (el.dataset.decimals === undefined ? 1 : Number(el.dataset.decimals));
  const warnAt = opts.warnAt ?? 0.9;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) throw new RangeError('usage-meter: decimals is an integer from 0 to 6');
  if (!(warnAt > 0 && warnAt <= 1)) throw new RangeError('usage-meter: warnAt is a share of the limit, above 0 and at most 1');
  const words = {
    free: 'Free', over: 'Over limit', almostFull: 'Almost full',
    freeBadge: (t) => `${t} free`, overBadge: (t) => `${t} over`,
    used: (u, limit) => `${u ? `${u} ` : ''}of ${limit} used`,
    srUsed: (total, limit) => `${total} of ${limit} used`,
    inCategory: (u, label, share) => `${u ? `${u} ` : ''}in ${label} · ${share}% of plan`,
    freeCaption: (u) => `${u ? `${u} ` : ''}free`, overCaption: (u) => `${u ? `${u} ` : ''}over the limit`,
    summary: (label, total, limit, parts, status, over, free) => `${label}: ${total} of ${limit} used. ${parts}. ${status === 'over' ? `Over the limit by ${over}.` : `${free} free${status === 'near' ? ', almost full' : ''}.`}`,
    announce: (status, over, free) => (status === 'over' ? `Over the plan limit by ${over}.` : status === 'near' ? `Almost full. ${free} free.` : `Under the limit. ${free} free.`),
    byCategory: (label) => `${label} by category`,
    ...opts.labels,
  };
  const loc = locale(el);
  const nf = new Intl.NumberFormat(loc, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const plurals = new Intl.PluralRules(loc);
  const unitFor = (n) => (typeof unitOpt === 'string' ? unitOpt : unitOpt[plurals.select(n)] ?? unitOpt.other);
  const validate = (segments, limit) => {
    if (!Array.isArray(segments) || !segments.length) throw new RangeError('usage-meter: segments is a list of {id, label, value}');
    const ids = new Set();
    for (const s of segments) {
      if (typeof s.id !== 'string' || !s.id || s.id === 'free' || ids.has(s.id)) throw new RangeError('usage-meter: every segment has its own id, and "free" is taken');
      ids.add(s.id);
      if (typeof s.label !== 'string' || !Number.isFinite(s.value) || s.value < 0) throw new RangeError(`usage-meter: segment "${s.id}" needs a label and a value of zero or more`);
    }
    if (!Number.isFinite(limit) || !(limit > 0)) throw new RangeError('usage-meter: limit is a number above zero');
  };
  let segments = data.map((s) => ({ ...s }));
  let limit = opts.limit ?? Number(el.dataset.limit);
  validate(segments, limit);

  const previous = el.innerHTML;
  const life = scope();
  const titleId = uid('arum');
  const hatchId = `${titleId}-hatch`;
  el.classList.add('ar-meter');
  el.setAttribute('role', 'group');
  el.setAttribute('aria-labelledby', titleId);

  const top = node('div', 'ar-meter__top');
  const title = node('span', 'ar-meter__title');
  title.id = titleId;
  title.textContent = titleText;
  const badge = node('span', 'ar-meter__badge');
  const badgeInner = node('span', 'ar-meter__badge-inner');
  const badgeIcon = node('span', 'ar-meter__badge-icon');
  const badgeText = node('span', 'ar-swap');
  badgeInner.append(badgeIcon, badgeText);
  badge.append(badgeInner);
  top.append(title, badge);
  const total = node('p', 'ar-meter__total');
  const totalSr = node('span', 'ar-sr');
  const amount = node('span', 'ar-meter__amount', { decorative: true });
  const ticker0 = node('span', 'ar-meter__ticker');
  amount.append(ticker0);
  const caption = node('span', 'ar-meter__caption ar-swap', { decorative: true });
  total.append(totalSr, amount, caption);
  const bar = node('div', 'ar-meter__bar');
  const track = node('div', 'ar-meter__track');
  track.setAttribute('role', 'img');
  const overflow = svgNode('svg', { class: 'ar-meter__overflow', 'aria-hidden': 'true', focusable: 'false' });
  overflow.innerHTML = `<defs><pattern id="${hatchId}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.5" height="6" class="ar-meter__hatch"/></pattern></defs><rect class="ar-meter__over-tint" width="100%" height="100%"/><rect width="100%" height="100%" fill="url(#${hatchId})"/>`;
  track.append(overflow);
  const marker = node('span', 'ar-meter__limit', { decorative: true });
  bar.append(track, marker);
  const legend = node('div', 'ar-meter__legend');
  legend.setAttribute('role', 'group');
  const announce = node('p', 'ar-sr');
  announce.setAttribute('aria-live', 'polite');
  announce.setAttribute('aria-atomic', 'true');
  el.replaceChildren(top, total, bar, legend, announce);

  const headline = makeTicker(ticker0, { loc, decimals });
  const badgeSwap = swapper(badgeText, { className: '' });
  const badgeMark = popper(badgeIcon);
  const captionSwap = swapper(caption);

  // ── Values: one per segment id, the limit and the width of the track ──
  const amounts = new Map();
  const segEls = new Map();
  const shownLimit = value(limit, () => render());
  let width = 0;
  const markerOpacity = value(0, (o) => { marker.style.opacity = String(o); overflow.style.opacity = String(o); });
  const used = () => [...segments].reduce((s, g) => s + (amounts.get(g.id)?.get() ?? 0), 0);
  let overNow = false;
  const render = () => {
    const w = width;
    const u = used();
    const lim = shownLimit.get();
    const span = Math.max(lim, u, 1e-6);
    let start = 0;
    for (const s of segments) {
      const amt = amounts.get(s.id).get();
      const x = (start / span) * w;
      const size = (amt / span) * w;
      const rest = w - x - size;
      const sx = w ? Math.max(0, size - Math.min(GAP, size, Math.max(0, rest))) / w : 0;
      const n = segEls.get(s.id);
      n.style.transform = `translateX(${x}px) scaleX(${sx})`;
      start += amt;
    }
    const limitX = Math.round((lim / span) * w);
    marker.style.transform = `translateX(${limitX}px)`;
    overflow.style.clipPath = `inset(0 0 0 ${limitX + GAP}px)`;
    const nextOver = u > lim;
    if (nextOver !== overNow) {
      overNow = nextOver;
      if (reduced()) markerOpacity.jump(nextOver ? 1 : 0); else markerOpacity.to(nextOver ? 1 : 0, { duration: TOKENS.duration.fast, ease: 'standard' });
    }
  };

  // ── State ──
  let ready = false;
  let revealed = false;
  let lagTimer = 0;
  let hovered = null;
  let focused = null;
  let pinned = null;
  let roving = 0;
  let notice = null;
  const items = new Map();

  const round = (v) => Math.round(v * 10 ** decimals) / 10 ** decimals;
  const fmt = (v) => `${nf.format(v)}${unitFor(v) ? ` ${unitFor(v)}` : ''}`;
  const limitText = () => fmt(limit).replace(/[.,]0+(?= |$)/, '');
  const calc = () => {
    const t = round(segments.reduce((s, g) => s + g.value, 0));
    const free = round(Math.max(0, limit - t));
    const over = round(Math.max(0, t - limit));
    const status = t > limit ? 'over' : t >= limit * warnAt ? 'near' : 'ok';
    return { total: t, free, over, status };
  };

  const itemList = () => {
    const { status, over, free } = calc();
    return [...segments.map((s) => ({ id: s.id, label: s.label, value: s.value })), { id: 'free', label: status === 'over' ? words.over : words.free, value: status === 'over' ? over : free }];
  };
  const active = () => hovered ?? focused ?? pinned;

  const buildItem = (item, index) => {
    const b = node('button', 'ar-meter__item');
    b.type = 'button';
    const head = node('span', 'ar-meter__item-head');
    const key = node('span', 'ar-meter__key', { decorative: true });
    const labelHost = node('span', 'ar-meter__item-label ar-swap');
    head.append(key, labelHost);
    const val = node('span', 'ar-meter__item-value');
    const tick = node('span', 'ar-meter__ticker', { decorative: true });
    val.append(tick);
    const unitEl = unit ? node('span', 'ar-meter__item-unit') : null;
    if (unitEl) val.append(unitEl);
    b.append(head, val);
    const it = { id: item.id, el: b, unit: unitEl, key, labelSwap: swapper(labelHost), mark: popper(key), ticker: makeTicker(tick, { loc, decimals }), index };
    b.addEventListener('click', () => { roving = [...legend.children].indexOf(b); pinned = pinned === it.id ? null : it.id; paint(); }, { signal: life.signal });
    b.addEventListener('focus', () => { roving = [...legend.children].indexOf(b); focused = it.id; paint(); }, { signal: life.signal });
    b.addEventListener('blur', () => { focused = null; paint(); }, { signal: life.signal });
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hovered = it.id; paint(); } }, { signal: life.signal });
    b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { hovered = null; paint(); } }, { signal: life.signal });
    return it;
  };

  const paint = (first = false) => {
    const { total: t, free, over, status } = calc();
    el.dataset.status = status;
    const list = itemList();
    const act = active();
    const activeItem = list.find((i) => i.id === act) ?? null;

    // legend
    const wanted = new Set(list.map((i) => i.id));
    list.forEach((item, index) => {
      let it = items.get(item.id);
      if (!it) { it = buildItem(item, index); items.set(item.id, it); }
      it.index = index;
      const warn = item.id === 'free' && status === 'over';
      it.labelSwap.set(item.label, 1, { instant: first });
      it.mark.set(warn ? 'alert' : 'swatch', () => {
        if (warn) { const k = node('span', 'ar-meter__key-icon'); k.append(glyph(WARN, 12)); return k; }
        const s = node('span', 'ar-meter__swatch');
        s.dataset.index = item.id === 'free' ? 'free' : String(index);
        return s;
      }, { instant: first });
      if (ready || first) it.ticker.set(ready ? item.value : 0);
      if (it.unit) it.unit.textContent = unitFor(item.value);
      it.el.setAttribute('aria-label', `${item.label}, ${fmt(item.value)}`);
      it.el.setAttribute('aria-pressed', String(pinned === item.id));
      it.el.tabIndex = index === roving ? 0 : -1;
      if (act) it.el.dataset.highlight = act === item.id ? 'on' : 'off'; else delete it.el.dataset.highlight;
    });
    for (const [id, it] of [...items]) if (!wanted.has(id)) { it.ticker.destroy(); it.el.remove(); items.delete(id); }
    settle(legend, list.map((i) => items.get(i.id).el));
    legend.setAttribute('aria-label', words.byCategory(titleText));

    // segments
    segments.forEach((s, index) => {
      const n = segEls.get(s.id);
      n.dataset.index = String(index);
      if (act) n.dataset.highlight = act === s.id ? 'on' : 'off'; else delete n.dataset.highlight;
    });
    if (act) overflow.dataset.highlight = act === 'free' ? 'on' : 'off'; else delete overflow.dataset.highlight;
    if (act) track.dataset.active = act; else delete track.dataset.active;

    // headline, caption, badge, summaries
    headline.set(ready ? (activeItem ? activeItem.value : t) : 0);
    const share = activeItem ? Math.round((activeItem.value / limit) * 100) : 0;
    const shown = unitFor(activeItem ? activeItem.value : t);
    const text = !activeItem ? words.used(shown, limitText()) : activeItem.id === 'free' ? (status === 'over' ? words.overCaption(shown) : words.freeCaption(shown)) : words.inCategory(shown, activeItem.label, share);
    captionSwap.set(text, 1, { instant: first });
    const badgeLabel = status === 'over' ? words.overBadge(fmt(over)) : status === 'near' ? words.almostFull : words.freeBadge(fmt(free));
    badgeSwap.set(badgeLabel, 1, { instant: first });
    badge.dataset.status = status;
    badgeMark.set(status === 'ok' ? null : status, () => { const m = node('span', 'ar-meter__badge-mark'); m.append(glyph(status === 'over' ? WARN : ALERT)); return m; }, { instant: first });
    totalSr.textContent = words.srUsed(fmt(t), limitText());
    track.setAttribute('aria-label', words.summary(titleText, fmt(t), limitText(), segments.map((s) => `${s.label} ${fmt(s.value)}`).join(', '), status, fmt(over), fmt(free)));
    const nextNotice = status === 'over' ? `over:${over}` : status;
    if (notice !== null && notice !== nextNotice) announce.textContent = words.announce(status, fmt(over), fmt(free));
    notice = nextNotice;
  };

  const ensureSegments = () => {
    const wanted = new Set(segments.map((s) => s.id));
    for (const [id, n] of [...segEls]) if (!wanted.has(id)) { n.remove(); segEls.delete(id); amounts.get(id)?.stop(); amounts.delete(id); }
    for (const s of segments) {
      if (segEls.has(s.id)) continue;
      const n = node('span', 'ar-meter__segment');
      track.insertBefore(n, overflow);
      segEls.set(s.id, n);
      amounts.set(s.id, value(0, () => render()));
    }
    // The segment elements follow the order of the list.
    settle(track, [...segments.map((s) => segEls.get(s.id)), overflow]);
  };
  const flow = () => {
    segments.forEach((s, index) => {
      const a = amounts.get(s.id);
      if (a.get() === s.value && !a.running) return;
      if (!ready) return;
      if (reduced()) { a.jump(s.value); return; }
      a.to(s.value, { spring: !revealed ? { ...REVEAL } : SETTLE, delay: !revealed ? index * 0.07 : LAG / 1000, rest: 0.001 });
    });
    if (ready) revealed = true;
    if (shownLimit.get() !== limit) { if (reduced()) shownLimit.jump(limit); else shownLimit.to(limit, { spring: SETTLE, delay: LAG / 1000, rest: 0.001 }); }
  };

  // Pointer on the bar picks the category under it; past the limit the hatch stands for the overage.
  const idAt = (clientX) => {
    const r = track.getBoundingClientRect();
    if (!r.width) return null;
    const { total: t } = calc();
    const at = ((clientX - r.left) / r.width) * Math.max(limit, t);
    if (at > limit) return 'free';
    let end = 0;
    for (const s of segments) { end += s.value; if (at <= end) return s.id; }
    return 'free';
  };
  track.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { hovered = idAt(e.clientX); paint(); } }, { signal: life.signal });
  track.addEventListener('pointerleave', () => { hovered = null; paint(); }, { signal: life.signal });
  track.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') { const id = idAt(e.clientX); pinned = pinned === id ? null : id; paint(); } }, { signal: life.signal });
  legend.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (pinned || focused) { e.preventDefault(); pinned = null; paint(); } return; }
    const count = legend.children.length;
    const next = { ArrowRight: roving + 1, ArrowDown: roving + 1, ArrowLeft: roving - 1, ArrowUp: roving - 1, Home: 0, End: count - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const index = (next + count) % count;
    roving = index;
    legend.querySelectorAll('button')[index]?.focus();
  }, { signal: life.signal });

  const measureTrack = () => { width = track.clientWidth; render(); };
  const badgeW = value(0, (w) => { badge.style.width = `${w}px`; });
  let badgeSeen = false;
  life.watch(new ResizeObserver(measureTrack)).observe(track);
  life.watch(new ResizeObserver(() => {
    const next = badgeInner.offsetWidth;
    if (badgeSeen && !reduced()) badgeW.to(next, { spring: FIT, rest: 0.01 }); else badgeW.jump(next);
    badgeSeen = next > 0;
  })).observe(badgeInner);
  const start = () => { if (ready) return; ready = true; ensureSegments(); flow(); paint(); };
  const io = life.watch(new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { start(); io.disconnect(); } }, { threshold: 0.4 }));

  ensureSegments();
  width = track.clientWidth;
  paint(true);
  render();
  if (reduced()) start(); else io.observe(el);

  return {
    // Retarget the meter: segments keep their ids so a changed value springs from where it is.
    update(next = {}) {
      const nextSegments = next.segments ?? segments;
      const nextLimit = next.limit ?? limit;
      validate(nextSegments, nextLimit);
      segments = nextSegments.map((s) => ({ ...s }));
      limit = nextLimit;
      ensureSegments();
      if (ready) flow();
      // Arc's numbers, status and captions start on the frame after its render commits, ~40 ms behind the click; the bar waits the same.
      clearTimeout(lagTimer);
      if (ready && !reduced()) lagTimer = setTimeout(paint, LAG); else paint();
    },
    get status() { return calc().status; },
    get total() { return calc().total; },
    destroy() {
      clearTimeout(lagTimer);
      for (const a of amounts.values()) a.stop();
      shownLimit.stop(); markerOpacity.stop(); badgeW.stop();
      headline.destroy();
      for (const it of items.values()) it.ticker.destroy();
      life.destroy();
      el.innerHTML = previous;
      el.classList.remove('ar-meter');
      el.removeAttribute('role');
      el.removeAttribute('aria-labelledby');
      delete el.dataset.status;
    },
  };
});
