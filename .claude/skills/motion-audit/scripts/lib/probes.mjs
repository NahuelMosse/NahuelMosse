// The gestures: what one control, one toggle, one click target and the reduced-motion pass do.
import { join } from 'node:path';
import {
  CLICK_INTERRUPT_MS, CLICK_LEAD_MS, CLICK_RECORD_MS, CLICK_RESOLVE_RETRIES, CONTACT_SHEET_STEP_MS, PRESS_GUARD_MS, DENY_SELECTOR, DENY_TEXT, NAMED_CONTROL, FRAME_MS,
  HIT_TEST_POINTS, INTERRUPT_LEAD_MS, INTERRUPT_MIN_MOTION_MS, INTERRUPT_RETRIES, SETTLE_MAX_MS, SETTLE_MIN_MS, SETTLE_QUIET_MS,
  REDUCED_LOOP_SPINNER_PX, SPARSE_DENSITY, SPARSE_MIN_MOTION_MS, SPARSE_RETRIES, TOGGLE, TOGGLE_MIN_MOTION_MS, TOGGLE_SHARES, VIEWPORT, VISIBLE_PROPS,
  TOGGLE_QUIET_MS, TOGGLE_SETTLE_MIN_MS,
} from './constants.mjs';
import { auxPage, createPseudoStates, diff, load, longFramesBetween, longWindows, shot, snapshot, toMs, traced, unattributedLimit } from './browser.mjs';
import { interruptionJumps, markCadence, restartUnfollowed } from './continuity.mjs';
import { denyReason, describeElement, elementInfo, hitPoint, infiniteAnimations, invisibleContent, proxyOf, readTransition, scrollPass, waitSettled } from './page-scripts.mjs';
import { reducedMoves, reducedResidue } from './reduced.mjs';
import { analyzeRecording, animatedMove, median } from './series.mjs';
import { NO_COVERAGE, coverageOf, isDense, mergeCoverage } from './sightings.mjs';

const DENY = { selector: DENY_SELECTOR, text: DENY_TEXT.source, flags: DENY_TEXT.flags, named: NAMED_CONTROL };
const asElement = (jsHandle) => jsHandle.asElement();
const wait = (page, ms) => page.waitForTimeout(ms);

// Waits until `root` is still (see waitSettled): a slow transition is measured to its end, a fast
// one costs a few frames.
const settle = (root, { min = SETTLE_MIN_MS, quiet = SETTLE_QUIET_MS } = {}) => root.evaluate(waitSettled, { minMs: min, quietMs: quiet, capMs: SETTLE_MAX_MS });
const settlePage = async (page, options) => settle(await page.$('html'), options);

export const denied = (handle) => handle.evaluate(denyReason, DENY);

// Samples per 60 Hz frame of the longest motion in a recording (Infinity when nothing moves for as
// long as SPARSE_MIN_MOTION_MS): below SPARSE_DENSITY the curve of the motion is not reliable.
export const sparsity = (motion) => {
  const long = motion.flatMap((e) => e.moves).filter((m) => m.durationMs >= SPARSE_MIN_MOTION_MS && m.samples !== undefined);
  return long.length ? Math.max(...long.map((m) => m.samples / (m.durationMs / FRAME_MS))) : Infinity;
};

// Whether a recording is a better basis than `cur` to judge the curve: fewer ties that sparse samples cannot
// break, then denser.
const undecided = (motion) => motion.flatMap((e) => e.moves).filter((m) => m.easeInTie && m.samples / (m.durationMs / FRAME_MS) < SPARSE_DENSITY).length;
const needsRetry = (motion) => sparsity(motion) < SPARSE_DENSITY || undecided(motion) > 0;
const better = (next, cur) => (undecided(next.motion) !== undecided(cur.motion) ? undecided(next.motion) < undecided(cur.motion) : sparsity(next.motion) > sparsity(cur.motion));

