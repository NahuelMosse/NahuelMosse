// Tests of the Magic UI ports (animated-list, animated-beam, bento-grid, animated-circular-progress-bar,
// apple-activity-card, magic-card, number-ticker, marquee), each against its demo page: it mounts, answers
// to the mouse and the keyboard, ends in the right state, keeps the values of the original it was ported
// from, does less (never nothing) with reduced motion, spills nothing out of its container, throws on bad
// input, leaves no node behind after destroy() and writes no console error.
import { test as base, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const BASE = process.env.MU_URL ?? `http://127.0.0.1:${process.env.MU_PORT ?? 8761}/motion`;
// WCAG 2.2 AA: axe leaves `target-size` (2.5.8) off unless asked.
const AXE_OPTIONS = { resultTypes: ['violations'], rules: { 'target-size': { enabled: true } } };
const axeFile = (() => { try { return createRequire(import.meta.url).resolve('axe-core/axe.min.js'); } catch { return process.env.AXE_CORE ?? null; } })();

const test = base.extend({
  page: async ({ page }, use, info) => {
    const errors = [];
    // axe fetches the page's stylesheets itself and resolves their relative urls against the page, not the sheet.
    const axeNoise = info.title.startsWith('axe:') ? /Failed to load resource|Couldn't load preload assets/ : null;
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !axeNoise?.test(m.text())) errors.push(`${m.type()}: ${m.text()}`); });
    await use(page);
    expect(errors, 'console errors').toEqual([]);
  },
});

const open = async (page, name, { dark = false } = {}) => {
  await page.goto(`${BASE}/${name}.html${dark ? '?theme=dark' : ''}`);
  await page.waitForLoadState('networkidle');
};
const wait = (page, ms) => page.waitForTimeout(ms);
const num = (text) => Number(String(text).replace(/[^\d,-]/g, '').replace(',', '.'));
const scale = (el) => el.evaluate((n) => new DOMMatrix(getComputedStyle(n).transform).a);
const ty = (el) => el.evaluate((n) => new DOMMatrix(getComputedStyle(n).transform).f);

// Everything visible and not decorative inside `root` that sticks out of its rect.
const spill = (page, rootSelector, skip = '[aria-hidden="true"]') => page.evaluate(([root, skip]) => {
  const r = document.querySelector(root).getBoundingClientRect();
  const out = [];
  for (const n of document.querySelectorAll(`${root} *`)) {
    if (n.closest(skip) || n.matches(skip)) continue;
    const s = getComputedStyle(n);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) continue;
    const b = n.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    if (b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1) out.push(`${n.tagName}.${n.className} ${Math.round(b.left - r.left)},${Math.round(b.top - r.top)} ${Math.round(b.width)}x${Math.round(b.height)} in ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return out;
}, [rootSelector, skip]);

// A fresh element mounted by the test, then destroyed: what it leaves is what the page had to begin with.
const roundTrip = (page, module, html, opts = {}, tag = 'div') => page.evaluate(async ([module, html, opts, tag]) => {
  const norm = (el) => { const c = el.cloneNode(true); for (const n of [c, ...c.querySelectorAll('*')]) for (const a of ['class', 'style']) if (n.getAttribute(a) === '') n.removeAttribute(a); return c.outerHTML; };
  const { mount } = await import(`/motion/${module}.js`);
  const host = document.createElement('div');
  host.style.cssText = 'width: 640px; height: 320px; position: relative';
  const el = document.createElement(tag);
  el.innerHTML = html;
  host.append(el);
  document.body.prepend(host);
  const before = norm(el);
  const handle = mount(el, opts);
  await new Promise((r) => setTimeout(r, 400));
  handle.destroy();
  await new Promise((r) => setTimeout(r, 50));
  const after = norm(el);
  const left = [...el.querySelectorAll('[class*="mu-"]')].length + (el.className.includes('mu-') ? 1 : 0);
  const running = document.getAnimations().filter((a) => el.contains(a.effect?.target)).length;
  host.remove();
  return { same: before === after, before, after, left, running };
}, [module, html, opts, tag]);

const axe = (name, dark) => test(`axe: ${name} · ${dark ? 'dark' : 'light'} has no serious or critical violations`, async ({ page }) => {
  test.skip(!axeFile, 'axe-core is not installed: set AXE_CORE to its axe.min.js');
  await open(page, name, { dark });
  await page.addScriptTag({ path: axeFile });
  await wait(page, 1500);
  await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)));
  await wait(page, 150);
  const found = await page.evaluate(async (options) => {
    const { violations } = await window.axe.run(document, options);
    return violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`) }));
  }, AXE_OPTIONS);
  expect(found, JSON.stringify(found, null, 1)).toEqual([]);
});
for (const name of ['animated-list', 'animated-beam', 'animated-circular-progress-bar', 'apple-activity-card', 'magic-card', 'number-ticker', 'marquee', 'bento-grid']) for (const dark of [false, true]) axe(name, dark);

// ── animated-list ──

