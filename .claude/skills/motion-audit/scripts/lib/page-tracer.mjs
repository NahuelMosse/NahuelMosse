// In-page frame tracer. Installed with addInitScript, so it must be self-contained (it is
// serialised and run in the page; nothing from this module's scope exists there).
//
// It samples rect, opacity and transform of the tracked nodes on every animation frame, follows
// nodes mounted while a recording runs (portals, conditionally rendered overlays), records Animation
// objects that start or are cancelled (restart evidence) and collects Long Animation Frames with
// the scripts that caused them.
export const tracer = (cfg) => {
  if (window.__mt || window !== window.top) return;
  const { cols: COLS, skip, subtreeCap, pageCap, mountCap, minSize } = cfg;
  const SKIP = new Set(skip);
  const PRIORITY = 'dialog, [role=dialog], [role=alertdialog], [role=menu], [role=listbox], [role=tooltip], [popover], [aria-modal=true]';
  const ids = new WeakMap();
  let next = 1;
  const idOf = (n) => { let i = ids.get(n); if (!i) { i = next++; ids.set(n, i); } return i; };
  const labelOf = (n) => `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${[...n.classList].slice(0, 2).map((c) => `.${c}`).join('')}`;
  const matrixOf = (value) => {
    const m = /^matrix(3d)?\(([^)]*)\)$/.exec(value);
    if (!m) return null;
    const v = m[2].split(',').map(Number);
    return m[1] ? { a: v[0], b: v[1], c: v[4], d: v[5], tx: v[12], ty: v[13] } : { a: v[0], b: v[1], c: v[2], d: v[3], tx: v[4], ty: v[5] };
  };
  const pose = (n) => {
    const r = n.getBoundingClientRect();
    const cs = getComputedStyle(n);
    let tx = 0; let ty = 0; let sx = 1; let sy = 1; let rot = 0;
    const m = cs.transform !== 'none' ? matrixOf(cs.transform) : null;
    if (m) { tx = m.tx; ty = m.ty; sx = Math.hypot(m.a, m.b); sy = Math.hypot(m.c, m.d); rot = (Math.atan2(m.b, m.a) * 180) / Math.PI; }
    if (cs.translate && cs.translate !== 'none') { const p = cs.translate.split(' ').map(parseFloat); tx += p[0] || 0; ty += p[1] || 0; }
    if (cs.scale && cs.scale !== 'none') { const p = cs.scale.split(' ').map(parseFloat); sx *= p[0]; sy *= p[1] ?? p[0]; }
    if (cs.rotate && cs.rotate !== 'none') rot += parseFloat(cs.rotate) || 0;
    return [r.left + scrollX, r.top + scrollY, r.width, r.height, parseFloat(cs.opacity), tx, ty, sx, sy, rot, n.offsetWidth ?? r.width, n.offsetHeight ?? r.height];
  };

  const loaf = [];
  const loafSupported = typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes ?? []).includes('long-animation-frame');
  let loafObserver = null;
  if (loafSupported) {
    loafObserver = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) loaf.push([e.startTime, e.duration, (e.scripts ?? []).map((s) => ({ url: s.sourceURL, fn: s.sourceFunctionName, invoker: s.invoker, duration: Math.round(s.duration), forced: Math.round(s.forcedStyleAndLayoutDuration ?? 0) }))]);
    });
    loafObserver.observe({ type: 'long-animation-frame', buffered: true });
  }

  const animKind = (a) => {
    if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) return 'transition';
    if (typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation) return 'animation';
    return 'waapi';
  };
  const NOT_PROPS = new Set(['offset', 'easing', 'composite', 'computedOffset']);
  const describeAnim = (a) => {
    const props = new Set();
    let explicitFrom = false;
    for (const k of a.effect?.getKeyframes?.() ?? []) {
      for (const key of Object.keys(k)) if (!NOT_PROPS.has(key)) { props.add(key); if (k.offset === 0) explicitFrom = true; }
    }
    return { props: [...props], explicitFrom };
  };

  const recs = new Map();
  const watched = new WeakSet();
  let running = false;
  const active = () => [...recs.values()].filter((r) => r.active);

  const watchCancel = (a) => {
    if (watched.has(a)) return;
    watched.add(a);
    const kind = animKind(a);
    a.addEventListener('cancel', () => {
      const target = a.effect?.target;
      if (!target || kind !== 'animation') return;
      for (const r of active()) r.anims.push({ t: performance.now(), nodeId: idOf(target), type: 'cancel', props: describeAnim(a).props, explicitFrom: false });
    });
  };
  const scanAnimations = (rec, ts) => {
    const list = rec.root ? rec.root.getAnimations({ subtree: true }) : document.getAnimations();
    for (const a of list) {
      watchCancel(a);
      if (rec.seen.has(a)) continue;
      rec.seen.add(a);
      const target = a.effect?.target;
      if (!rec.primed || !target) continue;
      rec.anims.push({ t: ts, nodeId: idOf(target), type: animKind(a), ...describeAnim(a) });
    }
    rec.primed = true;
  };

  const track = (rec, n) => {
    if (rec.set.has(n) || SKIP.has(n.tagName)) return false;
    rec.set.add(n);
    rec.list.push(n);
    return true;
  };

  // The next sample is requested once this frame has been drawn, so in the next frame it runs after the
  // callbacks the page requested during this one: it reads what that frame shows, not the frame before.
  const after = new MessageChannel();
  after.port1.onmessage = () => requestAnimationFrame(frame);
  const frame = (ts) => {
    for (const rec of active()) {
      scanAnimations(rec, ts);
      for (const n of rec.list) {
        if (!n.isConnected) continue;
        const id = idOf(n);
        let e = rec.elems.get(id);
        if (!e) {
          e = { id, parent: n.parentElement ? idOf(n.parentElement) : 0, label: labelOf(n), tag: n.tagName, role: n.getAttribute('role'), root: n === rec.root, t: [], r: [] };
          for (const c of COLS) e[c] = [];
          rec.elems.set(id, e);
        }
        const p = pose(n);
        e.t.push(ts);
        e.r.push(performance.now());
        COLS.forEach((c, i) => e[c].push(p[i]));
      }
    }
    if (active().length) after.port2.postMessage(0); else running = false;
  };

  const onClick = (e) => { for (const r of active()) r.marks.push(e.timeStamp); };
  document.addEventListener('click', onClick, true);

  // Nodes added while a recording runs join it: a dialog mounted on open is the motion under test.
  const mounts = new MutationObserver((records) => {
    const recsActive = active();
    if (!recsActive.length) return;
    for (const m of records) {
      for (const added of m.addedNodes) {
        if (added.nodeType !== 1) continue;
        for (const rec of recsActive) {
          if (rec.root && !rec.root.contains(added)) continue;
          if (rec.mounted >= mountCap) continue;
          for (const n of [added, ...added.querySelectorAll('*')]) if (rec.mounted < mountCap && track(rec, n)) rec.mounted++;
        }
      }
    }
  });
  mounts.observe(document, { childList: true, subtree: true });

  const initialNodes = (root, all, hint) => {
    if (root) return [root, ...root.querySelectorAll('*')].filter((n) => !SKIP.has(n.tagName)).slice(0, subtreeCap);
    const rank = (n) => {
      if ((hint && hint.contains(n)) || n.closest(PRIORITY)) return 0;
      const r = n.getBoundingClientRect();
      return r.bottom > -innerHeight && r.top < 2 * innerHeight ? 1 : 2;
    };
    const nodes = [...document.body.querySelectorAll('*')].filter((n) => {
      if (SKIP.has(n.tagName)) return false;
      if (all) return true;
      const r = n.getBoundingClientRect();
      return r.width >= minSize && r.height >= minSize;
    });
    return nodes.map((n) => [rank(n), n]).sort((x, y) => x[0] - y[0]).slice(0, pageCap).map((x) => x[1]);
  };

  window.__mt = {
    loaf,
    loafSupported,
    now: () => performance.now(),
    // root: follow that node and its subtree; null: the page. all: include zero-size nodes.
    // hint: node whose subtree (an aria-controls target) is traced first.
    begin(name, root, all, hint) {
      const rec = { active: true, root, list: [], set: new Set(), elems: new Map(), marks: [], anims: [], seen: new WeakSet(), primed: false, mounted: 0 };
      for (const n of initialNodes(root, all, hint)) track(rec, n);
      scanAnimations(rec, performance.now());
      recs.set(name, rec);
      if (!running) { running = true; requestAnimationFrame(frame); }
    },
    mark(name) { recs.get(name)?.marks.push(performance.now()); },
    // Stops every observer and listener and removes the tracer from this document.
    dispose() {
      for (const r of recs.values()) r.active = false;
      recs.clear();
      mounts.disconnect();
      after.port1.close();
      loafObserver?.disconnect();
      document.removeEventListener('click', onClick, true);
      delete window.__mt;
    },
    end(name) {
      const rec = recs.get(name);
      if (!rec) return null;
      rec.active = false;
      recs.delete(name);
      return { marks: rec.marks, elems: [...rec.elems.values()], anims: rec.anims, mounted: rec.mounted };
    },
  };
};
