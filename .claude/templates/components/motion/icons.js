// Animated icons from Animate UI (registry/icons/*): the same 24 px drawings, the same parts and the
// same tracks, durations, delays and keyframe times, played with WAAPI. Each icon is inline SVG whose
// moving parts carry `data-part`; a hover (or focus-visible, tap, or entering the view) plays it and
// leaving plays it back to rest. Reduced motion answers with a 140 ms fade of the whole drawing.
//
//   import { mount, iconSvg } from './icons.js';
//   mount(el, { name: 'plus' });            // el gets the svg; hover on the button around it plays
//   iconSvg('trash', { size: 16 });          // the static drawing, as a string
//
// Without calling it, every `[data-motion="icons"][data-icon="plus"]` mounts by itself.
import { reduced } from '../core.js';
import { springCurve, REDUCED_FADE, EASE_IN_OUT } from './au-util.js';

const ROUND_TRIP = 300;
const SPRING_150_25 = springCurve(150, 25, 1);
const inout = { ease: 'inout' };
const sunLines = [
  '<line data-part="line1" x1="12" y1="4" x2="12" y2="2" pathLength="1"/>',
  '<line data-part="line2" x1="17.7" y1="6.3" x2="19.1" y2="4.9" pathLength="1"/>',
  '<line data-part="line3" x1="20" y1="12" x2="22" y2="12" pathLength="1"/>',
  '<line data-part="line4" x1="17.7" y1="17.7" x2="19.1" y2="19.1" pathLength="1"/>',
  '<line data-part="line5" x1="12" y1="20" x2="12" y2="22" pathLength="1"/>',
  '<line data-part="line6" x1="6.3" y1="17.7" x2="4.9" y2="19.1" pathLength="1"/>',
  '<line data-part="line7" x1="4" y1="12" x2="2" y2="12" pathLength="1"/>',
  '<line data-part="line8" x1="6.3" y1="6.3" x2="4.9" y2="4.9" pathLength="1"/>',
].join('');
const sunAnimation = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`line${i + 1}`, { ...inout, dur: 0.6, delay: i * 0.15, tracks: { opacity: [0, 1], dash: ['0 1', '1 1'] } }]));

