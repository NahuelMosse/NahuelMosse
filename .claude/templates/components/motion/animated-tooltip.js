// Animated tooltip, ported from Aceternity UI (ui/animated-tooltip). A row of overlapping avatars; over
// one, a dark tooltip rises from 20 px below at 0.6 scale on a bouncy spring (stiffness 260, damping 10)
// and, while the pointer moves across the avatar, tilts and slides: the pointer's offset from the avatar's
// center (-100..100) maps to -45..45 deg and -50..50 px, each through a spring (stiffness 100, damping 15)
// shared by every tooltip. Leaving, it falls back on a stiff spring. Two hairline gradients sit on its
// lower edge. Children of the element are the avatars: each carries `data-name` and `data-role`.
// Keyboard focus shows the tooltip untilted; a tap on touch keeps it until the next tap elsewhere.
// Reduced motion fades it in 120 ms with no travel, tilt or bounce.
import { follower, reduced } from '../core.js';
import { define, listeners, mapRange, node } from './ac-shared.js';

const FOLLOW = { stiffness: 100, damping: 15, mass: 1 };
const ENTER = { stiffness: 260, damping: 10, mass: 1 };
const EXIT = { stiffness: 500, damping: 25, mass: 1 };
const HIDDEN = [0, 20, 0.6];
const SHOWN = [1, 0, 1];
const FADE_MS = 140;
let count = 0;

export const mount = define('animated-tooltip', (el, opts) => {
  const items = [...el.querySelectorAll('[data-name]')];
  if (!items.length) throw new RangeError('animated-tooltip: needs children with data-name');
  const on = listeners();
  const added = [];
  el.classList.add('ac-tip');

  const rotate = follower(FOLLOW, ([r]) => el.style.setProperty('--ac-tip-r', `${r.toFixed(2)}deg`));
  const shift = follower(FOLLOW, ([x]) => el.style.setProperty('--ac-tip-x', `${x.toFixed(2)}px`));
  rotate.to([0], true);
  shift.to([0], true);

  const tips = items.map((item) => {
    const name = item.dataset.name.trim();
    if (!name) throw new RangeError('animated-tooltip: data-name is empty');
    if (!item.hasAttribute('aria-label')) { item.setAttribute('aria-label', name); added.push([item, 'aria-label']); }
    if (!item.matches('button, a[href], [tabindex]')) { item.setAttribute('tabindex', '0'); added.push([item, 'tabindex']); }
    return { item, name, role: item.dataset.role?.trim() ?? '', id: `ac-tip-${++count}`, node: null, leaving: false, timer: 0, spring: { ...ENTER }, follow: null };
  });
  let active = null;

  const remove = (t) => {
    clearTimeout(t.timer);
    t.follow?.stop();
    t.node?.remove();
    t.node = null;
    t.follow = null;
    t.leaving = false;
  };
  const build = (t) => {
    const tip = node('div', 'ac-tip__tip');
    tip.id = t.id;
    tip.setAttribute('role', 'tooltip');
    const name = node('span', 'ac-tip__name', { text: t.name });
    tip.append(node('span', 'ac-tip__line ac-tip__line--a', { decorative: true }), node('span', 'ac-tip__line ac-tip__line--b', { decorative: true }), name);
    if (t.role) tip.append(node('span', 'ac-tip__role', { text: t.role }));
    t.node = tip;
    t.follow = follower(t.spring, ([o, y, s]) => {
      tip.style.opacity = String(Math.min(1, Math.max(0, o)));
      tip.style.transform = `translate3d(var(--ac-tip-x, 0px), ${y.toFixed(2)}px, 0) scale(${s.toFixed(4)}) rotate(var(--ac-tip-r, 0deg))`;
      if (t.leaving && o === HIDDEN[0] && y === HIDDEN[1]) remove(t);
    }, 0.01);
    t.item.append(tip);
    return tip;
  };

  const show = (t) => {
    if (active && active !== t) hide(active);
    active = t;
    clearTimeout(t.timer);
    t.leaving = false;
    t.item.setAttribute('aria-describedby', t.id);
    if (reduced()) {
      const tip = t.node ?? build(t);
      t.follow.stop();
      tip.style.opacity = '';
      tip.style.transform = '';
      tip.dataset.reduced = '';
      void tip.offsetWidth;
      tip.dataset.state = 'in';
      return;
    }
    const fresh = !t.node;
    const tip = t.node ?? build(t);
    delete tip.dataset.reduced;
    delete tip.dataset.state;
    if (fresh) t.follow.to(HIDDEN, true);
    Object.assign(t.spring, ENTER);
    t.follow.to(SHOWN);
  };
  const hide = (t) => {
    if (active === t) active = null;
    if (!t.node || t.leaving) return;
    t.leaving = true;
    t.item.removeAttribute('aria-describedby');
    if (reduced() || t.node.dataset.reduced !== undefined) {
      t.node.dataset.state = 'out';
      t.timer = setTimeout(() => remove(t), FADE_MS);
      return;
    }
    Object.assign(t.spring, EXIT);
    t.follow.to(HIDDEN);
  };

  let frame = 0;
  const track = (t, e) => {
    if (e.pointerType === 'touch' || reduced()) return;
    const r = t.item.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      rotate.to([mapRange(x, [-100, 100], [-45, 45])]);
      shift.to([mapRange(x, [-100, 100], [-50, 50])]);
    });
  };

  for (const t of tips) {
    on(t.item, 'pointerenter', (e) => { show(t); track(t, e); });
    on(t.item, 'pointermove', (e) => track(t, e));
    on(t.item, 'pointerleave', (e) => { if (e.pointerType !== 'touch') hide(t); });
    on(t.item, 'focus', () => { show(t); rotate.to([0]); shift.to([0]); });
    on(t.item, 'blur', () => hide(t));
    on(t.item, 'keydown', (e) => { if (e.key === 'Escape' && t.node && !t.leaving) { hide(t); e.stopPropagation(); } });
  }
  on(document, 'pointerdown', (e) => { if (active && !active.item.contains(e.target)) hide(active); });

  return {
    destroy() {
      on.off();
      cancelAnimationFrame(frame);
      rotate.stop();
      shift.stop();
      for (const t of tips) { remove(t); t.item.removeAttribute('aria-describedby'); }
      for (const [item, attr] of added) item.removeAttribute(attr);
      el.classList.remove('ac-tip');
      el.style.removeProperty('--ac-tip-r');
      el.style.removeProperty('--ac-tip-x');
    },
  };
});
