// Morph select, ported from Arc (registry/components/morph-select/morph-select.tsx, MIT). The trigger is the list: opening
// grows the trigger itself into the options surface (one shape whose width, height and corners spring: grow .4/.12,
// fold .34/0, width .42/.16 and .42/0 when it narrows, so a closing label never ellipsizes), a highlight glides between
// options on a .28/.08 spring, and the chosen label lifts out of the list and settles into the trigger on a .3/.06 spring
// while the trigger takes its width. Springs are restated as stiffness and damping so a retarget keeps its speed.
// Groups, type-ahead (600 ms buffer), search above eight options, Home/End/PageUp/PageDown, Alt+ArrowUp and the whole
// listbox keyboard model; a press outside or focus leaving folds it back. The label of the value rolls with the list:
// a later option rises from below, an earlier one drops from above. Reduced motion: fades of 100-200 ms.
import { fold, hueOf, messages, reduced, scope, uid } from '../core.js';
import { EASE, TOKENS, fadeIn, glide, physical, px, springCurve, svgNode, value } from './arc-shared.js';
import { define, node } from './mu-shared.js';

const GROW = physical(0.4, 0.12);
const SHRINK = physical(0.34, 0);
const GLIDE = physical(0.28, 0.08);
const WIDTH = physical(0.42, 0.16);
const NARROW = physical(0.42, 0);
const FLY = physical(0.3, 0.06);
const OPEN_RADIUS = 22;
const TYPEAHEAD_RESET = 600;
const PAGE = 8;