// Tracks per part: `x`, `y` (user units, or a % string of the part's own box), `rotate` (deg), `scale`,
// `opacity`, `height`, `dash` (stroke-dasharray over pathLength 1) and `d`. `times` places the keyframes;
// without it they are even. `origin` is the transform origin; `root` is the svg itself.
export const ICONS = {
  plus: {
    svg: '<line data-part="line1" x1="12" y1="19" x2="12" y2="5"/><line data-part="line2" x1="5" y1="12" x2="19" y2="12"/>',
    animations: { default: { line1: { ...inout, dur: 0.4, delay: 0.1, tracks: { rotate: [0, 90] } }, line2: { ...inout, dur: 0.4, tracks: { rotate: [0, 90] } } } },
  },
  minus: { svg: '<path d="M5 12h14"/>', animations: {} },
  x: {
    svg: '<line data-part="line1" x1="6" y1="18" x2="18" y2="6"/><line data-part="line2" x1="6" y1="6" x2="18" y2="18"/>',
    animations: { default: { line1: { ...inout, dur: 0.4, tracks: { rotate: [0, 90] } }, line2: { ...inout, dur: 0.4, delay: 0.1, tracks: { rotate: [0, 90] } } } },
  },
  check: {
    svg: '<path data-part="path" d="m4 12 5 5L20 6" pathLength="1"/>',
    animations: {
      default: { path: { ...inout, dur: 0.6, tracks: { dash: ['0 1', '1 1'], opacity: [0, 1], scale: [1, 1.1, 1] } } },
      quick: { path: { ...inout, dur: 0.15, tracks: { dash: ['0 1', '1 1'], opacity: [0, 1], scale: [1, 1.1, 1] } } },
    },
  },
  search: {
    svg: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
    animations: { default: { root: { ...inout, dur: 0.8, origin: 'bottom right', tracks: { rotate: [0, 17, -10, 5, -1, 0] } } } },
  },
  send: {
    svg: '<g data-part="group"><path d="M14.5,21.7c.1.3.4.4.7.3.1,0,.2-.2.3-.3L22,2.7c0-.3,0-.5-.3-.6-.1,0-.2,0-.3,0L2.3,8.5c-.3,0-.4.4-.3.6,0,.1.2.2.3.3l7.9,3.2c.5.2.9.6,1.1,1.1l3.2,7.9Z"/><path d="M21.9,2.1l-10.9,10.9"/></g>',
    animations: {
      default: {
        group: {
          ...inout,
          dur: 1.2,
          tracks: { scale: [1, 0.8, 1, 1, 1], x: { v: [0, '-10%', '100%', '-125%', 0], times: [0, 0.25, 0.5, 0.5, 1] }, y: { v: [0, '10%', '-100%', '125%', 0], times: [0, 0.25, 0.5, 0.5, 1] } },
        },
      },
    },
  },
  trash: {
    svg: '<g data-part="group"><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M3 6h18"/></g><path data-part="lid" d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>',
    animations: {
      default: {
        group: { ...inout, dur: 0.3, tracks: { y: [0, -1] } },
        lid: { ...inout, dur: 0.3, tracks: { y: [0, 1], d: ['M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M19 8v12c0 1-1 2-2 2H7c-1 0-2-1-2-2V8'] } },
      },
    },
  },
  copy: {
    svg: '<rect data-part="rect" width="14" height="14" x="8" y="8" rx="2" ry="2"/><path data-part="path" d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    animations: { default: { rect: { ...inout, dur: 0.3, tracks: { x: [0, -3], y: [0, -3] } }, path: { ...inout, dur: 0.3, tracks: { x: [0, 3], y: [0, 3] } } } },
  },
  users: {
    svg: '<path data-part="path1" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path data-part="path2" d="M16 3.128a4 4 0 0 1 0 7.744"/><path data-part="path3" d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle data-part="circle" cx="9" cy="7" r="4"/>',
    animations: {
      default: {
        path1: { ...inout, dur: 0.6, delay: 0.1, tracks: { y: [0, 2, -2, 0] } },
        path2: { ...inout, dur: 0.6, tracks: { y: [0, 4, -2, 0] } },
        path3: { ...inout, dur: 0.6, tracks: { y: [0, 2, -2, 0] } },
        circle: { ...inout, dur: 0.6, delay: 0.1, tracks: { y: [0, 4, -2, 0] } },
      },
    },
  },
  settings: {
    svg: '<g data-part="group"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></g>',
    animations: { default: { group: { ...inout, dur: 1.25, tracks: { rotate: [0, 90, 180] } } } },
  },
  'layout-dashboard': {
    svg: '<rect data-part="rect1" width="7" height="9" x="3" y="3" rx="1" ry="1"/><rect data-part="rect2" width="7" height="5" x="14" y="3" rx="1" ry="1"/><rect data-part="rect3" width="7" height="9" x="14" y="12" rx="1" ry="1"/><rect data-part="rect4" width="7" height="5" x="3" y="16" rx="1" ry="1"/>',
    animations: {
      default: {
        rect1: { ...inout, dur: 0.3, tracks: { height: [9, 5] } },
        rect2: { ...inout, dur: 0.3, tracks: { height: [5, 9] } },
        rect3: { ...inout, dur: 0.3, tracks: { height: [9, 5], y: [0, 4] } },
        rect4: { ...inout, dur: 0.3, tracks: { height: [5, 9], y: [0, -4] } },
      },
    },
  },
  bell: {
    svg: '<path data-part="clapper" d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    animations: {
      default: {
        root: { ...inout, dur: 0.9, origin: 'top center', tracks: { rotate: [0, 20, -10, 10, -5, 3, 0] } },
        clapper: { ...inout, dur: 1.1, tracks: { x: [0, -6, 5, -5, 4, -3, 2, 0] } },
      },
    },
  },
  refresh: {
    svg: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    animations: { default: { root: { spring: SPRING_150_25, tracks: { rotate: [0, 45] } } } },
  },
  sun: {
    svg: `<circle cx="12" cy="12" r="4"/>${sunLines}`,
    animations: { default: sunAnimation },
  },
  moon: {
    svg: '<path data-part="path" d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
    animations: { default: { path: { ...inout, dur: 1.2, tracks: { rotate: { v: [0, -30, 400, 360], times: [0, 0.25, 0.75, 1] } } } } },
  },
};
export const ICON_NAMES = Object.keys(ICONS);

const known = (name) => {
  if (!ICONS[name]) throw new Error(`motion/icons: no icon called "${name}" (${ICON_NAMES.join(', ')})`);
  return ICONS[name];
};

export const iconSvg = (name, { size = 24, className = 'ani-icon', label } = {}) => {
  const icon = known(name);
  const a11y = label ? `role="img" aria-label="${String(label).replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  return `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false" data-icon="${name}" ${a11y}>${icon.svg}</svg>`;
};

// ── Playing ──
const TRANSFORMS = { x: (v) => `translateX(${typeof v === 'number' ? `${v}px` : v})`, y: (v) => `translateY(${typeof v === 'number' ? `${v}px` : v})`, rotate: (v) => `rotate(${v}deg)`, scale: (v) => `scale(${v})` };
const PLAIN = {
  opacity: (v) => ({ opacity: v }),
  dash: (v) => ({ strokeDasharray: v }),
  height: (v) => ({ height: `${v}px` }),
  d: (v) => ({ d: `path('${v}')` }),
};

