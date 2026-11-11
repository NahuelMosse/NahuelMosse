// Behavior of the reference component set, without dependencies. `ui.init(root)` wires every
// component by its markup (classes, data attributes, ARIA), so a screen is composed in HTML and
// inherits every state, keyboard path and motion. Motion goes through CSS transitions —they can be
// interrupted and retarget from the current value— and the Web Animations API for FLIP and for the
// detail panel. Modules: `core.js` (helpers, the spring integrator, locale, the words the components
// say), `overlays.js` (everything that floats), `charts.js` and `life.js` (what each thing does on the
// way to being used, and the four signature moments), `drag.js` (lifting, sorting and moving items between
// lists); this one holds the rest.
import { scope, forever, reduced, finePointer, once, css, ms, spring, EASE_OUT, uid, messages, format, configure, keyLabel, flip, flying, locale, icon, describeChange, offsetIn, makePill, placePill, hueOf, fade, follower, springOf, swapIn, escapeHtml, shimmerHtml, alignSheen, pauseOffscreen, endOf } from './core.js';
import { dragSort } from './drag.js';
import { initOverlays, openMenu, closeMenu, contextMenu, hovercard as floatingHovercard, toast } from './overlays.js';
import { initCharts, setChart, ping } from './charts.js';
import { mount as slidingNumber } from './motion/sliding-number.js';
import { mount as slotText } from './motion/slot-text.js';
import { flipClip, flipMove, flipSurface, rectOf, surfaceRect, visibleRect } from './motion/flip-size.js';
import { initEntry } from './entry.js';
import { initLife, flashValue, placeEnd, pulseSpark, enterFields, enterSections, enterRows, enterCardRows, setProgress, sweepRows, particles, confetti, lap, moments } from './life.js';

export { messages, format, configure, keyLabel, toast, openMenu, closeMenu, contextMenu };

// A hover card also brings its rows in one after another and rolls the figures that ask for it.
export const hovercard = (container, selector, render, options = {}) => floatingHovercard(container, selector, render, {
  ...options,
  onShow: (card, state) => { activate(card); if (state.fresh) enterCardRows(card); options.onShow?.(card, state); },
});

// ── Springs. CSS carries what a transition can (indicators, enters, presses: `--spring` is a
// critically damped `linear()` curve); what has to follow a moving target with velocity —the light
// under the pointer, a counting figure— integrates a real spring (`follower`, core.js), with the numbers
// of the tokens `--spring-pointer`, `--spring-slide`, `--spring-bubble` and `--spring-ticker`
// ("stiffness damping mass"). ──

