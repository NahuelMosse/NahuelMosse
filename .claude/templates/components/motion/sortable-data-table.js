// Sortable data table (Arc, `registry/components/sortable-data-table`, MIT): a table whose sorting and selection
// are choreographed.
//
//  · Sorting reorders the rows on a spring (`smooth`, FLIP of each `<tr>`); the cells are opaque so rows passing
//    each other cover one another instead of blending, and a still tint under the sorted column fills the gaps.
//  · The sort arrow appears where a column becomes sorted (opacity, scale `snappy`, a 2 px blur clearing) and
//    flips on a `snappy` spring when the direction changes; the other headers show a faint arrow on hover/focus.
//  · Column widths are measured once and held (`table-layout: fixed`), so sorting never reflows them.
//  · The header checkbox is one box for "all" and "some": the tick and the dash share three points and the path
//    morphs between them (`morph`); the fill pops in on `snappy`.
//  · The footer counts rows or the selection: the number and the noun swap in place (rising from the side the
//    value moves toward, 4 px blur clearing) while their box takes the new width on a `morph` spring; "Quitar
//    selección" comes and goes with a blur.
//  · Keyboard: arrows walk the header controls and the row checkboxes, Shift extends a selection, Escape clears it.
//
// Port notes. Words are Spanish (`labels`); on a phone (≤ 620 px) the header becomes a strip of sort controls
// and each row folds into two lines, as in the original. `render(value, row)` returns trusted HTML.
//
// mount(root, { columns: [{ key, label, sortable, numeric, width, render }], rows, rowKey, caption, emptyMessage,
//   defaultSort: { key, direction }, selectable, defaultSelectedKeys, itemName: { one, other }, labels,
//   onSortChange(sort), onSelectionChange(keys) })
//   → { destroy, setRows(rows), sort, setSort(sort), selection, setSelection(keys), clearSelection() }
import { reduced, flip } from '../core.js';
import { ARC, SPRINGS, Val, bezier, blur, curve, el, esc, ms, svgIcon, ICONS } from './arc-kit.js';

const LABELS = {
  caption: 'Tabla de datos', empty: 'Sin filas para mostrar', selectAll: 'Seleccionar todas las filas', clear: 'Quitar selección', selected: 'seleccionadas',
  sortBy: (label, dir) => `Ordenar por ${label}${dir ? `, orden actual ${dir === 'asc' ? 'ascendente' : 'descendente'}` : ''}`,
  sorted: (label, dir) => `Ordenado por ${label}, ${dir === 'asc' ? 'ascendente' : 'descendente'}`,
  select: (name) => `Seleccionar ${name}`, count: (n, total) => `${n} de ${total} seleccionadas`, cleared: 'Selección quitada',
};
const handles = new WeakMap();
const collator = new Intl.Collator('es-AR', { numeric: true, sensitivity: 'base' });
const isEmpty = (v) => v == null || v === '';
const comparable = (v) => (v instanceof Date ? v.getTime() : v);
// Check and dash share three points, so the header box morphs between all and some.
const CHECK = [[4.25, 9.25], [7.25, 12.25], [13.75, 5.75]];
const DASH = [[4.75, 9], [9, 9], [13.25, 9]];
const pathOf = (mix) => CHECK.map(([x, y], i) => `${i ? 'L' : 'M'}${(x + (DASH[i][0] - x) * mix).toFixed(2)} ${(y + (DASH[i][1] - y) * mix).toFixed(2)}`).join(' ');

