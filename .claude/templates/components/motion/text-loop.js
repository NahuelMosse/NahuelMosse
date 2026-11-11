// Text loop, ported from Motion Primitives (components/core/text-loop.tsx, MIT, Copyright (c) 2024 ibelick). A list of phrases
// takes turns in one spot: every `interval` (2) s the current one leaves up (y -20, fades) and the next one comes in from
// below (y 20 -> 0), .3 s; the leaving one is taken out of flow so the box follows the new one (popLayout). Phrases come
// from `opts.items`, `data-items` split by `|`, or the element's children. Port notes. A loop that moves for more than five
// seconds needs a way to stop: it pauses while the pointer or focus is inside and with `pause()` / `play()`, and it also waits
// while it is off screen or the tab is hidden. Only the current phrase is exposed to assistive technology. Reduced motion
// swaps the phrase at once, no travel or fade.
import { reduced } from '../core.js';
import { define, gate, node, numberOf } from './mu-shared.js';

export const mount = define('text-loop', (el, opts) => {
  const previous = el.innerHTML;
  const fromAttr = el.dataset.items ? el.dataset.items.split('|').map((s) => s.trim()).filter(Boolean) : null;
  const items = (opts.items ?? fromAttr ?? Array.from(el.children).map((c) => c.innerHTML)).map(String);
  const interval = numberOf(opts, el, 'interval', 2) * 1000;
  const duration = numberOf(opts, el, 'duration', 0.3) * 1000;
  let index = 0;
  let timer = null;
  let paused = (opts.trigger ?? el.dataset.trigger) === false || el.dataset.trigger === 'false';
  let visible = true;
  let inside = false;
  let current;

  el.classList.add('mu-text-loop');
  const make = (i) => { const n = node('span', 'mu-text-loop__item', { html: items[i] }); return n; };
  current = make(0);
  el.replaceChildren(current);

  const go = (to) => {
    if (items.length < 2) return;
    index = (to + items.length) % items.length;
    const old = current;
    current = make(index);
    old.setAttribute('aria-hidden', 'true');
    el.append(current);
    opts.onIndexChange?.(index);
    if (reduced()) { old.remove(); return; }
    Object.assign(old.style, { position: 'absolute', left: `${old.offsetLeft}px`, top: `${old.offsetTop}px` });
    old.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-20px)', opacity: 0 }], { duration, easing: 'ease', fill: 'forwards' }).onfinish = () => old.remove();
    current.animate([{ transform: 'translateY(20px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration, easing: 'ease' });
  };

  const sync = () => {
    const run = !paused && visible && !inside && items.length > 1;
    if (run && timer === null) timer = setInterval(() => go(index + 1), interval);
    if (!run && timer !== null) { clearInterval(timer); timer = null; }
  };
  const enter = () => { inside = true; sync(); };
  const leave = () => { inside = false; sync(); };
  el.addEventListener('pointerenter', enter);
  el.addEventListener('pointerleave', leave);
  el.addEventListener('focusin', enter);
  el.addEventListener('focusout', leave);
  const watch = gate(el, (on) => { visible = on; sync(); });

  return {
    next() { go(index + 1); },
    pause() { paused = true; sync(); },
    play() { paused = false; sync(); },
    get index() { return index; },
    destroy() {
      if (timer !== null) clearInterval(timer);
      watch.destroy();
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('focusin', enter);
      el.removeEventListener('focusout', leave);
      el.innerHTML = previous;
      el.classList.remove('mu-text-loop');
    },
  };
});
