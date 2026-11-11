// Everything that floats: the menu (with submenus, checkbox and radio items, a context menu), the
// select, the combobox, the date picker, the popover, the hover card, the toasts and the command
// palette. They share one surface (CSS), one placement (`place`) and one keyboard grammar: arrows
// move, Home/End jump, a letter jumps to what starts with it, Enter chooses, Escape closes and gives
// the focus back. The pointer and the keyboard share one highlight, a pill that slides to the active
// item (`listPill`); `data-modality` on the panel says which of them moved it last, and the keyboard
// adds a thin ring. A panel opened by keyboard animates like one opened by pointer: motion is only
// reduced to a fade by the CSS under `prefers-reduced-motion`.
import { reduced, finePointer, once, uid, flip, place, cascade, icon, escapeHtml, fold, messages, locale, format, listPill, hueOf, swapIn, shimmerHtml, pauseOffscreen, EASE_OUT } from './core.js';

const printable = (e) => e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
const rotate = (list, from) => [...list.slice(Math.max(0, from)), ...list.slice(0, Math.max(0, from))];

// A press outside every open floating panel closes it; one listener serves them all.
const openers = new Set();
let watching = false;
const watchOutside = () => {
  if (watching) return;
  watching = true;
  document.addEventListener('pointerdown', (e) => { for (const o of [...openers]) if (!o.contains(e.target)) o.close(); });
  addEventListener('resize', () => { for (const o of [...openers]) o.close(); });
  addEventListener('scroll', () => { for (const o of [...openers]) if (o.leftView?.()) o.close(); }, { passive: true, capture: true });
};

// ── Menu: top layer; grows from its trigger; its active item is lit by the pill ──
const MENU_ITEM = '[role=menuitem], [role=menuitemcheckbox], [role=menuitemradio]';
const menus = new WeakMap();
const menuOf = (panel, parent = null) => {
  const known = menus.get(panel);
  if (known) return known;
  panel.popover = 'manual';
  panel.tabIndex = -1;
  if (!panel.getAttribute('role')) panel.setAttribute('role', 'menu');
  if (parent) panel.setAttribute('data-sub', '');
  const pill = listPill(panel);
  const items = () => [...panel.querySelectorAll(MENU_ITEM)].filter((i) => i.getAttribute('aria-disabled') !== 'true' && i.closest('[role=menu]') === panel);
  const ctl = { panel, parent, anchor: null, returnTo: null, context: null, child: null };
  let active = null;
  let hoverTimer;
  let typed = '';
  let typedAt = 0;
  const isOpen = () => panel.matches(':popover-open');
  const activate = (item, focus = true) => {
    if (item !== active) {
      active?.removeAttribute('data-active');
      active = item;
      item?.setAttribute('data-active', '');
      if (item) pill.show(item); else pill.hide();
    }
    if (focus) item?.focus({ preventScroll: true });
    item?.scrollIntoView?.({ block: 'nearest' });
  };
  const sub = (item) => { const p = document.getElementById(item.getAttribute('aria-controls') ?? ''); return p ? menuOf(p, ctl) : null; };
  const openSub = (item, byKeyboard) => {
    const next = sub(item);
    if (!next) return;
    if (ctl.child && ctl.child !== next) ctl.child.close();
    ctl.child = next;
    next.open(item, { byKeyboard, side: 'right' });
  };
  ctl.activate = activate;
  ctl.contains = (node) => panel.contains(node) || (ctl.anchor instanceof Element && !parent && ctl.anchor.contains(node)) || !!ctl.child?.contains(node);
  ctl.root = () => (parent ? parent.root() : ctl);
  ctl.focusWithin = () => panel.contains(document.activeElement) || !!ctl.child?.focusWithin();
  ctl.hold = () => clearTimeout(hoverTimer);
  ctl.leftView = () => ctl.anchor instanceof Element && (ctl.anchor.getBoundingClientRect().bottom < 0 || ctl.anchor.getBoundingClientRect().top > innerHeight);
  ctl.open = (at, { byKeyboard = false, last = false, side = 'bottom', align = 'start', context = null, returnTo = null } = {}) => {
    if (isOpen()) ctl.close();
    ctl.anchor = at;
    ctl.returnTo = returnTo ?? (at instanceof HTMLElement ? at : null);
    if (!parent) ctl.context = context;
    panel.dataset.modality = byKeyboard ? 'keyboard' : 'pointer';
    pill.hide();
    panel.showPopover();
    place(panel, at, { side, align });
    cascade(panel);
    at.setAttribute?.('aria-expanded', 'true');
    if (!parent) { openers.add(ctl); watchOutside(); }
    panel.dispatchEvent(new CustomEvent('menuopen', { detail: { context: ctl.root().context } }));
    if (byKeyboard) activate(last ? items().at(-1) : items()[0]); else panel.focus({ preventScroll: true });
  };
  ctl.close = ({ refocus = false } = {}) => {
    if (!isOpen()) return;
    const had = ctl.focusWithin() || document.activeElement === document.body;
    ctl.child?.close();
    ctl.child = null;
    panel.hidePopover();
    ctl.anchor?.setAttribute?.('aria-expanded', 'false');
    activate(null, false);
    openers.delete(ctl);
    if (refocus && had) (parent ? ctl.anchor : ctl.returnTo)?.focus?.({ preventScroll: true });
  };
  panel.addEventListener('keydown', (e) => {
    panel.dataset.modality = 'keyboard';
    const list = items();
    const i = list.indexOf(active);
    if (e.key === 'ArrowDown') { e.preventDefault(); activate(list[(i + 1) % list.length]); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); activate(list[(i - 1 + list.length) % list.length]); return; }
    if (e.key === 'Home') { e.preventDefault(); activate(list[0]); return; }
    if (e.key === 'End') { e.preventDefault(); activate(list.at(-1)); return; }
    if (e.key === 'ArrowRight' && active?.hasAttribute('aria-haspopup')) { e.preventDefault(); openSub(active, true); return; }
    if (e.key === 'ArrowLeft' && parent) { e.preventDefault(); e.stopPropagation(); const from = ctl.anchor; ctl.close(); parent.activate(from); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (parent) { const from = ctl.anchor; ctl.close(); parent.activate(from); } else ctl.close({ refocus: true });
      return;
    }
    if (e.key === 'Tab') { ctl.root().close(); return; }
    if (e.key === ' ' && active?.tagName === 'A') { e.preventDefault(); active.click(); return; }
    const accel = list.find((it) => it.dataset.key === e.key);
    if (accel) { e.preventDefault(); accel.click(); return; }
    if (printable(e) && /\S/.test(e.key)) {
      const now = Date.now();
      typed = now - typedAt > 600 ? e.key : typed + e.key;
      typedAt = now;
      const needle = fold(typed);
      const hit = rotate(list, typed.length === 1 ? i + 1 : i).find((it) => fold(it.textContent.trim()).startsWith(needle));
      if (hit) activate(hit);
    }
  });
  panel.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !finePointer()) return;
    const item = e.target.closest(MENU_ITEM);
    if (!item || item.closest('[role=menu]') !== panel) return;
    panel.dataset.modality = 'pointer';
    if (item.getAttribute('aria-disabled') !== 'true') activate(item, false);
    clearTimeout(hoverTimer);
    if (item.hasAttribute('aria-haspopup')) hoverTimer = setTimeout(() => openSub(item, false), 100);
    else if (ctl.child) hoverTimer = setTimeout(() => { ctl.child?.close(); ctl.child = null; }, 240);
  });
  // The pointer leaving takes the pill with it, unless it went into the submenu that item opened.
  panel.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !ctl.child?.panel.matches(':popover-open')) activate(null, false); });
  panel.addEventListener('pointerenter', () => parent?.hold());
  panel.addEventListener('click', (e) => {
    const item = e.target.closest(MENU_ITEM);
    if (!item || item.closest('[role=menu]') !== panel || item.getAttribute('aria-disabled') === 'true') return;
    if (item.hasAttribute('aria-haspopup')) { openSub(item, e.detail === 0); return; }
    const role = item.getAttribute('role');
    if (role === 'menuitemcheckbox') item.setAttribute('aria-checked', String(item.getAttribute('aria-checked') !== 'true'));
    if (role === 'menuitemradio') {
      const group = item.closest('[role=group]');
      for (const r of items().filter((n) => n.getAttribute('role') === 'menuitemradio' && n.closest('[role=group]') === group)) r.setAttribute('aria-checked', String(r === item));
    }
    panel.dispatchEvent(new CustomEvent('select', { detail: { item, value: item.dataset.value ?? item.dataset.action ?? '', context: ctl.root().context } }));
    if (role !== 'menuitemcheckbox' && !item.hasAttribute('data-keep-open')) ctl.root().close({ refocus: true });
  });
  menus.set(panel, ctl);
  for (const item of panel.querySelectorAll('[aria-haspopup=menu][aria-controls]')) if (item.closest('[role=menu]') === panel) sub(item);
  return ctl;
};

