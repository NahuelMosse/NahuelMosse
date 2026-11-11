// motion-curves.mjs — what a motion does over time, read from frame samples.
// `tracer` runs in the page (installed by motion-audit as an init script) and samples, on every
// animation frame, the rect, opacity and transform of the elements it follows. Everything else here is
// pure: it turns those series into duration, overshoot, curve shape and jumps, finds the stagger of a
// group, checks that an interrupted animation stays continuous, reads a scroll story, and compares the
// motion of a reference against the one of an implementation by role.

export const EPS = { left: 1, top: 1, width: 1, height: 1, translateX: 1, translateY: 1, scaleX: 0.01, scaleY: 0.01, rotate: 1, opacity: 0.02 };
const COLS = ['left', 'top', 'width', 'height', 'opacity', 'tx', 'ty', 'sx', 'sy', 'rot'];
const PROP_OF = { left: 'left', top: 'top', width: 'width', height: 'height', opacity: 'opacity', tx: 'translateX', ty: 'translateY', sx: 'scaleX', sy: 'scaleY', rot: 'rotate' };
// The property that stands for an element: what the eye follows first; layout last.
const PREFERENCE = ['opacity', 'translateY', 'translateX', 'scaleX', 'scaleY', 'rotate', 'top', 'left', 'width', 'height'];
const FRAME = 1000 / 60;

const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return 0;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const SHAPES = [
  ['linear', (u) => u],
  ['ease-out', (u) => 1 - (1 - u) ** 2],
  ['ease-out', (u) => 1 - (1 - u) ** 3],
  ['ease-out', (u) => 1 - (1 - u) ** 5],
  ['ease-in', (u) => u ** 2],
  ['ease-in', (u) => u ** 3],
  ['ease-in-out', (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2)],
  ['ease-in-out', (u) => (u < 0.5 ? 4 * u ** 3 : 1 - 4 * (1 - u) ** 3)],
];

// One property over time. `t` in ms, `v` the values, `eps` the smallest change that counts as movement.
// Starts when the value leaves its first sample by more than 0.5 % of the amplitude and settles where it
// stays within 0.5 % of its last sample. A jump is a frame whose velocity is over 3 times the median
// one, over twice both neighbours and at least a tenth of the amplitude.
export const analyzeSeries = (t, v, eps) => {
  const n = v.length;
  if (n < 4) return null;
  const first = v[0];
  const final = v[n - 1];
  const range = Math.max(...v) - Math.min(...v);
  if (range < eps) return null;
  const net = final - first;
  const returns = Math.abs(net) < eps;
  const amp = returns ? range : Math.abs(net);
  const dir = returns ? 1 : Math.sign(net);
  const tol = amp * 0.005;
  const start = v.findIndex((x) => Math.abs(x - first) > tol);
  if (start < 1) return null;
  const tail = v.slice(-4);
  const settled = tail.every((x, i) => i === 0 || Math.abs(x - tail[i - 1]) <= tol);
  let settle = n - 1;
  if (settled) while (settle > start && Math.abs(v[settle - 1] - final) <= tol) settle--;
  const t0 = t[start - 1];
  const durationMs = t[settle] - t0;
  let over = 0;
  // A series that never settles (a loop) has no final value to overshoot.
  if (!returns && settled) for (let j = start; j < n; j++) over = Math.max(over, (v[j] - final) * dir);
  const overshootPct = round((over / amp) * 100);
  let shape;
  if (returns) shape = 'round-trip';
  else if (settle - start < 2) shape = 'step';
  else if (overshootPct > 3) shape = 'spring';
  else {
    const base = v[start - 1];
    const best = new Map();
    for (const [name, f] of SHAPES) {
      let err = 0;
      for (let j = start - 1; j <= settle; j++) {
        const u = (t[j] - t0) / (t[settle] - t0);
        const p = (v[j] - base) / (final - base);
        err += (p - f(u)) ** 2;
      }
      best.set(name, Math.min(best.get(name) ?? Infinity, err));
    }
    shape = [...best.entries()].sort((a, b) => a[1] - b[1])[0][0];
  }
  const vel = [];
  for (let k = start; k <= settle; k++) vel.push((Math.abs(v[k] - v[k - 1]) * FRAME) / Math.max(1, t[k] - t[k - 1]));
  const med = median(vel.filter((d) => d > tol / 4));
  const jumps = [];
  if (settle - start >= 4) {
    // A large first step followed by steps that only shrink is the start of an ease-out, not a jump.
    const easesOut = vel.every((d, k) => k === 0 || d <= vel[k - 1] * 1.05);
    vel.forEach((d, k) => {
      if (k === 0 && easesOut) return;
      if (d > 3 * med && d > 2 * Math.max(vel[k - 1] ?? 0, vel[k + 1] ?? 0) && d >= 0.1 * amp) jumps.push({ atMs: round(t[start + k] - t0, 0), size: round(d, 2) });
    });
  }
  return { from: round(v[start - 1], 2), to: round(final, 2), startT: t0, durationMs: round(durationMs, 0), overshootPct, shape, settled, jumps };
};