const ICON = {
  chevron: '<path d="M4 6.25l4 4 4-4"/>',
  search: '<circle cx="7" cy="7" r="4.25"/><path d="M10.25 10.25L13.5 13.5"/>',
  x: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
  check: '<path d="M3.5 8.5l3 3 6-6.5"/>',
};
const svg = (name) => { const s = svgNode('svg', { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' }); s.innerHTML = ICON[name]; return s; };
const isGroup = (item) => item && Array.isArray(item.options);

// Loose options between groups gather into unlabelled sections, so the list keeps the order it was given.
const normalize = (items) => {
  const out = [];
  items.forEach((item, index) => {
    if (isGroup(item)) { out.push({ key: `group-${index}`, label: item.label, options: item.options }); return; }
    const last = out.at(-1);
    if (last && !last.label) last.options.push(item);
    else out.push({ key: `loose-${index}`, options: [item] });
  });
  return out;
};
const needleOf = (option) => fold(`${option.label} ${option.meta ?? ''} ${option.keywords ?? ''}`);

export const mount = define('morph-select', (el, opts) => {
  let raw = opts.items;
  if (raw === undefined && el.dataset.items) { try { raw = JSON.parse(el.dataset.items); } catch { throw new RangeError('morph-select: data-items is not valid JSON'); } }
  if (!Array.isArray(raw)) throw new RangeError('morph-select: items is a list of options and groups');
  const label = opts.label ?? el.dataset.label;
  if (!label) throw new RangeError('morph-select: a label is the accessible name of the select');
  const sections0 = normalize(raw.map((i) => (isGroup(i) ? { ...i, options: [...i.options] } : { ...i })));
  const all = sections0.flatMap((s) => s.options);
  for (const o of all) if (typeof o.value !== 'string' || typeof o.label !== 'string') throw new RangeError('morph-select: every option has a string value and label');
  if (new Set(all.map((o) => o.value)).size !== all.length) throw new RangeError('morph-select: option values are unique');
  const indexOf = new Map(all.map((o, i) => [o.value, i]));
  const placeholder = opts.placeholder ?? el.dataset.placeholder ?? messages.placeholder;
  const searchable = opts.searchable ?? (el.dataset.searchable === undefined ? 'auto' : el.dataset.searchable === 'true');
  const canSearch = searchable === 'auto' ? all.length > 8 : Boolean(searchable);
  const panelWidth = opts.panelWidth ?? 272;
  const maxList = opts.maxListHeight ?? 296;
  const align = opts.align ?? el.dataset.align ?? 'start';
  if (align !== 'start' && align !== 'end') throw new RangeError(`morph-select: unknown align "${align}"`);
  const name = opts.name ?? el.dataset.name;
  const disabled = opts.disabled ?? el.hasAttribute('data-disabled');
  const words = { search: 'Search', clearSearch: 'Clear search', close: messages.close, options: (n) => `${n} ${n === 1 ? 'option' : 'options'}`, none: messages.noMatches, noMatchesFor: (q) => `${messages.noMatches}: “${q}”`, ...opts.labels };
  const initial = opts.value ?? el.dataset.value ?? null;
  if (initial !== null && !indexOf.has(initial)) throw new RangeError(`morph-select: unknown value "${initial}"`);

  const previous = el.innerHTML;
  const life = scope();
  const id = uid('arsel');
  const labelId = `${id}-label`;
  const listId = `${id}-list`;
  const optionId = (i) => `${id}-option-${i}`;
  el.classList.add('ar-select');
  el.dataset.align = align;
  el.style.setProperty('--ar-select-panel-w', `${panelWidth}px`);
  el.style.setProperty('--ar-select-list-max', `${maxList}px`);
  if (disabled) el.dataset.disabled = '';

  // ── The parts ──
  const labelEl = node('span', opts.hideLabel ? 'ar-sr' : 'ar-select__label');
  labelEl.id = labelId;
  labelEl.textContent = label;
  const anchor = node('div', 'ar-select__anchor');
  const measure = node('span', 'ar-select__trigger ar-select__measure', { decorative: true });
  const shape = node('div', 'ar-select__shape');
  const lid = node('div', 'ar-select__lid');
  const trigger = node('button', 'ar-select__trigger');
  trigger.type = 'button';
  Object.assign(trigger, { disabled });
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-labelledby', labelId);
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', listId);
  const slot = node('span', 'ar-select__slot');
  trigger.append(slot);
  const chevron = node('span', 'ar-select__chevron', { decorative: true });
  chevron.append(svg('chevron'));
  lid.append(trigger);
  let searchRow;
  let input;
  let clear;
  if (canSearch) {
    searchRow = node('div', 'ar-select__search');
    searchRow.inert = true;
    searchRow.style.opacity = '0';
    const lens = svg('search');
    lens.classList.add('ar-select__search-icon');
    input = node('input', 'ar-select__input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-label', `${words.search} ${label.toLowerCase()}`);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('aria-autocomplete', 'list');
    clear = node('button', 'ar-select__clear');
    clear.type = 'button';
    clear.setAttribute('aria-label', words.clearSearch);
    clear.append(svg('x'));
    clear.hidden = true;
    const closeHit = node('button', 'ar-select__close-hit');
    closeHit.type = 'button';
    closeHit.setAttribute('aria-label', `${words.close} ${label.toLowerCase()}`);
    searchRow.append(lens, input, clear, closeHit);
    lid.append(searchRow);
    closeHit.addEventListener('click', () => close(true), { signal: life.signal });
  }
  lid.append(chevron);
  const face = node('div', 'ar-select__list-face');
  face.inert = true;
  face.setAttribute('aria-hidden', 'true');
  face.style.opacity = '0';
  const scroller = node('div', 'ar-select__scroll');
  const listEl = node('div', 'ar-select__options');
  listEl.id = listId;
  listEl.setAttribute('role', 'listbox');
  listEl.setAttribute('aria-labelledby', labelId);
  const highlight = node('span', 'ar-select__highlight', { decorative: true });
  scroller.append(listEl);
  face.append(scroller);
  shape.append(lid, face);
  anchor.append(measure, shape);
  const status = node('span', 'ar-sr');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const hidden = name ? Object.assign(node('input'), { type: 'hidden', name }) : null;
  el.replaceChildren(labelEl, anchor, ...(hidden ? [hidden] : []), status);

  // ── State ──
  let selected = initial;
  let open = false;
  let query = '';
  let active = null;
  let visible = sections0;
  let layer = null;
  let measured = false;
  let scrollIntent = false;
  let pendingFocus = null;
  let suppressClick = false;
  let buffer = '';
  let bufferAt = 0;
  const optionEls = new Map();
  const optionOf = (v) => all.find((o) => o.value === v);

  const iconNode = (option) => {
    if (!option.icon) return null;
    const holder = node('span', 'ar-select__icon', { decorative: true });
    if (typeof option.icon === 'string') { holder.textContent = option.icon; holder.dataset.mark = ''; holder.style.setProperty('--h', hueOf(option.label)); } else holder.append(option.icon.cloneNode(true));
    return holder;
  };
  const valueParts = (option) => {
    if (!option) { const p = node('span', 'ar-select__placeholder'); p.textContent = placeholder; return [p]; }
    const t = node('span', 'ar-select__value-text');
    t.textContent = option.label;
    return [iconNode(option), t].filter(Boolean);
  };

  // ── The shape: one surface whose width, height and corners spring between the trigger and the open list ──
  const sizes = { trigger: 0, lid: 0, listW: 0, listH: 0 };
  const anchorW = value(0, (w) => { anchor.style.width = `${w}px`; });
  const shapeW = value(0, (w) => { shape.style.width = `${w}px`; });
  const shapeH = value(0, (h) => { shape.style.height = `${h}px`; });
  const radius = value(OPEN_RADIUS, (r) => { shape.style.borderRadius = `${r}px`; });
  const triggerWidth = () => {
    const exact = measure.getBoundingClientRect().width;
    const rounded = measure.offsetWidth;
    // Half a pixel short is enough to ellipsize the label, so the closed width is rounded up.
    return Math.abs(exact - rounded) <= 0.5 ? Math.ceil(exact - 0.01) : rounded + 1;
  };
  const place = (animated) => {
    const { trigger: t, lid: l, listW, listH } = sizes;
    if (!t || !l) return;
    const next = open ? { w: Math.max(t, listW), h: l + listH, r: OPEN_RADIUS } : { w: t, h: l, r: l / 2 };
    if (!animated || reduced() || !measured) {
      anchorW.jump(t); shapeW.jump(next.w); shapeH.jump(next.h); radius.jump(next.r);
      measured = true;
      return;
    }
    const lastW = shapeW.get();
    const lastH = shapeH.get();
    const spring = next.w * next.h >= lastW * lastH ? GROW : SHRINK;
    anchorW.to(t, { spring: t < anchorW.get() ? NARROW : WIDTH });
    shapeW.to(next.w, { spring: open ? spring : next.w < lastW ? NARROW : WIDTH });
    shapeH.to(next.h, { spring });
    radius.to(next.r, { spring });
  };
  const read = () => {
    const before = { ...sizes };
    el.style.setProperty('--ar-select-trigger-w', `${triggerWidth()}px`);
    Object.assign(sizes, { trigger: triggerWidth(), lid: measure.offsetHeight, listW: face.offsetWidth, listH: face.offsetHeight });
    const changed = sizes.trigger !== before.trigger || sizes.lid !== before.lid || (open && (sizes.listW !== before.listW || sizes.listH !== before.listH));
    if (changed) place(measured);
  };

  // ── The highlight glides between options on its own spring ──
  const hy = value(0, (y) => { highlight.style.transform = `translateY(${y}px)`; });
  const hh = value(0, (h) => { highlight.style.height = `${h}px`; });
  const ho = value(0, (o) => { highlight.style.opacity = String(o); });
  const enabled = () => visible.flatMap((s) => s.options).filter((o) => !o.disabled);
  const current = () => { const list = enabled(); return active !== null && list.some((o) => o.value === active) ? active : list[0]?.value ?? null; };
  const paintActive = () => {
    const cur = current();
    for (const [v, n] of optionEls) n.toggleAttribute('data-active', v === cur);
    const target = open && cur !== null ? optionEls.get(cur) : undefined;
    const activeId = open && cur !== null ? optionId(indexOf.get(cur) ?? 0) : null;
    for (const t of [trigger, input]) { if (!t) continue; if (activeId && (t === input) === canSearch) t.setAttribute('aria-activedescendant', activeId); else t.removeAttribute('aria-activedescendant'); }
    if (!target) { ho.to(0, { duration: reduced() || !open ? 0.001 : 0.12, ease: 'standard' }); return; }
    const top = target.offsetTop;
    const height = target.offsetHeight;
    if (ho.get() < 0.05 || reduced()) { hy.jump(top); hh.jump(height); } else { hy.to(top, { spring: GLIDE }); hh.to(height, { spring: GLIDE }); }
    ho.to(1, { duration: reduced() ? 0.001 : 0.12, ease: 'enter' });
    if (scrollIntent) {
      scrollIntent = false;
      const pad = 6;
      if (top < scroller.scrollTop + pad) scroller.scrollTop = top - pad;
      else if (top + height > scroller.scrollTop + scroller.clientHeight - pad) scroller.scrollTop = top + height - scroller.clientHeight + pad;
    }
  };

  const paintSelected = () => {
    for (const [v, n] of optionEls) {
      n.setAttribute('aria-selected', String(v === selected));
      n.querySelector('.ar-select__check').toggleAttribute('data-on', v === selected);
    }
  };
  const renderList = () => {
    optionEls.clear();
    const parts = [highlight];
    for (const s of visible) {
      const rows = s.options.map((o) => {
        const i = indexOf.get(o.value);
        const row = node('div', 'ar-select__option');
        row.id = optionId(i);
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(o.value === selected));
        if (o.disabled) row.setAttribute('aria-disabled', 'true');
        row.dataset.value = o.value;
        const val = node('span', 'ar-select__option-value');
        val.dataset.part = 'value';
        val.append(...valueParts(o));
        row.append(val);
        if (o.meta) { const m = node('span', 'ar-select__meta'); m.textContent = o.meta; row.append(m); }
        const tick = node('span', 'ar-select__check', { decorative: true });
        tick.append(svg('check'));
        if (o.value === selected) tick.dataset.on = '';
        row.append(tick);
        optionEls.set(o.value, row);
        return row;
      });
      if (s.label) {
        const group = node('div', 'ar-select__group');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-labelledby', `${id}-${s.key}`);
        const gl = node('div', 'ar-select__group-label');
        gl.id = `${id}-${s.key}`;
        gl.setAttribute('role', 'presentation');
        gl.textContent = s.label;
        group.append(gl, ...rows);
        parts.push(group);
      } else {
        const group = node('div', 'ar-select__group');
        group.setAttribute('role', 'presentation');
        group.append(...rows);
        parts.push(group);
      }
    }
    if (!visible.some((s) => s.options.length)) { const empty = node('p', 'ar-select__empty'); empty.textContent = words.noMatchesFor(query.trim()); parts.push(empty); }
    listEl.replaceChildren(...parts);
    ho.jump(0);
  };

  // ── The label in the trigger ──
  const showValue = (option, change) => {
    const next = node('span', 'ar-select__layer');
    next.append(...valueParts(option));
    const old = layer;
    layer = next;
    slot.append(next);
    if (!change) return;
    const { dir, fly } = change;
    if (old) {
      const out = reduced()
        ? old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'forwards' })
        : old.animate([{ opacity: 1, transform: 'none', filter: 'blur(0px)' }, { opacity: 0, transform: `translateY(${fly ? '-0.3em' : `${dir * -0.45}em`})`, filter: `blur(${TOKENS.blur.subtle}px)` }], { duration: 120, easing: EASE.standard, fill: 'forwards' });
      out.onfinish = () => old.remove();
      out.oncancel = () => old.remove();
    }
    if (reduced()) { fadeIn(next, 120); return; }
    // The new label starts over the option it came from (or below/above its place) and settles on springs.
    const start = fly ?? { x: 0, y: px(dir * 0.5, next) };
    let fx = start.x;
    let fy = start.y;
    const paint = () => { next.style.transform = `translate(${fx}px, ${fy}px)`; };
    let left = 2;
    const finished = () => { if (--left === 0) next.style.transform = ''; };
    const xs = value(fx, (v) => { fx = v; paint(); });
    const ys = value(fy, (v) => { fy = v; paint(); });
    paint();
    const spring = fly ? FLY : GLIDE;
    xs.to(0, { spring, done: finished });
    ys.to(0, { spring, done: finished });
    if (!fly) {
      next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE.enter });
      next.animate([{ filter: `blur(${TOKENS.blur.soft}px)` }, { filter: 'blur(0px)' }], { duration: 220, easing: EASE.enter });
    }
  };

  // ── Opening and closing ──
  const faceTo = (isOpen) => {
    if (reduced()) { glide(face, { opacity: isOpen ? '1' : '0' }, { duration: 140, easing: 'ease-out' }); return; }
    if (isOpen) {
      const sp = springCurve(GROW);
      glide(face, { transform: 'translateY(0px)' }, { duration: sp.duration, easing: sp.easing });
      glide(face, { opacity: '1' }, { duration: 200, easing: EASE.enter, delay: 40 });
      glide(face, { filter: 'blur(0px)' }, { duration: 220, easing: EASE.enter, delay: 40 });
    } else {
      glide(face, { opacity: '0', transform: 'translateY(-6px)', filter: `blur(${TOKENS.blur.subtle}px)` }, { duration: 100, easing: EASE.standard });
    }
  };
  const setOpen = (next) => {
    if (open === next) return;
    open = next;
    el.toggleAttribute('data-open', open);
    trigger.setAttribute('aria-expanded', String(open));
    input?.setAttribute('aria-expanded', String(open));
    face.inert = !open;
    if (open) face.removeAttribute('aria-hidden'); else face.setAttribute('aria-hidden', 'true');
    faceTo(open);
    // A pick changes the label and closes in the same turn, so both faces are read fresh before the shape moves.
    el.style.setProperty('--ar-select-trigger-w', `${triggerWidth()}px`);
    Object.assign(sizes, { trigger: triggerWidth(), lid: measure.offsetHeight, listW: face.offsetWidth, listH: face.offsetHeight });
    place(true);
    if (searchRow) {
      const showing = open;
      searchRow.inert = !showing;
      trigger.inert = showing;
      trigger.tabIndex = showing ? -1 : 0;
      slot.toggleAttribute('data-hidden', showing);
      if (reduced()) glide(searchRow, { opacity: showing ? '1' : '0' }, { duration: 120 });
      else if (showing) glide(searchRow, { opacity: '1', filter: 'blur(0px)' }, { duration: 180, easing: EASE.enter, delay: 40 });
      else glide(searchRow, { opacity: '0', filter: `blur(${TOKENS.blur.subtle}px)` }, { duration: 100, easing: EASE.standard });
    }
    paintActive();
    const target = pendingFocus;
    pendingFocus = null;
    if (target === 'input') input?.focus({ preventScroll: true });
    if (target === 'trigger') trigger.focus({ preventScroll: true });
  };
  const openList = (focus, seed = '') => {
    if (disabled || open) return;
    query = seed;
    if (input) input.value = seed;
    if (clear) clear.hidden = !seed;
    visible = seed ? filtered(seed) : sections0;
    renderList();
    active = focus !== undefined ? focus : selected;
    scrollIntent = true;
    pendingFocus = canSearch ? 'input' : 'trigger';
    status.textContent = '';
    setOpen(true);
  };
  const close = (restoreFocus) => {
    buffer = '';
    if (restoreFocus) pendingFocus = 'trigger';
    setOpen(false);
  };
  const filtered = (text) => {
    const n = fold(text.trim());
    return n ? sections0.map((s) => ({ ...s, options: s.options.filter((o) => needleOf(o).includes(n)) })).filter((s) => s.options.length) : sections0;
  };

  const commit = (option, source) => {
    if (!option || option.disabled) return;
    if (option.value !== selected) {
      let fly = null;
      const part = source?.querySelector('[data-part="value"]');
      if (!reduced() && part) {
        const from = part.getBoundingClientRect();
        const to = slot.getBoundingClientRect();
        fly = { x: from.left - to.left, y: from.top + from.height / 2 - (to.top + to.height / 2) };
      }
      const a = selected === null ? -1 : indexOf.get(selected) ?? -1;
      const b = indexOf.get(option.value) ?? 0;
      selected = option.value;
      if (hidden) hidden.value = selected;
      measure.replaceChildren(...valueParts(option));
      paintSelected();
      showValue(option, { dir: a < 0 ? 1 : Math.sign(b - a) || 1, fly });
      opts.onChange?.(option.value, option);
      el.dispatchEvent(new CustomEvent('morph-select:change', { bubbles: true, detail: { value: option.value, option } }));
    }
    close(true);
  };

  const typeTo = (char) => {
    const now = performance.now();
    buffer = now - bufferAt > TYPEAHEAD_RESET ? char : buffer + char;
    bufferAt = now;
    const b = buffer.toLowerCase();
    const repeated = [...b].every((l) => l === b[0]);
    const search = repeated ? b[0] : b;
    const pool = all.filter((o) => !o.disabled);
    const from = open ? current() : selected;
    const at = pool.findIndex((o) => o.value === from);
    const offset = repeated || b.length === 1 ? 1 : 0;
    const ordered = [...pool.slice(at + offset), ...pool.slice(0, at + offset)];
    return ordered.find((o) => fold(o.label).startsWith(fold(search)));
  };
  const move = (to) => { if (to === undefined || to === null) return; scrollIntent = true; active = to; paintActive(); };

  const onKey = (event, fromInput) => {
    const { key } = event;
    if (key === ' ' && !fromInput) suppressClick = true;
    const printable = key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
    const typing = performance.now() - bufferAt < TYPEAHEAD_RESET && buffer.length > 0;
    if (!open) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || (key === ' ' && !typing)) { event.preventDefault(); openList(); return; }
      if (key === 'Home' || key === 'End') { event.preventDefault(); const pool = all.filter((o) => !o.disabled); openList((key === 'Home' ? pool[0] : pool.at(-1))?.value ?? null); return; }
      if (printable) { event.preventDefault(); if (canSearch) openList(undefined, key); else openList(typeTo(key)?.value ?? selected); }
      return;
    }
    const list = enabled();
    const cur = current();
    const at = list.findIndex((o) => o.value === cur);
    const caretKeys = fromInput && query.length > 0;
    switch (key) {
      case 'ArrowDown': event.preventDefault(); move(list[Math.min(list.length - 1, at + 1)]?.value); return;
      case 'ArrowUp':
        event.preventDefault();
        if (event.altKey) { commit(list[at], optionEls.get(cur ?? '')); return; }
        move(list[Math.max(0, at - 1)]?.value); return;
      case 'PageDown': event.preventDefault(); move(list[Math.min(list.length - 1, at + PAGE)]?.value); return;
      case 'PageUp': event.preventDefault(); move(list[Math.max(0, at - PAGE)]?.value); return;
      case 'Home': if (caretKeys) return; event.preventDefault(); move(list[0]?.value); return;
      case 'End': if (caretKeys) return; event.preventDefault(); move(list.at(-1)?.value); return;
      case 'Enter': event.preventDefault(); commit(list[at], optionEls.get(cur ?? '')); return;
      case 'Escape': event.preventDefault(); event.stopPropagation(); close(true); return;
      case 'Tab': close(false); return;
      default:
    }
    if (fromInput) return;
    if (key === ' ' && !typing) { event.preventDefault(); commit(list[at], optionEls.get(cur ?? '')); return; }
    if (printable) { event.preventDefault(); move(typeTo(key)?.value); }
  };

  const onQuery = (next) => {
    query = next;
    visible = filtered(next);
    active = null;
    scrollIntent = true;
    scroller.scrollTop = 0;
    if (clear) clear.hidden = !next;
    renderList();
    paintActive();
    const text = next.trim();
    const count = text ? all.filter((o) => needleOf(o).includes(fold(text))).length : all.length;
    status.textContent = text ? (count ? words.options(count) : words.none) : '';
    read();
  };

  // ── Wiring ──
  trigger.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    if (open) close(true); else openList();
  }, { signal: life.signal });
  trigger.addEventListener('keydown', (e) => onKey(e, false), { signal: life.signal });
  trigger.addEventListener('keyup', (e) => { if (e.key === ' ') setTimeout(() => { suppressClick = false; }); }, { signal: life.signal });
  if (input) {
    input.addEventListener('keydown', (e) => onKey(e, true), { signal: life.signal });
    input.addEventListener('input', () => onQuery(input.value), { signal: life.signal });
    clear.addEventListener('pointerdown', (e) => e.preventDefault(), { signal: life.signal });
    clear.addEventListener('click', () => { input.value = ''; onQuery(''); input.focus(); }, { signal: life.signal });
  }
  listEl.addEventListener('pointermove', (e) => {
    const row = e.target.closest('.ar-select__option');
    if (!row || e.pointerType !== 'mouse' || row.getAttribute('aria-disabled') === 'true' || row.dataset.value === current()) return;
    active = row.dataset.value;
    paintActive();
  }, { signal: life.signal });
  listEl.addEventListener('pointerdown', (e) => e.preventDefault(), { signal: life.signal });
  listEl.addEventListener('click', (e) => { const row = e.target.closest('.ar-select__option'); if (row) commit(optionOf(row.dataset.value), row); }, { signal: life.signal });
  document.addEventListener('pointerdown', (e) => { if (open && !el.contains(e.target)) close(false); }, { signal: life.signal });
  el.addEventListener('focusout', (e) => { if (open && e.relatedTarget && !el.contains(e.relatedTarget)) close(false); }, { signal: life.signal });

  // ── First paint ──
  renderList();
  showValue(optionOf(selected), null);
  measure.replaceChildren(...valueParts(optionOf(selected)));
  if (hidden) hidden.value = selected ?? '';
  read();
  el.dataset.ready = '';
  life.watch(new ResizeObserver(read)).observe(measure);
  life.watch(new ResizeObserver(read)).observe(face);

  return {
    get value() { return selected; },
    get open() { return open; },
    select(v) {
      const option = optionOf(v);
      if (!option) throw new RangeError(`morph-select: unknown value "${v}"`);
      if (open) { commit(option, optionEls.get(v)); return; }
      const a = selected === null ? -1 : indexOf.get(selected) ?? -1;
      selected = v;
      if (hidden) hidden.value = v;
      measure.replaceChildren(...valueParts(option));
      showValue(option, { dir: Math.sign((indexOf.get(v) ?? 0) - a) || 1, fly: null });
      paintSelected();
      read();
    },
    destroy() {
      for (const v of [anchorW, shapeW, shapeH, radius, hy, hh, ho]) v.stop();
      life.destroy();
      el.innerHTML = previous;
      el.classList.remove('ar-select');
      for (const k of ['align', 'disabled', 'ready', 'open']) delete el.dataset[k];
      el.style.removeProperty('--ar-select-panel-w');
      el.style.removeProperty('--ar-select-list-max');
      el.style.removeProperty('--ar-select-trigger-w');
    },
  };
});
