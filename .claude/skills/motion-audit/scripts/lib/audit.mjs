// audit(pageOrUrl, options): the whole run. Returns the report (schemaVersion 1).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  CONFIRM_MAJORITY, CONFIRM_RUNS, DEFAULT_MAX_ELEMENTS, FRAME_NOISE_FACTOR, INTERACTIVE, LONG_FRAME_MS, MIN_PLAYWRIGHT, MAX_TOGGLES, NOISY_UNATTRIBUTED_MS, ENV_NOISE_MIN_ELEMENTS, RECOUNT_AFTER_MS, SCHEMA_VERSION,
  SCROLL_STEP_MS, SCROLL_STEP_PX, SCROLL_TAIL_MS, TOGGLE, VIEWPORT,
} from './constants.mjs';
import { UsageError } from './args.mjs';
import { AuditError, TRACER_CONFIG, createPixelComparer, calibrateFrames, idleFrameNoise, createPseudoStates, describeLong, load, longFramesBetween, sameLocation, setUnattributedLimit, unattributedLimit } from './browser.mjs';
import { baselineIds, readReport } from './compare.mjs';
import { finalize, loadConfig, validateConfig } from './config.mjs';
import { inconsistencies, judgeElement } from './judge.mjs';
import { devSignals, cssPath, describeElement, hasReducedMotionRule, invisibleContent, reachability, scrollPass, ungatedHoverMotion } from './page-scripts.mjs';
import { tracer } from './page-tracer.mjs';
import { clickRerun, clickRows, confirmToggle, toggleRow, undecidedOf } from './undecided.mjs';
import { loadPlaywright } from './playwright.mjs';
import { auditElement, clickMeasurer, contactSheet, eligibleToggles, probeToggle, reducedPass } from './probes.mjs';

const SCROLL_OPTIONS = { step: SCROLL_STEP_PX, stepMs: SCROLL_STEP_MS, tail: SCROLL_TAIL_MS, maxScrollers: 5 };
const MAX_SKIP_EXAMPLES = 3;

// Flaky aspects of a measurement are kept only when most of CONFIRM_RUNS runs agree.
const confirm = async (first, aspects, rerun) => {
  const flagged = Object.entries(aspects).filter(([, has]) => has(first));
  if (!flagged.length) return [];
  const later = [];
  for (let i = 1; i < CONFIRM_RUNS; i++) later.push(await rerun());
  for (const [name, has] of flagged) {
    const hits = 1 + later.filter((r) => r && has(r)).length;
    if (hits < CONFIRM_MAJORITY) first.unconfirmed = [...(first.unconfirmed ?? []), name];
  }
  return later;
};

const unresolvedMoves = (el) => Object.entries(el.moments).flatMap(([moment, d]) => d.motion.flatMap((e) => e.moves.filter((m) => m.unresolved > 0 && !m.jumps.length).map((m) => ({ moment, label: e.label, prop: m.prop, cadence: m.cadence }))));
const jumpKeys = (el) => Object.entries(el.moments).flatMap(([m, d]) => d.motion.flatMap((e) => e.moves.flatMap((mv) => mv.jumps.map(() => `${m}|${e.label}|${mv.prop}`))));
// Long frames are confirmed per gesture: a frame that shows up in the press of one run and in the
// focus of the next is two borderline frames, not one confirmed long frame.
const elementAspects = (first) => ({
  ...Object.fromEntries([...new Set(first.long.map((l) => l.moment))].map((m) => [`long:${m}`, (e) => e.long.some((l) => l.moment === m)])),
  interrupt: (e) => (e.interrupt?.length ?? 0) > 0,
  jump: (e) => jumpKeys(e).length > 0,
  // A step the frames could not judge: the re-measures decide whether it is ruled out or stays undecided.
  unresolved: (e) => unresolvedMoves(e).length > 0,
});
const dropUnconfirmed = (el) => {
  for (const name of el.unconfirmed ?? []) {
    if (name.startsWith('long:')) el.long = el.long.filter((l) => l.moment !== name.slice(5));
    if (name === 'interrupt') el.interrupt = [];
    if (name === 'jump') for (const d of Object.values(el.moments)) for (const e of d.motion) for (const m of e.moves) m.jumps = [];
  }
  delete el.unconfirmed;
};

const resolveConfig = (c) => (c && typeof c === 'object' ? validateConfig(c, 'config option') : loadConfig(c));

