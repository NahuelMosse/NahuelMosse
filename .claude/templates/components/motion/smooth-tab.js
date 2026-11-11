// Smooth tab (port of Kokonut UI's smooth-tab): a card whose content slides sideways with a blur, and a
// tab bar whose coloured pill follows the selection on a spring (400/30). The card behind carries two
// drifting waveforms in the tab's colour.
// mount(el, opts) -> { destroy, select }. Auto-mounts on [data-motion="smooth-tab"].
//   opts: items [{ id, title, description, tone, content }], defaultId, label.
//   tone: accent | info | success | danger (the pill and the waveform take its colour).
// Event on the root: smoothtab:change ({ id }). Keys: ← → Home End.
import { reduced, follower, escapeHtml, uid, pauseOffscreen } from '../core.js';

const SLIDE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const mounted = new WeakMap();

const WAVE = 'M0 50 C 20 40, 40 30, 60 50 C 80 70, 100 60, 120 50 C 140 40, 160 30, 180 50 C 200 70, 220 60, 240 50 C 260 40, 280 30, 300 50 C 320 70, 340 60, 360 50 C 380 40, 400 30, 420 50 L 420 100 L 0 100 Z';
const DEFAULT_ITEMS = [
  { id: 'facturas', title: 'Facturas', description: 'Emitidas, por cobrar y cobradas del mes, con su estado.', tone: 'accent' },
  { id: 'clientes', title: 'Clientes', description: 'Altas, saldos y condiciones de pago de cada cliente.', tone: 'info' },
  { id: 'cobros', title: 'Cobros', description: 'Conciliá lo que entró al banco con lo que facturaste.', tone: 'success' },
  { id: 'vencidas', title: 'Vencidas', description: 'Reclamos y recordatorios que todavía no mandaste.', tone: 'danger' },
];

