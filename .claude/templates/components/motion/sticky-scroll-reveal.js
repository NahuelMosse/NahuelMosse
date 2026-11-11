// Sticky scroll reveal, ported from Aceternity UI (ui/sticky-scroll-reveal). A tall panel scrolls its own
// steps (title and description) on the left while a visual stays pinned on the right (from 1024 px). The
// active step is the one whose breakpoint index / count is closest to the scroll progress
// (scrollTop / (scrollHeight - clientHeight)); it shows at full opacity and the others at 0.3 (300 ms), the
// panel's background is interpolated between three tones as the scroll advances and the pinned visual changes with the step, on a gradient
// that cycles through three. The element is the scroll container; each child marked `data-step` holds a
// title, a description and a `[data-visual]` that the component moves into the pinned panel.
// Scrolling is the user's: the container takes the keyboard (arrows, Page Up/Down). Reduced motion keeps
// the changes and shortens them to 120 ms.
import { clamp, define, listeners, node } from './ac-shared.js';

export const mount = define('sticky-scroll-reveal', (el) => {
  const steps = [...el.querySelectorAll('[data-step]')];
  if (!steps.length) throw new RangeError('sticky-scroll-reveal: needs children with data-step');
  const on = listeners();
  const added = [];
  const keep = (n, attr, value) => { if (!n.hasAttribute(attr)) { n.setAttribute(attr, value); added.push([n, attr]); } };
  keep(el, 'tabindex', '0');
  keep(el, 'role', 'region');
  el.classList.add('ac-ssr');

  const column = node('div', 'ac-ssr__col');
  const list = node('div', 'ac-ssr__steps');
  column.append(list);
  const panel = node('div', 'ac-ssr__panel', { decorative: true });
  const layers = [];
  const slots = steps.map((step, i) => {
    const slot = document.createComment('ac-ssr-step');
    step.before(slot);
    list.append(step);
    step.classList.add('ac-ssr__step');
    const visual = step.querySelector('[data-visual]');
    const layer = node('div', 'ac-ssr__layer');
    layer.dataset.tone = String(i % 3);
    const mark = visual ? document.createComment('ac-ssr') : null;
    if (visual) { visual.before(mark); layer.append(visual); }
    layers.push(layer);
    panel.append(layer);
    return { slot, visual, mark };
  });
  list.append(node('div', 'ac-ssr__tail', { decorative: true }));
  el.append(column, panel);

  let active = -1;
  const set = (i) => {
    if (i === active) return;
    active = i;
    el.dataset.step = String(i % 3);
    steps.forEach((s, k) => {
      s.toggleAttribute('data-active', k === i);
      if (k === i) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current');
    });
    layers.forEach((l, k) => l.toggleAttribute('data-active', k === i));
  };
  const closest = () => {
    const room = el.scrollHeight - el.clientHeight;
    const progress = room > 0 ? clamp(el.scrollTop / room, 0, 1) : 0;
    return steps.reduce((best, _, i) => (Math.abs(progress - i / steps.length) < Math.abs(progress - best / steps.length) ? i : best), 0);
  };
  // The section's background is scroll-linked: it sits on the tone of step k when the scroll is at k / count and
  // mixes towards the next tone in between (CSS does the mix from --ac-ssr-t, the share of the next tone).
  const tint = () => {
    const room = el.scrollHeight - el.clientHeight;
    const progress = room > 0 ? clamp(el.scrollTop / room, 0, 1) : 0;
    const at = Math.min(progress * steps.length, steps.length - 1);
    const k = Math.floor(at);
    el.style.setProperty('--ac-ssr-from', `var(--ac-ssr-bg-${k % 3})`);
    el.style.setProperty('--ac-ssr-to', `var(--ac-ssr-bg-${(k + 1) % 3})`);
    el.style.setProperty('--ac-ssr-t', String(+(at - k).toFixed(4)));
  };
  set(0);
  tint();
  on(el, 'scroll', () => { set(closest()); tint(); }, { passive: true });

  return {
    destroy() {
      on.off();
      steps.forEach((step, i) => {
        const { slot, visual, mark } = slots[i];
        if (visual) mark.replaceWith(visual);
        step.classList.remove('ac-ssr__step');
        step.removeAttribute('data-active');
        step.removeAttribute('aria-current');
        slot.replaceWith(step);
      });
      column.remove();
      panel.remove();
      for (const [n, attr] of added) n.removeAttribute(attr);
      el.classList.remove('ac-ssr');
      delete el.dataset.step;
      for (const name of ['--ac-ssr-from', '--ac-ssr-to', '--ac-ssr-t']) el.style.removeProperty(name);
      if (!el.getAttribute('style')) el.removeAttribute('style');
    },
  };
});