// A panel that enters from the side the navigation came from: the transition panel. With reduced
// motion it does not travel, it fades.
export const slideIn = (el, dir, distance = 14) => {
  if (reduced()) { fade(el); return; }
  if (!dir) return;
  el.animate([{ opacity: 0, transform: `translateX(${dir * distance}px)` }, { opacity: 1, transform: 'none' }], { duration: 220, easing: EASE_OUT });
};
// The panel of a tab comes in from the side it is on: 16 px, a blur of 2 px that clears, 220 ms on the drawer
// curve; the one that leaves goes the other way as a copy, in 100 ms (it is already hidden for everything else).
const panelIn = (el, dir) => {
  if (reduced()) { fade(el); return; }
  if (!dir) return;
  el.animate([{ opacity: 0, transform: `translateX(${dir * 16}px)`, filter: 'blur(2px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 220, easing: css('--ease-drawer') || EASE_OUT });
};
const panelOut = (panel, box, dir) => {
  if (reduced() || !dir || !panel.parentElement) return;
  const holder = panel.parentElement;
  const ghost = panel.cloneNode(true);
  ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  ghost.removeAttribute('id');
  ghost.removeAttribute('role');
  ghost.hidden = false;
  ghost.inert = true;
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, { position: 'absolute', top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, pointerEvents: 'none' });
  const was = holder.style.position;
  if (getComputedStyle(holder).position === 'static') holder.style.position = 'relative';
  holder.append(ghost);
  ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 12}px)` }], { duration: 100, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {}).then(() => { ghost.remove(); holder.style.position = was; });
};

// What appears with a view, once and short: the view slides in from the side the navigation came
// from, and its blocks blur-fade in one after another (Blur Fade: 6 px, blur to 0, 40 ms apart). With
// reduced motion the view fades in and its blocks stay still.
export const enterView = (view, dir = 0) => {
  if (reduced()) { fade(view); return; }
  slideIn(view, dir, 10);
  [...view.children].slice(0, 8).forEach((child, i) => child.animate(
    [{ opacity: 0, transform: 'translateY(6px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
    { duration: 320, delay: 40 + i * 40, easing: 'ease-out', fill: 'backwards' },
  ));
};

// ── Highlight (Animate UI, Motion Primitives «animated background»): one background that slides to
// the item under the pointer, on a spring, and fades when the pointer leaves. It is a 100 × 100
// element scaled and moved to the item with transform; its corners are compensated so the radius
// stays the item's. The items sit above it with a transparent background. It lets go of an item that
// is hidden, removed or moved by a resize, so it never rests on a row that is gone. The sidebar and the
// KPI band use the Animated Background port of motion/ instead; this one serves what is rebuilt: the
// rows of a table, the options of a segmented control and the tabs of a panel. ──
const highlight = (container, itemSel, { bleed = [0, 0], pointer = true, radius } = {}, life = forever) => {
  if (!once(container, 'uiHl')) return null;
  const hl = makePill('hl');
  container.prepend(hl);
  container.setAttribute('data-hl', '');
  const put = (node, item, instant) => placePill(node, item, container, { bleed, instant, radius });
  let live = false;
  let leaving;
  let target = null;
  const to = (item) => {
    clearTimeout(leaving);
    put(hl, item, !live || reduced());
    live = true;
    target = item;
    hl.setAttribute('data-on', '');
  };
  const hide = () => {
    target = null;
    hl.removeAttribute('data-on');
    clearTimeout(leaving);
    leaving = setTimeout(() => { live = false; }, 200);
  };
  if (pointer) {
    container.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse' || !finePointer()) return;
      const item = e.target.closest(itemSel);
      if (item && container.contains(item)) to(item);
    });
    container.addEventListener('pointerleave', hide);
    life.watch(new ResizeObserver(() => { if (target) hide(); })).observe(container);
    life.watch(new MutationObserver(() => { if (target && (!target.isConnected || target.hidden || target.hasAttribute('data-leaving') || !target.getClientRects().length)) hide(); })).observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'data-leaving'] });
  }
  return { to, hide };
};

// ── Segmented control and tabs: one indicator, moved and scaled with transform only ──
const placeIndicator = (indicator, selected, instant) => {
  if (!selected || !indicator) return;
  if (instant) indicator.style.transition = 'none';
  indicator.style.transform = `translateX(${selected.offsetLeft}px) scaleX(${selected.offsetWidth / 100})`;
  if (instant) requestAnimationFrame(() => requestAnimationFrame(() => { indicator.style.transition = ''; }));
};
const choice = (group, life = forever) => {
  if (!once(group, 'uiChoice')) return;
  const isTabs = group.getAttribute('role') === 'tablist';
  const options = [...group.querySelectorAll(isTabs ? '[role=tab]' : '[role=radio]')];
  const indicator = group.querySelector('.segmented__indicator, .tabs__indicator');
  const attr = isTabs ? 'aria-selected' : 'aria-checked';
  let current = options.find((o) => o.getAttribute(attr) === 'true') ?? options[0];
  // The labels under the pill: a copy of them in the selected style, clipped to the pill and moved with the
  // same curve, so the text changes color exactly where the pill passes, not before and not after.
  const labels = Object.assign(document.createElement('span'), { className: isTabs ? 'tabs__labels' : 'segmented__labels' });
  labels.setAttribute('aria-hidden', 'true');
  labels.innerHTML = options.map((o) => `<span class="${isTabs ? 'tabs__ghost' : 'segmented__ghost'}">${escapeHtml(o.textContent.trim())}</span>`).join('');
  if (indicator) group.append(labels);
  const clipTo = (option, instant) => {
    if (!indicator || !option?.offsetWidth) return;
    if (instant) labels.style.transition = 'none';
    const r = parseFloat(getComputedStyle(option).borderTopLeftRadius) || 0;
    labels.style.clipPath = `inset(${option.offsetTop}px ${group.clientWidth - option.offsetLeft - option.offsetWidth}px ${group.clientHeight - option.offsetTop - option.offsetHeight}px ${option.offsetLeft}px round ${r}px)`;
    if (instant) { void labels.offsetWidth; labels.style.transition = ''; }
  };
  const select = (next, focus, quiet = false) => {
    if (next === current) return;
    const dir = Math.sign(options.indexOf(next) - options.indexOf(current));
    const leaving = isTabs ? document.getElementById(current.getAttribute('aria-controls')) : null;
    const box = leaving?.getClientRects().length && { top: leaving.getBoundingClientRect().top - leaving.parentElement.getBoundingClientRect().top, left: leaving.getBoundingClientRect().left - leaving.parentElement.getBoundingClientRect().left, width: leaving.offsetWidth };
    for (const o of options) { o.setAttribute(attr, String(o === next)); o.tabIndex = o === next ? 0 : -1; }
    placeIndicator(indicator, next, false);
    clipTo(next, false);
    if (isTabs) {
      for (const o of options) { const p = document.getElementById(o.getAttribute('aria-controls')); if (p) p.hidden = o !== next; }
      const entering = document.getElementById(next.getAttribute('aria-controls'));
      if (entering) panelIn(entering, dir);
      if (box && leaving !== entering) panelOut(leaving, box, dir);
    }
    current = next;
    if (focus) next.focus();
    if (!quiet) group.dispatchEvent(new CustomEvent('change', { detail: { value: next.dataset.value ?? next.textContent.trim() } }));
  };
  // `group.choose(value)` moves the choice from code, without a `change`: what already happened elsewhere is shown here.
  group.choose = (value) => {
    const next = options.find((o) => (o.dataset.value ?? o.textContent.trim()) === value);
    if (next) select(next, false, true);
  };
  for (const o of options) { o.tabIndex = o === current ? 0 : -1; o.addEventListener('click', () => select(o, false)); }
  group.addEventListener('keydown', (e) => {
    const i = options.indexOf(current);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step) { e.preventDefault(); select(options[(i + step + options.length) % options.length], true); }
    if (e.key === 'Home') { e.preventDefault(); select(options[0], true); }
    if (e.key === 'End') { e.preventDefault(); select(options.at(-1), true); }
  });
  placeIndicator(indicator, current, true);
  clipTo(current, true);
  // The group can stay the same width while its options change (a font arriving): watch each option too.
  const resized = life.watch(new ResizeObserver(() => { placeIndicator(indicator, current, true); clipTo(current, true); }));
  resized.observe(group);
  for (const o of options) resized.observe(o);
};

// ── Tooltip: top layer; 400 ms of intent before the first one. While one was open recently it is warm:
// the next answers at once, does not scale in again, slides to the new anchor in 160 ms and cross-fades
// its text in 100. ──
let tip;
let warmUntil = 0;
let tipTimer;
let tipAt = null;
// A tooltip names what is under the pointer: a scroll moves that away, so an open one closes. A wait in course
// goes on, because the scroll that brings an anchor under a resting pointer arrives after its pointerenter; when
// the wait ends, the anchor still has to be under the pointer or hold the focus.
addEventListener('scroll', () => {
  if (tip?.matches(':popover-open')) tip.hidePopover();
}, { capture: true, passive: true });
const tooltip = (el, armed) => {
  if (!once(el, 'uiTip')) return;
  tip ??= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'tooltip', role: 'tooltip', id: 'ui-tooltip', popover: 'manual' });
  const open = () => {
    const warm = Date.now() < warmUntil;
    tip.innerHTML = '';
    const text = Object.assign(document.createElement('span'), { className: 'tooltip__text', textContent: el.dataset.tooltip });
    tip.append(text);
    if (el.dataset.shortcut) tip.append(Object.assign(document.createElement('kbd'), { className: 'key', textContent: keyLabel(el.dataset.shortcut) }));
    tip.toggleAttribute('data-warm', warm);
    if (!tip.matches(':popover-open')) tip.showPopover();
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const above = r.top - h - 8 > 4;
    const left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const top = above ? r.top - h - 8 : r.bottom + 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.style.setProperty('--_origin', above ? 'bottom center' : 'top center');
    tip.style.setProperty('--_dy', above ? '4px' : '-4px');
    if (warm && tipAt && !reduced() && (tipAt.left !== left || tipAt.top !== top)) {
      tip.animate([{ translate: `${tipAt.left - left}px ${tipAt.top - top}px` }, { translate: '0 0' }], { duration: 160, easing: EASE_OUT });
    }
    if (warm) text.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, easing: 'ease-out' });
    tipAt = { left, top };
    if (!el.hasAttribute('data-tip-auto')) el.setAttribute('aria-describedby', 'ui-tooltip');
  };
  const show = (byPointer) => {
    if (byPointer && !finePointer()) return;
    clearTimeout(tipTimer);
    if (Date.now() < warmUntil) open(); else tipTimer = setTimeout(() => el.matches(':hover, :focus-visible') && open(), 400);
  };
  const hide = () => {
    clearTimeout(tipTimer);
    if (tip.matches(':popover-open')) { warmUntil = Date.now() + 600; tip.hidePopover(); }
    el.removeAttribute('aria-describedby');
  };
  el.addEventListener('pointerenter', () => show(true));
  el.addEventListener('pointerleave', hide);
  el.addEventListener('pointerdown', hide);
  el.addEventListener('focus', () => el.matches(':focus-visible') && show(false));
  el.addEventListener('blur', hide);
  el.addEventListener('keydown', (e) => e.key === 'Escape' && hide());
  if (armed === 'pointer') show(true);
  if (armed === 'focus' && el.matches(':focus-visible')) show(false);
};

// Every action that is only an icon says what it is, and an avatar says whose it is, whether or not its markup asked
// for it and whether it was there when the page was wired or came after (a row added, a calendar drawn): the first
// pointer or focus that reaches one gives it its tooltip, from its `aria-label` or the avatar's `data-name`. The grip
// of a draggable item says how it moves. A label that the tooltip repeats is not read twice (`data-tip-auto`).
const ICON_ONLY = '.btn--icon[aria-label], .combobox__toggle[aria-label], .field__clear[aria-label], .row-menu[aria-label], .notice__close[aria-label], .toast__close[aria-label]';
const NAMED = '.avatar[data-name]:not([aria-hidden="true"]), .avatar[aria-label]';
const GRIPS = '.sortable__handle, .board__grip';
const tooltipFor = (el) => el.dataset.tooltip
  || (el.matches(GRIPS) ? messages.dragHandle : el.matches(NAMED) ? (el.dataset.name ?? el.getAttribute('aria-label')) : el.getAttribute('aria-label'));
const lazyTooltips = (life) => {
  let tabbedAt = 0;
  const arm = (e) => {
    const el = e.target.closest?.(`[data-tooltip], ${ICON_ONLY}, ${NAMED}, ${GRIPS}`);
    if (!el || el.dataset.uiTip) return;
    const focus = e.type === 'focusin';
    if (focus && performance.now() - tabbedAt > 150) return;
    const text = tooltipFor(el);
    if (!text) return;
    if (!el.dataset.tooltip) { el.dataset.tooltip = text; el.setAttribute('data-tip-auto', ''); }
    tooltip(el, focus ? 'focus' : 'pointer');
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Tab') tabbedAt = performance.now(); }, { capture: true, signal: life.signal });
  document.addEventListener('pointerover', arm, { capture: true, signal: life.signal });
  document.addEventListener('focusin', arm, { capture: true, signal: life.signal });
};

// ── Morph (Motion Primitives «morphing dialog», shared element): the panel and the thing it comes
// from are one box. On the way in the panel starts as the origin's box and grows to its own; on
// the way out it shrinks back into it. Transform and corner radius move on a spring (or on the
// curve a caller gives: the detail panel starts slowly so the eye can follow it); the content
// fades in after the box, so its stretching is never seen. Reduced motion only fades. ──
const morphOrigin = new WeakMap();
const morphing = new WeakMap();
const morphDone = new WeakMap();
const closingInto = new WeakSet();
const morph = (panel, origin, direction, { centered = false, content = [], from, duration = 340, easing } = {}) => {
  morphing.get(panel)?.forEach((a) => a.cancel());
  const made = [];
  morphing.set(panel, made);
  if (reduced()) {
    if (direction === 'in') made.push(panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' }));
    return Promise.all(made.map((a) => a.finished.catch(() => {})));
  }
  const r = from ?? origin.getBoundingClientRect();
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  const here = panel.getBoundingClientRect();
  const left = centered ? (innerWidth - w) / 2 : here.left;
  const top = centered ? (innerHeight - h) / 2 : here.top;
  const sx = r.width / w;
  const sy = r.height / h;
  const radius = parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0;
  const small = { transformOrigin: '0 0', transform: `translate(${r.left - left}px, ${r.top - top}px) scale(${sx}, ${sy})`, borderRadius: `${radius / sx}px / ${radius / sy}px` };
  const full = { transformOrigin: '0 0', transform: 'none', borderRadius: `${radius}px` };
  if (direction === 'in') {
    made.push(panel.animate([small, full], { duration, easing: easing ?? spring() }));
    made.push(panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, easing: 'ease-out' }));
    for (const c of content) made.push(c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: Math.round(duration * 0.35), easing: 'ease-out', fill: 'backwards' }));
  } else {
    made.push(panel.animate([full, small], { duration: 220, easing: EASE_OUT, fill: 'forwards' }));
    made.push(panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, delay: 120, easing: 'ease-out', fill: 'both' }));
    for (const c of content) made.push(c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 80, easing: 'ease-out', fill: 'forwards' }));
  }
  return Promise.all(made.map((a) => a.finished.catch(() => {})));
};

// ── Dialog: showModal; a click on the backdrop —outside the box— closes it, never one on its padding;
// a `[data-close]` inside closes it (the X of its header) ──
const dialogTrigger = (trigger) => {
  if (!once(trigger, 'uiDialog')) return;
  const dialog = document.getElementById(trigger.dataset.dialog);
  if (!dialog) return;
  // The dialog grows from the button that opened it: the origin is the trigger's center, measured
  // against the dialog's own box (a modal is centered in the viewport). With `data-morph` on the
  // trigger —a card, a row— it is the trigger's box itself that becomes the dialog, and goes back.
  trigger.addEventListener('click', () => {
    dialog.showModal();
    if (trigger.hasAttribute('data-morph')) {
      dialog.setAttribute('data-morph', '');
      morphOrigin.set(dialog, trigger);
      morph(dialog, trigger, 'in', { centered: true, content: [...dialog.querySelectorAll('.dialog__body')] });
      return;
    }
    morphOrigin.delete(dialog);
    morphing.get(dialog)?.forEach((a) => a.cancel());
    dialog.removeAttribute('data-morph');
    const t = trigger.getBoundingClientRect();
    const x = t.left + t.width / 2 - (innerWidth - dialog.offsetWidth) / 2;
    const y = t.top + t.height / 2 - (innerHeight - dialog.offsetHeight) / 2;
    dialog.style.setProperty('--_origin', `${Math.round(x)}px ${Math.round(y)}px`);
    if (dialog.classList.contains('drawer')) enterSections(dialog); else enterFields(dialog);
  });
  if (!once(dialog, 'uiDialogBox')) return;
  dialog.addEventListener('close', () => {
    const from = morphOrigin.get(dialog);
    morphOrigin.delete(dialog);
    // Into a box of another shape (a table) the whole dialog's content leaves first, so no text is seen stretched.
    const content = closingInto.has(dialog) ? [...dialog.children] : [...dialog.querySelectorAll('.dialog__body')];
    closingInto.delete(dialog);
    if (from?.isConnected && from.getClientRects().length) morphDone.set(dialog, morph(dialog, from, 'out', { centered: true, content }));
    else if (dialog.hasAttribute('data-morph') && !reduced()) morphing.set(dialog, [dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: EASE_OUT, fill: 'both' })]);
  });
  // A click on the backdrop closes a dialog; an alert dialog asks for an answer, so it only beats once.
  dialog.addEventListener('click', (e) => {
    const r = dialog.getBoundingClientRect();
    const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (e.target !== dialog || !outside) return;
    if (dialog.getAttribute('role') !== 'alertdialog') { dialog.close(); return; }
    if (reduced()) dialog.animate([{ opacity: 1 }, { opacity: 0.85 }, { opacity: 1 }], { duration: 220, easing: EASE_OUT });
    else dialog.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.015)' }, { transform: 'scale(1)' }], { duration: 220, easing: EASE_OUT });
  });
};

// A dialog that closes into something other than what opened it (the first invoice goes into the table it joins):
// it shrinks into `target` and the promise settles when it is gone.
export const closeInto = (dialog, target) => new Promise((done) => {
  morphOrigin.set(dialog, target);
  closingInto.add(dialog);
  dialog.setAttribute('data-morph', '');
  dialog.addEventListener('close', () => queueMicrotask(() => (morphDone.get(dialog) ?? Promise.resolve()).then(done)), { once: true });
  dialog.close();
});

// ── A button that runs something: loading only after 150 ms, then success or error ──
export const runAction = async (button, work) => {
  if (button.dataset.state) return;
  const slow = setTimeout(() => { button.dataset.state = 'loading'; }, 150);
  button.setAttribute('aria-busy', 'true');
  try {
    await work();
    clearTimeout(slow);
    button.dataset.state = 'success';
  } catch {
    clearTimeout(slow);
    button.dataset.state = 'error';
  } finally {
    button.removeAttribute('aria-busy');
    setTimeout(() => { delete button.dataset.state; }, 1400);
  }
};

// ── Field: validated on leaving it (an empty required one is invalid too); once invalid, re-checked
// while typing; the error opens with an animated height; a counter shows the characters used against
// `maxlength` ──
const field = (wrapper) => {
  if (!once(wrapper, 'uiField')) return;
  const input = wrapper.querySelector('input, select, textarea');
  const error = wrapper.querySelector('.field__error');
  const clear = wrapper.querySelector('.field__clear');
  const counter = wrapper.querySelector('.field__counter');
  if (!input) return;
  const errorText = error && (error.firstElementChild ?? error.appendChild(document.createElement('span')));
  if (error) { error.id ||= `${input.id || uid('f')}-error`; input.setAttribute('aria-describedby', error.id); }
  const check = () => {
    if (!input.value && !input.required) { delete wrapper.dataset.state; input.removeAttribute('aria-invalid'); return; }
    const ok = input.checkValidity();
    const was = wrapper.dataset.state;
    wrapper.dataset.state = ok ? 'valid' : 'invalid';
    // The check draws itself only when a field that was wrong becomes right: while it is wrong the stroke is
    // hidden, and taking `data-redo` off is what draws it.
    if (!ok) wrapper.setAttribute('data-redo', '');
    else if (was === 'invalid') { void wrapper.offsetWidth; wrapper.removeAttribute('data-redo'); }
    input.setAttribute('aria-invalid', String(!ok));
    if (errorText && !ok) errorText.textContent = input.validity.customError ? input.validationMessage : (input.dataset.error ?? input.validationMessage);
  };
  if (input.type !== 'search') {
    input.addEventListener('blur', check);
    input.addEventListener('input', () => wrapper.dataset.state === 'invalid' && check());
  }
  if (counter) {
    const update = () => {
      const max = input.maxLength;
      counter.textContent = max > 0 ? `${input.value.length} / ${max}` : String(input.value.length);
      counter.toggleAttribute('data-near', max > 0 && input.value.length >= max * 0.9);
    };
    input.addEventListener('input', update);
    update();
  }
  clear?.addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.type === 'search' && input.value) { e.stopPropagation(); clear?.click(); } });
};

// ── Inline-editable value: Enter or blur saves (optimistic), Escape cancels ──
const editable = (el) => {
  if (!once(el, 'uiEditable')) return;
  const value = el.querySelector('.editable__value');
  const start = () => {
    if (el.querySelector('input')) return;
    const input = Object.assign(document.createElement('input'), { value: value.textContent });
    input.setAttribute('aria-label', el.dataset.label ?? messages.edit);
    value.hidden = true;
    el.prepend(input);
    input.focus();
    input.select();
    const finish = async (save) => {
      if (!input.isConnected) return;
      const next = input.value.trim();
      input.remove();
      value.hidden = false;
      el.focus();
      if (!save || next === value.textContent) return;
      const previous = value.textContent;
      value.textContent = next;
      el.dataset.state = 'saving';
      try {
        await (el.onsave?.(next) ?? new Promise((r) => setTimeout(r, 500)));
        el.dataset.state = 'saved';
        setTimeout(() => { if (el.dataset.state === 'saved') delete el.dataset.state; }, 1600);
      } catch {
        value.textContent = previous;
        delete el.dataset.state;
        toast(messages.saveFailed, { tone: 'error' });
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  };
  el.tabIndex = 0;
  el.addEventListener('click', start);
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === 'F2') && e.target === el) { e.preventDefault(); start(); } });
};

// ── Skeleton: shown only after 200 ms, and then for at least 300 ms; the content swaps in with a fade.
// Every sheen band is started at the timeline's origin (`alignSheen`, core.js), so all the skeletons on the
// page sweep in the same phase, the ones that were there and the ones a load adds. ──
export const syncSheen = alignSheen;
// Once the data is there the skeleton goes in 120 ms and what replaces it arrives piece by piece (rows: blur,
// 4 px, 20 ms apart). A skeleton that is still there after 8 s stops sheening and says so, with a
// shimmering label.
const stillLoading = (container) => {
  const note = `<span role="status">${shimmerHtml(messages.stillLoading)}</span>`;
  return container.tagName === 'TBODY' ? `<tr class="table__skeleton"><td colspan="${container.closest('table')?.tHead?.rows[0]?.cells.length ?? 1}">${note}</td></tr>` : note;
};
export const withSkeleton = async (container, skeletonHTML, load) => {
  let shownAt = 0;
  const timer = setTimeout(() => { container.innerHTML = skeletonHTML; container.setAttribute('aria-busy', 'true'); shownAt = performance.now(); initLife(container); skeletonBones(container); syncSheen(container); }, 200);
  const slow = setTimeout(() => { if (shownAt) { container.innerHTML = stillLoading(container); initLife(container); } }, 8000);
  try {
    const html = await load();
    clearTimeout(timer);
    clearTimeout(slow);
    if (shownAt) {
      await new Promise((r) => setTimeout(r, Math.max(0, 300 - (performance.now() - shownAt))));
      if (!reduced()) await Promise.all([...container.children].map((c) => c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: EASE_OUT, fill: 'forwards' }).finished.catch(() => {})));
    }
    container.innerHTML = html;
    init(container);
    enterRows(container);
  } finally {
    clearTimeout(timer);
    clearTimeout(slow);
    container.removeAttribute('aria-busy');
  }
};

// ── Sliding numbers: every figure that changes (`[data-sliding][data-value]`, formatted by `data-format`, an
// Intl.NumberFormat as JSON) is the Sliding Number port of motion/: each digit a column that slides to its
// value by the shortest way round. `data-ticker` makes the first appearance count up from zero. A figure that is
// `data-slot` is the Slot Text port instead: every character a reel that spins to its value and lands left to right;
// it is for the big figures of a tile, where the spin is the event. ──
const numbers = new WeakMap();
const reelsOf = (el, value, counting) => {
  const intl = new Intl.NumberFormat(locale(el), JSON.parse(el.dataset.format ?? '{}'));
  const reels = slotText(el, { value: counting ? 0 : value, format: (n) => intl.format(n) });
  const handle = { value: counting ? 0 : value, set(next) { handle.value = next; reels.set(next); }, destroy: () => reels.destroy() };
  if (counting) {
    // The figure says its value from the start, while the reels still show the zero they spin from once it is on screen.
    el.querySelector(':scope > .ar-sr').textContent = intl.format(value);
    const seen = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) return; seen.disconnect(); handle.set(Number(el.dataset.value)); });
    seen.observe(el);
  }
  return handle;
};
const slidingOf = (el, value, counting) => {
  let handle = numbers.get(el);
  if (!handle) {
    handle = el.hasAttribute('data-slot') ? reelsOf(el, value, counting) : slidingNumber(el, { value, format: JSON.parse(el.dataset.format ?? '{}'), ...(counting ? { from: 0, inView: true } : {}) });
    numbers.set(el, handle);
  }
  return handle;
};
export const setNumber = (el, value) => {
  const previous = el.dataset.value === undefined ? null : Number(el.dataset.value);
  el.dataset.value = String(value);
  // A figure that counts up on entering, in a view that was never shown, is mounted by `activate` from this value.
  if (!numbers.has(el) && el.hasAttribute('data-ticker') && !el.getClientRects().length) return;
  const handle = slidingOf(el, previous ?? value, false);
  if (handle.value !== value) handle.set(value);
  // A figure that has a good direction (`data-good="up|down"`) and that the user changed flashes the tone of
  // what that did behind its digits: success when it went the good way, danger when it did not.
  if (previous !== null && previous !== value && el.dataset.good && el.getClientRects().length) {
    const { tone } = describeChange(value, previous, { good: el.dataset.good, mode: 'count' });
    if (tone !== 'neutral') flashValue(el, tone);
  }
};

// ── Delta: the change of a figure against its previous period, computed from the data. `trend` is
// the direction, `tone` says whether that direction is good (`good` is the direction that is). The
// sparkline of the same figure (`spark`) takes the tone, so a line and its chip never disagree. ──
export const setDelta = (el, current, previous, { spark, zeroText, ...options } = {}) => {
  const { trend, tone, text: described } = describeChange(current, previous, { ...options, el });
  // A figure that is at zero says so in words when the screen asks it to (the overdue ones: «al día»).
  const text = zeroText && current === 0 ? zeroText : described;
  const changed = el.dataset.trend !== undefined && el.textContent !== text;
  el.dataset.trend = trend;
  el.dataset.tone = tone;
  el.textContent = text;
  if (changed) swapIn(el, trend === 'down' ? -1 : 1);
  if (spark) spark.dataset.tone = tone;
};

// ── A status badge changes where it is: the tone eases (CSS), the label swaps and, when the new one is wider, the
// pill grows from its left edge in 220 ms while the text stays as it is. ──
export const setBadge = (badge, { tone, label, plain = false }) => {
  const changed = badge.textContent.trim() !== label;
  const before = badge.getBoundingClientRect().width;
  badge.toggleAttribute('data-plain', plain);
  if (tone && !plain) badge.dataset.tone = tone; else badge.removeAttribute('data-tone');
  let text = badge.querySelector(':scope > .badge__label');
  if (!text) { badge.textContent = ''; text = badge.appendChild(Object.assign(document.createElement('span'), { className: 'badge__label' })); }
  text.textContent = label;
  if (!changed || !badge.getClientRects().length) return;
  swapIn(text);
  const after = badge.getBoundingClientRect().width;
  if (!reduced() && after > before + 1) badge.animate([{ clipPath: `inset(0 ${after - before}px 0 0 round 999px)` }, { clipPath: 'inset(0 0 0 0 round 999px)' }], { duration: 220, easing: spring() });
};

// ── Sparkline: the trend of a series in a 72 × 24 box, drawn with a path that morphs when the data
// changes (`d` is a CSS property, so it transitions); its area is a gradient of the line's color. ──
const SPARK_W = 72;
const SPARK_H = 24;
export const setSpark = (svg, values, life = forever) => {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i) => (values.length < 2 ? SPARK_W / 2 : 2 + (i * (SPARK_W - 4)) / (values.length - 1));
  const y = (v) => (hi === lo ? SPARK_H / 2 : SPARK_H - 3 - ((v - lo) / (hi - lo)) * (SPARK_H - 6));
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(values.length - 1).toFixed(1)},${SPARK_H}L${x(0).toFixed(1)},${SPARK_H}Z`;
  if (!svg.firstElementChild) {
    const id = uid('spark-');
    svg.setAttribute('viewBox', `0 0 ${SPARK_W} ${SPARK_H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity="0.18"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path class="spark__area" fill="url(#${id})"/><path class="spark__line"/>`;
  }
  // A flat series, or fewer than three points, has no area to shade: the line alone.
  svg.toggleAttribute('data-line-only', values.length < 3 || hi === lo);
  for (const [selector, d] of [['.spark__area', area], ['.spark__line', line]]) {
    const path = svg.querySelector(selector);
    path.setAttribute('d', d);
    path.style.d = `path("${d}")`;
  }
  svg.style.setProperty('--_len', String(Math.ceil(svg.querySelector('.spark__line').getTotalLength()) + 2));
  placeEnd(svg, x(values.length - 1), y(values.at(-1)), SPARK_W, SPARK_H, life);
};
const spark = (svg, life) => { if (once(svg, 'uiSpark')) setSpark(svg, JSON.parse(svg.dataset.spark), life); };

// What appears with a view: the numbers roll to their values, the charts and rings draw. Called by
// `init` and by a screen when it shows a view that was hidden; a flush first, so the change
// transitions instead of being the first style the browser sees.
export const activate = (root = document) => {
  void (root.nodeType === 9 ? document.body : root).offsetWidth;
  root.querySelectorAll('[data-sliding][data-value]').forEach((el) => {
    if (!el.getClientRects().length || numbers.has(el)) return;
    slidingOf(el, Number(el.dataset.value), el.hasAttribute('data-ticker'));
  });
  root.querySelectorAll('.chart, .ring, svg.spark').forEach((c) => {
    if (!c.getClientRects().length || c.hasAttribute('data-drawn')) return;
    c.querySelectorAll('.chart__line').forEach((p) => p.style.setProperty('--_len', p.getTotalLength()));
    c.setAttribute('data-drawn', '');
    // Once drawn: the current point sends out its rings, and the end of a sparkline settles and pulses.
    if (c.matches('.chart[data-line]')) setTimeout(() => ping(c), 480);
    if (c.matches('svg.spark')) setTimeout(() => pulseSpark(c), 720);
  });
  syncSheen(root);
};

// ── Table ──
// One current row (aria-current): click, J/K or arrows move it without animation (and fire
// `current`); Enter opens it. A table with a `.all-check` in its header is multi-select: `.row-check`
// boxes set `aria-selected`, Space or X toggle the current row, and the table fires `selection` with
// the picked rows; a click on a row also fires `open`. Without it a click selects one row
// (aria-selected). Rows are delegated, so rows added, removed or swapped by a skeleton need no
// wiring; a mutation observer keeps the roving tab stop and the selection honest. `el.choose(row)`
// moves the current row from code. With `data-compact` on the table (a split view beside it) the
// columns whose header carries `data-low` give way, so every other column stays whole.
const liveRow = (r) => !r.hidden && !r.classList.contains('table__empty') && !r.classList.contains('table__skeleton') && !r.hasAttribute('data-leaving');
const table = (el, life = forever) => {
  if (!once(el, 'uiTable')) return;
  const body = el.tBodies[0];
  const all = el.querySelector('thead .all-check');
  const rows = () => [...body.rows].filter(liveRow);
  // The keyboard's row is lit by one accent bar at the table's edge that slides from row to row (120 ms,
  // translateY); it appears in place the first time and goes when the current row is gone.
  const wrap = el.closest('.table-wrap');
  const cursor = wrap ? Object.assign(document.createElement('span'), { className: 'row-cursor' }) : null;
  cursor?.setAttribute('aria-hidden', 'true');
  if (cursor) wrap.append(cursor);
  let cursorLive = false;
  const putCursor = (row, instant) => {
    const at = row && cursor ? offsetIn(row, wrap) : null;
    if (!at) { cursor?.removeAttribute('data-on'); cursorLive = false; return; }
    const still = instant || !cursorLive;
    cursor.style.height = `${row.offsetHeight}px`;
    if (still) cursor.style.transition = 'none';
    cursor.style.transform = `translateY(${at[1]}px)`;
    if (still) { void cursor.offsetWidth; cursor.style.transition = ''; }
    cursor.setAttribute('data-on', '');
    cursorLive = true;
  };
  const syncCursor = () => {
    const current = body.querySelector('tr[aria-current="true"]');
    putCursor(current && liveRow(current) ? current : null, true);
  };
  const rove = (prefer) => {
    const list = rows();
    const keep = list.includes(prefer) ? prefer : (list.find((r) => r.getAttribute('aria-current') === 'true') ?? list[0]);
    for (const r of body.rows) r.tabIndex = r === keep ? 0 : -1;
  };
  const sync = () => {
    const list = rows();
    const picked = list.filter((r) => r.getAttribute('aria-selected') === 'true');
    if (all) { all.checked = list.length > 0 && picked.length === list.length; all.indeterminate = picked.length > 0 && picked.length < list.length; }
    el.dispatchEvent(new CustomEvent('selection', { detail: { rows: picked } }));
  };
  const mark = (row, on) => { row.setAttribute('aria-selected', String(on)); const c = row.querySelector('.row-check'); if (c) c.checked = on; };
  const choose = (row) => {
    if (!all) for (const r of rows()) r.setAttribute('aria-selected', String(r === row));
    for (const r of body.rows) r.removeAttribute('aria-current');
    row.setAttribute('aria-current', 'true');
    rove(row);
    putCursor(row, false);
    row.focus();
    el.dispatchEvent(new CustomEvent('current', { detail: row }));
  };
  el.choose = choose;
  const lows = () => [...el.querySelectorAll('thead th')].map((th, i) => (th.hasAttribute('data-low') ? i : -1)).filter((i) => i >= 0);
  const compacted = () => el.hasAttribute('data-compact') || el.hasAttribute('data-narrow');
  // A card too narrow for the table's minimum width gives up its low-priority columns before it scrolls (a
  // phone shows the table as cards instead, which keep every field).
  const narrow = () => {
    const cards = el.hasAttribute('data-cards') && matchMedia('(max-width: 640px)').matches;
    const need = parseFloat(getComputedStyle(wrap).getPropertyValue('--table-min')) || 640;
    el.toggleAttribute('data-narrow', !cards && lows().length > 0 && wrap.clientWidth < need);
  };
  const compact = () => {
    const on = compacted();
    const hidden = lows();
    el.querySelectorAll('colgroup col').forEach((c, i) => c.toggleAttribute('data-low-hidden', on && hidden.includes(i)));
    for (const row of el.rows) for (const i of hidden) row.cells[i]?.toggleAttribute('data-low-hidden', on);
  };
  // A table that becomes cards on a phone (`data-cards`) writes each column's header into its cells;
  // a column whose header says what it is (`th[data-cell]`: id, title, status, due, amount…) writes
  // that role too, which is what lays a card out as lines instead of label: value pairs.
  const label = () => {
    if (!el.hasAttribute('data-cards')) return;
    const heads = [...el.querySelectorAll('thead th')].map((th) => [th.querySelector('.visually-hidden') ? '' : th.textContent.trim(), th.dataset.cell]);
    for (const row of body.rows) {
      if (!liveRow(row)) continue;
      [...row.cells].forEach((c, i) => {
        if (!c.hasAttribute('data-label')) c.setAttribute('data-label', heads[i]?.[0] ?? '');
        if (heads[i]?.[1] && !c.hasAttribute('data-cell')) c.setAttribute('data-cell', heads[i][1]);
      });
    }
  };
  rove();
  label();
  // The column the rows are sorted by carries `data-sorted` on its head and its cells, and a row that comes in is marked too
  // (the stylesheet tints the column from head to foot).
  const markSorted = () => {
    const sorted = el.querySelector('th[aria-sort="ascending"], th[aria-sort="descending"]');
    for (const th of el.querySelectorAll('th[aria-sort]')) th.toggleAttribute('data-sorted', th === sorted);
    for (const row of body.rows) if (!row.matches('.table__empty, .table__skeleton')) for (const cell of row.cells) cell.toggleAttribute('data-sorted', !!sorted && cell.cellIndex === sorted.cellIndex);
  };
  life.watch(new MutationObserver(() => { rove(); label(); if (all) sync(); if (compacted()) compact(); syncCursor(); markSorted(); })).observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-leaving'] });
  if (wrap) life.watch(new ResizeObserver(() => { narrow(); syncCursor(); })).observe(wrap);
  life.watch(new MutationObserver(compact)).observe(el, { attributes: true, attributeFilter: ['data-compact', 'data-narrow'] });
  el.addEventListener('click', (e) => {
    const row = e.target.closest('tbody tr');
    if (!row || !rows().includes(row) || e.target.closest('button, a, input, label, select')) return;
    choose(row);
    if (all) el.dispatchEvent(new CustomEvent('open', { detail: row }));
  });
  el.addEventListener('change', (e) => {
    if (all && e.target === all) { for (const r of rows()) mark(r, all.checked); sync(); }
    else if (e.target.classList.contains('row-check')) { mark(e.target.closest('tr'), e.target.checked); sync(); }
  });
  el.addEventListener('keydown', (e) => {
    const list = rows();
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); choose(list[Math.min(list.length - 1, i + 1)]); }
    if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); choose(list[Math.max(0, i - 1)]); }
    if (e.key === 'Enter') el.dispatchEvent(new CustomEvent('open', { detail: list[i] }));
    if (all && (e.key === ' ' || e.key === 'x')) { e.preventDefault(); mark(list[i], list[i].getAttribute('aria-selected') !== 'true'); sync(); }
  });
  // Sortable columns: `th[aria-sort]` holding a `.th-sort` button. The rows reorder with FLIP, the
  // column widths do not move; a cell sorts by its `data-sort`, else by its text (a number when the
  // column is `.num`).
  el.querySelectorAll('th[aria-sort] .th-sort').forEach((button) => button.addEventListener('click', () => {
    const th = button.closest('th');
    const col = th.cellIndex;
    const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
    for (const other of el.querySelectorAll('th[aria-sort]')) other.setAttribute('aria-sort', other === th ? dir : 'none');
    markSorted();
    const numeric = th.classList.contains('num');
    const key = (r) => {
      const cell = r.cells[col];
      const raw = cell.dataset.sort ?? cell.textContent.trim();
      const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
      return (numeric || cell.dataset.sort !== undefined) && Number.isFinite(n) ? n : String(raw).toLowerCase();
    };
    const empty = body.querySelector('.table__empty');
    const sorted = [...body.rows].filter((r) => r !== empty && !r.hasAttribute('data-leaving')).sort((a, b) => { const x = key(a); const y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'ascending' ? 1 : -1); });
    flip(rows(), () => { for (const r of sorted) body.insertBefore(r, empty); }, 240, css('--ease-flip') || 'cubic-bezier(0.2, 0.8, 0.2, 1)');
    el.dispatchEvent(new CustomEvent('sort', { detail: { column: col, direction: dir } }));
  }));
};

