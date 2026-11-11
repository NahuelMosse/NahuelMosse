// Stepper, ported from Arc (registry/components/stepper/stepper.tsx, MIT). A steps indicator for setup and checkout flows,
// horizontal or vertical. Each marker is a disc that carries the state (a number, a check, an alert): the outgoing glyph
// shrinks away while the next one pops in on the `snappy` spring and draws its stroke; a ring grows out from behind the disc
// once progress arrives, after the connector has filled. A connector is a track with a fill that scales on the `smooth`
// spring; a jump across several steps fills or drains the connectors one after another (80 ms apart). A step with an error
// turns its marker into an alert and its message replaces the description; the text slots spring to the new height so a
// message that wraps eases the steps below down instead of pushing them. With `onStepSelect` the completed steps are
// buttons (arrows, Home and End move among the steps you can reach); without it the stepper is a read-only indicator.
// A horizontal stepper folds into markers with the current label underneath when it is narrower than 30 rem. Reduced
// motion: no delays, no springs, short fades. The current step is announced politely.
import { reduced, scope } from '../core.js';
import { EASE, SPRINGS, TOKENS, springCurve, svgNode, swapper, value } from './arc-shared.js';
import { define, node } from './mu-shared.js';

const SNAPPY = springCurve(SPRINGS.snappy);
const GAP = TOKENS.stagger.line;
const CHECK = 'M5.5 12.5l4.25 4.25L18.5 8';
const ms = (s) => s * 1000;

// Text that rises in with a small blur when it changes. Its slot springs to the new height.
const slotText = (parent, className) => {
  const slot = node('span', 'ar-stepper__slot');
  const inner = node('span', 'ar-stepper__slot-inner');
  slot.append(inner);
  parent.append(slot);
  const swap = swapper(inner, { className });
  const height = value(0, (h) => { slot.style.height = `${h}px`; });
  let armedUntil = 0;
  let measured = false;
  const ro = new ResizeObserver(() => {
    const next = inner.offsetHeight;
    if (!measured || reduced() || performance.now() > armedUntil) { measured = true; height.jump(next); return; }
    height.to(next, { spring: SPRINGS.smooth });
  });
  ro.observe(inner);
  return {
    slot,
    set(text, cls = className, first = false) {
      armedUntil = performance.now() + 700;
      swap.set(text, 1, { instant: first });
      if (swap.node) swap.node.className = cls;
    },
    destroy() { ro.disconnect(); height.stop(); swap.destroy(); },
  };
};