// One followed element: every property that moves, and which one stands for it.
export const analyzeElement = (el, origin = 0) => {
  const moves = [];
  for (const c of COLS) {
    const r = analyzeSeries(el.t, el[c], EPS[PROP_OF[c]]);
    if (!r) continue;
    const { startT, ...rest } = r;
    moves.push({ prop: PROP_OF[c], ...rest, startMs: round(startT - origin, 0) });
  }
  if (!moves.length) return null;
  const primary = PREFERENCE.map((p) => moves.find((m) => m.prop === p)).find(Boolean).prop;
  return {
    id: el.id, label: el.label, parent: el.parent, tag: el.tag, h1: el.h1, inFirst: el.inFirst, fixed: el.fixed, root: el.root, primary, moves,
    startMs: Math.min(...moves.map((m) => m.startMs)),
    endMs: Math.max(...moves.map((m) => m.startMs + m.durationMs)),
  };
};

// Everything that moves in a recording. `ambientBefore` drops what was already moving before `origin`.
export const analyzeRecording = (rec, { origin = rec.t0, ambientBefore = null } = {}) =>
  rec.elems.map((e) => analyzeElement(e, origin)).filter(Boolean)
    .filter((e) => ambientBefore === null || e.startMs >= ambientBefore)
    .sort((a, b) => a.startMs - b.startMs);

export const primaryMove = (e) => e.moves.find((m) => m.prop === e.primary);

// The largest group of siblings that move: how far apart they start, on average.
export const stagger = (els) => {
  const groups = new Map();
  for (const e of els) {
    if (e.parent == null || !e.moves) continue;
    if (!groups.has(e.parent)) groups.set(e.parent, []);
    groups.get(e.parent).push(e);
  }
  let best = null;
  for (const g of groups.values()) {
    if (g.length < 3) continue;
    const starts = g.map((e) => e.startMs).sort((a, b) => a - b);
    const spread = starts.at(-1) - starts[0];
    const distinct = new Set(starts.map((s) => Math.round(s / FRAME))).size;
    const stepMs = distinct >= 3 && spread >= 24 ? round(spread / (g.length - 1), 0) : 0;
    const score = (stepMs > 0 ? 1000 : 0) + g.length;
    if (best && best.score >= score) continue;
    const lead = [...g].sort((a, b) => a.startMs - b.startMs)[0];
    const lm = primaryMove(lead);
    best = {
      score, count: g.length, stepMs, startMs: starts[0], label: lead.label,
      durationMs: round(median(g.map((e) => primaryMove(e).durationMs)), 0), shape: lm.shape,
      overshootPct: Math.max(...g.map((e) => primaryMove(e).overshootPct)), prop: lead.primary,
    };
  }
  if (!best) return null;
  const { score, ...rest } = best;
  return rest;
};

