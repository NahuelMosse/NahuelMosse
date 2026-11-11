// Toolbar expandable (Motion Primitives): a row of icon actions that opens a panel above itself. The
// panel grows from nothing to the height of the action's content on a spring, the content fades in, and
// pressing another action swaps the content while the height follows; the same action, Escape or a
// press outside folds it back. Meant for a selection bar: the actions are what can be done to the
// selected rows, the panel is the action's own detail.
//
// The height is the final one from the first frame: the bar's surface scales to it, the actions move to
// their place and the panel is shown through a clip that grows, all with transform and clip-path.
//
// Markup: a root `[data-motion="toolbar-expandable"]` > `.tbe__box` with `[data-te="clip"]` >
// `[data-te="body"]` > `[data-te="content"]` holding one `[data-te-panel="<id>"]` per action, and the
// `[data-te="menu"]` with a `button[data-te-item="<id>"]` (aria-label) per action.
// mount(root, { transition: { bounce, duration }, surface, onChange }) -> { select(id|null), value, destroy }.
// `surface` is the element whose ::before is the bar's surface (the box by default): a bar that wraps this
// one and draws its own surface passes itself, and that surface follows the height.
// Emits `toolbar-expandable:change` { value }.
import { reduced, uid } from '../core.js';
import { bounceSpring, springCurve } from './mp-morph.js';
import { flipClip, flipMove, flipSurface, rectOf, surfaceRect, visibleRect } from './flip-size.js';

const handles = new WeakMap();