// A skeleton for a table, built from its header so every cell keeps its column's alignment: figures
// on the right edge, a box under the checkbox, the row's menu at the end.
export const skeletonRows = (tableEl, count = 8) => {
  const widths = ['62%', '78%', '54%', '70%', '46%', '66%'];
  const cell = (th, i) => {
    if (th.querySelector('.all-check')) return '<td><div class="skeleton skeleton--box"></div></td>';
    if (th.querySelector('.visually-hidden')) return '<td class="row-actions"><div class="skeleton skeleton--end"></div></td>';
    return `<td${th.classList.contains('num') ? ' class="num"' : ''}><div class="skeleton" style="--w: ${widths[i % widths.length]}"></div></td>`;
  };
  return `<tr class="table__skeleton">${[...tableEl.querySelectorAll('thead th')].map(cell).join('')}</tr>`.repeat(count);
};

// Filtering a table: rows are hidden, never removed, so the colgroup keeps every column where it
// was; when none matches, the `tr.table__empty` row (message and action) takes the place. Returns
// how many rows are visible, for the toolbar's count.
export const filterRows = (tableEl, matches) => {
  const body = tableEl.tBodies[0];
  let visible = 0;
  for (const row of body.rows) {
    if (row.classList.contains('table__empty') || row.hasAttribute('data-leaving')) continue;
    row.hidden = !matches(row);
    if (!row.hidden) visible++;
  }
  const empty = body.querySelector('.table__empty');
  if (empty) empty.hidden = visible > 0;
  return visible;
};

