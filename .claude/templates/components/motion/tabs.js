// Animated tabs, ported from Animate UI (registry/components/animate/tabs + primitives/animate/tabs +
// primitives/effects/highlight): one highlight that slides between triggers on a spring (stiffness 200,
// damping 25), and contents laid side by side on a track that slides on another (300 / 30) while the
// container follows the height of the active pane. A pane that is not active is blurred 4 px on the
// 200 / 25 spring and is `inert`. Reduced motion: the highlight jumps and the panes cross-fade in 140 ms.
//
//   <div data-motion="tabs" data-value="list">
//     <div class="tabs-au__list" role="tablist" aria-label="Vistas">
//       <button role="tab" data-value="list">Lista</button> …
//     </div>
//     <div class="tabs-au__contents"><div role="tabpanel" data-value="list">…</div> …</div>
//   </div>
//
// mount(el, { value, onChange }) → { select(value), value, destroy }. `change` also fires on `el`.
import { reduced, follower, springOf, offsetIn, uid } from '../core.js';
import { springCurve, make } from './au-util.js';

const instances = new WeakMap();
const PILL_BASE = 100;

export const mount = (el, opts = {}) => {
  if (instances.has(el)) return instances.get(el);
  const list = el.querySelector('[role="tablist"]');
  const contents = el.querySelector('.tabs-au__contents');
  if (!list || !contents) throw new Error('motion/tabs: needs a [role="tablist"] and a .tabs-au__contents');
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const panes = [...contents.querySelectorAll(':scope > [role="tabpanel"]')];
  const values = tabs.map((t) => t.dataset.value);
  if (!tabs.length || tabs.length !== panes.length || panes.some((p, i) => p.dataset.value !== values[i])) throw new Error('motion/tabs: every tab needs its tabpanel with the same data-value, in the same order');

  const added = [];
  const set = (node, name, value) => { if (!node.hasAttribute(name)) { node.setAttribute(name, value); added.push([node, name]); } };
  const id = uid('tabs-');
  tabs.forEach((tab, i) => { set(tab, 'id', `${id}-tab-${i}`); set(tab, 'aria-controls', `${id}-pane-${i}`); set(tab, 'type', 'button'); });
  panes.forEach((pane, i) => { set(pane, 'id', `${id}-pane-${i}`); set(pane, 'aria-labelledby', `${id}-tab-${i}`); });

  const track = make('div', { class: 'tabs-au__track' });
  track.append(...panes);
  contents.append(track);
  const pill = make('span', { class: 'tabs-au__pill', 'aria-hidden': 'true' });
  list.prepend(pill);
  const curve = springCurve(...Object.values(springOf('--tabs-spring-pill', '200 25 1')));
  el.style.setProperty('--tabs-pane-ease', curve.easing);
  el.style.setProperty('--tabs-pane-time', `${curve.duration}ms`);

  let index = Math.max(0, values.indexOf(opts.value ?? el.dataset.value ?? tabs.find((t) => t.getAttribute('aria-selected') === 'true')?.dataset.value));
  let pillBox = null;

  const pillFollower = follower(springOf('--tabs-spring-pill', '200 25 1'), ([x, w]) => {
    const radius = pillBox ? pillBox.radius : 0;
    pill.style.transform = `translate(${x}px, ${pillBox ? pillBox.y : 0}px) scaleX(${w / PILL_BASE})`;
    pill.style.borderRadius = `${radius / (w / PILL_BASE)}px / ${radius}px`;
  });
  const paneFollower = follower(springOf('--tabs-spring-pane', '300 30 1'), ([pct, height]) => {
    track.style.transform = `translateX(${pct}%)`;
    contents.style.height = `${height}px`;
  }, 0.02);

  const measure = () => {
    const tab = tabs[index];
    const at = offsetIn(tab, list);
    if (!at) return;
    pillBox = { y: at[1], radius: parseFloat(getComputedStyle(tab).borderTopLeftRadius) || 0 };
    pill.style.height = `${tab.offsetHeight}px`;
    return [at[0], tab.offsetWidth];
  };
  const place = (jump) => {
    const box = measure();
    if (!box) return;
    const quick = jump || reduced();
    pillFollower.to(box, quick);
    paneFollower.to([index * -100, panes[index].offsetHeight], quick || !el.hasAttribute('data-ready'));
  };

  const paint = () => {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      tab.dataset.active = String(on);
      panes[i].dataset.active = String(on);
      panes[i].inert = !on;
      panes[i].tabIndex = on ? 0 : -1;
    });
  };

  const select = (value, { focus = false, quiet = false } = {}) => {
    const next = values.indexOf(value);
    if (next < 0) throw new Error(`motion/tabs: no tab "${value}" (${values.join(', ')})`);
    if (next === index) { if (focus) tabs[index].focus(); return; }
    index = next;
    paint();
    place(false);
    if (reduced()) pill.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
    if (focus) tabs[index].focus();
    if (!quiet) {
      opts.onChange?.(value);
      el.dispatchEvent(new CustomEvent('change', { detail: { value }, bubbles: false }));
    }
  };

  const off = [];
  const on = (target, type, fn) => { target.addEventListener(type, fn); off.push(() => target.removeEventListener(type, fn)); };
  tabs.forEach((tab, i) => on(tab, 'click', () => select(values[i])));
  on(list, 'keydown', (e) => {
    const at = tabs.indexOf(document.activeElement);
    if (at < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    const to = { ArrowRight: (at + 1) % tabs.length, ArrowLeft: (at - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    select(values[to], { focus: true });
  });

  const watch = new ResizeObserver((entries) => place(entries.some((entry) => entry.target === list)));
  watch.observe(list);
  panes.forEach((pane) => watch.observe(pane));
  document.fonts?.ready.then(() => { if (instances.has(el)) place(true); });

  paint();
  place(true);
  el.setAttribute('data-ready', '');

  const api = {
    get value() { return values[index]; },
    select: (value) => select(value),
    destroy() {
      off.forEach((fn) => fn());
      watch.disconnect();
      pillFollower.stop();
      paneFollower.stop();
      contents.append(...panes);
      track.remove();
      pill.remove();
      for (const pane of panes) { pane.inert = false; pane.removeAttribute('data-active'); pane.style.removeProperty('filter'); }
      for (const tab of tabs) tab.removeAttribute('data-active');
      for (const [node, name] of added) node.removeAttribute(name);
      for (const node of [...tabs, ...panes]) { node.removeAttribute('tabindex'); }
      for (const tab of tabs) tab.removeAttribute('aria-selected');
      contents.style.removeProperty('height');
      el.style.removeProperty('--tabs-pane-ease');
      el.style.removeProperty('--tabs-pane-time');
      el.removeAttribute('data-ready');
      instances.delete(el);
    },
  };
  instances.set(el, api);
  return api;
};

if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-motion="tabs"]')) mount(el);
