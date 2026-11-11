// Floating dock, ported from Aceternity UI (ui/floating-dock). Desktop: a bar of round tiles, 40 px at
// rest, that grow toward the pointer: a tile's size maps its distance from the pointer's x (-150..0..150
// px) to 40..80..40 px (the icon inside is always half of it), each size following that target on a spring
// (mass 0.1, stiffness 150, damping 12). The bar keeps its height, so the tiles grow upward and the bar
// widens around them. Every tile has a label that rises over it. Mobile (under 768 px): one round button
// opens a column of tiles that rise in one after another (50 ms apart, bottom first) and leave top first.
// The children of the element are the links: `<a href aria-label|data-title>` holding an icon.
//
// Size is never a layout property here: a tile is `scale()`d from its bottom center, moved sideways by what
// the tiles before it gained, and the bar's plate is scaled in x with its corner radius counter-scaled
// through `clip-path`, so a frame costs no layout. Keyboard focus magnifies the focused tile as the pointer
// would. Reduced motion keeps every tile at rest size and fades the labels in 120 ms.
import { follower, reduced } from '../core.js';
import { define, listeners, mapRange, node } from './ac-shared.js';

const SPRING = { stiffness: 150, damping: 12, mass: 0.1 };
const REST = 40;
const PEAK = 80;
const REACH = 150;
const STAGGER_MS = 50;
const MENU_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 9h16"/><path d="M9 14l3-3 3 3"/></svg>';
let count = 0;

const titleOf = (a) => (a.dataset.title ?? a.getAttribute('aria-label') ?? a.textContent).trim();