const menuTrigger = (trigger) => {
  if (!once(trigger, 'uiMenu')) return;
  const panel = document.getElementById(trigger.getAttribute('aria-controls'));
  if (!panel) return;
  const ctl = menuOf(panel);
  const align = () => trigger.dataset.align ?? 'start';
  trigger.addEventListener('click', (e) => (panel.matches(':popover-open') ? ctl.close() : ctl.open(trigger, { byKeyboard: e.detail === 0, align: align() })));
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); ctl.open(trigger, { byKeyboard: true, align: align() }); }
    if (e.key === 'ArrowUp') { e.preventDefault(); ctl.open(trigger, { byKeyboard: true, last: true, align: align() }); }
  });
};

// A menu opened from code: under an element, or at a point.
export const openMenu = (panel, anchor, options) => menuOf(panel).open(anchor, options);
export const closeMenu = (panel, options) => menus.get(panel)?.close(options);
// A menu on right-click (and the context-menu key) of whatever matches `selector` inside `container`.
export const contextMenu = (container, selector, panel) => {
  container.addEventListener('contextmenu', (e) => {
    const target = e.target.closest(selector);
    if (!target || !container.contains(target)) return;
    e.preventDefault();
    const r = target.getBoundingClientRect();
    const byKeyboard = !e.clientX && !e.clientY;
    menuOf(panel).open(byKeyboard ? { x: r.left + 16, y: r.bottom } : { x: e.clientX, y: e.clientY }, { context: target, returnTo: target, byKeyboard });
  });
};

// ── Popover: a panel of content (not a list of actions) opened by a `aria-haspopup=dialog` button;
// it takes focus, Escape gives it back, an outside press closes it. `data-align="end"` on the
// trigger aligns the panel to the trigger's right edge. ──
const popover = (trigger) => {
  if (!once(trigger, 'uiPopover')) return;
  const panel = document.getElementById(trigger.getAttribute('aria-controls'));
  if (!panel) return;
  panel.popover = 'manual';
  panel.tabIndex = -1;
  const isOpen = () => panel.matches(':popover-open');
  const handle = { contains: (n) => panel.contains(n) || trigger.contains(n), close: () => close(false), leftView: () => trigger.getBoundingClientRect().bottom < 0 };
  const close = (refocus) => {
    if (!isOpen()) return;
    panel.hidePopover();
    trigger.setAttribute('aria-expanded', 'false');
    openers.delete(handle);
    if (refocus) trigger.focus();
  };
  const open = () => {
    panel.showPopover();
    place(panel, trigger, { align: trigger.dataset.align });
    cascade(panel, ':scope > :not(.stack), :scope > .stack > *');
    trigger.setAttribute('aria-expanded', 'true');
    openers.add(handle);
    watchOutside();
    (panel.querySelector('[tabindex="0"], input:not([type=hidden]), select, textarea, button:not([tabindex="-1"])') ?? panel).focus({ preventScroll: true });
  };
  trigger.addEventListener('click', () => (isOpen() ? close(false) : open()));
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } });
};

// ── Select: a button that opens a listbox (Radix grammar). Options live in the page's markup:
// `<div role="option" data-value aria-selected>`; groups are `role=group` with a `.listbox__label`.
// The chosen option shows a check and the list opens lit on it; the trigger says its label and fires
// `change`. ──
const select = (trigger) => {
  if (!once(trigger, 'uiSelect')) return;
  const list = document.getElementById(trigger.getAttribute('aria-controls'));
  if (!list) return;
  list.popover = 'manual';
  list.tabIndex = -1;
  list.setAttribute('role', 'listbox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  if (!trigger.getAttribute('role')) trigger.setAttribute('role', 'combobox');
  if (!trigger.querySelector('.select__value')) { trigger.textContent = ''; trigger.insertAdjacentHTML('afterbegin', '<span class="select__value"></span>'); }
  if (!trigger.querySelector('.select__chevron')) trigger.insertAdjacentHTML('beforeend', icon('chevron', 'icon select__chevron'));
  const pill = listPill(list);
  const all = () => [...list.querySelectorAll('[role=option]')];
  const options = () => all().filter((o) => o.getAttribute('aria-disabled') !== 'true');
  for (const o of all()) { o.id ||= uid('opt'); if (!o.querySelector('.listbox__check')) o.insertAdjacentHTML('beforeend', icon('check', 'icon listbox__check')); }
  const labelOf = (o) => o.textContent.trim();
  const chosen = () => all().find((o) => o.getAttribute('aria-selected') === 'true');
  const sync = () => {
    const o = chosen();
    const shown = trigger.querySelector('.select__value');
    const before = shown.textContent;
    shown.textContent = o ? labelOf(o) : (trigger.dataset.placeholder ?? messages.placeholder);
    shown.toggleAttribute('data-placeholder', !o);
    trigger.dataset.value = o?.dataset.value ?? '';
    if (before && before !== shown.textContent) swapIn(shown);
  };
  let active = null;
  let typed = '';
  let typedAt = 0;
  const isOpen = () => list.matches(':popover-open');
  const activate = (o) => {
    active?.removeAttribute('data-active');
    active = o;
    o?.setAttribute('data-active', '');
    list.setAttribute('aria-activedescendant', o?.id ?? '');
    o?.scrollIntoView({ block: 'nearest' });
    if (o && isOpen()) pill.show(o); else pill.hide();
  };
  const handle = { contains: (n) => list.contains(n) || trigger.contains(n), close: () => close(false), leftView: () => trigger.getBoundingClientRect().bottom < 0 };
  const close = (refocus = true) => {
    if (!isOpen()) return;
    list.hidePopover();
    trigger.setAttribute('aria-expanded', 'false');
    activate(null);
    openers.delete(handle);
    if (refocus) trigger.focus();
  };
  const open = (byKeyboard) => {
    list.dataset.modality = byKeyboard ? 'keyboard' : 'pointer';
    pill.hide();
    list.showPopover();
    place(list, trigger, { matchWidth: true, gap: 4 });
    cascade(list);
    trigger.setAttribute('aria-expanded', 'true');
    openers.add(handle);
    watchOutside();
    list.focus({ preventScroll: true });
    activate(chosen() ?? (byKeyboard ? options()[0] : null));
  };
  const choose = (o) => {
    for (const x of all()) x.setAttribute('aria-selected', String(x === o));
    sync();
    close(true);
    trigger.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: o.dataset.value ?? labelOf(o), label: labelOf(o) } }));
  };
  trigger.addEventListener('click', (e) => (isOpen() ? close(true) : open(e.detail === 0)));
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(true); }
  });
  list.addEventListener('keydown', (e) => {
    list.dataset.modality = 'keyboard';
    const opts = options();
    const i = opts.indexOf(active ?? chosen());
    if (e.key === 'ArrowDown') { e.preventDefault(); activate(opts[Math.min(opts.length - 1, i + 1)]); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); activate(opts[Math.max(0, i < 0 ? 0 : i - 1)]); return; }
    if (e.key === 'Home') { e.preventDefault(); activate(opts[0]); return; }
    if (e.key === 'End') { e.preventDefault(); activate(opts.at(-1)); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (active) choose(active); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.key === 'Tab') { close(false); return; }
    if (printable(e) && /\S/.test(e.key)) {
      const now = Date.now();
      typed = now - typedAt > 600 ? e.key : typed + e.key;
      typedAt = now;
      const needle = fold(typed);
      const hit = rotate(opts, typed.length === 1 ? i + 1 : i).find((o) => fold(labelOf(o)).startsWith(needle));
      if (hit) activate(hit);
    }
  });
  list.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !finePointer()) return;
    const o = e.target.closest('[role=option]');
    if (!o || o.getAttribute('aria-disabled') === 'true' || o === active) return;
    list.dataset.modality = 'pointer';
    activate(o);
  });
  list.addEventListener('click', (e) => { const o = e.target.closest('[role=option]'); if (o && o.getAttribute('aria-disabled') !== 'true') choose(o); });
  sync();
};