const describeLongFrames = (long) => {
  const { frames, culprit } = describeLong(long);
  return `${frames.length} frame${frames.length > 1 ? 's' : ''} over ${LONG_FRAME_MS} ms (${frames.slice(0, 5).join(', ')} ms), ${culprit}`;
};

export const audit = async (pageOrUrl, o = {}) => {
  const isPage = typeof pageOrUrl === 'object' && pageOrUrl !== null && typeof pageOrUrl.goto === 'function';
  const config = resolveConfig(o.config);
  const baseline = o.baseline ? (typeof o.baseline === 'string' ? baselineIds(readReport(o.baseline)) : new Set(o.baseline)) : new Set();
  const out = resolve(o.out ?? mkdtempSync(join(tmpdir(), 'motion-audit-')));
  mkdirSync(out, { recursive: true });
  const max = o.max ?? DEFAULT_MAX_ELEMENTS;

  let browser = null;
  let context;
  let page;
  let url;
  let initScript = null;
  let throttle = null;
  let pixels = null;
  let pseudo = null;
  if (isPage) {
    page = pageOrUrl;
    context = page.context();
    url = o.url ?? page.url();
    if (!url || url === 'about:blank') throw new AuditError('the page has not been navigated: pass options.url or call page.goto() first');
    // Before Playwright 1.59 addInitScript returns nothing and a script cannot be removed: find out with an empty
    // one (harmless if left behind) before the tracer is added.
    const probe = await page.addInitScript(() => {});
    if (typeof probe?.dispose !== 'function') throw new AuditError(`audit(page) needs Playwright ${MIN_PLAYWRIGHT.join('.')} or later: the page's Playwright cannot remove the tracer it installs (addInitScript returned no Disposable). Upgrade it, or pass a URL`);
    await probe.dispose();
    initScript = await page.addInitScript(tracer, TRACER_CONFIG);
  } else {
    url = pageOrUrl;
    const { chromium } = loadPlaywright();
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, ...(o.storageState ? { storageState: o.storageState } : {}) });
    await context.addInitScript(tracer, TRACER_CONFIG);
    page = await context.newPage();
  }
  const notes = [];
  try {
    if (o.cpu > 1) {
      throttle = await context.newCDPSession(page);
      await throttle.send('Emulation.setCPUThrottlingRate', { rate: o.cpu });
    }
    const loadOptions = { waitFor: o.waitFor, allowRedirect: Boolean(o.allowRedirect) };
    const first = await load(page, url, loadOptions);
    const landed = first.landed;
    if (first.redirected) notes.push(`${url} redirected to ${landed}`);
    pseudo = await createPseudoStates(context, page);
    pixels = await createPixelComparer(context);
    const noise = Math.max(await calibrateFrames(context), await idleFrameNoise(page));
    const unattributedMs = Math.max(noise >= LONG_FRAME_MS ? NOISY_UNATTRIBUTED_MS : LONG_FRAME_MS, Math.ceil(noise * FRAME_NOISE_FACTOR));
    setUnattributedLimit(page, unattributedMs);
    if (unattributedMs > LONG_FRAME_MS) notes.push(`this machine or page is noisy (frames of ${Math.round(noise)} ms with nothing happening): frames with no application script count only above ${unattributedMs} ms`);
    const ctx = { page, context, pseudo, pixels, url, interact: Boolean(o.interact), loadOptions, notes };
    const devServer = await page.evaluate(devSignals);
    if (devServer.length) notes.push(`development build detected (${devServer.join(', ')}): long frames are reported as warnings; audit a production build (next start, vite preview) for them to count`);
    const loafSupported = await page.evaluate(() => window.__mt.loafSupported);
    const raw = [];
    const add = (kind, element, detail, key) => raw.push({ kind, element, detail, key });
    const coverage = { candidates: 0, audited: 0, errored: 0, skipped: {}, max, toggles: { candidates: 0, probed: 0, skipped: {} } };
    const skip = (reason, example) => {
      const s = (coverage.skipped[reason] ??= { count: 0, examples: [] });
      s.count++;
      if (example && s.examples.length < MAX_SKIP_EXAMPLES) s.examples.push(example);
    };

    // Scroll the page end to end: entrances, long frames, content that stays invisible.
    const scrollOnce = async () => { const r = await page.evaluate(scrollPass, SCROLL_OPTIONS); return { ...r, long: longFramesBetween(r.loaf, 0, Infinity, unattributedLimit(page)) }; };
    let scroll = await scrollOnce();
    if (scroll.long.length) {
      const later = [];
      for (let i = 1; i < CONFIRM_RUNS; i++) later.push(await scrollOnce());
      if (1 + later.filter((r) => r.long.length).length < CONFIRM_MAJORITY) scroll = { ...scroll, long: [] };
    }
    const hiddenNormally = new Set(await page.evaluate(invisibleContent));

    // Controls.
    const controlsLoad = await load(page, url, loadOptions);
    const findHandles = async () => (o.only?.length ? (await Promise.all(o.only.map(async (s) => {
      try { return await page.$$(s); } catch (e) { throw new UsageError(`--only "${s}" is not a valid selector: ${e.message.split('\n')[0]}`); }
    }))).flat() : page.$$(INTERACTIVE));
    const handles = await findHandles();
    coverage.candidates = handles.length;
    const elements = [];
    const targets = [];
    const labels = new Map();
    const seenPaths = new Set();
    let navigated = false;
    for (const h of handles) {
      if (navigated) { skip('page navigated during the audit'); continue; }
      if (elements.length >= max) { skip(`beyond --max ${max}`); continue; }
      let label;
      try {
        const reach = await h.evaluate(reachability);
        label = await h.evaluate(describeElement);
        if (reach.state === 'skip') { skip(reach.reason, label); continue; }
        const path = await h.evaluate(cssPath);
        if (seenPaths.has(path)) { coverage.candidates--; continue; }
        seenPaths.add(path);
        const n = (labels.get(label) ?? 0) + 1;
        labels.set(label, n);
        const unique = n > 1 ? `${label} (${n})` : label;
        const result = await auditElement(ctx, h, unique, { hoverOnly: reach.state === 'hover-only' });
        if (result.skipped) { skip(result.skipped, label); continue; }
        const { el } = result;
        const later = await confirm(el, elementAspects(el), async () => {
          const again = await auditElement(ctx, h, unique, { hoverOnly: reach.state === 'hover-only' });
          return again.el ?? null;
        });
        el.undecided = undecidedOf(el, later);
        dropUnconfirmed(el);
        el.path = path;
        el.real = el.pressMode === 'real';
        elements.push(el);
        targets.push({ path, real: el.real, label });
        if (o.interact && !sameLocation(page.url(), landed)) {
          navigated = true;
          notes.push(`interacting with ${label} navigated to ${page.url()}: audit stopped there; the controls after it were not audited`);
          await load(page, url, loadOptions);
        }
      } catch (e) {
        if (o.interact && /context was destroyed|navigat/i.test(e.message)) await page.waitForTimeout(400);
        if (o.interact && !sameLocation(page.url(), landed)) {
          // A gesture navigated (a link that routes on mousedown): not an error of the control.
          navigated = true;
          notes.push(`interacting with ${label ?? 'a control'} navigated to ${page.url()}: audit stopped there; the controls after it were not audited`);
          skip('page navigated during the audit');
          await load(page, url, loadOptions);
          continue;
        }
        coverage.errored++;
        skip('error', `${label ?? 'element'}: ${e.message.split('\n')[0].slice(0, 90)}`);
      }
    }
    coverage.audited = elements.length;

    // Controls that arrive later than the first count are not covered: say so instead of reporting "N of N".
    {
      const age = Date.now() - controlsLoad.loadedAt;
      if (!navigated && age < RECOUNT_AFTER_MS) await page.waitForTimeout(RECOUNT_AFTER_MS - age);
      const now = navigated ? handles.length : (await findHandles()).length;
      coverage.late = Math.max(0, now - handles.length);
      if (coverage.late) notes.push(`${coverage.late} controls appeared after the audit counted ${handles.length}: the page renders late, so the audit is incomplete. Re-run with --wait-for <selector of a late control>`);
    }

    const css = await page.evaluate(ungatedHoverMotion);
    const reducedRule = await page.evaluate(hasReducedMotionRule);

    // Toggles are clicked for real, so only with --interact.
    const toggles = [];
    if (o.interact && !navigated) {
      await load(page, url, loadOptions);
      const { eligible, skipped } = await eligibleToggles(page);
      coverage.toggles.candidates = eligible.length + skipped.length;
      for (const s of skipped) coverage.toggles.skipped[s.reason] = (coverage.toggles.skipped[s.reason] ?? 0) + 1;
      for (const index of eligible.slice(0, MAX_TOGGLES)) {
        let r = await probeToggle(ctx, index);
        if (!r.label) continue;
        if (r.jumps.length) {
          const again = [await probeToggle(ctx, index), await probeToggle(ctx, index)];
          r = confirmToggle(r, again);
        }
        coverage.toggles.probed++;
        toggles.push(r);
        if (r.jumps.length) {
          const top = [...new Map(r.jumps.map((j) => [j.label, j])).values()].slice(0, 3).map((j) => `${j.label} ${j.prop} ${j.from} -> ${j.to} in one frame (${j.direction}, ${j.delta})`).join('; ');
          add('not-interruptible', r.label, `reversed part-way through its ${r.dur} ms motion the animation restarts instead of continuing: ${top}`, 'toggle');
        }
        const undecided = toggleRow(r);
        if (undecided) raw.push(undecided);
        if (!sameLocation(page.url(), landed)) { notes.push(`toggling ${r.label} navigated to ${page.url()}: toggle probing stopped`); break; }
      }
      if (eligible.length > MAX_TOGGLES) coverage.toggles.skipped[`beyond ${MAX_TOGGLES} toggles`] = eligible.length - MAX_TOGGLES;
    } else coverage.toggles.skipped['observe-only (use --interact)'] = (coverage.toggles.candidates = (await page.$$(TOGGLE)).length);

    // --click <selector>
    let click = null;
    if (o.click) {
      const measure = clickMeasurer(ctx, o.click, o.interrupt);
      let r = await measure();
      if (r.missing) { add('click-target', o.click, `${o.click} ${r.missing}`, 'target'); await measure.restore(); }
      else {
        const label = `click ${o.click}`;
        const holder = { long: r.long, jumps: r.jumps, interrupt: r.interrupt };
        const reruns = [];
        const later = await confirm(holder, { long: (x) => x.long.length > 0, jump: (x) => x.jumps.length > 0, interrupt: (x) => x.interrupt.length > 0 }, clickRerun(measure, reruns));
        const undecidedRows = clickRows(label, r, holder.unconfirmed ?? [], reruns);
        for (const name of holder.unconfirmed ?? []) r = { ...r, [name === 'jump' ? 'jumps' : name]: [] };
        // Back to the state the target started in when the presses ended odd (a retry is one press).
        const restored = await measure.restore();
        click = { selector: o.click, moved: r.moved.length, mounted: r.mounted, cadence: r.cadence, long: r.long, interrupt: r.interrupt, presses: measure.presses(), remeasures: later.length, restored };
        raw.push(...undecidedRows);
        if (r.jumps.length) add('jump', label, `${r.jumps.slice(0, 4).map((j) => `${j.label} ${j.prop} jumps ${j.size} at ${j.atMs} ms`).join('; ')}${r.jumps.length > 4 ? ` (+${r.jumps.length - 4} more)` : ''}`, 'click');
        for (const l of r.layout) add('layout-animated', label, `${l.label} animates its ${l.prop === 'layoutWidth' ? 'width' : 'height'} over ${l.durationMs} ms`, `${l.label} ${l.prop}`);
        if (r.long.length) add('long-frame', label, `during the transition: ${describeLongFrames(r.long)}`, 'click');
        if (r.interrupt.length) add('interrupt-jump', label, `second click: ${r.interrupt.slice(0, 4).map((j) => `${j.label} ${j.prop}`).join(', ')} jump`, 'click');
      }
    }

    const sheets = [];
    for (const s of o.frames ?? []) sheets.push(await contactSheet(ctx, s, out));
    const reduced = await reducedPass(ctx, targets);
    for (const el of elements) el.reduced = reduced.per.get(el.path);

    // Frames no application script explains, in many unrelated controls, are the machine's: a page that janks does
    // so in its own scripts and in the controls that run them. The calibration at the start cannot see a noisy
    // phase that comes later.
    const unattributed = (l) => !l.scripts?.length;
    const noisy = elements.filter((e) => e.long.some(unattributed)).length;
    if (noisy >= ENV_NOISE_MIN_ELEMENTS) {
      const environmental = (l) => unattributed(l) && l.duration < NOISY_UNATTRIBUTED_MS;
      for (const el of elements) el.long = el.long.filter((l) => !environmental(l));
      scroll = { ...scroll, long: scroll.long.filter((l) => !environmental(l)) };
      notes.push(`frames over ${LONG_FRAME_MS} ms with no script behind them showed up in ${noisy} unrelated controls: the machine drops frames, so those are not reported as long frames`);
    }
    for (const el of elements) raw.push(...judgeElement(el, config));
    raw.push(...inconsistencies(elements, config));
    for (const el of elements) {
      for (const moment of [...new Set(el.long.map((l) => l.moment))]) add('long-frame', el.label, `during ${moment}: ${describeLongFrames(el.long.filter((l) => l.moment === moment))}`, moment);
    }
    if (scroll.long.length) add('long-frame', 'page scroll', `while scrolling${o.cpu > 1 ? ` (CPU ${o.cpu}x)` : ''}: ${describeLongFrames(scroll.long)}`, 'scroll');
    if (scroll.keyframeLayout.length) add('layout-animated', 'keyframes', `CSS/WAAPI animations animate ${scroll.keyframeLayout.join(', ')}`, 'keyframes');
    if (o.entrances) for (const s of scroll.sections.filter((x) => !x.animated)) add('no-entrance', `section "${s.section}"`, 'appears without an entrance the first time it is scrolled to', 'entrance');
    for (const sel of css.found) add('ungated-hover', sel, 'moves on :hover outside @media (hover: hover): sticks after a tap on touch screens', 'ungated');
    if (reduced.infinite.length) add('reduced-motion-loop', reduced.infinite.slice(0, 4).join(', '), 'infinite moving animation keeps running with prefers-reduced-motion', 'loop');
    const stranded = reduced.hidden.filter((h) => !hiddenNormally.has(h)).slice(0, 6);
    if (stranded.length) add('reduced-motion-hidden', stranded.join(', '), 'content stays at opacity 0 with prefers-reduced-motion: the entrance it waits for never runs', 'hidden');
    const anyMotion = elements.some((e) => Object.values(e.moments).some((d) => d?.motion.some((m) => m.moves.some((x) => x.prop !== 'opacity'))));
    const unreadable = Math.max(css.unreadable, reducedRule.unreadable);
    if (anyMotion && !reducedRule.found) {
      raw.push({ kind: 'reduced-motion-missing', element: 'stylesheets', key: 'rules', level: unreadable ? 'info' : undefined, detail: unreadable ? `unknown: ${unreadable} stylesheet(s) could not be read (cross-origin or file://), so a reduced-motion rule may exist there` : 'elements move but no stylesheet has a prefers-reduced-motion rule (JS-driven handling is not seen here)' });
    }

    const done = finalize(raw, config, { devServer: devServer.length > 0 });
    coverage.inconclusive = done.findings.filter((f) => f.kind === 'inconclusive').length;
    const baselined = done.findings.filter((f) => baseline.has(f.id));
    const findings = done.findings.filter((f) => !baseline.has(f.id));
    const report = {
      schemaVersion: SCHEMA_VERSION,
      url,
      finalUrl: landed,
      cpu: o.cpu ?? 1,
      mode: o.interact ? 'interact' : 'observe-only',
      loafSupported,
      devServer,
      cssUnreadable: unreadable,
      coverage,
      notes,
      elements: elements.map(({ label, kind, transition, moments, interrupt, reduced: red, pressMode, hoverOnly }) => ({ label, kind, pressMode, hoverOnly, transition, moments: Object.fromEntries(Object.entries(moments).map(([k, d]) => [k, { changed: d.changed, pixels: d.pixels, transition: d.transition, cadence: d.cadence, motion: d.motion }])), interrupt, reduced: red })),
      sections: scroll.sections,
      toggles,
      click,
      sheets: sheets.filter(Boolean),
      findings,
      baselined,
      suppressed: done.suppressed,
    };
    writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
    return { ...report, out };
  } finally {
    await pixels?.close();
    if (browser) await browser.close();
    else {
      await pseudo?.detach();
      // The page belongs to the caller: leave it as it was found.
      if (throttle) {
        await throttle.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
        await throttle.detach().catch(() => {});
      }
      await initScript?.dispose().catch(() => {});
      await page.evaluate(() => window.__mt?.dispose?.()).catch(() => {});
    }
  }
};

// 0 clean, 1 findings that fail, 2 the audit did not cover enough to mean anything.
export const exitCode = (report, { strict = false, minCoverage } = {}) => {
  const { candidates, audited } = report.coverage;
  if (audited === 0 || report.coverage.late > 0) return 2;
  if (minCoverage !== undefined && audited / candidates < minCoverage) return 2;
  return report.findings.some((f) => f.kind !== 'inconclusive' && (f.level === 'error' || (strict && f.level === 'warning'))) ? 1 : 0;
};