// A new event of a history comes in at the top (opacity and 8 px, on the list spring) and the ones that were
// there make room (FLIP, 240 ms); with reduced motion it fades.
export const prependEvent = (list, item) => {
  flip([...list.children], () => list.prepend(item));
  if (reduced()) { fade(item); return item; }
  item.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: ms('--motion-list', 320), easing: css('--spring-list') || EASE_OUT });
  return item;
};

// A row enters from above and the others make room; it leaves fading out and the others close the gap.
export const addRow = (tableEl, html, { at = 0 } = {}) => {
  const body = tableEl.tBodies[0];
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  const row = tpl.content.firstElementChild;
  flip([...body.rows].filter(liveRow), () => body.insertBefore(row, body.rows[at] ?? body.querySelector('.table__empty')));
  row.tabIndex = -1;
  initLife(row);
  tooltips(row);
  // It is uncovered from its top edge; once it is there it glows once in the accent, a brief arrival, and
  // the glow goes (with reduced motion the row fades in and the glow lasts 300 ms).
  row.setAttribute('data-entering', '');
  row.addEventListener('animationend', () => {
    row.removeAttribute('data-entering');
    row.setAttribute('data-arriving', '');
    row.addEventListener('animationend', (e) => { if (e.animationName === 'arrival') row.removeAttribute('data-arriving'); });
  }, { once: true });
  return row;
};
// The rows below a removed one start their slide lower than where the box now ends; the box keeps its height
// until they have arrived, so the slide never lengthens what it can scroll.
const heldBoxes = new WeakMap();
const hold = (box, change) => {
  const count = heldBoxes.get(box) ?? 0;
  const before = box.getBoundingClientRect().height;
  heldBoxes.set(box, count + 1);
  const moved = change();
  // Slides add up when one comes in the middle of another: the rows start further below than the box is tall, and the box does
  // not know it until the next frame. What is held is the reach of the slides at their start (a row's place plus how far below
  // it starts), so a removal never lengthens what the box can scroll.
  const tableTop = box.querySelector('table')?.offsetTop ?? 0;
  const reach = Math.max(0, ...moved.map((a) => {
    const row = a.effect.target;
    const dy = parseFloat(/translate\([^,]*,\s*(-?[\d.]+)px\)/.exec(a.effect.getKeyframes()[0].transform ?? '')?.[1] ?? '0');
    return tableTop + row.offsetTop + row.offsetHeight + Math.max(0, dy);
  }));
  const needed = Math.ceil(Math.max(before, box.scrollHeight, reach));  if (!count || needed > parseFloat(box.style.minHeight || '0')) box.style.minHeight = `${needed}px`;
  // A later change replaces a slide with another that starts where it was drawn: the box stays held until the last one ends.
  const settle = async (anims) => {
    while (anims.length) {
      await Promise.allSettled(anims.map((a) => a.finished));
      anims = anims.map((a) => flying(a.effect.target)).filter(Boolean);
    }
  };
  settle(moved).then(() => {
    const left = heldBoxes.get(box) - 1;
    if (left) { heldBoxes.set(box, left); return; }
    heldBoxes.delete(box);
    box.style.minHeight = '';
  });
};
export const removeRow = (row) => new Promise((done) => {
  if (reduced()) { row.remove(); done(); return; }
  const body = row.parentElement;
  const finish = () => {
    if (row.isConnected) {
      const peers = [...body.rows].filter((r) => r !== row && liveRow(r));
      const box = row.closest('.table-wrap');
      const slide = () => flip(peers, () => row.remove());
      if (box) hold(box, slide); else slide();
    }
    done();
  };
  row.setAttribute('data-leaving', '');
  row.addEventListener('transitionend', (e) => { if (e.target === row) finish(); });
  setTimeout(finish, 260);
});

