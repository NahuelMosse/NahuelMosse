// Magic card, ported from Magic UI (registry/magicui/magic-card.tsx). The card has a 1 px transparent border
// painted with a radial gradient (from → to → the border color, 200 px) centered on the pointer, a solid
// fill over it, and in `gradient` mode a second radial light (200 px, 0.8 opacity) inside the card. In
// `orb` mode that light is a blurred 420 px circle that follows the pointer on a spring (stiffness 250,
// damping 30, mass 0.6) and appears with another (300, 35); it blends with screen in dark and multiply in
// light. The light is cleared when the pointer leaves, the window loses focus or the tab hides.
// The content of the element goes above all of it. Options (or `data-*` for mode): mode, gradientSize,
// gradientColor, gradientOpacity, gradientFrom, gradientTo, glowFrom, glowTo, glowAngle, glowSize,
// glowBlur, glowOpacity. Reduced motion lights the card where the pointer came in and does not follow.
import { follower, reduced } from '../core.js';
import { define, node } from './mu-shared.js';

const VARS = { gradientSize: ['--mu-magic-size', 'px'], gradientColor: ['--mu-magic-spot'], gradientOpacity: ['--mu-magic-opacity'], gradientFrom: ['--mu-magic-from'], gradientTo: ['--mu-magic-to'], glowFrom: ['--mu-magic-glow-from'], glowTo: ['--mu-magic-glow-to'], glowAngle: ['--mu-magic-glow-angle', 'deg'], glowSize: ['--mu-magic-glow-size', 'px'], glowBlur: ['--mu-magic-glow-blur', 'px'], glowOpacity: ['--mu-magic-glow-opacity'] };

export const mount = define('magic-card', (el, opts) => {
  const mode = opts.mode ?? el.dataset.mode ?? 'gradient';
  if (mode !== 'gradient' && mode !== 'orb') throw new RangeError(`magic-card: unknown mode "${mode}"`);
  for (const [key, [name, unit = '']] of Object.entries(VARS)) if (opts[key] !== undefined) el.style.setProperty(name, `${opts[key]}${unit}`);
  const size = () => parseFloat(getComputedStyle(el).getPropertyValue('--mu-magic-size')) || 200;
  const glowOpacity = () => parseFloat(getComputedStyle(el).getPropertyValue('--mu-magic-glow-opacity')) || 0.9;

  el.classList.add('mu-magic');
  el.dataset.mode = mode;
  const content = node('div', 'mu-magic__content');
  content.append(...el.childNodes);
  const fill = node('div', 'mu-magic__fill', { decorative: true });
  const light = node('div', mode === 'orb' ? 'mu-magic__orb' : 'mu-magic__spot', { decorative: true });
  el.append(fill, light, content);

  const orb = mode === 'orb'
    ? {
      move: follower({ stiffness: 250, damping: 30, mass: 0.6 }, ([x, y]) => { light.style.transform = `translate3d(${Math.round(x * 10) / 10}px, ${Math.round(y * 10) / 10}px, 0) translate(-50%, -50%)`; }),
      show: follower({ stiffness: 300, damping: 35, mass: 1 }, ([o]) => { light.style.opacity = o; }, 0.002),
    }
    : null;

  let inside = false;
  let last = null;
  let frame = 0;
  const place = (x, y) => {
    el.style.setProperty('--mx', x);
    el.style.setProperty('--my', y);
  };
  const flush = () => {
    frame = 0;
    if (!last) return;
    const r = el.getBoundingClientRect();
    const x = last.clientX - r.left;
    const y = last.clientY - r.top;
    if (reduced() && inside) return;
    place(x, y);
    orb?.move.to([x, y], !inside || reduced());
    inside = true;
  };
  const enter = (e) => {
    last = e;
    inside = false;
    el.setAttribute('data-lit', '');
    const r = el.getBoundingClientRect();
    place(e.clientX - r.left, e.clientY - r.top);
    orb?.move.to([e.clientX - r.left, e.clientY - r.top], true);
    orb?.show.to([glowOpacity()], reduced());
    inside = true;
  };
  const move = (e) => {
    last = e;
    if (reduced()) return;
    frame ||= requestAnimationFrame(flush);
  };
  const reset = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    inside = false;
    el.removeAttribute('data-lit');
    orb?.show.to([0], reduced());
    if (!orb) place(-size(), -size());
  };
  const onOut = (e) => { if (!e.relatedTarget) reset(); };
  const onHide = () => { if (document.visibilityState !== 'visible') reset(); };

  place(-size(), -size());
  el.addEventListener('pointerenter', enter);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', reset);
  el.addEventListener('pointercancel', reset);
  window.addEventListener('pointerout', onOut);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', onHide);

  return {
    reset,
    destroy() {
      cancelAnimationFrame(frame);
      orb?.move.stop();
      orb?.show.stop();
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', reset);
      el.removeEventListener('pointercancel', reset);
      window.removeEventListener('pointerout', onOut);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', onHide);
      fill.remove();
      light.remove();
      el.append(...content.childNodes);
      content.remove();
      el.classList.remove('mu-magic');
      el.removeAttribute('data-lit');
      el.removeAttribute('data-mode');
      for (const p of ['--mx', '--my', ...Object.values(VARS).map(([n]) => n)]) el.style.removeProperty(p);
    },
  };
});
