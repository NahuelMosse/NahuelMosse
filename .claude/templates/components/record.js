// The behavior of a dense record (record.css): the header that sticks and compacts once the page scrolls, the
// section nav that marks the section in view and moves its ink under it, the heights both publish so a section
// reached by its link lands under them instead of behind them, the entrance in reading order and the request tried
// against other limits.
import { reduced, escapeHtml } from './core.js';
import { setNumber } from './components.js';

// Publishes the header and nav heights as --record-head-h and --record-nav-h on the record, and keeps them current.
const publishHeights = (record, head, nav) => {
  // The same heights pad the page's scrollport, so a focused control or an anchor never lands under the sticky bars
  // (WCAG 2.4.11); the decision bar fixed to the bottom pads it from below, and its height, as --record-bar-h on the
  // document, lifts the toasts above it. The main column gets a tail as tall as
  // the last section is short of the viewport, so that section too can be brought up under the bars.
  // Both are measured against the compact header, the one in place once the page has scrolled: an anchor lands right
  // under it, and the tail does not grow under a reader who just reached the end.
  const last = record.querySelector('.record-main > .record-section:last-child');
  const compactHeight = () => {
    if (head.hasAttribute('data-stuck')) return head.offsetHeight;
    head.setAttribute('data-stuck', '');
    const height = head.offsetHeight;
    head.removeAttribute('data-stuck');
    return height;
  };
  const set = () => {
    const navHeight = nav?.offsetHeight ?? 0;
    const top = compactHeight() + navHeight + 8;
    const bar = record.querySelector('.decision');
    const below = bar && getComputedStyle(bar).position === 'fixed' ? bar.offsetHeight + 8 : 0;
    record.style.setProperty('--record-head-h', `${head.offsetHeight}px`);
    if (nav) record.style.setProperty('--record-nav-h', `${navHeight}px`);
    if (last) record.style.setProperty('--record-tail', `${Math.max(0, innerHeight - top - below - last.offsetHeight - parseFloat(getComputedStyle(record).paddingBottom))}px`);
    document.documentElement.style.scrollPaddingTop = `${top}px`;
    document.documentElement.style.scrollPaddingBottom = below ? `${below}px` : '';
    document.documentElement.style.setProperty('--record-bar-h', below ? `${bar.offsetHeight}px` : '0px');
  };
  addEventListener('resize', set);
  for (const el of [head, nav, last]) if (el) new ResizeObserver(set).observe(el);
  set();
};

// A 1 px sentinel sits above the header: once it leaves the viewport the header is stuck. The sentinel stays above
// the header, so compacting the header never brings it back into view and the state does not flicker.
const stickyHead = (record, head) => {
  const sentinel = document.createElement('div');
  sentinel.className = 'record__sentinel';
  sentinel.setAttribute('aria-hidden', 'true');
  head.before(sentinel);
  new IntersectionObserver(([entry]) => head.toggleAttribute('data-stuck', !entry.isIntersecting)).observe(sentinel);
};

// The current section is the last one whose top has passed under the header and the nav; at the end of the page it
// is the last section, even if it is too short to reach that line.
const scrollspy = (record, nav) => {
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const sections = links.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
  const list = nav.querySelector('.section-nav__list');
  const ink = document.createElement('span');
  ink.className = 'section-nav__ink';
  ink.setAttribute('aria-hidden', 'true');
  list.append(ink);
  let current = null;
  const mark = (link) => {
    if (link === current) return;
    current?.removeAttribute('aria-current');
    current = link;
    link.setAttribute('aria-current', 'location');
    ink.style.transform = `translateX(${link.offsetLeft}px) scaleX(${link.offsetWidth})`;
    if (list.scrollWidth > list.clientWidth) {
      const left = link.offsetLeft - (list.clientWidth - link.offsetWidth) / 2;
      list.scrollTo({ left, behavior: reduced() ? 'auto' : 'smooth' });
    }
  };
  // A section reached from the nav stays marked until the reader scrolls on their own: near the end of the page the
  // scroll stops short of the line, and the end-of-page rule would mark the last section instead of the one asked for.
  // Only the reader's own input lets it go: the page also scrolls by itself while the record draws in and its tail
  // is measured, and those scrolls are not a choice.
  let chosen = null;
  const release = () => { chosen = null; };
  const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
  for (const type of ['wheel', 'touchstart', 'pointerdown']) addEventListener(type, release, { passive: true });
  addEventListener('keydown', (event) => { if (SCROLL_KEYS.has(event.key)) release(); });
  const update = () => {
    if (chosen) { mark(chosen); return; }
    const line = record.querySelector('.section-nav').getBoundingClientRect().bottom + 8;
    const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
    let index = 0;
    sections.forEach((s, i) => { if (s.getBoundingClientRect().top <= line) index = i; });
    if (atEnd) index = sections.length - 1;
    mark(links[index]);
  };
  let queued = false;
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } }, { passive: true });
  addEventListener('resize', () => { current = null; update(); });
  links.forEach((link) => link.addEventListener('click', (event) => {
    const target = document.getElementById(link.hash.slice(1));
    if (!target) return;
    event.preventDefault();
    chosen = link;
    mark(link);
    // The header compacts before the scroll, not during it: compacting shortens the page above the target, which
    // would leave the section behind the bars.
    record.querySelector('.record-head')?.setAttribute('data-stuck', '');
    target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', link.hash);
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }));
  update();
};