// ── Peek: a detail panel that is the row that opened it, grown (and shrunk back into it on close);
// see `morph`. Inside a `.split` (the table's card and the panel side by side) it takes its own
// column, the table gives up its low-priority columns and nothing is covered; without one it
// floats. It grows from the row's box as it was before the split opened, slowly at first so the eye
// follows it. Reduced motion fades it. ──
const peekOrigin = new WeakMap();
const peekTicket = new WeakMap();
const PEEK_EASE = 'cubic-bezier(0.45, 0, 0.15, 1)';
const splitOf = (panel) => (panel.parentElement?.classList.contains('split') ? panel.parentElement : null);
const setSplit = (panel, open) => {
  const split = splitOf(panel);
  if (!split) return;
  split.toggleAttribute('data-open', open);
  split.querySelector('table.table')?.toggleAttribute('data-compact', open);
};
export const openPeek = (panel, origin) => {
  panel.getAnimations().forEach((a) => a.cancel());
  const from = origin?.getBoundingClientRect();
  panel.hidden = false;
  peekOrigin.set(panel, origin);
  peekTicket.set(panel, (peekTicket.get(panel) ?? 0) + 1);
  setSplit(panel, true);
  if (!origin) { panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' }); return; }
  morph(panel, origin, 'in', { content: [...panel.children], from, duration: 480, easing: PEEK_EASE });
};
export const closePeek = (panel) => new Promise((done) => {
  if (panel.hidden) { done(); return; }
  const origin = peekOrigin.get(panel);
  const ticket = peekTicket.get(panel);
  // A panel opened again while it was leaving stays open.
  const finish = () => { if (peekTicket.get(panel) === ticket) { panel.hidden = true; panel.getAnimations().forEach((a) => a.cancel()); setSplit(panel, false); } done(); };
  if (reduced() || !origin?.isConnected || !origin.getClientRects().length) {
    panel.getAnimations().forEach((a) => a.cancel());
    panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced() ? 100 : 160, easing: EASE_OUT }).onfinish = finish;
    return;
  }
  morph(panel, origin, 'out', { content: [...panel.children] }).then(finish);
});

// ── Copy: `data-copy` holds the text. The copy icon turns into a drawn check and the label says it for 1.6 s;
// a second press restarts the count. ──
const copyButton = (button) => {
  if (!once(button, 'uiCopy')) return;
  const text = button.querySelector('.btn__text');
  const rest = text?.textContent ?? '';
  let timer = 0;
  button.addEventListener('click', () => {
    navigator.clipboard?.writeText(button.dataset.copy).catch(() => {});
    button.setAttribute('data-copied', '');
    if (text) text.textContent = button.dataset.copiedLabel ?? rest;
    clearTimeout(timer);
    timer = setTimeout(() => { button.removeAttribute('data-copied'); if (text) text.textContent = rest; }, 1600);
  });
};

