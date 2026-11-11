// Theme toggler: the View Transition reveal of Magic UI (magicui/animated-theme-toggler) with the animated
// sun and moon of Animate UI (icons/sun, icons/moon, buttons/theme-toggler). A click starts a view
// transition whose new theme is revealed by a shape that grows from the button (circle by default; also
// square, triangle, diamond, hexagon, rectangle and star) in 400 ms, with the coordinates in percent of
// the snapshot box so a fractional display scale does not shift them. The icon of the current theme swaps
// with the copy button's scale / opacity / blur, and the new one plays its own animation (the sun draws
// its rays, the moon turns). Without View Transitions the theme changes at once; with reduced motion
// the page cross-fades in 140 ms and the icon fades.
//
//   <button data-motion="theme-toggler" aria-label="Tema oscuro"></button>
//
// The theme is `data-theme="dark"` on the root (anything else is light), which is what tokens.css reads.
// mount(el, { variant, duration, fromCenter, attribute, target, storageKey, onChange, labels })
//   → { toggle(), theme, destroy }; `themechange` fires on `el` with { theme }.
import { reduced } from '../core.js';
import { make, swapAnimation, REDUCED_FADE } from './au-util.js';
import { mount as mountIcon, play } from './icons.js';

const instances = new WeakMap();
export const VARIANTS = ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'rectangle', 'star'];
const LABELS = { toggle: 'Tema oscuro' };

const polygonCollapsed = (point, vertexCount) => `polygon(${Array.from({ length: vertexCount }, () => point).join(', ')})`;

// Every coordinate is a percentage of the snapshot reference box: Chrome draws absolute px clip-path
// coordinates on ::view-transition-new(root) unscaled on fractional display scales (Windows 150 %).
export const clipPaths = (variant, cx, cy, maxRadius, vw, vh) => {
  const toX = (x) => `${(x / vw) * 100}%`;
  const toY = (y) => `${(y / vh) * 100}%`;
  const point = (x, y) => `${toX(x)} ${toY(y)}`;
  // circle() percentage radii resolve against hypot(w, h) / sqrt(2) of the reference box.
  const toRadius = (r) => `${(r / (Math.hypot(vw, vh) / Math.SQRT2)) * 100}%`;
  const halfW = Math.max(cx, vw - cx);
  const halfH = Math.max(cy, vh - cy);
  const box = (hw, hh) => `polygon(${[point(cx - hw, cy - hh), point(cx + hw, cy - hh), point(cx + hw, cy + hh), point(cx - hw, cy + hh)].join(', ')})`;
  switch (variant) {
    case 'circle': return [`circle(0% at ${point(cx, cy)})`, `circle(${toRadius(maxRadius)} at ${point(cx, cy)})`];
    case 'square': { const half = Math.max(halfW, halfH) * 1.05; return [polygonCollapsed(point(cx, cy), 4), box(half, half)]; }
    case 'rectangle': return [polygonCollapsed(point(cx, cy), 4), box(halfW, halfH)];
    case 'triangle': {
      const scale = maxRadius * 2.2;
      const dx = (Math.sqrt(3) / 2) * scale;
      return [polygonCollapsed(point(cx, cy), 3), `polygon(${[point(cx, cy - scale), point(cx + dx, cy + 0.5 * scale), point(cx - dx, cy + 0.5 * scale)].join(', ')})`];
    }
    case 'diamond': {
      const R = maxRadius * Math.SQRT2;
      return [polygonCollapsed(point(cx, cy), 4), `polygon(${[point(cx, cy - R), point(cx + R, cy), point(cx, cy + R), point(cx - R, cy)].join(', ')})`];
    }
    case 'hexagon': {
      const R = maxRadius * Math.SQRT2;
      const verts = Array.from({ length: 6 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 3; return point(cx + R * Math.cos(a), cy + R * Math.sin(a)); });
      return [polygonCollapsed(point(cx, cy), 6), `polygon(${verts.join(', ')})`];
    }
    case 'star': {
      const R = maxRadius * Math.SQRT2 * 1.03;
      const star = (radius) => {
        const verts = [];
        for (let i = 0; i < 5; i++) {
          const outer = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          verts.push(point(cx + radius * Math.cos(outer), cy + radius * Math.sin(outer)));
          const inner = outer + Math.PI / 5;
          verts.push(point(cx + radius * 0.42 * Math.cos(inner), cy + radius * 0.42 * Math.sin(inner)));
        }
        return `polygon(${verts.join(', ')})`;
      };
      return [star(Math.max(2, R * 0.025)), star(R)];
    }
    default: throw new Error(`motion/theme-toggler: no variant "${variant}" (${VARIANTS.join(', ')})`);
  }
};