export function mount(root, opts = {}) {
  if (handles.has(root)) return handles.get(root);
  const box = root.querySelector('.tbe__box');
  const clip = root.querySelector('[data-te="clip"]');
  const body = root.querySelector('[data-te="body"]');
  const content = root.querySelector('[data-te="content"]');
  const menu = root.querySelector('[data-te="menu"]');
  const buttons = [...menu.querySelectorAll('[data-te-item]')];
  const panels = [...content.querySelectorAll('[data-te-panel]')];
  const t = opts.transition ?? { bounce: 0.1, duration: 0.25 };
  const curve = springCurve(bounceSpring(t.bounce, t.duration));
  const surfaceHost = opts.surface ?? box;
  const key = uid('tbe-');
  let active = null;
  let anims = [];
  let fadeAnim = null;
  const stop = () => { for (const a of anims) a.cancel(); anims = []; fadeAnim?.cancel(); fadeAnim = null; };

  menu.setAttribute('role', 'toolbar');
  root.dataset.state = 'closed';
  clip.hidden = true;
  for (const panel of panels) {
    panel.id = `${key}-${panel.dataset.tePanel}`;
    panel.setAttribute('role', 'region');
    panel.hidden = true;
    const owner = buttons.find((b) => b.dataset.teItem === panel.dataset.tePanel);
    if (owner) { panel.setAttribute('aria-label', owner.getAttribute('aria-label') ?? ''); owner.setAttribute('aria-controls', panel.id); }
  }
  buttons.forEach((b, i) => { b.setAttribute('aria-expanded', 'false'); b.tabIndex = i === 0 ? 0 : -1; });

  // The body keeps the width the bar had when it measured itself, so the content does not reflow while the panel is revealed.
  const measure = () => body.style.setProperty('--toolbar-expandable-body-width', `${menu.offsetWidth}px`);
  measure();
  const watch = new ResizeObserver(measure);
  watch.observe(menu);

  const fold = () => { clip.hidden = true; clip.removeAttribute('data-leaving'); for (const p of panels) p.hidden = true; };

  function select(id) {
    if (id === active) return;
    const surface = surfaceRect(surfaceHost);
    const boxAt = rectOf(box);
    const menuAt = rectOf(menu);
    const shown = clip.hidden ? null : visibleRect(clip);
    stop();
    const was = active;
    active = id;
    root.dataset.state = id ? 'open' : 'closed';
    for (const b of buttons) {
      const on = b.dataset.teItem === id;
      b.toggleAttribute('data-active', on);
      b.setAttribute('aria-expanded', String(on));
    }
    const quick = reduced();
    const timing = { duration: curve.duration, easing: curve.easing };
    const r = getComputedStyle(box).borderTopLeftRadius;
    if (id) {
      clip.hidden = false;
      clip.removeAttribute('data-leaving');
      for (const panel of panels) panel.hidden = panel.dataset.tePanel !== id;
      const panel = panels.find((p) => p.dataset.tePanel === id);
      fadeAnim = panel.animate([{ opacity: 0 }, { opacity: 1 }], quick ? { duration: 120, easing: 'ease-out' } : { duration: curve.duration, easing: 'ease-out' });
      if (!quick) {
        const at = rectOf(clip);
        anims = [flipSurface(surfaceHost, surface, timing), flipMove(menu, menuAt, timing), flipClip(clip, shown ?? { left: at.left, top: boxAt.top, width: at.width, height: 0 }, undefined, timing, `${r} ${r} 0px 0px`)].filter(Boolean);
      }
    } else if (quick || !shown) {
      fold();
    } else {
      // The panel leaves the flow at once, so the bar is already as short as it ends; what is seen of it is withdrawn.
      clip.dataset.leaving = '';
      const at = rectOf(clip);
      anims = [flipSurface(surfaceHost, surface, timing), flipMove(menu, menuAt, timing), flipClip(clip, shown, { left: at.left, top: at.top, width: at.width, height: 0 }, { ...timing, fill: 'forwards' }, `${r} ${r} 0px 0px`)].filter(Boolean);
    }
    const own = anims;
    Promise.all(own.map((a) => a.finished)).then(() => {
      if (anims !== own) return;
      anims = [];
      if (active === null) { for (const a of clip.getAnimations()) a.cancel(); fold(); }
    }, () => {});
    if (was !== id) {
      opts.onChange?.(id);
      root.dispatchEvent(new CustomEvent('toolbar-expandable:change', { detail: { value: id }, bubbles: true }));
    }
  }

  const onClick = (event) => {
    const button = event.target.closest('[data-te-item]');
    if (!button || !menu.contains(button)) return;
    select(button.dataset.teItem === active ? null : button.dataset.teItem);
  };
  const onKey = (event) => {
    // The Escape that folds the panel is spent there: a layer around the bar (a selection that Escape clears) must not take it too.
    if (event.key === 'Escape' && active) { event.preventDefault(); const b = buttons.find((n) => n.dataset.teItem === active); select(null); b?.focus(); return; }
    const at = buttons.indexOf(document.activeElement);
    if (at < 0) return;
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    const to = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : step ? (at + step + buttons.length) % buttons.length : -1;
    if (to < 0) return;
    event.preventDefault();
    buttons.forEach((b, i) => { b.tabIndex = i === to ? 0 : -1; });
    buttons[to].focus();
  };
  const onFocus = (event) => { const at = buttons.indexOf(event.target); if (at >= 0) buttons.forEach((b, i) => { b.tabIndex = i === at ? 0 : -1; }); };
  const onOutside = (event) => { if (active && !root.contains(event.target)) select(null); };
  const lifetime = new AbortController();
  const { signal } = lifetime;
  menu.addEventListener('click', onClick, { signal });
  menu.addEventListener('focusin', onFocus, { signal });
  root.addEventListener('keydown', onKey, { signal });
  document.addEventListener('mousedown', onOutside, { signal });
  document.addEventListener('touchstart', onOutside, { passive: true, signal });

  const handle = {
    select,
    get value() { return active; },
    destroy() {
      handles.delete(root);
      lifetime.abort();
      stop();
      watch.disconnect();
      fold();
      for (const b of buttons) for (const a of ['data-active', 'aria-expanded', 'aria-controls', 'tabindex']) b.removeAttribute(a);
      menu.removeAttribute('role');
      body.style.removeProperty('--toolbar-expandable-body-width');
      delete root.dataset.state;
    },
  };
  handles.set(root, handle);
  return handle;
}

// Imported without a call to mount(), it mounts every marked root once the importing module has run.
if (typeof document !== 'undefined') queueMicrotask(() => { for (const el of document.querySelectorAll('[data-motion="toolbar-expandable"]')) mount(el); });