// ── Hold to confirm: an action that cannot be undone fills while it is held (pointer, Space or Enter) and runs when
// the fill is full, says so in a toast and fires `held`; let go earlier and it drains. Reduced motion keeps the hold
// and loses only the fill's travel. What can be undone is not held: it runs on a click and offers «Deshacer». ──
const holdButton = (button) => {
  if (!once(button, 'uiHold')) return;
  const fill = button.querySelector('.btn__hold');
  const start = (e) => {
    if (button.hasAttribute('data-holding') || (e.type === 'pointerdown' && e.button !== 0)) return;
    if (e.type === 'keydown') { if (e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return; e.preventDefault(); }
    button.setAttribute('data-holding', '');
  };
  const stop = () => button.removeAttribute('data-holding');
  fill?.addEventListener('transitionend', (e) => {
    if (e.propertyName !== 'transform' || !button.hasAttribute('data-holding')) return;
    stop();
    button.setAttribute('data-held', '');
    endOf(button, 'data-held', 400);
    toast(button.dataset.holdLabel ?? '', { tone: 'success' });
    button.dispatchEvent(new CustomEvent('held', { bubbles: true }));
  });
  button.addEventListener('pointerdown', start);
  button.addEventListener('keydown', start);
  for (const type of ['pointerup', 'pointerleave', 'pointercancel', 'keyup', 'blur']) button.addEventListener(type, stop);
};

// ── Accordion: a trigger and its panel. The open item is one unit: its surface covers the trigger and the
// panel. The height is the final one from the first frame; the surfaces scale to it, the items below move
// to their place and the panel is shown through a clip that grows or withdraws, all with transform and
// clip-path (the content fades and rises by its own transition, life.css). ──
const accordion = (root) => {
  if (!once(root, 'uiAccordion')) return;
  const items = [...root.querySelectorAll('.accordion__item')];
  const triggers = [...root.querySelectorAll('.accordion__trigger')];
  const panelOf = (t) => document.getElementById(t.getAttribute('aria-controls'));
  let anims = [];
  const stop = () => { for (const a of anims) a.cancel(); anims = []; };
  const set = (t, open) => {
    t.setAttribute('aria-expanded', String(open));
    const panel = panelOf(t);
    panel.toggleAttribute('data-open', open);
    panel.inert = !open;
    t.closest('.accordion__item').toggleAttribute('data-open', open);
  };
  // `changes` are the [trigger, open] pairs of one click; with motion, what is on screen is measured first and
  // the layout is changed to its final state before the surfaces, the items and the panels travel to it.
  const change = (changes) => {
    const move = !reduced() && root.getClientRects().length > 0;
    const changed = new Set(changes.map(([t]) => t.closest('.accordion__item')));
    const was = move && {
      root: surfaceRect(root),
      items: new Map(items.map((i) => [i, changed.has(i) ? surfaceRect(i) : rectOf(i)])),
      triggers: new Map(changes.map(([t]) => [t, rectOf(t)])),
      panels: new Map(changes.map(([t]) => [t, visibleRect(panelOf(t))])),
    };
    if (move) stop();
    for (const [t, open] of changes) {
      const panel = panelOf(t);
      set(t, open);
      if (move) panel.toggleAttribute('data-leaving', !open && was.panels.get(t).height > 0);
    }
    if (!move) return;
    const timing = { duration: ms('--duration-slow', 280), easing: EASE_OUT };
    anims = [flipSurface(root, was.root, timing)];
    for (const item of items) anims.push(changed.has(item) ? flipSurface(item, was.items.get(item), timing) : flipMove(item, was.items.get(item), timing));
    for (const [t, open] of changes) {
      const panel = panelOf(t);
      const at = rectOf(panel);
      const shift = was.triggers.get(t).top - rectOf(t).top;
      anims.push(flipMove(t, was.triggers.get(t), timing));
      if (open) anims.push(flipClip(panel, { left: at.left, top: at.top + shift, width: at.width, height: 0 }, undefined, timing));
      else if (panel.hasAttribute('data-leaving')) anims.push(flipClip(panel, was.panels.get(t), { left: at.left, top: at.top, width: at.width, height: 0 }, { ...timing, fill: 'forwards' }));
    }
    anims = anims.filter(Boolean);
    const own = anims;
    Promise.all(own.map((a) => a.finished)).then(() => {
      if (anims !== own) return;
      anims = [];
      for (const [t, open] of changes) if (!open) { for (const a of panelOf(t).getAnimations()) a.cancel(); panelOf(t).removeAttribute('data-leaving'); }
    }, () => {});
  };
  for (const t of triggers) {
    set(t, t.getAttribute('aria-expanded') === 'true');
    t.addEventListener('click', () => {
      const open = t.getAttribute('aria-expanded') !== 'true';
      const changes = [[t, open]];
      if (open && root.hasAttribute('data-single')) for (const o of triggers) if (o !== t && o.getAttribute('aria-expanded') === 'true') changes.push([o, false]);
      change(changes);
    });
  }
};

// ── Interactive card: toggles aria-pressed ──
const card = (el) => {
  if (!once(el, 'uiCard')) return;
  const toggle = () => el.setAttribute('aria-pressed', String(el.getAttribute('aria-pressed') !== 'true'));
  el.addEventListener('click', toggle);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
};

// ── Sortable list: drag by the handle; Space grabs and the arrows move with the keyboard (drag.js) ──
const sortable = (list) => {
  if (!once(list, 'uiSortable')) return;
  dragSort(list, { item: '.sortable__item', handle: '.sortable__handle' });
};

// ── Board: columns of cards (`.board__list` inside `.board__col`); a card moves by its grip with the pointer, or
// with Space and the arrows (left and right change column). The count of each column follows what it holds, and
// the board's `reorder` event says which card went where. ──
const board = (el, life = forever) => {
  if (!once(el, 'uiBoard')) return;
  const lists = () => [...el.querySelectorAll('.board__list')];
  dragSort(el, { lists, item: '.board__card', handle: '.board__grip', zone: (list) => list.closest('.board__col'), label: (list) => list.getAttribute('aria-label') });
  // Written only when it changed: the count lives inside what the observer watches. Once the board is up, a count
  // that changes pops (it fades when motion is reduced).
  let ready = false;
  const count = () => {
    for (const l of lists()) {
      const out = l.closest('.board__col').querySelector('.board__count');
      const n = String(l.querySelectorAll(':scope > .board__card').length);
      if (out.textContent === n) continue;
      out.textContent = n;
      if (ready && out.getClientRects().length) out.animate(reduced() ? [{ opacity: 0.4 }, { opacity: 1 }] : [{ transform: 'scale(1.3)' }, { transform: 'none' }], { duration: reduced() ? 140 : 320, easing: reduced() ? EASE_OUT : css('--spring-pop') || EASE_OUT });
    }
  };
  life.watch(new MutationObserver(count)).observe(el, { childList: true, subtree: true });
  count();
  ready = true;
};

// ── A box that scrolls sideways says which side has more: `data-more` holds `start`, `end` or both, and the
// two anchors it carries (`.scroll-edge`) draw a shadow on that side. ──
const scrollEdges = (el, life = forever) => {
  if (!once(el, 'uiEdges')) return;
  for (const side of ['end', 'start']) {
    const anchor = Object.assign(document.createElement('span'), { className: `scroll-edge scroll-edge--${side}` });
    anchor.setAttribute('aria-hidden', 'true');
    el.prepend(anchor);
  }
  const sync = () => {
    const more = [];
    if (el.scrollLeft > 1) more.push('start');
    if (el.scrollLeft + el.clientWidth < el.scrollWidth - 1) more.push('end');
    if (more.length) el.dataset.more = more.join(' '); else el.removeAttribute('data-more');
    // The shadows are as tall as the box. A box that shrinks (rows leaving) must not leave them taller until the observer below
    // arrives, or they would scroll it: what changes its children or its height is watched at once.
    const height = `${el.clientHeight}px`;
    if (el.style.getPropertyValue('--scroll-h') !== height) el.style.setProperty('--scroll-h', height);
  };
  el.addEventListener('scroll', sync, { passive: true });
  life.watch(new MutationObserver(sync)).observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-leaving', 'style'] });
  const watch = life.watch(new ResizeObserver(sync));
  watch.observe(el);
  for (const child of el.children) if (!child.classList.contains('scroll-edge')) watch.observe(child);
  sync();
};

// ── The actions bar publishes its height (`--selection-bar-height`), so what else lives at the bottom
// edge —the toasts— lifts by exactly that while the bar is open. ──
const selectionBar = (bar, life = forever) => {
  if (!once(bar, 'uiBar')) return;
  const publish = () => document.documentElement.style.setProperty('--selection-bar-height', `${bar.offsetHeight}px`);
  life.watch(new ResizeObserver(publish)).observe(bar);
  publish();
};

// ── A strip that scrolls sideways (the KPIs on a phone) is a tab stop only while it overflows, so a
// keyboard can scroll it; at a width where it fits, it is not one. ──
const strip = (el, life = forever) => {
  if (!once(el, 'uiStrip')) return;
  const sync = () => { if (el.scrollWidth > el.clientWidth + 1) el.tabIndex = 0; else el.removeAttribute('tabindex'); };
  life.watch(new ResizeObserver(sync)).observe(el);
  sync();
};

// ── Slider: `role=slider` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and, optionally,
// `data-step` and `data-suffix` (what `aria-valuetext` appends to the number). Arrows move one step,
// PageUp and PageDown a tenth of the range, Home and End the ends; a press or a drag sets the value and
// grows the thumb. It writes `--p` (0 to 1) for the fill and the thumb, and fires `change` with the value;
// `el.value` reads it and, set from code, moves the thumb and fires the same `change`. ──
const slider = (el) => {
  if (!once(el, 'uiSlider')) return;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const min = Number(el.getAttribute('aria-valuemin') ?? 0);
  const max = Number(el.getAttribute('aria-valuemax') ?? 100);
  const step = Number(el.dataset.step ?? 1);
  const suffix = el.dataset.suffix ?? '';
  el.setAttribute('role', 'slider');
  if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
  if (!el.querySelector('.slider__track')) el.innerHTML = '<span class="slider__track"><span class="slider__fill"></span></span><span class="slider__thumb"></span>';
  // While it is held a bubble with the value (its digits roll) rides the thumb, and leans with how fast the
  // pointer goes, up to 8°, on the bubble spring, and straightens when it stops.
  const bubble = Object.assign(document.createElement('span'), { className: 'slider__bubble', innerHTML: `<span data-sliding></span>${escapeHtml(suffix)}` });
  bubble.setAttribute('aria-hidden', 'true');
  el.querySelector('.slider__thumb').append(bubble);
  const readout = bubble.querySelector('[data-sliding]');
  const tilt = follower(springOf('--spring-bubble', '300 30 1'), ([deg]) => { bubble.style.rotate = `${deg.toFixed(2)}deg`; });
  tilt.to([0], true);
  const snap = (v) => Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
  let value = snap(Number(el.getAttribute('aria-valuenow') ?? min));
  const paint = () => {
    el.style.setProperty('--p', String((value - min) / (max - min)));
    el.setAttribute('aria-valuenow', String(value));
    el.setAttribute('aria-valuetext', `${value}${suffix}`);
    setNumber(readout, value);
  };
  const set = (next) => {
    const v = snap(next);
    if (v === value) return;
    value = v;
    paint();
    el.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value } }));
  };
  const fromPointer = (e) => {
    const r = el.getBoundingClientRect();
    set(min + Math.min(1, Math.max(0, (e.clientX - r.left - 8) / (r.width - 16))) * (max - min));
  };
  let lastX = 0;
  let lastAt = 0;
  let idle = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    el.setAttribute('data-dragging', '');
    el.focus({ preventScroll: true });
    lastX = e.clientX;
    lastAt = performance.now();
    fromPointer(e);
  });
  el.addEventListener('pointermove', (e) => {
    if (!el.hasAttribute('data-dragging')) return;
    const now = performance.now();
    const speed = ((e.clientX - lastX) / Math.max(1, now - lastAt)) * 1000;
    lastX = e.clientX;
    lastAt = now;
    if (!reduced()) { tilt.to([clamp(speed * 0.04, -8, 8)]); clearTimeout(idle); idle = setTimeout(() => tilt.to([0]), 80); }
    fromPointer(e);
  });
  const release = () => { el.removeAttribute('data-dragging'); clearTimeout(idle); tilt.to([0]); };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('keydown', (e) => {
    const page = Math.max(step, (max - min) / 10);
    const next = { ArrowRight: value + step, ArrowUp: value + step, ArrowLeft: value - step, ArrowDown: value - step, PageUp: value + page, PageDown: value - page, Home: min, End: max }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    set(next);
  });
  Object.defineProperty(el, 'value', { configurable: true, get: () => value, set: (next) => set(Number(next)) });
  paint();
};

