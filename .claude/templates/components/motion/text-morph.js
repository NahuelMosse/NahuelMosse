// Text morph, ported from Arc (registry/components/text-morph/text-morph.tsx, MIT). One short label turns into the next in
// place: letters both strings share glide to their new positions on the `morph` spring (visualDuration .42, bounce .16),
// new letters sharpen in (scale .8, y .14em, blur 4 px, .28 s on the enter curve, staggered in reading order after a .05 s
// handoff, 32 ms apart, eight at most) and removed letters blur away (.18 s, scale .86, y -.1 em) from where they stood.
// Port note. Arc pairs letters by character and occurrence, which lets a letter jump across the label when a phrase gains
// a word ("Enviar factura" -> "Enviando factura" slides the "r" of "factura" over its neighbours). Here the letters that
// stay are the longest common subsequence of the two labels, so they keep their order and never cross; a letter that has no
// partner in order leaves and a new one arrives, starting inside the gap its neighbours leave and sliding with them. The
// frame's width follows the new label on the same spring, behind a soft
// trailing mask. A screen reader reads the plain text; reduced motion fades.
import { reduced, scope } from '../core.js';
import { EASE, SPRINGS, TOKENS, fadeIn, springCurve, value } from './arc-shared.js';
import { define, node } from './mu-shared.js';

const HANDOFF = 0.05;

// For each letter of `to`, the index of the letter of `from` it stays as, or -1. The longest common subsequence, so pairs keep their order.
const align = (from, to) => {
  const rows = from.length + 1;
  const cols = to.length + 1;
  const run = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = from.length - 1; i >= 0; i--) for (let j = to.length - 1; j >= 0; j--) run[i][j] = from[i] === to[j] ? run[i + 1][j + 1] + 1 : Math.max(run[i + 1][j], run[i][j + 1]);
  const match = new Array(to.length).fill(-1);
  let i = 0;
  let j = 0;
  while (i < from.length && j < to.length) {
    if (from[i] === to[j]) { match[j++] = i++; } else if (run[i + 1][j] >= run[i][j + 1]) i++; else j++;
  }
  return match;
};

export const mount = define('text-morph', (el, opts) => {
  const text0 = String(opts.text ?? el.dataset.text ?? el.textContent.trim());
  const previous = el.innerHTML;
  const life = scope();
  const spoken = node('span', 'ar-sr');
  const frame = node('span', 'ar-text-morph__frame', { decorative: true });
  const track = node('span', 'ar-text-morph__track');
  frame.append(track);
  el.classList.add('ar-text-morph');
  el.replaceChildren(spoken, frame);

  let live = [];
  let label = '';
  let width = null;
  const widthValue = value(0, (w) => { frame.style.width = `${w}px`; });
  const spring = springCurve(SPRINGS.morph);

  const make = (char) => {
    const g = node('span', 'ar-text-morph__glyph');
    g.textContent = char === ' ' ? ' ' : char;
    return g;
  };
  const measure = () => track.getBoundingClientRect().width;

  const set = (next) => {
    const text = String(next);
    if (text === label && live.length) return;
    const first = live.length === 0;
    const chars = Array.from(text);
    const match = align(live.map((g) => g.char), chars);
    label = text;
    spoken.textContent = text;

    // Where every letter is now, with whatever animation it is in the middle of.
    const origin = track.getBoundingClientRect();
    const from = new Map();
    for (const g of live) { const r = g.el.getBoundingClientRect(); from.set(g, { x: r.left - origin.left, y: r.top - origin.top, w: r.width }); }
    for (const g of live) for (const a of g.el.getAnimations()) a.cancel();

    const stays = new Set(match.filter((i) => i >= 0).map((i) => live[i]));
    for (const g of live) {
      if (stays.has(g)) continue;
      const o = from.get(g);
      Object.assign(g.el.style, { position: 'absolute', left: `${o.x}px`, top: `${o.y}px`, width: `${o.w}px`, pointerEvents: 'none' });
      g.el.setAttribute('aria-hidden', 'true');
      if (first || reduced()) { g.el.remove(); continue; }
      const a = g.el.animate([{ opacity: 1, transform: 'none', filter: 'blur(0px)' }, { opacity: 0, transform: 'translateY(-.1em) scale(.86)', filter: `blur(${TOKENS.blur.soft}px)` }], { duration: TOKENS.duration.exit * 1000, easing: EASE.standard, fill: 'forwards' });
      a.onfinish = () => g.el.remove();
    }
    let entering = 0;
    const fresh = [];
    const order = chars.map((char, j) => {
      if (match[j] >= 0) return live[match[j]];
      const g = { char, el: make(char) };
      fresh.push([g, entering++]);
      return g;
    });
    order.forEach((g, i) => { if (track.children[i] !== g.el) track.insertBefore(g.el, track.children[i] ?? null); });
    live = order;

    // Letters that stayed glide from where they were to where they are.
    const now = track.getBoundingClientRect();
    if (!first && !reduced()) {
      const shift = live.map((g) => { const o = from.get(g); return o ? o.x - (g.el.getBoundingClientRect().left - now.left) : null; });
      shift.forEach((dx, i) => {
        if (dx === null || Math.abs(dx) < 0.5) return;
        live[i].el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: spring.duration, easing: spring.easing });
      });
      // A new letter starts inside the gap between the letters that stay on either side of it, spread across it, and both edges of
      // the gap keep sliding: the new letters never sit on top of a neighbour while they sharpen in.
      const along = (i) => {
        let before = i - 1;
        while (before >= 0 && shift[before] === null) before--;
        let after = i + 1;
        while (after < live.length && shift[after] === null) after++;
        const a = before >= 0 ? shift[before] : null;
        const b = after < live.length ? shift[after] : null;
        if (a === null && b === null) return 0;
        if (a === null) return b;
        if (b === null) return a;
        return a + (b - a) * ((i - before - 0.5) / (after - before - 1));
      };
      for (const [g, rank] of fresh) {
        const dx = along(live.indexOf(g));
        if (Math.abs(dx) >= 0.5) g.el.animate([{ translate: `${dx}px 0` }, { translate: '0 0' }], { duration: spring.duration, easing: spring.easing });
        g.el.animate([{ opacity: 0, transform: 'translateY(.14em) scale(.8)', filter: `blur(${TOKENS.blur.soft}px)` }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: (TOKENS.duration.standard + 0.04) * 1000, easing: EASE.enter, delay: (HANDOFF + Math.min(rank, 8) * TOKENS.stagger.char * 2) * 1000, fill: 'backwards' });
      }
    } else if (!first) {
      for (const [g] of fresh) fadeIn(g.el);
    }

    const target = measure();
    if (width !== null && Math.abs(target - width) > 0.5 && !reduced() && !first) widthValue.to(target, { spring: SPRINGS.morph });
    else widthValue.jump(target);
    width = target;
  };

  set(text0);
  const ro = life.watch(new ResizeObserver(() => {
    const next = measure();
    if (width === null || Math.abs(next - width) < 0.5) return;
    widthValue.jump(next);
    width = next;
  }));
  ro.observe(track);

  return {
    set,
    update: set,
    get text() { return label; },
    destroy() {
      widthValue.stop();
      life.destroy();
      live = [];
      el.innerHTML = previous;
      el.classList.remove('ar-text-morph');
    },
  };
});