// A real press is released where it was pressed, never after a movement: a pointer that moves while
// down starts a drag (native or a pointer-event sortable) and drops it somewhere. Before the release the
// press is cancelled with a pointercancel on the control, as the browser does when it takes a gesture over:
// libraries that activate on pointerup (React Aria's usePress) abort instead of firing the action. The release
// still makes the browser dispatch a click on the control; it is cancelled in the capture phase of the window,
// before any page handler sees it, and the guard stays on for PRESS_GUARD_MS so that a click a library
// dispatches itself a moment after the pointerup (usePress waits 80 ms for the native one) is eaten too.
// Only then does the pointer move away. What remains: a plain mouseup or pointerup handler on the control still runs.
const releasePress = async (page, target) => {
  await target.evaluate((n) => n.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true })));
  await page.mouse.up();
  await wait(page, PRESS_GUARD_MS);
  await guardPress(page, false);
  await page.mouse.move(1, 1);
};
const guardPress = (page, on) => page.evaluate((enable) => {
  const events = ['click', 'auxclick', 'dblclick', 'dragstart'];
  if (enable) {
    window.__maGuard = (e) => { e.stopImmediatePropagation(); e.preventDefault(); };
    for (const t of events) window.addEventListener(t, window.__maGuard, true);
  } else if (window.__maGuard) {
    for (const t of events) window.removeEventListener(t, window.__maGuard, true);
    delete window.__maGuard;
  }
}, on);

// A point where the control itself receives the pointer, scrolling it to the centre if the first
// try is covered (sticky header, cookie banner); null when something stays on top.
export const reachablePoint = async (proxy) => {
  await proxy.scrollIntoViewIfNeeded();
  let point = await proxy.evaluate(hitPoint, HIT_TEST_POINTS);
  if (!point) {
    await proxy.evaluate((n) => n.scrollIntoView({ block: 'center', inline: 'center' }));
    point = await proxy.evaluate(hitPoint, HIT_TEST_POINTS);
  }
  return point;
};

const stillTransparent = (h) => h.evaluate((n) => { for (let e = n; e; e = e.parentElement) if (getComputedStyle(e).opacity === '0') return true; return false; });