export const mount = define('floating-dock', (el, opts) => {
  const links = [...el.querySelectorAll(':scope > a[href]')];
  if (!links.length) throw new RangeError('floating-dock: needs children <a href>');
  const on = listeners();
  const id = `ac-dock-${++count}`;
  const label = opts.label ?? el.dataset.label ?? 'Quick actions';
  const labelled = [];
  const marks = links.map((a) => ({ a, mark: document.createComment('ac-dock'), title: titleOf(a) }));
  for (const m of marks) { if (!m.title) throw new RangeError('floating-dock: every link needs a title'); m.a.before(m.mark); }
  el.classList.add('ac-dock');

  // ── desktop ──
  const bar = node('div', 'ac-dock__bar');
  const plate = node('span', 'ac-dock__plate', { decorative: true });
  bar.append(plate);
  const slots = marks.map(({ a, title }) => {
    const tile = node('span', 'ac-dock__tile');
    const icon = node('span', 'ac-dock__icon');
    icon.append(...[...a.childNodes].filter((n) => !(n.nodeType === 1 && n.classList.contains('ac-dock__label'))));
    tile.append(icon);
    const tip = node('span', 'ac-dock__label', { text: title });
    tip.setAttribute('aria-hidden', 'true');
    a.classList.add('ac-dock__link');
    if (!a.hasAttribute('aria-label')) { a.setAttribute('aria-label', title); labelled.push(a); }
    a.append(tile, tip);
    bar.append(a);
    return { a, tile, tip, size: REST, follow: null };
  });

  const barWidth = () => bar.offsetWidth;
  const plateRadius = () => parseFloat(getComputedStyle(plate).getPropertyValue('--ac-dock-radius')) || 16;
  const layout = () => {
    const extra = slots.map((s) => s.size - REST);
    const total = extra.reduce((a, b) => a + b, 0);
    let before = 0;
    slots.forEach((s, i) => {
      const k = s.size / REST;
      const dx = before + extra[i] / 2 - total / 2;
      before += extra[i];
      s.a.style.transform = `translateX(${dx.toFixed(2)}px)`;
      s.tile.style.transform = `scale(${k.toFixed(4)})`;
      s.a.style.setProperty('--ac-dock-grow', `${extra[i].toFixed(2)}px`);
    });
    const w = barWidth();
    if (!w) return;
    const sx = (w + total) / w;
    const r = plateRadius();
    plate.style.transform = `scaleX(${sx.toFixed(4)})`;
    plate.style.clipPath = `inset(0 round ${(r / sx).toFixed(2)}px / ${r}px)`;
  };
  for (const s of slots) {
    s.follow = follower(SPRING, ([v]) => { s.size = v; layout(); }, 0.05);
    s.follow.to([REST], true);
  }

  let pointer = Infinity;
  let focused = null;
  // Distances are taken against each slot's own center without its sideways shift, so a target does
  // not depend on how far the tiles have moved: the slot rect is read with the shift removed.
  const center = (s) => {
    const r = s.a.getBoundingClientRect();
    const shift = parseFloat(/translateX\((-?[\d.]+)px\)/.exec(s.a.style.transform)?.[1] ?? '0');
    return r.left + r.width / 2 - shift;
  };
  const aim = () => {
    const x = focused ? center(focused) : pointer;
    for (const s of slots) s.follow.to([reduced() ? REST : mapRange(x - center(s), [-REACH, 0, REACH], [REST, PEAK, REST])]);
  };

  let frame = 0;
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(aim); };
  on(bar, 'pointermove', (e) => { if (e.pointerType === 'touch') return; pointer = e.clientX; schedule(); });
  on(bar, 'pointerleave', () => { pointer = Infinity; schedule(); });
  for (const s of slots) {
    on(s.a, 'pointerenter', (e) => { if (e.pointerType !== 'touch') s.a.dataset.hover = ''; });
    on(s.a, 'pointerleave', () => delete s.a.dataset.hover);
    on(s.a, 'focus', () => { if (s.a.matches(':focus-visible')) { focused = s; s.a.dataset.hover = ''; schedule(); } });
    on(s.a, 'blur', () => { if (focused === s) focused = null; delete s.a.dataset.hover; schedule(); });
  }

  // ── mobile ──
  const mobile = node('div', 'ac-dock__mobile');
  const menu = node('div', 'ac-dock__menu');
  menu.id = `${id}-menu`;
  menu.style.setProperty('--n', String(links.length));
  const clones = marks.map(({ a, title }, i) => {
    const c = a.cloneNode(false);
    c.removeAttribute('style');
    c.removeAttribute('data-hover');
    c.className = 'ac-dock__m-item';
    c.style.setProperty('--i', String(i));
    c.setAttribute('aria-label', title);
    const glyph = node('span', 'ac-dock__m-icon');
    glyph.innerHTML = a.querySelector('.ac-dock__icon').innerHTML;
    c.append(glyph);
    menu.append(c);
    return c;
  });
  const toggle = node('button', 'ac-dock__toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', label);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', menu.id);
  toggle.innerHTML = MENU_ICON;
  mobile.append(menu, toggle);
  el.append(bar, mobile);

  const setOpen = (open, refocus = false) => {
    toggle.setAttribute('aria-expanded', String(open));
    if (open) menu.setAttribute('data-open', ''); else menu.removeAttribute('data-open');
    for (const c of clones) c.tabIndex = open ? 0 : -1;
    if (!open && refocus) toggle.focus();
  };
  setOpen(false);
  on(toggle, 'click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  on(mobile, 'keydown', (e) => { if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setOpen(false, true); e.stopPropagation(); } });
  on(document, 'pointerdown', (e) => { if (!mobile.contains(e.target)) setOpen(false); });
  on(menu, 'click', (e) => { if (e.target.closest('a')) setOpen(false); });

  layout();
  on(window, 'resize', layout);

  return {
    destroy() {
      on.off();
      cancelAnimationFrame(frame);
      for (const s of slots) s.follow.stop();
      for (const { a, mark } of marks) {
        const icon = a.querySelector('.ac-dock__icon');
        a.querySelector('.ac-dock__tile')?.remove();
        a.querySelector('.ac-dock__label')?.remove();
        if (icon) a.append(...icon.childNodes);
        a.classList.remove('ac-dock__link');
        a.removeAttribute('style');
        delete a.dataset.hover;
        mark.replaceWith(a);
      }
      bar.remove();
      mobile.remove();
      el.classList.remove('ac-dock');
      for (const a of labelled) a.removeAttribute('aria-label');
    },
  };
});
