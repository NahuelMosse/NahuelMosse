// Spinning text, ported from Motion Primitives (components/core/spinning-text.tsx, MIT, Copyright (c) 2024 ibelick). Each letter
// sits on a circle of `radius` (5) ch, 360deg / total apart, and the whole ring turns once every `duration` (10) s, linear and
// endless, `reverse` turns it the other way. Port notes. The turn is a CSS animation, the letters are hidden from assistive
// technology and a visually hidden copy carries the text. Reduced motion stops the ring and leaves the text readable on its
// circle. The ring has a size (twice the radius plus a letter), so it takes room in the layout.
import { define, node, numberOf } from './mu-shared.js';

export const mount = define('spinning-text', (el, opts) => {
  const previous = el.innerHTML;
  const text = String(opts.text ?? el.dataset.text ?? el.textContent.trim());
  const reverse = (opts.reverse ?? el.dataset.reverse) === true || el.dataset.reverse === 'true';
  const letters = Array.from(text);
  el.classList.add('mu-spinning-text');
  el.style.setProperty('--mu-spin-duration', `${numberOf(opts, el, 'duration', 10)}s`);
  el.style.setProperty('--mu-spin-radius', String(numberOf(opts, el, 'radius', 5)));
  el.style.setProperty('--mu-spin-size', String(numberOf(opts, el, 'fontSize', 1)));
  el.style.setProperty('--mu-spin-total', String(letters.length));
  el.style.setProperty('--mu-spin-direction', reverse ? 'reverse' : 'normal');

  const ring = node('span', 'mu-spinning-text__ring', { decorative: true });
  letters.forEach((letter, i) => {
    const l = node('span', 'mu-spinning-text__letter');
    l.style.setProperty('--mu-spin-index', String(i));
    l.textContent = letter;
    ring.append(l);
  });
  const spoken = node('span', 'mu-spinning-text__sr');
  spoken.textContent = text;
  el.replaceChildren(ring, spoken);

  return {
    destroy() {
      el.innerHTML = previous;
      el.classList.remove('mu-spinning-text');
      for (const p of ['duration', 'radius', 'size', 'total', 'direction']) el.style.removeProperty(`--mu-spin-${p}`);
    },
  };
});
