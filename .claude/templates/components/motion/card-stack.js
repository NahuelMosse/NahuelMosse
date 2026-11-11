// Card stack (port of Kokonut UI's card-stack): frosted cards piled with a slight turn, that fan out on
// a spring (220/28, 40 ms apart). Here it carries "facturas por revisar": the top card follows the
// finger and is approved or rejected by swiping it away, with buttons and keys that do the same.
// mount(el, opts) -> { destroy, approve, reject, undo, reset, spread }. Auto-mounts on [data-motion="card-stack"].
//   opts: cards [{ id, amount, client, description, specs: [{ label, value }] }].
// Events on the root: cardstack:decide ({ id, decision: 'approved' | 'rejected' }), cardstack:undo ({ id }).
// The two icon buttons carry `data-tooltip` (the kit's tooltip reads it) besides their accessible name.
// Keys on the stack: → or A approves, ← or R rejects, Backspace or Ctrl Z undoes, Enter spreads the fan.
import { reduced, follower, escapeHtml, uid } from '../core.js';

const SPRING = { stiffness: 220, damping: 28, mass: 1 };
const CARD_W = 320;
const OVERLAP = 240;
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const THRESHOLD = 110;
const mounted = new WeakMap();

const svg = (inner, cls = 'cs__icon') => `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true">${inner}</svg>`;
const ICON = {
  check: svg('<path d="M3.5 8.5l3 3 6-7"/>'),
  x: svg('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>'),
  undo: svg('<path d="M3 6.5h6.5a3 3 0 0 1 0 6H6M5.5 3.5L3 6.5l2.5 3"/>'),
  fan: svg('<path d="M8 2l6 3.2L8 8.4 2 5.2z"/><path d="M2 8.2l6 3.2 6-3.2M2 11l6 3.2 6-3.2"/>'),
};

const DEFAULT_CARDS = [
  { id: 'A-4217', amount: '$ 1.250.000', client: 'Estudio Pereyra', description: 'Factura B por diseño de identidad visual, a 30 días.', specs: [{ label: 'Número', value: '0004-4217' }, { label: 'Vence', value: '12 nov' }, { label: 'IVA', value: '21 %' }, { label: 'Origen', value: 'PDF' }] },
  { id: 'A-4218', amount: '$ 386.400', client: 'Cooperativa Ñandú', description: 'Factura A por mantenimiento del sistema de turnos.', specs: [{ label: 'Número', value: '0004-4218' }, { label: 'Vence', value: '18 nov' }, { label: 'IVA', value: '21 %' }, { label: 'Origen', value: 'Mail' }] },
  { id: 'A-4219', amount: '$ 92.750', client: 'Bodega Los Álamos', description: 'Factura C por cartelería para la vendimia.', specs: [{ label: 'Número', value: '0004-4219' }, { label: 'Vence', value: '20 nov' }, { label: 'IVA', value: 'Exento' }, { label: 'Origen', value: 'PDF' }] },
  { id: 'A-4220', amount: '$ 2.140.000', client: 'Logística Cuyo', description: 'Factura A por desarrollo del portal de choferes.', specs: [{ label: 'Número', value: '0004-4220' }, { label: 'Vence', value: '30 nov' }, { label: 'IVA', value: '21 %' }, { label: 'Origen', value: 'API' }] },
  { id: 'A-4221', amount: '$ 218.900', client: 'Taller Sarmiento', description: 'Factura B por licencias anuales de contabilidad.', specs: [{ label: 'Número', value: '0004-4221' }, { label: 'Vence', value: '2 dic' }, { label: 'IVA', value: '10,5 %' }, { label: 'Origen', value: 'Mail' }] },
];

// The invoice as a thumbnail of its page: letterhead, who it is for, the line it bills and the total.
const sheet = (c) => {
  const spec = (label) => c.specs.find((s) => s.label === label)?.value ?? '';
  return `<span class="cs__sheet" aria-hidden="true">
    <span class="cs__head"><i class="cs__logo">L</i><span class="cs__kind">FACTURA<b>${escapeHtml(spec('Número'))}</b></span></span>
    <span class="cs__to"><small>Cliente</small>${escapeHtml(c.client)}</span>
    <span class="cs__rows"><span class="cs__row cs__row--head"><span>Concepto</span><span>Importe</span></span><span class="cs__row"><span>${escapeHtml(c.description)}</span><span>${escapeHtml(c.amount)}</span></span></span>
    <span class="cs__total"><span>Total</span><b>${escapeHtml(c.amount)}</b></span>
  </span>`;
};