// ── Combobox: filters as you type, arrows move, Enter picks, Escape closes. The value has to be
// one of the options; `data-creatable` adds an explicit «Crear X» option for what is not there. It opens
// lit on the chosen option, or on the first one while you type. ──
const highlight = (label, q) => {
  const at = q ? fold(label).indexOf(q) : -1;
  if (at < 0) return escapeHtml(label);
  return `${escapeHtml(label.slice(0, at))}<mark>${escapeHtml(label.slice(at, at + q.length))}</mark>${escapeHtml(label.slice(at + q.length))}`;
};
const combobox = (box) => {
  if (!once(box, 'uiCombo')) return;
  const input = box.querySelector('input');
  const list = box.querySelector('.combobox__list');
  const options = JSON.parse(box.dataset.options ?? '[]');
  const creatable = box.hasAttribute('data-creatable');
  list.popover = 'manual';
  list.id ||= uid('cb');
  list.setAttribute('role', 'listbox');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');
  let toggle = box.querySelector('.combobox__toggle');
  if (!toggle) {
    toggle = Object.assign(document.createElement('button'), { className: 'combobox__toggle', type: 'button', tabIndex: -1, innerHTML: icon('chevron') });
    toggle.setAttribute('aria-label', messages.showOptions);
    input.after(toggle);
  }
  const pill = listPill(list);
  let shown = [];
  let index = -1;
  let chosen = input.value;
  let picking = false;
  const exact = (text) => options.find((o) => fold(o) === fold(text.trim()));
  const isOpen = () => list.matches(':popover-open');
  const optionEls = () => [...list.querySelectorAll('[role=option]')];
  const mark = () => {
    const els = optionEls();
    els.forEach((c, j) => c.toggleAttribute('data-active', j === index));
    input.setAttribute('aria-activedescendant', index >= 0 ? `${list.id}-${index}` : '');
    els[index]?.scrollIntoView({ block: 'nearest' });
    if (isOpen() && els[index]) pill.show(els[index]); else pill.hide();
  };
  const render = (preferChosen = false) => {
    const raw = input.value.trim();
    const q = fold(raw);
    shown = options.filter((o) => fold(o).includes(q)).slice(0, 8).map((label) => ({ label }));
    if (creatable && raw && !exact(raw)) shown.push({ label: raw, create: true });
    const at = preferChosen ? shown.findIndex((o) => !o.create && o.label === chosen) : -1;
    index = shown.length ? Math.max(0, at) : -1;
    list.innerHTML = shown.length ? shown.map((o, i) => `<div class="combobox__option${o.create ? ' combobox__option--create' : ''}" role="option" id="${list.id}-${i}" aria-selected="${!o.create && o.label === chosen}"><span class="combobox__label">${o.create ? escapeHtml(messages.create(o.label)) : highlight(o.label, q)}</span>${icon(o.create ? 'plus' : 'check', 'icon combobox__check')}</div>`).join('') : `<div class="combobox__option" aria-disabled="true"><span class="combobox__label">${escapeHtml(messages.noMatches)}</span></div>`;
    pill.attach();
    mark();
  };
  const handle = { contains: (n) => box.contains(n), close: () => close(), leftView: () => input.getBoundingClientRect().bottom < 0 };
  const close = () => {
    if (!isOpen()) return;
    list.hidePopover();
    box.removeAttribute('data-open');
    input.setAttribute('aria-expanded', 'false');
    pill.hide();
    openers.delete(handle);
  };
  const open = (preferChosen = false) => {
    const fresh = !isOpen();
    if (fresh) { pill.hide(); list.showPopover(); }
    place(list, input, { matchWidth: true, gap: 4 });
    box.setAttribute('data-open', '');
    input.setAttribute('aria-expanded', 'true');
    openers.add(handle);
    watchOutside();
    render(preferChosen && fresh);
    // Opening — not every key — brings the options in.
    if (fresh) cascade(list);
  };
  // A combobox that can create says so in its error, with the same «X» its create option shows;
  // `data-error-create` on the input is that sentence in the screen's words (`{value}` is the text).
  const rejected = (text) => (creatable ? (input.dataset.errorCreate?.replace('{value}', text) ?? messages.notAnOptionOrCreate(text)) : messages.notAnOption);
  const validate = () => input.setCustomValidity(!input.value.trim() || exact(input.value) ? '' : rejected(input.value.trim()));
  const pick = (i) => {
    const o = shown[i];
    if (o === undefined) return;
    if (o.create) { options.push(o.label); box.dispatchEvent(new CustomEvent('create', { bubbles: true, detail: { value: o.label } })); }
    picking = true;
    input.value = o.label;
    chosen = o.label;
    validate();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    picking = false;
    close();
    box.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: o.label } }));
  };
  const move = (i) => { index = (i + shown.length) % shown.length; mark(); };
  validate();
  input.addEventListener('input', () => { validate(); if (!picking) open(false); });
  input.addEventListener('click', () => { if (!isOpen()) open(true); });
  input.addEventListener('blur', () => {
    const match = exact(input.value);
    if (match) { input.value = match; chosen = match; }
    validate();
    setTimeout(close, 120);
  });
  input.addEventListener('keydown', (e) => {
    list.dataset.modality = 'keyboard';
    if (!isOpen() && e.key === 'ArrowDown') { e.preventDefault(); open(true); return; }
    if (e.key === 'ArrowDown' && shown.length) { e.preventDefault(); move(index + 1); }
    if (e.key === 'ArrowUp' && shown.length) { e.preventDefault(); move(index - 1); }
    if (e.key === 'Enter' && isOpen()) { e.preventDefault(); pick(index); }
    if (e.key === 'Escape' && isOpen()) { e.preventDefault(); e.stopPropagation(); close(); }
  });
  toggle.addEventListener('pointerdown', (e) => e.preventDefault());
  toggle.addEventListener('click', () => { if (isOpen()) close(); else { input.focus(); open(true); } });
  list.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !finePointer()) return;
    const o = e.target.closest('[role=option]');
    const i = o ? optionEls().indexOf(o) : -1;
    if (i < 0 || i === index) return;
    list.dataset.modality = 'pointer';
    index = i;
    mark();
  });
  list.addEventListener('pointerdown', (e) => { const o = e.target.closest('[role=option]'); if (o) { e.preventDefault(); pick(optionEls().indexOf(o)); } });
};

