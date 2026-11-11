// Text effect, ported from Motion Primitives (components/core/text-effect.tsx, MIT, Copyright (c) 2024 ibelick). Text splits per
// `word` (default), `char` or `line` and every piece enters staggered (.05 / .03 / .1 s, divided by `speedReveal`) in .3 s
// (divided by `speedSegment`) after `delay`; presets: blur, fade-in-blur, scale, fade (default), slide. Port notes. Per `char`
// the stagger runs across all letters of the text, not word by word. `play()` enters, `exit()` leaves in reverse order and
// `set(text)` swaps the text and enters again. The pieces are hidden from assistive technology and a visually hidden copy
// carries the text. Reduced motion only fades, all pieces together; `trigger: false` waits for `play()`.
import { reduced } from '../core.js';
import { define, node, numberOf } from './mu-shared.js';

const STAGGER = { char: 0.03, word: 0.05, line: 0.1 };
const PRESETS = {
  blur: [{ opacity: 0, filter: 'blur(12px)' }, { opacity: 1, filter: 'blur(0px)' }],
  'fade-in-blur': [{ opacity: 0, transform: 'translateY(20px)', filter: 'blur(12px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }],
  scale: [{ opacity: 0, transform: 'scale(0)' }, { opacity: 1, transform: 'scale(1)' }],
  fade: [{ opacity: 0 }, { opacity: 1 }],
  slide: [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }],
};

export const mount = define('text-effect', (el, opts) => {
  const previous = el.innerHTML;
  const read = (k, f) => String(opts[k] ?? el.dataset[k] ?? f);
  const per = ['char', 'word', 'line'].includes(read('per', 'word')) ? read('per', 'word') : 'word';
  const preset = PRESETS[read('preset', 'fade')] ? read('preset', 'fade') : 'fade';
  const delay = numberOf(opts, el, 'delay', 0);
  const speedReveal = numberOf(opts, el, 'speedReveal', 1);
  const speedSegment = numberOf(opts, el, 'speedSegment', 1);
  let text = String(opts.text ?? el.dataset.text ?? el.textContent.trim());
  let items = [];
  let running = [];

  el.classList.add('mu-text-effect', 'mu-text-effect--hidden');
  const spoken = node('span', 'mu-text-effect__sr');

  const build = () => {
    for (const a of running) a.cancel();
    running = [];
    const pieces = per === 'line' ? text.split('\n') : text.split(/(\s+)/);
    items = [];
    const parts = pieces.map((segment) => {
      if (per === 'line') { const s = node('span', 'mu-text-effect__line', { decorative: true }); s.textContent = segment; items.push(s); return s; }
      const wrap = node('span', 'mu-text-effect__piece', { decorative: true });
      if (per === 'word') { wrap.textContent = segment; items.push(wrap); return wrap; }
      for (const ch of segment) { const c = node('span', 'mu-text-effect__piece'); c.textContent = ch; items.push(c); wrap.append(c); }
      return wrap;
    });
    spoken.textContent = text;
    el.replaceChildren(...(per === 'line' ? [] : [spoken]), ...parts);
    if (per === 'line') el.setAttribute('aria-label', text); else el.removeAttribute('aria-label');
  };

  const run = (keyframes, order, base) => {
    const motionless = reduced();
    const frames = motionless ? PRESETS.fade : keyframes;
    const stagger = STAGGER[per] / speedReveal;
    const duration = (0.3 / speedSegment) * 1000;
    let last = null;
    order.forEach((item, rank) => {
      const a = item.animate(frames, { duration: motionless ? 200 : duration, delay: motionless ? 0 : (base + rank * stagger) * 1000, easing: 'ease-out', fill: 'both' });
      running.push(a);
      last = a;
    });
    return last ? last.finished.catch(() => {}) : Promise.resolve();
  };

  const play = () => {
    for (const a of running) a.cancel();
    running = [];
    el.classList.remove('mu-text-effect--hidden');
    opts.onAnimationStart?.();
    const done = run(PRESETS[preset], items, delay);
    done.then(() => {
      // Resting state is plain text, so nothing keeps a filter or a transform alive.
      if (!running.length) return;
      for (const a of running) a.cancel();
      running = [];
      opts.onAnimationComplete?.();
    });
    return done;
  };
  const exit = () => {
    for (const a of running) a.cancel();
    running = [];
    return run([...PRESETS[preset]].reverse(), [...items].reverse(), 0).then(() => { for (const a of running) a.cancel(); running = []; el.classList.add('mu-text-effect--hidden'); });
  };
  const set = (next) => { text = String(next); build(); el.classList.add('mu-text-effect--hidden'); return play(); };

  build();
  if ((opts.trigger ?? el.dataset.trigger) !== false && el.dataset.trigger !== 'false') play();

  return {
    play,
    exit,
    set,
    get text() { return text; },
    destroy() {
      for (const a of running) a.cancel();
      el.innerHTML = previous;
      el.removeAttribute('aria-label');
      el.classList.remove('mu-text-effect', 'mu-text-effect--hidden');
    },
  };
});