test.describe('animated-list', () => {
  test('arrives one card a second, the newest on top, as a log', async ({ page }) => {
    await open(page, 'animated-list');
    const list = page.locator('#recent');
    await expect(list).toHaveAttribute('role', 'log');
    await expect(list.locator('.mu-list__item')).toHaveCount(1);
    await wait(page, 2300);
    const { n, first, last } = await list.evaluate((l) => { const texts = [...l.querySelectorAll('.mu-list__item .mu-notice__text')].map((t) => t.textContent); return { n: texts.length, first: texts[0], last: texts.at(-1) }; });
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(4);
    const expected = ['Transferencia de $ 184.500 · Ferretería Alvear', 'A-0004-00001284 · Estudio Quiroga', 'Bodega Los Álamos se sumó a tu cartera', 'Taller Morán · 15 días de atraso'];
    expect(first).toBe(expected[n - 1]);
    expect(last).toBe(expected[0]);
  });

  test('a card enters from scale 0 on the original spring (350 / 40) and the others slide down with it', async ({ page }) => {
    await open(page, 'animated-list');
    const seen = await page.evaluate(() => new Promise((resolve) => {
      const list = document.getElementById('recent');
      const io = new MutationObserver(() => {
        const items = [...list.querySelectorAll('.mu-list__item')];
        if (items.length < 2) return;
        io.disconnect();
        const enter = items[0].getAnimations()[0];
        const slide = items[1].getAnimations()[0];
        const t = enter.effect.getTiming();
        resolve({ easing: t.easing, duration: t.duration, from: enter.effect.getKeyframes()[0], slide: slide?.effect.composite, slideKeyframe: slide?.effect.getKeyframes()[0].transform, origin: getComputedStyle(items[0]).transformOrigin, width: items[0].offsetWidth, list: list.clientWidth });
      });
      io.observe(list, { childList: true });
    }));
    expect(seen.easing).toMatch(/^linear\(0[ ,]/);
    expect(seen.duration).toBeGreaterThan(300);
    expect(seen.duration).toBeLessThan(1200);
    expect(seen.from.transform).toBe('scale(0)');
    expect(Number(seen.from.opacity)).toBe(0);
    expect(seen.slide).toBe('add');
    expect(seen.slideKeyframe).toMatch(/^translateY\(-?[\d.]+px\)$/);
    expect(seen.origin.split(' ')[1]).toBe('0px');
    expect(seen.width).toBe(seen.list - 16);
  });

  test('the cards are 400 px at most, centered, with a 16 px gap and nothing spills out of the list', async ({ page }) => {
    await open(page, 'animated-list');
    await wait(page, 2500);
    const boxes = await page.locator('#recent .mu-notice').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.top, r.bottom]; }));
    for (const [w] of boxes) expect(w).toBeLessThanOrEqual(400.5);
    await wait(page, 800);
    const settled = await page.locator('#recent .mu-list__item').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.top, r.bottom]; }));
    for (let i = 1; i < settled.length; i++) expect(Math.abs(settled[i][0] - settled[i - 1][1] - 16)).toBeLessThan(1.5);
    expect(await spill(page, '#recent')).toEqual([]);
  });

  test('a card grows to 103 % under the mouse', async ({ page }) => {
    await open(page, 'animated-list');
    const total = await page.evaluate(async () => (await import('/motion/mu-demo.js')).activity.length);
    await expect.poll(() => page.evaluate(() => { const r = document.getElementById('recent'); return r.querySelectorAll('.mu-list__item').length; }), { timeout: 15_000 }).toBe(total);
    await expect.poll(() => page.evaluate(() => document.getElementById('recent').getAnimations({ subtree: true }).length), { timeout: 5000 }).toBe(0);
    const card = page.locator('#recent .mu-notice').nth(1);
    const box = await card.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => scale(card), { timeout: 2000 }).toBeCloseTo(1.03, 2);
    await page.mouse.move(0, 0);
    await expect.poll(() => scale(card), { timeout: 2000 }).toBeCloseTo(1, 2);
  });

  test('a card with a link grows and rings under keyboard focus, and Enter follows the link', async ({ page }) => {
    await open(page, 'animated-list');
    await page.locator('#simulate').focus();
    await page.keyboard.press('Tab');
    const link = page.locator('#live .mu-notice__link').first();
    await expect(link).toBeFocused();
    const card = page.locator('#live .mu-notice').first();
    await wait(page, 320);
    expect(await scale(card)).toBeCloseTo(1.03, 2);
    expect(await card.evaluate((n) => [getComputedStyle(n).outlineStyle, getComputedStyle(n).outlineWidth])).toEqual(['solid', '2px']);
    await page.keyboard.press('Enter');
    expect(new URL(page.url()).hash).toBe('#cobros');
    expect(await link.evaluate((n) => { const r = n.getBoundingClientRect(); const c = n.closest('.mu-notice').getBoundingClientRect(); const a = getComputedStyle(n, '::after'); return [a.position, a.content, Math.abs(r.left - c.left) < 200]; })).toEqual(['absolute', '""', true]);
  });

  test('add() puts a card on top at once and max retires the oldest with the exit of the original', async ({ page }) => {
    await open(page, 'animated-list');
    const live = page.locator('#live');
    await expect(live.locator('.mu-list__item')).toHaveCount(1);
    for (let i = 0; i < 6; i++) await page.locator('#simulate').click();
    await expect(live.locator('.mu-list__item')).toHaveCount(5, { timeout: 3000 });
    expect(await live.locator('.mu-notice__time').first().textContent()).toBe('ahora');
  });

  test('every card passes the contrast of AA for its title, time and detail in light and dark', async ({ page }) => {
    for (const dark of [false, true]) {
      await open(page, 'animated-list', { dark });
      await wait(page, 1200);
      const ratios = await page.evaluate(() => {
        const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const cv = document.createElement('canvas'); cv.width = cv.height = 1;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        const rgb = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data]; };
        const stage = getComputedStyle(document.querySelector('.mu-demo__stage')).backgroundColor;
        const out = {};
        for (const sel of ['.mu-notice__title span:first-child', '.mu-notice__time', '.mu-notice__text']) {
          const fg = rgb(getComputedStyle(document.querySelector(`#recent ${sel}`)).color);
          const bg = rgb(stage);
          const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
          out[sel] = (a + 0.05) / (b + 0.05);
        }
        return out;
      });
      for (const [sel, ratio] of Object.entries(ratios)) expect(ratio, `${sel} ${dark ? 'dark' : 'light'}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('destroy() puts the children back and leaves nothing', async ({ page }) => {
    await open(page, 'animated-list');
    const r = await roundTrip(page, 'animated-list', '<p>uno</p><p>dos</p><p>tres</p>', { delay: 50 });
    expect(r.after).toBe(r.before);
    expect(r.left).toBe(0);
  });
});

test.describe('animated-list with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('cards fade in 120 ms and do not travel', async ({ page }) => {
    await open(page, 'animated-list');
    const seen = await page.evaluate(() => new Promise((resolve) => {
      const list = document.getElementById('recent');
      const io = new MutationObserver(() => {
        const items = [...list.querySelectorAll('.mu-list__item')];
        if (items.length < 2) return;
        io.disconnect();
        const a = items[0].getAnimations();
        resolve({ n: a.length, duration: a[0]?.effect.getTiming().duration, props: Object.keys(a[0]?.effect.getKeyframes()[0] ?? {}), shift: items[1].getAnimations().length });
      });
      io.observe(list, { childList: true });
    }));
    expect(seen.n).toBe(1);
    expect(seen.duration).toBe(120);
    expect(seen.props).not.toContain('transform');
    expect(seen.props).toContain('opacity');
    expect(seen.shift).toBe(0);
  });
});

// ── animated-beam ──

test.describe('animated-beam', () => {
  test('draws a track and a light between the centers of each pair of nodes', async ({ page }) => {
    await open(page, 'animated-beam');
    const hub = page.locator('#hub');
    await expect(hub.locator('.mu-beam__track')).toHaveCount(4);
    await expect(hub.locator('.mu-beam__light')).toHaveCount(4);
    const geometry = await page.evaluate(() => {
      const el = document.getElementById('hub');
      const c = el.getBoundingClientRect();
      const center = (id) => { const r = el.querySelector(`[data-beam-node="${id}"]`).getBoundingClientRect(); return [r.left - c.left + r.width / 2, r.top - c.top + r.height / 2]; };
      return [['banco', 'ledger'], ['afip', 'ledger'], ['ledger', 'mail'], ['ledger', 'planilla']].map(([a, b], i) => {
        const d = el.querySelectorAll('.mu-beam__track')[i].getAttribute('d');
        const m = /M ([\d.-]+),([\d.-]+) Q ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/.exec(d).slice(1).map(Number);
        const [sx, sy] = center(a);
        const [ex, ey] = center(b);
        return { start: [m[0] - sx, m[1] - sy], end: [m[4] - ex, m[5] - ey], control: [m[2] - (sx + ex) / 2, m[3] - sy] };
      });
    });
    for (const g of geometry) for (const v of [...g.start, ...g.end, ...g.control]) expect(Math.abs(v)).toBeLessThan(1);
    const svg = hub.locator('.mu-beam__svg');
    await expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(await svg.evaluate((n) => getComputedStyle(n).pointerEvents)).toBe('none');
  });

  test('keeps the original values: 2 px lines at 0.2 opacity under a gradient with four stops, 32.5 % for the second color', async ({ page }) => {
    await open(page, 'animated-beam');
    const v = await page.evaluate(() => {
      const t = getComputedStyle(document.querySelector('#hub .mu-beam__track'));
      const l = getComputedStyle(document.querySelector('#hub .mu-beam__light'));
      const g = document.querySelector('#hub linearGradient');
      return { tw: t.strokeWidth, to: t.strokeOpacity, lw: l.strokeWidth, cap: t.strokeLinecap, stops: [...g.querySelectorAll('stop')].map((s) => [s.getAttribute('offset'), s.getAttribute('stop-opacity')]), units: g.getAttribute('gradientUnits') };
    });
    expect(v.tw).toBe('2px');
    expect(v.lw).toBe('2px');
    expect(Number(v.to)).toBeCloseTo(0.2, 2);
    expect(v.cap).toBe('round');
    expect(v.units).toBe('userSpaceOnUse');
    expect(v.stops).toEqual([[null, '0'], [null, null], ['32.5%', null], ['100%', '0']]);
  });

  test('the light runs across the line with easeOutExpo: fast at first, then slow, and starts over every 3 s', async ({ page }) => {
    await open(page, 'animated-beam');
    test.setTimeout(30_000);
    const series = await page.evaluate(() => new Promise((resolve) => {
      const g = document.querySelector('#hub linearGradient');
      const w = document.getElementById('hub').clientWidth;
      const out = [];
      const t0 = performance.now();
      const tick = () => {
        out.push([performance.now() - t0, Number(g.getAttribute('x2')) / w]);
        if (performance.now() - t0 < 6800) requestAnimationFrame(tick); else resolve(out);
      };
      tick();
    }));
    const restarts = series.slice(1).filter(([, x], i) => x - series[i][1] < -0.5).map(([t]) => t);
    expect(restarts.length).toBeGreaterThanOrEqual(2);
    expect(Math.abs(restarts[1] - restarts[0] - 3000)).toBeLessThan(150);
    const at = (t) => series.find(([s]) => s >= t)[1];
    const [r] = restarts;
    expect(at(r + 3000 - 100)).toBeGreaterThan(0.99);
    const earlyGain = at(r + 500) - at(r + 20);
    const lateGain = at(r + 2500) - at(r + 2000);
    expect(earlyGain).toBeGreaterThan(0.5);
    expect(earlyGain).toBeGreaterThan(lateGain * 10);
  });

  test('a reverse beam runs right to left', async ({ page }) => {
    await open(page, 'animated-beam');
    const xs = await page.evaluate(() => new Promise((resolve) => {
      const g = document.querySelectorAll('#curve linearGradient')[1];
      const out = [];
      const t0 = performance.now();
      const tick = () => {
        out.push(Number(g.getAttribute('x1')));
        if (performance.now() - t0 < 2200) requestAnimationFrame(tick); else resolve(out);
      };
      tick();
    }));
    const moving = xs.filter((x) => x !== xs[0]);
    expect(moving.length).toBeGreaterThan(10);
    expect(moving[moving.length - 1]).toBeLessThan(moving[0]);
    const w = await page.locator('#curve').evaluate((n) => n.clientWidth);
    expect(xs[xs.length - 1]).toBeLessThan(w * 0.5);
  });

  test('paths follow the container when it is resized', async ({ page }) => {
    await open(page, 'animated-beam');
    const d0 = await page.locator('#hub .mu-beam__track').first().getAttribute('d');
    await page.setViewportSize({ width: 560, height: 900 });
    await wait(page, 300);
    const d1 = await page.locator('#hub .mu-beam__track').first().getAttribute('d');
    expect(d1).not.toBe(d0);
    const w = await page.locator('#hub').evaluate((n) => n.clientWidth);
    expect(Number(await page.locator('#hub .mu-beam__svg').getAttribute('width'))).toBe(w);
    expect(await spill(page, '#hub')).toEqual([]);
  });

  test('stops while the tab is hidden and resumes when it shows again', async ({ page }) => {
    await open(page, 'animated-beam');
    const run = () => page.evaluate(async () => (await import('/motion/animated-beam.js')).mount(document.getElementById('hub')).running);
    expect(await run()).toBe(true);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(await run()).toBe(false);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(await run()).toBe(true);
  });

  test('is a labelled group, every node has a name and the names do not spill', async ({ page }) => {
    await open(page, 'animated-beam');
    await expect(page.locator('#hub')).toHaveAttribute('role', 'group');
    for (const id of ['banco', 'afip', 'ledger', 'mail', 'planilla']) await expect(page.locator(`#hub [data-beam-node="${id}"]`)).toHaveAttribute('aria-label', /.+/);
    expect(await spill(page, '#hub')).toEqual([]);
    expect(await page.locator('#hub .mu-beam__node--hub').evaluate((n) => n.offsetWidth)).toBe(64);
    expect(await page.locator('#hub [data-beam-node="banco"]').evaluate((n) => n.offsetWidth)).toBe(48);
  });

  test('the colors come from the set and change with the theme', async ({ page }) => {
    await open(page, 'animated-beam');
    const read = () => page.evaluate(() => [getComputedStyle(document.querySelector('#hub .mu-beam__from')).stopColor, getComputedStyle(document.querySelector('#hub .mu-beam__to')).stopColor]);
    const light = await read();
    await open(page, 'animated-beam', { dark: true });
    const dark = await read();
    expect(light[0]).not.toBe(dark[0]);
    expect(light[1]).not.toBe('rgb(0, 0, 0)');
  });

  test('destroy() removes the drawing and leaves nothing', async ({ page }) => {
    await open(page, 'animated-beam');
    const html = '<div data-beam-node="a" style="width:20px;height:20px"></div><div data-beam-node="b" style="width:20px;height:20px"></div>';
    const r = await roundTrip(page, 'animated-beam', html, { beams: [{ from: 'a', to: 'b' }] });
    expect(r.after).toBe(r.before);
    expect(r.left).toBe(0);
  });

  test('rejects a beam that points at a node that is not there by drawing nothing', async ({ page }) => {
    await open(page, 'animated-beam');
    const count = await page.evaluate(async () => {
      const { mount } = await import('/motion/animated-beam.js');
      const el = document.createElement('div');
      el.innerHTML = '<div data-beam-node="a"></div>';
      document.body.append(el);
      const h = mount(el, { beams: [{ from: 'a', to: 'ghost' }] });
      const n = el.querySelectorAll('path').length;
      h.destroy();
      el.remove();
      return n;
    });
    expect(count).toBe(0);
  });
});

