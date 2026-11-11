// Filter toolbar (Arc, `registry/components/filter-toolbar`, MIT): the chips of the filters in force, and an
// "Agregar filtro" button that grows into its own two-step menu (field, then value).
//
//  · Each chip sits in a slot whose width springs open or shut (`smooth`), so the chips beside it, the toolbar
//    and its actions follow in the normal flow; the chip keeps its natural width while the slot clips. A chip
//    comes in with a 4 px blur clearing and a `snappy` scale from .9; it leaves in 120 ms, blur 2 px.
//  · A value that changes inside a chip rises in from the side it moves toward while the box takes the new width
//    on a `morph` spring.
//  · The frame springs to the height of the chip list (`smooth`) for a moment after the filters change; a chip
//    that wraps to another line would teleport, so each jump is offset in the same frame and springs back to zero.
//  · The menu is its trigger: one rounded surface springs (`morph`) from the button to the panel and back
//    (`snappy`); the label and the content read how far the shape has grown, so they reveal with the edge. The
//    two steps slide in the direction of the move; a single highlight glides under the pointer (`snappy`) and
//    jumps with the keyboard; type-ahead, Home/End and Arrow keys work as in a menu.
//
// Port notes. Widths and the height of the frame are animated as in the original, because everything around
// them follows. Words are Spanish and come from `labels`. The menu panel renders in place, so keep its
// ancestors free of overflow clipping (it shifts and flips inside the one that clips, as in the original).
//
// mount(root, { filters: [{ id, label, value }], addFilter: { fields: [{ id, label, icon, options: [string |
//   { value, label, hint, icon }] }], label, align: 'start' | 'end' }, label, actions (HTML), labels,
//   onChange(filters), onAdd(filter, field), onRemove(id), onClearAll() })
//   → { destroy, filters, set(filters), add(filter), remove(id), clear() }. Emits `filter-toolbar:change` ({ filters }).
import { reduced, uid } from '../core.js';
import { ARC, SPRINGS, Val, bezier, blur, curve, el, esc, ms, svgIcon, ICONS } from './arc-kit.js';

const LABELS = {
  group: 'Filtros aplicados', add: 'Agregar filtro', clear: 'Quitar todos', none: 'Sin filtros aplicados', back: 'Volver a los campos',
  remove: (f) => `Quitar ${f.label}${f.value ? `: ${f.value}` : ''}`,
  added: (t) => `Se agregó ${t}`, changed: (l, v) => `${l} cambió a ${v ?? 'cualquiera'}`, removed: (t) => `Se quitó ${t}`, cleared: 'Se quitaron todos los filtros',
};
const handles = new WeakMap();
const clamp = (v) => Math.min(1, Math.max(0, v));
const textOf = (f) => (f.value ? `${f.label}: ${f.value}` : f.label);
const toOption = (entry) => (typeof entry === 'string' ? { value: entry } : entry);
const optionText = (entry) => entry.label ?? entry.value;

// Text that appears with a rise and a blur; `leaves` runs the way out (lifting, 2 px blur, 120 ms).
const textIn = (node, delay = 0) => {
  if (reduced()) { node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, delay, easing: bezier('standard'), fill: 'backwards' }); return; }
  node.animate([{ opacity: 0, transform: 'translateY(0.3em)', filter: blur(ARC.blur.soft) }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: ms(ARC.duration.standard), delay, easing: bezier('enter'), fill: 'backwards' });
};
const textOut = (node) => {
  const gone = () => node.remove();
  if (reduced()) { gone(); return; }
  node.animate([{ opacity: 1, transform: 'none', filter: 'blur(0px)' }, { opacity: 0, transform: 'translateY(-0.3em)', filter: blur(ARC.blur.subtle) }], { duration: ms(ARC.duration.instant), easing: bezier('standard'), fill: 'forwards' }).finished.then(gone, gone);
};

