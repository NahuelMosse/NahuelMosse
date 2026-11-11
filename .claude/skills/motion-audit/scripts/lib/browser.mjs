// Helpers that drive the page: tracing a gesture, snapshots, forced pseudo-states over CDP,
// navigation with redirect checks.
import { CALIBRATION_CYCLES, CLIP_MARGIN_PX, IDLE_NOISE_MS, VIEWPORT, HYDRATION_WAIT_MS, LOGIN_PATH, LONG_FRAME_MS, NAV_TIMEOUT_MS, PAGE_SCRIPT_MIN_MS, PIXEL_BLOCK_PX, PIXEL_CHANNEL_TOLERANCE, PIXEL_MIN_BLOCKS, RELOAD_WAIT_MS, SETTLE_MAX_MS, TRACE_MIN_SIZE_PX, TRACE_MOUNT_CAP, TRACE_PAGE_CAP, TRACE_SUBTREE_CAP, WAIT_FOR_TIMEOUT_MS } from './constants.mjs';
import { COLS, analyzeRecording } from './series.mjs';

export class AuditError extends Error {}

export const TRACER_CONFIG = { cols: COLS, skip: ['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'BR', 'TEMPLATE'], subtreeCap: TRACE_SUBTREE_CAP, pageCap: TRACE_PAGE_CAP, mountCap: TRACE_MOUNT_CAP, minSize: TRACE_MIN_SIZE_PX };

export const snapshot = (h, props) => h.evaluate((n, p) => { const cs = getComputedStyle(n); return Object.fromEntries(p.map((x) => [x, cs.getPropertyValue(x)])); }, props);
export const diff = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);
export const shot = async (page, box) => (await page.screenshot({ clip: { x: Math.max(0, box.x - CLIP_MARGIN_PX), y: Math.max(0, box.y - CLIP_MARGIN_PX), width: box.width + 2 * CLIP_MARGIN_PX, height: box.height + 2 * CLIP_MARGIN_PX } })).toString('base64');
export const toMs = (list) => String(list).split(',').map((s) => s.trim()).map((s) => (s.endsWith('ms') ? parseFloat(s) : parseFloat(s) * 1000));

// Records one gesture: the tracer follows `root` and its subtree while `action` runs.
export const traced = async (page, root, action) => {
  await root.evaluate((n) => window.__mt.begin('m', n));
  const from = await page.evaluate(() => window.__mt.now());
  await action();
  const rec = await page.evaluate(() => window.__mt.end('m'));
  const to = await page.evaluate(() => window.__mt.now());
  const loaf = await page.evaluate(() => window.__mt.loaf);
  return { rec, motion: analyzeRecording(rec, { longFrames: longWindows(loaf, from, unattributedLimit(page)) }), long: longFramesBetween(loaf, from, to, unattributedLimit(page)) };
};

// How long a frame with no application script must be to count: LONG_FRAME_MS, or more on a machine
// whose frames are slow with nothing to do (see calibrateFrames).
const limits = new WeakMap();
export const setUnattributedLimit = (page, ms) => limits.set(page, ms);
export const unattributedLimit = (page) => limits.get(page) ?? LONG_FRAME_MS;

// An auxiliary page next to the audited one. A page from `browser.newPage()` owns its context, which refuses
// further pages: the auxiliary page then lives in a context of its own (with the page's session when `session`)
// that closes with it.
export const auxPage = async (context, { session = false } = {}) => {
  try {
    return await context.newPage();
  } catch (e) {
    const browser = context.browser();
    if (!browser || !/browser.newContext()/.test(String(e?.message))) throw e;
    const own = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, ...(session ? { storageState: await context.storageState() } : {}) });
    const page = await own.newPage();
    const close = page.close.bind(page);
    page.close = async (options) => { await close(options).catch(() => {}); await own.close().catch(() => {}); };
    return page;
  }
};

// The longest frame of the audited page while nothing touches it (ambient animations, a busy
// machine): a frame at least that long during a gesture says nothing about the gesture.
export const idleFrameNoise = async (page, ms = IDLE_NOISE_MS) => {
  const from = await page.evaluate(() => window.__mt.now());
  await page.waitForTimeout(ms);
  const loaf = await page.evaluate(() => window.__mt.loaf);
  return Math.max(0, ...loaf.filter(([s, d]) => s + d >= from).map(([, d]) => d));
};