// ── Date picker: a button that opens a calendar. Arrows move by day and week, PageUp/PageDown by
// month (with Shift, by year), Home/End to the edge of the week, Enter picks, Escape closes. With
// `data-mode="range"` two picks make a range, with a preview between them. Values are ISO dates in
// `data-value` (or `data-start` and `data-end`); `data-view` is where the calendar opens. The days of the
// neighbouring months are drawn (and can be picked); changing month slides the grid 12 px the way it goes. ──
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const isoDate = iso;
const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d, n) => {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()));
};
const firstDayOfWeek = (loc) => { try { const l = new Intl.Locale(loc); return (l.getWeekInfo?.() ?? l.weekInfo)?.firstDay ?? 1; } catch { return 1; } };
// The footer both date pickers share. A range picker takes each as the range it names; a single
// date takes the day that range ends on (today, the end of the week, the end of the month).
const PRESETS = [['today', 'today'], ['week', 'thisWeek'], ['month', 'thisMonth'], ['last30', 'last30Days']];
export const presetRange = (key, loc) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === 'week') { const start = addDays(today, -((today.getDay() - (firstDayOfWeek(loc) % 7) + 7) % 7)); return [start, addDays(start, 6)]; }
  if (key === 'month') return [new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 0)];
  if (key === 'last30') return [addDays(today, -29), today];
  return [today, today];
};
export const datepicker = (trigger) => {
  if (!once(trigger, 'uiDate')) return;
  const panel = document.getElementById(trigger.getAttribute('aria-controls'));
  if (!panel) return;
  const range = trigger.dataset.mode === 'range';
  panel.popover = 'manual';
  panel.tabIndex = -1;
  panel.classList.add('datepicker');
  if (!trigger.querySelector('.select__value')) { trigger.textContent = ''; trigger.insertAdjacentHTML('afterbegin', '<span class="select__value"></span>'); }
  if (!trigger.querySelector('.select__chevron')) trigger.insertAdjacentHTML('beforeend', icon('calendar', 'icon select__chevron'));
  const state = { value: trigger.dataset.value ?? '', start: trigger.dataset.start ?? '', end: trigger.dataset.end ?? '', pending: '' };
  let focused = new Date();
  let view = new Date();
  const loc = () => locale(trigger);
  // A range reads short in a toolbar: «5–14 oct», «28 sep – 4 oct», the year only when it is not this one.
  const shortRange = (from, to) => {
    const a = parseIso(from);
    const b = parseIso(to || from);
    const year = [a, b].some((d) => d.getFullYear() !== new Date().getFullYear());
    const dm = (d) => new Intl.DateTimeFormat(loc(), { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) }).format(d);
    if (iso(a) === iso(b)) return dm(a);
    if (!year && a.getMonth() === b.getMonth()) return `${a.getDate()}–${dm(b)}`;
    return `${dm(a)}${messages.rangeSeparator}${dm(b)}`;
  };
  const label = () => {
    const shown = trigger.querySelector('.select__value');
    const text = range ? (state.start ? shortRange(state.start, state.end) : '') : (state.value ? format.date(parseIso(state.value), undefined, trigger) : '');
    shown.textContent = text || (trigger.dataset.placeholder ?? messages.placeholder);
    shown.toggleAttribute('data-placeholder', !text);
    trigger.dataset.value = state.value;
    if (range) { trigger.dataset.start = state.start; trigger.dataset.end = state.end; }
  };
  const paintRange = () => {
    const a = state.pending || state.start;
    const b = state.pending ? iso(focused) : state.end;
    const [lo, hi] = a && b ? [a, b].sort() : [a, a];
    for (const day of panel.querySelectorAll('.datepicker__day')) {
      const d = day.dataset.date;
      day.parentElement.toggleAttribute('data-in-range', !!a && d > lo && d < hi);
      day.parentElement.toggleAttribute('data-range-start', !!a && d === lo);
      day.parentElement.toggleAttribute('data-range-end', !!a && d === hi && lo !== hi);
    }
  };
  const render = (dir = 0) => {
    const y = view.getFullYear();
    const m = view.getMonth();
    const first = firstDayOfWeek(loc());
    const title = new Intl.DateTimeFormat(loc(), { month: 'long', year: 'numeric' }).format(view);
    const lead = (new Date(y, m, 1).getDay() - (first % 7) + 7) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const weekday = (i) => new Intl.DateTimeFormat(loc(), { weekday: 'short' }).format(new Date(2026, 0, 5 + ((first - 1 + i) % 7)));
    const long = new Intl.DateTimeFormat(loc(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const today = iso(new Date());
    const selected = (d) => (range ? d === state.start || d === state.end || d === state.pending : d === state.value);
    let cells = '';
    for (let r = 0; r < Math.ceil((lead + days) / 7); r++) {
      cells += '<tr role="row">';
      for (let c = 0; c < 7; c++) {
        const n = r * 7 + c - lead + 1;
        const date = new Date(y, m, n);
        const d = iso(date);
        const outside = n < 1 || n > days;
        cells += `<td role="gridcell" aria-selected="${selected(d)}"><button class="datepicker__day" type="button" data-date="${d}" tabindex="${d === iso(focused) && !outside ? 0 : -1}" aria-label="${long.format(date)}"${d === today ? ' data-today' : ''}${outside ? ' data-outside' : ''}>${date.getDate()}</button></td>`;
      }
      cells += '</tr>';
    }
    // The period the picker holds is the preset pressed: a range that is exactly one of them, or the day a single date shares with it.
    const held = (key) => {
      const [from, to] = presetRange(key, loc()).map(iso);
      return range ? !state.pending && state.start === from && state.end === to : state.value === to;
    };
    panel.innerHTML = `<div class="datepicker__head"><button class="btn btn--ghost btn--icon btn--sm" type="button" data-nav="-1" aria-label="${escapeHtml(messages.previousMonth)}" data-tooltip="${escapeHtml(messages.previousMonth)}">${icon('chevron-left')}</button><div class="datepicker__title" id="${panel.id}-title" aria-live="polite">${title}</div><button class="btn btn--ghost btn--icon btn--sm" type="button" data-nav="1" aria-label="${escapeHtml(messages.nextMonth)}" data-tooltip="${escapeHtml(messages.nextMonth)}">${icon('chevron-right')}</button></div>
      <table class="datepicker__grid" role="grid" aria-labelledby="${panel.id}-title"${dir ? ` data-slide style="--_dir: ${dir}"` : ''}><thead><tr role="row">${Array.from({ length: 7 }, (_, i) => `<th scope="col" role="columnheader">${weekday(i)}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table>
      <div class="datepicker__foot"><div class="datepicker__presets">${PRESETS.map(([key, text]) => `<button class="btn btn--ghost btn--sm" type="button" data-preset="${key}" aria-pressed="${held(key)}">${escapeHtml(messages[text])}</button>`).join('')}</div><button class="btn btn--ghost btn--sm" type="button" data-clear>${escapeHtml(messages.clear)}</button></div>`;
    if (range) paintRange();
  };
  const dayOf = (date) => panel.querySelector(`[data-date="${iso(date)}"]:not([data-outside])`);
  const goTo = (date) => {
    const sameMonth = date.getFullYear() === view.getFullYear() && date.getMonth() === view.getMonth();
    const dir = date < view ? -1 : 1;
    focused = date;
    if (!sameMonth) { view = new Date(date.getFullYear(), date.getMonth(), 1); render(reduced() ? 0 : dir); }
    else for (const b of panel.querySelectorAll('.datepicker__day')) b.tabIndex = b.dataset.date === iso(focused) && !b.hasAttribute('data-outside') ? 0 : -1;
    dayOf(focused)?.focus();
    if (range && state.pending) paintRange();
  };
  const handle = { contains: (n) => panel.contains(n) || trigger.contains(n), close: () => close(false), leftView: () => trigger.getBoundingClientRect().bottom < 0 };
  const close = (refocus) => {
    if (!panel.matches(':popover-open')) return;
    panel.hidePopover();
    trigger.setAttribute('aria-expanded', 'false');
    openers.delete(handle);
    if (refocus) trigger.focus();
  };
  const emit = () => { label(); trigger.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: range ? { start: state.start, end: state.end } : { value: state.value } })); };
  const pick = (d) => {
    if (!range) { state.value = d; close(true); emit(); return; }
    if (!state.pending) { state.pending = d; paintRange(); for (const c of panel.querySelectorAll('td')) c.setAttribute('aria-selected', String(c.firstElementChild?.dataset.date === d)); return; }
    [state.start, state.end] = [state.pending, d].sort();
    state.pending = '';
    close(true);
    emit();
  };
  const open = () => {
    const seed = (range ? state.start : state.value) || trigger.dataset.view || iso(new Date());
    focused = parseIso(seed);
    view = new Date(focused.getFullYear(), focused.getMonth(), 1);
    state.pending = '';
    render();
    panel.showPopover();
    place(panel, trigger);
    trigger.setAttribute('aria-expanded', 'true');
    openers.add(handle);
    watchOutside();
    dayOf(focused)?.focus({ preventScroll: true });
  };
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  // From code: `trigger.setDate('2026-10-12')`, `trigger.setDate('')`, or `{ start, end }` for a range.
  trigger.setDate = (next) => {
    if (range) Object.assign(state, { start: next?.start ?? '', end: next?.end ?? '', pending: '' });
    else state.value = next ?? '';
    label();
  };
  trigger.addEventListener('click', () => (panel.matches(':popover-open') ? close(false) : open()));
  panel.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { focused = addMonths(focused, Number(nav.dataset.nav)); view = new Date(focused.getFullYear(), focused.getMonth(), 1); render(reduced() ? 0 : Number(nav.dataset.nav)); panel.querySelector(`[data-nav="${nav.dataset.nav}"]`)?.focus(); return; }
    const day = e.target.closest('.datepicker__day');
    if (day) { focused = parseIso(day.dataset.date); pick(day.dataset.date); return; }
    const preset = e.target.closest('[data-preset]');
    if (preset) {
      const [from, to] = presetRange(preset.dataset.preset, loc()).map(iso);
      if (range) Object.assign(state, { start: from, end: to, pending: '' }); else state.value = to;
      close(true);
      emit();
      return;
    }
    if (e.target.closest('[data-clear]')) { state.value = ''; state.start = ''; state.end = ''; state.pending = ''; close(true); emit(); }
  });
  panel.addEventListener('pointerover', (e) => { const day = e.target.closest('.datepicker__day'); if (day && range && state.pending) { focused = parseIso(day.dataset.date); paintRange(); } });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (!e.target.closest('.datepicker__day')) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) { e.preventDefault(); goTo(addDays(focused, step)); return; }
    if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); goTo(addMonths(focused, (e.key === 'PageUp' ? -1 : 1) * (e.shiftKey ? 12 : 1))); return; }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const offset = (focused.getDay() - (firstDayOfWeek(loc()) % 7) + 7) % 7;
      goTo(addDays(focused, e.key === 'Home' ? -offset : 6 - offset));
    }
  });
  label();
};

// ── Hover card: after 500 ms of intent on what matches `selector`, a card with what `render`
// returns; it stays while the pointer is on it or on its anchor, and goes 150 ms after it leaves. ──
export const hovercard = (container, selector, render, { delay = 500, onShow } = {}) => {
  const card = Object.assign(document.body.appendChild(document.createElement('div')), { className: 'hovercard', popover: 'manual' });
  card.setAttribute('role', 'group');
  const lifetime = new AbortController();
  const { signal } = lifetime;
  let anchor = null;
  let openTimer;
  let closeTimer;
  const handle = { contains: () => true, close: () => hide(), leftView: () => !!anchor && anchor.getBoundingClientRect().bottom < 0 };
  const hide = () => {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    if (card.matches(':popover-open')) card.hidePopover();
    openers.delete(handle);
    anchor = null;
  };
  const show = (el) => {
    const html = render(el);
    if (html === null || html === undefined) return;
    anchor = el;
    card.innerHTML = html;
    card.querySelectorAll('.avatar').forEach((a) => a.style.setProperty('--h', String(hueOf(a.dataset.name ?? a.textContent))));
    card.setAttribute('aria-label', el.textContent.trim());
    const fresh = !card.matches(':popover-open');
    if (fresh) card.showPopover();
    place(card, el, { gap: 6 });
    onShow?.(card, { fresh });
  };
  const schedule = (el) => {
    clearTimeout(closeTimer);
    if (el === anchor) return;
    clearTimeout(openTimer);
    openTimer = setTimeout(() => show(el), delay);
  };
  const leave = () => { clearTimeout(openTimer); clearTimeout(closeTimer); closeTimer = setTimeout(hide, 150); };
  container.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse' || !finePointer()) return;
    const el = e.target.closest(selector);
    if (el && container.contains(el)) schedule(el);
  }, { signal });
  container.addEventListener('pointerout', (e) => { if (e.target.closest(selector) && !e.relatedTarget?.closest?.(selector)) leave(); }, { signal });
  container.addEventListener('pointerdown', hide, { signal });
  card.addEventListener('pointerenter', () => clearTimeout(closeTimer), { signal });
  card.addEventListener('pointerleave', leave, { signal });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && card.matches(':popover-open')) hide(); }, { signal });
  addEventListener('scroll', () => { if (card.matches(':popover-open')) hide(); }, { passive: true, capture: true, signal });
  return {
    hide,
    // Takes back every listener and the card itself.
    destroy() { hide(); lifetime.abort(); card.remove(); },
  };
};

// ── Toasts (Sonner's stack): top layer, newest in front; older ones sit behind, overlapping and a
// little smaller, and the whole stack opens into a column under the pointer or the focus. The
// close button is always top right; one with an action carries a bar that drains the time left to
// undo; the error is a soft danger surface, not a saturated fill. At most three show; swipe to
// dismiss. A modal dialog makes everything outside it inert, top layer included: while one is open,
// the region lives inside the topmost modal, and goes back to the body when it closes. ──
let region;
const timers = new Set();
const layout = () => {
  const live = [...region.children].filter((n) => !n.hasAttribute('data-leaving'));
  const expanded = region.hasAttribute('data-expanded');
  region.style.setProperty('--_front', `${live.at(-1)?.offsetHeight ?? 0}px`);
  let offset = 0;
  [...live].reverse().forEach((t, i) => {
    t.style.setProperty('--y', `${expanded ? -offset : -i * 14}px`);
    t.style.setProperty('--s', String(expanded ? 1 : 1 - i * 0.05));
    t.toggleAttribute('data-front', i === 0);
    t.toggleAttribute('data-hidden', i >= 3);
    offset += t.offsetHeight + 8;
  });
};
// Alt+T moves focus into the stack (the front toast's first button), and the stack opens with it; Escape on a toast
// dismisses it and focus goes to the next one, or back to where it was before entering the stack.
let returnFocus = null;
const frontToast = () => [...region.children].filter((n) => !n.hasAttribute('data-leaving') && !n.hasAttribute('data-hidden')).at(-1);
const handFocus = (leaving, keyboard) => {
  const live = [...region.children].filter((n) => n !== leaving && !n.hasAttribute('data-leaving') && !n.hasAttribute('data-hidden'));
  const next = live.at(-1)?.querySelector('button');
  if (keyboard && next) next.focus({ focusVisible: true });
  else if (keyboard && returnFocus?.isConnected) returnFocus.focus();
  else document.activeElement?.blur?.();
};
const toasts = () => {
  if (!region?.isConnected) {
    region = Object.assign(document.createElement('section'), { className: 'toasts', popover: 'manual' });
    region.setAttribute('aria-label', `${messages.notifications} (Alt+T)`);
    document.addEventListener('close', (e) => { if (e.target.contains?.(region)) { document.body.append(region); region.showPopover(); } }, true);
    region.addEventListener('focusin', (e) => { if (!region.contains(e.relatedTarget)) returnFocus = e.relatedTarget instanceof HTMLElement ? e.relatedTarget : null; });
    const expand = (on) => {
      if (on === region.hasAttribute('data-expanded')) return;
      region.toggleAttribute('data-expanded', on);
      layout();
      for (const t of timers) on ? t.pause() : t.resume();
    };
    region.addEventListener('pointerenter', () => expand(true));
    region.addEventListener('pointerleave', () => expand(region.matches(':focus-within')));
    region.addEventListener('focusin', () => expand(true));
    region.addEventListener('focusout', () => expand(region.matches(':hover')));
  }
  const modal = [...document.querySelectorAll('dialog')].filter((d) => d.matches(':modal')).at(-1);
  const parent = modal ?? document.body;
  const moved = region.parentElement !== parent;
  if (moved) parent.append(region);
  if (moved && region.matches(':popover-open')) region.hidePopover();
  if (!region.matches(':popover-open')) region.showPopover();
  return region;
};
// A toast says what happened in words and, with its icon, in a mark: a check that draws itself for what went
// well, an alert for what failed, a spinner while it is pending, or the one the caller names. A pending one
// shimmers its label; `update` settles it (the label swaps, the spinner becomes the check) and
// `toast.promise` is that for a promise.
const SPINNER = '<svg class="spinner toast__icon" viewBox="0 0 16 16" aria-hidden="true" data-spinning><circle class="spinner__track" cx="8" cy="8" r="6" pathLength="100"/><circle class="spinner__arc" cx="8" cy="8" r="6" pathLength="100"/></svg>';
const toastIcon = (tone, name) => (name ? icon(name, 'icon toast__icon') : tone === 'loading' ? SPINNER : tone === 'success' || tone === 'error' ? icon(tone === 'success' ? 'check' : 'alert', 'icon toast__icon') : '');
const toastText = (box, message, tone, description) => {
  if (tone === 'loading') { box.innerHTML = shimmerHtml(message); pauseOffscreen(box.firstElementChild); } else box.textContent = message;
  if (!description) return;
  const title = document.createElement('span');
  title.className = 'toast__title';
  title.append(...box.childNodes);
  box.append(title, Object.assign(document.createElement('span'), { className: 'toast__desc', textContent: description }));
};
// The action folds its width open when it arrives on a toast already showing and folds it shut when the toast is
// updated without it, so the text widens into its room instead of jumping.
const foldIn = (slot) => {
  const width = slot.offsetWidth;
  if (!width) return;
  if (reduced()) { slot.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: EASE_OUT }); return; }
  slot.style.overflow = 'clip';
  const open = slot.animate({ width: ['0px', `${width}px`], opacity: [0, 1] }, { duration: 260, easing: EASE_OUT });
  open.onfinish = open.oncancel = () => { slot.style.overflow = ''; };
};
const foldAway = (slot) => {
  slot.inert = true;
  slot.style.overflow = 'clip';
  const width = slot.offsetWidth;
  const out = reduced()
    ? slot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: EASE_OUT, fill: 'forwards' })
    : slot.animate({ width: [`${width}px`, '0px'], opacity: [1, 0] }, { duration: 260, easing: EASE_OUT, fill: 'forwards' });
  out.onfinish = () => slot.remove();
  out.oncancel = () => slot.remove();
};
// Resistance past an edge: the pull keeps moving, but less and less, like an overscroll.
const rubberBand = (distance, dimension) => (1 - 1 / ((distance * 0.55) / dimension + 1)) * dimension;
const liveToasts = new Map();
// A toast with an action stays at least 10 s (WCAG 2.2.1): whoever needs the action has time to reach it; it also waits
// while it is hovered or has focus. One that only informs goes after 4 s.
// A toast with an `id` that is already showing is updated in place instead of stacking another: its icon turns into
// the new one, its lines swap, and an action it no longer has folds away (the result of pressing «Deshacer» takes the
// place of the question, in the same toast). A toast says what it says in a title and, below it, an optional description.
export const TOAST_MS = { info: 4000, action: 10_000 };
export const toast = (message, { id, description, action, onAction, timeout, tone, icon: iconName } = {}) => {
  const known = id === undefined ? undefined : liveToasts.get(id);
  if (known) { known.update(message, { tone, description, action, onAction, timeout, icon: iconName }); return known; }
  const lasts = (given, withAction) => (withAction ? Math.max(given ?? TOAST_MS.action, TOAST_MS.action) : given ?? TOAST_MS.info);
  timeout = lasts(timeout, action);
  const host = toasts();
  const el = document.createElement('div');
  el.className = 'toast';
  let kind = tone;
  let version = 0;
  let handler = onAction;
  if (tone) el.dataset.tone = tone;
  el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  el.insertAdjacentHTML('beforeend', toastIcon(tone, iconName));
  const text = Object.assign(document.createElement('span'), { className: 'toast__text' });
  toastText(text, message, tone, description);
  el.append(text);
  let leave;
  let slot = null;
  const close = Object.assign(document.createElement('button'), { className: 'toast__close', type: 'button', innerHTML: icon('x') });
  close.setAttribute('aria-label', messages.dismiss);
  close.addEventListener('click', () => leave());
  const setAction = (label, fresh) => {
    if (label && !slot) {
      slot = Object.assign(document.createElement('span'), { className: 'toast__action-slot' });
      const b = Object.assign(document.createElement('button'), { className: 'toast__action', textContent: label, type: 'button' });
      b.addEventListener('click', () => {
        const before = version;
        const keyboard = b.matches(':focus-visible');
        handler?.();
        if (version === before) leave(); else if (keyboard && close.isConnected) close.focus({ focusVisible: true });
      });
      slot.append(b);
      el.insertBefore(slot, close);
      if (!fresh) foldIn(slot);
    } else if (label) slot.firstElementChild.textContent = label;
    else if (slot) { foldAway(slot); slot = null; }
  };
  el.append(close);
  setAction(action, true);
  // The bar that drains the time left to take the action back exists while there is an action to take.
  const setTimerBar = (withAction, time) => {
    el.querySelector('.toast__timer')?.remove();
    if (!withAction || kind === 'error') return;
    el.style.setProperty('--_t', `${time}ms`);
    el.append(Object.assign(document.createElement('span'), { className: 'toast__timer' }));
  };
  setTimerBar(action, timeout);
  // The time left is tracked, so the draining bar and the timer pause and resume together.
  let timer;
  let remaining = timeout;
  let startedAt = 0;
  const entry = {
    pause() { if (startedAt) { remaining = Math.max(0, remaining - (Date.now() - startedAt)); startedAt = 0; } clearTimeout(timer); },
    resume() { clearTimeout(timer); if (kind === 'error' || !Number.isFinite(remaining) || host.hasAttribute('data-expanded')) return; startedAt = Date.now(); timer = setTimeout(leave, remaining); },
  };
  timers.add(entry);
  leave = () => {
    clearTimeout(timer);
    if (el.hasAttribute('data-leaving')) return;
    timers.delete(entry);
    if (id !== undefined && liveToasts.get(id) === leave) liveToasts.delete(id);
    if (el.contains(document.activeElement)) handFocus(el, document.activeElement.matches(':focus-visible'));
    el.setAttribute('data-leaving', '');
    layout();
    const gone = () => { el.remove(); if (host.isConnected) layout(); };
    el.addEventListener('transitionend', (e) => { if (e.target === el && e.propertyName === 'opacity') gone(); });
    setTimeout(gone, 400);
  };
  if (id !== undefined) liveToasts.set(id, leave);
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); leave(); } });
  // Swipe to dismiss: right follows the finger and fades; past 80 px, or flicked, it leaves the way it was going;
  // otherwise it springs back. Left resists like an overscroll and always comes back.
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const x0 = e.clientX;
    const t0 = performance.now();
    let dx = 0;
    let dragging = false;
    el.setPointerCapture(e.pointerId);
    const move = (ev) => {
      dx = ev.clientX - x0;
      if (!dragging && Math.abs(dx) < 4) return;
      dragging = true;
      el.setAttribute('data-dragging', '');
      el.style.translate = `${dx >= 0 ? dx : -rubberBand(-dx, el.offsetWidth)}px 0`;
      el.style.opacity = String(dx > 0 ? 1 - Math.min(1, dx / 260) : 1);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      if (!dragging) return;
      el.removeAttribute('data-dragging');
      if (dx > 80 || (dx > 40 && dx / (performance.now() - t0) > 0.6)) {
        el.style.translate = `${el.offsetWidth + 24}px 0`;
        el.style.opacity = '0';
        leave();
      } else {
        el.style.translate = '';
        el.style.opacity = '';
      }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up, { once: true });
    el.addEventListener('pointercancel', up, { once: true });
  });
  el.setAttribute('data-front', '');
  host.append(el);
  layout();
  const live = [...host.children].filter((n) => !n.hasAttribute('data-leaving'));
  if (live.length > 3) live[0].querySelector('.toast__close').click();
  entry.resume();
  leave.update = (next, { tone: settled, description: more, action: act, onAction: run, timeout: time, icon: iconNext } = {}) => {
    if (el.hasAttribute('data-leaving')) return;
    version += 1;
    kind = settled;
    handler = run;
    const stays = lasts(time, act);
    if (settled) el.dataset.tone = settled; else delete el.dataset.tone;
    el.setAttribute('role', settled === 'error' ? 'alert' : 'status');
    el.querySelector('.toast__icon')?.remove();
    el.insertAdjacentHTML('afterbegin', toastIcon(settled, iconNext));
    toastText(text, next, settled, more);
    swapIn(text);
    setAction(act, false);
    setTimerBar(act, stays);
    entry.pause();
    remaining = stays;
    entry.resume();
    layout();
  };
  return leave;
};
document.addEventListener('keydown', (e) => {
  if (!e.altKey || e.metaKey || e.ctrlKey || e.code !== 'KeyT' || !region?.isConnected) return;
  const target = frontToast()?.querySelector('button');
  if (!target) return;
  e.preventDefault();
  target.focus({ focusVisible: true });
});
toast.promise = (promise, { loading, success, error }) => {
  const pending = toast(loading, { tone: 'loading', timeout: Infinity });
  const said = (what, value) => (typeof what === 'function' ? what(value) : what);
  promise.then((value) => pending.update(said(success, value), { tone: 'success' }), (reason) => pending.update(said(error, reason), { tone: 'error' }));
  return promise;
};

// ── Command palette: ⌘K / Ctrl+K. It searches the commands in `data-commands` and whatever the page
// puts in `palette.source()` (invoices, clients: an item has `group`, `label`, `icon`, `meta`,
// `amount`, `shortcut`, `keywords`, `entity` for what only a search shows, and `pages` — a list or a
// function returning one — to open a sub-page). With nothing typed it shows the recent ones first.
// It enters fast, filters with the results moving into place (FLIP) and the new ones fading in; the
// pill under the active result follows the arrows and the pointer; a sub-page slides in from the side it
// came from, its results one after another; arrows move, Enter runs, Backspace on an empty search steps
// out of a sub-page and Escape always closes it. ──
const RECENT_KEY = 'ui.palette.recent';
const recentIds = () => { try { return JSON.parse(sessionStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; } };
const palette = (dialog) => {
  if (!once(dialog, 'uiPalette')) return;
  const input = dialog.querySelector('input');
  const list = dialog.querySelector('.palette__list');
  const search = dialog.querySelector('.palette__search');
  const crumbs = Object.assign(document.createElement('span'), { className: 'palette__crumbs' });
  search.insertBefore(crumbs, input);
  const foot = Object.assign(document.createElement('div'), { className: 'palette__foot' });
  dialog.append(foot);
  const base = JSON.parse(dialog.dataset.commands ?? '[]');
  const placeholder = input.getAttribute('placeholder') ?? '';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'true');
  list.setAttribute('role', 'listbox');
  list.id ||= 'ui-palette-list';
  input.setAttribute('aria-controls', list.id);
  const pill = listPill(list);
  const nodes = new Map();
  const pages = [];
  let shown = [];
  let index = 0;
  const keyOf = (c) => c.id ?? `${c.group}|${c.label}`;
  const resolve = (items) => (typeof items === 'function' ? items() : items);
  const pool = () => (pages.length ? resolve(pages.at(-1).items) : [...base, ...(dialog.source?.() ?? [])]);
  const nodeFor = (c, group) => {
    const key = `${keyOf(c)}|${group}`;
    let n = nodes.get(key);
    if (!n) { n = Object.assign(document.createElement('div'), { className: 'palette__item' }); n.setAttribute('role', 'option'); nodes.set(key, n); }
    n.innerHTML = `${c.icon ? `<span class="palette__icon">${icon(c.icon)}</span>` : ''}<span class="palette__label">${escapeHtml(c.label)}</span>${c.meta ? `<span class="palette__meta">${escapeHtml(c.meta)}</span>` : ''}${c.amount ? `<span class="palette__amount">${escapeHtml(c.amount)}</span>` : ''}${c.shortcut ? `<kbd class="key">${escapeHtml(c.shortcut)}</kbd>` : ''}${c.pages ? icon('chevron-right', 'icon palette__more') : ''}`;
    return n;
  };
  const mark = () => {
    shown.forEach((s, i) => { s.node.setAttribute('aria-selected', String(i === index)); s.node.id = `pal-${i}`; });
    input.setAttribute('aria-activedescendant', shown.length ? `pal-${index}` : '');
    if (dialog.open && shown[index]) pill.show(shown[index].node); else pill.hide();
  };
  const chrome = () => {
    crumbs.innerHTML = pages.map((p) => `<span class="palette__crumb">${escapeHtml(p.title)}</span>`).join('');
    input.setAttribute('placeholder', pages.length ? messages.paletteIn(pages.at(-1).title) : placeholder);
    const hint = (keys, text) => `<span>${keys.map((k) => `<kbd class="key">${k}</kbd>`).join('')} ${escapeHtml(text)}</span>`;
    foot.innerHTML = `${hint(['↑', '↓'], messages.paletteNavigate)}${hint(['↵'], messages.paletteOpen)}${pages.length ? hint(['⌫'], messages.paletteBack) : ''}${hint(['Esc'], messages.paletteClose)}`;
  };
  const render = (animate) => {
    const tokens = fold(input.value.trim()).split(/\s+/).filter(Boolean);
    const everything = pool();
    const rest = !pages.length && !tokens.length;
    const matches = everything.filter((c) => (rest ? !c.entity : true) && tokens.every((t) => fold(`${c.label} ${c.meta ?? ''} ${c.group ?? ''} ${c.keywords ?? ''}`).includes(t)));
    const recent = rest ? recentIds().map((id) => everything.find((c) => keyOf(c) === id)).filter(Boolean) : [];
    const entries = [...recent.map((c) => ({ c, group: messages.paletteRecent })), ...matches.map((c) => ({ c, group: c.group ?? '' }))];
    const before = [...list.querySelectorAll('.palette__item')];
    const had = new Set(before);
    const next = entries.map((e) => ({ ...e, node: nodeFor(e.c, e.group) }));
    const build = () => {
      if (!next.length) { list.replaceChildren(pill.node, Object.assign(document.createElement('div'), { className: 'palette__empty', textContent: tokens.length ? messages.noResultsFor(input.value.trim()) : messages.noResults })); return; }
      let group = null;
      list.replaceChildren(pill.node, ...next.flatMap((e) => {
        const head = e.group !== group && e.group ? [Object.assign(document.createElement('div'), { className: 'palette__group', textContent: (group = e.group) })] : [];
        group = e.group;
        return [...head, e.node];
      }));
    };
    const height = list.offsetHeight;
    if (animate) flip(before, build); else build();
    shown = next;
    index = 0;
    // The list follows the filter: when it grows, the new part is revealed from the top.
    if (animate && !reduced() && dialog.open && list.offsetHeight > height + 1) list.animate([{ clipPath: `inset(0 0 ${list.offsetHeight - height}px 0)` }, { clipPath: 'inset(0 0 0 0)' }], { duration: 180, easing: EASE_OUT });
    if (animate && !reduced()) for (const e of next) if (!had.has(e.node)) { e.node.classList.add('is-new'); e.node.addEventListener('animationend', () => e.node.classList.remove('is-new'), { once: true }); }
    chrome();
    mark();
  };
  // A page change slides the list in from the side it came from; entering one also staggers its results,
  // 20 ms apart, the first six.
  const turn = (dir) => {
    if (reduced()) { list.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: EASE_OUT }); return; }
    list.animate([{ opacity: 0, transform: `translateX(${dir * 12}px)` }, { opacity: 1, transform: 'none' }], { duration: 180, easing: EASE_OUT });
    if (dir > 0) shown.slice(0, 6).forEach((s, i) => s.node.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 160, delay: i * 20, easing: EASE_OUT, fill: 'backwards' }));
  };
  const move = (i) => {
    if (!shown.length) return;
    index = (i + shown.length) % shown.length;
    mark();
    shown[index].node.scrollIntoView({ block: 'nearest' });
  };
  const enter = (c) => { pages.push({ title: c.label, items: c.pages }); input.value = ''; render(false); turn(1); input.focus(); };
  const leavePage = () => { pages.pop(); input.value = ''; render(false); turn(-1); };
  const run = (position) => {
    const entry = shown[position];
    if (!entry) return;
    const c = entry.c;
    if (c.pages) { enter(c); return; }
    try { sessionStorage.setItem(RECENT_KEY, JSON.stringify([keyOf(c), ...recentIds().filter((id) => id !== keyOf(c))].slice(0, 3))); } catch { /* private mode */ }
    const path = pages.map((p) => p.title);
    // The row lights for an instant, and then it runs: the only thing the palette adds to what is used a hundred times a day.
    entry.node.setAttribute('data-flash', '');
    setTimeout(() => {
      entry.node.removeAttribute('data-flash');
      dialog.close();
      dialog.dispatchEvent(new CustomEvent('run', { detail: { ...c, path } }));
    }, reduced() ? 0 : 150);
  };
  const openPalette = () => { pages.length = 0; input.value = ''; pill.hide(); list.dataset.modality = 'keyboard'; render(false); dialog.showModal(); input.focus(); mark(); };
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); dialog.open ? dialog.close() : openPalette(); }
  });
  document.querySelectorAll(`[data-palette="${dialog.id}"]`).forEach((b) => b.addEventListener('click', openPalette));
  input.addEventListener('input', () => render(true));
  input.addEventListener('keydown', (e) => {
    list.dataset.modality = 'keyboard';
    if (e.key === 'ArrowDown') { e.preventDefault(); move(index + 1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(index - 1); }
    if (e.key === 'Enter') { e.preventDefault(); run(index); }
    if (e.key === 'Backspace' && !input.value && pages.length) { e.preventDefault(); leavePage(); }
  });
  list.addEventListener('pointermove', (e) => { const n = e.target.closest('[role=option]'); const i = shown.findIndex((s) => s.node === n); if (n && i >= 0 && i !== index) { list.dataset.modality = 'pointer'; move(i); } });
  list.addEventListener('click', (e) => { const n = e.target.closest('[role=option]'); if (n) run(shown.findIndex((s) => s.node === n)); });
  dialog.addEventListener('click', (e) => { const r = dialog.getBoundingClientRect(); if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close(); });
};

export const initOverlays = (root = document) => {
  // Every menu is a popover from the start; a submenu is made by the item that opens it.
  const submenus = new Set([...document.querySelectorAll('.menu [aria-haspopup=menu][aria-controls]')].map((i) => i.getAttribute('aria-controls')));
  root.querySelectorAll('.menu[role=menu]').forEach((panel) => { if (!submenus.has(panel.id)) menuOf(panel); });
  root.querySelectorAll('[aria-haspopup=menu][aria-controls]:not([role^=menuitem])').forEach(menuTrigger);
  root.querySelectorAll('[aria-haspopup=dialog][aria-controls]:not([data-datepicker])').forEach(popover);
  root.querySelectorAll('[data-datepicker]').forEach(datepicker);
  root.querySelectorAll('button.select[aria-controls]:not([data-datepicker])').forEach(select);
  root.querySelectorAll('.combobox').forEach(combobox);
  root.querySelectorAll('dialog.palette').forEach(palette);
};