export const mount = (el, opts = {}) => {
  if (mounted.has(el)) return mounted.get(el);
  const original = el.innerHTML;
  const items = opts.items ?? DEFAULT_ITEMS;
  const key = uid('st-');
  let selected = items.findIndex((i) => i.id === opts.defaultId);
  if (selected < 0) selected = 0;
  el.classList.add('st');
  el.dataset.tone = items[selected].tone ?? 'accent';
  const wave = () => `<svg class="st__wave" aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 420 100"><g class="st__wave-a"><path d="${WAVE}"/></g><g class="st__wave-b"><path d="${WAVE}"/></g></svg>`;
  el.innerHTML = `
    <div class="st__card"><div class="st__clip">${items.map((it, i) => `
      <div class="st__panel" role="tabpanel" id="${key}-p-${i}" aria-labelledby="${key}-t-${i}" tabindex="0" data-tone="${it.tone ?? 'accent'}" ${i === selected ? '' : 'hidden'}>
        ${it.content ?? `<div class="st__art">${wave()}</div><div class="st__copy"><h3 class="st__title">${escapeHtml(it.title)}</h3><p class="st__desc">${escapeHtml(it.description ?? '')}</p></div>`}
      </div>`).join('')}</div></div>
    <div class="st__tabs" role="tablist" aria-label="${escapeHtml(opts.label ?? 'Secciones')}">
      <span class="st__pill" aria-hidden="true"></span>
      <div class="st__grid" style="--st-cols:${items.length}">${items.map((it, i) => `<button class="st__tab" type="button" role="tab" id="${key}-t-${i}" aria-controls="${key}-p-${i}" aria-selected="${i === selected}" tabindex="${i === selected ? 0 : -1}"><span class="st__tab-label">${escapeHtml(it.title)}</span></button>`).join('')}</div>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const tabs = [...el.querySelectorAll('.st__tab')];
  const panels = [...el.querySelectorAll('.st__panel')];
  const bar = $('.st__tabs');
  const pill = $('.st__pill');
  let destroyed = false;
  const anims = new Set();
  const exiting = new Map();
  const cleanups = [];
  const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); cleanups.push(() => t.removeEventListener(type, fn, o)); };
  const play = (node, frames, options) => { const a = node.animate(frames, options); anims.add(a); a.finished.then(() => anims.delete(a), () => anims.delete(a)); return a; };

  // The pill: the tab's box inset 4 px, a 100 × 100 square scaled onto it so only transforms move; the
  // corners are counter-scaled to keep the tab's radius.
  const follow = follower({ stiffness: 400, damping: 30, mass: 1 }, ([x, w]) => {
    const h = bar.clientHeight - 8;
    pill.style.transform = `translate(${x}px, 4px) scale(${Math.max(w, 0) / 100}, ${h / 100})`;
    const r = 8;
    pill.style.borderRadius = `${r / Math.max(w / 100, 0.01)}px / ${r / (h / 100)}px`;
  }, 0.1, [pill]);
  const target = () => {
    const t = tabs[selected].getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    return [t.left - b.left - bar.clientLeft + 4, t.width - 8];
  };
  const placePill = (jump) => { follow.to(target(), jump || reduced()); };

  const select = (index, { focus = false, jump = false } = {}) => {
    if (index === selected || index < 0 || index >= items.length) { if (focus) tabs[selected].focus(); return; }
    const dir = index > selected ? 1 : -1;
    const from = panels[selected];
    const to = panels[index];
    selected = index;
    tabs.forEach((t, i) => { t.setAttribute('aria-selected', String(i === index)); t.tabIndex = i === index ? 0 : -1; });
    el.dataset.tone = items[index].tone ?? 'accent';
    placePill(jump);
    if (focus) tabs[index].focus();
    // Whatever was still leaving is gone; whatever was arriving leaves from where it is.
    for (const [node, a] of exiting) { a.cancel(); node.hidden = true; }
    exiting.clear();
    for (const a of from.getAnimations()) { try { a.commitStyles(); } catch { /* not rendered */ } a.cancel(); }
    to.style.cssText = '';
    to.hidden = false;
    if (reduced()) {
      play(to, [{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: SLIDE });
      from.hidden = true;
    } else {
      const edge = (side) => ({ opacity: 0, filter: 'blur(8px)', transform: `translateX(${side * 100}%) scale(0.95)` });
      const rest = { opacity: 1, filter: 'blur(0px)', transform: 'translateX(0%) scale(1)' };
      play(to, [edge(dir), rest], { duration: 400, easing: SLIDE });
      const out = play(from, [edge(-dir)], { duration: 400, easing: SLIDE, fill: 'forwards' });
      exiting.set(from, out);
      from.style.pointerEvents = 'none';
      out.finished.then(() => { if (exiting.get(from) === out) { exiting.delete(from); from.hidden = true; out.cancel(); from.style.pointerEvents = ''; } }, () => {});
    }
    el.dispatchEvent(new CustomEvent('smoothtab:change', { detail: { id: items[index].id }, bubbles: true }));
  };

  on(bar, 'click', (e) => { const t = e.target.closest('.st__tab'); if (t) select(tabs.indexOf(t)); });
  on(bar, 'keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const go = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
    if (go != null) { e.preventDefault(); select(go, { focus: true }); }
  });
  const ro = new ResizeObserver(() => placePill(true));
  ro.observe(bar);
  pauseOffscreen(el);
  requestAnimationFrame(() => { if (!destroyed) placePill(true); });
  placePill(true);

  const api = {
    select: (id) => select(items.findIndex((i) => i.id === id)),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ro.disconnect();
      follow.stop();
      for (const a of anims) a.cancel();
      for (const off of cleanups) off();
      el.classList.remove('st');
      delete el.dataset.tone;
      delete el.dataset.offscreen;
      el.innerHTML = original;
      mounted.delete(el);
    },
  };
  mounted.set(el, api);
  return api;
};

if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-motion="smooth-tab"]')) mount(el);
