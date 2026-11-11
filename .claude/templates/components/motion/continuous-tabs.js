// Continuous tabs, ported from Watermelon UI (animated-components/continuous-tabs, MIT, Copyright (c) 2025-present Watermelon Contributors).
// A pill-shaped tab bar where one dark pill is shared by all the tabs: choosing a tab slides and resizes that pill to it
// (spring stiffness 380, damping 30, mass .9) instead of fading one background out and another in; the label colors cross-fade in 200 ms.
// Port notes. The original uses Framer's `layoutId`; here the pill is measured (`offsetLeft`/`offsetWidth`) and moved with a CSS
// transition on the same spring written as a `linear()` curve. It adds the tabs pattern the original lacks: `role="tablist"`,
// roving tabindex, ArrowLeft/ArrowRight/Home/End, and optional panels (`data-panel="<id>"` on the tab, the panel found by id).
// Reduced motion puts the pill on the tab without traveling.
//
//   <nav data-motion="continuous-tabs" aria-label="Secciones"><button data-tab="home">Inicio</button>…</nav>
//   mount(el, { value, onChange })  →  { value, select(id), destroy }
import { reduced, scope } from '../core.js';
import { define, node, springRun } from './mu-shared.js';

export const mount = define('continuous-tabs', (el, opts) => {
  const life = scope();
  const tabs = [...el.querySelectorAll('[data-tab]')];
  if (!tabs.length) throw new Error('motion/continuous-tabs: needs children with data-tab');
  const curve = springRun(380, 30, 0.9);
  const pill = node('span', 'mu-continuous-tabs__pill', { decorative: true });
  let value = opts.value ?? el.dataset.value ?? tabs[0].dataset.tab;
  if (!tabs.some((t) => t.dataset.tab === value)) value = tabs[0].dataset.tab;
  const added = new Set();

  el.classList.add('mu-continuous-tabs');
  el.setAttribute('role', 'tablist');
  el.style.setProperty('--mu-continuous-tabs-ease', curve.easing);
  el.style.setProperty('--mu-continuous-tabs-ms', `${curve.duration}ms`);
  el.prepend(pill);
  for (const t of tabs) {
    t.setAttribute('role', 'tab');
    if (t.tagName === 'BUTTON' && !t.hasAttribute('type')) t.type = 'button';
    t.classList.add('mu-continuous-tabs__tab');
    const panel = t.dataset.panel && document.getElementById(t.dataset.panel);
    if (panel) { panel.setAttribute('role', 'tabpanel'); t.setAttribute('aria-controls', panel.id); }
    added.add(t);
  }

  const place = (travel) => {
    const animate = travel && !reduced();
    const t = tabs.find((x) => x.dataset.tab === value);
    if (!animate) pill.style.transition = 'none';
    pill.style.transform = `translateX(${t.offsetLeft}px)`;
    pill.style.width = `${t.offsetWidth}px`;
    pill.style.height = `${t.offsetHeight}px`;
    pill.style.top = `${t.offsetTop}px`;
    if (!animate) { void pill.offsetWidth; pill.style.transition = ''; }
  };
  const paint = () => {
    for (const t of tabs) {
      const on = t.dataset.tab === value;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = t.dataset.panel && document.getElementById(t.dataset.panel);
      if (panel) panel.hidden = !on;
    }
  };
  const select = (id, { focus = false } = {}) => {
    const t = tabs.find((x) => x.dataset.tab === id);
    if (!t) return;
    const changed = id !== value;
    value = id;
    paint();
    place(true);
    if (focus) t.focus();
    if (changed) { opts.onChange?.(id); el.dispatchEvent(new CustomEvent('change', { detail: { value: id } })); }
  };

  for (const t of tabs) t.addEventListener('click', () => select(t.dataset.tab), { signal: life.signal });
  el.addEventListener('keydown', (e) => {
    const at = tabs.indexOf(document.activeElement);
    if (at < 0) return;
    const to = { ArrowRight: (at + 1) % tabs.length, ArrowLeft: (at - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    select(tabs[to].dataset.tab, { focus: true });
  }, { signal: life.signal });

  paint();
  place(false);
  life.watch(new ResizeObserver(() => place(false))).observe(el);
  document.fonts?.ready.then(() => place(false));

  return {
    get value() { return value; },
    select,
    destroy() {
      life.destroy();
      pill.remove();
      el.classList.remove('mu-continuous-tabs');
      el.removeAttribute('role');
      el.style.removeProperty('--mu-continuous-tabs-ease');
      el.style.removeProperty('--mu-continuous-tabs-ms');
      for (const t of added) {
        t.classList.remove('mu-continuous-tabs__tab');
        for (const a of ['role', 'aria-selected', 'tabindex', 'aria-controls']) t.removeAttribute(a);
      }
    },
  };
});