// ── Checking a box pops it from .85 to 1: the page marks the box that was just checked, so what was
// already checked when the page arrived does not pop. ──
const popOnCheck = () => document.addEventListener('change', (e) => {
  const input = e.target;
  if (!input.matches?.('.checkbox input[type=checkbox], .radio input[type=radio]')) return;
  const pop = (box, delay = 0) => {
    if (!box) return;
    box.removeAttribute('data-pop');
    box.style.setProperty('--pop-delay', `${delay}ms`);
    void box.offsetWidth;
    box.setAttribute('data-pop', '');
  };
  if (input.matches('.radio input')) { pop(input.nextElementSibling); return; }
  if (!input.checked) return;
  pop(input.nextElementSibling);
  // «Select all» pops the boxes of the rows it checked in a cascade, 12 ms apart, the first ten.
  if (input.matches('.all-check')) [...input.closest('table').querySelectorAll('.row-check:checked')].slice(0, 10).forEach((c, i) => pop(c.nextElementSibling, i * 12));
});

// ── Notice: it can be dismissed. A close button (not on a notice that carries an action of its own, nor one marked
// `data-persistent`) fades it up 4 px and the notices below close the gap with a FLIP; `notice:dismiss` is fired as it goes. ──
export const dismissNotice = (notice) => {
  if (notice.hasAttribute('data-leaving')) return;
  notice.setAttribute('data-leaving', '');
  notice.dispatchEvent(new CustomEvent('notice:dismiss', { bubbles: true }));
  const below = [...(notice.parentElement?.children ?? [])].filter((n) => notice.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING);
  let gone = false;
  const finish = () => { if (gone) return; gone = true; flip(below, () => notice.remove(), 200, EASE_OUT); };
  notice.addEventListener('transitionend', (e) => { if (e.target === notice && e.propertyName === 'opacity') finish(); });
  setTimeout(finish, 260);
};
const notices = (root) => root.querySelectorAll('.notice').forEach((notice) => {
  if (!once(notice, 'uiNotice') || notice.hasAttribute('data-persistent') || notice.querySelector('.btn, .notice__close')) return;
  const close = Object.assign(document.createElement('button'), { className: 'notice__close', type: 'button', innerHTML: icon('x') });
  close.setAttribute('aria-label', messages.dismiss);
  close.addEventListener('click', () => dismissNotice(notice));
  notice.append(close);
});

// ── Popover: it names itself with a title from its `aria-label` (not a calendar, which has its month; `data-untitled`
// opts out). ──
const popoverTitles = (root) => root.querySelectorAll('.popover[aria-label]:not(.datepicker, [data-untitled])').forEach((panel) => {
  if (!once(panel, 'uiTitled') || panel.querySelector(':scope > .popover__title')) return;
  const title = Object.assign(document.createElement('div'), { className: 'popover__title', textContent: panel.getAttribute('aria-label') });
  title.setAttribute('aria-hidden', 'true');
  panel.prepend(title);
});

// ── Empty state (not the first-run one, which life.js draws): its title arrives by word, its mark pops and its icon is
// drawn, each time it comes into view (a filter that finds nothing shows the row again and again). The action that
// clears a filter carries its ×. ──
const emptyStates = (root, life) => root.querySelectorAll('.empty:not([data-first-run])').forEach((el) => {
  if (!once(el, 'uiEmptyLive')) return;
  const title = el.querySelector('.empty__title');
  if (title && !title.hasAttribute('data-split')) {
    const text = title.textContent.trim();
    title.innerHTML = text.split(/\s+/).map((w, i) => `<span class="word" style="--i: ${Math.min(i, 9)}">${escapeHtml(w)}</span>`).join(' ');
    title.setAttribute('data-split', '');
  }
  const clear = el.closest('.table__empty') && el.querySelector(':scope > .btn');
  if (clear && !clear.querySelector('.icon')) clear.insertAdjacentHTML('afterbegin', icon('x'));
  const io = life.watch(new IntersectionObserver((entries) => el.toggleAttribute('data-live', entries.at(-1).isIntersecting)));
  io.observe(el);
});

// ── Timeline: each row is one button over the whole row (it opens the invoice's row of the table beside it, as the
// table does), the rows arrive 20 ms apart, and a line marks today where the dates cross it. ──
const timeline = (list, life = forever) => {
  if (!once(list, 'uiTimeline')) return;
  const items = () => [...list.querySelectorAll(':scope > .timeline__item')];
  // A date as eight digits, whether the page wrote it 2026-10-12 or 20261012: they compare as text.
  const day = (text) => String(text ?? '').replace(/\D/g, '').slice(0, 8);
  const isoToday = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
  let enteredAt = 0;
  const enter = () => {
    if (reduced() || performance.now() - enteredAt < 400 || !list.getClientRects().length) return;
    enteredAt = performance.now();
    for (const n of list.querySelectorAll(':scope > .timeline__item, :scope > .timeline__today')) {
      n.setAttribute('data-entering', '');
      endOf(n, 'data-entering', 1400);
    }
  };
  const decorate = () => {
    const all = items();
    const fresh = all.some((i) => !i.querySelector('.timeline__open'));
    if (!all.length || !fresh) return;
    all.forEach((item, i) => {
      item.style.setProperty('--i', String(i));
      const what = item.querySelector('.timeline__what');
      const open = Object.assign(document.createElement('button'), { className: 'timeline__open', type: 'button' });
      open.append(...what.childNodes);
      what.append(open);
    });
    list.querySelector(':scope > .timeline__today')?.remove();
    const today = Object.assign(document.createElement('li'), { className: 'timeline__today', textContent: messages.today });
    const ahead = all.find((i) => day(i.querySelector('time')?.getAttribute('datetime')) >= isoToday());
    if (ahead) ahead.before(today); else list.append(today);
    enter();
  };
  list.addEventListener('click', (e) => {
    const item = e.target.closest('.timeline__open')?.closest('.timeline__item');
    if (!item) return;
    const number = item.querySelector('strong')?.textContent.trim();
    const table = list.closest('.view')?.querySelector('table.table');
    const row = table && [...table.tBodies[0].rows].find((r) => [...r.cells].some((c) => c.textContent.trim() === number));
    list.dispatchEvent(new CustomEvent('timeline:open', { bubbles: true, detail: { item, number, row } }));
    if (row) table.dispatchEvent(new CustomEvent('open', { detail: row }));
  });
  life.watch(new MutationObserver(decorate)).observe(list, { childList: true });
  life.watch(new IntersectionObserver((entries) => { if (entries.at(-1).isIntersecting) enter(); })).observe(list);
  decorate();
};

// ── A button that was disabled and is not any more settles from .96 once, so the action that just became possible is
// seen to become so (Save, when a form is changed). ──
const settleOnEnable = (life) => {
  life.watch(new MutationObserver((records) => {
    for (const r of records) {
      const b = r.target;
      if (r.oldValue === null || b.disabled || !b.matches('.btn:not([data-state])') || reduced() || !b.getClientRects().length) continue;
      b.animate([{ transform: 'scale(0.96)' }, { transform: 'none' }], { duration: 240, easing: spring() });
    }
  })).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['disabled'], attributeOldValue: true });
};

// A loading list, in the shape of what will arrive: a circle and two lines per row. Give it to `withSkeleton`.
export const skeletonList = (rows = 3) => {
  const widths = [['60%', '40%'], ['72%', '48%'], ['54%', '34%']];
  return Array.from({ length: rows }, (_, i) => `<div class="skeleton-row" style="--w1: ${widths[i % widths.length][0]}; --w2: ${widths[i % widths.length][1]}"><div class="skeleton skeleton--avatar"></div><div class="skeleton-lines"><div class="skeleton"></div><div class="skeleton"></div></div></div>`).join('');
};

