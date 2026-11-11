// What a person enters or confirms beyond a plain field: a one-time code, a checklist, a slide to confirm, a time on a
// ruler, an amount with steps, a list of tags and a pager. Each is wired by its markup (`initEntry(root)`, called by
// `ui.init`) and has its keyboard path, its words said to a screen reader and its reduced-motion form. The code, the
// checklist, the slide and the ruler are ported from Bencho (`cabralorenzo/bencho`, MIT): their springs, timings and
// geometry are the original's; what the original lacks (keyboard, roles, announcements) is added here.
import { once, reduced, messages, locale, follower, forever, pauseOffscreen, EASE_OUT } from './core.js';

// Bencho's spring, per frame: `k` pulls toward the target, `d` keeps that share of the speed every 16.67 ms. It parks when
// both the distance and the speed fall under `rest`. With reduced motion every move is a jump.
const kd = (k, d, apply, rest = 0.02) => {
  let x = null;
  let v = 0;
  let to = 0;
  let raf = 0;
  let prev = 0;
  const frame = (t) => {
    const dt = Math.min(2.5, Math.max(0, (t - prev) / 16.67));
    prev = t;
    v += (to - x) * k * dt;
    v *= Math.pow(d, dt);
    x += v * dt;
    if (Math.abs(to - x) < rest && Math.abs(v) < rest) { x = to; v = 0; raf = 0; apply(x, v); return; }
    apply(x, v);
    raf = requestAnimationFrame(frame);
  };
  return {
    to(next, jump) {
      to = next;
      if (jump || x === null || reduced()) { cancelAnimationFrame(raf); raf = 0; x = next; v = 0; apply(x, v); return; }
      if (!raf) { prev = performance.now(); raf = requestAnimationFrame(frame); }
    },
    get value() { return x; },
  };
};
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
const say = (region, text) => { region.textContent = ''; requestAnimationFrame(() => { region.textContent = text; }); };
const SVG = 'http://www.w3.org/2000/svg';