test.describe('animated-beam with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the light is parked on the line, fades in 140 ms and nothing runs', async ({ page }) => {
    await open(page, 'animated-beam');
    const g = page.locator('#hub linearGradient').first();
    const a = await g.getAttribute('x1');
    await wait(page, 400);
    expect(await g.getAttribute('x1')).toBe(a);
    expect(Number(a)).toBeGreaterThan(0);
    const w = await page.locator('#hub').evaluate((n) => n.clientWidth);
    expect(Number(a) / w).toBeCloseTo(0.75, 1);
    expect(await page.evaluate(async () => (await import('/motion/animated-beam.js')).mount(document.getElementById('hub')).running)).toBe(false);
  });
});

// ── animated-circular-progress-bar ──

test.describe('animated-circular-progress-bar', () => {
  test('is a progressbar and its arc is the value: 68 % of a circle of radius 45', async ({ page }) => {
    await open(page, 'animated-circular-progress-bar');
    const goal = page.locator('#goal');
    await expect(goal).toHaveAttribute('role', 'progressbar');
    await expect(goal).toHaveAttribute('aria-label', 'Meta de cobro del mes');
    await wait(page, 1300);
    await expect(goal).toHaveAttribute('aria-valuenow', '68');
    await expect(goal.locator('.mu-gauge__digits')).toHaveText('68');
    const arc = await goal.locator('.mu-gauge__arc').evaluate((n) => { const s = getComputedStyle(n); return { dash: s.strokeDasharray, w: s.strokeWidth, r: n.getAttribute('r'), cap: s.strokeLinecap, tf: s.transform }; });
    const [len, gap] = arc.dash.split(',').map((v) => parseFloat(v));
    expect(len).toBeCloseTo(0.68 * 2 * Math.PI * 45, 1);
    expect(gap).toBeCloseTo(2 * Math.PI * 45, 1);
    expect(arc.r).toBe('45');
    expect(arc.w).toBe('10px');
    expect(arc.cap).toBe('round');
    const rest = await goal.locator('.mu-gauge__rest').evaluate((n) => getComputedStyle(n).strokeDasharray);
    expect(parseFloat(rest)).toBeCloseTo(0.22 * 2 * Math.PI * 45, 1);
  });

  test('at 0 % there is no dot at the rounded end of the arc, and it comes back with the first percent', async ({ page }) => {
    await open(page, 'animated-circular-progress-bar');
    const out = await page.evaluate(async () => {
      const { mount } = await import('/motion/animated-circular-progress-bar.js');
      const host = document.createElement('div');
      document.body.prepend(host);
      const gauge = mount(host, { value: 0 });
      await new Promise((r) => setTimeout(r, 1300));
      const arc = host.querySelector('.mu-gauge__arc');
      const empty = { visibility: getComputedStyle(arc).visibility, dash: parseFloat(getComputedStyle(arc).strokeDasharray) };
      gauge.set(40);
      await new Promise((r) => setTimeout(r, 120));
      const filling = getComputedStyle(arc).visibility;
      await new Promise((r) => setTimeout(r, 1200));
      gauge.set(0);
      await new Promise((r) => setTimeout(r, 300));
      const shrinking = getComputedStyle(arc).visibility;
      await new Promise((r) => setTimeout(r, 1200));
      const back = getComputedStyle(arc).visibility;
      gauge.destroy();
      host.remove();
      return { empty, filling, shrinking, back };
    });
    expect(out.empty).toEqual({ visibility: 'hidden', dash: 0 });
    expect(out.filling).toBe('visible');
    expect(out.shrinking).toBe('visible');
    expect(out.back).toBe('hidden');
  });

  test('the track stops 5 % short of both ends of the value, so there is a gap', async ({ page }) => {
    await open(page, 'animated-circular-progress-bar');
    await wait(page, 1300);
    const m = await page.locator('#goal').evaluate((el) => {
      const read = (sel) => new DOMMatrix(getComputedStyle(el.querySelector(sel)).transform);
      const deg = (m) => Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI);
      const r = read('.mu-gauge__rest');
      return { arc: deg(read('.mu-gauge__arc')), restRotation: deg(r), flipped: r.a * r.d - r.b * r.c < 0 };
    });
    expect(m.arc).toBe(-90);
    expect(m.flipped).toBe(true);
    expect(((m.restRotation % 360) + 360) % 360).toBe(252);
  });

  test('moves in one second with the ease curve: the arc and the number are between the old and the new value on the way', async ({ page }) => {
    await open(page, 'animated-circular-progress-bar');
    await wait(page, 1300);
    const goal = page.locator('#goal');
    await page.locator('#more').click();
    await wait(page, 350);
    const mid = await goal.evaluate((n) => ({ dash: parseFloat(getComputedStyle(n.querySelector('.mu-gauge__arc')).strokeDasharray), digits: Number(n.querySelector('.mu-gauge__digits').textContent) }));
    expect(mid.dash / (2 * Math.PI * 45)).toBeGreaterThan(0.69);
    expect(mid.dash / (2 * Math.PI * 45)).toBeLessThan(0.77);
    expect(mid.digits).toBeGreaterThan(68);
    expect(mid.digits).toBeLessThan(78);
    await expect(goal).toHaveAttribute('aria-valuenow', '78');
    await wait(page, 900);
    await expect(goal.locator('.mu-gauge__digits')).toHaveText('78');
    expect(parseFloat(await goal.locator('.mu-gauge__arc').evaluate((n) => getComputedStyle(n).strokeDasharray))).toBeCloseTo(0.78 * 2 * Math.PI * 45, 0);
  });

  test('the value is clamped to its range and the track is gone above 90 %', async ({ page }) => {
    await open(page, 'animated-circular-progress-bar');
    await page.locator('#range').scrollIntoViewIfNeeded();
    await wait(page, 1500);
    const states = page.locator('[data-motion="animated-circular-progress-bar"][data-value]');
    const shown = await states.evaluateAll((els) => els.slice(1).map((e) => ({ v: e.dataset.value, rest: getComputedStyle(e.querySelector('.mu-gauge__rest')).display, now: e.getAttribute('aria-valuenow') })));
    expect(shown.find((s) => s.v === '0').rest).toBe('inline');
    expect(shown.find((s) => s.v === '90').rest).toBe('inline');
    expect(shown.find((s) => s.v === '100').rest).toBe('none');
    const over = await page.evaluate(async () => {
      const { mount } = await import('/motion/animated-circular-progress-bar.js');
      const el = document.createElement('div');
      document.body.append(el);
      const h = mount(el, { value: 250 });
      el.scrollIntoView();
      await new Promise((r) => setTimeout(r, 1500));
      const out = { percent: h.percent, now: el.getAttribute('aria-valuenow') };
      h.destroy();
      el.remove();
      return out;
    });
    expect(over).toEqual({ percent: 100, now: '100' });
  });

  test('a range with its own minimum and maximum', async ({ page }) => {
    await open(page, 'animated-circular-progress-bar');
    await page.locator('#range').scrollIntoViewIfNeeded();
    await wait(page, 1500);
    const r = page.locator('#range');
    await expect(r).toHaveAttribute('aria-valuemin', '20');
    await expect(r).toHaveAttribute('aria-valuemax', '60');
    await expect(r).toHaveAttribute('aria-valuenow', '45');
    await expect(r.locator('.mu-gauge__digits')).toHaveText('63');
  });

  test('refuses a range with no width', async ({ page }) => {
    await open(page, 'animated-circular-progress-bar');
    const msg = await page.evaluate(async () => {
      const { mount } = await import('/motion/animated-circular-progress-bar.js');
      try { mount(document.createElement('div'), { min: 10, max: 10 }); } catch (e) { return `${e.name}: ${e.message}`; }
      return null;
    });
    expect(msg).toMatch(/^RangeError/);
  });

  test('draws at 160 px with the number centered and the percent sign beside it', async ({ page }) => {
    await open(page, 'animated-circular-progress-bar');
    const box = await page.locator('#goal').boundingBox();
    expect(box.width).toBe(160);
    expect(box.height).toBe(160);
    const v = await page.locator('#goal .mu-gauge__value').boundingBox();
    expect(Math.abs(v.x + v.width / 2 - (box.x + 80))).toBeLessThan(2);
    expect(Math.abs(v.y + v.height / 2 - (box.y + 80))).toBeLessThan(2);
    expect(await page.locator('#goal .mu-gauge__value').evaluate((n) => [getComputedStyle(n).fontSize, getComputedStyle(n).fontWeight])).toEqual(['24px', '600']);
    expect(await spill(page, '#goal')).toEqual([]);
  });

  test('destroy() leaves the element as it was', async ({ page }) => {
    await open(page, 'animated-circular-progress-bar');
    const r = await roundTrip(page, 'animated-circular-progress-bar', '', { value: 40 });
    expect(r.after).toBe(r.before);
    expect(r.left).toBe(0);
  });
});