// An animation interrupted by a second click: for each followed property that moves, the first frames
// after the click must continue from where the previous frame was.
export const continuity = (rec, markT) => {
  const jumps = [];
  for (const el of rec.elems) {
    for (const c of COLS) {
      const eps = EPS[PROP_OF[c]];
      const t = el.t;
      const v = el[c];
      const i = t.findIndex((x) => x >= markT);
      if (i < 4 || i >= v.length - 1) continue;
      if (Math.max(...v) - Math.min(...v) < eps) continue;
      const vel = (k) => (Math.abs(v[k] - v[k - 1]) * FRAME) / Math.max(1, t[k] - t[k - 1]);
      // The frame stamp can precede the click's event stamp by up to a frame, so the response may land in i - 1.
      const before = [];
      for (let k = i - 2; k >= i - 3; k--) before.push(vel(k));
      const step = median(before.filter((d) => d > eps / 10));
      const after = Math.max(vel(i - 1), vel(i), vel(i + 1));
      if (after > Math.max(3 * step, 2 * eps)) jumps.push({ label: el.label, prop: PROP_OF[c], size: round(after, 2) });
    }
  }
  return jumps;
};

// Steps of a scroll from end to end: [{ y, rows: [[id, top, left, w, h, opacity, tx, ty, sx, sy, rot]] }]
// with the rects in the viewport. Each element is classed by how its viewport position follows the scroll:
// 1 is a normal element, 0 is pinned, anything else is parallax; opacity or scale or rotation that
// keeps changing over consecutive steps is scroll-linked.
export const scrollStory = (steps, metas, total) => {
  const per = new Map();
  for (let s = 1; s < steps.length; s++) {
    const dy = steps[s].y - steps[s - 1].y;
    if (dy < 50) continue;
    const prev = new Map(steps[s - 1].rows.map((r) => [r[0], r]));
    for (const r of steps[s].rows) {
      const p = prev.get(r[0]);
      if (!p) continue;
      const dTop = r[1] - p[1];
      if (!per.has(r[0])) per.set(r[0], []);
      per.get(r[0]).push({
        y: steps[s].y, dy,
        ratio: -dTop / dy,
        pinned: Math.abs(dTop) <= Math.max(3, 0.03 * dy),
        linked: Math.abs(r[5] - p[5]) > 0.02 || Math.abs(r[8] - p[8]) > 0.005 || Math.abs(r[10] - p[10]) > 0.5,
      });
    }
  }
  const longestRun = (list, key) => {
    let best = 0;
    let cur = 0;
    for (const x of list) { cur = x[key] ? cur + 1 : 0; best = Math.max(best, cur); }
    return best;
  };
  const found = [];
  for (const [id, list] of per) {
    const m = metas.get(id) ?? {};
    const pinnedSteps = list.filter((x) => x.pinned);
    const free = list.filter((x) => !x.pinned);
    if (longestRun(list, 'pinned') >= 3) {
      found.push({ id, parent: m.parent, label: m.label, kind: pinnedSteps.length >= 0.8 * list.length ? 'fixed' : 'pin', fromY: pinnedSteps[0].y, toY: pinnedSteps.at(-1).y, steps: pinnedSteps.length });
      continue;
    }
    const off = free.filter((x) => x.ratio < 0.9 || x.ratio > 1.1);
    if (off.length >= 3 && off.length >= 0.6 * free.length) {
      found.push({ id, parent: m.parent, label: m.label, kind: 'parallax', speed: round(median(off.map((x) => x.ratio)), 2), fromY: off[0].y, toY: off.at(-1).y, steps: off.length });
      continue;
    }
    if (longestRun(list, 'linked') >= 3) {
      const ys = list.filter((x) => x.linked);
      found.push({ id, parent: m.parent, label: m.label, kind: 'linked', fromY: ys[0].y, toY: ys.at(-1).y, steps: ys.length });
    }
  }
  // A child that only follows its parent is not another finding.
  const kinds = new Map(found.map((f) => [f.id, f]));
  const own = found.filter((f) => {
    const up = kinds.get(f.parent);
    return !(up && up.kind === f.kind && Math.abs((up.speed ?? 0) - (f.speed ?? 0)) < 0.05);
  });
  const count = (k) => own.filter((f) => f.kind === k).length;
  const segments = [];
  for (const s of steps.slice(1)) {
    const active = own.filter((f) => s.y >= f.fromY && s.y <= f.toY && f.kind !== 'fixed');
    const row = { fromY: s.y - 100, toY: s.y, parallax: active.filter((f) => f.kind === 'parallax').length, pinned: active.filter((f) => f.kind === 'pin').length, linked: active.filter((f) => f.kind === 'linked').length };
    if (!row.parallax && !row.pinned && !row.linked) continue;
    const last = segments.at(-1);
    if (last && last.toY === row.fromY && last.parallax === row.parallax && last.pinned === row.pinned && last.linked === row.linked) last.toY = row.toY;
    else segments.push(row);
  }
  const summary = { steps: steps.length, scrollHeight: total, parallax: count('parallax'), pinned: count('pin'), fixed: count('fixed'), linked: count('linked') };
  summary.narrative = summary.pinned >= 1 || summary.parallax >= 2 || summary.linked >= 3;
  return { summary, segments: segments.slice(0, 200), elements: own.slice(0, 40).map(({ id, parent, ...f }) => f) };
};

