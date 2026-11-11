// Functions evaluated inside the page (page.evaluate / handle.evaluate). Each one is serialised,
// so it must not reference anything outside its own body: configuration comes in as an argument.

// Inputs hidden behind a styled label are audited through the label.
export const proxyOf = (n) => (n.matches('input') && getComputedStyle(n).opacity === '0' ? n.closest('label') ?? n : n);

// Can this element be reached? state: 'ok' | 'hover-only' (opacity 0 but laid out: maybe revealed
// by a hover on a container) | 'skip' with a reason.
export const reachability = (n) => {
  if (n.disabled || n.getAttribute('aria-disabled') === 'true') return { state: 'skip', reason: 'disabled' };
  const target = n.matches('input') && getComputedStyle(n).opacity === '0' ? n.closest('label') ?? n : n;
  let transparent = false;
  for (let e = target; e; e = e.parentElement) {
    const c = getComputedStyle(e);
    if (c.visibility === 'hidden') return { state: 'skip', reason: 'hidden' };
    if (c.display === 'none') return { state: 'skip', reason: 'hidden' };
    if (c.opacity === '0') transparent = true;
  }
  const r = target.getBoundingClientRect();
  if (r.width <= 1 || r.height <= 1) return { state: 'skip', reason: 'zero-size' };
  if (r.right <= 0) return { state: 'skip', reason: 'off-screen' };
  // Inside a closed drawer or collapsed panel: an ancestor that clips has no area left for the
  // element. A clipping ancestor that scrolls does not: the element is reached by scrolling it.
  const box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  for (let e = target.parentElement; e; e = e.parentElement) {
    if (e.inert) return { state: 'skip', reason: 'inert' };
    const c = getComputedStyle(e);
    if (c.overflowX === 'visible' && c.overflowY === 'visible') continue;
    const a = e.getBoundingClientRect();
    if (a.width <= 1 || a.height <= 1) return { state: 'skip', reason: 'clipped' };
    const scrollsX = /(auto|scroll)/.test(c.overflowX) && e.scrollWidth > e.clientWidth + 1;
    const scrollsY = /(auto|scroll)/.test(c.overflowY) && e.scrollHeight > e.clientHeight + 1;
    if (c.overflowX !== 'visible' && !scrollsX && (box.right <= a.left || box.left >= a.right)) return { state: 'skip', reason: 'clipped' };
    if (c.overflowY !== 'visible' && !scrollsY && e !== document.body && e !== document.documentElement && (box.bottom <= a.top || box.top >= a.bottom)) return { state: 'skip', reason: 'clipped' };
  }
  return { state: transparent ? 'hover-only' : 'ok' };
};

// A viewport point where `n` (not something on top of it) receives the pointer, or null.
export const hitPoint = (n, points) => {
  const r = n.getBoundingClientRect();
  for (const [fx, fy] of points) {
    const x = r.left + r.width * fx;
    const y = r.top + r.height * fy;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
    const hit = document.elementFromPoint(x, y);
    if (hit && (hit === n || n.contains(hit) || hit.closest('label') === n || (n.matches('label') && n.contains(hit)))) return { x, y };
  }
  return null;
};

// A label without DOM indices: tag, id, text and the landmark it lives in.
export const describeElement = (n) => {
  const text = (n.getAttribute('aria-label') || n.textContent || n.getAttribute('placeholder') || n.getAttribute('name') || n.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 28);
  let where = '';
  for (let e = n.parentElement; e && e !== document.body; e = e.parentElement) {
    if (e.id) { where = `#${e.id}`; break; }
    const role = e.getAttribute('role');
    if (/^(NAV|HEADER|FOOTER|MAIN|ASIDE|DIALOG|FORM)$/.test(e.tagName) || /^(dialog|navigation|menu|toolbar|tablist|banner|alertdialog)$/.test(role ?? '')) { where = role ?? e.tagName.toLowerCase(); break; }
  }
  return `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${text ? ` "${text}"` : ''}${where ? ` in ${where}` : ''}`;
};