// Text that changes in place: the slot takes the new width on a `morph` spring so the words beside it never jump.
function swap(className) {
  const host = el('span', `sdt-swap ${className ?? ''}`);
  const inner = el('span', 'sdt-swap-inner');
  host.append(inner);
  const width = new Val(0, (v) => { host.style.width = `${v}px`; });
  let settled = false;
  let value = null;
  const measure = () => {
    const next = inner.getBoundingClientRect().width;
    if (settled && !reduced()) width.to(next, SPRINGS.morph, { restDelta: 0.25 }); else width.jump(next);
    settled = true;
  };
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
  return {
    host,
    start() { observer?.observe(inner); measure(); },
    set(text, direction) {
      if (text === value) return;
      const old = inner.querySelector('.sdt-swap-text:not([data-leaving])');
      const node = el('span', 'sdt-swap-text', {}, esc(text));
      inner.append(node);
      if (old) {
        old.dataset.leaving = '';
        old.style.cssText = 'position:absolute;top:0;left:0';
        const gone = () => old.remove();
        if (reduced()) old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms(ARC.duration.instant), fill: 'forwards' }).finished.then(gone, gone);
        else old.animate([{ opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' }, { opacity: 0, transform: `translateY(${-0.3 * direction}em)`, filter: blur(ARC.blur.subtle) }], { duration: ms(ARC.duration.fast), easing: bezier('standard'), fill: 'forwards' }).finished.then(gone, gone);
      }
      if (value !== null) {
        node.animate(reduced()
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ opacity: 0, transform: `translateY(${0.3 * direction}em)`, filter: blur(ARC.blur.soft) }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' }], { duration: reduced() ? ms(ARC.duration.instant) : ms(ARC.duration.standard), easing: bezier('enter'), fill: 'backwards' });
      }
      value = text;
    },
    destroy() { observer?.disconnect(); width.stop(); },
  };
}

// One checkbox for a row, or for all of them: native input, a drawn box on top.
function selectBox(label, nav, onToggle) {
  const hit = el('label', 'sdt-hit');
  const input = el('input', 'sdt-input', { type: 'checkbox', 'aria-label': label, 'data-nav': nav });
  const box = el('span', 'sdt-box', { 'aria-hidden': 'true' });
  box.innerHTML = `<span class="sdt-fill"></span><svg class="sdt-mark" viewBox="0 0 18 18" fill="none" focusable="false"><path pathLength="1" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  hit.append(input, box);
  const path = box.querySelector('path');
  const mix = new Val(0, (v) => path.setAttribute('d', pathOf(v)));
  const draw = new Val(0, (v) => path.setAttribute('stroke-dasharray', `${Math.max(0, v).toFixed(3)} 1`));
  mix.jump(0);
  draw.jump(0);
  let was = { on: false, mixed: false };
  // The state is the table's, not the input's: a click asks, `set` answers. The click carries the Shift key.
  input.addEventListener('click', (event) => onToggle(event.shiftKey));
  return {
    hit, input,
    set({ checked, mixed = false }, instant = false) {
      const on = checked || mixed;
      input.checked = checked;
      input.indeterminate = mixed;
      box.toggleAttribute('data-on', on);
      path.style.opacity = on ? '1' : '0';
      path.style.transition = `opacity ${on ? ARC.duration.instant : ARC.duration.fast}s cubic-bezier(${ARC.ease.standard.join(',')})`;
      if (instant || reduced() || (on === was.on && mixed === was.mixed)) { mix.jump(mixed ? 1 : 0); draw.jump(on ? 1 : 0); } else {
        mix.to(mixed ? 1 : 0, SPRINGS.morph, { restDelta: 0.002, restSpeed: 0.01 });
        draw.to(on ? 1 : 0, SPRINGS.snappy, { restDelta: 0.002, restSpeed: 0.01 });
      }
      was = { on, mixed };
    },
    destroy() { mix.stop(); draw.stop(); },
  };
}

export function mount(root, options = {}) {
  if (handles.has(root)) return handles.get(root);
  const o = { rows: [], selectable: false, itemName: { one: 'fila', other: 'filas' }, ...options };
  const L = { ...LABELS, ...o.labels };
  const columns = o.columns;
  const life = new AbortController();
  let rows = [...o.rows];
  let sort = o.defaultSort ? { ...o.defaultSort } : null;
  let selection = new Set(o.defaultSelectedKeys ?? []);
  let anchor = null;
  let widths = null;
  let lastCount = null;
  const getKey = (row) => String(typeof o.rowKey === 'function' ? o.rowKey(row) : row[o.rowKey]);
  const numeric = new Set(columns.filter((c) => c.numeric ?? (rows.some((r) => typeof r[c.key] === 'number') && rows.every((r) => typeof r[c.key] === 'number' || isEmpty(r[c.key])))).map((c) => c.key));

  const sorted = () => {
    if (!sort) return rows;
    return rows.map((row, index) => ({ row, index })).sort((a, b) => {
      const left = comparable(a.row[sort.key]);
      const right = comparable(b.row[sort.key]);
      // Empty values stay at the bottom in both directions.
      if (isEmpty(left) || isEmpty(right)) return isEmpty(left) === isEmpty(right) ? a.index - b.index : isEmpty(left) ? 1 : -1;
      const result = typeof left === 'number' && typeof right === 'number' ? left - right : collator.compare(String(left), String(right));
      return (sort.direction === 'asc' ? result : -result) || a.index - b.index;
    }).map((entry) => entry.row);
  };

  const spring = curve(SPRINGS.smooth);
  const snappy = curve(SPRINGS.snappy);
  root.classList.add('sdt');
  root.style.setProperty('--sdt-snappy', snappy.easing);
  root.style.setProperty('--sdt-snappy-t', `${snappy.duration}ms`);
  root.innerHTML = `<div class="sdt-scroller"><span class="sdt-band" aria-hidden="true" hidden></span><table class="sdt-table" role="table"${o.selectable ? ' data-selectable' : ''}><caption>${esc(o.caption ?? L.caption)}</caption><colgroup></colgroup><thead role="rowgroup"><tr role="row"></tr></thead><tbody role="rowgroup"></tbody></table></div>${o.selectable ? '<div class="sdt-footer"></div>' : ''}<p class="arc-sr" role="status"></p>`;
  const scroller = root.querySelector('.sdt-scroller');
  const band = root.querySelector('.sdt-band');
  const table = root.querySelector('table');
  const colgroup = root.querySelector('colgroup');
  const headRow = root.querySelector('thead tr');
  const tbody = root.querySelector('tbody');
  const footer = root.querySelector('.sdt-footer');
  const live = root.querySelector('[role="status"]');
  const say = (text) => { live.textContent = ''; live.textContent = text; };

  // ── Header ──
  let selectAll = null;
  if (o.selectable) {
    colgroup.append(el('col', 'sdt-select-col'));
    const th = el('th', 'sdt-select-cell', { scope: 'col', role: 'columnheader' });
    selectAll = selectBox(L.selectAll, 'head', () => commit(allSelected() ? new Set() : new Set(keys())));
    th.append(selectAll.hit);
    headRow.append(th);
  }
  const cols = columns.map((c) => {
    const col = el('col');
    if (c.width !== undefined) col.style.width = typeof c.width === 'number' ? `${c.width}px` : c.width;
    colgroup.append(col);
    return col;
  });
  const heads = new Map();
  columns.forEach((c, index) => {
    const sortable = c.sortable !== false;
    const th = el('th', '', { scope: 'col', role: 'columnheader', 'data-key': c.key, 'data-primary': index === 0, 'data-numeric': numeric.has(c.key), 'data-sortable': sortable });
    if (sortable) {
      th.innerHTML = `<button class="sdt-sort" type="button" data-nav="head"><span class="sdt-sort-inner"><span>${esc(c.label)}</span><span class="sdt-sort-icon" aria-hidden="true">${svgIcon(ICONS.arrowUp, 16, 'sdt-sort-hint')}<span class="sdt-sort-arrow">${svgIcon(ICONS.arrowUp, 16)}</span></span></span></button>`;
      th.querySelector('button').addEventListener('click', () => sortBy(c));
    } else th.textContent = c.label;
    heads.set(c.key, th);
    headRow.append(th);
  });
  let arrowKey = null;
  const hiddenAt = new Map();
  const headState = () => {
    for (const c of columns) {
      const th = heads.get(c.key);
      const active = sort?.key === c.key;
      th.toggleAttribute('data-sorted', active);
      if (c.sortable !== false) {
        th.setAttribute('aria-sort', active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
        th.querySelector('button').setAttribute('aria-label', L.sortBy(c.label, active ? sort.direction : null));
      }
    }
    // The arrow turns only while it is visible; a freshly shown arrow starts pointing the right way.
    const key = sort?.key ?? null;
    const arrow = key ? heads.get(key)?.querySelector('.sdt-sort-arrow') : null;
    if (arrow) {
      const to = sort.direction === 'desc' ? 180 : 0;
      const visible = arrowKey === key || performance.now() - (hiddenAt.get(key) ?? -Infinity) < 160;
      const now = getComputedStyle(arrow).rotate;
      const from = now === 'none' ? 0 : parseFloat(now);
      if (visible && !reduced() && from !== to) arrow.animate([{ rotate: `${from}deg` }, { rotate: `${to}deg` }], { duration: snappy.duration, easing: snappy.easing });
      arrow.style.rotate = `${to}deg`;
    }
    if (arrowKey !== key && arrowKey) hiddenAt.set(arrowKey, performance.now());
    arrowKey = key;
  };

  // ── Rows ──
  const rowNodes = new Map();
  const boxes = new Map();
  const keys = () => sorted().map(getKey);
  const allSelected = () => { const k = keys(); return k.length > 0 && k.every((x) => selection.has(x)); };
  const selectedCount = () => keys().filter((k) => selection.has(k)).length;
  const cell = (c, row, ci) => {
    const td = el('td', '', { role: 'cell', 'data-label': c.label, 'data-primary': ci === 0, 'data-numeric': numeric.has(c.key) });
    td.innerHTML = c.render ? c.render(row[c.key], row) : esc(String(row[c.key] ?? '–'));
    return td;
  };
  const buildRow = (row) => {
    const key = getKey(row);
    const tr = el('tr', '', { role: 'row', 'data-key': key });
    if (o.selectable) {
      const td = el('td', 'sdt-select-cell', { role: 'cell' });
      const box = selectBox(L.select(String(row[columns[0].key] ?? key)), 'row', (extend) => toggleRow(key, extend));
      td.append(box.hit);
      tr.append(td);
      boxes.set(key, box);
    }
    columns.forEach((c, ci) => tr.append(cell(c, row, ci)));
    tr.addEventListener('click', (event) => onRowClick(event, key));
    tr.addEventListener('mousedown', (event) => { if (o.selectable && event.shiftKey) event.preventDefault(); });
    return tr;
  };
  const emptyRow = () => {
    const tr = el('tr', 'sdt-empty-row', { role: 'row' });
    const td = el('td', 'sdt-empty', { role: 'cell', colspan: String(columns.length + (o.selectable ? 1 : 0)) }, esc(o.emptyMessage ?? L.empty));
    tr.append(td);
    return tr;
  };
  const rowState = () => {
    for (const [key, tr] of rowNodes) {
      const selected = o.selectable && selection.has(key);
      tr.toggleAttribute('data-selected', selected);
      boxes.get(key)?.set({ checked: selected });
    }
    for (const c of columns) {
      for (const tr of rowNodes.values()) tr.children[(o.selectable ? 1 : 0) + columns.indexOf(c)]?.toggleAttribute('data-sorted', sort?.key === c.key);
    }
    if (selectAll) selectAll.set({ checked: allSelected(), mixed: selectedCount() > 0 && !allSelected() });
  };
  const place = (order) => {
    tbody.querySelector('.sdt-empty-row')?.remove();
    if (!order.length) { tbody.append(emptyRow()); return; }
    order.forEach((row, i) => { const tr = rowNodes.get(getKey(row)); if (tbody.children[i] !== tr) tbody.insertBefore(tr, tbody.children[i] ?? null); });
  };
  const sync = () => {
    const order = sorted();
    const present = new Set(order.map(getKey));
    for (const [key, tr] of rowNodes) if (!present.has(key)) { tr.remove(); rowNodes.delete(key); boxes.get(key)?.destroy(); boxes.delete(key); selection.delete(key); }
    for (const row of order) {
      const key = getKey(row);
      const known = rowNodes.get(key);
      if (!known) rowNodes.set(key, buildRow(row));
      else if (known._row !== row) { const fresh = buildRow(row); fresh._row = row; known.replaceWith(fresh); rowNodes.set(key, fresh); }
      rowNodes.get(key)._row = row;
    }
    return order;
  };

  // Measure the natural column widths once, then hold them with a fixed layout so nothing reflows while rows move.
  const lockWidths = () => {
    if (widths) return true;
    const total = table.getBoundingClientRect().width;
    if (!total || getComputedStyle(table).display !== 'table') return false;
    widths = {};
    headRow.querySelectorAll('th[data-key]').forEach((th) => { widths[th.dataset.key] = (th.getBoundingClientRect().width / total) * 100; });
    columns.forEach((c, i) => { if (c.width === undefined && i > 0) cols[i].style.width = `${widths[c.key]}%`; });
    table.setAttribute('data-fixed', '');
    return true;
  };

  // A still tint under the sorted column fills the gaps that open while rows pass each other.
  let seenSort = false;
  const bandUpdate = () => {
    const th = sort ? heads.get(sort.key) : null;
    band.hidden = !th;
    if (!th) return;
    band.style.left = `${th.offsetLeft}px`;
    band.style.width = `${th.offsetWidth}px`;
  };
  const stripScroll = () => {
    const th = sort ? heads.get(sort.key) : null;
    const strip = th?.parentElement;
    if (th && strip && strip.scrollWidth > strip.clientWidth && getComputedStyle(table).display !== 'table') {
      const bounds = strip.getBoundingClientRect();
      const target = th.getBoundingClientRect();
      const inset = 8;
      const start = Math.max(bounds.left, strip.querySelector('th:not([data-key])')?.getBoundingClientRect().right ?? bounds.left) + inset;
      const shift = target.right > bounds.right - inset ? target.right - bounds.right + inset : target.left < start ? target.left - start : 0;
      if (shift) strip.scrollTo({ left: strip.scrollLeft + shift, behavior: reduced() || !seenSort ? 'auto' : 'smooth' });
    }
    seenSort = true;
  };

  // ── Footer ──
  let number = null;
  let noun = null;
  let clearButton = null;
  let countBox = null;
  let srCount = null;
  if (footer) {
    srCount = el('span', 'arc-sr');
    countBox = el('span', 'sdt-count', { 'aria-hidden': 'true' });
    number = swap('sdt-number');
    noun = swap();
    countBox.append(number.host, noun.host);
    footer.append(srCount, countBox);
  }
  const footerState = (initial) => {
    if (!footer) return;
    const picked = selectedCount();
    const total = keys().length;
    const shown = picked || total;
    const name = picked ? (typeof L.selected === 'function' ? L.selected(picked) : L.selected) : total === 1 ? o.itemName.one : o.itemName.other;
    const direction = lastCount === null || shown > lastCount ? 1 : -1;
    srCount.textContent = `${shown} ${name}`;
    countBox.toggleAttribute('data-active', picked > 0);
    number.set(String(shown), direction);
    noun.set(name, picked ? 1 : -1);
    if (initial) { number.start(); noun.start(); }
    lastCount = shown;
    if (picked && !clearButton) {
      clearButton = el('button', 'sdt-clear', { type: 'button', 'data-clear': '' }, esc(L.clear));
      clearButton.addEventListener('click', clearSelection);
      footer.append(clearButton);
      clearButton.animate(reduced() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, scale: 0.96, filter: blur(ARC.blur.soft) }, { opacity: 1, scale: 1, filter: 'blur(0px)' }], { duration: reduced() ? ms(ARC.duration.instant) : ms(ARC.duration.standard), easing: bezier('enter') });
    } else if (!picked && clearButton) {
      const gone = clearButton;
      clearButton = null;
      gone.setAttribute('inert', '');
      const done = () => gone.remove();
      gone.animate(reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, scale: 1, filter: 'blur(0px)' }, { opacity: 0, scale: 0.98, filter: blur(ARC.blur.subtle) }], { duration: reduced() ? ms(ARC.duration.instant) : ms(ARC.duration.fast), easing: bezier('standard'), fill: 'forwards' }).finished.then(done, done);
    }
  };

  // ── Selection and sorting ──
  function commit(next) {
    const list = keys().filter((k) => next.has(k));
    selection = new Set(list);
    rowState();
    footerState();
    o.onSelectionChange?.(list);
    say(list.length ? L.count(list.length, keys().length) : L.cleared);
  }
  function toggleRow(key, extend) {
    const next = new Set(selection);
    const checked = !selection.has(key);
    const k = keys();
    const from = extend && anchor ? k.indexOf(anchor) : -1;
    const to = k.indexOf(key);
    (from < 0 ? [key] : k.slice(Math.min(from, to), Math.max(from, to) + 1)).forEach((item) => (checked ? next.add(item) : next.delete(item)));
    anchor = key;
    commit(next);
  }
  function clearSelection() {
    commit(new Set());
    selectAll?.input.focus();
  }
  function onRowClick(event, key) {
    if (!o.selectable || event.target.closest("a, button, input, label, select, textarea, [role='button'], [contenteditable='true']") || getSelection()?.toString()) return;
    toggleRow(key, event.shiftKey);
    // Keep the keyboard path where the pointer left off, so arrows continue from this row.
    rowNodes.get(key)?.querySelector("input[type='checkbox']")?.focus({ preventScroll: true });
  }
  function setSort(next, announce = true) {
    sort = next;
    const order = sorted();
    const items = [...rowNodes.values()];
    if (items.length && !reduced()) flip(items, () => place(order), spring.duration, spring.easing); else place(order);
    headState();
    rowState();
    bandUpdate();
    stripScroll();
    if (announce) { const c = columns.find((x) => x.key === next.key); say(L.sorted(c.label, next.direction)); }
  }
  function sortBy(c) {
    const next = { key: c.key, direction: sort?.key === c.key && sort.direction === 'asc' ? 'desc' : 'asc' };
    setSort(next);
    o.onSortChange?.(next);
  }

  // Arrows walk the header controls and the row checkboxes; Escape clears the selection.
  root.addEventListener('keydown', (event) => {
    const target = event.target;
    if (event.key === 'Escape' && selectedCount()) {
      event.preventDefault();
      event.stopPropagation();
      if (target.dataset?.clear !== undefined) clearSelection(); else commit(new Set());
      return;
    }
    const nav = target.dataset?.nav;
    if (!nav) return;
    const list = (name) => [...root.querySelectorAll(`[data-nav="${name}"]`)];
    const items = list(nav);
    const index = items.indexOf(target);
    const steps = nav === 'head'
      ? { ArrowRight: [items, index + 1], ArrowLeft: [items, index - 1], Home: [items, 0], End: [items, items.length - 1], ...(target === selectAll?.input ? { ArrowDown: [list('row'), 0] } : {}) }
      : { ArrowDown: [items, index + 1], ArrowUp: index === 0 && selectAll ? [[selectAll.input], 0] : [items, index - 1], Home: [items, 0], End: [items, items.length - 1] };
    const step = steps[event.key];
    const next = step?.[0][step[1]];
    if (!next) return;
    event.preventDefault();
    next.focus();
  }, { signal: life.signal });

  // ── First paint: what is there is there, with no entrance. ──
  const order = sync();
  for (const row of order) tbody.append(rowNodes.get(getKey(row)));
  if (!order.length) tbody.append(emptyRow());
  headState();
  rowState();
  footerState(true);
  for (const [key, box] of boxes) box.set({ checked: selection.has(key) }, true);
  if (selectAll) selectAll.set({ checked: allSelected(), mixed: selectedCount() > 0 && !allSelected() }, true);
  const settle = () => { lockWidths(); bandUpdate(); };
  const resizer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (!widths) lockWidths(); bandUpdate(); }) : null;
  resizer?.observe(table);
  requestAnimationFrame(settle);
  document.fonts?.ready.then(() => { if (!widths) lockWidths(); bandUpdate(); });

  const handle = {
    get sort() { return sort && { ...sort }; },
    get selection() { return keys().filter((k) => selection.has(k)); },
    setSort(next) { setSort(next); },
    setRows(next) {
      rows = [...next];
      const before = [...rowNodes.values()];
      const ordered = sync();
      if (before.length && !reduced()) flip([...rowNodes.values()], () => place(ordered), spring.duration, spring.easing); else place(ordered);
      rowState();
      footerState();
    },
    setSelection(list) { commit(new Set(list)); },
    clearSelection() { commit(new Set()); },
    destroy() {
      handles.delete(root);
      life.abort();
      resizer?.disconnect();
      for (const b of boxes.values()) b.destroy();
      selectAll?.destroy();
      number?.destroy(); noun?.destroy();
      root.replaceChildren();
      root.classList.remove('sdt');
      root.style.removeProperty('--sdt-snappy');
      root.style.removeProperty('--sdt-snappy-t');
    },
  };
  handles.set(root, handle);
  return handle;
}