// Hover, press, hover-leave and keyboard focus of one control. Returns { el } or { skipped: reason }.
// Observe-only by default: the pointer only hovers; :active and :focus-visible are forced over CDP.
// With ctx.interact the press is real (mouse down, released in place with the click cancelled, then moved away).
export const auditElement = async (ctx, original, label, { hoverOnly = false } = {}) => {
  const { page, pseudo } = ctx;
  const proxy = asElement(await original.evaluateHandle(proxyOf)) ?? original;
  const point = await reachablePoint(proxy);
  if (!point) return { skipped: 'covered' };
  const box = await proxy.boundingBox();
  if (!box || box.width < 2 || box.height < 2) return { skipped: 'zero-size' };
  const info = await proxy.evaluate(elementInfo);
  const refused = await denied(original);
  const real = ctx.interact && !refused;
  const transition = (raw) => ({ properties: raw.properties, durations: toMs(raw.durations), easings: raw.easings });
  const rest = transition(await proxy.evaluate(readTransition));
  const el = { label, kind: info.kind, selected: info.selected, transition: rest, moments: {}, long: [], pressMode: real ? 'real' : 'forced', hoverOnly };
  const moment = async (name, before, beforePx, after, afterPx, run) => {
    el.moments[name] = { changed: diff(before, after), pixels: await ctx.pixels.differ(beforePx, afterPx), rootLabel: run.rec?.elems?.find((x) => x.root)?.label, cadence: frameCadence(run.rec), motion: run.motion, transition: transition(await (name === 'focus' ? ring : proxy).evaluate(readTransition)) };
    el.long.push(...run.long.map((l) => ({ moment: name, ...l })));
  };
  // The element that shows the focus ring: a visually hidden input shows it on its sibling.
  const ring = asElement(await original.evaluateHandle((n) => (n.matches('input') && getComputedStyle(n).opacity === '0' ? n.nextElementSibling ?? n : n))) ?? original;

  if (info.kind !== 'focus-only') {
    const base = await snapshot(proxy, VISIBLE_PROPS);
    const basePx = await shot(page, box);
    const hoverOnce = () => traced(page, proxy, async () => { await page.mouse.move(point.x, point.y); await settle(proxy); });
    let hover = await hoverOnce();
    // A machine that renders few frames can sample a motion too coarsely to classify its curve: hover
    // again and keep the densest recording.
    for (let again = 0; again < SPARSE_RETRIES && needsRetry(hover.motion); again++) {
      await page.mouse.move(1, 1);
      await settle(proxy);
      const next = await hoverOnce();
      if (better(next, hover)) hover = next;
    }
    if (hoverOnly && (await stillTransparent(proxy))) return { skipped: 'hidden' };
    const hovered = await snapshot(proxy, VISIBLE_PROPS);
    const hoverPx = await shot(page, box);
    await moment('hover', base, basePx, hovered, hoverPx, hover);
    if (info.kind !== 'input') {
      let press;
      if (real) {
        await guardPress(page, true);
        press = await traced(page, proxy, async () => { await page.mouse.down(); await settle(proxy); });
        const pressed = await snapshot(proxy, VISIBLE_PROPS);
        const pressedPx = await shot(page, box);
        await releasePress(page, proxy);
        await moment('press', hovered, hoverPx, pressed, pressedPx, press);
      } else {
        let ids;
        const pressOnce = () => traced(page, proxy, async () => { ids = await pseudo.force(proxy, ['hover', 'active']); await settle(proxy); });
        press = await pressOnce();
        for (let again = 0; again < SPARSE_RETRIES && needsRetry(press.motion); again++) {
          await pseudo.clear(ids);
          await settle(proxy);
          const next = await pressOnce();
          if (better(next, press)) press = next;
        }
        const pressed = await snapshot(proxy, VISIBLE_PROPS);
        const pressedPx = await shot(page, box);
        await moment('press', hovered, hoverPx, pressed, pressedPx, press);
        await pseudo.clear(ids);
        await page.mouse.move(1, 1);
      }
    } else await page.mouse.move(1, 1);
    // Back to rest before the next gesture, or a slow transition leaks into the focus snapshot.
    await settle(proxy);
    // Interrupt: enter, leave half-way through the hover motion; a reversing transition stays continuous.
    const hoverMs = Math.max(...hover.motion.flatMap((e) => e.moves.map((m) => m.durationMs)), 0);
    if (hoverMs >= INTERRUPT_MIN_MOTION_MS) {
      // The hover is left mid-way and recorded again while an animation restart was seen that the sparse frames
      // could not follow (at most INTERRUPT_RETRIES times).
      for (let again = 0; again <= INTERRUPT_RETRIES; again++) {
        await proxy.evaluate((n) => window.__mt.begin('i', n));
        const interruptFrom = await page.evaluate(() => window.__mt.now());
        await wait(page, INTERRUPT_LEAD_MS);
        await page.mouse.move(point.x, point.y);
        await wait(page, Math.max(70, hoverMs / 2));
        await page.evaluate(() => window.__mt.mark('i'));
        await page.mouse.move(1, 1);
        await settle(proxy);
        const rec = await page.evaluate(() => window.__mt.end('i'));
        const frames = longWindows(await page.evaluate(() => window.__mt.loaf), interruptFrom, unattributedLimit(page));
        el.interrupt = rec?.marks.length ? interruptionJumps(rec, rec.marks[0], { durationMs: hoverMs, small: true, longFrames: frames }) : [];
        el.interruptUnsure = rec?.marks.length && !el.interrupt.length ? restartUnfollowed(rec, rec.marks[0]) : null;
        const around = rec?.marks.length ? markCadence(rec, rec.marks[0]) : null;
        el.interruptCadence = around;
        // What this recording could see of the second gesture, and how clear each sighting was.
        el.interruptCoverage = rec?.marks.length ? coverageOf(analyzeRecording(rec), { mark: around }) : NO_COVERAGE;
        el.interruptSightings = el.interrupt.map((j) => ({ label: j.label, prop: j.prop, dense: isDense(around), cadence: around }));
        if (!el.interruptUnsure) break;
      }
    }
  }

  // Keyboard focus as :focus-visible shows it, forced over CDP: nothing receives a focus event.
  // Ancestors get :focus-within so a ring drawn on a wrapper counts.
  const wrapperHandles = [];
  for (const up of [1, 2]) wrapperHandles.push(asElement(await ring.evaluateHandle((n, levels) => { let e = n; for (let i = 0; i < levels && e.parentElement; i++) e = e.parentElement; return e; }, up)));
  const before = await snapshot(ring, VISIBLE_PROPS);
  const wrapperBefore = await Promise.all(wrapperHandles.map((h) => snapshot(h, VISIBLE_PROPS)));
  const beforePx = await shot(page, box);
  let ids;
  const focus = await traced(page, ring, async () => { ids = await pseudo.force(original, ['focus', 'focus-visible'], { 1: ['focus-within'], 2: ['focus-within'] }); await settle(ring); });
  const after = await snapshot(ring, VISIBLE_PROPS);
  const wrapperAfter = await Promise.all(wrapperHandles.map((h) => snapshot(h, VISIBLE_PROPS)));
  const afterPx = await shot(page, box);
  const wrapperChanged = wrapperBefore.flatMap((b, i) => diff(b, wrapperAfter[i]).map((p) => `wrapper:${p}`));
  const hiddenUntilHover = hoverOnly && (await stillTransparent(ring));
  el.moments.focus = { changed: [...diff(before, after), ...wrapperChanged], pixels: await ctx.pixels.differ(beforePx, afterPx), rootLabel: focus.rec?.elems?.find((x) => x.root)?.label, cadence: frameCadence(focus.rec), motion: focus.motion, transition: transition(await ring.evaluate(readTransition)), hiddenUntilHover };
  el.long.push(...focus.long.map((l) => ({ moment: 'focus', ...l })));
  await pseudo.clear(ids);
  return { el };
};