// ── One-time code. One real input (`autocomplete=one-time-code`, numeric) lies over drawn cells, so typing, pasting and
// the phone's autofill are the platform's. Full, it waits: `data-answer` decides in the gallery; an app listens to `code`
// and calls `accept()` or `reject()`. Accepted, the cells flow into one pill through a goo filter on a raw spring
// (k .075, ζ .42) that overshoots; rejected, they shake and drain right to left, and the message says why. ──
const GOO_ID = 'entry-goo';
const gooFilter = () => {
  if (document.getElementById(GOO_ID)) return;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.innerHTML = `<filter id="${GOO_ID}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="3"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 24 -12"/></filter>`;
  document.body.append(svg);
};
const CELL = 36;
const GAP = 7;
const PILL = 128;
const otp = (root) => {
  if (!once(root, 'uiOtp')) return;
  const input = root.querySelector('.otp__field');
  const n = Number(root.dataset.length) || 6;
  const width = n * CELL + (n - 1) * GAP;
  gooFilter();
  input.maxLength = n;
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('autocomplete', 'one-time-code');
  input.setAttribute('aria-label', messages.codeLabel(n));
  input.setAttribute('data-1p-ignore', '');
  const row = el('div', 'otp__row');
  row.style.width = `${width}px`;
  const goo = el('div', 'otp__goo', { 'aria-hidden': 'true' });
  const cells = Array.from({ length: n }, () => goo.appendChild(el('span', 'otp__cell')));
  const pill = goo.appendChild(el('span', 'otp__pill'));
  const slots = Array.from({ length: n }, (_, i) => { const s = el('span', 'otp__slot', { 'aria-hidden': 'true' }); s.style.left = `${i * (CELL + GAP)}px`; return s; });
  const caret = el('i', 'otp__caret', { 'aria-hidden': 'true' });
  const ok = el('span', 'otp__ok', { 'aria-hidden': 'true' });
  ok.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>${root.dataset.verified ?? messages.codeVerified}`;
  const status = el('span', 'otp__message', { role: 'status' });
  input.before(row);
  row.append(goo, ...slots, caret, ok, input);
  root.append(status);
  let phase = 'type';
  let typed = '';
  // The merge: cells slide to the middle, round into the pill, the digits leave and the word arrives.
  const merge = kd(0.075, 1 - 2 * 0.42 * Math.sqrt(0.075), (m) => {
    const t = clamp(m);
    const over = m - 1;
    const mid = (width - CELL) / 2;
    cells.forEach((c, i) => {
      const home = i * (CELL + GAP);
      c.style.transform = `translateX(${mix(home, mid, t)}px)`;
      c.style.borderRadius = `${mix(12, 22, smooth(0.15, 0.7, m))}px`;
    });
    const w = PILL * smooth(0.3, 1, m) * (1 + Math.max(-0.12, over) * 0.9);
    pill.style.width = `${w}px`;
    pill.style.transform = `translateX(${(width - w) / 2}px) scaleY(${1 - Math.max(-0.12, over) * 0.55})`;
    for (const s of slots) s.style.opacity = String(1 - smooth(0, 0.45, m));
    ok.style.opacity = String(smooth(0.72, 1, m));
    ok.style.transform = `translate(-50%, -50%) scale(${mix(0.92, 1, smooth(0.72, 1, m))})`;
  }, 0.0008);
  merge.to(0, true);
  // The caret travels to the next cell on its own spring and stretches with its speed.
  const caretSpring = kd(0.2, 0.62, (x, v) => { caret.style.transform = `translateX(${x}px) scaleX(${1 + Math.min(5, Math.abs(v) * 0.9)})`; }, 0.05);
  caretSpring.to(CELL / 2 - 1, true);
  const paint = (pasted = 0) => {
    slots.forEach((s, i) => {
      const d = typed[i] ?? '';
      if (s.textContent === d) return;
      s.textContent = d;
      if (!d || reduced()) return;
      const delay = pasted > 1 ? i * 45 : 0;
      s.animate([{ opacity: 0, transform: 'translateY(45%) scale(.86)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'none' }], { duration: 300, delay, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
      cells[i].animate([{ scale: 1 }, { scale: 1.04 }, { scale: 1 }], { duration: 260, delay });
    });
    slots.forEach((s, i) => s.toggleAttribute('data-current', phase === 'type' && i === Math.min(typed.length, n - 1) && document.activeElement === input));
    caret.hidden = !(phase === 'type' && typed.length < n && document.activeElement === input);
    caretSpring.to(Math.min(typed.length, n - 1) * (CELL + GAP) + CELL / 2 - 1);
  };
  let breathing = null;
  const settle = () => { breathing?.forEach((a) => a.cancel()); breathing = null; };
  const accept = () => {
    if (phase !== 'check') return;
    settle();
    phase = 'ok';
    root.dataset.state = 'ok';
    input.setAttribute('aria-label', root.dataset.reopen ?? messages.codeReopen);
    merge.to(1);
    say(status, root.dataset.verified ?? messages.codeVerified);
    paint();
  };
  const reject = (reason = root.dataset.wrong ?? messages.codeWrong) => {
    if (phase !== 'check') return;
    settle();
    phase = 'no';
    root.dataset.state = 'no';
    input.setAttribute('aria-invalid', 'true');
    status.textContent = reason;
    const end = 620 + n * 45 + 160;
    if (!reduced()) {
      cells.forEach((c, i) => c.animate(Array.from({ length: 21 }, (_, f) => { const t = (f / 20) * 620; return { translate: `${5 * Math.exp(-t / 190) * Math.sin((t * 2 * Math.PI * 10) / 1000 + i * 0.55)}px 0` }; }), { duration: 620 }));
      slots.forEach((s, i) => s.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px)' }], { duration: 220, delay: 300 + (n - 1 - i) * 45, easing: 'ease-in', fill: 'forwards' }));
    }
    setTimeout(() => {
      slots.forEach((s) => s.getAnimations().forEach((a) => a.cancel()));
      typed = ''; input.value = ''; phase = 'type'; delete root.dataset.state;
      paint();
    }, reduced() ? 0 : end);
  };
  const reopen = () => {
    phase = 'type'; typed = ''; input.value = ''; delete root.dataset.state;
    input.setAttribute('aria-label', messages.codeLabel(n));
    merge.to(0);
    status.textContent = '';
    paint();
  };
  const full = () => {
    phase = 'check';
    root.dataset.state = 'check';
    if (!reduced()) breathing = cells.map((c, i) => c.animate([{ scale: 1 }, { scale: 0.93 }, { scale: 1 }], { duration: 900, delay: i * 30, iterations: Infinity }));
    const answer = root.dataset.answer;
    root.dispatchEvent(new CustomEvent('code', { detail: { code: typed, accept, reject } }));
    if (answer) setTimeout(() => (typed === answer ? accept() : reject()), reduced() ? 0 : 420);
  };
  input.addEventListener('input', () => {
    if (phase !== 'type') { input.value = typed; return; }
    const next = input.value.replace(/\D/g, '').slice(0, n);
    const pasted = next.length - typed.length;
    typed = next; input.value = next;
    input.removeAttribute('aria-invalid');
    if (status.textContent && phase === 'type') status.textContent = '';
    paint(pasted);
    if (typed.length === n) full();
  });
  input.addEventListener('keydown', (e) => { if (phase === 'ok' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); reopen(); } });
  input.addEventListener('pointerdown', (e) => { if (phase === 'ok') { e.preventDefault(); reopen(); input.focus(); } });
  input.addEventListener('focus', () => paint());
  input.addEventListener('blur', () => paint());
  root.otp = { accept, reject, reset: reopen };
  paint();
};

// ── Checklist. Each row is a checkbox button; one spring per row (k .16, d .72) and everything is read off it: the box
// fills on the raw value (it swells past full and settles), the tick draws and the rule crosses the words on the clamped
// one (a tick that overshoots would draw past its end), and the words give up their ink. A count says how many are done;
// the last row adds one in place. ──
const checklist = (root) => {
  if (!once(root, 'uiChecklist')) return;
  const list = root.querySelector('.checklist__list');
  const count = root.querySelector('.checklist__count');
  const status = root.appendChild(el('span', 'visually-hidden', { role: 'status' }));
  const max = Number(root.dataset.max) || 8;
  const total = () => list.querySelectorAll('.checklist__row').length;
  const done = () => list.querySelectorAll('.checklist__row[aria-checked=true]').length;
  const recount = () => { if (count) count.textContent = messages.checklistCount(done(), total()); root.toggleAttribute('data-complete', done() === total()); };
  const wire = (row) => {
    const text = row.textContent.trim();
    row.setAttribute('role', 'checkbox');
    row.type = 'button';
    row.innerHTML = '';
    const box = row.appendChild(el('span', 'checklist__box', { 'aria-hidden': 'true' }));
    const fill = box.appendChild(el('span', 'checklist__fill'));
    box.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12.4 L10.3 16.7 L18 7.6" pathLength="1"/></svg>');
    const tick = box.querySelector('path');
    const words = row.appendChild(el('span', 'checklist__say'));
    const word = words.appendChild(el('span', 'checklist__word'));
    word.textContent = text;
    const rule = words.appendChild(el('span', 'checklist__rule', { 'aria-hidden': 'true' }));
    const s = kd(0.16, 0.72, (t) => {
      const held = clamp(t);
      fill.style.transform = `scale(${Math.max(0, t)})`;
      tick.style.strokeDashoffset = String(1 - held);
      word.style.opacity = String(mix(1, 0.42, held));
      rule.style.transform = `scaleX(${clamp((held - 0.12) / 0.72)})`;
    });
    s.to(row.getAttribute('aria-checked') === 'true' ? 1 : 0, true);
    row.addEventListener('click', () => {
      const on = row.getAttribute('aria-checked') !== 'true';
      row.setAttribute('aria-checked', String(on));
      s.to(on ? 1 : 0);
      recount();
    });
  };
  list.querySelectorAll('.checklist__row').forEach(wire);
  const add = root.querySelector('.checklist__add');
  if (add) {
    const open = add.querySelector('.checklist__new');
    const field = add.querySelector('.checklist__field');
    const show = (editing) => { open.hidden = editing; field.hidden = !editing; if (editing) field.focus(); };
    open.addEventListener('click', () => show(true));
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { field.value = ''; show(false); open.focus(); }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const name = field.value.trim();
      if (!name) return;
      const li = el('li');
      const row = li.appendChild(el('button', 'checklist__row', { 'aria-checked': 'false' }));
      row.textContent = name;
      list.append(li);
      wire(row);
      if (!reduced()) {
        // The new row arrives on the original's spring (380 / 34 / .9), from 10 px below.
        const g = follower({ stiffness: 380, damping: 34, mass: 0.9 }, ([y, o]) => { li.style.transform = `translateY(${y}px)`; li.style.opacity = String(o); });
        g.to([10, 0], true); g.to([0, 1]);
      }
      field.value = '';
      say(status, messages.checklistAdded(name));
      recount();
      if (total() >= max) { show(false); add.hidden = true; }
    });
    field.addEventListener('blur', () => { if (!field.value.trim()) show(false); });
  }
  recount();
};

// ── Slide to confirm. The grip is dragged to the end of the track; short of it, it springs home, under-damped (it squashes
// against the start). At the end it widens into the confirmed pill while its right edge stays put, and the track gives a
// pulse. Keyboard: the grip is a slider; Enter, Space or End confirm, the arrows move it. The commit spring is 580 with
// critical damping (mass .9); the way home keeps 62 % of that damping. `confirm` fires on the root; `reset()` brings it back. ──
const GRIP = 48;
const slide = (root, life) => {
  if (!once(root, 'uiSlide')) return;
  const label = root.querySelector('.slide-confirm__say')?.textContent.trim() ?? '';
  const doneLabel = root.dataset.done ?? 'Confirmed';
  root.innerHTML = '';
  const track = root.appendChild(el('div', 'slide-confirm__track'));
  const wash = track.appendChild(el('i', 'slide-confirm__wash', { 'aria-hidden': 'true' }));
  const sayEl = track.appendChild(el('span', 'slide-confirm__say', { 'aria-hidden': 'true' }));
  pauseOffscreen(sayEl);
  sayEl.textContent = label;
  const grip = track.appendChild(el('span', 'slide-confirm__grip', { role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-description': messages.slideKeys }));
  grip.innerHTML = `<svg class="slide-confirm__arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg><span class="slide-confirm__done" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>${doneLabel}</span>`;
  const arrow = grip.querySelector('.slide-confirm__arrow');
  const doneEl = grip.querySelector('.slide-confirm__done');
  const status = root.appendChild(el('span', 'visually-hidden', { role: 'status' }));
  const travel = () => Math.max(0, track.clientWidth - 8 - GRIP);
  let done = false;
  let x = 0;
  let anchor = 0;
  const commit = { stiffness: 580, damping: 2 * Math.sqrt(580 * 0.9), mass: 0.9 };
  const draw = ([px, an]) => {
    x = px; anchor = an;
    const T = travel();
    const seen = clamp(px, 0, T);
    const over = Math.max(0, -px);
    const sx = 1 - Math.min(0.08, over / 110);
    const width = GRIP + clamp(an - seen, 0, T);
    grip.style.width = `${width}px`;
    grip.style.transform = `translateX(${seen}px) scale(${sx}, ${1 / sx})`;
    wash.style.width = `${seen + width}px`;
    if (!done && T) {
      sayEl.style.opacity = String(clamp(1 - seen / (0.55 * T)));
      arrow.style.opacity = String(clamp(1 - (seen - 0.55 * T) / (0.4 * T)));
      grip.setAttribute('aria-valuenow', String(Math.round((seen / T) * 100)));
    }
  };
  const spring = follower(commit, draw, 0.3, [grip]);
  spring.to([0, 0], true);
  const finish = () => {
    if (done) return;
    done = true;
    root.dataset.state = 'done';
    const T = travel();
    grip.setAttribute('aria-valuenow', '100');
    grip.setAttribute('aria-valuetext', doneLabel);
    commit.damping = 2 * Math.sqrt(580 * 0.9);
    spring.to([T, T], true);
    spring.to([0, T], reduced());
    if (!reduced()) {
      track.animate([{ scale: 1 }, { scale: 0.974, offset: 0.62 }, { scale: 1 }], { duration: 420, delay: 100, easing: 'cubic-bezier(.33,.55,.2,1)' });
      doneEl.animate([{ opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1 }], { duration: 160, easing: 'cubic-bezier(.33,.55,.2,1)' });
    }
    say(status, doneLabel);
    root.dispatchEvent(new CustomEvent('confirm'));
  };
  const home = () => { commit.damping = 2 * Math.sqrt(580 * 0.9) * 0.62; spring.to([0, 0]); };
  const reset = () => {
    done = false;
    delete root.dataset.state;
    grip.removeAttribute('aria-valuetext');
    commit.stiffness = 380; commit.damping = 34; commit.mass = 0.9;
    spring.to([0, 0], reduced());
    commit.stiffness = 580; commit.mass = 0.9;
    sayEl.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 120, easing: EASE_OUT, fill: 'backwards' });
  };
  let grab = null;
  track.addEventListener('pointerdown', (e) => {
    if (done || e.button !== 0) return;
    track.setPointerCapture(e.pointerId);
    grab = null;
    const scale = track.getBoundingClientRect().width / track.offsetWidth || 1;
    const move = (ev) => {
      const at = ev.clientX / scale;
      if (grab === null) { grab = at - x; return; }
      const T = travel();
      spring.to([clamp(at - grab, 0, T), 0], true);
    };
    const up = () => {
      track.removeEventListener('pointermove', move);
      if (x >= travel() - 1) finish(); else home();
    };
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', up, { once: true });
    track.addEventListener('pointercancel', up, { once: true });
  });
  grip.addEventListener('keydown', (e) => {
    if (done) return;
    const T = travel();
    if (['Enter', ' ', 'End'].includes(e.key)) { e.preventDefault(); commit.damping = 2 * Math.sqrt(580 * 0.9); spring.to([T, 0], reduced()); setTimeout(finish, reduced() ? 0 : 260); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); const next = Math.min(T, x + T * 0.25); spring.to([next, 0]); if (next >= T) setTimeout(finish, reduced() ? 0 : 260); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'Home') { e.preventDefault(); home(); }
  });
  grip.addEventListener('blur', () => { if (!done && x > 0) home(); });
  // Drawn while hidden (a closed tab, a filtered gallery) the track has no width: it is drawn again once it has one.
  life.watch(new ResizeObserver(() => draw(done ? [0, travel()] : [Math.min(x, travel()), 0]))).observe(track);
  root.slide = { reset, confirm: finish };
};

