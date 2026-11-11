// Marquee, ported from Magic UI (registry/magicui/marquee.tsx). The children of the element are repeated
// `repeat` times (4) in tracks that each slide by their own width plus the gap, so the row never shows a
// seam, `--duration` 40 s linear forever. `reverse`, `vertical` and `pauseOnHover` are the original's.
// What the original does not say, and this does: the copies are hidden from assistive technology, it
// pauses while it is off screen, the tab is hidden, the pointer is over it or focus is inside, it has
// `pause()` / `play()` (and a visible button with `control`), and reduced motion stops it and lays the
// first track out as a wrapped, static row.
import { reduced } from '../core.js';
import { define, gate, node, numberOf } from './mu-shared.js';

export const mount = define('marquee', (el, opts) => {
  const flag = (key) => opts[key] ?? (el.dataset[key] !== undefined && el.dataset[key] !== 'false');
  const repeat = Math.max(1, Math.floor(numberOf(opts, el, 'repeat', 4)));
  const vertical = flag('vertical');
  const reverse = flag('reverse');
  const pauseOnHover = flag('pauseOnHover');
  const control = opts.control ?? el.dataset.control;
  const source = [...el.childNodes];
  el.classList.add('mu-marquee');
  el.dataset.direction = vertical ? 'vertical' : 'horizontal';
  if (reverse) el.dataset.reverse = ''; else delete el.dataset.reverse;
  if (pauseOnHover) el.dataset.pauseOnHover = '';
  if (opts.duration !== undefined) el.style.setProperty('--duration', typeof opts.duration === 'number' ? `${opts.duration}s` : opts.duration);
  if (opts.gap !== undefined) el.style.setProperty('--gap', typeof opts.gap === 'number' ? `${opts.gap}px` : opts.gap);

  const tracks = Array.from({ length: repeat }, (_, i) => {
    const track = node('div', 'mu-marquee__track');
    if (i === 0) track.append(...source);
    else {
      track.setAttribute('aria-hidden', 'true');
      track.inert = true;
      for (const n of source) track.append(n.cloneNode(true));
    }
    return track;
  });
  el.replaceChildren(...tracks);

  let userPaused = false;
  let on = false;
  const sync = () => { el.toggleAttribute('data-paused', userPaused || !on); };
  const watcher = gate(el, (visible) => { on = visible; sync(); });
  sync();

  let button = null;
  if (control) {
    button = node('button', 'mu-marquee__control');
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    button.textContent = typeof control === 'string' && control !== 'true' ? control : 'Pausar movimiento';
    el.after(button);
    button.addEventListener('click', () => { userPaused = !userPaused; button.setAttribute('aria-pressed', String(userPaused)); sync(); });
  }
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const settle = () => { el.toggleAttribute('data-still', motion.matches); if (motion.matches) tracks[0].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' }); };
  motion.addEventListener('change', settle);
  if (reduced()) settle();

  return {
    pause() { userPaused = true; button?.setAttribute('aria-pressed', 'true'); sync(); },
    play() { userPaused = false; button?.setAttribute('aria-pressed', 'false'); sync(); },
    get paused() { return el.hasAttribute('data-paused'); },
    destroy() {
      watcher.destroy();
      motion.removeEventListener('change', settle);
      button?.remove();
      el.replaceChildren(...source);
      el.classList.remove('mu-marquee');
      for (const a of ['data-direction', 'data-reverse', 'data-pause-on-hover', 'data-paused', 'data-still']) el.removeAttribute(a);
      el.style.removeProperty('--duration');
      el.style.removeProperty('--gap');
    },
  };
});
