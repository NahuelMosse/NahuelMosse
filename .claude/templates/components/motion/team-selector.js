// Team selector (port of Kokonut UI's team-selector): a stack of overlapping avatars that grow in and out
// on a spring as the count goes up and down, a counter that rolls in the direction of the change and a
// short shake when you push past the limit. Here it sizes the seats of a Ledger team.
// mount(el, opts) -> { destroy, set, value }. Auto-mounts on [data-motion="team-selector"].
//   opts: members [{ id, name }], defaultValue, label.
// Event on the root: teamselector:change ({ size }).
import { reduced, springEasing, escapeHtml, hueOf } from '../core.js';

const mounted = new WeakMap();
const OUT = 'cubic-bezier(0, 0, 0.58, 1)';
const IN = 'cubic-bezier(0.42, 0, 1, 1)';
const POP = springEasing(260, 22, 0.6);
const svg = (inner) => `<svg class="ts__icon" viewBox="0 0 16 16" aria-hidden="true">${inner}</svg>`;
const DEFAULT_MEMBERS = ['Camila Ríos', 'Tomás Acuña', 'Lucía Benítez', 'Martín Ferreyra', 'Julieta Sosa'].map((name, i) => ({ id: `m${i}`, name }));
const initials = (name) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export const mount = (el, opts = {}) => {
  if (mounted.has(el)) return mounted.get(el);
  const original = el.innerHTML;
  const members = opts.members ?? DEFAULT_MEMBERS;
  const max = members.length;
  let size = Math.max(1, Math.min(max, opts.defaultValue ?? 1));
  el.classList.add('ts');
  el.innerHTML = `
    <div class="ts__card">
      <fieldset class="ts__fs">
        <legend class="ts__legend">${escapeHtml(opts.label ?? 'Puestos del equipo')}</legend>
        <div class="ts__avatars" role="img" aria-label="Integrantes incluidos: ${members.slice(0, size).map((m) => escapeHtml(m.name)).join(', ')}">${members.map((m, i) => `<span class="ts__av" data-visible="${i < size}" style="--hue:${hueOf(m.name)};z-index:${max - i}" title="${escapeHtml(m.name)}"><span>${escapeHtml(initials(m.name))}</span></span>`).join('')}</div>
        <div class="ts__controls">
          <button class="ts__btn" type="button" data-step="-1" aria-label="Menos puestos" data-tooltip="Menos puestos">${svg('<path d="M3.5 8h9"/>')}</button>
          <div class="ts__count">
            <div class="ts__roll"><span class="ts__num" aria-hidden="true">${size}</span></div>
            <span class="ts__unit"></span>
          </div>
          <button class="ts__btn" type="button" data-step="1" aria-label="Más puestos" data-tooltip="Más puestos">${svg('<path d="M8 3.5v9M3.5 8h9"/>')}</button>
        </div>
        <output class="ts__sr" aria-live="polite"></output>
      </fieldset>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const avatars = [...el.querySelectorAll('.ts__av')];
  const group = $('.ts__avatars');
  const roll = $('.ts__roll');
  const unit = $('.ts__unit');
  const sr = $('.ts__sr');
  const controls = $('.ts__controls');
  const buttons = [...el.querySelectorAll('.ts__btn')];
  let destroyed = false;
  const anims = new Set();
  const cleanups = [];
  const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); cleanups.push(() => t.removeEventListener(type, fn, o)); };
  const play = (node, frames, options) => { const a = node.animate(frames, options); anims.add(a); a.finished.then(() => anims.delete(a), () => anims.delete(a)); return a; };

  const label = () => `${size} ${size === 1 ? 'miembro' : 'miembros'}`;
  const refresh = () => {
    group.style.setProperty('--ts-size', size);
    group.style.setProperty('--ts-max', max);
    unit.textContent = size === 1 ? 'miembro' : 'miembros';
    sr.textContent = label();
    group.setAttribute('aria-label', `Integrantes incluidos: ${members.slice(0, size).map((m) => m.name).join(', ')}`);
    buttons[0].setAttribute('aria-disabled', String(size <= 1));
    buttons[1].setAttribute('aria-disabled', String(size >= max));
  };

  const setAvatar = (node, visible, animate) => {
    node.dataset.visible = String(visible);
    if (!animate) return;
    if (reduced()) { play(node, [{ opacity: visible ? 0 : 1 }, { opacity: visible ? 1 : 0 }], { duration: 120, easing: OUT }); return; }
    if (visible) play(node, [{ opacity: 0, transform: 'scale(0.85)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 360, easing: POP });
    else play(node, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.85)' }], { duration: 180, easing: OUT });
  };

  const rollTo = (value, dir) => {
    const old = roll.querySelector('.ts__num:not(.ts__num--leaving)');
    const next = Object.assign(document.createElement('span'), { className: 'ts__num', textContent: String(value) });
    next.setAttribute('aria-hidden', 'true');
    const still = reduced();
    const frame = (opacity, y) => (still ? { opacity } : { opacity, transform: `translateY(${y}px)` });
    roll.append(next);
    old.classList.add('ts__num--leaving');
    play(next, [frame(0, dir * 10), frame(1, 0)], { duration: still ? 120 : 200, easing: OUT });
    play(old, [frame(1, 0), frame(0, dir * -10)], { duration: still ? 100 : 140, easing: IN, fill: 'forwards' }).finished.then(() => old.remove(), () => old.remove());
  };

  const shake = () => {
    if (reduced()) return;
    play(controls, [0, -3, 3, -2, 2, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 280, easing: OUT });
  };

  const set = (value, notify = true) => {
    const next = Math.max(1, Math.min(max, value));
    if (next === size) return;
    const dir = next > size ? 1 : -1;
    const prev = size;
    size = next;
    avatars.forEach((node, i) => { const v = i < size; if ((i < prev) !== v) setAvatar(node, v, true); });
    rollTo(size, dir);
    refresh();
    if (notify) el.dispatchEvent(new CustomEvent('teamselector:change', { detail: { size }, bubbles: true }));
  };

  on(controls, 'click', (e) => {
    const b = e.target.closest('.ts__btn');
    if (!b) return;
    const step = Number(b.dataset.step);
    const next = size + step;
    if (next < 1 || next > max) shake(); else set(next);
  });

  refresh();
  const api = {
    value: () => size,
    set,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const a of anims) a.cancel();
      for (const off of cleanups) off();
      el.classList.remove('ts');
      el.innerHTML = original;
      mounted.delete(el);
    },
  };
  mounted.set(el, api);
  return api;
};

if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-motion="team-selector"]')) mount(el);