test.describe('animated-circular-progress-bar with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the arc jumps with a 140 ms fade and the number does not count', async ({ page }) => {
    await open(page, 'animated-circular-progress-bar');
    await wait(page, 300);
    const goal = page.locator('#goal');
    expect(await goal.locator('.mu-gauge__arc').evaluate((n) => getComputedStyle(n).transitionDuration)).toBe('0s');
    await page.locator('#more').click();
    const after = await goal.evaluate((n) => ({ digits: n.querySelector('.mu-gauge__digits').textContent, fade: n.querySelector('svg').getAnimations().map((a) => a.effect.getTiming().duration) }));
    expect(after.digits).toBe('78');
    expect(after.fade).toEqual([140]);
  });
});

// ── apple-activity-card ──

test.describe('apple-activity-card', () => {
  test('three rings of 200, 160 and 120 px with a 16 px stroke, each arc the share of its goal', async ({ page }) => {
    await open(page, 'apple-activity-card');
    await wait(page, 1600);
    const rings =await page.locator('#rings .mu-rings__ring').evaluateAll((els) => els.map((e) => {
      const arc = e.querySelector('.mu-rings__arc');
      const s = getComputedStyle(arc);
      const c = parseFloat(arc.getAttribute('stroke-dasharray'));
      return { size: e.querySelector('svg').getBoundingClientRect().width, stroke: s.strokeWidth, share: 1 - parseFloat(s.strokeDashoffset) / c, cap: s.strokeLinecap, opacity: getComputedStyle(e).opacity, track: getComputedStyle(e.querySelector('.mu-rings__track')).strokeWidth };
    }));
    expect(rings.map((r) => r.size)).toEqual([200, 160, 120]);
    for (const r of rings) { expect(r.stroke).toBe('16px'); expect(r.track).toBe('16px'); expect(r.cap).toBe('round'); expect(r.opacity).toBe('1'); }
    expect(rings[0].share).toBeCloseTo(0.73, 2);
    expect(rings[1].share).toBeCloseTo(0.8, 2);
    expect(rings[2].share).toBeCloseTo(0.5, 2);
  });

  test('the rings arrive one after another, 0.1 s apart, and the whole card is drawn in about a second', async ({ page }) => {
    await open(page, 'apple-activity-card');
    const timing = await page.evaluate(() => [...document.querySelectorAll('#rings .mu-rings__ring')].map((ring) => ring.getAnimations().concat(ring.querySelector('.mu-rings__arc').getAnimations()).map((a) => { const t = a.effect.getTiming(); return [t.duration, t.delay, t.easing]; })));
    expect(timing.map((t) => t[0])).toEqual([0, 100, 200].map((d) => [400, d, 'cubic-bezier(0, 0, 0.58, 1)']));
    expect(timing.map((t) => t[1])).toEqual([0, 100, 200].map((d) => [700, d, 'cubic-bezier(0.42, 0, 0.58, 1)']));
    const ends = timing.map((t) => t[1][0] + t[1][1]);
    expect(Math.max(...ends)).toBeGreaterThanOrEqual(800);
    expect(Math.max(...ends)).toBeLessThanOrEqual(1000);
    await wait(page, 150);
    const share = await page.locator('#rings .mu-rings__arc').evaluateAll((els) => els.map((a) => 1 - parseFloat(getComputedStyle(a).strokeDashoffset) / parseFloat(a.getAttribute('stroke-dasharray'))));
    expect(share[0] / 0.73).toBeGreaterThan(share[2] / 0.5);
  });

  test('says its figures: the group has a title, the stage a name with the percentages and the list the goals', async ({ page }) => {
    await open(page, 'apple-activity-card');
    const group = page.locator('#rings');
    await expect(group).toHaveAttribute('role', 'group');
    await expect(group.getByRole('heading', { name: 'Cobranza de octubre' })).toBeVisible();
    await expect(group.locator('.mu-rings__stage')).toHaveAttribute('aria-label', /COBRADAS: 73[\s ]?%, CLIENTES AL DÍA: 80[\s ]?%, CONCILIADOS: 50[\s ]?%/);
    const items = await group.locator('.mu-rings__item').allTextContents();
    expect(items).toEqual(['COBRADAS38/52FAC', 'CLIENTES AL DÍA24/30CLI', 'CONCILIADOS6/12PAGOS']);
    expect(await group.locator('.mu-rings__ring').first().getAttribute('aria-hidden')).toBe('true');
  });

  test('replay() draws it again from nothing', async ({ page }) => {
    await open(page, 'apple-activity-card');
    await wait(page, 1600);
    await page.locator('#replay').click();
    await wait(page, 100);
    const share = await page.locator('#rings .mu-rings__arc').first().evaluate((a) => 1 - parseFloat(getComputedStyle(a).strokeDashoffset) / parseFloat(a.getAttribute('stroke-dasharray')));
    expect(share).toBeLessThan(0.2);
    await wait(page, 1600);
    const done = await page.locator('#rings .mu-rings__arc').first().evaluate((a) => 1 - parseFloat(getComputedStyle(a).strokeDashoffset) / parseFloat(a.getAttribute('stroke-dasharray')));
    expect(done).toBeCloseTo(0.73, 2);
  });

  test('takes its tone from the set and a ring can be a danger', async ({ page }) => {
    await open(page, 'apple-activity-card');
    await wait(page, 500);
    const tones = await page.locator('#two .mu-rings__ring').evaluateAll((els) => els.map((e) => getComputedStyle(e.querySelector('.mu-rings__from')).stopColor));
    const [danger, ok] = await page.evaluate(() => { const c = document.createElement('div'); document.body.append(c); const f = (v) => { c.style.color = `var(${v})`; return getComputedStyle(c).color; }; const r = [f('--danger'), f('--success')]; c.remove(); return r; });
    expect(tones[0]).toBe(danger);
    expect(tones[1]).toBe(ok);
  });

  test('refuses what cannot be drawn', async ({ page }) => {
    await open(page, 'apple-activity-card');
    const errors = await page.evaluate(async () => {
      const { mount } = await import('/motion/apple-activity-card.js');
      const tries = [{ rings: [] }, { rings: [{ label: 'a', current: 1, target: 0 }] }, { rings: [{ label: 'a', current: 1, target: 2, tone: 'pink' }] }, { rings: Array.from({ length: 4 }, () => ({ label: 'a', current: 1, target: 2 })) }];
      return tries.map((o) => { try { mount(document.createElement('div'), o); return 'ok'; } catch (e) { return e.name; } });
    });
    expect(errors).toEqual(['RangeError', 'RangeError', 'RangeError', 'RangeError']);
  });

  test('nothing spills out of the card at 1280 or 390', async ({ page }) => {
    await open(page, 'apple-activity-card');
    await wait(page, 3200);
    expect(await spill(page, '#rings', '[aria-hidden="true"] *')).toEqual([]);
    await page.setViewportSize({ width: 390, height: 800 });
    await wait(page, 200);
    expect(await spill(page, '#rings', '.mu-rings__svg, .mu-rings__svg *')).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('destroy() puts the content back', async ({ page }) => {
    await open(page, 'apple-activity-card');
    const r = await roundTrip(page, 'apple-activity-card', '<p>hola</p>', { title: 'Cobranza', rings: [{ label: 'A', current: 1, target: 2 }] });
    expect(r.after).toBe(r.before);
    expect(r.left).toBe(0);
  });
});

test.describe('apple-activity-card with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the arcs are there at once, only a 140 ms fade plays', async ({ page }) => {
    await open(page, 'apple-activity-card');
    await wait(page, 200);
    const seen = await page.evaluate(() => ({ arcs: document.getAnimations().filter((a) => a.effect.target?.classList?.contains('mu-rings__arc')).length, fade: [...document.querySelectorAll('#rings .mu-rings__stage, #rings .mu-rings__info')].flatMap((n) => n.getAnimations().map((a) => a.effect.getTiming().duration)) }));
    expect(seen.arcs).toBe(0);
    expect(seen.fade.every((d) => d === 140)).toBe(true);
    const share = await page.locator('#rings .mu-rings__arc').first().evaluate((a) => 1 - parseFloat(getComputedStyle(a).strokeDashoffset) / parseFloat(a.getAttribute('stroke-dasharray')));
    expect(share).toBeCloseTo(0.73, 2);
  });
});

