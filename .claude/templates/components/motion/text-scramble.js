// Text scramble, ported from Motion Primitives (components/core/text-scramble.tsx, MIT, Copyright (c) 2024 ibelick). The text
// shows random characters that resolve left to right into the real letters: `duration` .8 s in steps of `speed` .04 s; spaces
// never scramble. Port notes. A screen reader reads the plain text once (the scrambling is hidden from it). Reduced motion
// shows the final text at once. `set(text)` scrambles into new text, `scramble()` replays it, `trigger: false` waits for it.
import { reduced } from '../core.js';
import { define, node, numberOf } from './mu-shared.js';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const mount = define('text-scramble', (el, opts) => {
  const previous = el.innerHTML;
  let text = String(opts.text ?? el.dataset.text ?? el.textContent.trim());
  const set0 = String(opts.characterSet ?? el.dataset.characterSet ?? CHARS);
  const duration = numberOf(opts, el, 'duration', 0.8);
  const speed = numberOf(opts, el, 'speed', 0.04);
  const spoken = node('span', 'mu-text-scramble__sr');
  const shown = node('span', 'mu-text-scramble__text', { decorative: true });
  el.classList.add('mu-text-scramble');
  el.replaceChildren(spoken, shown);
  spoken.textContent = text;
  shown.textContent = text;

  let timer = null;
  const stop = () => { if (timer !== null) { clearInterval(timer); timer = null; } };
  const finish = () => { stop(); shown.textContent = text; opts.onScrambleComplete?.(); };

  const scramble = () => {
    stop();
    if (reduced()) { shown.textContent = text; return; }
    const steps = duration / speed;
    let step = 0;
    timer = setInterval(() => {
      const progress = step / steps;
      let out = '';
      for (let i = 0; i < text.length; i++) {
        if (text[i] === ' ') out += ' ';
        else if (progress * text.length > i) out += text[i];
        else out += set0[Math.floor(Math.random() * set0.length)];
      }
      shown.textContent = out;
      step++;
      if (step > steps) finish();
    }, speed * 1000);
  };

  const set = (next) => { text = String(next); spoken.textContent = text; scramble(); };
  if ((opts.trigger ?? el.dataset.trigger) !== false && el.dataset.trigger !== 'false') scramble();

  return {
    scramble,
    set,
    get text() { return text; },
    destroy() { stop(); el.innerHTML = previous; el.classList.remove('mu-text-scramble'); },
  };
});