export const mount = (el, opts = {}) => {
  if (instances.has(el)) return instances.get(el);
  const variant = opts.variant ?? el.dataset.variant ?? 'circle';
  if (!VARIANTS.includes(variant)) throw new Error(`motion/theme-toggler: no variant "${variant}" (${VARIANTS.join(', ')})`);
  const duration = opts.duration ?? Number(el.dataset.duration ?? 400);
  const fromCenter = opts.fromCenter ?? el.hasAttribute('data-from-center');
  const attribute = opts.attribute ?? 'data-theme';
  const target = opts.target ?? document.documentElement;
  const root = document.documentElement;
  const labels = { ...LABELS, ...opts.labels };
  const original = [...el.childNodes];
  const classes = ['btn', 'btn--ghost', 'btn--icon', 'tt'].filter((c) => !el.classList.contains(c));
  el.classList.add(...classes);
  const hadLabel = el.hasAttribute('aria-label');
  if (!hadLabel) el.setAttribute('aria-label', labels.toggle);
  const addedType = el.tagName === 'BUTTON' && !el.hasAttribute('type');
  if (addedType) el.setAttribute('type', 'button');

  const isDark = () => target.getAttribute(attribute) === 'dark';
  const cell = make('span', { class: 'tt__icons', 'aria-hidden': 'true' });
  const faces = { light: make('span', { class: 'tt__icon' }), dark: make('span', { class: 'tt__icon' }) };
  const icons = [mountIcon(faces.light, { name: 'sun', size: 18, host: el }), mountIcon(faces.dark, { name: 'moon', size: 18, host: el })];
  cell.append(faces.light, faces.dark);
  el.replaceChildren(cell);

  let shown = isDark() ? 'dark' : 'light';
  Object.assign(faces[shown === 'dark' ? 'light' : 'dark'].style, { opacity: '0', transform: 'scale(0)' });
  el.setAttribute('aria-pressed', String(shown === 'dark'));
  let motions = [];
  const sync = (animate) => {
    const next = isDark() ? 'dark' : 'light';
    el.setAttribute('aria-pressed', String(next === 'dark'));
    if (next === shown) return;
    for (const m of motions) m.cancel();
    if (animate) {
      motions = [swapAnimation(faces[shown], false), swapAnimation(faces[next], true)];
      play(faces[next].firstElementChild);
    } else {
      Object.assign(faces[shown].style, { opacity: '0', transform: 'scale(0)' });
      Object.assign(faces[next].style, { opacity: '1', transform: 'none' });
    }
    shown = next;
  };
  const watch = new MutationObserver(() => sync(true));
  watch.observe(target, { attributes: true, attributeFilter: [attribute] });

  let busy = false;
  let reveal = null;
  const apply = (theme) => {
    target.setAttribute(attribute, theme);
    if (opts.storageKey) { try { localStorage.setItem(opts.storageKey, theme); } catch { /* storage that is not there is not an error */ } }
    sync(true);
    opts.onChange?.(theme);
    el.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  };

  const toggle = () => {
    if (busy || root.dataset.themeVt) return;
    const theme = isDark() ? 'light' : 'dark';
    if (typeof document.startViewTransition !== 'function') { apply(theme); return; }
    const done = () => {
      busy = false;
      reveal?.cancel();
      reveal = null;
      delete root.dataset.themeVt;
      root.style.removeProperty('--theme-toggle-vt-duration');
      root.style.removeProperty('--theme-vt-clip-from');
    };
    busy = true;
    if (reduced()) {
      root.dataset.themeVt = 'fade';
      root.style.setProperty('--theme-toggle-vt-duration', `${REDUCED_FADE}ms`);
      document.startViewTransition(() => apply(theme)).finished.finally(done).catch(() => {});
      return;
    }
    // innerWidth / innerHeight, not visualViewport: the percentages resolve against the snapshot box.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = vw / 2;
    let y = vh / 2;
    if (!fromCenter) { const r = el.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
    const maxRadius = Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y));
    const clip = clipPaths(variant, x, y, maxRadius, vw, vh);
    root.dataset.themeVt = 'shape';
    root.style.setProperty('--theme-toggle-vt-duration', `${duration}ms`);
    // The collapsed shape is pinned in CSS so no browser paints the new theme unclipped before `ready`.
    root.style.setProperty('--theme-vt-clip-from', clip[0]);
    const transition = document.startViewTransition(() => apply(theme));
    transition.finished.finally(done).catch(() => {});
    transition.ready.then(() => {
      reveal = root.animate({ clipPath: clip }, { duration, easing: variant === 'star' ? 'linear' : 'ease-in-out', fill: 'forwards', pseudoElement: '::view-transition-new(root)' });
    }).catch(() => {});
  };

  const onClick = () => toggle();
  el.addEventListener('click', onClick);

  const api = {
    get theme() { return isDark() ? 'dark' : 'light'; },
    toggle,
    destroy() {
      el.removeEventListener('click', onClick);
      watch.disconnect();
      reveal?.cancel();
      for (const m of motions) m.cancel();
      for (const i of icons) i.destroy();
      if (busy) { delete root.dataset.themeVt; root.style.removeProperty('--theme-toggle-vt-duration'); root.style.removeProperty('--theme-vt-clip-from'); }
      el.replaceChildren(...original);
      el.classList.remove(...classes);
      el.removeAttribute('aria-pressed');
      if (!hadLabel) el.removeAttribute('aria-label');
      if (addedType) el.removeAttribute('type');
      instances.delete(el);
    },
  };
  instances.set(el, api);
  return api;
};

if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-motion="theme-toggler"]')) mount(el);