export const elementInfo = (n) => {
  const cs = getComputedStyle(n);
  const role = n.getAttribute('role');
  let kind = role ?? n.tagName.toLowerCase();
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName) && cs.opacity !== '0') kind = 'input';
  else if ((!role && !/^(A|BUTTON|SUMMARY|LABEL)$/.test(n.tagName)) || /^(region|group|table|figure|img|document|tabpanel|list|article)$/.test(role ?? '')) kind = 'focus-only';
  return {
    kind,
    selected: n.getAttribute('aria-selected') === 'true' || n.getAttribute('aria-checked') === 'true' || n.getAttribute('aria-current') === 'page',
  };
};

export const readTransition = (n) => {
  const cs = getComputedStyle(n);
  return { properties: cs.transitionProperty.split(',').map((s) => s.trim()), durations: cs.transitionDuration, easings: cs.transitionTimingFunction.split(/,(?![^(]*\))/).map((s) => s.trim()) };
};

export const cssPath = (n) => {
  const parts = [];
  for (let e = n; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) {
    if (e.id) { parts.unshift(`#${CSS.escape(e.id)}`); break; }
    const same = [...(e.parentElement?.children ?? [])].filter((c) => c.tagName === e.tagName);
    parts.unshift(`${e.tagName.toLowerCase()}${same.length > 1 ? `:nth-of-type(${same.indexOf(e) + 1})` : ''}`);
  }
  return parts.join(' > ');
};