// A roving list with one highlight that glides under the pointer and jumps with the keyboard.
function menuList(rows, { labelledBy, onChoose, onBack, onLeave, radio }) {
  const list = el('div', 'ft-list', { role: 'menu', 'aria-labelledby': labelledBy, 'data-current': '' });
  const hl = el('span', 'ft-highlight', { 'aria-hidden': 'true' });
  list.append(hl);
  let pointer = false;
  let typed = { text: '', at: 0 };
  let current = Math.max(0, rows.findIndex((r) => r.checked));
  let shown = null;
  const y = new Val(0, (v) => { hl.style.transform = `translateY(${v}px)`; });
  const h = new Val(0, (v) => { hl.style.height = `${v}px`; });
  rows.forEach((row, i) => {
    const b = el('button', 'ft-item', { type: 'button', role: radio ? 'menuitemradio' : 'menuitem', 'aria-checked': radio ? String(!!row.checked) : undefined, tabindex: i === current ? '0' : '-1', 'data-row': row.key, 'data-text': row.label });
    b.innerHTML = `${row.icon ? `<span class="ft-item-icon" aria-hidden="true">${row.icon}</span>` : ''}<span class="ft-item-label">${esc(row.label)}</span>${row.meta ? `<span class="ft-item-meta">${row.meta}</span>` : ''}`;
    list.append(b);
  });
  const items = () => [...list.querySelectorAll('[data-row]')];
  const move = (item) => {
    if (!item) return;
    item.focus({ preventScroll: true });
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  };
  list.addEventListener('keydown', (event) => {
    const all = items();
    const index = all.indexOf(document.activeElement);
    const go = (next) => { event.preventDefault(); pointer = false; move(all[next]); };
    if (event.key === 'ArrowDown') return go(index < 0 ? 0 : (index + 1) % all.length);
    if (event.key === 'ArrowUp') return go(index < 0 ? all.length - 1 : (index - 1 + all.length) % all.length);
    if (event.key === 'Home') return go(0);
    if (event.key === 'End') return go(all.length - 1);
    if (event.key === 'ArrowRight' && index >= 0 && rows[index]?.drill) { event.preventDefault(); onChoose(rows[index], true); return undefined; }
    if (event.key === 'ArrowLeft' && onBack) { event.preventDefault(); onBack(true); return undefined; }
    if (event.key.length === 1 && /\S/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = performance.now();
      typed = { text: now - typed.at < 700 ? typed.text + event.key.toLowerCase() : event.key.toLowerCase(), at: now };
      const from = index + (typed.text.length > 1 ? 0 : 1);
      const match = [...all.slice(from), ...all.slice(0, from)].find((item) => (item.dataset.text ?? '').toLowerCase().startsWith(typed.text));
      if (match) go(all.indexOf(match));
    }
    return undefined;
  });
  list.addEventListener('focusin', (event) => {
    const item = event.target.closest('[data-row]');
    if (!item) return;
    current = items().indexOf(item);
    items().forEach((n, i) => n.setAttribute('tabindex', i === current ? '0' : '-1'));
    // Keyboard focus also draws the ring inside the highlight, where the scrolling list cannot clip it.
    const glide = pointer && !reduced() && !!shown;
    hl.toggleAttribute('data-ring', !pointer && item.matches(':focus-visible'));
    if (glide) { y.to(item.offsetTop, SPRINGS.snappy); h.to(item.offsetHeight, SPRINGS.snappy); } else { y.jump(item.offsetTop); h.jump(item.offsetHeight); }
    shown = true;
    hl.style.opacity = '1';
  });
  list.addEventListener('focusout', (event) => {
    // The highlight fades where it is; it keeps its place so the fade is visible.
    if (!list.contains(event.relatedTarget)) { shown = false; hl.removeAttribute('data-ring'); hl.style.opacity = '0'; }
  });
  list.addEventListener('pointermove', (event) => {
    const item = event.target.closest('[data-row]');
    if (!item) return;
    pointer = true;
    if (document.activeElement !== item) item.focus({ preventScroll: true });
  });
  list.addEventListener('click', (event) => {
    const item = event.target.closest('[data-row]');
    if (item) onChoose(rows.find((r) => r.key === item.dataset.row), event.detail === 0);
  });
  list.addEventListener('pointerleave', () => { if (pointer && list.contains(document.activeElement)) onLeave(); });
  return { node: list, destroy() { y.stop(); h.stop(); } };
}

// The room the panel may use: the viewport, narrowed on each axis by any ancestor that clips that axis.
function roomFor(node) {
  const room = { left: 0, top: 0, right: document.documentElement.clientWidth, bottom: innerHeight };
  for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    const box = parent.getBoundingClientRect();
    if (style.overflowX !== 'visible') { room.left = Math.max(room.left, box.left); room.right = Math.min(room.right, box.right); }
    if (style.overflowY !== 'visible') { room.top = Math.max(room.top, box.top); room.bottom = Math.min(room.bottom, box.bottom); }
  }
  return room;
}