// ---------- toggles (only with --interact) ----------

// Clicks the very node that was chosen (never "the nth toggle": a list that reorders would hand the
// second click to another item), after checking again that it is still attached and still safe.
const clickToggle = async (handle) => {
  if (!(await handle.evaluate((n) => n.isConnected))) throw new Error('the control left the page');
  const refused = await denied(handle);
  if (refused) throw new Error(`no longer safe to click (${refused})`);
  await handle.evaluate((n) => n.click());
};

// Indices of the toggles that may be clicked: reachable, enabled and not on the denylist.
export const eligibleToggles = async (page) => {
  const handles = await page.$$(TOGGLE);
  const eligible = [];
  const skipped = [];
  for (const [i, h] of handles.entries()) {
    const refused = await denied(h);
    if (refused) { skipped.push({ index: i, reason: 'denied' }); continue; }
    const reach = await h.evaluate((n) => { const r = n.getBoundingClientRect(); const c = getComputedStyle(n); return !n.disabled && c.display !== 'none' && c.visibility !== 'hidden' && r.width > 1 && r.height > 1; });
    if (reach) eligible.push(i); else skipped.push({ index: i, reason: 'hidden' });
  }
  return { eligible, skipped };
};

// Clicks a toggle, learns how long its motion lasts, then clicks the reverse at the middle of that
// motion in both directions and looks for a restart. The number of clicks is always even, so the
// control ends in the state it started in.
export const probeToggle = async (ctx, index) => {
  const { page, url } = ctx;
  await load(page, url, ctx.loadOptions);
  const handle = (await page.$$(TOGGLE))[index];
  if (!handle) return { label: null };
  const label = await handle.evaluate((n) => n.tagName.toLowerCase() + (n.id ? `#${n.id}` : '') + ` "${(n.getAttribute('aria-label') || n.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)}"`);
  if (await denied(handle)) return { label: null };
  let clicks = 0;
  const click = async () => { await clickToggle(handle); clicks++; };
  const run = async (steps) => {
    const hint = await handle.evaluateHandle((n) => document.getElementById(n.getAttribute('aria-controls') || ''));
    await page.evaluate(([h]) => window.__mt.begin('p', null, true, h), [hint]);
    // 'settle' waits until the toggle and the element it controls are still; a number waits that many ms.
    for (const s of steps) {
      if (s === 'click') await click();
      else if (s === 'settle') await settle(handle, { min: TOGGLE_SETTLE_MIN_MS, quiet: TOGGLE_QUIET_MS });
      else await wait(page, s);
    }
    return page.evaluate(() => window.__mt.end('p'));
  };
  const moved = (rec) => analyzeRecording(rec).flatMap((e) => e.moves.filter((m) => m.firstT >= rec.marks[0] - 2 * FRAME_MS));
  const jumps = [];
  // What the reversals could not decide, and whether a jump seen was a clear step in frame-by-frame sampling.
  let sighted = false;
  let dense = true;
  let unsure = null;
  let cadence = null;
  let coverage = { ran: true, mark: null, moves: [] };
  let dur = 0;
  try {
    const first = await run(['click', 'settle']);
    dur = Math.max(0, ...moved(first).map((m) => m.durationMs));
    if (dur >= TOGGLE_MIN_MOTION_MS) {
      const check = (rec, direction) => {
        if (rec.marks.length < 2) return;
        const mark = rec.marks.at(-1);
        const found = interruptionJumps(rec, mark, { durationMs: dur });
        const around = markCadence(rec, mark);
        for (const j of found) jumps.push({ ...j, direction, cadence: around });
        if (found.length) { sighted = true; if (!isDense(around)) dense = false; } else unsure ??= restartUnfollowed(rec, mark);
        cadence ??= around;
        coverage = mergeCoverage(coverage, coverageOf(analyzeRecording(rec), { mark: around }));
      };
      await run(['click', 'settle']); // back to the starting state
      for (const share of TOGGLE_SHARES) {
        const half = Math.max(50, Math.round(dur * share));
        check(await run(['click', half, 'click', 'settle']), 'opening'); // opening, reversed part-way
        check(await run(['click', 'settle', 'click', half, 'click', 'settle']), 'closing'); // closing, reversed part-way
        await run(['click', 'settle']); // closed again
      }
    } else await run(['click', 'settle']); // no motion: still return to the starting state
  } catch (e) {
    coverage = { ...coverage, ran: false };
    ctx.notes.push(`toggle ${label} stopped: ${e.message.split('\n')[0]}`);
  } finally {
    if (clicks % 2) await click().catch((e) => ctx.notes.push(`could not restore toggle ${label}: ${e.message.split('\n')[0]}`));
  }
  jumps.sort((x, y) => y.delta - x.delta);
  const sightings = [...new Map(jumps.map((j) => [`${j.label}|${j.prop}`, { label: j.label, prop: j.prop, dense: sighted && dense, cadence: j.cadence }])).values()];
  return { label, dur, jumps, sightings, coverage, unsure, cadence, dense: sighted && dense };
};