// Resolves when `n` (with its subtree and the element its aria-controls names) is still: no running
// finite CSS or WAAPI animation and an unchanged signature of position, size, opacity, transform and
// colours for `quietMs`, but not before `minMs` and not later than `capMs`. Infinite animations
// (spinners, tickers) are ambient: they neither count as running nor enter the signature.
export const waitSettled = (n, { minMs, quietMs, capMs }) => new Promise((resolve) => {
  const controlled = document.getElementById(n.getAttribute?.('aria-controls') || '');
  const roots = [n, controlled].filter(Boolean);
  const isInfinite = (a) => a.effect?.getComputedTiming().iterations === Infinity;
  const finiteRunning = () => roots.some((r) => r.getAnimations({ subtree: true }).some((a) => a.playState === 'running' && !isInfinite(a) && Number.isFinite(a.effect?.getComputedTiming().endTime)));
  const signature = () => {
    const ambient = roots.flatMap((r) => r.getAnimations({ subtree: true })).filter(isInfinite).map((a) => a.effect.target);
    const nodes = roots.flatMap((r) => [r, ...r.querySelectorAll('*')].slice(0, 40)).filter((e) => !ambient.some((a) => a === e || a?.contains(e)));
    const parts = nodes.map((e) => {
      const r = e.getBoundingClientRect();
      const c = getComputedStyle(e);
      return [r.left, r.top, r.width, r.height].map((v) => v.toFixed(1)).join(',') + `,${c.opacity},${c.transform},${c.backgroundColor},${c.color},${c.boxShadow}`;
    });
    return `${document.documentElement.scrollHeight},${document.documentElement.scrollWidth}|${parts.join('|')}`;
  };
  const start = performance.now();
  let last = signature();
  let changed = start;
  const tick = () => {
    const now = performance.now();
    const sig = signature();
    if (sig !== last) { last = sig; changed = now; }
    if (finiteRunning()) changed = now;
    if (now - start >= capMs || (now - start >= minMs && now - changed >= quietMs)) resolve();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// Why --interact must not press or toggle this element, or null.
export const denyReason = (n, { selector, text, flags, named }) => {
  if (n.matches(selector)) return 'submit, reset, drag or slider control';
  // A link that does not point at an element of this page (`#` or `#id` of an element that exists) navigates, or is
  // a hash route (`#/orders/12/delete`) a router follows, before anything can notice; so does a control inside one.
  const link = n.closest('a[href], area[href]');
  if (link) {
    const target = link.getAttribute('href') ?? '';
    let id = null;
    try { id = decodeURIComponent(target.slice(1)); } catch { id = null; }
    const inPage = target === '#' || (target.startsWith('#') && id && document.getElementById(id));
    if (!inPage) return `link that leaves the page or routes (${target.slice(0, 40)})`;
  }
  // A submit button of a form, wherever it sits (inside it or tied to it with form=): a default <button> submits.
  if (n.form && ['submit', 'image', 'reset'].includes(n.type)) return 'submits or resets a form';
  const byIds = (n.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? '');
  const inner = [...n.querySelectorAll('img[alt], [aria-label], svg title')].map((x) => x.getAttribute('alt') ?? x.getAttribute('aria-label') ?? x.textContent);
  const names = [...byIds, n.getAttribute('aria-label'), n.textContent, n.getAttribute('title'), n.getAttribute('value'), n.getAttribute('alt'), ...inner].map((x) => (x ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const wording = names.find((x) => new RegExp(text, flags).test(x));
  if (wording) return `destructive or irreversible wording ("${wording.slice(0, 30)}")`;
  if (!names.length && n.matches(named)) return 'no accessible name: it may be a destructive icon button';
  return null;
};

// :hover rules that move things outside @media (hover: hover): on touch screens they stick after a tap.
export const ungatedHoverMotion = () => {
  const found = [];
  let unreadable = 0;
  const walk = (rules, gated) => {
    for (const r of rules) {
      if (r.media && r.cssRules) walk(r.cssRules, gated || /hover:\s*hover/.test(r.media.mediaText));
      else if (r.cssRules && !r.selectorText) walk(r.cssRules, gated);
      if (r.selectorText && /:hover/.test(r.selectorText) && !gated) {
        const s = r.style;
        if ((s.transform && s.transform !== 'none') || s.translate || s.scale || s.rotate) found.push(r.selectorText);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { if (e.name !== 'SecurityError') throw e; unreadable++; continue; }
    walk(rules, false);
  }
  return { found: [...new Set(found)].slice(0, 10), unreadable };
};

export const hasReducedMotionRule = () => {
  const walk = (rules) => [...rules].some((r) => (r.media && /prefers-reduced-motion/.test(r.media.mediaText)) || (r.cssRules && walk(r.cssRules)));
  let unreadable = 0;
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { if (e.name !== 'SecurityError') throw e; unreadable++; continue; }
    if (walk(rules)) return { found: true, unreadable };
  }
  return { found: false, unreadable };
};

// Sections below the fold (relative to their own scroller): did anything animate in when first
// scrolled to? Scrolls the window and every inner scroll container end to end, and returns the long
// animation frames of the scrolling with their scripts.
export const scrollPass = async ({ step, stepMs, tail, maxScrollers }) => {
  const isScroller = (e) => {
    const c = getComputedStyle(e);
    return /(auto|scroll)/.test(c.overflowY) && e.scrollHeight > e.clientHeight + 4 && e.clientHeight > 40;
  };
  const inner = [...document.querySelectorAll('*')].filter((e) => e !== document.body && e !== document.documentElement && isScroller(e)).slice(0, maxScrollers);
  const scrollerOf = (n) => { for (let e = n.parentElement; e; e = e.parentElement) if (inner.includes(e)) return e; return null; };
  const belowFold = (c) => {
    const s = scrollerOf(c);
    if (!s) return c.getBoundingClientRect().top + scrollY > innerHeight;
    return c.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop > s.clientHeight;
  };
  const sections = [...new Set([...document.querySelectorAll('h2, h3')].map((h) => h.closest('section, article, li, div') ?? h).filter(belowFold))]
    .filter((c, _, all) => !all.some((o) => o !== c && o.contains(c)));
  const moved = new Set();
  const owner = (t) => sections.find((s) => s === t || s.contains(t));
  const mark = (e) => { const s = owner(e.target); if (s) moved.add(s); };
  document.addEventListener('animationstart', mark, true);
  document.addEventListener('transitionstart', mark, true);
  const mo = new MutationObserver((l) => {
    for (const m of l) {
      const t = m.target;
      if (m.attributeName === 'style' && (t.style.opacity !== '' || t.style.transform !== '' || t.style.translate !== '')) { const s = owner(t); if (s) moved.add(s); }
    }
  });
  mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] });
  const from = performance.now();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const settleAnimations = () => { for (const a of document.getAnimations()) { const s = a.effect?.target && owner(a.effect.target); if (s) moved.add(s); } };
  for (let y = 0; y < document.documentElement.scrollHeight; y += step) { window.scrollTo(0, y); await wait(stepMs); settleAnimations(); }
  for (const s of inner) {
    for (let y = 0; y < s.scrollHeight; y += step) { s.scrollTop = y; await wait(stepMs); settleAnimations(); }
    s.scrollTop = 0;
  }
  await wait(tail);
  mo.disconnect();
  document.removeEventListener('animationstart', mark, true);
  document.removeEventListener('transitionstart', mark, true);
  const keyframeLayout = [...new Set(document.getAnimations().flatMap((a) => (a.effect?.getKeyframes?.() ?? []).flatMap((k) => Object.keys(k)))
    .filter((p) => /^(width|height|top|left|right|bottom|margin|padding|maxHeight|fontSize)/.test(p)))];
  window.scrollTo(0, 0);
  const loaf = (window.__mt?.loaf ?? []).filter(([s]) => s >= from);
  return { sections: sections.slice(0, 30).map((s) => ({ section: (s.querySelector('h2, h3')?.textContent ?? s.tagName).trim().slice(0, 40), animated: moved.has(s) })), loaf, keyframeLayout, scrollers: inner.length };
};

// Text and images laid out but at opacity 0 (after the page was scrolled end to end).
export const invisibleContent = () => [...document.querySelectorAll('h1, h2, h3, p, li, img')].filter((n) => {
  const r = n.getBoundingClientRect();
  if (r.width < 2 || r.height < 2 || n.closest('[aria-hidden="true"]')) return false;
  let shown = true;
  for (let e = n; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden') return false; if (c.opacity === '0') shown = false; }
  return !shown;
}).map((n) => `${n.tagName.toLowerCase()} "${(n.textContent || n.getAttribute('alt') || '').trim().slice(0, 30)}"`);

// Infinite moving animations that keep running, except small rotate-only ones (spinners).
export const infiniteAnimations = ({ spinnerPx }) => document.getAnimations().filter((a) => {
  const t = a.effect?.target;
  if (a.effect?.getTiming?.().iterations !== Infinity || !t || a.playState !== 'running') return false;
  for (let e = t; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.opacity === '0' || c.display === 'none' || c.visibility === 'hidden') return false; }
  const frames = a.effect.getKeyframes?.() ?? [];
  if (!frames.some((f) => f.transform || f.translate || f.scale || f.rotate || f.left || f.top)) return false;
  const rotateOnly = frames.every((f) => !f.translate && !f.scale && !f.left && !f.top && (!f.transform || f.transform === 'none' || /^(rotate|rotateZ)\([^)]*\)(\s+(rotate|rotateZ)\([^)]*\))*$/.test(f.transform)));
  const r = t.getBoundingClientRect();
  return !(rotateOnly && r.width <= spinnerPx && r.height <= spinnerPx);
}).map((a) => { const t = a.effect.target; return `${t.tagName.toLowerCase()}${t.id ? `#${t.id}` : ''}${t.classList[0] ? `.${t.classList[0]}` : ''}`; });

// Signs of a development server (HMR, dev-mode React): long frames there are not the product's.
export const devSignals = () => {
  const signals = [];
  if (document.querySelector('script[src*="/@vite/client"]') || window.__vite_plugin_react_preamble_installed__) signals.push('Vite dev server');
  if (window.__NEXT_DATA__?.buildId === 'development' || document.querySelector('script[src*="_next/static/development"], nextjs-portal')) signals.push('Next.js dev server');
  if ([...document.scripts].some((s) => /webpack-dev-server|hot-update|sockjs-node|__webpack_hmr|webpack-hmr/.test(s.src))) signals.push('webpack HMR');
  const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (hook?.renderers && [...hook.renderers.values()].some((r) => r.bundleType === 1)) signals.push('React development build');
  return signals;
};