// What a role looks like, from the elements measured. Each is null when the page does not show it.
const entry = (e) => {
  if (!e) return null;
  const m = primaryMove(e);
  return { label: e.label, prop: e.primary, startMs: e.startMs, durationMs: m.durationMs, shape: m.shape, overshootPct: m.overshootPct, jumps: m.jumps.length };
};
const groupEntry = (st) => st && { label: st.label, prop: st.prop, startMs: st.startMs, durationMs: st.durationMs, shape: st.shape, overshootPct: st.overshootPct, stepMs: st.stepMs, count: st.count };

export const buildRoles = ({ load = [], scroll = [], click = null, hover = null, story = null }) => {
  const h1 = load.filter((e) => e.h1?.is || e.h1?.inside || e.h1?.contains);
  const lead = h1.find((e) => e.h1.is) ?? h1.find((e) => e.h1.inside) ?? h1[0] ?? load.filter((e) => e.inFirst && !e.fixed)[0];
  const hero = lead && { ...entry(lead), stepMs: stagger(h1)?.stepMs ?? 0, totalMs: h1.length ? Math.max(...h1.map((e) => e.endMs)) - Math.min(...h1.map((e) => e.startMs)) : lead.endMs - lead.startMs, viaH1: h1.length > 0 };
  const groups = [stagger(load), stagger(scroll)].filter(Boolean).sort((a, b) => (b.stepMs > 0) - (a.stepMs > 0) || b.count - a.count);
  const area = (e) => e.moves.find((m) => m.prop === 'width')?.to * e.moves.find((m) => m.prop === 'height')?.to || 0;
  const sec = scroll.filter((e) => !e.fixed).sort((a, b) => area(b) - area(a))[0];
  let clickRole = null;
  if (click?.length) {
    const st = stagger(click);
    const first = click[0];
    clickRole = { ...entry(first), stepMs: st?.stepMs ?? 0, count: click.length, totalMs: Math.max(...click.map((e) => e.endMs)) - first.startMs };
  }
  const moment = (name) => {
    const els = hover?.moments?.[name]?.motion ?? [];
    const e = els.find((x) => x.root && x.moves?.length) ?? els.find((x) => x.moves?.length);
    return e ? entry(e) : null;
  };
  return {
    cta: hover ? { label: hover.label, hover: moment('hover'), press: moment('press'), focus: moment('focus') } : null,
    hero,
    cards: groupEntry(groups[0] ?? null),
    section: entry(sec),
    click: clickRole,
    scroll: story?.summary ?? null,
  };
};

// The motion language of the page in a few numbers, for the designer's `## Direction`.
export const grammar = (all, roles, cursor) => {
  const durs = all.map((e) => primaryMove(e).durationMs).filter((d) => d > 0).sort((a, b) => a - b);
  const shapes = {};
  for (const e of all) { const s = primaryMove(e).shape; shapes[s] = (shapes[s] ?? 0) + 1; }
  return {
    durationsMs: durs.length ? { min: durs[0], median: median(durs), max: durs.at(-1) } : null,
    shapes,
    staggerMs: Math.max(roles.hero?.stepMs ?? 0, roles.cards?.stepMs ?? 0, roles.click?.stepMs ?? 0),
    cursor,
  };
};

const describeRole = (key, r) => {
  if (!r) return 'none';
  if (key === 'scroll') return r.narrative ? `${r.parallax} parallax, ${r.pinned} pin, ${r.linked} scroll-linked` : 'no scroll story';
  const base = `${key === 'click' ? r.totalMs : r.durationMs} ms ${r.shape}${r.overshootPct > 3 ? ` (+${r.overshootPct} % overshoot)` : ''}`;
  if (r.stepMs === undefined) return base;
  return `${base}, ${r.stepMs > 0 ? `stagger ${r.stepMs} ms` : 'no stagger'}`;
};