export const mount = define('stepper', (el, opts) => {
  let data = opts.steps;
  if (data === undefined && el.dataset.steps) { try { data = JSON.parse(el.dataset.steps); } catch { throw new RangeError('stepper: data-steps is not valid JSON'); } }
  const orientation = opts.orientation ?? el.dataset.orientation ?? 'horizontal';
  if (orientation !== 'horizontal' && orientation !== 'vertical') throw new RangeError(`stepper: unknown orientation "${orientation}"`);
  const details = opts.details ?? el.dataset.details ?? 'all';
  if (details !== 'all' && details !== 'current') throw new RangeError(`stepper: unknown details "${details}"`);
  const compact = opts.compact ?? el.dataset.compact === 'true';
  const onSelect = opts.onStepSelect;
  const interactive = typeof onSelect === 'function';
  const vertical = orientation === 'vertical';
  const words = {
    label: 'Progress', complete: 'All steps complete',
    status: { complete: 'Completed', current: '', upcoming: 'Not started', error: 'Error' },
    step: (n, total, label) => `Step ${n} of ${total}: ${label}`,
    ...opts.labels,
  };
  const check = (steps) => {
    if (!Array.isArray(steps) || !steps.length) throw new RangeError('stepper: steps is a list of {id, label}');
    const ids = new Set();
    for (const s of steps) {
      if (typeof s.id !== 'string' || !s.id || ids.has(s.id) || typeof s.label !== 'string') throw new RangeError('stepper: every step has its own id and a label');
      ids.add(s.id);
    }
  };
  check(data);
  let steps = data.map((s) => ({ ...s }));
  const clampTo = (n) => { if (!Number.isFinite(n)) throw new RangeError('stepper: current is a number'); return Math.min(Math.max(Math.round(n), 0), steps.length); };
  let active = clampTo(opts.current ?? Number(el.dataset.current ?? 0));
  let from = active;

  const previous = el.innerHTML;
  const previousRole = el.getAttribute('role');
  const life = scope();
  el.classList.add('ar-stepper', vertical ? 'ar-stepper--vertical' : 'ar-stepper--horizontal');
  if (compact) el.classList.add('ar-stepper--compact');
  el.setAttribute('aria-label', opts.label ?? el.dataset.label ?? words.label);
  el.setAttribute('role', interactive ? 'navigation' : 'group');
  const list = node('ol', 'ar-stepper__list');
  const caption = node('span', 'ar-stepper__caption', { decorative: true });
  const live = node('span', 'ar-sr');
  live.setAttribute('aria-live', 'polite');
  const captionLabel = slotText(caption, 'ar-stepper__caption-label');
  const captionDesc = slotText(caption, 'ar-stepper__description');
  el.replaceChildren(list, ...(vertical ? [] : [caption]), live);

  const rows = new Map();
  const delayAt = (index) => {
    if (reduced()) return 0;
    if (active > from) return index >= from && index < active ? (index - from) * GAP : 0;
    return index >= active && index < from ? (from - 1 - index) * GAP : 0;
  };
  const ringDelay = () => (reduced() ? 0 : Math.max(0, Math.abs(active - from) - 1) * GAP + 0.12);

  const glyphNode = (kind, number) => {
    if (kind === 'number') { const g = node('span', 'ar-stepper__glyph'); g.textContent = String(number); return g; }
    const s = svgNode('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'ar-stepper__glyph ar-stepper__icon', 'aria-hidden': 'true', focusable: 'false' });
    if (kind === 'check') s.append(svgNode('path', { d: CHECK, pathLength: 1 }));
    else { s.append(svgNode('path', { d: 'M12 6.75v6.5', pathLength: 1 }), svgNode('circle', { cx: 12, cy: 17.4, r: 1.4, fill: 'currentColor', stroke: 'none' })); }
    return s;
  };
  const rest = { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' };
  const away = { opacity: 0, transform: 'scale(.5)', filter: `blur(${TOKENS.blur.subtle}px)` };
  const setGlyph = (row, kind, number, delay, instant) => {
    if (row.kind === kind && row.number === number) return;
    const old = row.glyph;
    row.kind = kind;
    row.number = number;
    const g = glyphNode(kind, number);
    row.glyph = g;
    row.disc.append(g);
    if (old) {
      old.setAttribute('aria-hidden', 'true');
      const out = reduced() ? old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'forwards' }) : old.animate([rest, away], { duration: ms(TOKENS.duration.fast), easing: EASE.standard, fill: 'forwards' });
      out.onfinish = () => old.remove();
      out.oncancel = () => old.remove();
    }
    if (instant) return;
    if (reduced()) { g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140 }); return; }
    const d = ms(delay);
    g.animate({ transform: [away.transform, rest.transform] }, { duration: SNAPPY.duration, easing: SNAPPY.easing, delay: d, fill: 'backwards' });
    g.animate({ opacity: [0, 1], filter: [away.filter, rest.filter] }, { duration: ms(TOKENS.duration.fast), easing: 'linear', delay: d, fill: 'backwards' });
    for (const p of g.querySelectorAll('path')) p.animate({ strokeDashoffset: [1, 0] }, { duration: ms(TOKENS.duration.standard), easing: EASE.enter, delay: d + ms(0.04), fill: 'backwards' });
    for (const c of g.querySelectorAll('circle')) { c.style.transformBox = 'fill-box'; c.style.transformOrigin = 'center'; c.animate({ transform: ['scale(0)', 'scale(1)'] }, { duration: SNAPPY.duration, easing: SNAPPY.easing, delay: d + ms(0.16), fill: 'backwards' }); }
  };
  // The ring grows out from behind the disc once progress arrives.
  const setRing = (row, on, delay, instant) => {
    if (on && !row.ring) {
      const r = node('span', 'ar-stepper__ring');
      row.marker.prepend(r);
      row.ring = r;
      if (instant) return;
      if (reduced()) { r.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140 }); return; }
      const d = ms(delay);
      r.animate({ transform: ['scale(.6)', 'scale(1)'] }, { duration: SNAPPY.duration, easing: SNAPPY.easing, delay: d, fill: 'backwards' });
      r.animate({ opacity: [0, 1] }, { duration: ms(TOKENS.duration.fast), easing: 'linear', delay: d, fill: 'backwards' });
    } else if (!on && row.ring) {
      const r = row.ring;
      row.ring = null;
      const out = reduced() ? r.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'forwards' }) : r.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.6)' }], { duration: ms(TOKENS.duration.fast), easing: EASE.standard, fill: 'forwards' });
      out.onfinish = () => r.remove();
      out.oncancel = () => r.remove();
    }
  };

  const buildRow = (step) => {
    const li = node('li', 'ar-stepper__item');
    const row = { id: step.id, li, kind: null, number: null, glyph: null, ring: null };
    row.fill = value(0, (s) => { if (row.fillEl) row.fillEl.style.transform = vertical ? `scaleY(${s})` : `scaleX(${s})`; });
    return row;
  };
  const paint = (first) => {
    const count = steps.length;
    const wanted = new Set(steps.map((s) => s.id));
    for (const [id, row] of [...rows]) if (!wanted.has(id)) { row.fill.stop(); row.text?.destroy(); row.li.remove(); rows.delete(id); }
    const now = active >= count ? undefined : steps[active];
    if (!vertical) list.style.gridTemplateColumns = count > 1 ? `repeat(${count - 1}, minmax(0, 1fr)) auto` : 'auto';
    steps.forEach((step, index) => {
      let row = rows.get(step.id);
      const fresh = !row;
      if (!row) { row = buildRow(step); rows.set(step.id, row); }
      const isCurrent = index === active;
      const status = step.error ? 'error' : index < active ? 'complete' : isCurrent ? 'current' : 'upcoming';
      const clickable = interactive && index < active;
      const kind = step.error ? 'error' : index < active ? 'check' : 'number';
      const detail = step.error ?? (details === 'all' || isCurrent ? step.description : undefined);
      row.li.dataset.status = status;
      if (fresh) {
        row.head = node(interactive ? 'button' : 'span', 'ar-stepper__head');
        if (interactive) { row.head.type = 'button'; row.head.addEventListener('click', () => { const i = steps.findIndex((s) => s.id === row.id); if (interactive && i < active) onSelect(i); }, { signal: life.signal }); }
        row.marker = node('span', 'ar-stepper__marker', { decorative: true });
        row.disc = node('span', 'ar-stepper__disc');
        row.marker.append(row.disc);
        const text = node('span', 'ar-stepper__text');
        row.labelEl = node('span', 'ar-stepper__label');
        row.srStatus = node('span', 'ar-sr');
        text.append(row.labelEl, row.srStatus);
        row.text = slotText(text, 'ar-stepper__description');
        row.head.append(row.marker, text);
        row.li.append(row.head);
      }
      // The track stays put; only the fill scales along it. The last step has none.
      if (!row.fillEl && index < count - 1) {
        const connector = node('span', 'ar-stepper__connector', { decorative: true });
        row.fillEl = node('span', 'ar-stepper__fill');
        connector.append(row.fillEl);
        row.li.prepend(connector);
      } else if (row.fillEl && index === count - 1) {
        row.fillEl.parentElement.remove();
        row.fillEl = null;
      }
      row.labelEl.textContent = step.label;
      row.srStatus.textContent = words.status[status] ? `, ${words.status[status]}` : '';
      row.head.toggleAttribute('data-clickable', clickable);
      row.head.toggleAttribute('data-reachable', interactive && index <= active);
      if (isCurrent) row.head.setAttribute('aria-current', 'step'); else row.head.removeAttribute('aria-current');
      if (interactive) { if (clickable) { row.head.removeAttribute('aria-disabled'); row.head.removeAttribute('tabindex'); } else { row.head.setAttribute('aria-disabled', 'true'); row.head.tabIndex = -1; } }
      setRing(row, isCurrent, ringDelay(), first || fresh);
      setGlyph(row, kind, index + 1, delayAt(index), first || fresh);
      row.text.set(detail ?? null, step.error ? 'ar-stepper__error' : 'ar-stepper__description', first || fresh);
      const target = index < active ? 1 : 0;
      if (first || fresh || reduced()) row.fill.jump(target); else row.fill.to(target, { spring: SPRINGS.smooth, delay: delayAt(index), rest: 0.001 });
    });
    steps.forEach((s, i) => { const li = rows.get(s.id).li; if (list.children[i] !== li) list.insertBefore(li, list.children[i] ?? null); });
    captionLabel.set(now?.label ?? words.complete, 'ar-stepper__caption-label', first);
    captionDesc.set(now?.error ?? now?.description ?? null, now?.error ? 'ar-stepper__error' : 'ar-stepper__description', first);
    live.textContent = first ? '' : now ? words.step(active + 1, count, now.label) : words.complete;
  };

  // Arrow keys move between the steps you can reach; Home and End jump to the first and the current one.
  if (interactive) {
    list.addEventListener('keydown', (e) => {
      const rtl = !vertical && getComputedStyle(list).direction === 'rtl';
      const back = ['ArrowUp', rtl ? 'ArrowRight' : 'ArrowLeft'];
      const ahead = ['ArrowDown', rtl ? 'ArrowLeft' : 'ArrowRight'];
      if (![...back, ...ahead, 'Home', 'End'].includes(e.key)) return;
      const targets = [...list.querySelectorAll('button[data-reachable]')];
      const at = targets.indexOf(e.target);
      if (at < 0) return;
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? targets.length - 1 : back.includes(e.key) ? Math.max(0, at - 1) : Math.min(targets.length - 1, at + 1);
      targets[next]?.focus();
    }, { signal: life.signal });
  }

  paint(true);

  return {
    // Move the flow to `current`; `steps` may change too (a step can start to fail).
    update(next = {}) {
      if (next.steps !== undefined) { check(next.steps); steps = next.steps.map((s) => ({ ...s })); }
      const target = next.current === undefined ? active : clampTo(next.current);
      if (target !== active) { from = active; active = target; }
      paint(false);
    },
    setCurrent(n) { this.update({ current: n }); },
    get current() { return active; },
    destroy() {
      for (const row of rows.values()) { row.fill.stop(); row.text?.destroy(); }
      rows.clear();
      captionLabel.destroy();
      captionDesc.destroy();
      life.destroy();
      el.innerHTML = previous;
      el.classList.remove('ar-stepper', 'ar-stepper--vertical', 'ar-stepper--horizontal', 'ar-stepper--compact');
      if (previousRole === null) el.removeAttribute('role'); else el.setAttribute('role', previousRole);
      el.removeAttribute('aria-label');
    },
  };
});