// ---------- --click <selector> ----------

// Everything that moves for 1.5 s after a real click, with the tracer off for the long-frame pass
// (tracing hundreds of nodes would itself overrun the frames it times) and on for the trajectories.
// The jumps seen in a recording, with how clear each was (whatever drives the motion).
export const jumpSightingsOf = (moved) => moved.flatMap((e) => e.moves.filter((m) => m.jumps.length).map((m) => ({ label: e.label, prop: m.prop, dense: isDense(m.cadence), cadence: m.cadence })));

// The cadence of the step a click's jump check could not decide, or null: only script-driven motion (the browser
// says a CSS transition or animation is one, and no teleport) whose step fell in intervals too long to judge.
export const clickUnsure = (moved) => moved.flatMap((e) => e.moves)
  .filter((m) => m.unresolved).sort((a, b) => b.cadence.max - a.cadence.max)[0]?.cadence ?? null;

// Median and longest interval between the frames recorded after the click: how well the recording could follow a value.
// Median and longest interval (ms) between the frames of a recording from `from` on: how well it could follow a value.
export const frameCadence = (rec, from = -Infinity) => {
  const frames = [...new Set((rec?.elems ?? []).flatMap((e) => e.t))].filter((x) => x >= from).sort((a, b) => a - b);
  const dts = frames.slice(1).map((x, i) => x - frames[i]);
  return dts.length ? { median: Math.round(median(dts)), max: Math.round(Math.max(...dts)) } : null;
};
export const recordingCadence = (rec) => frameCadence(rec, (rec.marks[0] ?? 0) - 2 * FRAME_MS);