export const mount = (el, opts = {}) => {
  if (mounted.has(el)) return mounted.get(el);
  const original = el.innerHTML;
  const data = opts.cards ?? DEFAULT_CARDS;
  const id = uid('cs-');
  el.classList.add('cs');
  el.innerHTML = `
    <div class="cs__stack" tabindex="0" role="group" aria-roledescription="pila de facturas" aria-label="Facturas por revisar" aria-describedby="${id}-help">
      ${data.map((c, i) => `
        <article class="cs__card" data-id="${escapeHtml(c.id)}" aria-label="Factura ${escapeHtml(c.id)} de ${escapeHtml(c.client)}, ${escapeHtml(c.amount)}">
          <span class="cs__stamp cs__stamp--ok" aria-hidden="true">Aprobar</span><span class="cs__stamp cs__stamp--no" aria-hidden="true">Rechazar</span>
          <div class="cs__content">
            <dl class="cs__specs">${c.specs.map((s) => `<div><dd>${escapeHtml(s.value)}</dd><dt>${escapeHtml(s.label)}</dt></div>`).join('')}</dl>
            <div class="cs__figure">${sheet(c)}</div>
            <div class="cs__titles"><span class="cs__title">${escapeHtml(c.amount)}</span><span class="cs__subtitle">${escapeHtml(c.client)}</span></div>
            <p class="cs__desc">${escapeHtml(c.description)}</p>
          </div>
        </article>`).join('')}
      <div class="cs__empty" hidden><span class="cs__empty-mark">${ICON.check}</span><p class="cs__empty-title">No quedan facturas por revisar</p><button class="cs__btn" type="button" data-act="reset">Volver a revisar</button></div>
    </div>
    <p class="cs__help" id="${id}-help">Deslizá la factura de arriba a la derecha para aprobarla o a la izquierda para rechazarla. También podés usar los botones o las flechas del teclado.</p>
    <div class="cs__bar">
      <button class="cs__btn cs__btn--no" type="button" data-act="reject">${ICON.x}<span>Rechazar</span></button>
      <button class="cs__btn cs__btn--icon" type="button" data-act="undo" aria-label="Deshacer la última decisión" data-tooltip="Deshacer" disabled>${ICON.undo}</button>
      <button class="cs__btn cs__btn--icon" type="button" data-act="spread" aria-expanded="false" aria-label="Abrir el abanico" data-tooltip="Abrir el abanico">${ICON.fan}</button>
      <button class="cs__btn cs__btn--ok" type="button" data-act="approve">${ICON.check}<span>Aprobar</span></button>
    </div>
    <p class="cs__count" role="status" aria-live="polite"></p>`;

  const $ = (s) => el.querySelector(s);
  const stack = $('.cs__stack');
  const emptyBox = $('.cs__empty');
  const count = $('.cs__count');
  const undoBtn = $('[data-act="undo"]');
  const spreadBtn = $('[data-act="spread"]');
  const approveBtn = $('[data-act="approve"]');
  const rejectBtn = $('[data-act="reject"]');
  const nodes = [...el.querySelectorAll('.cs__card')];

  let spread = false;
  let destroyed = false;
  const timers = new Set();
  const anims = new Set();
  const cleanups = [];
  const history = [];
  const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); cleanups.push(() => t.removeEventListener(type, fn, o)); };
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const play = (node, frames, options) => { const a = node.animate(frames, options); anims.add(a); a.finished.then(() => anims.delete(a), () => anims.delete(a)); return a; };

  const cards = nodes.map((node, i) => {
    const card = { node, data: data[i], state: 'pending', pose: [0, 0, 0], drag: null };
    card.f = follower(SPRING, (p) => { card.pose = [...p]; node.style.transform = `translate3d(${p[0]}px, ${p[1]}px, 0) rotate(${p[2]}deg)`; }, 0.08, [node]);
    return card;
  });
  const pending = () => cards.filter((c) => c.state === 'pending');

  // The pose of the card at depth `d` out of `n` that remain: the original's pile and fan.
  const poseOf = (d, n) => {
    const turn = reduced() ? 0 : 1;
    if (!spread) return [d * 10 - (n - 1) * 5, d * 2, d * 1.5 * turn];
    const total = CARD_W + (n - 1) * (CARD_W - OVERLAP);
    return [d * (CARD_W - OVERLAP) - total / 2 + CARD_W / 2, 0, (d * 5 - (n - 1) * 2.5) * turn];
  };

  const layout = ({ jump = false, stagger = false } = {}) => {
    const rest = pending();
    rest.forEach((c, d) => {
      c.node.style.zIndex = String(rest.length - d + 1);
      const target = poseOf(d, rest.length);
      const first = d === 0;
      c.node.setAttribute('aria-hidden', first ? 'false' : 'true');
      c.node.dataset.top = String(first);
      if (jump || reduced()) {
        const moved = !jump && c.pose.some((v, k) => Math.abs(v - target[k]) > 1);
        c.f.to(target, true);
        if (moved) play(c.node, [{ opacity: 0.55 }, { opacity: 1 }], { duration: 120, easing: EASE });
      } else if (stagger) later(() => { if (!destroyed && c.state === 'pending') c.f.to(poseOf(rest.indexOf(c), pending().length)); }, d * 40);
      else c.f.to(target);
    });
    const n = rest.length;
    emptyBox.hidden = n > 0;
    stack.dataset.empty = String(n === 0);
    approveBtn.disabled = rejectBtn.disabled = n === 0;
    spreadBtn.disabled = n === 0;
    undoBtn.disabled = history.length === 0;
    if (n === 0 && el.contains(document.activeElement) && document.activeElement !== stack) emptyBox.querySelector('button').focus();
    count.textContent = n ? `${n} ${n === 1 ? 'factura' : 'facturas'} por revisar` : 'No quedan facturas por revisar';
    el.dataset.remaining = String(n);
  };

  const reach = () => stack.getBoundingClientRect().width / 2 + CARD_W;
  const decide = (decision, from) => {
    const c = pending()[0];
    if (!c) return;
    const dir = decision === 'approved' ? 1 : -1;
    c.state = decision;
    c.node.dataset.decision = decision;
    c.node.dataset.top = 'false';
    c.node.style.setProperty('--ok', dir > 0 ? '1' : '0');
    c.node.style.setProperty('--no', dir < 0 ? '1' : '0');
    c.node.style.pointerEvents = 'none';
    c.node.style.zIndex = '40';
    c.node.setAttribute('aria-hidden', 'true');
    history.push(c);
    if (reduced()) {
      play(c.node, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: EASE, fill: 'forwards' });
    } else {
      c.f.to([dir * reach(), (from?.y ?? c.pose[1]) + 40, dir * 24]);
      play(c.node, [{ opacity: 1 }, { opacity: 0 }], { duration: 280, delay: 140, easing: EASE, fill: 'forwards' });
    }
    later(() => { if (c.state === decision) c.node.style.visibility = 'hidden'; }, reduced() ? 130 : 520);
    layout();
    el.dispatchEvent(new CustomEvent('cardstack:decide', { detail: { id: c.data.id, decision }, bubbles: true }));
    count.textContent = `${decision === 'approved' ? 'Aprobaste' : 'Rechazaste'} la factura de ${c.data.client}. ${pending().length ? `${pending().length} por revisar.` : 'No quedan facturas por revisar.'}`;
  };

  const undo = () => {
    const c = history.pop();
    if (!c) return;
    const dir = c.state === 'approved' ? 1 : -1;
    c.state = 'pending';
    delete c.node.dataset.decision;
    c.node.style.visibility = '';
    c.node.style.pointerEvents = '';
    c.node.style.removeProperty('--ok');
    c.node.style.removeProperty('--no');
    for (const a of c.node.getAnimations()) a.cancel();
    const rest = pending();
    rest.sort((a, b) => cards.indexOf(a) - cards.indexOf(b));
    if (!reduced()) c.f.to([dir * reach() * 0.6, 40, dir * 16], true);
    c.node.style.opacity = '';
    layout({ jump: reduced() });
    play(c.node, [{ opacity: 0 }, { opacity: 1 }], { duration: reduced() ? 120 : 200, easing: EASE });
    el.dispatchEvent(new CustomEvent('cardstack:undo', { detail: { id: c.data.id }, bubbles: true }));
    count.textContent = `Volviste a la factura de ${c.data.client}. ${pending().length} por revisar.`;
  };

  const setSpread = (value) => {
    spread = value;
    spreadBtn.setAttribute('aria-expanded', String(spread));
    spreadBtn.setAttribute('aria-label', spread ? 'Cerrar el abanico' : 'Abrir el abanico');
    spreadBtn.dataset.tooltip = spread ? 'Cerrar el abanico' : 'Abrir el abanico';
    el.dataset.spread = String(spread);
    layout({ stagger: spread && !reduced() });
  };

  // Dragging: the top card follows the pointer on the pointer spring; past 110 px, or flicked, it leaves.
  let gesture = null;
  const hint = (c, dx) => {
    c.node.style.setProperty('--ok', String(Math.max(0, Math.min(1, dx / THRESHOLD))));
    c.node.style.setProperty('--no', String(Math.max(0, Math.min(1, -dx / THRESHOLD))));
  };
  on(stack, 'pointerdown', (e) => {
    if (e.button > 0) return;
    const inCard = e.target.closest('.cs__card');
    if (!inCard) return;
    const c = pending()[0];
    gesture = { c, draggable: c?.node === inCard, x: e.clientX, y: e.clientY, vx: 0, lx: e.clientX, lt: performance.now(), moved: false, id: e.pointerId, base: poseOf(0, pending().length) };
  });
  on(stack, 'pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.id || !gesture.draggable) return;
    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) > 4) {
      gesture.moved = true;
      stack.setPointerCapture(e.pointerId);
      gesture.c.node.dataset.dragging = 'true';
    }
    if (!gesture.moved) return;
    const now = performance.now();
    gesture.vx = (e.clientX - gesture.lx) / Math.max(1, now - gesture.lt);
    gesture.lx = e.clientX;
    gesture.lt = now;
    const [bx, by, br] = gesture.base;
    gesture.c.f.to([bx + dx, by + dy * 0.4, br + dx * 0.06]);
    hint(gesture.c, dx);
  });
  const release = (e, cancelled) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture;
    gesture = null;
    if (g.c) delete g.c.node.dataset.dragging;
    if (!g.moved) { if (!cancelled) setSpread(!spread); return; }
    const dx = e.clientX - g.x;
    const away = !cancelled && (Math.abs(dx) > THRESHOLD || Math.abs(g.vx) > 0.6);
    if (away) decide((Math.abs(g.vx) > 0.6 ? g.vx : dx) > 0 ? 'approved' : 'rejected', { y: g.base[1] + (e.clientY - g.y) * 0.4 });
    else { g.c.f.to(poseOf(0, pending().length)); g.c.node.style.setProperty('--ok', '0'); g.c.node.style.setProperty('--no', '0'); }
  };
  on(stack, 'pointerup', (e) => release(e, false));
  on(stack, 'pointercancel', (e) => release(e, true));

  on(el, 'click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !el.contains(b)) return;
    const act = b.dataset.act;
    if (act === 'approve') decide('approved');
    else if (act === 'reject') decide('rejected');
    else if (act === 'undo') undo();
    else if (act === 'spread') setSpread(!spread);
    else if (act === 'reset') api.reset();
  });
  on(stack, 'keydown', (e) => {
    if (e.target !== stack) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowright' || k === 'a') { e.preventDefault(); decide('approved'); }
    else if (k === 'arrowleft' || k === 'r') { e.preventDefault(); decide('rejected'); }
    else if (k === 'backspace' || ((e.ctrlKey || e.metaKey) && k === 'z')) { e.preventDefault(); undo(); }
    else if (k === 'enter') { e.preventDefault(); setSpread(!spread); }
  });

  layout({ jump: true });

  const api = {
    approve: () => decide('approved'),
    reject: () => decide('rejected'),
    undo,
    spread: setSpread,
    reset() {
      while (history.length) undo();
      stack.focus();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const t of timers) clearTimeout(t);
      for (const a of anims) a.cancel();
      for (const c of cards) c.f.stop();
      for (const off of cleanups) off();
      el.classList.remove('cs');
      delete el.dataset.spread;
      delete el.dataset.remaining;
      el.innerHTML = original;
      mounted.delete(el);
    },
  };
  mounted.set(el, api);
  return api;
};

if (typeof document !== 'undefined') for (const el of document.querySelectorAll('[data-motion="card-stack"]')) mount(el);
