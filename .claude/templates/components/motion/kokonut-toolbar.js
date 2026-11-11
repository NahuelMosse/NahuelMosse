// Kokonut toolbar (Kokonut UI): a row of icon tools where the selected one opens into a pill with its
// name. The pill's width, its label and the shift of the tools beside it travel together on a critically
// damped spring; pressing a tool pops a small notice above the bar with a line drawing under it; a toggle
// at the end flips between its two states and answers hover and press.
//
// The widths are the final ones from the first frame: each pill and the bar's surface scale from the box
// they had to the one they have, the tools move to their place, and the label is shown through a clip
// that grows or withdraws, all with transform and clip-path.
//
// Markup: a root `[data-motion="kokonut-toolbar"]` > `.ktb__bar` > `[data-kt="notice"]` and `.ktb__row`
// with `button[data-kt-item="<id>"]` (an icon and `.ktb__label`; `data-selected` for the default) and
// an optional `button[data-kt="toggle"]` (its `data-label-off` / `data-label-on`).
// mount(root, { message(label, id), onSelect, onToggle }) -> { value, select(id|null), destroy }.
// Emits `kokonut-toolbar:select` { value } and `kokonut-toolbar:toggle` { on }.
import { reduced } from '../core.js';
import { bounceSpring, springCurve } from './mp-morph.js';
import { flipClip, flipMove, flipSurface, rectOf, surfaceRect, visibleRect } from './flip-size.js';

const SPRING = springCurve(bounceSpring(0, 0.4));
const NOTICE_MS = 1500;
const handles = new WeakMap();

// A tool shows its name only while it is the chosen one, so its name is also its tooltip (`data-tooltip`, which the
// set's tooltip reads); the chosen one says what pressing it does. The tools are tagged as soon as this module loads,
// so a page that wires its tooltips once, when it starts, finds them.
const tagTools = (root) => {
  for (const button of root.querySelectorAll('[data-kt-item]')) {
    const name = button.querySelector('.ktb__label')?.textContent.trim();
    if (name) button.dataset.tooltip = button.hasAttribute('data-selected') ? `Quitar «${name}»` : name;
  }
};
if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-motion="kokonut-toolbar"]')) tagTools(el);