// An "Agregar filtro" button that grows into its own menu: pick a field, then a value.
function filterMenu(host, { fields, label, align, labels, active, onSelect }) {
  const id = uid('ftm-');
  const panelId = `${id}panel`;
  const titleId = `${id}title`;
  const root = el('div', 'ft-menu', { 'data-state': 'closed', 'data-y': 'down' });
  root.innerHTML = `<button type="button" class="ft-trigger" data-filter-trigger aria-haspopup="dialog" aria-expanded="false" aria-controls="${panelId}"><span class="ft-face">${svgIcon(ICONS.plus, 15)}${esc(label)}</span></button>
    <div class="ft-surface"><div class="ft-panel" id="${panelId}" role="dialog" aria-labelledby="${titleId}" tabindex="-1" inert><div class="ft-content"><div class="ft-head"><span class="ft-title" id="${titleId}"><span class="ft-title-text">${esc(label)}</span></span></div><div class="ft-stage"></div></div></div></div>`;
  host.append(root);
  const trigger = root.querySelector('.ft-trigger');
  const face = root.querySelector('.ft-face');
  const surface = root.querySelector('.ft-surface');
  const panel = root.querySelector('.ft-panel');
  const content = root.querySelector('.ft-content');
  const head = root.querySelector('.ft-head');
  const title = root.querySelector('.ft-title');
  const stage = root.querySelector('.ft-stage');

  let phase = 'closed';
  let run = 0;
  let focusNext = null;
  let fieldId = null;
  let direction = 1;
  let up = false;
  let origin = '100% 0';
  let fromW = 0;
  let toW = 0;
  let targetX = 0;
  let step = null; // { node, list }
  let back = null;
  const life = new AbortController();

  // The surface is the button's own rounded rectangle: at rest it fills the trigger; while open it springs to the panel.
  const paint = () => {
    if (phase === 'closed') return;
    const w = width.get();
    surface.style.width = `${w}px`;
    surface.style.height = `${height.get()}px`;
    surface.style.left = `${left.get()}px`;
    // The panel content stays put at its final position while the surface edge travels across it.
    panel.style.transform = `translateX(${targetX - left.get()}px)`;
    const progress = toW > fromW ? clamp((w - fromW) / (toW - fromW)) : 1;
    const faceOut = clamp(progress / 0.35);
    const contentIn = clamp((progress - 0.4) / 0.5);
    face.style.opacity = String(1 - faceOut);
    face.style.transform = `scale(${1 - faceOut * 0.04})`;
    face.style.filter = faceOut ? `blur(${faceOut * ARC.blur.subtle}px)` : 'none';
    content.style.opacity = String(contentIn);
    content.style.transformOrigin = origin;
    content.style.transform = `translateY(${(1 - contentIn) * (up ? -6 : 6)}px) scale(${0.96 + contentIn * 0.04})`;
    content.style.filter = contentIn === 1 ? 'none' : `blur(${(1 - contentIn) * ARC.blur.soft}px)`;
  };
  const width = new Val(0, paint);
  const height = new Val(0, paint);
  const left = new Val(0, paint);
  const clearInline = () => {
    for (const n of [surface, panel, face, content]) n.removeAttribute('style');
  };
  const spring = (s) => (reduced() ? null : s);
  const moveTo = (val, to, s, opts) => { const sp = spring(s); if (!sp) { val.jump(to); return Promise.resolve(true); } return val.to(to, sp, { restDelta: 0.25, ...opts }); };

  const rowsOf = () => {
    const current = (f) => active().find((a) => a.id === f.id)?.value;
    if (!fieldId) {
      return fields.map((f) => ({ key: f.id, label: f.label, icon: f.icon, drill: true, meta: `${current(f) ? `<span class="ft-meta-value">${esc(current(f))}</span>` : ''}${svgIcon(ICONS.chevronRight, 15)}` }));
    }
    const field = fields.find((f) => f.id === fieldId);
    return field.options.map(toOption).map((entry) => {
      const text = optionText(entry);
      const checked = current(field) === text;
      return { key: entry.value, label: text, icon: entry.icon, checked, meta: entry.hint != null || checked ? `${entry.hint != null ? `<span class="ft-hint">${esc(entry.hint)}</span>` : ''}<span class="ft-check" ${checked ? 'data-on' : ''}>${svgIcon(ICONS.check, 15)}</span>` : null };
    });
  };

  // Steps travel in the direction of the move: forward slides in from the end edge, back from the start edge.
  const renderStep = (initial) => {
    const old = step;
    const field = fields.find((f) => f.id === fieldId) ?? null;
    const list = menuList(rowsOf(), { labelledBy: titleId, radio: !!field, onChoose: field ? chooseValue : chooseField, onBack: field ? goBack : undefined, onLeave: () => panel.focus({ preventScroll: true }) });
    const node = el('div', 'ft-step');
    node.append(list.node);
    stage.append(node);
    step = { node, list };
    if (old) {
      old.list.node.removeAttribute('data-current');
      old.node.style.cssText = `position:absolute;top:0;left:0;width:${old.node.offsetWidth}px;pointer-events:none`;
      old.node.setAttribute('inert', '');
      const gone = () => { old.node.remove(); old.list.destroy(); };
      if (reduced()) gone();
      else old.node.animate([{ opacity: 1, transform: 'none', filter: 'blur(0px)' }, { opacity: 0, transform: `translateX(${direction * -18}px)`, filter: blur(ARC.blur.subtle) }], { duration: ms(ARC.duration.instant), easing: bezier('standard'), fill: 'forwards' }).finished.then(gone, gone);
    }
    if (!initial) {
      if (reduced()) node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: bezier('standard') });
      else {
        node.animate([{ opacity: 0, filter: blur(ARC.blur.soft) }, { opacity: 1, filter: 'blur(0px)' }], { duration: ms(ARC.duration.standard), easing: bezier('enter') });
        const c = curve(SPRINGS.smooth);
        node.animate([{ transform: `translateX(${direction * 18}px)` }, { transform: 'none' }], { duration: c.duration, easing: c.easing });
      }
    }
    // Title and back button follow the step.
    const text = title.querySelector('.ft-title-text:not([data-leaving])');
    const next = el('span', 'ft-title-text', {}, esc(field ? field.label : label));
    if (text) { text.dataset.leaving = ''; text.style.cssText = 'position:absolute;top:0;left:0'; textOut(text); }
    title.append(next);
    if (!initial) textIn(next);
    if (field && !back) {
      back = el('button', 'ft-back', { type: 'button', 'aria-label': labels.back }, svgIcon(ICONS.chevronLeft, 16));
      back.addEventListener('click', (event) => goBack(event.detail === 0));
      head.prepend(back);
      if (reduced()) back.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140 });
      else {
        const c = curve(SPRINGS.snappy);
        back.animate([{ width: '0px', marginRight: '0px', scale: 0.6 }, { width: '28px', marginRight: '2px', scale: 1 }], { duration: c.duration, easing: c.easing });
        back.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms(ARC.duration.standard), easing: bezier('enter') });
      }
    } else if (!field && back) {
      const gone = back;
      back = null;
      gone.setAttribute('inert', '');
      if (reduced()) gone.remove();
      else {
        const c = curve(SPRINGS.snappy);
        gone.animate([{ width: '28px', marginRight: '2px', scale: 1 }, { width: '0px', marginRight: '0px', scale: 0.6 }], { duration: c.duration, easing: c.easing, fill: 'forwards' });
        gone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms(ARC.duration.instant), easing: bezier('standard'), fill: 'forwards' }).finished.then(() => gone.remove(), () => gone.remove());
      }
    }
  };

  const focusStep = () => {
    const request = focusNext;
    if (!request || phase !== 'open') return;
    focusNext = null;
    if (request === 'panel') { panel.focus({ preventScroll: true }); return; }
    const items = [...panel.querySelectorAll('[data-current] [data-row]')];
    const next = request === 'first' ? items[0] : request === 'last' ? items.at(-1) : request === 'checked' ? items.find((i) => i.getAttribute('aria-checked') === 'true') ?? items[0] : items.find((i) => i.dataset.row === request.key) ?? items[0];
    next?.focus({ preventScroll: true });
  };

  function openMenu(request) {
    if (phase === 'open') return;
    const rect = trigger.getBoundingClientRect();
    if (phase === 'closed' || fieldId) resetStep();
    const panelWidth = panel.offsetWidth + 2;
    const panelHeight = panel.offsetHeight + 2;
    const room = roomFor(root);
    const gutter = 16;
    const min = room.left + gutter - rect.left;
    const max = room.right - gutter - rect.left - panelWidth;
    const end = rect.width - panelWidth;
    let x = align === 'end' ? (end >= min ? end : 0 <= max ? 0 : end) : (0 <= max ? 0 : end >= min ? end : 0);
    x = Math.round(Math.min(Math.max(x, min), Math.max(min, max)));
    const below = room.bottom - rect.top;
    const above = rect.bottom - room.top;
    up = below < panelHeight + gutter && above > below;
    const wasClosed = phase === 'closed';
    targetX = x;
    fromW = rect.width;
    toW = panelWidth;
    phase = 'open';
    run += 1;
    if (wasClosed) { width.jump(rect.width); height.jump(rect.height); left.jump(0); }
    focusNext = request;
    root.dataset.state = 'open';
    root.dataset.y = up ? 'up' : 'down';
    trigger.setAttribute('aria-expanded', 'true');
    trigger.tabIndex = -1;
    panel.removeAttribute('inert');
    origin = `${Math.round(rect.width / 2 - x)}px ${up ? '100%' : '0'}`;
    moveTo(left, x, SPRINGS.morph);
    moveTo(width, panelWidth, SPRINGS.morph);
    moveTo(height, panelHeight, SPRINGS.morph);
    paint();
    focusStep();
  }

  function closeMenu(restore) {
    if (phase !== 'open') return;
    phase = 'closing';
    const token = (run += 1);
    root.dataset.state = 'closing';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('tabindex');
    panel.setAttribute('inert', '');
    // Focus returns to the trigger; its ring shows only when the menu was closed from the keyboard.
    if (restore) trigger.focus({ preventScroll: true, focusVisible: restore === 'keyboard' });
    const rect = trigger.getBoundingClientRect();
    // Closing is quicker than opening: the snappy spring lands the shape back on the button.
    moveTo(left, 0, SPRINGS.snappy);
    moveTo(height, rect.height, SPRINGS.snappy);
    moveTo(width, rect.width, SPRINGS.snappy).then(() => {
      if (token !== run) return;
      phase = 'closed';
      root.dataset.state = 'closed';
      clearInline();
      fieldId = null;
    });
  }

  // A new step changes the panel height; the surface follows on the smooth spring instead of snapping.
  const resizer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (phase === 'open') moveTo(height, panel.offsetHeight + 2, SPRINGS.smooth); }) : null;
  resizer?.observe(panel);
  // Back to the first step, with the values that are in force now (a closed menu is rebuilt, never animated).
  const resetStep = () => {
    fieldId = null;
    direction = -1;
    stage.replaceChildren();
    step = null;
    title.replaceChildren();
    head.querySelector('.ft-back')?.remove();
    back = null;
    renderStep(true);
  };

  function chooseField(row, keyboard) {
    focusNext = keyboard ? 'checked' : 'panel';
    direction = 1;
    fieldId = row.key;
    renderStep(false);
    focusStep();
  }
  function goBack(keyboard) {
    if (!fieldId) return;
    focusNext = keyboard ? { key: fieldId } : 'panel';
    direction = -1;
    fieldId = null;
    renderStep(false);
    focusStep();
  }
  function chooseValue(row, keyboard) {
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;
    onSelect({ id: field.id, label: field.label, value: row.label }, field);
    closeMenu(keyboard ? 'keyboard' : 'pointer');
  }

  trigger.addEventListener('click', (event) => { if (phase !== 'open') openMenu(event.detail === 0 ? 'first' : 'panel'); });
  trigger.addEventListener('keydown', (event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openMenu(event.key === 'ArrowDown' ? 'first' : 'last'); } });
  panel.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    const items = [...panel.querySelectorAll('[data-current] [data-row]')];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); (event.key === 'ArrowDown' ? items[0] : items.at(-1))?.focus({ preventScroll: true }); }
    if (event.key === 'ArrowLeft' && fieldId) { event.preventDefault(); goBack(true); }
  });
  root.addEventListener('keydown', (event) => { if (event.key === 'Escape' && phase === 'open') { event.preventDefault(); event.stopPropagation(); closeMenu('keyboard'); } });
  root.addEventListener('focusout', (event) => { const next = event.relatedTarget; if (phase === 'open' && next && !root.contains(next)) closeMenu(false); });
  document.addEventListener('pointerdown', (event) => {
    if (phase !== 'open' || root.contains(event.target)) return;
    closeMenu(false);
    // A press on empty space hands focus back to the trigger; a press on another control keeps its own focus.
    if (!event.target.closest?.('button, a[href], input, select, textarea, [tabindex], [contenteditable]')) {
      setTimeout(() => { const focused = document.activeElement; if (!focused || focused === document.body || root.contains(focused)) trigger.focus({ preventScroll: true, focusVisible: false }); }, 0);
    }
  }, { capture: true, signal: life.signal });

  resetStep();
  return {
    root,
    trigger,
    get open() { return phase === 'open'; },
    destroy() { life.abort(); resizer?.disconnect(); width.stop(); height.stop(); left.stop(); step?.list.destroy(); root.remove(); },
  };
}

