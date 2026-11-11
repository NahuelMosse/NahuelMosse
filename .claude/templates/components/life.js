// Life: what each thing does on the way to being used, and the four moments that are allowed to be
// expressive. How much depends on how many times a day it happens (see life.css): the helpers it stands on
// —`whileVisible`, `intent`, `playOnce`, `celebrate`, the spring integrator— are in core.js. Everything moves
// with transform, opacity, filter and clip-path; what follows the pointer is a real element with a
// transform written to it; every decorative node is `aria-hidden`, takes no pointer and is removed when its
// animation ends; and every celebration is accompanied by words (a toast), because motion is never the
// only signal. With reduced motion there are no particles, no beam and no travel: the fades and the toast stay.
import { forever, reduced, finePointer, once, css, ms, EASE_OUT, escapeHtml, messages, inlineIcons, offsetIn, fade, whileVisible, pauseOffscreen, intent, playOnce, celebrate, celebrating, follower, springOf, forget, endOf } from './core.js';
import { toast } from './overlays.js';
import { ping } from './charts.js';

const node = (cls, tag = 'span') => { const n = document.createElement(tag); n.className = cls; n.setAttribute('aria-hidden', 'true'); return n; };
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const centerOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
const retrigger = (el, name) => { el.removeAttribute(name); void el.offsetWidth; el.setAttribute(name, ''); };

// ── Button: a ripple from where it was pressed (from the center when it was the keyboard), at most three
// at once, under the label; each one is removed when it ends. ──
export const ripple = (button, x, y) => {
  if (reduced() || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
  const box = button.querySelector(':scope > .ripples') ?? button.appendChild(node('ripples'));
  const r = button.getBoundingClientRect();
  const size = Math.max(r.width, r.height);
  const drop = node('ripple');
  drop.style.cssText = `width: ${size}px; height: ${size}px; left: ${x - r.left - size / 2}px; top: ${y - r.top - size / 2}px;`;
  box.append(drop);
  const drops = box.querySelectorAll(':scope > .ripple');
  for (let i = 0; i < drops.length - 3; i++) drops[i].remove();
  drop.addEventListener('animationend', () => drop.remove(), { once: true });
  setTimeout(() => drop.remove(), ms('--motion-ripple', 450) + 300);
};
const rippleEverywhere = () => {
  if (!once(document.documentElement, 'uiRipple')) return;
  document.addEventListener('pointerdown', (e) => {
    const button = e.button === 0 ? e.target.closest?.('.btn') : null;
    if (button) ripple(button, e.clientX, e.clientY);
  });
  document.addEventListener('click', (e) => {
    const button = e.detail === 0 ? e.target.closest?.('.btn') : null;
    if (button?.matches(':focus-visible')) { const c = centerOf(button); ripple(button, c.x, c.y); }
  });
};

// ── Button: a soft light under the label follows the pointer while it is on the button, so the button answers
// before it is pressed. One element per button, moved by transform, written once a frame; only a fine pointer. ──
const lightEverywhere = () => {
  if (!once(document.documentElement, 'uiLight') || !finePointer()) return;
  let raf = 0;
  let at = null;
  const paint = () => {
    raf = 0;
    const { button, x, y } = at;
    const box = button.querySelector(':scope > .ripples') ?? button.appendChild(node('ripples'));
    const light = box.querySelector(':scope > .btn-light') ?? box.insertBefore(node('btn-light'), box.firstChild);
    const r = button.getBoundingClientRect();
    light.style.transform = `translate(${x - r.left - 60}px, ${y - r.top - 60}px)`;
  };
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || reduced()) return;
    const button = e.target.closest?.('.btn:not(:disabled, [aria-disabled="true"])');
    if (!button) return;
    at = { button, x: e.clientX, y: e.clientY };
    if (!raf) raf = requestAnimationFrame(paint);
  }, { passive: true });
};

// The primary action of the page shimmers once, 900 ms after the view paints, once a session.
const shimmerOnLoad = () => {
  if (!once(document.documentElement, 'uiShimmer')) return;
  setTimeout(() => {
    const button = document.querySelector('.view:not([hidden]) .btn--primary:not(:disabled)') ?? document.querySelector('.btn--primary:not(:disabled)');
    if (!button || reduced() || !playOnce('ledger:shimmer')) return;
    button.setAttribute('data-shimmer', '');
    endOf(button, 'data-shimmer', 1200);
  }, 900);
};