// ── A time on a ruler. Two pixels a minute; ticks every five minutes, taller at the quarter and the hour, fading and
// shrinking toward the edges, each one on a whole device pixel so a line never blurs between two. The reading is the
// step under the mark: when a step crosses the mark its digits roll and the mark ticks, in the same frame. Let go, the
// ruler keeps the release speed and slows down exponentially onto the nearest step in its path, without a bounce, the
// way a native scroll does. Keyboard: the ruler is a slider; arrows move a step, Page keys an hour, Home and End the
// ends of the day. ──
const PX = 2;
const DAY = 1440;
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const scrubber = (root, life) => {
  if (!once(root, 'uiScrubber')) return;
  const step = Number(root.dataset.step) || 15;
  const last = DAY - step;
  let value = clamp(Math.round((Number(root.dataset.value) || 0) / step) * step, 0, last);
  const read = root.appendChild(el('div', 'scrubber__read', { 'aria-hidden': 'true' }));
  const columns = [];
  for (const ch of '00:00') {
    if (ch === ':') { read.appendChild(el('span', 'scrubber__colon')).textContent = ':'; continue; }
    const col = read.appendChild(el('span', 'scrubber__digit'));
    const strip = col.appendChild(el('span', 'scrubber__strip'));
    strip.innerHTML = '0123456789'.split('').map((d) => `<span>${d}</span>`).join('');
    columns.push(strip);
  }
  const ruler = root.appendChild(el('div', 'scrubber__ruler', { role: 'slider', tabindex: '0', 'aria-label': root.getAttribute('aria-label') ?? '', 'aria-valuemin': '0', 'aria-valuemax': String(last) }));
  root.removeAttribute('aria-label');
  const trackEl = ruler.appendChild(el('div', 'scrubber__track', { 'aria-hidden': 'true' }));
  const mark = ruler.appendChild(el('span', 'scrubber__mark', { 'aria-hidden': 'true' }));
  const pool = [];
  let reading = -1;
  const shown = (m) => {
    if (m === reading) return;
    const first = reading < 0;
    reading = m;
    const t = hhmm(m).replace(':', '');
    columns.forEach((strip, i) => {
      if (strip.dataset.d === t[i]) return;
      strip.dataset.d = t[i];
      strip.style.transform = `translateY(${-Number(t[i]) * 1.5}em)`;
    });
    if (!first && !reduced()) mark.animate([{ transform: 'scaleY(1.18)' }, { transform: 'none' }], { duration: 140, easing: 'ease-out' });
  };
  const announce = (m) => { ruler.setAttribute('aria-valuenow', String(m)); ruler.setAttribute('aria-valuetext', hhmm(m)); };
  let x = value;
  const draw = () => {
    const half = Math.max(40, (ruler.clientWidth - 36) / 2);
    const dpr = devicePixelRatio || 1;
    const reach = half / PX + 10;
    const from = Math.ceil((x - reach) / 5) * 5;
    let used = 0;
    for (let m = from; m <= x + reach; m += 5) {
      if (m < 0 || m > DAY) continue;
      const off = (m - x) * PX;
      const f = clamp(1 - (Math.abs(off) / half) ** 2);
      let tick = pool[used];
      if (!tick) { tick = trackEl.appendChild(el('span', 'scrubber__tick')); tick.append(el('i'), el('b')); pool.push(tick); }
      used++;
      tick.hidden = false;
      tick.dataset.kind = m % 60 === 0 ? 'hour' : m % 15 === 0 ? 'quarter' : 'five';
      tick.style.transform = `translateX(${Math.round(off * dpr) / dpr}px)`;
      tick.firstChild.style.transform = `scaleY(${0.55 + 0.45 * f})`;
      tick.firstChild.style.opacity = String(0.18 + 0.82 * f);
      tick.lastChild.textContent = m % 60 === 0 ? String((m / 60) % 24).padStart(2, '0') : '';
      tick.lastChild.style.opacity = String(0.15 + 0.85 * f);
    }
    for (let i = used; i < pool.length; i++) pool[i].hidden = true;
    shown(clamp(Math.round(x / step) * step, 0, last));
  };
  // The glide: what is left to travel shrinks by the same share each frame (a time constant of `tau` frames), so it
  // starts at the speed it was given and arrives without overshoot; it parks once less than a quarter of a pixel is left.
  let to = x;
  let tau = 5;
  let raf = 0;
  let prev = 0;
  const frame = (t) => {
    const dt = Math.min(3, Math.max(0, (t - prev) / 16.67));
    prev = t;
    x = to + (x - to) * Math.exp(-dt / tau);
    if (Math.abs(to - x) < 0.12) { x = to; raf = 0; draw(); return; }
    draw();
    raf = requestAnimationFrame(frame);
  };
  const go = (m, speed = 0) => {
    value = clamp(Math.round(m / step) * step, 0, last);
    to = value;
    // A release speed sets the time constant, so the first frame keeps that speed; a key, a wheel or a still release
    // take 5 frames.
    tau = speed && Math.sign(speed) === Math.sign(to - x) ? clamp(Math.abs((to - x) / speed), 3, 24) : 5;
    announce(value);
    if (reduced()) { cancelAnimationFrame(raf); raf = 0; x = value; draw(); return; }
    if (!raf) { prev = performance.now(); raf = requestAnimationFrame(frame); }
    root.dispatchEvent(new CustomEvent('change', { detail: { minutes: value, label: hhmm(value) } }));
  };
  ruler.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    ruler.setPointerCapture(e.pointerId);
    cancelAnimationFrame(raf); raf = 0;
    let lastX = e.clientX;
    let lastT = performance.now();
    let speed = 0;
    root.dataset.dragging = '';
    const move = (ev) => {
      const now = performance.now();
      const dm = -(ev.clientX - lastX) / PX;
      const dt = Math.max(1, now - lastT) / 16.67;
      x = clamp(x + dm, 0, last);
      speed = speed * 0.4 + (dm / dt) * 0.6;
      lastX = ev.clientX; lastT = now;
      draw();
    };
    const up = () => {
      ruler.removeEventListener('pointermove', move);
      delete root.dataset.dragging;
      const sp = performance.now() - lastT > 80 ? 0 : clamp(speed, -14, 14);
      // Where a glide at that speed would stop by itself (a twelfth lost per frame); it lands on the step nearest to it.
      go(x + sp * 11, sp);
    };
    ruler.addEventListener('pointermove', move);
    ruler.addEventListener('pointerup', up, { once: true });
    ruler.addEventListener('pointercancel', up, { once: true });
  });
  let wheelIdle = 0;
  ruler.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    cancelAnimationFrame(raf); raf = 0;
    x = clamp(x + e.deltaX / PX, 0, last);
    draw();
    clearTimeout(wheelIdle);
    wheelIdle = setTimeout(() => go(x), 120);
  }, { passive: false });
  ruler.addEventListener('keydown', (e) => {
    const moves = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: 60, PageDown: -60 };
    if (e.key in moves) { e.preventDefault(); go(value + moves[e.key]); }
    if (e.key === 'Home') { e.preventDefault(); go(0); }
    if (e.key === 'End') { e.preventDefault(); go(last); }
  });
  announce(value);
  draw();
  life.watch(new ResizeObserver(draw)).observe(ruler);
  root.scrubber = { set: (m) => go(m), get value() { return value; } };
};