// The skeleton of any markup: give it a sample of what will arrive and it is laid out exactly as that will be, its text
// and its marks unseen, with a bone on every line of text (as long as the line, 0.7 of its type size, centred in it)
// and on every mark (an avatar, a badge, an icon, a button, a picture: its own size and corners). What arrives takes
// the place its skeleton held, to the pixel. The bones follow the size of their box.
const MARKS = '.avatar, .badge, .btn, .key, .chip, svg, img, .spark, .progress, .switch, .checkbox, input, select, textarea';
export const skeletonOf = (html) => `<div class="skeleton-of" data-skeleton-of aria-hidden="true" inert>${html}<div class="skeleton-of__bones"></div></div>`;
const boneUp = (host) => {
  const layer = host.querySelector(':scope > .skeleton-of__bones');
  const origin = host.getBoundingClientRect();
  const outside = (n) => !layer.contains(n);
  const marks = [...host.querySelectorAll(MARKS)].filter((m) => outside(m) && !m.parentElement.closest(MARKS));
  const lines = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.data.trim() && outside(n) && !n.parentElement.closest(MARKS) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const size = parseFloat(getComputedStyle(n.parentElement).fontSize);
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 1) lines.push({ x: r.left, mid: r.top + r.height / 2, w: r.width, size });
  }
  // Runs of one line (a name in bold, then the rest of the sentence) are one bone; a column further along is another.
  lines.sort((a, b) => Math.round(a.mid) - Math.round(b.mid) || a.x - b.x);
  const runs = [];
  for (const l of lines) {
    const last = runs.at(-1);
    if (last && Math.abs(last.mid - l.mid) < 3 && l.x >= last.x && l.x - (last.x + last.w) < l.size * 0.6) { last.w = l.x + l.w - last.x; last.size = Math.max(last.size, l.size); } else runs.push({ ...l });
  }
  const bone = (x, y, w, h, radius) => `<div class="skeleton" data-bone style="left:${(x - origin.left).toFixed(1)}px;top:${(y - origin.top).toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;border-radius:${radius};--x:${(x - origin.left).toFixed(1)}px"></div>`;
  layer.innerHTML = [
    ...runs.map((r) => { const h = Math.max(8, Math.round(r.size * 0.7)); return bone(r.x, r.mid - h / 2, r.w, h, `${Math.round(h / 3)}px`); }),
    ...marks.map((m) => { m.setAttribute('data-bone-mark', ''); const r = m.getBoundingClientRect(); const radius = getComputedStyle(m).borderRadius; return r.width && r.height ? bone(r.left, r.top, r.width, r.height, radius === '0px' ? `${Math.round(Math.min(r.width, r.height) / 4)}px` : radius) : ''; }),
  ].join('');
  host.style.setProperty('--bones-w', `${origin.width}px`);
  layer.querySelectorAll('.skeleton').forEach(pauseOffscreen);
  syncSheen(host);
};
const boned = new WeakSet();
const skeletonBones = (root) => {
  for (const host of root.querySelectorAll('[data-skeleton-of]')) {
    boneUp(host);
    if (boned.has(host)) continue;
    boned.add(host);
    let width = host.offsetWidth;
    const follow = new ResizeObserver(() => {
      if (!host.isConnected) return follow.disconnect();
      if (host.offsetWidth !== width) { width = host.offsetWidth; boneUp(host); }
    });
    follow.observe(host);
  }
};

// ── Top bar: translucent over the canvas at rest; once the page scrolls, content passes under it, so
// it turns opaque (the surface and its hairline) instead of letting text show through. ──
const topbar = (bar, life = forever) => {
  if (!once(bar, 'uiTopbar')) return;
  const sync = () => bar.toggleAttribute('data-scrolled', scrollY > 0);
  addEventListener('scroll', sync, { passive: true, signal: life.signal });
  sync();
};

// ── Appearance: the theme is `light` (no attribute), `dark` (`data-theme`) or `showcase`
// (`data-register`, which brings its own accent); the accent is a preset name in `data-accent`.
// Every token switches in the same frame. ──
// The change of theme is a circle that opens from the control that asked for it and shows the new theme
// (a View Transition, 320 ms): `origin` is that control, and its icon turns half a turn. Without the API, with
// reduced motion or without an origin the theme just changes, in one frame. `data-theme-changing` is on the
// root until the new theme is whole.
let accent = 'brand';
let changing = false;
export const setTheme = (theme, { origin } = {}) => {
  const root = document.documentElement;
  const apply = () => {
    root.classList.add('theme-switching');
    root.removeAttribute('data-theme');
    root.removeAttribute('data-register');
    if (theme === 'dark') root.dataset.theme = 'dark';
    if (theme === 'showcase') root.dataset.register = 'showcase';
    if (theme === 'showcase') root.removeAttribute('data-accent'); else root.dataset.accent = accent;
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
  };
  const turn = origin?.querySelector('.icon');
  if (turn && !reduced()) turn.animate([{ rotate: '0deg' }, { rotate: '180deg' }], { duration: ms('--motion-theme', 320), easing: spring() });
  if (!origin || reduced() || !document.startViewTransition || changing) { apply(); return; }
  changing = true;
  root.setAttribute('data-theme-changing', '');
  const transition = document.startViewTransition(apply);
  transition.ready.then(() => {
    const r = origin.getBoundingClientRect();
    const at = `${((r.left + r.width / 2) / innerWidth) * 100}% ${((r.top + r.height / 2) / innerHeight) * 100}%`;
    root.animate({ clipPath: [`circle(0% at ${at})`, `circle(150% at ${at})`] }, { duration: ms('--motion-theme', 320), easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' });
  }).catch(() => {});
  transition.finished.catch(() => {}).then(() => { changing = false; root.removeAttribute('data-theme-changing'); });
};
export const setAccent = (name) => {
  accent = name;
  if (!document.documentElement.dataset.register) document.documentElement.dataset.accent = name;
};

// For markup a module builds after `init` ran: gives its `[data-tooltip]` elements their tooltip.
export const tooltips = (root = document) => root.querySelectorAll('[data-tooltip]').forEach(tooltip);

// Wires every component under `root`. What it puts on the window and the document and the observers it starts
// belong to the handle it returns: `destroy()` takes them back, for a page that mounts and unmounts its views.
export const init = (root = document) => {
  const life = scope();
  document.documentElement.classList.add('js');
  initLife(root, life);
  skeletonBones(root);
  root.querySelectorAll('kbd[data-shortcut]').forEach((k) => { k.textContent = keyLabel(k.dataset.shortcut); });
  root.querySelectorAll('.segmented[role=radiogroup], .tabs[role=tablist]').forEach((g) => choice(g, life));
  root.querySelectorAll('[data-tooltip]').forEach(tooltip);
  if (once(document.documentElement, 'uiLazyTip')) lazyTooltips(life);
  initOverlays(root);
  popoverTitles(root);
  notices(root);
  emptyStates(root, life);
  root.querySelectorAll('[data-dialog]').forEach(dialogTrigger);
  root.querySelectorAll('dialog [data-close]').forEach((b) => once(b, 'uiClose') && b.addEventListener('click', () => b.closest('dialog').close()));
  root.querySelectorAll('.field, .search').forEach(field);
  root.querySelectorAll('.editable').forEach(editable);
  initCharts(root, life);
  root.querySelectorAll('table.table').forEach((t) => table(t, life));
  root.querySelectorAll('.accordion').forEach(accordion);
  root.querySelectorAll('.card[data-interactive]').forEach(card);
  root.querySelectorAll('.btn[aria-pressed]').forEach((b) => once(b, 'uiToggle') && b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'))));
  root.querySelectorAll('.btn[data-copy]').forEach(copyButton);
  root.querySelectorAll('.btn--hold').forEach(holdButton);
  root.querySelectorAll('.sortable').forEach(sortable);
  root.querySelectorAll('.board').forEach((b) => board(b, life));
  // A timeline marked data-static (a record's history) is a list to read: no items to open, no «today» line.
  root.querySelectorAll('.timeline:not([data-static])').forEach((t) => timeline(t, life));
  if (once(document.documentElement, 'uiSettle')) settleOnEnable(life);
  root.querySelectorAll('.table-wrap, .board__scroll, .comp-filter').forEach((w) => scrollEdges(w, life));
  root.querySelectorAll('input[data-indeterminate]').forEach((i) => { i.indeterminate = true; });
  root.querySelectorAll('.avatars').forEach((g) => [...g.children].forEach((a, i) => a.style.setProperty('--i', i)));
  root.querySelectorAll('.avatar').forEach((a) => { if (!a.style.getPropertyValue('--h')) a.style.setProperty('--h', String(hueOf(a.dataset.name ?? a.textContent))); });
  root.querySelectorAll('.slider').forEach(slider);
  initEntry(root, life);
  if (once(document.documentElement, 'uiPop')) popOnCheck();
  root.querySelectorAll('svg.spark[data-spark]').forEach((s) => spark(s, life));
  root.querySelectorAll('.topbar').forEach((b) => topbar(b, life));
  root.querySelectorAll('.kpis').forEach((k) => strip(k, life));
  root.querySelectorAll('.selection-bar').forEach((b) => selectionBar(b, life));
  root.querySelectorAll('.tabs[role=tablist]').forEach((t) => highlight(t, '.tabs__tab', { bleed: [6, 0] }, life));
  root.querySelectorAll('.segmented').forEach((s) => highlight(s, '.segmented__option', {}, life));
  root.querySelectorAll('.table-wrap').forEach((w) => highlight(w, 'tbody tr:not(.table__empty):not(.table__skeleton):not([data-leaving])', {}, life));
  activate(root);
  return { destroy: life.destroy };
};

export const choose = (group, value) => group.choose?.(value);

export const ui = { choose, format, configure, keyLabel, icon, flip, setDelta, setBadge, setSpark, setChart, syncSheen, init, tooltips, activate, toast, openMenu, closeMenu, contextMenu, hovercard, runAction, withSkeleton, skeletonRows, skeletonList, skeletonOf, dismissNotice, setTheme, setAccent, setNumber, setProgress, filterRows, addRow, prependEvent, removeRow, openPeek, closePeek, closeInto, enterView, slideIn, sweepRows, particles, confetti, lap, moments, messages };