// The brand: a shine and one turn of light inside the square, once a session after loading, then only
// when the mark is hovered.
const brand = (mark) => {
  if (!once(mark, 'uiBrand')) return;
  const fx = node('brand__fx');
  fx.append(node('brand__shine'), node('brand__spin'));
  mark.append(fx);
  const run = () => {
    if (reduced() || !celebrating()) return;
    retrigger(mark, 'data-shine');
    mark.querySelector('.brand__spin').addEventListener('animationend', () => mark.removeAttribute('data-shine'), { once: true });
    setTimeout(() => mark.removeAttribute('data-shine'), ms('--motion-shine', 1200) + 300);
  };
  if (playOnce('ledger:brand-shine')) setTimeout(run, 400);
  intent(mark.closest('.brand') ?? mark, run, 100);
};

// A search field's icon rocks when the pointer gives it focus.
const searchIcons = (root) => {
  for (const input of root.querySelectorAll('.search .input, .field__control > .icon:first-child + .input')) {
    if (!once(input, 'uiWiggle')) continue;
    let pointer = false;
    input.addEventListener('pointerdown', () => { pointer = true; });
    input.addEventListener('focus', () => {
      const icon = input.parentElement.querySelector(':scope > .icon:first-child');
      if (pointer && icon && !reduced()) { retrigger(icon, 'data-wiggle'); endOf(icon, 'data-wiggle', 700); }
      pointer = false;
    });
  }
};

// ── The last point of a sparkline: a dot that settles, and two rings that leave it. They are siblings of the
// line (a drawing that is stretched would stretch them), placed from its box. ──
const pulseNodes = (svg) => {
  let dot = svg.nextElementSibling;
  if (!dot?.classList.contains('spark__end')) {
    dot = node('spark__end');
    svg.after(dot, node('spark__ring'), node('spark__ring'));
  }
  return [dot, dot.nextElementSibling, dot.nextElementSibling.nextElementSibling];
};
export const placeEnd = (svg, x, y, width, height, life = forever) => {
  svg._end = [x, y, width, height];
  const [dot, a, b] = pulseNodes(svg);
  const put = () => {
    const [ex, ey, w, h] = svg._end;
    const at = svg.getBoundingClientRect();
    const from = svg.parentElement.getBoundingClientRect();
    for (const n of [dot, a, b]) {
      n.style.setProperty('--_x', `${at.left - from.left + (ex / w) * at.width}px`);
      n.style.setProperty('--_y', `${at.top - from.top + (ey / h) * at.height}px`);
    }
  };
  put();
  if (once(svg, 'uiEnd')) life.watch(new ResizeObserver(put)).observe(svg);
};
export const pulseSpark = (svg) => {
  if (!svg.nextElementSibling?.classList.contains('spark__end')) return;
  const [dot, a, b] = pulseNodes(svg);
  dot.setAttribute('data-on', '');
  if (reduced()) return;
  a.removeAttribute('data-on');
  b.removeAttribute('data-on');
  void a.offsetWidth;
  a.setAttribute('data-on', '');
  b.setAttribute('data-on', '');
  const off = () => { a.removeAttribute('data-on'); b.removeAttribute('data-on'); };
  b.addEventListener('animationend', off, { once: true });
  setTimeout(off, ms('--motion-pulse-ring', 1400) + 700 + 300);
};
const kpiTiles = (root) => {
  for (const tile of root.querySelectorAll('.kpi')) {
    if (!once(tile, 'uiKpiPulse')) continue;
    intent(tile, () => { const svg = tile.querySelector('svg.spark'); if (svg) pulseSpark(svg); }, 100);
  }
};

// A figure the user changed flashes the tone of what that did (good or bad) behind its digits.
export const flashValue = (el, tone) => {
  const f = el.querySelector(':scope > .flash') ?? el.appendChild(node('flash'));
  f.dataset.tone = tone;
  retrigger(f, 'data-run');
};

// ── Table: a band crosses a row whose status changed, in the tone of the new one ──
export const sweepRow = (row, tone = 'success', delay = 0) => {
  const wrap = row.closest('.table-wrap');
  const at = wrap && offsetIn(row, wrap);
  if (!at || reduced()) return;
  const sweep = node('sweep');
  sweep.dataset.tone = tone;
  sweep.style.cssText = `top: ${at[1]}px; height: ${row.offsetHeight}px; --_delay: ${delay}ms;`;
  const band = sweep.appendChild(node('sweep__band'));
  wrap.append(sweep);
  // It goes when its animation ends; a table that is hidden meanwhile never runs it, so a timer takes it away too.
  band.addEventListener('animationend', () => sweep.remove(), { once: true });
  setTimeout(() => sweep.remove(), ms('--motion-sweep', 700) + delay + 400);
};
// A bulk change staggers its rows 40 ms apart, the first eight.
export const sweepRows = (rows, tone) => rows.forEach((row, i) => sweepRow(row, tone, Math.min(i, 7) * 40));