// ── An amount with steps. The figure is grouped as it is typed (the caret keeps its place among the digits); the buttons
// and the arrows add a step (Shift, ten), and a held button repeats faster and faster. Out of range is said, never
// clamped behind the person's back; the button that would leave the range is off. ──
const amount = (root) => {
  if (!once(root, 'uiAmount')) return;
  const input = root.querySelector('.input');
  const min = Number(root.dataset.min ?? -Infinity);
  const max = Number(root.dataset.max ?? Infinity);
  const step = Number(root.dataset.step) || 1;
  const error = root.querySelector('.field__error > span');
  const [down, up] = root.querySelectorAll('.amount__step');
  const nf = new Intl.NumberFormat(locale(root), { maximumFractionDigits: 0 });
  const money = (v) => `${root.querySelector('.amount__unit')?.textContent.trim() ?? ''} ${nf.format(v)}`.trim();
  const valueOf = () => Number(input.value.replace(/\D/g, '')) || 0;
  const check = () => {
    const v = valueOf();
    const message = v < min ? messages.amountMin(money(min)) : v > max ? messages.amountMax(money(max)) : '';
    if (error) error.textContent = message;
    if (message) { root.dataset.state = 'invalid'; input.setAttribute('aria-invalid', 'true'); } else if (root.dataset.state === 'invalid') { delete root.dataset.state; input.removeAttribute('aria-invalid'); }
    down.disabled = v - step < min;
    up.disabled = v + step > max;
  };
  const write = (v) => { input.value = nf.format(v); check(); };
  input.addEventListener('input', () => {
    const caret = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, caret).replace(/\D/g, '').length;
    const digits = input.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    input.value = digits ? nf.format(Number(digits)) : '';
    let seen = 0;
    let at = 0;
    while (at < input.value.length && seen < before) { if (/\d/.test(input.value[at])) seen++; at++; }
    input.setSelectionRange(at, at);
    check();
  });
  const nudge = (dir, times = 1) => { const v = clamp(valueOf() + dir * step * times, min, max); write(v); input.dispatchEvent(new Event('change', { bubbles: true })); };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); nudge(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1); }
  });
  for (const [btn, dir] of [[down, -1], [up, 1]]) {
    let timer = 0;
    const stop = () => clearTimeout(timer);
    btn.addEventListener('pointerdown', (e) => {
      if (btn.disabled || e.button !== 0) return;
      e.preventDefault();
      nudge(dir);
      let wait = 400;
      const again = () => { if (btn.disabled) return; nudge(dir); wait = Math.max(40, wait * 0.8); timer = setTimeout(again, wait); };
      timer = setTimeout(again, wait);
      btn.addEventListener('pointerup', stop, { once: true });
      btn.addEventListener('pointerleave', stop, { once: true });
    });
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nudge(dir); } });
  }
  write(valueOf());
};