const keyframesOf = (values, times, make, ease) => values.map((v, i) => ({ ...make(v), offset: times ? times[i] : i / (values.length - 1), ...(ease && i < values.length - 1 ? { easing: ease } : {}) }));

const playing = new WeakMap();
const partOf = (svg, key) => (key === 'root' ? svg : svg.querySelector(`[data-part="${key}"]`));

export const play = (svg, animation = 'default') => {
  stopNow(svg);
  const icon = known(svg.dataset.icon);
  if (reduced()) {
    const fade = svg.animate([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], { duration: REDUCED_FADE, easing: 'ease-out' });
    playing.set(svg, [fade]);
    return fade.finished.catch(() => {});
  }
  const spec = icon.animations[animation] ?? icon.animations.default;
  const running = [];
  for (const [key, part] of Object.entries(spec ?? {})) {
    const node = partOf(svg, key);
    if (!node) continue;
    node.style.transformBox = 'fill-box';
    node.style.transformOrigin = part.origin ?? 'center';
    const ease = part.ease === 'inout' ? EASE_IN_OUT : null;
    for (const [track, raw] of Object.entries(part.tracks)) {
      const values = Array.isArray(raw) ? raw : raw.v;
      const times = Array.isArray(raw) ? null : raw.times;
      const make = TRANSFORMS[track] ? (v) => ({ transform: TRANSFORMS[track](v) }) : PLAIN[track];
      const options = { duration: part.spring ? part.spring.duration : part.dur * 1000, delay: (part.delay ?? 0) * 1000, fill: 'both', composite: TRANSFORMS[track] ? 'add' : 'replace', easing: part.spring ? part.spring.easing : 'linear' };
      const anim = node.animate(keyframesOf(values, times, make, ease), options);
      anim.persist();
      running.push(anim);
    }
  }
  playing.set(svg, running);
  return Promise.all(running.map((a) => a.finished)).catch(() => {});
};

const stopNow = (svg) => {
  for (const a of playing.get(svg) ?? []) a.cancel();
  playing.delete(svg);
};

// Leaving plays the same animations backward, fast enough to take about 300 ms in all.
const leaving = new WeakSet();
export const stop = (svg) => {
  for (const a of playing.get(svg) ?? []) {
    if (leaving.has(a)) continue;
    if (reduced() || a.playState === 'idle') { a.cancel(); continue; }
    leaving.add(a);
    const at = Number(a.currentTime) || 0;
    if (at < 16) { a.cancel(); continue; }
    const rate = Math.max(1, at / ROUND_TRIP);
    a.updatePlaybackRate(-rate);
    a.addEventListener('finish', () => a.cancel(), { once: true });
    // A reverse that never reports its end (the tab hidden, the node detached) must not keep the part held.
    setTimeout(() => a.cancel(), at / rate + 120);
  }
};

// ── Mounting ──
const instances = new WeakMap();
export const mount = (el, opts = {}) => {
  if (instances.has(el)) return instances.get(el);
  const { name = el.dataset.icon, size = Number(el.dataset.size) || 24, trigger = el.dataset.trigger ?? 'hover', animation = el.dataset.animation ?? 'default', label = el.dataset.label } = opts;
  const built = !el.querySelector(':scope > svg[data-icon]');
  if (built) el.innerHTML = iconSvg(name, { size, label });
  const svg = el.querySelector(':scope > svg[data-icon]');
  const host = opts.host ?? el.closest('button, a[href], [data-icon-host]') ?? el;
  const off = [];
  const on = (target, type, fn) => { target.addEventListener(type, fn); off.push(() => target.removeEventListener(type, fn)); };
  const start = () => play(svg, animation);
  const end = () => stop(svg);
  if (trigger === 'hover') {
    on(host, 'pointerenter', (e) => { if (e.pointerType !== 'touch') start(); });
    on(host, 'pointerleave', end);
    on(host, 'focusin', () => { if (host.matches(':focus-visible')) start(); });
    on(host, 'focusout', end);
  } else if (trigger === 'tap') {
    on(host, 'pointerdown', start);
    on(host, 'pointerup', end);
    on(host, 'pointerleave', end);
  } else if (trigger === 'view') {
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { start(); io.disconnect(); } });
    io.observe(el);
    off.push(() => io.disconnect());
  }
  const api = {
    svg,
    play: start,
    stop: end,
    destroy() {
      off.forEach((fn) => fn());
      stopNow(svg);
      if (built) svg.remove();
      instances.delete(el);
    },
  };
  instances.set(el, api);
  return api;
};

if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-motion="icons"]')) mount(el);