export function mount(root, options = {}) {
  if (handles.has(root)) return handles.get(root);
  const o = { filters: [], ...options };
  const L = { ...LABELS, ...o.labels };
  let filters = o.filters.map((f) => ({ ...f }));
  let armed = 0;
  let pendingFocus = null;
  const slots = new Map();
  const life = new AbortController();

  root.classList.add('ft');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', o.label ?? L.group);
  root.innerHTML = `<div class="ft-frame"><div class="ft-chips"></div></div><div class="ft-actions"></div><span class="arc-sr" role="status"></span>`;
  const frame = root.querySelector('.ft-frame');
  const list = root.querySelector('.ft-chips');
  const actions = root.querySelector('.ft-actions');
  const live = root.querySelector('[role="status"]');
  const emit = () => {
    const detail = { filters: filters.map((f) => ({ ...f })) };
    o.onChange?.(detail.filters);
    root.dispatchEvent(new CustomEvent('filter-toolbar:change', { detail, bubbles: true }));
  };

  // ── The frame springs to the height of the chip list while the filters change; other resizes follow at once. ──
  const frameHeight = new Val(0, (v) => { frame.style.height = `${v}px`; });
  let known = false;
  const followHeight = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
    const next = list.offsetHeight;
    if (!known || reduced() || performance.now() > armed) { known = true; frameHeight.jump(next); return; }
    frameHeight.to(next, SPRINGS.smooth, { restDelta: 0.25 });
  }) : null;
  followHeight?.observe(list);

  // ── Chips glide with the slot widths, but a chip that wraps to another line would teleport: offset it in the
  // same frame and let it spring back from where it was seen. ──
  const tracks = new Map();
  const check = () => {
    const now = performance.now();
    for (const child of [...list.children]) {
      const x = child.offsetLeft;
      const y = child.offsetTop;
      const track = tracks.get(child);
      if (!track) { tracks.set(child, { x, y, dx: 0, dy: 0, val: null }); continue; }
      const jx = track.x - x;
      const jy = track.y - y;
      track.x = x;
      track.y = y;
      if (reduced() || now > armed || (Math.abs(jy) < 1 && Math.abs(jx) < 40)) continue;
      track.val?.stop();
      const fromX = track.dx + jx;
      const fromY = track.dy + jy;
      const apply = (p) => { track.dx = fromX * (1 - p); track.dy = fromY * (1 - p); child.style.translate = p >= 1 ? '' : `${track.dx}px ${track.dy}px`; };
      apply(0);
      track.val = new Val(0, apply);
      track.val.to(1, SPRINGS.smooth, { restDelta: 0.001, restSpeed: 0.01 }).then((landed) => { if (landed) apply(1); });
    }
    for (const child of tracks.keys()) if (child.parentElement !== list) { tracks.get(child).val?.stop(); tracks.delete(child); }
  };
  const glide = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
  const watch = () => { for (const child of list.children) glide?.observe(child); };
  const mutations = new MutationObserver(() => { watch(); check(); });
  glide?.observe(list);
  mutations.observe(list, { childList: true });

  // ── A slot grows or collapses in the flow; while it moves it clips, and the chip keeps its natural width. ──
  const slotIn = (slot, gap) => {
    if (reduced()) return;
    const natural = slot.getBoundingClientRect().width;
    slot.style.overflow = 'clip';
    slot.style.setProperty('--slot-moving', '1');
    const val = new Val(0, (p) => { slot.style.width = `${natural * p}px`; slot.style.marginRight = `${-gap * (1 - p)}px`; });
    val.jump(0);
    val.to(1, SPRINGS.smooth, { restDelta: 0.002, restSpeed: 0.02 }).then((landed) => {
      if (!landed) return;
      slot.style.width = '';
      slot.style.marginRight = '';
      slot.style.overflow = '';
      slot.style.setProperty('--slot-moving', '0');
    });
    return val;
  };
  const slotOut = (slot, gap, done) => {
    slot.style.pointerEvents = 'none';
    if (reduced()) { slot.remove(); done?.(); return; }
    const natural = slot.getBoundingClientRect().width;
    slot.style.overflow = 'clip';
    slot.style.setProperty('--slot-moving', '1');
    const val = new Val(1, (p) => { slot.style.width = `${natural * p}px`; slot.style.marginRight = `${-gap * (1 - p)}px`; });
    val.jump(1);
    val.to(0, SPRINGS.smooth, { restDelta: 0.002, restSpeed: 0.02 }).then((landed) => { if (landed) { slot.remove(); done?.(); } });
  };
  const chipIn = (chip) => {
    if (reduced()) return;
    chip.animate([{ opacity: 0, filter: blur(ARC.blur.soft) }, { opacity: 1, filter: 'blur(0px)' }], { duration: ms(ARC.duration.standard), easing: bezier('enter'), fill: 'backwards' });
    const c = curve(SPRINGS.snappy);
    chip.animate([{ scale: 0.9 }, { scale: 1 }], { duration: c.duration, easing: c.easing, fill: 'backwards' });
  };
  const chipOut = (chip) => {
    if (reduced()) return;
    chip.animate([{ opacity: 1, scale: 1, filter: 'blur(0px)' }, { opacity: 0, scale: 0.9, filter: blur(ARC.blur.subtle) }], { duration: ms(ARC.duration.instant), easing: bezier('standard'), fill: 'forwards' });
  };

  // A value that changes inside a chip: the box takes the new width on a `morph` spring while the text rises in.
  const morphText = (host, text) => {
    host.className = 'ft-morph';
    host.innerHTML = `<span class="ft-measure" aria-hidden="true">${esc(text)}</span><span class="ft-morph-value">${esc(text)}</span>`;
    const measure = host.firstElementChild;
    const width = new Val(0, (v) => { host.style.width = `${v}px`; });
    let last = null;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = Math.ceil(entry.borderBoxSize?.[0]?.inlineSize ?? measure.offsetWidth);
      const changed = last !== null && last !== measure.textContent;
      last = measure.textContent;
      if (changed && !reduced()) width.to(next, SPRINGS.morph, { restDelta: 0.25 }); else width.jump(next);
    }) : null;
    observer?.observe(measure);
    return {
      set(next) {
        if (measure.textContent === next) return;
        measure.textContent = next;
        const old = host.querySelector('.ft-morph-value:not([data-leaving])');
        const value = el('span', 'ft-morph-value', {}, esc(next));
        if (old) { old.dataset.leaving = ''; old.style.cssText = 'position:absolute;top:0;left:0'; old.setAttribute('aria-hidden', 'true'); textOut(old); }
        host.append(value);
        textIn(value);
      },
      destroy() { observer?.disconnect(); width.stop(); },
    };
  };

  const buildChip = (f) => {
    const slot = el('span', 'ft-slot', { 'data-id': f.id });
    const chip = el('span', 'ft-chip');
    chip.innerHTML = `<span class="ft-chip-label">${esc(f.label)}${f.value ? '<span class="ft-value"><span class="ft-sep"> · </span><span class="ft-value-text"></span></span>' : ''}</span><button type="button" data-chip-remove="${esc(f.id)}" aria-label="${esc(L.remove(f))}">${svgIcon(ICONS.x, 14)}</button>`;
    slot.append(chip);
    const entry = { slot, chip, filter: f, morph: null };
    if (f.value) entry.morph = morphText(chip.querySelector('.ft-value-text'), f.value);
    return entry;
  };

  const emptyNote = () => {
    const existing = list.querySelector('.ft-empty:not([data-leaving])');
    if (filters.length && existing) { existing.dataset.leaving = ''; textOut(existing); }
    if (!filters.length && !existing) {
      const note = el('span', 'ft-empty', {}, esc(L.none));
      list.append(note);
      // The note waits for the leaving chips to fade before it rises in.
      textIn(note, ms(ARC.duration.instant * 0.75));
    }
  };
  let clearSlot = null;
  const clearButton = () => {
    if (filters.length && !clearSlot) {
      const slot = el('span', 'ft-slot', {}, `<button class="ft-clear" type="button"><span class="ft-clear-text">${esc(L.clear)}</span></button>`);
      slot.querySelector('button').addEventListener('click', () => { pendingFocus = -1; clear(); });
      actions.append(slot);
      clearSlot = slot;
      slotIn(slot, 12);
      textIn(slot.querySelector('.ft-clear-text'));
    } else if (!filters.length && clearSlot) {
      const slot = clearSlot;
      clearSlot = null;
      slotOut(slot, 12);
    }
  };

  const describe = (before, after) => {
    const removed = before.filter((b) => !after.some((a) => a.id === b.id));
    if (!after.length && removed.length > 1) return L.cleared;
    const added = after.filter((a) => !before.some((b) => b.id === a.id));
    const changed = after.filter((a) => before.some((b) => b.id === a.id && b.value !== a.value));
    return [...added.map((f) => L.added(textOf(f))), ...changed.map((f) => L.changed(f.label, f.value)), ...removed.map((f) => L.removed(textOf(f)))].join('. ');
  };

  const apply = (next, { announce = true } = {}) => {
    const before = filters;
    filters = next.map((f) => ({ ...f }));
    armed = performance.now() + 900;
    // Leaving chips collapse where they were; arriving ones open in their place in the order.
    for (const [id, entry] of [...slots]) {
      if (filters.some((f) => f.id === id)) continue;
      slots.delete(id);
      entry.morph?.destroy();
      chipOut(entry.chip);
      slotOut(entry.slot, 8);
    }
    filters.forEach((f, index) => {
      const entry = slots.get(f.id);
      if (entry) {
        if (entry.filter.value !== f.value) entry.morph?.set(f.value);
        entry.filter = f;
        const remove = entry.chip.querySelector('[data-chip-remove]');
        remove.setAttribute('aria-label', L.remove(f));
        return;
      }
      const made = buildChip(f);
      slots.set(f.id, made);
      const nextSlot = filters.slice(index + 1).map((n) => slots.get(n.id)?.slot).find((s) => s?.isConnected);
      list.insertBefore(made.slot, nextSlot ?? list.querySelector('.ft-empty'));
      slotIn(made.slot, 8);
      chipIn(made.chip);
    });
    emptyNote();
    clearButton();
    if (announce) { const text = describe(before, filters); if (text) { live.textContent = ''; live.textContent = text; } }
    // A removed chip hands focus to its neighbor, or to the Add filter trigger once the list is empty.
    if (pendingFocus !== null) {
      const next = filters[Math.min(pendingFocus, filters.length - 1)];
      pendingFocus = null;
      (next ? root.querySelector(`[data-chip-remove="${CSS.escape(next.id)}"]`) : root.querySelector('[data-filter-trigger]'))?.focus({ preventScroll: true });
    }
  };
  const set = (next) => { apply(next); emit(); };
  const add = (filter) => {
    const exists = filters.some((f) => f.id === filter.id);
    set(exists ? filters.map((f) => (f.id === filter.id ? { ...f, ...filter } : f)) : [...filters, filter]);
  };
  const remove = (id) => { o.onRemove?.(id); set(filters.filter((f) => f.id !== id)); };
  const clear = () => { o.onClearAll?.(); set([]); };

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-chip-remove]');
    if (!button) return;
    if (document.activeElement === button) pendingFocus = filters.findIndex((f) => f.id === button.dataset.chipRemove);
    remove(button.dataset.chipRemove);
  });

  let menu = null;
  if (o.addFilter) {
    menu = filterMenu(actions, {
      fields: o.addFilter.fields,
      label: o.addFilter.label ?? L.add,
      align: o.addFilter.align ?? 'end',
      labels: L,
      active: () => filters,
      onSelect: (filter, field) => { o.onAdd?.(filter, field); add(filter); },
    });
  }
  if (o.actions) actions.insertAdjacentHTML('beforeend', o.actions);

  // First paint: what is there is there, with no entrance.
  for (const f of filters) { const made = buildChip(f); slots.set(f.id, made); list.append(made.slot); }
  watch();
  check();
  emptyNote();
  if (filters.length) clearButton();
  if (clearSlot) { clearSlot.getAnimations().forEach((a) => a.cancel()); clearSlot.style.cssText = ''; }
  list.querySelectorAll('.ft-empty').forEach((n) => n.getAnimations().forEach((a) => a.cancel()));
  frameHeight.jump(list.offsetHeight);
  known = true;

  const handle = {
    get filters() { return filters.map((f) => ({ ...f })); },
    set, add, remove, clear,
    destroy() {
      handles.delete(root);
      life.abort();
      followHeight?.disconnect(); glide?.disconnect(); mutations.disconnect(); frameHeight.stop();
      for (const t of tracks.values()) t.val?.stop();
      for (const e of slots.values()) e.morph?.destroy();
      menu?.destroy();
      root.replaceChildren();
      root.classList.remove('ft');
      root.removeAttribute('role');
      root.removeAttribute('aria-label');
    },
  };
  handles.set(root, handle);
  return handle;
}