// ── Tags. Enter or a comma adds what was typed; a repeated one is not added, the one already there flashes. Backspace on
// an empty input marks the last tag, a second one removes it. Each tag has its remove button; the others close the gap
// with FLIP. At `data-max` the input says it is full. ──
const tags = (root) => {
  if (!once(root, 'uiTags')) return;
  const list = root.querySelector('.tags__list');
  const input = root.querySelector('.tags__input');
  const status = root.appendChild(el('span', 'visually-hidden', { role: 'status' }));
  const max = Number(root.dataset.max) || Infinity;
  const names = () => [...list.querySelectorAll('.tag__text')].map((t) => t.textContent);
  const full = () => { const at = list.children.length >= max; input.disabled = at; input.placeholder = at ? messages.tagFull(max) : input.dataset.placeholder ?? input.placeholder; };
  input.dataset.placeholder = input.placeholder;
  const make = (name) => {
    const li = el('li', 'tag');
    li.innerHTML = `<span class="tag__text"></span><button class="tag__remove" type="button"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg></button>`;
    li.firstChild.textContent = name;
    li.lastChild.setAttribute('aria-label', messages.tagRemove(name));
    return li;
  };
  const remove = (li) => {
    const name = li.querySelector('.tag__text').textContent;
    const others = [...list.children].filter((c) => c !== li);
    const before = new Map(others.map((c) => [c, c.getBoundingClientRect()]));
    const go = () => {
      li.remove();
      if (!reduced()) for (const [c, r] of before) { const n = c.getBoundingClientRect(); const dx = r.left - n.left; const dy = r.top - n.top; if (dx || dy) c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 220, easing: EASE_OUT }); }
      full();
    };
    if (reduced()) go(); else li.animate([{ opacity: 1, transform: 'none', filter: 'none' }, { opacity: 0, transform: 'scale(.8)', filter: 'blur(2px)' }], { duration: 140, easing: 'ease-in' }).onfinish = go;
    say(status, messages.tagRemoved(name));
    input.focus();
  };
  const add = (raw) => {
    const name = raw.trim().replace(/,$/, '').trim();
    if (!name) return;
    const same = [...list.querySelectorAll('.tag')].find((t) => t.querySelector('.tag__text').textContent.toLowerCase() === name.toLowerCase());
    if (same) {
      if (!reduced()) same.animate([{ scale: 1 }, { scale: 1.08 }, { scale: 1 }], { duration: 320, easing: EASE_OUT });
      same.animate([{ background: 'var(--accent-soft)' }, { background: 'var(--accent-soft)', offset: 0.6 }, {}], { duration: 900 });
      say(status, messages.tagRepeated(name));
      input.value = '';
      return;
    }
    if (list.children.length >= max) return;
    const li = make(name);
    list.append(li);
    if (!reduced()) li.animate([{ opacity: 0, transform: 'scale(.8)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'none' }], { duration: 180, easing: EASE_OUT });
    input.value = '';
    say(status, messages.tagAdded(name));
    full();
  };
  list.querySelectorAll('.tag').forEach((li) => li.replaceWith(make(li.textContent.trim())));
  list.addEventListener('click', (e) => { const b = e.target.closest('.tag__remove'); if (b) remove(b.closest('.tag')); });
  root.addEventListener('click', (e) => { if (e.target === root || e.target === list) input.focus(); });
  input.addEventListener('keydown', (e) => {
    const armed = list.querySelector('.tag[data-armed]');
    if (e.key !== 'Backspace' && armed) delete armed.dataset.armed;
    if (e.key === 'Enter' || e.key === ',') { if (input.value.trim()) { e.preventDefault(); add(input.value); } return; }
    if (e.key === 'Backspace' && !input.value && list.lastElementChild) {
      const lastTag = list.lastElementChild;
      if (lastTag.dataset.armed !== undefined) remove(lastTag); else { lastTag.dataset.armed = ''; say(status, messages.tagRemove(lastTag.querySelector('.tag__text').textContent)); }
    }
  });
  input.addEventListener('blur', () => { list.querySelector('.tag[data-armed]')?.removeAttribute('data-armed'); });
  root.tags = { add, get values() { return names(); } };
  full();
};

// ── A pager. The range in words («21–40 of 248»), previous and next, the first and last page and the pages around the
// current one with a gap between; a pill slides under the current page. `page` fires on the root with the new number. ──
const pager = (root, life) => {
  if (!once(root, 'uiPager')) return;
  const total = Number(root.dataset.total) || 0;
  const size = Number(root.dataset.size) || 20;
  const pages = Math.max(1, Math.ceil(total / size));
  let page = clamp(Number(root.dataset.page) || 1, 1, pages);
  const range = root.appendChild(el('span', 'pager__range'));
  const prev = root.appendChild(el('button', 'pager__step', { type: 'button', 'aria-label': messages.pagePrevious }));
  prev.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5"/></svg>';
  const list = root.appendChild(el('span', 'pager__pages'));
  const pill = list.appendChild(el('span', 'pager__pill', { 'aria-hidden': 'true' }));
  const next = root.appendChild(el('button', 'pager__step', { type: 'button', 'aria-label': messages.pageNext }));
  next.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"/></svg>';
  const visible = () => {
    const keep = new Set([1, pages, page - 1, page, page + 1]);
    if (page <= 3) [2, 3, 4].forEach((p) => keep.add(p));
    if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((p) => keep.add(p));
    const sorted = [...keep].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
    return sorted.flatMap((p, i) => (i && p - sorted[i - 1] > 1 ? ['gap', p] : [p]));
  };
  const render = (focusNumber) => {
    const nf = new Intl.NumberFormat(locale(root));
    const from = (page - 1) * size + 1;
    const to = Math.min(total, page * size);
    range.textContent = messages.pageRange(nf.format(from), nf.format(to), nf.format(total));
    prev.disabled = page === 1;
    next.disabled = page === pages;
    [...list.children].forEach((c) => c !== pill && c.remove());
    for (const p of visible()) {
      if (p === 'gap') { list.appendChild(el('span', 'pager__gap', { 'aria-hidden': 'true' })).textContent = '…'; continue; }
      const b = list.appendChild(el('button', 'pager__page', { type: 'button', 'aria-label': messages.page(p) }));
      b.textContent = nf.format(p);
      b.dataset.page = String(p);
      if (p === page) b.setAttribute('aria-current', 'page');
    }
    const current = list.querySelector('[aria-current=page]');
    // The pill slides on transform; its width is set outright, since the pages differ by a digit at most and a scaled
    // pill would stretch its corners.
    pill.style.width = `${current.offsetWidth}px`;
    pill.style.transform = `translateX(${current.offsetLeft}px)`;
    if (focusNumber) list.querySelector(`[data-page="${focusNumber}"]`)?.focus();
  };
  const go = (p, focus) => {
    const target = clamp(p, 1, pages);
    if (target === page) return;
    page = target;
    render(focus ? page : 0);
    root.dispatchEvent(new CustomEvent('page', { detail: { page } }));
  };
  prev.addEventListener('click', () => go(page - 1));
  next.addEventListener('click', () => go(page + 1));
  list.addEventListener('click', (e) => { const b = e.target.closest('.pager__page'); if (b) go(Number(b.dataset.page), true); });
  render();
  life.watch(new ResizeObserver(() => render())).observe(list);
  root.pager = { go, get page() { return page; } };
};

export const initEntry = (root = document, life = forever) => {
  root.querySelectorAll('.otp').forEach(otp);
  root.querySelectorAll('.checklist').forEach(checklist);
  root.querySelectorAll('.slide-confirm').forEach((s) => slide(s, life));
  root.querySelectorAll('.scrubber').forEach((s) => scrubber(s, life));
  root.querySelectorAll('.amount').forEach(amount);
  root.querySelectorAll('.tags').forEach(tags);
  root.querySelectorAll('.pager').forEach((p) => pager(p, life));
};
