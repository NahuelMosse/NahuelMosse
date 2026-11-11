// Text shimmer, ported from Motion Primitives (components/core/text-shimmer.tsx, MIT, Copyright (c) 2024 ibelick). A soft band
// of light sweeps across muted text on a loop: the background is a gradient clipped to the letters, its position runs from
// 100% to 0% linearly over `duration` (2 s); the band's width is `spread` (2) px per character. Port notes. The sweep is a
// CSS animation (the compositor runs it), colours come from the theme tokens, and the script only sets the two variables.
// Reduced motion stops the sweep and leaves the muted text. The text is real text: a screen reader reads it as is.
import { define, numberOf } from './mu-shared.js';

export const mount = define('text-shimmer', (el, opts) => {
  const previous = el.className;
  const style = el.getAttribute('style');
  const apply = (text) => {
    el.style.setProperty('--mu-shimmer-spread', `${text.length * numberOf(opts, el, 'spread', 2)}px`);
    el.style.setProperty('--mu-shimmer-duration', `${numberOf(opts, el, 'duration', 2)}s`);
  };
  el.classList.add('mu-text-shimmer');
  if (opts.text !== undefined) el.textContent = String(opts.text);
  apply(el.textContent.trim());

  return {
    set(next) { el.textContent = String(next); apply(el.textContent.trim()); },
    destroy() {
      el.className = previous;
      if (style === null) el.removeAttribute('style'); else el.setAttribute('style', style);
    },
  };
});