// ── Particles, confetti and a lap of light: only celebrations, so each one waits for `celebrate` ──
const layer = () => {
  let l = document.querySelector('.confetti-layer');
  if (!l) {
    l = node('confetti-layer', 'div');
    l.popover = 'manual';
    document.body.append(l);
  }
  if (!l.matches(':popover-open')) l.showPopover();
  return l;
};
const release = (l) => { if (!l.children.length) { try { l.hidePopover(); } catch { /* already hidden */ } l.remove(); } };
const fly = (parent, particle, frames, options) => {
  parent.append(particle);
  const a = particle.animate(frames, { fill: 'forwards', ...options });
  return a.finished.catch(() => {}).then(() => { particle.remove(); release(parent); });
};

// A burst from a point: `count` dots of `--particle-size` fly out to `--particle-radius` and fade, all at once.
export const particles = (origin, count = 8) => {
  const from = origin instanceof Element ? centerOf(origin) : origin;
  const l = layer();
  const radius = parseFloat(css('--particle-radius')) || 22;
  const duration = ms('--motion-particles', 520);
  return Promise.all(Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const dx = Math.cos(angle) * radius;
    const dy = Math.sin(angle) * radius;
    return fly(l, node('particle'), [{ transform: `translate(${from.x}px, ${from.y}px) scale(1)`, opacity: 1 }, { transform: `translate(${from.x + dx}px, ${from.y + dy}px) scale(0.4)`, opacity: 0 }], { duration, easing: EASE_OUT });
  }));
};

