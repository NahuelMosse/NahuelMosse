// Text roll, ported from Motion Primitives (components/core/text-roll.tsx, MIT, Copyright (c) 2024 ibelick). Every letter is a
// small cylinder: the word turns away (rotateX 0 -> 90deg, ease-in, `duration` .5 s, letter i after i * .1 s) while the same
// word turns in underneath (90deg -> 0, after i * .1 + .2 s), so the line rolls up letter by letter. Port notes. It plays once
// on mount and again with `roll()`; the demo also wires hover, focus and tap. The letters are hidden from assistive
// technology and a visually hidden copy carries the text. Reduced motion shows the plain text, no roll.
import { reduced } from '../core.js';
import { define, node, numberOf } from './mu-shared.js';

export const mount = define('text-roll', (el, opts) => {
  const previous = el.innerHTML;
  const text = String(opts.text ?? el.dataset.text ?? el.textContent.trim());
  const duration = numberOf(opts, el, 'duration', 0.5) * 1000;
  const enterDelay = opts.getEnterDelay ?? ((i) => i * 0.1);
  const exitDelay = opts.getExitDelay ?? ((i) => i * 0.1 + 0.2);
  const shown = (c) => (c === ' ' ? ' ' : c);
  const letters = Array.from(text);
  let running = [];

  el.classList.add('mu-text-roll');
  const cells = letters.map((letter) => {
    const cell = node('span', 'mu-text-roll__cell', { decorative: true });
    const out = node('span', 'mu-text-roll__face mu-text-roll__face--out');
    const into = node('span', 'mu-text-roll__face mu-text-roll__face--in');
    const size = node('span', 'mu-text-roll__size');
    out.textContent = into.textContent = size.textContent = shown(letter);
    cell.append(out, into, size);
    return { cell, out, into };
  });
  const spoken = node('span', 'mu-text-roll__sr');
  spoken.textContent = text;
  el.replaceChildren(...cells.map((c) => c.cell), spoken);

  const roll = () => {
    for (const a of running) a.cancel();
    running = [];
    if (reduced()) return;
    cells.forEach((c, i) => {
      const out = c.out.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(90deg)' }], { duration, delay: enterDelay(i) * 1000, easing: 'ease-in', fill: 'both' });
      const into = c.into.animate([{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(0deg)' }], { duration, delay: exitDelay(i) * 1000, easing: 'ease-in', fill: 'both' });
      running.push(out, into);
      if (i === cells.length - 1) into.finished.then(() => opts.onAnimationComplete?.(), () => {});
    });
  };

  roll();
  return {
    roll,
    get text() { return text; },
    destroy() { for (const a of running) a.cancel(); el.innerHTML = previous; el.classList.remove('mu-text-roll'); },
  };
});
