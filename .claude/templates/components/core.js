// What every module of the component set shares: motion helpers, the words the components say, the
// locale, FLIP, placement of a floating panel and the icons a component draws by itself. No
// component lives here; components.js and overlays.js import from it.
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
export const once = (el, key) => (el.dataset[key] ? false : (el.dataset[key] = '1'));
// What a mount puts on the window or the document and the observers it starts, so its `destroy()` takes them
// back: listeners go with `{ signal }` and observers are handed to `watch`. `forever` is for what lives as long
// as the page.
export const scope = () => {
  const controller = new AbortController();
  const observers = new Set();
  return {
    signal: controller.signal,
    watch(observer) { observers.add(observer); return observer; },
    destroy() { controller.abort(); for (const o of observers) o.disconnect(); observers.clear(); },
  };
};
export const forever = { signal: undefined, watch: (observer) => observer };
export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const spring = () => css('--spring') || 'cubic-bezier(0.23, 1, 0.32, 1)';
export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
// A duration in a token ("440ms var(--spring-pop)", "2400ms linear") as milliseconds.
export const ms = (name, fallback = 0) => { const m = /(-?[\d.]+)(ms|s)\b/.exec(css(name)); return m ? parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1) : fallback; };

// ── The set's spring integrator: semi-implicit Euler at 1/240 s. A follower runs it frame by frame
// toward a moving target; `springEasing` runs it once, from rest to 1, and writes the curve as a CSS
// `linear()` (the tokens `--spring-pop` and `--spring-list` are its output). ──
export const SPRING_STEP = 1 / 240;
export const stepSpring = (spring, pos, vel, target, h) => {
  const v = vel + ((-spring.stiffness * (pos - target) - spring.damping * vel) / spring.mass) * h;
  return [pos + v * h, v];
};
// The numbers of a spring token ("stiffness damping mass"), and a follower: it moves a vector toward a
// target with that spring; `apply` is called every frame and once more at rest.
export const springOf = (name, fallback) => {
  const [stiffness, damping, mass] = (css(name) || fallback).split(/\s+/).map(Number);
  return { stiffness, damping, mass };
};
// `hint` lists the elements the spring moves: they carry `will-change: transform` only while it runs.
export const follower = (spring, apply, rest = 0.05, hint = []) => {
  let pos = [];
  let vel = [];
  let target = [];
  let raf = 0;
  let last = 0;
  const promote = (on) => { for (const el of hint) el.style.willChange = on ? 'transform' : ''; };
  const frame = (now) => {
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (; dt > 0; dt -= SPRING_STEP) {
      const h = Math.min(dt, SPRING_STEP);
      for (let i = 0; i < pos.length; i++) [pos[i], vel[i]] = stepSpring(spring, pos[i], vel[i], target[i], h);
    }
    const rested = pos.every((p, i) => Math.abs(p - target[i]) < rest && Math.abs(vel[i]) < rest * 20);
    if (rested) { pos = [...target]; vel = target.map(() => 0); raf = 0; promote(false); }
    apply(pos);
    if (!rested) raf = requestAnimationFrame(frame);
  };
  return {
    to(next, jump) {
      target = next;
      if (jump || !pos.length) { cancelAnimationFrame(raf); raf = 0; pos = [...next]; vel = next.map(() => 0); promote(false); apply(pos); return; }
      if (!raf) { last = performance.now(); promote(true); raf = requestAnimationFrame(frame); }
    },
    stop() { cancelAnimationFrame(raf); raf = 0; promote(false); },
  };
};
export const springEasing = (stiffness, damping, mass = 1, points = 20) => {
  const spring = { stiffness, damping, mass };
  let x = 0;
  let v = 0;
  const run = [0];
  while (run.length < 240 * 4 && (run.length < 3 || Math.abs(x - 1) > 0.0005 || Math.abs(v) > 0.005)) { [x, v] = stepSpring(spring, x, v, 1, SPRING_STEP); run.push(x); }
  const at = (i) => (i === points ? 1 : run[Math.round((i * (run.length - 1)) / points)]);
  return `linear(${Array.from({ length: points + 1 }, (_, i) => +at(i).toFixed(3)).join(', ')})`;
};
export const uid = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 7)}`;
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Accent- and case-insensitive text for matching what a person types.
export const fold = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// The words the components say: a screen overrides them with its language (`ui.messages`).
export const messages = {
  notifications: 'Notifications',
  dismiss: 'Dismiss',
  close: 'Close',
  edit: 'Edit',
  saveFailed: 'Could not save. The previous value is back.',
  noMatches: 'No matches',
  noResults: 'No results',
  noResultsFor: (query) => `No results for “${query}”. Try another word or clear the search.`,
  notAnOption: 'Choose an option from the list',
  notAnOptionOrCreate: (text) => `Choose an option or create “${text}”`,
  create: (text) => `Create “${text}”`,
  showOptions: 'Show options',
  placeholder: 'Choose',
  deltaNew: 'new',
  deltaFlat: 'no change',
  deltaVersus: (label) => `vs ${label}`,
  previousPeriod: 'previous month',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  today: 'Today',
  thisWeek: 'This week',
  thisMonth: 'This month',
  last30Days: 'Last 30 days',
  clear: 'Clear',
  calendar: 'Calendar',
  rangeSeparator: ' – ',
  paletteRecent: 'Recent',
  paletteIn: (title) => `Search in ${title}`,
  paletteNavigate: 'navigate',
  paletteOpen: 'open',
  paletteBack: 'back',
  paletteClose: 'close',
  stillLoading: 'Still loading…',
  upToDate: 'all clear',
  firstInvoice: 'You created your first invoice',
  record: 'Record',
  recordMonth: 'Record month: you billed more than ever',
  dragHandle: 'Drag, or press Space to move',
  grabbed: (name) => `${name} grabbed. Arrows move it, Space drops it.`,
  moved: (name, position, total, list) => (list ? `${name}, ${list}, position ${position} of ${total}.` : `${name}, position ${position} of ${total}.`),
  dropped: (name, position, list) => (list ? `${name} dropped in ${list} at position ${position}.` : `${name} dropped at position ${position}.`),
  dragCancelled: (name) => `${name} moved back. Cancelled.`,
  codeLabel: (n) => `${n}-digit code`,
  codeVerified: 'Verified',
  codeReopen: 'Verified. Press Enter to type a new code',
  codeWrong: 'The code does not match. Check it or ask for a new one.',
  checklistCount: (done, total) => `${done} of ${total}`,
  checklistAdded: (name) => `${name} added`,
  slideKeys: 'Press Enter to confirm',
  tagRemove: (name) => `Remove ${name}`,
  tagAdded: (name) => `${name} added`,
  tagRemoved: (name) => `${name} removed`,
  tagRepeated: (name) => `${name} is already in the list`,
  tagFull: (max) => `Up to ${max}`,
  amountMin: (v) => `The minimum is ${v}`,
  amountMax: (v) => `The maximum is ${v}`,
  pageRange: (from, to, total) => `${from}–${to} of ${total}`,
  pagePrevious: 'Previous page',
  pageNext: 'Next page',
  page: (n) => `Page ${n}`,
};

// The set's single configuration, read by every formatter: `locale` (else the page's `data-locale`, else its
// language), `currency` (an ISO code; there is no default, a money figure without one is an error) and `timeZone`
// (an IANA name; else the browser's, written out on every call, never left implicit).
export const config = { locale: null, currency: null, timeZone: null };
export const configure = (next) => {
  for (const [key, value] of Object.entries(next)) {
    if (!(key in config)) throw new RangeError(`configure: unknown option "${key}" (${Object.keys(config).join(', ')})`);
    config[key] = value;
  }
  return config;
};
// The locale is `data-locale` on the element or an ancestor (the page sets it on the root), else `config.locale`, else the
// page language: numbers, currency and dates all read it, so a screen is localized in one place.
export const locale = (el) => el?.closest?.('[data-locale]')?.dataset.locale ?? document.documentElement.dataset.locale ?? config.locale ?? (document.documentElement.lang || 'en');
export const timeZone = () => config.timeZone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone;
export const currencyOf = (currency) => {
  const code = currency ?? config.currency;
  if (!code) throw new RangeError('format.currency: no currency; pass one or set it with configure({ currency })');
  return code;
};
export const format = {
  number: (value, options, el) => new Intl.NumberFormat(locale(el), options).format(value),
  currency: (value, currency, options, el) => new Intl.NumberFormat(locale(el), { style: 'currency', currency: currencyOf(currency), ...options }).format(value),
  percent: (value, options, el) => new Intl.NumberFormat(locale(el), { style: 'percent', maximumFractionDigits: 1, ...options }).format(value),
  date: (value, options, el) => new Intl.DateTimeFormat(locale(el), { timeZone: timeZone(), ...(options ?? { day: '2-digit', month: '2-digit', year: 'numeric' }) }).format(value),
};

// The change of a figure against its previous period, as words and as a direction. `trend` is the
// direction; `tone` says whether that direction is good (`good` is the direction that is). A
// percentage of nothing is not a number: when the period before was zero it says "new" and nothing
// else, so no figure is ever compared against a zero.
export const describeChange = (current, previous, { good = 'up', mode = 'percent', versus = '', el } = {}) => {
  const diff = current - previous;
  const trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const arrow = trend === 'up' ? '↑' : '↓';
  const fresh = mode === 'percent' && previous === 0 && trend !== 'flat';
  let text;
  if (trend === 'flat') text = messages.deltaFlat;
  else if (fresh) text = `${arrow} ${messages.deltaNew}`;
  else text = `${arrow} ${mode === 'percent' ? format.percent(Math.abs(diff) / previous, undefined, el) : format.number(Math.abs(diff), undefined, el)}`;
  return { trend, tone: trend === 'flat' ? 'neutral' : trend === good ? 'success' : 'danger', text: versus && trend !== 'flat' && !fresh ? `${text} ${messages.deltaVersus(versus)}` : text };
};

// A shortcut is written once with `Mod` for the platform key: ⌘ on a Mac, Ctrl elsewhere.
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform ?? '') || /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform ?? '');
export const keyLabel = (shortcut) => shortcut.replace(/^Mod\s*/, isMac() ? '⌘' : 'Ctrl ');

// 16 px line drawings a component draws by itself (a page's own icons come from its sprite). The ones
// that move by parts carry `data-part` on each piece, and the strokes that draw themselves have
// `pathLength="1"`: a `<use>` of the sprite keeps its content in a shadow tree that CSS cannot reach,
// so `inlineIcons` swaps those for these drawings.
const ICONS = {
  check: '<path pathLength="1" d="M3.5 8.5l3 3 6-7"/>',
  chevron: '<path d="M4 6l4 4 4-4"/>',
  'chevron-up': '<path d="M4 10l4-4 4 4"/>',
  'chevron-right': '<path d="M6 4l4 4-4 4"/>',
  'chevron-left': '<path d="M10 4L6 8l4 4"/>',
  x: '<path data-part="a" d="M3.5 3.5l9 9"/><path data-part="b" d="M12.5 3.5l-9 9"/>',
  alert: '<path d="M8 4.5v4.5M8 11.5v.01"/>',
  info: '<path d="M8 7v4.5M8 4.5v.01"/>',
  calendar: '<path d="M3 4.5h10v8.5H3zM3 7.5h10M5.5 2.5v3M10.5 2.5v3"/>',
  receipt: '<path data-part="paper" pathLength="1" d="M3.5 2.5h9v11l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1z"/><path data-part="lines" pathLength="1" d="M6 6h4M6 9h4"/>',
  users: '<circle data-part="head" cx="6" cy="5.5" r="2.5"/><path data-part="body" d="M1.5 13c.3-2.4 2.2-3.8 4.5-3.8s4.2 1.4 4.5 3.8"/><path data-part="side" d="M10.5 3.2a2.4 2.4 0 0 1 0 4.6M12 9.5c1.6.5 2.4 1.7 2.6 3.5"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
  refresh: '<path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  sliders: '<path d="M2 4.5h6M11 4.5h3M2 11.5h3M8 11.5h6"/><circle data-part="k1" cx="9.5" cy="4.5" r="1.5"/><circle data-part="k2" cx="6.5" cy="11.5" r="1.5"/>',
  contrast: '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor"/>',
  grid: '<rect data-part="q1" x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect data-part="q2" x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect data-part="q3" x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect data-part="q4" x="9" y="9" width="4.5" height="4.5" rx="1"/>',
  send: '<path d="M14 2L7 9M14 2l-4.5 12-2.5-5.5L1.5 6z"/>',
  trash: '<path data-part="lid" d="M3 4.5h10M6.5 4.5V3h3v1.5"/><path data-part="body" d="M4.5 4.5l.5 8.5h6l.5-8.5M7 7v4M9 7v4"/>',
  copy: '<rect data-part="front" x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path data-part="back" d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>',
  duplicate: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2M9.5 7.5v4M7.5 9.5h4"/>',
  archive: '<path d="M2.5 3.5h11v3h-11zM3.5 6.5v6a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-6M6.5 9h3"/>',
  note: '<path d="M3.5 2.5h6l3 3v8h-9zM9.5 2.5v3h3M5.5 8.5h5M5.5 11h3"/>',
  swap: '<path d="M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8l-2.5 2.5L6 13"/>',
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/>',
  warning: '<path d="M8 2.5l6 10.5H2zM8 6.5v3M8 11.25v.01"/>',
  'arrow-up': '<path d="M8 13V3M4 7l4-4 4 4"/>',
  'arrow-down': '<path d="M8 3v10M4 9l4 4 4-4"/>',
  'party-popper':'<path data-part="cone" d="M2.5 13.5l3-8 5 5z"/><path data-part="bit" d="M8.5 3.5l.7-1.7M11 6.2l1.8-.6M9.8 8.2l2.7 1.3"/>',
};
export const icon = (name, className = 'icon') => `<svg class="${className}" viewBox="0 0 16 16" aria-hidden="true" data-icon="${name}">${ICONS[name] ?? ''}</svg>`;
// A page's `<use href="#i-name">` becomes the set's own drawing of that icon, so its parts can move.
const MOVING = new Set(['check', 'x', 'receipt', 'users', 'search', 'refresh', 'plus', 'sliders', 'grid', 'send', 'trash', 'copy']);
export const inlineIcons = (root = document) => {
  for (const use of root.querySelectorAll('svg > use[href^="#i-"]')) {
    const name = use.getAttribute('href').slice(3);
    if (!MOVING.has(name)) continue;
    const svg = use.parentElement;
    svg.innerHTML = ICONS[name];
    svg.dataset.icon = name;
  }
};

// Where `el` sits inside `box`, summed through the offset parents: it ignores transforms (a panel
// mid-scale) and follows the scroll of a scrolling box.
export const offsetIn = (el, box) => {
  let x = 0;
  let y = 0;
  let n = el;
  while (n && n !== box) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return n === box ? [x, y] : null;
};

// A highlight pill is a 100 × 100 element scaled and moved onto an item with transform; its corners are
// compensated so the radius stays the item's. `instant` places it without the transition.
export const makePill = (cls = 'hl') => {
  const node = Object.assign(document.createElement('span'), { className: cls });
  node.setAttribute('aria-hidden', 'true');
  return node;
};
export const placePill = (node, item, container, { bleed = [0, 0], instant = false, radius: fixed } = {}) => {
  const at = offsetIn(item, container);
  if (!at) return false;
  const w = item.offsetWidth + bleed[0] * 2;
  const h = item.offsetHeight + bleed[1] * 2;
  const radius = fixed ?? (parseFloat(getComputedStyle(item).borderTopLeftRadius) || 0);
  if (instant) node.setAttribute('data-instant', '');
  node.style.transform = `translate(${at[0] - bleed[0]}px, ${at[1] - bleed[1]}px) scale(${w / 100}, ${h / 100})`;
  node.style.borderRadius = `${radius / (w / 100)}px / ${radius / (h / 100)}px`;
  if (instant) { void node.offsetWidth; node.removeAttribute('data-instant'); }
  return true;
};

// The one highlight of a menu, a list or the palette, for the pointer and the keyboard alike. It appears
// in place on the item that is active when the panel opens and slides from there; two steps within 80 ms
// ask for the short slide; a danger item tints it. `reset` is called when the panel opens or closes.
export const listPill = (container) => {
  const node = makePill();
  container.prepend(node);
  let live = false;
  let last = 0;
  const api = {
    node,
    attach() { if (node.parentElement !== container) container.prepend(node); },
    show(item) {
      if (!item) { api.hide(); return; }
      api.attach();
      const now = performance.now();
      node.toggleAttribute('data-fast', live && now - last < 80);
      last = now;
      if (item.matches('[data-tone="danger"], .menu__item--danger')) node.dataset.tone = 'danger'; else node.removeAttribute('data-tone');
      if (!placePill(node, item, container, { instant: !live || reduced() })) return;
      live = true;
      node.setAttribute('data-on', '');
    },
    hide() { node.removeAttribute('data-on'); live = false; },
  };
  return api;
};

// FLIP: measure, change, invert, play. A second change mid-flight starts from where the node is drawn
// (the flight in progress is replaced, not stacked on), so two overlapping slides never add up to more than
// the distance the node really is from its place. Returns the animations it started, so a caller can hold
// something until they end.
const flights = new WeakMap();
export const flying = (n) => { const f = flights.get(n); return f && f.playState === 'running' ? f : null; };
export const flip = (items, change, duration = 240, easing = spring()) => {
  const before = new Map(items.map((n) => [n, n.getBoundingClientRect()]));
  change();
  const played = [];
  for (const n of items) flights.get(n)?.cancel();
  if (reduced()) return played;
  for (const n of items) {
    if (!n.isConnected || n.hasAttribute('data-dragging')) continue;
    const b = before.get(n);
    const a = n.getBoundingClientRect();
    const dx = b.left - a.left;
    const dy = b.top - a.top;
    if (dx || dy) {
      const run = n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration, easing, composite: 'add' });
      flights.set(n, run);
      played.push(run);
    }
  }
  return played;
};

// A hue from a name, so the same person always has the same tint.
export const hueOf = (text) => { let h = 0; for (const ch of String(text).trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };

// A fade for when motion is reduced: what would have travelled only changes opacity, in 100–150 ms.
export const fade = (el, duration = 140) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: EASE_OUT });

// ── Life: what every effect shares ──

// A text that changes is a swap: what arrives comes from below (from above if `dir` is −1) and fades in
// in 160 ms. With reduced motion it only fades. Where it is not visible there is nothing to animate.
export const swapIn = (el, dir = 1) => {
  if (!el?.isConnected || !el.getClientRects().length) return;
  if (reduced()) { fade(el, 120); return; }
  const y = (parseFloat(css('--swap-y')) || 6) * dir;
  el.animate([{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: 'none' }], { duration: 160, easing: EASE_OUT });
};
// A label that shimmers while something is pending: the text twice, a faint one under and a lit one in a
// moving window (the stylesheet counter-translates them, so the text stays where it is and the light goes).
export const shimmerHtml = (text) => `<span class="shimmer"><span class="shimmer__base">${escapeHtml(text)}</span><span class="shimmer__band" aria-hidden="true"><span class="shimmer__copy">${escapeHtml(text)}</span></span></span>`;

// A state attribute that stands for a CSS animation comes off when it ends, and also when a timer says it
// should have: an element that is hidden meanwhile never runs its animation, so never ends it.
export const endOf = (el, attr, within) => {
  const off = () => el.removeAttribute(attr);
  el.addEventListener('animationend', off, { once: true });
  setTimeout(off, within);
};

// Anything that repeats runs only while it is on screen, the tab is showing and motion is not reduced.
// `start(el)` begins it and returns the function that stops it; the gate calls them as the element
// enters and leaves the viewport or the tab hides and shows again.
export const whileVisible = (el, start, life = forever) => {
  let stop = null;
  let seen = false;
  const sync = () => {
    const on = seen && !document.hidden && !reduced();
    if (on && !stop) stop = start(el) ?? (() => {});
    else if (!on && stop) { stop(); stop = null; }
  };
  const io = life.watch(new IntersectionObserver(([entry]) => { seen = entry.isIntersecting; sync(); }));
  io.observe(el);
  document.addEventListener('visibilitychange', sync, { signal: life.signal });
  return { destroy() { io.disconnect(); document.removeEventListener('visibilitychange', sync); stop?.(); stop = null; } };
};
// The CSS loops (a skeleton's sheen, an indeterminate bar) pause off screen: `data-offscreen` is what
// the stylesheet reads, and `data-tab-hidden` on the root says the tab is not showing.
const watched = new WeakSet();
let offscreen;
// Every sheen band of a skeleton starts at the timeline's origin, so the bands of a page sweep in one phase:
// the ones that were there, the ones a load adds and the ones that come back into view.
export const alignSheen = (root = document) => {
  void (root.nodeType === 9 ? document.body : root).offsetWidth;
  for (const a of document.getAnimations()) {
    const target = a.effect?.target;
    if (a.animationName === 'sheen' && (root.nodeType === 9 || root.contains(target)) && !target.closest('[data-offscreen]')) a.startTime = 0;
  }
};
export const pauseOffscreen = (el) => {
  if (watched.has(el)) return;
  watched.add(el);
  offscreen ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      e.target.toggleAttribute('data-offscreen', !e.isIntersecting);
      if (e.isIntersecting) alignSheen(e.target);
    }
  });
  offscreen.observe(el);
};
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.documentElement.toggleAttribute('data-tab-hidden', document.hidden));

// Hover with intent: the pointer has to stay `wait` ms before `play` runs, so sweeping across a toolbar
// does not set six things off. Only a mouse answers; the keyboard never does. `play` runs once per
// hover and `leave` (if any) when the pointer goes.
export const intent = (el, play, wait = 100, leave) => {
  let timer = 0;
  const cancel = () => { clearTimeout(timer); timer = 0; };
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || !finePointer()) return;
    cancel();
    timer = setTimeout(() => { timer = 0; play(); }, wait);
  });
  el.addEventListener('pointerleave', () => { cancel(); leave?.(); });
  el.addEventListener('pointerdown', cancel);
  return { cancel };
};

// What plays once: per session (`sessionStorage`) or once in a lifetime (`localStorage`). It answers
// whether this is the first time and remembers it; storage that is not there (a private window) means
// every time, never an error.
export const playOnce = (key, scope = 'session') => {
  const store = scope === 'life' ? 'localStorage' : 'sessionStorage';
  try {
    if (window[store].getItem(key)) return false;
    window[store].setItem(key, '1');
  } catch { /* no storage: it plays */ }
  return true;
};
export const forget = (prefix) => {
  for (const store of ['localStorage', 'sessionStorage']) {
    try { for (const k of Object.keys(window[store])) if (k.startsWith(prefix)) window[store].removeItem(k); } catch { /* no storage */ }
  }
};

// A celebration is a preference as well as a motion: `data-celebrate="off"` on the root and reduced
// motion cancel it, and only one runs at a time, the others wait their turn. `play` returns a promise
// that settles when the last of its nodes is gone. Whatever the celebration does, the screen says it in
// words too (a toast with role=status): motion is never the only signal.
export const celebrating = () => document.documentElement.dataset.celebrate !== 'off' && !reduced();
const waiting = [];
let busy = false;
const next = async () => {
  if (busy || !waiting.length) return;
  busy = true;
  const { play, done } = waiting.shift();
  try { await play(); } finally { busy = false; done(); next(); }
};
export const celebrate = (play) => {
  if (!celebrating()) return Promise.resolve(false);
  return new Promise((resolve) => { waiting.push({ play, done: () => resolve(true) }); next(); });
};

// Where a floating panel goes: under its anchor when it fits, above when it does not (or beside it
// for a submenu), aligned to the start or the end of it. The anchor is an element or a point
// (a context menu). Writes the origin the panel grows from and returns whether it opened below.
// When neither side has room the roomier one wins and the panel scrolls.
// While it stays open the panel follows its anchor through any scroll and resize (a point anchor
// moves with the page), keeps the side it opened on while that side still fits, and hides while the
// anchor is out of the window.
const placed = new Map();
let following = 0;
const follow = () => {
  following = 0;
  for (const [panel, at] of placed) {
    if (!panel.isConnected || !panel.checkVisibility()) { placed.delete(panel); panel.style.visibility = ''; continue; }
    const anchor = at.anchor instanceof Element ? at.anchor : { x: at.anchor.x + at.sx - scrollX, y: at.anchor.y + at.sy - scrollY };
    const r = anchor instanceof Element ? anchor.getBoundingClientRect() : new DOMRect(anchor.x, anchor.y, 0, 0);
    panel.style.visibility = r.bottom < 0 || r.top > innerHeight ? 'hidden' : '';
    at.below = put(panel, anchor, { ...at.opts, keep: at.below });
  }
};
const schedule = (e) => {
  if (!placed.size || following || (e.target instanceof Element && [...placed.keys()].some((panel) => panel.contains(e.target)))) return;
  following = requestAnimationFrame(follow);
};
addEventListener('scroll', schedule, { capture: true, passive: true });
addEventListener('resize', schedule, { passive: true });
// Every list that drops opens the same way: its first six entries rise 4 px and fade in, 15 ms apart, so the list
// reads top to bottom as it appears. The panel itself scales in by its own CSS; the chevron of its trigger turns.
export const CASCADE = '[role=option], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio]';
export const cascade = (panel, selector = CASCADE, max = 6) => {
  if (reduced()) return;
  [...panel.querySelectorAll(selector)].filter((n) => n.getClientRects().length).slice(0, max).forEach((n, i) => n.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 140, delay: i * 15, easing: EASE_OUT, fill: 'backwards' }));
};
export const place = (panel, anchor, opts = {}) => {
  const at = { anchor, opts, sx: scrollX, sy: scrollY };
  placed.set(panel, at);
  return (at.below = put(panel, anchor, opts));
};
const put = (panel, anchor, { align = 'start', side = 'bottom', matchWidth = false, gap = 6, keep } = {}) => {
  const r = anchor instanceof Element ? anchor.getBoundingClientRect() : new DOMRect(anchor.x, anchor.y, 0, 0);
  panel.style.maxHeight = '';
  if (matchWidth) panel.style.minWidth = `${Math.round(r.width)}px`;
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  const edge = 8;
  if (side === 'right') {
    const room = innerWidth - r.right - edge;
    const toRight = room >= w || r.left - edge < w;
    let left = toRight ? r.right + 2 : r.left - w - 2;
    let top = r.top - 5;
    // On a phone neither side has room: the submenu is held inside the window, over its parent, and drops
    // under the item that opened it (above it when the foot of the window is near), so that item stays in view.
    if (left < edge || left + w > innerWidth - edge) {
      left = Math.max(edge, Math.min(left, innerWidth - w - edge));
      top = r.bottom + 2 + h <= innerHeight - edge ? r.bottom + 2 : r.top - h - 2;
    }
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(edge, Math.min(top, innerHeight - h - edge))}px`;
    panel.style.setProperty('--_origin', `top ${toRight ? 'left' : 'right'}`);
    panel.style.setProperty('--_sy', '0px');
    panel.removeAttribute('data-side');
    return true;
  }
  const roomBelow = innerHeight - r.bottom - gap - edge;
  const roomAbove = r.top - gap - edge;
  const fits = keep === undefined ? false : keep ? h <= roomBelow : h <= roomAbove;
  const below = fits ? keep : h <= roomBelow || (h > roomAbove && roomBelow >= roomAbove);
  const room = below ? roomBelow : roomAbove;
  if (h > room) panel.style.maxHeight = `${Math.max(120, room)}px`;
  const height = Math.min(h, Math.max(120, room));
  const left = align === 'end' ? r.right - w : r.left;
  panel.style.left = `${Math.max(edge, Math.min(left, innerWidth - w - edge))}px`;
  panel.style.top = `${below ? r.bottom + gap : r.top - height - gap}px`;
  panel.style.setProperty('--_origin', `${below ? 'top' : 'bottom'} ${align === 'end' ? 'right' : 'left'}`);
  panel.style.setProperty('--_sy', below ? '-4px' : '4px');
  panel.dataset.side = below ? 'bottom' : 'top';
  return below;
};