const differences = (key, a, b) => {
  if (!a && !b) return null;
  if (!a) return ['missing in the reference'];
  if (!b) return ['missing in mine'];
  if (key === 'scroll') {
    const d = [];
    for (const k of ['parallax', 'pinned', 'linked']) if (a[k] !== b[k]) d.push(`${k} ${a[k]}→${b[k]}`);
    return d;
  }
  const da = key === 'click' ? a.totalMs : a.durationMs;
  const db = key === 'click' ? b.totalMs : b.durationMs;
  const d = [];
  if (Math.abs(db - da) >= 50 || Math.max(da, db) / Math.max(1, Math.min(da, db)) > 1.25) d.push(`duration ${db - da > 0 ? '+' : ''}${db - da} ms`);
  if (a.shape !== b.shape) d.push(`curve ${a.shape}→${b.shape}`);
  if (Math.abs(a.overshootPct - b.overshootPct) >= 5) d.push(`overshoot ${a.overshootPct}→${b.overshootPct} %`);
  if (a.stepMs !== undefined && (a.stepMs > 0 !== b.stepMs > 0 || Math.abs(a.stepMs - b.stepMs) >= 20)) d.push(`stagger ${a.stepMs}→${b.stepMs} ms`);
  return d;
};

const TITLES = [['cta.hover', 'primary button hover'], ['cta.press', 'primary button press'], ['hero', 'hero entrance'], ['cards', 'list entrance'], ['section', 'section entrance'], ['click', 'click opens'], ['scroll', 'scroll']];
const pick = (roles, path) => path.split('.').reduce((o, k) => o?.[k] ?? null, roles ?? {});

// One line per equivalent interaction: both sides and what differs. Roles, not selectors, pair them.
export const compare = (ref, mine) => {
  const lines = [];
  let differ = 0;
  for (const [path, title] of TITLES) {
    const a = pick(ref.roles, path);
    const b = pick(mine.roles, path);
    const diff = differences(path.split('.').pop() === 'hover' || path.split('.').pop() === 'press' ? 'cta' : path, a, b);
    if (!diff) continue;
    const key = path.split('.')[0] === 'cta' ? 'cta' : path;
    if (diff.length) differ++;
    lines.push(`${title} · ref ${describeRole(key, a)} · mine ${describeRole(key, b)} · ${diff.length ? `diff: ${diff.join(', ')}` : 'matches'}`);
  }
  return { lines, differ, total: lines.length };
};