// Measures the frames of a blank page doing what the audit does (hover, leave, screenshot): the
// longest one is the noise of this machine. Returns 0 where Long Animation Frames are unsupported.
export const calibrateFrames = async (context) => {
  const page = await auxPage(context);
  try {
    await page.setViewportSize(VIEWPORT);
    await page.setContent('<body style="margin:0"><style>button{margin:40px;padding:8px 14px;transition:background-color 140ms}button:hover{background:#ddd}</style><button id="b">Probe</button>' + '<p>text</p>'.repeat(200) + '</body>');
    await page.evaluate(() => {
      window.__noise = [];
      if (PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__noise.push(e.duration); }).observe({ type: 'long-animation-frame', buffered: true });
    });
    const box = await (await page.$('#b')).boundingBox();
    const clip = { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 };
    for (let i = 0; i < CALIBRATION_CYCLES; i++) {
      await page.mouse.move(box.x + 5, box.y + 5);
      await page.waitForTimeout(150);
      await page.screenshot({ clip });
      await page.mouse.move(1, 1);
      await page.waitForTimeout(150);
    }
    return Math.max(0, ...(await page.evaluate(() => window.__noise)));
  } catch {
    return 0;
  } finally {
    await page.close().catch(() => {});
  }
};

// The part of a frame's time that is the audit's own work: scripts with no source URL (the tracer's
// frame callback, page.evaluate) minus the style and layout they forced, which the page's own
// changes made necessary.
const auditWork = (scripts) => scripts.filter((s) => !s.url).reduce((sum, s) => sum + Math.max(0, s.duration - (s.forced ?? 0)), 0);

// Long frames (over LONG_FRAME_MS) in [from, to] that are the page's: what is left of a frame once
// the audit's own script time is taken out. Frames with no script at all (style, layout, paint) count
// when they are over `unattributedMs`, and so do frames whose page scripts are short (PAGE_SCRIPT_MIN_MS).
const pageScripts = (scripts) => scripts.filter((x) => x.url).reduce((sum, x) => sum + x.duration, 0);
const pageOwned = (d, scripts, unattributedMs) => d - auditWork(scripts) > (pageScripts(scripts) >= PAGE_SCRIPT_MIN_MS ? LONG_FRAME_MS : unattributedMs);
export const longFramesBetween = (loaf, from, to = Infinity, unattributedMs = LONG_FRAME_MS) => loaf
  .filter(([s, d, scripts]) => s + d >= from && s <= to && pageOwned(d, scripts ?? [], unattributedMs))
  .map(([, d, scripts]) => ({ duration: Math.round(d), scripts: (scripts ?? []).filter((x) => x.url) }));

// [[start, duration]] of the page's long frames (the ones longFramesBetween reports) that end after `from`:
// a step in one of them is that frame. A frame no longer than the machine's own noise explains nothing.
export const longWindows = (loaf, from, unattributedMs = LONG_FRAME_MS) => loaf
  .filter(([s, d, scripts]) => s + d >= from && pageOwned(d, scripts ?? [], unattributedMs))
  .map(([s, d]) => [s, d]);

// Which scripts a long frame is attributed to, from the LoAF `scripts[]`.
export const describeLong = (long) => {
  const frames = long.map((l) => l.duration);
  const byUrl = new Map();
  for (const l of long) for (const s of l.scripts ?? []) {
    const name = s.url ? s.url.replace(/^.*\//, '').replace(/\?.*$/, '') || s.url : '(inline or injected script)';
    byUrl.set(name, (byUrl.get(name) ?? 0) + s.duration);
  }
  const top = [...byUrl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n, d]) => `${n} ${d} ms`);
  return { frames, culprit: top.length ? `scripts: ${top.join(', ')}` : 'no script attributed (style, layout or paint)' };
};

// Forces CSS pseudo-classes on an element through the DevTools protocol: no pointer or focus
// event is dispatched, so nothing in the app reacts.
export const createPseudoStates = async (context, page) => {
  const session = await context.newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const nodeId = async (handle, up = 0) => {
    await handle.evaluate((n, levels) => { let e = n; for (let i = 0; i < levels && e.parentElement; i++) e = e.parentElement; window.__maTarget = e; }, up);
    const { result } = await session.send('Runtime.evaluate', { expression: 'window.__maTarget' });
    await handle.evaluate(() => { delete window.__maTarget; });
    return (await session.send('DOM.requestNode', { objectId: result.objectId })).nodeId;
  };
  return {
    async force(handle, states, ancestors = {}) {
      // Node ids are only valid until the next getDocument, so it is called once, before resolving any.
      await session.send('DOM.getDocument', { depth: 0 });
      const ids = [{ id: await nodeId(handle), states }];
      for (const [up, st] of Object.entries(ancestors)) ids.push({ id: await nodeId(handle, Number(up)), states: st });
      for (const { id, states: s } of ids) await session.send('CSS.forcePseudoState', { nodeId: id, forcedPseudoClasses: s });
      return ids;
    },
    async clear(ids) { for (const { id } of ids) await session.send('CSS.forcePseudoState', { nodeId: id, forcedPseudoClasses: [] }); },
    detach: () => session.detach().catch(() => {}),
    session,
  };
};