// One press of the target and the recording of what follows it: `trace` records the trajectories, otherwise only the long frames.
// Each call presses the target once (twice with `interrupt`): the press budget of --click is counted in calls. `.press()` is a bare
// press, used to restore the state a target keeps (server side, storage) when the count of presses ended odd.
const REQUEST_TYPES = new Set(['fetch', 'xhr', 'ping', 'other']);
const pageAttempt = (ctx, selector, interrupt) => {
  const { page, url } = ctx;
  // Each attempt reloads the page: a request the last press started and that has not finished is lost with it, and so is a timer that
  // would send one later, so the state the target keeps may differ from the press count. Pending requests are said; timers cannot be seen.
  const pending = new Set();
  const started = (r) => { if (REQUEST_TYPES.has(r.resourceType())) pending.add(r); };
  const ended = (r) => pending.delete(r);
  page.on('request', started);
  page.on('requestfinished', ended);
  page.on('requestfailed', ended);
  let warned = false;
  const beforeReload = () => {
    if (pending.size && !warned) {
      warned = true;
      ctx.notes.push(`click ${selector}: ${pending.size} request(s) were still pending when the page was reloaded for the next press: their effect may not have landed, so the state the target keeps may not be restored`);
    }
  };
  const attempt = async (trace) => {
    beforeReload();
    await load(page, url, ctx.loadOptions);
    const target = await page.$(selector);
    if (!target) return { missing: 'matches nothing' };
    const point = await reachablePoint(target);
    if (!point) return { missing: 'is covered by another element or not visible' };
    const hint = await target.evaluateHandle((n) => document.getElementById(n.getAttribute('aria-controls') || ''));
    if (trace) await page.evaluate(([h]) => window.__mt.begin('c', null, true, h), [hint]);
    const from = await page.evaluate(() => window.__mt.now());
    await wait(page, CLICK_LEAD_MS);
    await page.mouse.click(point.x, point.y);
    // The second click is dispatched on the element itself: an overlay opened by the first one
    // (a drawer over its own trigger) would otherwise receive it.
    if (interrupt) { await wait(page, CLICK_INTERRUPT_MS); await target.evaluate((n) => n.click()); }
    await wait(page, CLICK_RECORD_MS);
    const loaf = await page.evaluate(() => window.__mt.loaf);
    return { from, loaf, rec: trace ? await page.evaluate(() => window.__mt.end('c')) : null };
  };
  attempt.release = () => { page.off('request', started); page.off('requestfinished', ended); page.off('requestfailed', ended); };
  attempt.press = async () => {
    beforeReload();
    await load(page, url, ctx.loadOptions);
    const target = await page.$(selector);
    const point = target && (await reachablePoint(target));
    if (point) await page.mouse.click(point.x, point.y);
    return Boolean(point);
  };
  return attempt;
};
export const clickMeasurer = (ctx, selector, interrupt, makeAttempt = pageAttempt) => {
  const { page } = ctx;
  const pressing = makeAttempt(ctx, selector, interrupt);
  let presses = 0;
  const attempt = async (trace) => {
    const done = await pressing(trace);
    if (!done.missing) presses += interrupt ? 2 : 1;
    return done;
  };
  // `retries`: how many more recordings a step too coarse to judge may cost (each presses the target again). The measurement itself
  // re-records for nothing else: a recording with no unresolved motion costs exactly two presses (four with --interrupt). The caller
  // (audit.mjs) re-measures with `retries` 0 to confirm a flaky aspect, and `restore` ends the run in the state it began in.
  const measure = async (retries = CLICK_RESOLVE_RETRIES) => {
    const quiet = await attempt(false);
    if (quiet.missing) return quiet;
    // What was already moving before the click (loops, carousels) is ambient, not the click's motion: a motion
    // that starts after the click, or that has come to rest. A loop sampled with a long first interval looks
    // like it starts after the click, but it never rests.
    const analyze = (t) => {
      const clickT = t.rec.marks[0] ?? Infinity;
      return analyzeRecording(t.rec, { longFrames: longWindows(t.loaf, t.from, unattributedLimit(page)) }).map((e) => ({ ...e, moves: e.moves.filter((m) => m.firstT >= clickT - 2 * FRAME_MS && (m.settled || m.startT >= clickT - 2 * FRAME_MS)) })).filter((e) => e.moves.length);
    };
    let traced2 = await attempt(true);
    if (traced2.missing) return traced2;
    let moved = analyze(traced2);
    // A step that only a frame too long to judge keeps from being a jump is recorded again: a machine that
    // drops frames rarely drops the same one every time.
    for (let again = 0; again < retries && !moved.some((e) => e.moves.some((m) => m.jumps.length)) && moved.some((e) => e.moves.some((m) => m.unresolved)); again++) {
      const next = await attempt(true);
      if (next.missing) break;
      traced2 = next;
      moved = analyze(traced2);
    }
    const rec = traced2.rec;
    const interruptJumps = interrupt && rec.marks.length > 1 ? interruptionJumps(rec, rec.marks[1], { durationMs: CLICK_INTERRUPT_MS * 2, small: true, longFrames: longWindows(traced2.loaf, traced2.from, unattributedLimit(page)) }) : [];
    return {
      moved,
      long: longFramesBetween(quiet.loaf, quiet.from, Infinity, unattributedLimit(page)),
      // A step the frames were too sparse to judge, with no jump found in any recording: the check is undecided.
      unsure: clickUnsure(moved, rec),
      cadence: recordingCadence(rec),
      // What this recording could see of each motion, and the jumps of script-driven motions (a CSS transition that cannot
      // teleport is never left undecided) with how clear each was.
      coverage: coverageOf(moved, { mark: rec.marks.length > 1 ? markCadence(rec, rec.marks[1]) : null }),
      jumpSightings: jumpSightingsOf(moved),
      jumps: moved.flatMap((e) => e.moves.flatMap((m) => m.jumps.map((j) => ({ label: e.label, prop: m.prop, ...j })))),
      layout: moved.flatMap((e) => e.moves.filter((m) => /^layout/.test(m.prop) && animatedMove(m)).map((m) => ({ label: e.label, prop: m.prop, durationMs: m.durationMs }))),
      interrupt: interruptJumps,
      // The second click could not be judged (a restart the frames cannot follow), and how clear a sighting was.
      interruptUnsure: interrupt && rec.marks.length > 1 && !interruptJumps.length ? restartUnfollowed(rec, rec.marks[1]) : null,
      interruptSightings: interruptJumps.map((j) => { const around = rec.marks.length > 1 ? markCadence(rec, rec.marks[1]) : null; return { label: j.label, prop: j.prop, dense: isDense(around), cadence: around }; }),
      mounted: rec.mounted,
    };
  };
  measure.presses = () => presses;
  // Without --interrupt a retry is one press: an odd count leaves a target that keeps state (a drawer opened server side) toggled,
  // so it is pressed once more. With --interrupt every recording presses twice and the count is even.
  measure.restore = async () => {
    const pressed = !interrupt && presses % 2 === 1 && pressing.press ? await pressing.press() : false;
    if (pressed) presses++;
    pressing.release?.();
    return pressed;
  };
  return measure;
};

