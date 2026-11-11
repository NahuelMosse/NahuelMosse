// Apple activity card, ported from Kokonut UI (components/kokonutui/apple-activity-card.tsx). Concentric rings
// of 200, 160 and 120 px with a 16 px stroke, a track under each and a gradient arc with round caps. The
// rings arrive one after another (opacity and scale 0.8 → 1 in 0.4 s, delay index × 0.1 s) and each arc
// draws itself in 0.7 s easeInOut with the same delay, the whole card done in 0.9 s; the figures come in from the right in 0.5 s after
// 0.3 s and the title drops in from above. The arc is `current / target` of each ring.
// `opts.rings` (or `data-rings` as JSON): [{ label, current, target, unit, tone }], tone being accent,
// success, warning, info or danger. `opts.title` is the heading, `opts.name` the accessible name of the group.
import { format, reduced, uid, escapeHtml } from '../core.js';
import { define, gate, node } from './mu-shared.js';

const NS = 'http://www.w3.org/2000/svg';
const STROKE = 16;
const SIZES = [200, 160, 120];
const IN_OUT = 'cubic-bezier(0.42, 0, 0.58, 1)';
const OUT = 'cubic-bezier(0, 0, 0.58, 1)';
// The original takes 2.6 s from the first ring to the last arc; a back office shows it in under a second.
const ENTER = 400;
const DRAW = 700;
const STAGGER = 100;
const TONES =new Set(['accent', 'success', 'warning', 'info', 'danger']);

const read = (el, opts) => {
  const rings = opts.rings ?? JSON.parse(el.dataset.rings ?? '[]');
  if (!Array.isArray(rings) || !rings.length || rings.length > SIZES.length) throw new RangeError(`apple-activity-card: between 1 and ${SIZES.length} rings`);
  return rings.map((r, i) => {
    if (!(r.target > 0) || !(r.current >= 0)) throw new RangeError(`apple-activity-card: ring "${r.label}" needs current ≥ 0 and target > 0`);
    const tone = r.tone ?? ['accent', 'success', 'warning'][i];
    if (!TONES.has(tone)) throw new RangeError(`apple-activity-card: unknown tone "${tone}"`);
    return { ...r, tone, value: Math.min(100, Math.round((r.current / r.target) * 100)) };
  });
};

export const mount = define('apple-activity-card', (el, opts) => {
  const rings = read(el, opts);
  const title = opts.title ?? el.dataset.title;
  const previous = el.innerHTML;
  const id = uid('mu-rings-');
  el.classList.add('mu-rings');
  el.setAttribute('role', 'group');
  const named = !title && !el.hasAttribute('aria-label') ? opts.name : null;
  if (named) el.setAttribute('aria-label', named);

  const head = title ? node('h3', 'mu-rings__title', { html: escapeHtml(title) }) : null;
  if (head) { head.id = `${id}-title`; el.setAttribute('aria-labelledby', head.id); }
  const body = node('div', 'mu-rings__body');
  const stage = node('div', 'mu-rings__stage');
  stage.setAttribute('role', 'img');
  stage.setAttribute('aria-label', rings.map((r) => `${r.label}: ${format.percent(r.value / 100, { maximumFractionDigits: 0 }, el)}`).join(', '));
  const info = node('dl', 'mu-rings__info');

  const parts = rings.map((r, i) => {
    const size = SIZES[i];
    const radius = (size - STROKE) / 2;
    const circumference = radius * 2 * Math.PI;
    const wrap = node('div', 'mu-rings__ring', { decorative: true });
    wrap.dataset.tone = r.tone;
    wrap.style.setProperty('--size', size);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('class', 'mu-rings__svg');
    svg.innerHTML = `<defs><linearGradient id="${id}-g${i}" x1="0%" x2="100%" y1="0%" y2="100%"><stop offset="0%" class="mu-rings__from"/><stop offset="100%" class="mu-rings__to"/></linearGradient></defs>`
      + `<circle class="mu-rings__track" cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke-width="${STROKE}"/>`
      + `<circle class="mu-rings__arc" cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="url(#${id}-g${i})" stroke-width="${STROKE}" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"/>`;
    wrap.append(svg);
    wrap.style.opacity = 0;
    stage.append(wrap);
    const row = node('div', 'mu-rings__item');
    row.dataset.tone = r.tone;
    row.innerHTML = `<dt class="mu-rings__label">${escapeHtml(r.label)}</dt><dd class="mu-rings__figure">${format.number(r.current, undefined, el)}/${format.number(r.target, undefined, el)}${r.unit ? `<span class="mu-rings__unit">${escapeHtml(r.unit)}</span>` : ''}</dd>`;
    info.append(row);
    return { wrap, arc: svg.querySelector('.mu-rings__arc'), circumference, end: ((100 - r.value) / 100) * circumference };
  });
  info.style.opacity = 0;
  if (head) head.style.opacity = 0;
  body.append(stage, info);
  el.replaceChildren(...(head ? [head] : []), body);

  let animations = [];
  const settle = () => {
    for (const a of animations) a.cancel();
    animations = [];
    for (const p of parts) { p.wrap.style.opacity = 1; p.arc.style.strokeDashoffset = p.end; }
    info.style.opacity = 1;
    if (head) head.style.opacity = 1;
  };
  const play = () => {
    for (const a of animations) a.cancel();
    animations = [];
    if (reduced()) {
      settle();
      animations = [stage, info, ...(head ? [head] : [])].map((n) => n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' }));
      return;
    }
    parts.forEach((p, i) => {
      p.wrap.style.opacity = 0;
      p.arc.style.strokeDashoffset = p.circumference;
      const delay = i * STAGGER;
      animations.push(
        p.wrap.animate([{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'scale(1)' }], { duration: ENTER, delay, easing: OUT, fill: 'both' }),
        p.arc.animate([{ strokeDashoffset: p.circumference }, { strokeDashoffset: p.end }], { duration: DRAW, delay, easing: IN_OUT, fill: 'both' }),
      );
    });
    animations.push(info.animate([{ opacity: 0, transform: 'translateX(20px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 300, easing: IN_OUT, fill: 'both' }));
    if (head) animations.push(head.animate([{ opacity: 0, transform: 'translateY(-20px)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: IN_OUT, fill: 'both' }));
    for (const p of parts) { p.wrap.style.opacity = ''; p.arc.style.strokeDashoffset = ''; }
    info.style.opacity = ''; if (head) head.style.opacity = '';
  };

  let begun = false;
  const watcher = gate(el, (on) => { if (on && !begun) { begun = true; play(); } });

  return {
    replay: play,
    get rings() { return rings.map(({ label, value }) => ({ label, value })); },
    destroy() {
      watcher.destroy();
      for (const a of animations) a.cancel();
      el.innerHTML = previous;
      el.classList.remove('mu-rings');
      for (const a of ['role', 'aria-labelledby']) el.removeAttribute(a);
      if (named) el.removeAttribute('aria-label');
    },
  };
});