export function mount(root, opts = {}) {
  if (handles.has(root)) return handles.get(root);
  const bar = root.querySelector('.ktb__bar');
  const notice = root.querySelector('[data-kt="notice"]');
  const items = [...root.querySelectorAll('[data-kt-item]')];
  const toggle = root.querySelector('[data-kt="toggle"]');
  const stops = toggle ? [...items, toggle] : items;
  const message = opts.message ?? ((label) => `${label} activado`);
  let selected = items.find((b) => b.hasAttribute('data-selected'))?.dataset.ktItem ?? null;
  let timer = 0;
  let pop = null;
  let anims = [];
  const stop = () => { for (const a of anims) a.cancel(); anims = []; };

  const labelOf = (button) => button.querySelector('.ktb__label');
  const nameOf = (button) => labelOf(button).textContent.trim();
  items.forEach((b) => { b.setAttribute('aria-label', nameOf(b)); });
  stops.forEach((b, i) => { b.tabIndex = i === 0 ? 0 : -1; });

  const paint = (button, on) => {
    button.toggleAttribute('data-selected', on);
    button.setAttribute('aria-pressed', String(on));
    button.dataset.tooltip = on ? `Quitar «${nameOf(button)}»` : nameOf(button);
  };
  items.forEach((b) => paint(b, b.dataset.ktItem === selected));

  // What is on screen before a change: where the bar's surface, every tool and the notice are, and for the tools
  // that open or close their pill, their icon, the part of the label that is shown and its opacity.
  const lookAt = (button) => ({ surface: surfaceRect(button), icon: rectOf(button.querySelector('.icon')), label: visibleRect(labelOf(button)), opacity: Number(getComputedStyle(labelOf(button)).opacity) });

  // The tools that open and close are already in their final size: their pill (the ::before) scales to it, the
  // icon and the label move to their place and the label is cut to the width it has at each moment.
  const travel = (was, opening) => {
    const timing = { duration: SPRING.duration, easing: SPRING.easing };
    if (reduced()) {
      for (const [button, look] of was.morph) anims.push(labelOf(button).animate([{ opacity: look.opacity }, { opacity: button === opening ? 1 : 0 }], { duration: 120, easing: 'ease-out' }));
      return;
    }
    anims.push(flipSurface(bar, was.bar, timing));
    for (const button of stops) {
      const look = was.morph.get(button);
      if (!look) { anims.push(flipMove(button, was.stops.get(button), timing)); continue; }
      const label = labelOf(button);
      anims.push(
        flipSurface(button, look.surface, timing),
        flipMove(button.querySelector('.icon'), look.icon, timing),
        flipClip(label, look.label, undefined, timing),
        label.animate([{ opacity: look.opacity }, { opacity: button === opening ? 1 : 0 }], timing),
      );
    }
    anims.push(flipMove(notice, was.notice, timing));
    anims = anims.filter(Boolean);
  };

  function clear() {
    clearTimeout(timer);
    timer = 0;
    if (!pop) return;
    const gone = pop;
    pop = null;
    if (reduced()) { gone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120 }).finished.then(() => gone.remove(), () => gone.remove()); return; }
    const out = gone.animate([{ opacity: 1, transform: 'translateY(-10px)' }, { opacity: 0, transform: 'translateY(-20px)' }], { duration: 300, easing: 'ease-out', fill: 'forwards' });
    gone.querySelector('.ktb__line')?.animate([{ transform: 'translateX(0) scaleX(1)' }, { transform: 'translateX(50%) scaleX(0)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
    out.finished.then(() => gone.remove(), () => gone.remove());
  }
  function say(text) {
    if (pop) { pop.querySelector('.ktb__pill').textContent = text; }
    else {
      pop = document.createElement('div');
      pop.className = 'ktb__pop';
      pop.innerHTML = '<div class="ktb__pill"></div><span class="ktb__line" aria-hidden="true"></span>';
      pop.querySelector('.ktb__pill').textContent = text;
      notice.append(pop);
      if (reduced()) pop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, fill: 'both' });
      else {
        pop.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(-10px)' }], { duration: 300, easing: 'ease-out', fill: 'forwards' });
        pop.querySelector('.ktb__line').animate([{ transform: 'translateX(-50%) scaleX(0)' }, { transform: 'translateX(0) scaleX(1)' }], { duration: 200, easing: 'ease-out', fill: 'forwards' });
      }
    }
    clearTimeout(timer);
    timer = setTimeout(clear, NOTICE_MS);
  }

  function select(id, { announce = true } = {}) {
    const next = id === selected ? null : id;
    const closing = selected ? items.find((b) => b.dataset.ktItem === selected) : null;
    const opening = next ? items.find((b) => b.dataset.ktItem === next) : null;
    const was = { bar: surfaceRect(bar), notice: rectOf(notice), stops: new Map(stops.map((b) => [b, rectOf(b)])), morph: new Map([closing, opening].filter(Boolean).map((b) => [b, lookAt(b)])) };
    stop();
    if (closing) paint(closing, false);
    if (opening) paint(opening, true);
    selected = next;
    travel(was, opening);
    if (announce && id) say(message(nameOf(items.find((b) => b.dataset.ktItem === id)), id));
    opts.onSelect?.(id);
    root.dispatchEvent(new CustomEvent('kokonut-toolbar:select', { detail: { value: id, selected: next }, bubbles: true }));
  }

  const lifetime = new AbortController();
  const { signal } = lifetime;
  const onClick = (event) => {
    const button = event.target.closest('[data-kt-item]');
    if (button && root.contains(button)) select(button.dataset.ktItem);
  };
  root.addEventListener('click', onClick, { signal });

  const labelOfToggle = () => toggle.querySelector('.ktb__toggle-label');
  const syncToggle = () => { const on = toggle.getAttribute('aria-pressed') === 'true'; labelOfToggle().textContent = on ? toggle.dataset.labelOn : toggle.dataset.labelOff; };
  const onToggle = () => {
    const on = toggle.getAttribute('aria-pressed') !== 'true';
    toggle.setAttribute('aria-pressed', String(on));
    syncToggle();
    opts.onToggle?.(on);
    root.dispatchEvent(new CustomEvent('kokonut-toolbar:toggle', { detail: { on }, bubbles: true }));
  };
  if (toggle) {
    toggle.setAttribute('aria-pressed', toggle.getAttribute('aria-pressed') ?? 'false');
    syncToggle();
    toggle.addEventListener('click', onToggle, { signal });
  }

  const onKey = (event) => {
    const at = stops.indexOf(document.activeElement);
    if (at < 0) return;
    const to = event.key === 'Home' ? 0 : event.key === 'End' ? stops.length - 1 : { ArrowRight: at + 1, ArrowLeft: at - 1 }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const target = (to + stops.length) % stops.length;
    stops.forEach((b, i) => { b.tabIndex = i === target ? 0 : -1; });
    stops[target].focus();
  };
  const onFocus = (event) => { const at = stops.indexOf(event.target); if (at >= 0) stops.forEach((b, i) => { b.tabIndex = i === at ? 0 : -1; }); };
  bar.addEventListener('keydown', onKey, { signal });
  bar.addEventListener('focusin', onFocus, { signal });

  const handle = {
    get value() { return selected; },
    select: (id) => select(id, { announce: false }),
    destroy() {
      handles.delete(root);
      lifetime.abort();
      stop();
      clearTimeout(timer);
      pop?.remove();
      pop = null;
      for (const b of stops) b.removeAttribute('tabindex');
      for (const b of items) b.removeAttribute('aria-pressed');
    },
  };
  handles.set(root, handle);
  return handle;
}

// Imported without a call to mount(), it mounts every marked root once the importing module has run.
if (typeof document !== 'undefined') queueMicrotask(() => { for (const el of document.querySelectorAll('[data-motion="kokonut-toolbar"]')) mount(el); });