// ---------- reduced motion ----------

export const reducedPass = async (ctx, targets) => {
  const { context, url } = ctx;
  const page = await auxPage(context, { session: true });
  let pseudo = null;
  try {
    await page.setViewportSize(ctx.viewport ?? VIEWPORT);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await load(page, url, ctx.loadOptions);
    pseudo = await createPseudoStates(page.context(), page);
    const per = new Map();
    for (const { path, real, label } of targets) {
      const h = await page.$(path);
      if (!h || !(await h.isVisible())) continue;
      // The path (nth-of-type) may name another element after a reload: it is pressed only when it is the
      // control that was audited, still safe, and the one under the pointer.
      const found = await h.evaluate(describeElement);
      if (found !== label) { ctx.notes.push(`reduced-motion pass skipped ${label}: the path now leads to ${found}`); continue; }
      const refused = real ? await denied(h) : null;
      if (refused) { ctx.notes.push(`reduced-motion pass skipped ${label}: no longer safe to press (${refused})`); continue; }
      const point = await reachablePoint(h);
      if (!point) { ctx.notes.push(`reduced-motion pass skipped ${label}: covered by another element`); continue; }
      const T = ['transform', 'translate', 'scale', 'rotate'];
      const rest = await snapshot(h, T);
      await page.mouse.move(point.x, point.y);
      await settle(h);
      let ids = null;
      if (real) { await guardPress(page, true); await page.mouse.down(); } else ids = await pseudo.force(h, ['hover', 'active']);
      await settle(h);
      const pressed = await snapshot(h, T);
      if (real) await releasePress(page, h); else { await pseudo.clear(ids); await page.mouse.move(1, 1); }
      await settle(h);
      const released = await snapshot(h, T);
      per.set(path, { moves: reducedMoves(rest, pressed), residue: reducedResidue(rest, released) });
    }
    await page.evaluate(scrollPass, { step: 400, stepMs: 60, tail: 600, maxScrollers: 5 });
    const hidden = await page.evaluate(invisibleContent);
    const infinite = await page.evaluate(infiniteAnimations, { spinnerPx: REDUCED_LOOP_SPINNER_PX });
    return { per, hidden, infinite };
  } finally {
    await pseudo?.detach();
    await page.close();
  }
};