// Runs in the page. Installed with addInitScript, so it also records the load. It follows either the
// elements around the viewport (`root` null) or one element and its descendants, one sample per frame.
export const tracer = () => {
  if (window.__mt || window !== window.top) return;
  const COLS = ['left', 'top', 'width', 'height', 'opacity', 'tx', 'ty', 'sx', 'sy', 'rot'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'HEAD', 'TITLE', 'BR', 'TEMPLATE']);
  const ids = new WeakMap();
  const meta = new Map();
  const sent = new Set();
  let next = 1;
  const idOf = (n) => { let i = ids.get(n); if (!i) { i = next++; ids.set(n, i); } return i; };
  const known = (n) => {
    const id = idOf(n);
    if (!meta.has(id)) {
      let fixed = false;
      for (let e = n; e && e !== document.documentElement; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') { fixed = true; break; }
      const cls = [...n.classList].slice(0, 2).map((c) => `.${c}`).join('');
      const own = [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join(' ').trim().replace(/\s+/g, ' ').slice(0, 24);
      meta.set(id, {
        label: `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${cls}${own ? ` “${own}”` : ''}`,
        parent: n.parentElement ? idOf(n.parentElement) : 0,
        tag: n.tagName.toLowerCase(),
        h1: { is: n.tagName === 'H1', inside: !!n.parentElement?.closest('h1'), contains: !!n.querySelector('h1') },
        inFirst: n.getBoundingClientRect().top + scrollY < innerHeight,
        fixed,
      });
    }
    return id;
  };
  const pose = (n, viewport) => {
    const r = n.getBoundingClientRect();
    const cs = getComputedStyle(n);
    let tx = 0, ty = 0, sx = 1, sy = 1, rot = 0;
    if (cs.transform !== 'none') {
      try {
        const m = new DOMMatrixReadOnly(cs.transform);
        tx = m.m41; ty = m.m42; sx = Math.hypot(m.a, m.b); sy = Math.hypot(m.c, m.d); rot = (Math.atan2(m.b, m.a) * 180) / Math.PI;
      } catch {}
    }
    if (cs.translate && cs.translate !== 'none') { const p = cs.translate.split(' ').map(parseFloat); tx += p[0] || 0; ty += p[1] || 0; }
    if (cs.scale && cs.scale !== 'none') { const p = cs.scale.split(' ').map(parseFloat); sx *= p[0]; sy *= p[1] ?? p[0]; }
    if (cs.rotate && cs.rotate !== 'none') rot += parseFloat(cs.rotate) || 0;
    const ox = viewport ? 0 : scrollX;
    const oy = viewport ? 0 : scrollY;
    return [r.left + ox, r.top + oy, r.width, r.height, parseFloat(cs.opacity), tx, ty, sx, sy, rot];
  };
  const pick = (root) => {
    if (root) return [root, ...root.querySelectorAll('*')].filter((n) => !SKIP.has(n.tagName)).slice(0, 60);
    const out = [];
    if (!document.body) return out;
    for (const n of document.body.querySelectorAll('*')) {
      if (out.length >= 500) break;
      if (SKIP.has(n.tagName) || n.ownerSVGElement) continue;
      const r = n.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < -innerHeight || r.top > 2 * innerHeight) continue;
      out.push(n);
    }
    return out;
  };
  const recs = new Map();
  let running = false;
  const frame = (ts) => {
    for (const rec of recs.values()) {
      if (!rec.active) continue;
      if (rec.frame % rec.every === 0) rec.list = pick(rec.root);
      for (const n of rec.list) {
        const id = known(n);
        let e = rec.elems.get(id);
        if (!e) { e = { id, t: [] }; for (const c of COLS) e[c] = []; rec.elems.set(id, e); }
        const p = pose(n, meta.get(id).fixed);
        e.t.push(ts);
        COLS.forEach((c, i) => e[c].push(p[i]));
      }
      rec.frame++;
      if (rec.stopAt && ts >= rec.stopAt) rec.active = false;
    }
    if ([...recs.values()].some((r) => r.active)) requestAnimationFrame(frame); else running = false;
  };
  document.addEventListener('click', (e) => { for (const r of recs.values()) if (r.active) r.marks.push(e.timeStamp); }, true);
  window.__mt = {
    begin(name, o = {}) {
      recs.set(name, { active: true, root: o.root ?? null, rootId: o.root ? idOf(o.root) : 0, every: o.every ?? 5, frame: 0, list: [], elems: new Map(), marks: [], t0: performance.now(), stopAt: o.at ?? (o.ms ? performance.now() + o.ms : 0) });
      if (o.root) known(o.root);
      if (!running) { running = true; requestAnimationFrame(frame); }
    },
    active: (name) => !!recs.get(name)?.active,
    end(name) {
      const rec = recs.get(name);
      if (!rec) return null;
      rec.active = false;
      recs.delete(name);
      const r = (x) => Math.round(x * 100) / 100;
      return {
        t0: rec.t0, marks: rec.marks,
        elems: [...rec.elems.values()].map((e) => {
          const m = meta.get(e.id);
          const out = { ...m, id: e.id, root: e.id === rec.rootId, t: e.t.map(r) };
          for (const c of COLS) out[c] = e[c].map(r);
          return out;
        }),
      };
    },
    snapshot() {
      const rows = [];
      const fresh = [];
      for (const n of pick(null)) {
        const id = known(n);
        if (!sent.has(id)) { sent.add(id); fresh.push([id, meta.get(id)]); }
        rows.push([id, ...pose(n, true)]);
      }
      return { y: scrollY, rows, fresh };
    },
  };
  window.__mt.begin('load', { every: 2, at: 4000 });
};