// A path wider than the screen opens on its current stage.
const centerPath = (path) => {
  const step = path.querySelector('[aria-current="step"]');
  if (step && path.scrollWidth > path.clientWidth) path.scrollLeft = step.offsetLeft - (path.clientWidth - step.offsetWidth) / 2;
};

// The record comes in in the order it is read: the key facts, the path, the exceptions; each list one row after the
// other. A bar fills to its measure the first time it is seen, so the eye goes to how far each one is from its limit.
const reveal = (record) => {
  for (const list of record.querySelectorAll('.facts, .path, .exceptions, .checks')) [...list.children].forEach((item, i) => item.style.setProperty('--i', String(i)));
  const seen = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.setAttribute('data-drawn', '');
    seen.unobserve(entry.target);
  }), { threshold: 0.4 });
  record.querySelectorAll('.progress').forEach((bar) => seen.observe(bar));
  record.setAttribute('data-reveal', '');
};

// The request on the table, tried against other limits. The slider moves the limit and the figure, its change over
// the current limit, the ring of the use the balance would have (past the policy cap it takes the warning tone) and
// the rules that depend on the limit (`[data-rule="rise"]` against `data-rise-cap`, `[data-rule="use"]` against
// `data-cap`), which keep failures first. Away from the request, a button brings the slider back to it. Every paint
// leaves the limit in `data-limit` and fires `record:limit` with { limit, use, rise, review }; `record:repaint`
// paints again after `data-current` changed.
const STATE_WORD = { fail: 'No cumple', warn: 'A revisar' };
const RANK = { fail: 0, warn: 1 };
const whatIf = (panel) => {
  const slider = panel.querySelector('.slider');
  if (!slider) return;
  const balance = Number(panel.dataset.balance);
  const requested = Number(panel.dataset.requested ?? slider.getAttribute('aria-valuenow'));
  const cap = Number(panel.dataset.cap ?? 1);
  const riseCap = Number(panel.dataset.riseCap ?? Infinity);
  const lang = document.documentElement.lang || 'es-AR';
  const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  const percent = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 1 });
  const figure = panel.querySelector('.figure__value');
  const delta = panel.querySelector('.figure__delta');
  const ring = panel.querySelector('.ring');
  const ringValue = ring.querySelector('[data-sliding]');
  const rules = panel.querySelector('.record-ask__rules');
  const reset = panel.querySelector('.record-ask__reset');
  const bubble = slider.querySelector('.slider__bubble [data-sliding]');
  if (bubble) bubble.dataset.format = JSON.stringify({ style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  if (reset) reset.textContent = `Volver a ${money.format(requested)}`;
  const rule = (name, over, measure) => {
    const item = rules?.querySelector(`[data-rule="${name}"]`);
    if (!item) return;
    if (over) item.dataset.state = 'warn'; else item.removeAttribute('data-state');
    const label = item.querySelector('.checks__name');
    label.textContent = label.textContent.replace(/^[^·]+·/, `${STATE_WORD[item.dataset.state] ?? 'Cumple'} ·`);
    item.querySelector('.checks__measure').firstChild.textContent = `${measure} `;
  };
  const paint = (limit) => {
    const current = Number(panel.dataset.current);
    const use = balance / limit;
    const rise = limit / current - 1;
    setNumber(figure, limit);
    setNumber(ringValue, use);
    delta.textContent = rise > 0 ? `+ ${Math.round(rise * 100)} % sobre ${money.format(current)}` : `igual al límite de ${money.format(current)}`;
    delta.dataset.trend = rise > 0 ? 'up' : 'flat';
    ring.style.setProperty('--value', String(Math.round(use * 1000) / 10));
    ring.toggleAttribute('data-over', use > cap);
    ring.setAttribute('aria-label', `Con un límite de ${money.format(limit)} el uso queda en ${percent.format(use)}`);
    rule('rise', rise > riseCap, rise > 0 ? `+ ${Math.round(rise * 100)} %` : 'sin cambio');
    rule('use', use > cap, percent.format(use));
    if (rules) [...rules.children].sort((a, b) => (RANK[a.dataset.state] ?? 2) - (RANK[b.dataset.state] ?? 2)).forEach((item) => rules.append(item));
    const review = rules ? [...rules.querySelectorAll('[data-rule][data-state]')].map((item) => item.querySelector('.checks__name').textContent.split('· ')[1].toLowerCase()) : [];
    slider.setAttribute('aria-valuetext', review.length ? `${money.format(limit)}, a revisar: ${review.join(', ')}` : money.format(limit));
    if (reset) reset.hidden = limit === requested;
    panel.dataset.limit = String(limit);
    panel.dispatchEvent(new CustomEvent('record:limit', { detail: { limit, use, rise, review } }));
  };
  slider.addEventListener('change', (event) => paint(event.detail.value));
  panel.addEventListener('record:repaint', () => paint(slider.value));
  reset?.addEventListener('click', () => { slider.value = requested; slider.focus(); });
  paint(Number(slider.getAttribute('aria-valuenow')));
};

// Writes an event on top of the record's history; it comes in marked `data-new`, so the eye finds it.
export const logEvent = (record, { what, who, status, date = new Date() }) => {
  const list = record.querySelector('.history');
  if (!list) return null;
  const item = document.createElement('li');
  item.className = 'timeline__item';
  if (status) item.dataset.status = status;
  item.setAttribute('data-new', '');
  const lang = document.documentElement.lang || 'es-AR';
  item.innerHTML = `<span class="timeline__dot" aria-hidden="true"></span><time class="timeline__date" datetime="${date.toISOString().slice(0, 10)}">${new Intl.DateTimeFormat(lang, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)}</time><span class="history__what">${escapeHtml(what)} <span class="history__who">· ${escapeHtml(who)}</span></span>`;
  list.prepend(item);
  return item;
};

// A decision taken in a dialog: its submit checks the required fields first (a reason made only of spaces is
// empty), shows the error of the first that fails and focuses it; once they pass, `apply` gets the form's data,
// the dialog closes and its form is left blank for the next time.
export const decide = (dialog, apply) => {
  const form = dialog.querySelector('form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const wrong = [...form.querySelectorAll('[required]')].filter((input) => {
      if (!input.value.trim()) input.value = '';
      input.dispatchEvent(new Event('blur'));
      return !input.checkValidity();
    });
    if (wrong.length) { wrong[0].focus(); return; }
    apply(new FormData(form));
    dialog.close();
    form.reset();
    form.querySelectorAll('.field').forEach((field) => { delete field.dataset.state; field.querySelector('[aria-invalid]')?.removeAttribute('aria-invalid'); field.querySelector('textarea, input')?.dispatchEvent(new Event('input')); });
  });
};

// Mounts every behavior on a `.record`: the header, the path, the section nav and the heights they need.
export const mountRecord = (record = document.querySelector('.record')) => {
  if (!record) return;
  if (!reduced()) reveal(record);
  record.querySelectorAll('.record-ask').forEach(whatIf);
  record.querySelectorAll('.path').forEach(centerPath);
  const head = record.querySelector('.record-head');
  const nav = record.querySelector('.section-nav');
  if (head) { publishHeights(record, head, nav); stickyHead(record, head); }
  if (nav) scrollspy(record, nav);
};