// Confetti: rectangles of 6 × 10 and circles of 6 in the four confetti colors fan out of a point, −90° ± 55°,
// at 520–820 px/s under 1400 px/s² of gravity. Each trajectory is a parabola computed here in 8 keyframes,
// 1400–1800 ms, turning ±540°, fluttering and fading from 70 %.
export const confetti = (origin, count = 28) => {
  const l = layer();
  const base = ms('--motion-confetti', 1600);
  const FLUTTER = [1, 0.3, 1, 0.3, 1, 0.3, 1, 0.6];
  return Promise.all(Array.from({ length: count }, (_, i) => {
    const angle = ((-90 + rand(-55, 55)) * Math.PI) / 180;
    const speed = rand(520, 820);
    const duration = base + rand(-200, 200);
    const spin = rand(-540, 540);
    const piece = node(`confetti${i % 3 === 2 ? ' confetti--dot' : ''}`);
    piece.style.setProperty('--_c', `var(--confetti-${(i % 4) + 1})`);
    const frames = Array.from({ length: 8 }, (_, k) => {
      const at = k / 7;
      const t = (at * duration) / 1000;
      const x = origin.x + speed * Math.cos(angle) * t;
      const y = origin.y + speed * Math.sin(angle) * t + 0.5 * 1400 * t * t;
      return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(spin * at).toFixed(0)}deg) scaleY(${FLUTTER[k]})`, opacity: at <= 0.7 ? 1 : 1 - (at - 0.7) / 0.3, offset: at };
    });
    return fly(l, piece, frames, { duration, easing: 'linear' });
  }));
};

// One lap of light around a card (the Border Beam, once): it fades in, turns for `--motion-beam-lap`, fades out
// in its last 300 ms and is removed.
export const lap = (el, tone = 'success') => {
  const T = ms('--motion-beam-lap', 2400);
  const ring = node('lap');
  ring.dataset.tone = tone;
  ring.append(node('lap__sweep'));
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.append(ring);
  const a = ring.animate([{ opacity: 0 }, { opacity: 1, offset: 0.06 }, { opacity: 1, offset: 1 - 300 / T }, { opacity: 0 }], { duration: T, easing: 'linear', fill: 'both' });
  return a.finished.catch(() => {}).then(() => ring.remove());
};

// ── The pointer light on a surface of the showcase: one blob inside it and one on its 1 px edge, both moved by a
// spring with a transform written straight to them; the pointer is read once per frame. The cards a person can
// press are lit by the Magic Card port of motion/ in every register; this one serves the `.spotlight` surfaces
// (figures, charts) that only the showcase lights. With reduced motion the light appears where the pointer came
// in and does not follow. ──
const spotlight = (el) => {
  if (!once(el, 'uiSpot')) return;
  for (const kind of ['spot-layer', 'spot-edge']) el.appendChild(node(kind)).append(node('spot'));
  const spots = [...el.querySelectorAll(':scope > .spot-layer > .spot, :scope > .spot-edge > .spot')];
  const f = follower(springOf('--spring-pointer', '250 30 0.6'), ([x, y]) => { for (const s of spots) s.style.transform = `translate3d(${Math.round(x * 10) / 10}px, ${Math.round(y * 10) / 10}px, 0)`; });
  let inside = false;
  let last = null;
  let frame = 0;
  const flush = () => {
    frame = 0;
    const r = el.getBoundingClientRect();
    const at = [last.clientX - r.left - el.clientLeft, last.clientY - r.top - el.clientTop];
    if (reduced()) { if (!inside) f.to(at, true); } else f.to(at, !inside);
    inside = true;
  };
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !finePointer()) return;
    if (document.documentElement.dataset.register !== 'showcase') return;
    last = e;
    frame ||= requestAnimationFrame(flush);
  });
  el.addEventListener('pointerleave', () => { inside = false; });
};

// ── The first-run empty state: the mark draws, the title arrives word by word, the body fades in after it, a dotted
// ground lights where the pointer is and the action pulses three times. All of it starts when the empty comes
// into view, and the title keeps its words for a screen reader in a hidden copy. ──
const emptyState = (el, life) => {
  if (!once(el, 'uiEmpty')) return;
  const title = el.querySelector('.empty__title');
  if (title && !title.hasAttribute('data-split')) {
    const text = title.textContent.trim();
    title.innerHTML = `<span class="visually-hidden">${escapeHtml(text)}</span><span aria-hidden="true">${text.split(/\s+/).map((w, i) => `<span class="word" style="--i: ${Math.min(i, 9)}">${escapeHtml(w)}</span>`).join(' ')}</span>`;
    title.setAttribute('data-split', '');
  }
  const io = life.watch(new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); el.setAttribute('data-live', ''); } }));
  io.observe(el);
  let frame = 0;
  let last = null;
  const aim = () => { frame = 0; const r = el.getBoundingClientRect(); el.style.setProperty('--mx', `${last.clientX - r.left}px`); el.style.setProperty('--my', `${last.clientY - r.top}px`); };
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !finePointer() || reduced()) return;
    last = e;
    el.setAttribute('data-pointer', '');
    frame ||= requestAnimationFrame(aim);
  });
  el.addEventListener('pointerleave', () => el.removeAttribute('data-pointer'));
};

// ── Progress: a band of light crosses a determinate bar while it is under 100 % and on screen; at 100 % the bar
// turns success and the track pops. `setProgress` is how a screen moves it. ──
export const setProgress = (progress, value) => {
  const v = clamp(value, 0, 1);
  const done = v >= 1;
  progress.querySelector('.progress__bar').style.setProperty('--value', String(v));
  progress.setAttribute('aria-valuenow', String(Math.round(v * 100)));
  progress.toggleAttribute('data-complete', done);
  if (done) progress.removeAttribute('data-shine');
};
const progressShine = (progress, life) => {
  if (!once(progress, 'uiShine')) return;
  whileVisible(progress, () => {
    if (progress.hasAttribute('data-complete')) return undefined;
    progress.setAttribute('data-shine', '');
    return () => progress.removeAttribute('data-shine');
  }, life);
};

// An overdue status pings twice the first time it comes into view, once a session for each invoice.
const overdueBadges = (root, life) => {
  for (const badge of root.querySelectorAll('.badge[data-tone="danger"]')) {
    if (!once(badge, 'uiPing')) continue;
    const key = `ledger:ping:${badge.closest('tr')?.cells?.[1]?.textContent.trim() ?? badge.textContent.trim()}`;
    const io = life.watch(new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      if (reduced() || !playOnce(key)) return;
      badge.setAttribute('data-ping', '');
      endOf(badge, 'data-ping', 2400);
    }));
    io.observe(badge);
  }
};

// ── What arrives with a layer: the fields of a dialog (opacity and 6 px, 25 ms apart, the first six, after 80 ms), the
// sections of a drawer (8 px, 30 ms, the first five, after 140 ms), the rows that a load brings (blur, 4 px, 20 ms,
// the first eight). With reduced motion each is a fade of 140 ms and nothing waits. ──
const arriving = (items, { y, blur = 0, duration, gap, cap, first = 0, group = 1 }) => items.slice(0, cap * group).forEach((item, i) => {
  if (reduced()) { fade(item); return; }
  item.animate([{ opacity: 0, transform: `translateY(${y}px)`, filter: `blur(${blur}px)` }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration, delay: first + Math.floor(i / group) * gap, easing: EASE_OUT, fill: 'backwards' });
});
export const enterFields = (dialog) => arriving([...dialog.querySelectorAll('.dialog__body .field')], { y: 6, duration: 200, gap: 25, cap: 6, first: 80 });
export const enterSections = (drawer) => arriving([...drawer.querySelectorAll('.dialog__body > *')], { y: 8, duration: 220, gap: 30, cap: 5, first: 140 });
export const enterRows = (container) => arriving([...container.children], { y: 4, blur: 3, duration: 200, gap: parseFloat(css('--stagger')) || 20, cap: Number(css('--stagger-cap')) || 8 });
export const enterCardRows = (card) => arriving([...card.querySelectorAll('.dl > *')], { y: 4, duration: 160, gap: 25, cap: 4, first: 120, group: 2 });

// ── The four moments. Each says what happened in words (a toast) whatever the person has chosen; the rest —
// the particles, the beam— is a celebration and only runs if celebrations are on and motion is not reduced.
// The screen does what its own data needs (the badge changes, the row enters, the figures roll) and calls
// these for what only a celebration adds. ──
export const moments = {
  // The first invoice, once in a lifetime: confetti from the top edge of the table, and a toast.
  firstInvoice: ({ wrap }) => {
    toast(messages.firstInvoice, { icon: 'party-popper' });
    const r = wrap.getBoundingClientRect();
    return celebrate(() => confetti({ x: r.left + r.width / 2, y: Math.max(0, r.top) }));
  },
  // An overdue invoice collected: a burst from its badge (one, however many were collected) and, when it was the
  // last overdue one, a lap of light around the figures.
  collected: ({ origin, card, zero }) => {
    celebrate(() => particles(origin));
    if (zero && card) celebrate(() => lap(card, 'success'));
  },
  // A record month, once a month: two rings on the current point, a badge with a shine and a lap in the accent.
  record: ({ chart, card, title, key }) => {
    if (!playOnce(`ledger:record:${key}`, 'life')) return Promise.resolve(false);
    toast(messages.recordMonth, { tone: 'success' });
    if (title && !title.querySelector('.badge--record')) {
      const badge = Object.assign(document.createElement('span'), { className: 'badge badge--record', textContent: messages.record });
      badge.dataset.tone = 'success';
      title.append(badge);
      if (celebrating()) { badge.setAttribute('data-shine', ''); endOf(badge, 'data-shine', 2200); }
    }
    if (celebrating()) ping(chart);
    return celebrate(() => lap(card, 'accent'));
  },
  // An invoice sent: the icon of the button flies out and the next one arrives (700 ms) while it works, and a toast
  // with the same icon says it when it is done.
  fly: (button) => {
    const icon = button?.querySelector('[data-icon="send"]');
    if (!icon || reduced()) return;
    icon.animate([{ translate: '0 0', opacity: 1 }, { translate: '14px -14px', opacity: 0, offset: 0.45 }, { translate: '-14px 14px', opacity: 0, offset: 0.46 }, { translate: '0 0', opacity: 1 }], { duration: ms('--motion-send', 700), easing: 'ease-in-out' });
  },
  sent: ({ message }) => toast(message, { icon: 'send' }),
  // Whether this is the first invoice of a life, and the first hover card of a session: asked once, true once.
  isFirstInvoice: () => playOnce('ledger:first-invoice', 'life'),
  firstHovercard: () => playOnce('ledger:hovercard-roll'),
  // Everything that "only once" remembers, so a gallery or a test can start again.
  reset: () => forget('ledger:'),
};

// ── Wiring: what a page gets by calling `ui.init` ──
export const initLife = (root = document, life = forever) => {
  inlineIcons(root);
  rippleEverywhere();
  lightEverywhere();
  shimmerOnLoad();
  root.querySelectorAll('.brand__mark').forEach(brand);
  searchIcons(root);
  kpiTiles(root);
  root.querySelectorAll('.spotlight').forEach(spotlight);
  root.querySelectorAll('.empty[data-first-run]').forEach((e) => emptyState(e, life));
  root.querySelectorAll('.progress:not([data-indeterminate])').forEach((p) => progressShine(p, life));
  root.querySelectorAll('.skeleton, .shimmer, .progress[data-indeterminate], .beam[data-attention], .spinner').forEach(pauseOffscreen);
  overdueBadges(root, life);
};