// ---------- contact sheet ----------

// One frame after another through hover, press and release, each with the time it really was taken.
export const contactSheet = async (ctx, selector, out) => {
  const { page, context, pseudo, url } = ctx;
  await load(page, url, ctx.loadOptions);
  const h = await page.$(selector);
  if (!h) return null;
  await h.scrollIntoViewIfNeeded();
  const box = await h.boundingBox();
  if (!box) return null;
  const clip = { x: Math.max(0, box.x - 16), y: Math.max(0, box.y - 16), width: box.width + 32, height: box.height + 32 };
  const shots = [];
  const t0 = Date.now();
  const take = async (tag) => { const data = (await page.screenshot({ clip })).toString('base64'); shots.push({ data, at: Date.now() - t0, tag }); };
  const burst = async (n, tag) => { for (let i = 0; i < n; i++) { await wait(page, CONTACT_SHEET_STEP_MS); await take(i === 0 ? tag : ''); } };
  await take('rest');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await burst(8, 'hover');
  const ids = await pseudo.force(h, ['hover', 'active']);
  await burst(5, 'press');
  await pseudo.clear(ids);
  await page.mouse.move(1, 1);
  await burst(6, 'out');
  const sheet = await auxPage(context);
  try {
    await sheet.setViewportSize({ width: 1200, height: 200 });
    await sheet.setContent(`<body style="margin:0;background:#888;display:flex;flex-wrap:wrap;gap:4px;padding:4px">${shots.map((s) => `<figure style="margin:0;font:10px sans-serif;color:#fff"><img src="data:image/png;base64,${s.data}"><figcaption>${s.at} ms${s.tag ? ` ${s.tag}` : ''}</figcaption></figure>`).join('')}</body>`);
    const file = join(out, `${selector.replace(/[^\w-]+/g, '_').slice(0, 60)}.png`);
    await sheet.screenshot({ path: file, fullPage: true });
    return file;
  } finally {
    await sheet.close();
  }
};