// ── magic-card ──

test.describe('magic-card', () => {
  test('the light follows the pointer: --mx and --my are the pointer inside the card', async ({ page }) => {
    await open(page, 'magic-card');
    const card = page.locator('#login');
    const box = await card.boundingBox();
    await page.mouse.move(box.x + 60, box.y + 40);
    await page.mouse.move(box.x + 120, box.y + 90, { steps: 4 });
    await wait(page, 80);
    const at = await card.evaluate((n) => [parseFloat(n.style.getPropertyValue('--mx')), parseFloat(n.style.getPropertyValue('--my'))]);
    expect(Math.abs(at[0] - 120)).toBeLessThan(1.5);
    expect(Math.abs(at[1] - 90)).toBeLessThan(1.5);
  });

  test('the border and the inner light are the original: a 200 px circle, 0.8 opacity, 1 px transparent border over a solid fill', async ({ page }) => {
    await open(page, 'magic-card');
    const card = page.locator('#login');
    const box = await card.boundingBox();
    await page.mouse.move(box.x + 100, box.y + 100);
    await wait(page, 450);
    const v = await card.evaluate((n) => {
      const s = getComputedStyle(n);
      const spot = getComputedStyle(n.querySelector('.mu-magic__spot'));
      const fill = n.querySelector('.mu-magic__fill');
      return { border: s.borderTopWidth, borderColor: s.borderTopColor, bg: s.backgroundImage, spotBg: spot.backgroundImage, spotOpacity: Number(spot.opacity), spotInset: [spot.top, spot.left], fillInset: getComputedStyle(fill).top, fillZ: getComputedStyle(fill).zIndex, spotZ: spot.zIndex, contentZ: getComputedStyle(n.querySelector('.mu-magic__content')).zIndex, overflow: s.overflow, isolation: s.isolation };
    });
    expect(v.border).toBe('1px');
    expect(v.borderColor).toBe('rgba(0, 0, 0, 0)');
    expect(v.bg).toMatch(/radial-gradient\(200px (circle )?at 100px 100px/);
    expect(v.bg).toMatch(/linear-gradient/);
    expect(v.spotBg).toMatch(/radial-gradient\(200px (circle )?at 100px 100px/);
    expect(v.spotOpacity).toBeCloseTo(0.8, 2);
    expect(v.spotInset).toEqual(['1px', '1px']);
    expect(v.fillInset).toBe('1px');
    expect([v.fillZ, v.spotZ, v.contentZ]).toEqual(['20', '30', '40']);
    expect(v.overflow).toBe('hidden');
    expect(v.isolation).toBe('isolate');
  });

  test('the light fades out in 300 ms when the pointer leaves, and the border goes back to its color', async ({ page }) => {
    await open(page, 'magic-card');
    const card = page.locator('#login');
    const box = await card.boundingBox();
    await page.mouse.move(box.x + 100, box.y + 100);
    await wait(page, 400);
    await expect(card).toHaveAttribute('data-lit', '');
    await page.mouse.move(box.x - 40, box.y - 40);
    await expect(card).not.toHaveAttribute('data-lit', '');
    await wait(page, 120);
    const mid = await card.evaluate((n) => Number(getComputedStyle(n.querySelector('.mu-magic__spot')).opacity));
    expect(mid).toBeGreaterThan(0.02);
    expect(mid).toBeLessThan(0.78);
    await wait(page, 400);
    expect(await card.evaluate((n) => Number(getComputedStyle(n.querySelector('.mu-magic__spot')).opacity))).toBe(0);
    expect(await card.evaluate((n) => getComputedStyle(n).getPropertyValue('--mu-lit').trim())).toBe('0');
  });

  test('the light goes when the window loses focus or the tab hides', async ({ page }) => {
    await open(page, 'magic-card');
    const card = page.locator('#login');
    const box = await card.boundingBox();
    await page.mouse.move(box.x + 100, box.y + 100);
    await expect(card).toHaveAttribute('data-lit', '');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(card).not.toHaveAttribute('data-lit', '');
    await page.mouse.move(box.x + 110, box.y + 110);
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(card).not.toHaveAttribute('data-lit', '');
  });

  test('the content is above the light and still works: the fields take focus and text', async ({ page }) => {
    await open(page, 'magic-card');
    const input = page.locator('#client');
    await input.click();
    await page.keyboard.type('Café Palermo');
    await expect(input).toHaveValue('Café Palermo');
    await page.keyboard.press('Tab');
    await expect(page.locator('#amount')).toBeFocused();
    expect(await spill(page, '#login')).toEqual([]);
  });

  test('orb mode: a 420 px blurred circle that appears on a spring and follows the pointer with lag', async ({ page }) => {
    await open(page, 'magic-card');
    const card = page.locator('#orb');
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    const orb = card.locator('.mu-magic__orb');
    const pos = () => orb.evaluate((n) => { const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(n.style.transform); return [Number(m[1]), Number(m[2]), Number(n.style.opacity)]; });
    await page.mouse.move(box.x + 40, box.y + 40);
    await wait(page, 700);
    const rest = await pos();
    expect(Math.abs(rest[0] - 40)).toBeLessThan(1.5);
    expect(rest[2]).toBeGreaterThan(0.85);
    await page.mouse.move(box.x + 300, box.y + 120);
    await wait(page, 50);
    const lag = await pos();
    expect(lag[0]).toBeGreaterThan(40);
    expect(lag[0]).toBeLessThan(290);
    await wait(page, 900);
    const there = await pos();
    expect(Math.abs(there[0] - 300)).toBeLessThan(1.5);
    expect(Math.abs(there[1] - 120)).toBeLessThan(1.5);
    const s = await orb.evaluate((n) => { const c = getComputedStyle(n); return [c.width, c.height, c.filter, c.borderRadius, c.mixBlendMode]; });
    expect(s.slice(0, 3)).toEqual(['420px', '420px', 'blur(60px)']);
    expect(s[4]).toBe('multiply');
    await page.mouse.move(box.x - 60, box.y - 60);
    await wait(page, 900);
    expect((await pos())[2]).toBeLessThan(0.02);
  });

  test('orb mode blends with screen in dark', async ({ page }) => {
    await open(page, 'magic-card', { dark: true });
    expect(await page.locator('#orb .mu-magic__orb').evaluate((n) => getComputedStyle(n).mixBlendMode)).toBe('screen');
  });

  test('a touch pointer lights the card where it lands and the light goes when it lifts', async ({ page }) => {
    await open(page, 'magic-card');
    const card = page.locator('#login');
    const box = await card.boundingBox();
    const fire = (type) => card.evaluate((n, [type, x, y]) => n.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', clientX: x, clientY: y, bubbles: false })), [type, box.x + 70, box.y + 50]);
    await fire('pointerenter');
    const at = await card.evaluate((n) => [parseFloat(n.style.getPropertyValue('--mx')), parseFloat(n.style.getPropertyValue('--my'))]);
    expect(Math.abs(at[0] - 70)).toBeLessThan(2);
    expect(Math.abs(at[1] - 50)).toBeLessThan(2);
    await expect(card).toHaveAttribute('data-lit', '');
    await fire('pointerleave');
    await expect(card).not.toHaveAttribute('data-lit', '');
  });

  test('refuses a mode that does not exist', async ({ page }) => {
    await open(page, 'magic-card');
    const msg = await page.evaluate(async () => { const { mount } = await import('/motion/magic-card.js'); try { mount(document.createElement('div'), { mode: 'comet' }); } catch (e) { return e.name; } return null; });
    expect(msg).toBe('RangeError');
  });

  test('destroy() hands the content back and leaves no layer, listener effect or variable', async ({ page }) => {
    await open(page, 'magic-card');
    const r = await roundTrip(page, 'magic-card', '<p id="x">hola</p>', { gradientSize: 120 });
    expect(r.after).toBe(r.before);
    expect(r.left).toBe(0);
    const orb = await roundTrip(page, 'magic-card', '<p>hola</p>', { mode: 'orb' });
    expect(orb.after).toBe(orb.before);
    expect(orb.left).toBe(0);
  });
});

test.describe('magic-card with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the light stays where the pointer came in and does not follow', async ({ page }) => {
    await open(page, 'magic-card');
    const card = page.locator('#login');
    const box = await card.boundingBox();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.move(box.x + 200, box.y + 120, { steps: 5 });
    await wait(page, 100);
    const at = await card.evaluate((n) => [parseFloat(n.style.getPropertyValue('--mx')), parseFloat(n.style.getPropertyValue('--my'))]);
    expect(Math.abs(at[0] - 50)).toBeLessThan(2);
    expect(Math.abs(at[1] - 50)).toBeLessThan(2);
    await wait(page, 200);
    expect(await card.evaluate((n) => getComputedStyle(n).transitionDuration)).toBe('0.14s');
  });
});

// ── number-ticker ──

const series = (page, selector, ms, step = 40) => page.evaluate(([selector, ms, step]) => new Promise((resolve) => {
  const el = document.querySelector(selector);
  const out = [];
  const t0 = performance.now();
  const id = setInterval(() => { out.push([Math.round(performance.now() - t0), el.textContent]); if (performance.now() - t0 > ms) { clearInterval(id); resolve(out); } }, step);
}), [selector, ms, step]);

test.describe('number-ticker', () => {
  test('counts up once to its value in the page format and says the final figure to a screen reader', async ({ page }) => {
    await open(page, 'number-ticker');
    const t = page.locator('#count');
    await expect(t.locator('.mu-ticker__spoken')).toHaveText('1.284');
    expect(await t.locator('.mu-ticker__digits').getAttribute('aria-hidden')).toBe('true');
    await expect(t.locator('.mu-ticker__digits')).toHaveText('1.284', { timeout: 15_000 });
    const money = page.locator('#billed');
    await expect(money.locator('.mu-ticker__digits')).toHaveText(/^\$\s5\.000\.000$/, { timeout: 15_000 });
    await expect(page.locator('#rate .mu-ticker__digits')).toHaveText('68,4', { timeout: 15_000 });
  });

  test('the count follows the original spring played faster: no overshoot, well on its way after a quarter of a second and the exact value within 1.5 s', async ({ page }) => {
    await open(page, 'number-ticker');
    await page.locator('#below').scrollIntoViewIfNeeded();
    const s = await series(page, '#below .mu-ticker__digits', 2500);
    const values = s.map(([, v]) => num(v));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    expect(Math.max(...values)).toBeLessThanOrEqual(9120);
    const at250 = values[s.findIndex(([t]) => t >= 250)];
    expect(at250 / 9120, 'it is on its way, not already there').toBeGreaterThan(0.3);
    const exact = s.findIndex(([, v]) => num(v) === 9120);
    expect(exact, 'it reaches the exact value').toBeGreaterThan(-1);
    expect(s[exact][0], 'within 1.5 s (plus the sampling step)').toBeLessThanOrEqual(1650);
    expect(values[values.length - 1]).toBe(9120);
  });

  test('does not start until it is in view', async ({ page }) => {
    await open(page, 'number-ticker');
    await wait(page, 1500);
    expect(await page.locator('#below .mu-ticker__digits').textContent()).toBe('0');
    await page.locator('#below').scrollIntoViewIfNeeded();
    await wait(page, 300);
    expect(num(await page.locator('#below .mu-ticker__digits').textContent())).toBeGreaterThan(0);
  });

  test('counts down from the value, waits its delay and starts from its own value', async ({ page }) => {
    await open(page, 'number-ticker');
    await expect(page.locator('#owed .mu-ticker__digits')).toHaveText(/^\$\s0$/, { timeout: 15_000 });
    await expect(page.locator('#clients .mu-ticker__digits')).toHaveText('148');
    const start = await page.evaluate(async () => {
      const { mount } = await import('/motion/number-ticker.js');
      const el = document.createElement('span');
      document.body.prepend(el);
      const h = mount(el, { value: 50, startValue: 10, delay: 0.5 });
      const first = h.text;
      await new Promise((r) => setTimeout(r, 300));
      const during = h.text;
      await new Promise((r) => setTimeout(r, 14000));
      const last = h.text;
      h.destroy();
      el.remove();
      return { first, during, last };
    });
    expect(start.first).toBe('10');
    expect(start.during).toBe('10');
    expect(start.last).toBe('50');
  });

  test('update() retargets from where the figure is and lands on the new value', async ({ page }) => {
    await open(page, 'number-ticker');
    await wait(page, 4200);
    await page.locator('#bump').click();
    await wait(page, 500);
    const mid = num(await page.locator('#billed .mu-ticker__digits').textContent());
    expect(mid).toBeGreaterThan(5000000);
    expect(mid).toBeLessThan(5250000);
    await expect(page.locator('#billed .mu-ticker__spoken')).toHaveText(/5\.250\.000/);
    await wait(page, 4000);
    await expect(page.locator('#billed .mu-ticker__digits')).toHaveText(/5\.250\.000/);
  });

  test('digits are tabular with the 0.05 em spacing of the original', async ({ page }) => {
    await open(page, 'number-ticker');
    const s = await page.locator('#count').evaluate((n) => { const c = getComputedStyle(n); return [c.fontVariantNumeric, c.letterSpacing, c.display, parseFloat(c.letterSpacing) / parseFloat(c.fontSize)]; });
    expect(s[0]).toContain('tabular-nums');
    expect(s[2]).toBe('inline-block');
    expect(s[3]).toBeCloseTo(0.05, 3);
  });

  test('refuses a value that is not a number and a direction that does not exist', async ({ page }) => {
    await open(page, 'number-ticker');
    const e = await page.evaluate(async () => {
      const { mount } = await import('/motion/number-ticker.js');
      const tries = [{ value: 'x' }, { value: NaN }, { value: 4, direction: 'sideways' }, {}];
      return tries.map((o) => { try { mount(document.createElement('span'), o); return 'ok'; } catch (e) { return e.name; } });
    });
    expect(e).toEqual(['RangeError', 'RangeError', 'RangeError', 'RangeError']);
  });

  test('destroy() puts the text back and stops the count', async ({ page }) => {
    await open(page, 'number-ticker');
    const r = await roundTrip(page, 'number-ticker', '1', { value: 99 }, 'span');
    expect(r.after).toBe(r.before);
    expect(r.left).toBe(0);
  });
});

test.describe('number-ticker with reduced motion', () => {
  test('the figure is final at once with a 140 ms fade', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/number-ticker.html`);
    await page.waitForLoadState('networkidle');
    await wait(page, 100);
    await expect(page.locator('#count .mu-ticker__digits')).toHaveText('1.284');
    const fades = await page.locator('#count .mu-ticker__digits').evaluate((n) => n.getAnimations().map((a) => a.effect.getTiming().duration));
    expect(fades.every((d) => d === 140)).toBe(true);
    await ctx.close();
  });
});

// ── marquee ──

test.describe('marquee', () => {
  test('repeats its row 4 times; the copies are hidden from assistive technology and cannot take focus', async ({ page }) => {
    await open(page, 'marquee');
    const row = page.locator('#row1');
    await expect(row.locator('.mu-marquee__track')).toHaveCount(4);
    const hidden = await row.locator('.mu-marquee__track').evaluateAll((ts) => ts.map((t) => [t.getAttribute('aria-hidden'), t.inert]));
    expect(hidden).toEqual([[null, false], ['true', true], ['true', true], ['true', true]]);
    expect(await row.locator('.mu-marquee__track').first().locator('.mu-logo').count()).toBe(4);
  });

  test('slides each track by its own width plus the gap, linear and forever, with no seam', async ({ page }) => {
    await open(page, 'marquee');
    const v = await page.locator('#row1 .mu-marquee__track').first().evaluate((t) => {
      const s = getComputedStyle(t);
      const tracks = [...t.parentElement.children];
      const a = tracks[0].getBoundingClientRect();
      const b = tracks[1].getBoundingClientRect();
      return { name: s.animationName, duration: s.animationDuration, ease: s.animationTimingFunction, count: s.animationIterationCount, gap: parseFloat(getComputedStyle(t.parentElement).columnGap), seam: b.left - a.right };
    });
    expect(v.name).toBe('mu-marquee');
    expect(v.duration).toBe('30s');
    expect(v.ease).toBe('linear');
    expect(v.count).toBe('infinite');
    expect(Math.abs(v.seam - v.gap)).toBeLessThan(1.5);
    const xs = [];
    for (let i = 0; i < 3; i++) { xs.push(await page.locator('#row1 .mu-marquee__track').first().evaluate((t) => new DOMMatrix(getComputedStyle(t).transform).e)); await wait(page, 300); }
    expect(xs[1]).toBeLessThan(xs[0]);
    expect(xs[2]).toBeLessThan(xs[1]);
  });

  test('the reverse row runs the other way and the vertical one slides on y', async ({ page }) => {
    await open(page, 'marquee');
    expect(await page.locator('#row2 .mu-marquee__track').first().evaluate((t) => getComputedStyle(t).animationDirection)).toBe('reverse');
    expect(await page.locator('#row1 .mu-marquee__track').first().evaluate((t) => getComputedStyle(t).animationDirection)).toBe('normal');
    const col = page.locator('#col .mu-marquee__track').first();
    expect(await col.evaluate((t) => getComputedStyle(t).animationName)).toBe('mu-marquee-vertical');
    await wait(page, 600);
    const m = await col.evaluate((t) => new DOMMatrix(getComputedStyle(t).transform));
    expect(m.f).toBeLessThan(0);
    expect(m.e).toBe(0);
  });

  test('pauses under the pointer and when focus is inside, and goes on when both are gone', async ({ page }) => {
    await open(page, 'marquee');
    const track = page.locator('#row1 .mu-marquee__track').first();
    const state = () => track.evaluate((t) => getComputedStyle(t).animationPlayState);
    expect(await state()).toBe('running');
    await page.locator('#row1').hover();
    expect(await state()).toBe('paused');
    await page.mouse.move(0, 0);
    expect(await state()).toBe('running');
    await page.evaluate(() => { const b = document.createElement('button'); b.id = 'probe'; document.getElementById('row1').firstElementChild.append(b); b.focus(); });
    expect(await state()).toBe('paused');
    await page.evaluate(() => document.getElementById('probe').remove());
  });

  test('can be paused by the person: the button and the API both stop it and say so', async ({ page }) => {
    await open(page, 'marquee');
    const button = page.locator('#freeze');
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('#row1 .mu-marquee__track').first().evaluate((t) => getComputedStyle(t).animationPlayState)).toBe('paused');
    expect(await page.locator('#col .mu-marquee__track').first().evaluate((t) => getComputedStyle(t).animationPlayState)).toBe('paused');
    await button.click();
    expect(await page.locator('#row1 .mu-marquee__track').first().evaluate((t) => getComputedStyle(t).animationPlayState)).toBe('running');
    const made = await page.evaluate(async () => {
      const { mount } = await import('/motion/marquee.js');
      const el = document.createElement('div');
      el.innerHTML = '<span>uno</span><span>dos</span>';
      document.body.prepend(el);
      const h = mount(el, { control: true });
      const b = el.nextElementSibling;
      b.click();
      const pressed = [b.getAttribute('aria-pressed'), h.paused];
      b.click();
      const out = [...pressed, b.getAttribute('aria-pressed')];
      h.destroy();
      const gone = !document.contains(b);
      el.remove();
      return [...out, gone];
    });
    expect(made).toEqual(['true', true, 'false', true]);
  });

  test('stops while it is off screen or the tab is hidden', async ({ page }) => {
    await open(page, 'marquee');
    const paused = () => page.locator('#row1').evaluate((n) => n.hasAttribute('data-paused'));
    expect(await paused()).toBe(false);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(await paused()).toBe(true);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(await paused()).toBe(false);
    await page.evaluate(() => { document.getElementById('row1').style.marginTop = '3000px'; });
    await expect.poll(paused).toBe(true);
  });

  test('the edges fade out where asked', async ({ page }) => {
    await open(page, 'marquee');
    expect(await page.locator('#row1').evaluate((n) => getComputedStyle(n).maskImage)).toMatch(/linear-gradient\(to right/);
    const vertical = await page.locator('#col').evaluate((n) => getComputedStyle(n).maskImage);
    expect(vertical).toMatch(/^linear-gradient\(rgba\(0, 0, 0, 0\)/);
    expect(vertical).not.toMatch(/to right/);
  });

  test('refuses nothing it can use: a repeat of zero is one track', async ({ page }) => {
    await open(page, 'marquee');
    const n = await page.evaluate(async () => {
      const { mount } = await import('/motion/marquee.js');
      const el = document.createElement('div');
      el.innerHTML = '<span>a</span>';
      const h = mount(el, { repeat: 0 });
      const c = el.querySelectorAll('.mu-marquee__track').length;
      h.destroy();
      return c;
    });
    expect(n).toBe(1);
  });

  test('destroy() puts the children back and leaves no track', async ({ page }) => {
    await open(page, 'marquee');
    const r = await roundTrip(page, 'marquee', '<span>uno</span><span>dos</span>', { reverse: true, duration: 12 });
    expect(r.after).toBe(r.before);
    expect(r.left).toBe(0);
  });
});

test.describe('marquee with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('stands still as a wrapped row, with no copies, and fades in 140 ms', async ({ page }) => {
    await page.addInitScript(() => {
      const animate = Element.prototype.animate;
      window.__anims = [];
      Element.prototype.animate = function (frames, options) { window.__anims.push([this.className, options.duration ?? options]); return animate.call(this, frames, options); };
    });
    await open(page, 'marquee');
    const track = page.locator('#row1 .mu-marquee__track').first();
    expect(await track.evaluate((t) => getComputedStyle(t).animationName)).toBe('none');
    expect(await page.locator('#row1 .mu-marquee__track').nth(1).evaluate((t) => getComputedStyle(t).display)).toBe('none');
    expect(await page.locator('#row1').evaluate((n) => [getComputedStyle(n).flexWrap, getComputedStyle(n).maskImage])).toEqual(['wrap', 'none']);
    expect((await page.evaluate(() => window.__anims)).filter(([cls]) => cls === 'mu-marquee__track')).toContainEqual(['mu-marquee__track', 140]);
    expect(await spill(page, '#row1')).toEqual([]);
  });
});

// ── bento-grid ──

test.describe('bento-grid', () => {
  test('lays out three columns with 16 px gaps and cells of 22 rem, 1, 2 and 3 wide', async ({ page }) => {
    await open(page, 'bento-grid');
    const g = await page.locator('#bento').evaluate((n) => {
      const s = getComputedStyle(n);
      const cards = [...n.querySelectorAll(':scope > .mu-bento__card')].map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.left - n.getBoundingClientRect().left), Math.round(r.width), Math.round(r.height), Math.round(r.top - n.getBoundingClientRect().top)]; });
      return { cols: s.gridTemplateColumns.split(' ').length, gap: s.columnGap, rows: s.gridAutoRows, cards, radius: getComputedStyle(n.firstElementChild).borderTopLeftRadius };
    });
    expect(g.cols).toBe(3);
    expect(g.gap).toBe('16px');
    expect(g.rows).toBe('352px');
    expect(g.cards).toHaveLength(6);
    expect(Math.abs(g.cards[1][1] - (g.cards[0][1] * 2 + 16))).toBeLessThan(2);
    expect(g.cards[0][2]).toBe(352);
    expect(g.cards[1][3]).toBe(0);
    expect(g.cards[2][3]).toBe(368);
    expect(g.cards[4][3]).toBe(736);
    expect(g.radius).toBe('12px');
  });

  test('the cells host the other ports alive', async ({ page }) => {
    await open(page, 'bento-grid');
    await wait(page, 2500);
    const hosted = await page.evaluate(() => ({
      marquee: document.querySelectorAll('#bento .mu-marquee__track').length,
      list: document.querySelectorAll('#bento .mu-list__item').length,
      beam: document.querySelectorAll('#bento .mu-beam__light').length,
      gauge: document.querySelector('#bento [role="progressbar"]')?.getAttribute('aria-valuenow'),
      rings: document.querySelectorAll('#bento .mu-rings__arc').length,
      ticker: [...document.querySelectorAll('#bento .mu-ticker__spoken')].map((n) => n.textContent),
    }));
    expect(hosted.marquee).toBe(8);
    expect(hosted.list).toBeGreaterThanOrEqual(2);
    expect(hosted.beam).toBe(4);
    expect(hosted.gauge).toBe('68');
    expect(hosted.rings).toBe(3);
    expect(hosted.ticker).toHaveLength(3);
  });

  test('is a named region and every card is an article with its own heading', async ({ page }) => {
    await open(page, 'bento-grid');
    const cards = await page.locator('#bento > article').count();
    expect(cards).toBe(6);
    expect(await page.locator('#bento > article h3').count()).toBe(6);
  });

  test('on hover the text rises 40 px, the icon shrinks to 75 %, the link slides up and a 3 % veil tints the card', async ({ page }) => {
    await open(page, 'bento-grid');
    const card = page.locator('.mu-bento__card').nth(1);
    const at = async () => ({ text: await ty(card.locator('.mu-bento__text')), icon: await scale(card.locator('.mu-bento__icon')), cta: await card.locator('.mu-bento__cta').evaluate((n) => [Number(getComputedStyle(n).opacity), new DOMMatrix(getComputedStyle(n).transform).f]), veil: await card.locator('.mu-bento__veil').evaluate((n) => getComputedStyle(n).backgroundColor) });
    const rest = await at();
    expect(rest.text).toBe(0);
    expect(rest.icon).toBe(1);
    expect(rest.cta).toEqual([0, 40]);
    expect(rest.veil).toBe('rgba(0, 0, 0, 0)');
    await card.hover({ position: { x: 300, y: 60 } });
    await wait(page, 500);
    const hover = await at();
    expect(hover.text).toBeCloseTo(-40, 0);
    expect(hover.icon).toBeCloseTo(0.75, 2);
    expect(hover.cta[0]).toBe(1);
    expect(hover.cta[1]).toBeCloseTo(0, 0);
    const alpha = await page.evaluate((c) => { const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true }); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return cx.getImageData(0, 0, 1, 1).data[3] / 255; }, hover.veil);
    expect(alpha).toBeGreaterThan(0.02);
    expect(alpha).toBeLessThan(0.045);
    await page.mouse.move(0, 0);
    await wait(page, 500);
    expect((await at()).cta).toEqual([0, 40]);
  });

  test('the same happens with the keyboard: focus on the link reveals it, and Enter follows it', async ({ page }) => {
    await open(page, 'bento-grid');
    const card = page.locator('.mu-bento__card').nth(1);
    const link = card.locator('.mu-bento__link');
    await link.focus();
    await wait(page, 450);
    expect(await card.locator('.mu-bento__cta').evaluate((n) => Number(getComputedStyle(n).opacity))).toBe(1);
    expect(await ty(card.locator('.mu-bento__text'))).toBeCloseTo(-40, 0);
    expect(await link.evaluate((n) => getComputedStyle(n).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Tab');
    await wait(page, 450);
    expect(await card.locator('.mu-bento__cta').evaluate((n) => Number(getComputedStyle(n).opacity))).toBe(0);
    await link.focus();
    await page.keyboard.press('Enter');
    expect(new URL(page.url()).hash).toBe('#actividad');
  });

  test('every link has a name and all six are reachable by Tab, in order', async ({ page }) => {
    await open(page, 'bento-grid');
    const names = await page.locator('.mu-bento__link').allInnerTexts();
    expect(names.map((n) => n.trim())).toEqual(['Ver clientes', 'Ver toda la actividad', 'Administrar integraciones', 'Ver la meta', 'Ver la cobranza', 'Ver facturas']);
    await page.locator('.mu-demo__theme button').last().focus();
    for (const name of names) {
      await page.keyboard.press('Tab');
      expect((await page.evaluate(() => document.activeElement.textContent)).trim()).toBe(name.trim());
    }
  });

  test('below the wide layout the cards stack and the link is hidden at rest, as in the original', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await open(page, 'bento-grid');
    const v = await page.evaluate(() => {
      const n = document.getElementById('bento');
      const w = n.getBoundingClientRect().width;
      const cards = [...n.children].map((c) => Math.round(c.getBoundingClientRect().width));
      const cta = getComputedStyle(n.querySelector('.mu-bento__cta'));
      return { w: Math.round(w), cards, position: cta.position, opacity: cta.opacity, transform: new DOMMatrix(cta.transform).f };
    });
    expect(new Set(v.cards)).toEqual(new Set([v.w]));
    expect(v.position).toBe('absolute');
    expect(v.opacity).toBe('0');
    expect(v.transform).toBe(40);
    const card = page.locator('.mu-bento__card').nth(1);
    await card.hover({ position: { x: 200, y: 60 } });
    await wait(page, 500);
    expect(await card.locator('.mu-bento__cta').evaluate((n) => Number(getComputedStyle(n).opacity))).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('at rest the link never sits over the description: it is invisible and lifted out of the way', async ({ page }) => {
    for (const width of [1280, 1024, 700]) {
      await page.setViewportSize({ width, height: 900 });
      await open(page, 'bento-grid');
      await page.mouse.move(0, 0);
      const bad = await page.locator('.mu-bento__card').evaluateAll((cards) => cards.filter((c) => {
        const cta = getComputedStyle(c.querySelector('.mu-bento__cta'));
        return Number(cta.opacity) !== 0 || new DOMMatrix(cta.transform).f !== 40;
      }).length);
      expect(bad, `${width}px`).toBe(0);
    }
  });

  test('without a hovering pointer the link is always there, even on a wide screen', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/bento-grid.html`);
    await page.waitForLoadState('networkidle');
    const hover = await page.evaluate(() => matchMedia('(hover: hover)').matches);
    test.skip(hover, 'this browser still reports hover with touch');
    expect(await page.locator('.mu-bento__cta').first().evaluate((n) => [getComputedStyle(n).position, getComputedStyle(n).opacity])).toEqual(['static', '1']);
    await ctx.close();
  });

  test('text is never covered: the name and description of every card sit inside it', async ({ page }) => {
    await open(page, 'bento-grid');
    const out = await page.locator('.mu-bento__card').evaluateAll((cards) => cards.flatMap((c) => { const r = c.getBoundingClientRect(); return [...c.querySelectorAll('.mu-bento__name, .mu-bento__description')].filter((n) => { const b = n.getBoundingClientRect(); return b.left < r.left || b.right > r.right || b.bottom > r.bottom + 1; }).map((n) => n.textContent); }));
    expect(out).toEqual([]);
  });

  test('refuses a cell with no name or a span that does not exist', async ({ page }) => {
    await open(page, 'bento-grid');
    const e = await page.evaluate(async () => {
      const { mount } = await import('/motion/bento-grid.js');
      return [{ description: 'x' }, { name: 'x', span: 4 }].map((cell) => { try { mount(document.createElement('div'), { cells: [cell] }); return 'ok'; } catch (err) { return err.name; } });
    });
    expect(e).toEqual(['RangeError', 'RangeError']);
  });

  test('destroy() puts the grid back and destroys what its cells host', async ({ page }) => {
    await open(page, 'bento-grid');
    const out = await page.evaluate(async () => {
      const { mount } = await import('/motion/bento-grid.js');
      const el = document.createElement('div');
      el.innerHTML = '<p>antes</p>';
      document.body.prepend(el);
      let destroyed = 0;
      const h = mount(el, { cells: [{ name: 'Uno', description: 'd', href: '#', cta: 'Ir', span: 2, background: () => ({ destroy: () => { destroyed++; } }) }] });
      const built = el.querySelectorAll('.mu-bento__card').length;
      h.destroy();
      const out = { built, destroyed, html: el.innerHTML, cls: el.className };
      el.remove();
      return out;
    });
    expect(out).toEqual({ built: 1, destroyed: 1, html: '<p>antes</p>', cls: '' });
  });
});
