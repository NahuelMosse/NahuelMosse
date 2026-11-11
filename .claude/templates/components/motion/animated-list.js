// Animated list, ported from Magic UI (registry/magicui/animated-list.tsx). The children of the element
// arrive one every `delay` ms (1000 by default), the newest on top. Each one scales from 0 to 1 and
// fades in from the top edge with a spring of stiffness 350 and damping 40; the ones already there slide
// down with the same spring. `add(node)` puts a new item on top at any time and `max` retires the oldest
// with the exit of the original (scale to 0, fade out).
import { reduced, fade } from '../core.js';
import { define, gate, numberOf, springRun } from './mu-shared.js';

const SPRING = springRun(350, 40, 1);

export const mount = define('animated-list', (el, opts) => {
  const delay = numberOf(opts, el, 'delay', 1000);
  const max = numberOf(opts, el, 'max', Infinity);
  const pending = [...el.children];
  const shown = [];
  const wrapped = new Map();
  el.replaceChildren();
  el.classList.add('mu-list');
  const had = { role: el.getAttribute('role'), live: el.getAttribute('aria-relevant') };
  if (!had.role) el.setAttribute('role', 'log');
  el.setAttribute('aria-relevant', 'additions');
  let timer = 0;

  const play = (target, frames) => target.animate(frames, { duration: SPRING.duration, easing: SPRING.easing });

  const retire = () => {
    while (shown.length > max) {
      const old = shown.pop();
      if (reduced()) { old.remove(); continue; }
      old.style.pointerEvents = 'none';
      play(old, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0)', opacity: 0 }]).finished.then(() => old.remove(), () => old.remove());
    }
  };

  const put = (content) => {
    const wrap = document.createElement('div');
    wrap.className = 'mu-list__item';
    wrap.append(content);
    wrapped.set(wrap, content);
    const before = new Map(shown.map((w) => [w, w.offsetTop]));
    el.prepend(wrap);
    shown.unshift(wrap);
    if (reduced()) fade(wrap, 120);
    else {
      play(wrap, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }]);
      for (const w of shown.slice(1)) {
        const dy = before.get(w) - w.offsetTop;
        if (dy) w.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: SPRING.duration, easing: SPRING.easing, composite: 'add' });
      }
    }
    retire();
    return wrap;
  };

  const tick = () => {
    timer = 0;
    if (!pending.length) return;
    put(pending.shift());
    if (pending.length) timer = setTimeout(tick, delay);
  };

  const watcher = gate(el, (on) => {
    clearTimeout(timer);
    timer = 0;
    if (on && pending.length) timer = setTimeout(tick, shown.length ? delay : 0);
  });

  return {
    add: (content) => put(content),
    get count() { return shown.filter((w) => w.isConnected).length; },
    destroy() {
      clearTimeout(timer);
      watcher.destroy();
      for (const wrap of el.querySelectorAll(':scope > .mu-list__item')) wrap.remove();
      el.classList.remove('mu-list');
      if (had.role) el.setAttribute('role', had.role); else el.removeAttribute('role');
      el.removeAttribute('aria-relevant');
      el.replaceChildren(...wrapped.values(), ...pending);
    },
  };
});
