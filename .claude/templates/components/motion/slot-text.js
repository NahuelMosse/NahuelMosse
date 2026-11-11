// Slot text, ported from Arc (registry/components/slot-text/slot-text.tsx, MIT). Every character is a reel: digits count
// through the wheel in the direction the number moved, letters shuffle through the alphabet, and the reels stop one after
// another from left to right with the original's landing curve (.12, .8, .16, 1: fast out, a long soft landing, never past
// the target). Reels are keyed by place value from the end, so 999 -> 1.000 keeps the units reel and grows on the left; a
// leading run of symbols (a currency sign) keeps its own keys and never spins into a digit. A reel's width follows its
// character on a spring (visualDuration .6 at most, no bounce); a reel that leaves closes its width in .35 s. A reel
// retargeted mid-spin restarts from the cell on screen, keeping its sub-cell offset, so nothing jumps. The spin blurs by
// its own speed (0.05 px per cell/s, 2.4 px at most). The page locale formats a number (`data-locale`); a string is
// shown as it is. A screen reader reads the text once (`announce` makes it polite); reduced motion swaps with a fade.
import { format, reduced } from '../core.js';
import { fadeIn, physical, value } from './arc-shared.js';
import { define, node, numberOf } from './mu-shared.js';

const DIGITS = '0123456789';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = LOWER.toUpperCase();
const CELL = 1.6;
const LANDING = [0.12, 0.8, 0.16, 1];
const classOf = (c) => (DIGITS.includes(c) ? DIGITS : LOWER.includes(c) ? LOWER : UPPER.includes(c) ? UPPER : null);
const seeded = (seed) => { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const glyph = (c) => (c === ' ' ? ' ' : c);

// The cells a reel passes through, from what shows now to the target.
const buildStrip = (from, to, spins, rising, seed) => {
  if (from === to) return [to];
  const set = classOf(to);
  if (!set) return [from, to];
  if (set === DIGITS && classOf(from) === DIGITS) {
    const a = Number(from);
    const b = Number(to);
    const steps = spins * 10 + (rising ? (b - a + 10) % 10 : (a - b + 10) % 10);
    return Array.from({ length: steps + 1 }, (_, i) => String((a + (rising ? i : -i) + 100) % 10));
  }
  const random = seeded(seed);
  const fillers = Array.from({ length: Math.max(2, spins * 5 + 2) }, () => set[Math.floor(random() * set.length)]);
  return [from, ...fillers, to];
};

export const mount = define('slot-text', (el, opts) => {
  const duration = numberOf(opts, el, 'duration', 0.9);
  const stagger = numberOf(opts, el, 'stagger', 0.07);
  const spins = numberOf(opts, el, 'spins', 1);
  const announce = opts.announce ?? el.dataset.announce === 'true';
  const align = opts.align ?? el.dataset.align;
  if (align !== undefined && align !== 'start' && align !== 'end') throw new RangeError(`slot-text: unknown align "${align}"`);
  const fmt = opts.format ?? ((n) => format.number(n, undefined, el));
  const check = (v) => {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new RangeError('slot-text: value is not a finite number');
    if (typeof v !== 'number' && typeof v !== 'string') throw new TypeError('slot-text: value is a number or a string');
    return v;
  };
  const given = opts.value ?? (el.dataset.value !== undefined && el.dataset.value.trim() !== '' && Number.isFinite(Number(el.dataset.value)) ? Number(el.dataset.value) : el.dataset.value ?? el.textContent.trim());

  const previous = el.innerHTML;
  el.classList.add('ar-slot');
  const spoken = node('span', 'ar-sr');
  const reels = node('span', 'ar-slot__reels', { decorative: true });
  el.replaceChildren(spoken, reels);
  if (announce) spoken.setAttribute('aria-live', 'polite');

  const map = new Map();
  const initialKeys = new Set();
  let current = check(given);
  let rising = true;
  let first = true;

  const keysOf = (v, chars) => {
    const fromEnd = (align ?? (typeof v === 'number' ? 'end' : 'start')) === 'end';
    // A leading run of symbols is keyed from the start; the rest from the aligned end.
    const lead = fromEnd ? chars.findIndex((c) => /[\p{L}\p{N}]/u.test(c)) : 0;
    const prefix = lead < 0 ? chars.length : lead;
    return chars.map((_, i) => (i < prefix ? `p${i}` : fromEnd ? `e${chars.length - 1 - i}` : `s${i}`));
  };

  const makeReel = (key, char, order) => {
    const slot = node('span', 'ar-slot__slot');
    const sizer = node('span', 'ar-slot__sizer');
    const win = node('span', 'ar-slot__window');
    const strip = node('span', 'ar-slot__strip');
    win.append(strip);
    slot.append(sizer, win);
    const reel = { key, slot, sizer, strip, char, cells: [char], from: 0, order, sized: false, leaving: false };
    reel.pos = value(0, (v, speed) => {
      strip.style.transform = `translate3d(0, ${(-v * CELL).toFixed(4)}em, 0)`;
      const blur = Math.min(Math.abs(speed) * 0.05, 2.4);
      strip.style.filter = blur < 0.15 ? 'none' : `blur(${blur.toFixed(2)}px)`;
    });
    reel.width = value(0, (w) => { slot.style.width = `${w}px`; });
    return reel;
  };
  const paint = (reel) => {
    reel.strip.replaceChildren(...reel.cells.map((c) => { const cell = node('span', 'ar-slot__cell'); cell.textContent = glyph(c); return cell; }));
    reel.sizer.textContent = glyph(reel.char);
  };
  const spin = (reel, entering) => {
    const last = reel.cells.length - 1;
    const measured = reel.sizer.getBoundingClientRect().width;
    const time = duration + reel.order * stagger;
    if (reduced()) {
      reel.pos.jump(last);
      if (measured) { reel.width.jump(measured); reel.sized = true; }
      if (!first) fadeIn(reel.strip);
      return;
    }
    reel.pos.jump(reel.from);
    reel.pos.to(last, { duration: last === 0 ? 0.2 : time, ease: LANDING, rest: 0.0005 });
    const size = physical(Math.min(time, 0.6), 0);
    if (entering) { reel.width.jump(0); reel.sized = true; reel.width.to(measured, { spring: size }); return; }
    if (!reel.sized) { if (measured) { reel.width.jump(measured); reel.sized = true; } return; }
    reel.width.to(measured, { spring: size });
  };

  const set = (next) => {
    check(next);
    if (!first) rising = typeof next === 'number' && typeof current === 'number' ? next >= current : true;
    current = next;
    const text = typeof next === 'number' ? fmt(next) : next;
    spoken.textContent = text;
    const chars = Array.from(text);
    const keys = keysOf(next, chars);
    const todo = [];
    chars.forEach((char, i) => {
      const key = keys[i];
      if (first) initialKeys.add(key);
      let reel = map.get(key);
      if (reel?.leaving) { reel.width.stop(); reel.slot.remove(); reel = undefined; }
      if (!reel) {
        const entering = !first && !initialKeys.has(key);
        reel = makeReel(key, char, i);
        reel.cells = entering && !reduced() ? buildStrip('', char, spins, rising, char.charCodeAt(0) + i) : [char];
        paint(reel);
        map.set(key, reel);
        todo.push([reel, entering]);
        return;
      }
      reel.order = i;
      if (reel.char === char) return;
      // A new target restarts from the cell on screen, keeping its sub-cell offset.
      const at = reel.pos.get();
      const index = Math.max(0, Math.min(reel.cells.length - 1, Math.round(at)));
      const visible = reel.cells[index];
      reel.char = char;
      reel.cells = reduced() ? [char] : buildStrip(visible, char, spins, rising, char.charCodeAt(0) * 31 + visible.charCodeAt(0) * 7 + i + reel.cells.length);
      reel.from = reduced() ? 0 : at - index;
      paint(reel);
      todo.push([reel, false]);
    });

    // Reels that are gone stay where they were until their width closes; the rest take their place in reading order.
    const wanted = new Set(keys);
    const gone = [...map.values()].filter((r) => !wanted.has(r.key));
    const before = [...reels.children];
    const owner = (slot) => [...map.values()].find((r) => r.slot === slot);
    const after = new Map();
    for (const g of gone) {
      let anchor = null;
      for (let i = before.indexOf(g.slot) - 1; i >= 0 && !anchor; i--) { const o = owner(before[i]); if (o && wanted.has(o.key)) anchor = o; }
      after.set(anchor, [...(after.get(anchor) ?? []), g]);
    }
    const order = [...(after.get(null) ?? [])];
    for (const k of keys) { const r = map.get(k); order.push(r, ...(after.get(r) ?? [])); }
    order.forEach((r, i) => { if (reels.children[i] !== r.slot) reels.insertBefore(r.slot, reels.children[i] ?? null); });

    for (const [reel, entering] of todo) spin(reel, entering);
    for (const g of gone) {
      if (g.leaving) continue;
      g.leaving = true;
      g.slot.dataset.exiting = '';
      g.pos.stop();
      const remove = () => { g.slot.remove(); if (map.get(g.key) === g) map.delete(g.key); };
      if (reduced()) { remove(); continue; }
      if (!g.sized) g.width.jump(g.slot.getBoundingClientRect().width);
      g.width.to(0, { spring: physical(0.35, 0), done: remove });
    }
    first = false;
  };

  set(current);

  return {
    set,
    update: set,
    get text() { return spoken.textContent; },
    destroy() {
      for (const r of map.values()) { r.pos.stop(); r.width.stop(); }
      map.clear();
      el.innerHTML = previous;
      el.classList.remove('ar-slot');
    },
  };
});