const sameDocument = (a, b) => {
  const x = new URL(a);
  const y = new URL(b);
  return x.origin === y.origin && x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, '') && x.search === y.search;
};
export const sameLocation = sameDocument;

const loadedUrls = new WeakMap();

// Loads `url` fresh (never reload: a probe may have navigated) and checks where it landed: after
// the load, after --wait-for and after the hydration wait, because a session check or a router
// redirects from script, after the response.
export const load = async (page, url, { waitFor, allowRedirect = false } = {}) => {
  const response = await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
  if (response && response.status() >= 400) throw new AuditError(`${url} answered HTTP ${response.status()}`);
  const verify = () => {
    const landed = page.url();
    if (sameDocument(url, landed)) return landed;
    const requested = new URL(url);
    const final = new URL(landed);
    if (LOGIN_PATH.test(final.pathname + final.search) && !LOGIN_PATH.test(requested.pathname)) {
      throw new AuditError(`${url} redirected to ${landed}: that is a login page, not the page to audit. Pass --storage-state <file> with a logged-in session`);
    }
    if (!allowRedirect) throw new AuditError(`${url} redirected to ${landed}: the page audited is not the one requested. Audit that URL, or pass --allow-redirect to audit where it lands`);
    return landed;
  };
  verify();
  if (waitFor) {
    try { await page.waitForSelector(waitFor, { state: 'visible', timeout: WAIT_FOR_TIMEOUT_MS }); } catch (e) {
      throw new AuditError(`--wait-for "${waitFor}" did not appear within ${WAIT_FOR_TIMEOUT_MS / 1000} s on ${page.url()}: ${e.message.split('\n')[0]}`);
    }
  }
  // The first load of a URL gets the full hydration wait; the probes' reloads of it a short one,
  // then until its own entrance animations have finished.
  const reload = loadedUrls.get(page)?.has(url);
  await page.waitForTimeout(reload ? RELOAD_WAIT_MS : HYDRATION_WAIT_MS);
  await page.evaluate((cap) => new Promise((resolve) => {
    const end = performance.now() + cap;
    const check = () => (document.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)) && performance.now() < end ? setTimeout(check, 50) : resolve());
    check();
  }), SETTLE_MAX_MS).catch(() => {});
  if (!loadedUrls.has(page)) loadedUrls.set(page, new Set());
  loadedUrls.get(page).add(url);
  const landed = verify();
  return { landed, redirected: !sameDocument(url, landed), loadedAt: Date.now() };
};

// Compares two screenshots (base64 PNG) the way an eye does: the share of pixels that differ by more
// than PIXEL_CHANNEL_TOLERANCE in some channel. Anti-aliasing and compositing noise stay below it.
// Decoding happens in a blank page of the same context, away from the page under audit.
export const createPixelComparer = async (context) => {
  const page = await auxPage(context);
  const stats = (a, b, tolerance) => page.evaluate(async ([x, y, tol, block]) => {
    const decode = async (b64) => {
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, bmp.width, bmp.height);
    };
    const [p, q] = await Promise.all([decode(x), decode(y)]);
    const bw = Math.ceil(p.width / block);
    const bh = Math.ceil(p.height / block);
    if (p.width !== q.width || p.height !== q.height) return { changed: bw * bh, total: bw * bh, max: 255 };
    let changed = 0;
    let max = 0;
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const sum = [0, 0, 0, 0, 0, 0, 0, 0];
        let n = 0;
        for (let y = by * block; y < Math.min(p.height, (by + 1) * block); y++) {
          for (let x = bx * block; x < Math.min(p.width, (bx + 1) * block); x++) {
            const i = (y * p.width + x) * 4;
            for (let c = 0; c < 4; c++) { sum[c] += p.data[i + c]; sum[c + 4] += q.data[i + c]; }
            n++;
          }
        }
        const d = Math.max(...[0, 1, 2, 3].map((c) => Math.abs(sum[c] - sum[c + 4]) / n));
        if (d > tol) changed++;
        if (d > max) max = d;
      }
    }
    return { changed, total: bw * bh, max: Math.round(max) };
  }, [a, b, tolerance, PIXEL_BLOCK_PX]);
  return {
    stats: (a, b, tolerance = PIXEL_CHANNEL_TOLERANCE) => (a === b ? Promise.resolve({ changed: 0, total: 1, max: 0 }) : stats(a, b, tolerance)),
    // Whether the two screenshots show a visible difference.
    async differ(a, b) {
      if (a === b) return false;
      const { changed } = await stats(a, b, PIXEL_CHANNEL_TOLERANCE);
      return changed >= PIXEL_MIN_BLOCKS;
    },
    close: () => page.close().catch(() => {}),
  };
};
