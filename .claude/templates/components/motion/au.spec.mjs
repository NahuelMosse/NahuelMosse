// Tests of the Animate UI group, run against the demos: tabs, sliding number, copy button, theme
// toggler, flip button, flip card and the animated icons. Each component: it mounts with the right roles,
// answers the mouse, the keyboard and (where it applies) touch, ends in the right state, moves in between
// (sampled frame by frame, so a jump to the end fails), answers reduced motion with a fade instead of
// travel, has no descendant sticking out of its box, leaves nothing behind after `destroy()`, and does
// not log errors to the console.
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

let errors = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`console: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
});
test.afterEach(() => { expect(errors).toEqual([]); });

const open = async (page, name, { reduced = false, theme } = {}) => {
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/motion/${name}.html${theme ? `?theme=${theme}` : ''}`);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
};

// A descendant that is painted outside the box of `root`, once what each ancestor with overflow clips is
// taken away, is a leak. Returns the offenders.
const leaks = (page, selector) => page.evaluate((selector) => {
  const out = [];
  for (const root of document.querySelectorAll(selector)) {
    const box = root.getBoundingClientRect();
    for (const node of root.querySelectorAll('*')) {
      let r = node.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      if (getComputedStyle(node).visibility === 'hidden') continue;
      let left = r.left; let top = r.top; let right = r.right; let bottom = r.bottom;
      for (let p = node.parentElement; p && p !== root.parentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        const b = p.getBoundingClientRect();
        if (cs.overflowX !== 'visible') { left = Math.max(left, b.left); right = Math.min(right, b.right); }
        if (cs.overflowY !== 'visible') { top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); }
      }
      if (right <= left || bottom <= top) continue;
      if (left < box.left - 1 || right > box.right + 1 || top < box.top - 1 || bottom > box.bottom + 1) out.push(`${node.tagName.toLowerCase()}.${node.className?.baseVal ?? node.className}`);
    }
  }
  return out;
}, selector);

// A markup mounted and destroyed leaves the element as it was (an empty style attribute does not count).
const roundTrip = (page, { module, html, mount }) => page.evaluate(async ({ module, html, mount }) => {
  const host = Object.assign(document.createElement('div'), { innerHTML: html });
  document.body.append(host);
  const el = host.firstElementChild;
  const norm = (s) => s.replace(/ (style|class)=""/g, '');
  const before = norm(host.innerHTML);
  const m = await import(module);
  const api = m.mount(el, mount);
  api.destroy();
  const after = norm(host.innerHTML);
  host.remove();
  return { before, after };
}, { module, html, mount });

// The six numbers of a computed 2D transform, as { a, b, c, d, e, f }.
const matrixOf = (t) => {
  const [a, b, c, d, e, f] = t === 'none' ? [1, 0, 0, 1, 0, 0] : /matrix\(([^)]+)\)/.exec(t)[1].split(',').map(Number);
  return { a, b, c, d, e, f };
};

// Tab until `locator` has the focus (what comes before it on the page is not the test's business).
const tabTo = async (page, locator) => {
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    if (await locator.evaluate((n) => n === document.activeElement)) return;
  }
  throw new Error('the keyboard never reached the element');
};

// ───────────────────────── Tabs ─────────────────────────
test.describe('tabs', () => {
  const tab = (page, value, scope = '#views') => page.locator(`${scope} [role="tab"][data-value="${value}"]`);

  test('the track cannot be scrolled away from the showing pane by a scroll or a focus: the contents are clipped, not scrollable', async ({ page }) => {
    await open(page, 'tabs');
    const out = await page.evaluate(() => {
      const contents = document.querySelector('#views .tabs-au__contents');
      contents.scrollLeft = 400;
      contents.scrollTo({ left: 400 });
      document.querySelector('#views .tabs-au__track > [role="tabpanel"]:last-child').scrollIntoView({ inline: 'center' });
      return [contents.scrollLeft, getComputedStyle(contents).overflowX];
    });
    expect(out).toEqual([0, 'clip']);
  });

  test('mounts with the tab roles, one active tab and the others inert', async ({ page }) => {
    await open(page, 'tabs');
    await expect(page.locator('#views [role="tablist"]')).toHaveAttribute('aria-label', 'Vista de facturas');
    await expect(page.locator('#views [role="tab"]')).toHaveCount(3);
    await expect(tab(page, 'list')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, 'board')).toHaveAttribute('aria-selected', 'false');
    await expect(tab(page, 'list')).toHaveAttribute('tabindex', '0');
    await expect(tab(page, 'board')).toHaveAttribute('tabindex', '-1');
    const wiring = await page.evaluate(() => [...document.querySelectorAll('#views [role="tab"]')].map((t) => {
      const pane = document.getElementById(t.getAttribute('aria-controls'));
      return { labelled: pane.getAttribute('aria-labelledby') === t.id, inert: pane.inert, role: pane.getAttribute('role') };
    }));
    expect(wiring).toEqual([{ labelled: true, inert: false, role: 'tabpanel' }, { labelled: true, inert: true, role: 'tabpanel' }, { labelled: true, inert: true, role: 'tabpanel' }]);
  });

  test('the highlight starts on the active tab, exactly under it', async ({ page }) => {
    await open(page, 'tabs');
    const [t, p] = await Promise.all([tab(page, 'list').boundingBox(), page.locator('#views .tabs-au__pill').boundingBox()]);
    expect(Math.abs(p.x - t.x)).toBeLessThan(1.5);
    expect(Math.abs(p.width - t.width)).toBeLessThan(1.5);
    expect(Math.abs(p.height - t.height)).toBeLessThan(1.5);
  });

  test('a click slides the highlight on a spring: it is between the tabs on the way and exactly under the new one at the end', async ({ page }) => {
    await open(page, 'tabs');
    const lefts = await page.evaluate(() => new Promise((resolve) => {
      const pill = document.querySelector('#views .tabs-au__pill');
      const out = [];
      const t0 = performance.now();
      document.querySelector('#views [data-value="board"]').click();
      const tick = () => { out.push(pill.getBoundingClientRect().left); if (performance.now() - t0 < 1100) requestAnimationFrame(tick); else resolve(out); };
      tick();
    }));
    const target = (await tab(page, 'board').boundingBox()).x;
    const start = lefts[0];
    expect(target).toBeGreaterThan(start + 20);
    expect(lefts.some((x) => x > start + 3 && x < target - 3)).toBe(true);
    expect(Math.abs(lefts.at(-1) - target)).toBeLessThan(1);
  });

  test('the contents slide on their own spring and the container takes the height of the active pane', async ({ page }) => {
    await open(page, 'tabs');
    await tab(page, 'board').click();
    await page.waitForTimeout(40);
    const mid = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('#views .tabs-au__track')).transform).m41);
    await page.waitForTimeout(1100);
    const end = await page.evaluate(() => {
      const track = document.querySelector('#views .tabs-au__track');
      const pane = document.querySelector('#views [data-value="board"][role="tabpanel"]');
      return { x: new DOMMatrix(getComputedStyle(track).transform).m41, width: track.offsetWidth, box: document.querySelector('#views .tabs-au__contents').getBoundingClientRect().height, pane: pane.getBoundingClientRect().height };
    });
    expect(mid).toBeLessThan(0);
    expect(mid).toBeGreaterThan(-end.width + 1);
    expect(Math.abs(end.x + end.width)).toBeLessThan(1);
    expect(Math.abs(end.box - end.pane)).toBeLessThan(1.5);
  });

  test('the pane that is not active is blurred 4 px and the one that appears sharpens', async ({ page }) => {
    await open(page, 'tabs');
    await page.waitForTimeout(700);
    const blur = (value) => page.evaluate((v) => parseFloat(getComputedStyle(document.querySelector(`#views [data-value="${v}"][role="tabpanel"]`)).filter.replace(/[^\d.]/g, '') || '0'), value);
    expect(await blur('board')).toBeCloseTo(4, 1);
    expect(await blur('list')).toBeCloseTo(0, 1);
    await tab(page, 'board').click();
    await page.waitForTimeout(60);
    const mid = await blur('board');
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(4);
    await page.waitForTimeout(900);
    expect(await blur('board')).toBeCloseTo(0, 1);
    expect(await blur('list')).toBeCloseTo(4, 1);
  });

  test('the keyboard: arrows, Home and End move and activate, with the focus following', async ({ page }) => {
    await open(page, 'tabs');
    await tab(page, 'list').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, 'board')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, 'board')).toBeFocused();
    await page.keyboard.press('End');
    await expect(tab(page, 'timeline')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, 'list')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(tab(page, 'timeline')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(tab(page, 'list')).toHaveAttribute('aria-selected', 'true');
  });

  test('the focus ring is visible on the keyboard focus', async ({ page }) => {
    await open(page, 'tabs');
    await tabTo(page, tab(page, 'list'));
    const outline = await tab(page, 'list').evaluate((el) => getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth);
    expect(outline).toBe('solid 2px');
  });

  test('change fires with the new value, and select() takes a value from outside', async ({ page }) => {
    await open(page, 'tabs');
    const seen = await page.evaluate(async () => {
      const { mount } = await import('/motion/tabs.js');
      const el = document.querySelector('#views');
      const got = [];
      el.addEventListener('change', (e) => got.push(e.detail.value));
      mount(el).select('timeline');
      document.querySelector('#views [data-value="list"]').click();
      return got;
    });
    expect(seen).toEqual(['timeline', 'list']);
  });

  test('an unknown value is an error, not a default', async ({ page }) => {
    await open(page, 'tabs');
    const message = await page.evaluate(async () => { const { mount } = await import('/motion/tabs.js'); try { mount(document.querySelector('#views')).select('archivo'); return ''; } catch (e) { return e.message; } });
    expect(message).toContain('no tab "archivo"');
  });

  test('reduced motion: the highlight jumps, the panes cross-fade and nothing travels', async ({ page }) => {
    await open(page, 'tabs', { reduced: true });
    await tab(page, 'board').click();
    await page.waitForTimeout(60);
    const [t, p] = await Promise.all([tab(page, 'board').boundingBox(), page.locator('#views .tabs-au__pill').boundingBox()]);
    expect(Math.abs(p.x - t.x)).toBeLessThan(1.5);
    const state = await page.evaluate(() => {
      const track = document.querySelector('#views .tabs-au__track');
      const style = (v) => getComputedStyle(document.querySelector(`#views [data-value="${v}"][role="tabpanel"]`));
      return { x: new DOMMatrix(getComputedStyle(track).transform).m41, width: track.offsetWidth, filterList: style('list').filter, opacityList: style('list').opacity, transition: style('list').transitionDuration };
    });
    expect(Math.abs(state.x + state.width)).toBeLessThan(1);
    expect(state.filterList).toBe('none');
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#views [data-value="list"][role="tabpanel"]')).opacity)).toBe('0');
    expect(state.transition).toBe('0.14s');
  });

  test('nothing sticks out of the tabs and the icons inside the tabs play on hover', async ({ page }) => {
    await open(page, 'tabs');
    expect(await leaks(page, '[data-motion="tabs"]')).toEqual([]);
    await tab(page, 'clients', '#with-icons').hover();
    const running = await page.evaluate(() => [...document.querySelectorAll('#with-icons [data-value="clients"] [data-part]')].flatMap((n) => n.getAnimations()).length);
    expect(running).toBeGreaterThan(0);
  });

  test('destroy puts the markup back as it was', async ({ page }) => {
    await open(page, 'tabs');
    const html = '<div data-motion="tabs"><div class="tabs-au__list" role="tablist"><button role="tab" data-value="a">A</button><button role="tab" data-value="b">B</button></div><div class="tabs-au__contents"><div role="tabpanel" data-value="a">uno</div><div role="tabpanel" data-value="b">dos</div></div></div>';
    const { before, after } = await roundTrip(page, { module: '/motion/tabs.js', html, mount: { value: 'b' } });
    expect(after).toBe(before);
  });

  test('a markup whose tabs and panels do not match is an error', async ({ page }) => {
    await open(page, 'tabs');
    const message = await page.evaluate(async () => {
      const host = Object.assign(document.createElement('div'), { innerHTML: '<div><div role="tablist"><button role="tab" data-value="a">A</button></div><div class="tabs-au__contents"><div role="tabpanel" data-value="z"></div></div></div>' });
      const { mount } = await import('/motion/tabs.js');
      try { mount(host.firstElementChild); return ''; } catch (e) { return e.message; }
    });
    expect(message).toContain('same data-value');
  });
});

// ───────────────────────── Sliding number ─────────────────────────
const shown = (page, selector) => page.evaluate((selector) => {
  const el = document.querySelector(selector);
  return [...el.querySelector('.sn__digits').children].map((n) => (n.classList.contains('sn__roll') ? [...n.querySelectorAll('.sn__d')].find((d) => parseFloat(d.style.transform.match(/translateY\((-?[\d.]+)%/)[1]) === 0)?.textContent ?? '?' : n.textContent)).join('');
}, selector);
const spoken = (page, selector) => page.locator(`${selector} .sn__spoken`).evaluate((n) => n.textContent);
const expected = (value, options, loc = 'es-AR') => new Intl.NumberFormat(loc, options).format(value);

test.describe('sliding number', () => {
  test('mounts showing the formatted figure, spoken in full and drawn in columns', async ({ page }) => {
    await open(page, 'sliding-number');
    expect(await spoken(page, '#billed')).toBe(expected(12845000, { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }));
    expect(await shown(page, '#billed')).toBe(await spoken(page, '#billed'));
    expect(await spoken(page, '#collected')).toBe(expected(9310250.5, { style: 'currency', currency: 'ARS' }));
    expect(await shown(page, '#collected')).toBe(await spoken(page, '#collected'));
    await expect(page.locator('#billed .sn__digits')).toHaveAttribute('aria-hidden', 'true');
    expect(await page.locator('#count .sn__roll').count()).toBe(2);
  });

  test('a new figure rolls digit by digit: columns are between digits on the way and on the figure at the end', async ({ page }) => {
    await open(page, 'sliding-number');
    const frames = await page.evaluate(() => new Promise((resolve) => {
      const rolls = [...document.querySelectorAll('#count .sn__roll')];
      const t0 = performance.now();
      const out = [];
      document.querySelector('#more').click();
      const tick = () => {
        out.push(rolls.map((r) => [...r.querySelectorAll('.sn__d')].map((d) => parseFloat(d.style.transform.match(/translateY\((-?[\d.]+)%/)[1])).some((y) => Math.abs(y % 100) > 5 && Math.abs(y % 100) < 95)));
        if (performance.now() - t0 < 1200) requestAnimationFrame(tick); else resolve(out);
      };
      tick();
    }));
    expect(frames.some((f) => f.some(Boolean))).toBe(true);
    expect(frames.at(-1).some(Boolean)).toBe(false);
    expect(await shown(page, '#count')).toBe('99');
    expect(await spoken(page, '#count')).toBe('99');
  });

  test('a carry adds a place that starts from 0, and the way back removes it', async ({ page }) => {
    await open(page, 'sliding-number');
    await page.locator('#more').click();
    await page.locator('#more').click();
    await page.waitForTimeout(1300);
    expect(await shown(page, '#count')).toBe('100');
    expect(await page.locator('#count .sn__roll').count()).toBe(3);
    await page.locator('#less').click();
    await page.waitForTimeout(1300);
    expect(await shown(page, '#count')).toBe('99');
    expect(await page.locator('#count .sn__roll').count()).toBe(2);
  });

  test('grouping and decimals come from the locale: the separators stay still and only the digits roll', async ({ page }) => {
    await open(page, 'sliding-number');
    await page.locator('#jump').click();
    await page.waitForTimeout(1500);
    expect(await spoken(page, '#billed')).toBe(expected(1000000000, { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }));
    expect(await shown(page, '#billed')).toBe(await spoken(page, '#billed'));
    expect(await page.locator('#billed .sn__s').count()).toBeGreaterThanOrEqual(3);
  });

  test('the two presets differ: Motion Primitives settles sooner than Animate UI', async ({ page }) => {
    await open(page, 'sliding-number');
    const settle = await page.evaluate(() => new Promise((resolve) => {
      const rolls = { soft: document.querySelector('#soft .sn__roll:last-of-type'), snappy: document.querySelector('#snappy .sn__roll:last-of-type') };
      const done = {};
      const t0 = performance.now();
      document.querySelector('#both').click();
      const off = (r) => Math.max(...[...r.querySelectorAll('.sn__d')].map((d) => { const y = parseFloat(d.style.transform.match(/translateY\((-?[\d.]+)%/)[1]); return Math.abs(y % 100); }));
      const tick = () => {
        for (const [k, r] of Object.entries(rolls)) if (done[k] === undefined && off(r) < 1.5 && performance.now() - t0 > 30) done[k] = performance.now() - t0;
        if (performance.now() - t0 < 1500 && Object.keys(done).length < 2) requestAnimationFrame(tick); else resolve(done);
      };
      tick();
    }));
    expect(settle.snappy).toBeLessThan(settle.soft);
  });

  test('a column takes about 500 ms to settle, as the original does', async ({ page }) => {
    await open(page, 'sliding-number');
    // The column is settled from the last frame at which it was still 5 % or more away from a digit.
    const settle = await page.evaluate(() => new Promise((resolve) => {
      const roll = document.querySelector('#soft .sn__roll:last-of-type');
      const t0 = performance.now();
      document.querySelector('#both').click();
      const off = () => Math.max(...[...roll.querySelectorAll('.sn__d')].map((d) => { const m = Math.abs(parseFloat(d.style.transform.match(/translateY\((-?[\d.]+)%/)[1]) % 100); return Math.min(m, 100 - m); }));
      let apart = 0;
      const tick = () => {
        const t = performance.now() - t0;
        if (off() >= 5) apart = t;
        if (t > 1500) resolve(apart); else requestAnimationFrame(tick);
      };
      tick();
    }));
    expect(settle).toBeGreaterThan(350);
    expect(settle).toBeLessThan(700);
  });

  test('a figure that counts from another number says its final value from the first moment', async ({ page }) => {
    await open(page, 'sliding-number');
    const said = await page.evaluate(async () => {
      const { mount } = await import('/motion/sliding-number.js');
      const el = document.createElement('span');
      document.body.append(el);
      const handle = mount(el, { value: 1284, from: 0, inView: true, locale: 'es-AR' });
      const right = el.querySelector('.sn__spoken').textContent;
      handle.destroy();
      el.remove();
      return right;
    });
    expect(said).toBe('1.284');
  });

  test('from + inView: it shows the starting figure and ends on the real one', async ({ page }) => {
    await open(page, 'sliding-number');
    await page.locator('#intro').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1600);
    expect(await spoken(page, '#intro')).toBe(expected(342900.75, { style: 'currency', currency: 'ARS' }));
    expect(await shown(page, '#intro')).toBe(await spoken(page, '#intro'));
  });

  test('leading zeros come from the format, and a minute carry rolls both places', async ({ page }) => {
    await open(page, 'sliding-number');
    expect(await spoken(page, '#hh')).toBe('02');
    expect(await spoken(page, '#mm')).toBe('05');
    await page.locator('#tick').click();
    await page.waitForTimeout(1300);
    expect(await shown(page, '#mm')).toBe('12');
    for (let i = 0; i < 9; i++) await page.locator('#tick').click();
    await page.waitForTimeout(1500);
    expect(await shown(page, '#hh')).toBe('03');
    expect(await shown(page, '#mm')).toBe('15');
    expect(await spoken(page, '#hh')).toBe('03');
  });

  test('reduced motion: the columns do not travel, the digits that change fade in', async ({ page }) => {
    await open(page, 'sliding-number', { reduced: true });
    const result = await page.evaluate(() => {
      document.querySelector('#more').click();
      const rolls = [...document.querySelectorAll('#count .sn__roll')];
      const offsets = rolls.flatMap((r) => [...r.querySelectorAll('.sn__d')].map((d) => parseFloat(d.style.transform.match(/translateY\((-?[\d.]+)%/)[1]) % 100));
      return { offsets, fading: rolls.flatMap((r) => r.getAnimations()).map((a) => a.effect.getTiming().duration) };
    });
    expect(result.offsets.every((y) => y === 0)).toBe(true);
    expect(result.fading.length).toBeGreaterThan(0);
    expect(result.fading.every((d) => d >= 100 && d <= 150)).toBe(true);
    expect(await shown(page, '#count')).toBe('99');
  });

  test('a value that is not a number is an error, not a zero', async ({ page }) => {
    await open(page, 'sliding-number');
    const messages = await page.evaluate(async () => {
      const { mount } = await import('/motion/sliding-number.js');
      const make = () => document.createElement('span');
      const run = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
      const ok = mount(Object.assign(make(), {}), { value: 3 });
      return [run(() => mount(make(), { value: 'abc' })), run(() => ok.set(NaN)), run(() => mount(make(), { value: 1, preset: 'blando' }))];
    });
    expect(messages[0]).toContain('not a finite number');
    expect(messages[1]).toContain('not a finite number');
    expect(messages[2]).toContain('no preset "blando"');
  });

  test('nothing sticks out of a figure and destroy gives the original content back', async ({ page }) => {
    await open(page, 'sliding-number');
    expect(await leaks(page, '.sn')).toEqual([]);
    const { before, after } = await roundTrip(page, { module: '/motion/sliding-number.js', html: '<span data-value="42">42</span>', mount: { value: 42 } });
    expect(after).toBe(before);
  });
});

// ───────────────────────── Copy button ─────────────────────────
const stubClipboard = (page, { api = true, legacy = true } = {}) => page.evaluate(({ api, legacy }) => {
  window.__written = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: api ? { writeText: async (t) => { window.__written.push(['api', t]); } } : { writeText: async () => { throw new Error('denied'); } } });
  document.execCommand = (cmd) => { if (cmd !== 'copy') return false; const area = document.querySelector('textarea'); window.__written.push(['legacy', area?.value]); return legacy; };
}, { api, legacy });
const face = (page, id, which) => page.locator(`${id} .cb__icon`).nth(which);

test.describe('copy button', () => {
  test('mounts as a named button: icon-only keeps its label, the text variant keeps its text', async ({ page }) => {
    await open(page, 'copy-button');
    await expect(page.locator('#icon-only')).toHaveAccessibleName('Copiar CUIT');
    await expect(page.locator('#with-text')).toHaveAccessibleName('30-71234567-8');
    await expect(page.locator('#icon-only')).toHaveAttribute('type', 'button');
    await expect(page.locator('#with-text .cb__label')).toHaveText('30-71234567-8');
  });

  test('a click copies the CUIT, swaps the icon and says it in words', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page, 'copy-button');
    await page.locator('#icon-only').click();
    await expect(page.locator('#icon-only')).toHaveAttribute('data-state', 'copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('30-71234567-8');
    await expect(page.locator('#icon-only + [role="status"]')).toHaveText('Copiado al portapapeles');
    await page.waitForTimeout(400);
    expect(await face(page, '#icon-only', 1).evaluate((n) => getComputedStyle(n).opacity)).toBe('1');
    expect(await face(page, '#icon-only', 0).evaluate((n) => getComputedStyle(n).opacity)).toBe('0');
  });

  test('the swap is scale, opacity and blur: in the middle the new icon is small, translucent and blurred', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page, 'copy-button');
    await page.locator('#icon-only').click();
    await expect(page.locator('#icon-only')).toHaveAttribute('data-state', 'copied');
    const mid = await face(page, '#icon-only', 1).evaluate((n) => { const a = n.getAnimations()[0]; a.pause(); a.currentTime = 100; const cs = getComputedStyle(n); const out = { scale: new DOMMatrix(cs.transform).a, opacity: Number(cs.opacity), blur: parseFloat(cs.filter.replace(/[^\d.]/g, '')) }; a.play(); return out; });
    expect(mid.scale).toBeGreaterThan(0.1);
    expect(mid.scale).toBeLessThan(1);
    expect(mid.opacity).toBeGreaterThan(0.4);
    expect(mid.opacity).toBeLessThan(1);
    expect(mid.blur).toBeGreaterThan(0);
    expect(mid.blur).toBeLessThan(4);
  });

  test('the check is complete within 200 ms of the click: swapped in and drawn', async ({ page }) => {
    await open(page, 'copy-button');
    await stubClipboard(page);
    const ms = await page.evaluate(() => new Promise((resolve) => {
      const button = document.querySelector('#icon-only');
      const check = button.querySelectorAll('.cb__icon')[1];
      let t0 = 0;
      button.addEventListener('click', () => { t0 = performance.now(); }, { capture: true });
      const done = () => {
        const settled = check.getAnimations({ subtree: true }).every((a) => a.playState === 'finished' || a.effect.getComputedTiming().progress === 1);
        return Number(getComputedStyle(check).opacity) === 1 && check.getAnimations({ subtree: true }).length > 0 && settled;
      };
      const tick = () => {
        if (t0 && done()) resolve(performance.now() - t0);
        else if (t0 && performance.now() - t0 > 2000) resolve(Infinity);
        else requestAnimationFrame(tick);
      };
      button.click();
      tick();
    }));
    expect(ms).toBeLessThanOrEqual(200);
  });

  test('it goes back after the delay, and a click while copied does not copy twice', async ({ page }) => {
    await open(page, 'copy-button');
    await stubClipboard(page);
    await page.evaluate(async () => {
      const { mount } = await import('/motion/copy-button.js');
      const b = Object.assign(document.createElement('button'), { id: 'quick' });
      b.dataset.copy = 'FC-A 0001-00004821';
      b.setAttribute('aria-label', 'Copiar número');
      document.body.append(b);
      mount(b, { delay: 1500 });
    });
    await page.locator('#quick').click();
    await page.locator('#quick').click();
    expect(await page.evaluate(() => window.__written)).toEqual([['api', 'FC-A 0001-00004821']]);
    await expect(page.locator('#quick')).toHaveAttribute('data-state', 'copied');
    await expect(page.locator('#quick')).toHaveAttribute('data-state', 'idle', { timeout: 4000 });
    await page.locator('#quick').click();
    expect((await page.evaluate(() => window.__written)).length).toBe(2);
  });

  test('without the clipboard API it falls back to selecting a text area', async ({ page }) => {
    await open(page, 'copy-button');
    await stubClipboard(page, { api: false, legacy: true });
    await page.locator('#icon-only').click();
    await expect(page.locator('#icon-only')).toHaveAttribute('data-state', 'copied');
    expect(await page.evaluate(() => window.__written)).toEqual([['legacy', '30-71234567-8']]);
    expect(await page.locator('textarea').count()).toBe(0);
  });

  test('when nothing can copy, it says so and shows the x', async ({ page }) => {
    await open(page, 'copy-button');
    await stubClipboard(page, { api: false, legacy: false });
    await page.locator('#icon-only').click();
    await expect(page.locator('#icon-only')).toHaveAttribute('data-state', 'failed');
    await expect(page.locator('#icon-only + [role="status"]')).toHaveText('No se pudo copiar');
    await page.waitForTimeout(400);
    expect(await face(page, '#icon-only', 2).evaluate((n) => getComputedStyle(n).opacity)).toBe('1');
  });

  test('the keyboard copies with Enter and with Space', async ({ page }) => {
    await open(page, 'copy-button');
    await stubClipboard(page);
    await page.locator('#with-text').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#with-text')).toHaveAttribute('data-state', 'copied');
    expect(await page.evaluate(() => window.__written)).toEqual([['api', '30-71234567-8']]);
  });

  test('hovering grows the button 5 % and parts the sheets of the copy icon', async ({ page }) => {
    await open(page, 'copy-button');
    await page.locator('#icon-only').hover();
    const count = () => page.evaluate(() => [...document.querySelectorAll('#icon-only [data-part]')].flatMap((n) => n.getAnimations()).length);
    expect(await count()).toBe(4);
    await page.waitForTimeout(600);
    expect(await count()).toBe(4);
    expect(await page.locator('#icon-only').evaluate((n) => new DOMMatrix(getComputedStyle(n).transform).a)).toBeCloseTo(1.05, 2);
    const rect = await page.evaluate(() => { const t = getComputedStyle(document.querySelector('#icon-only [data-part="rect"]')).transform; return new DOMMatrix(t).e; });
    expect(rect).toBeCloseTo(-3, 1);
  });

  test('reduced motion: the icons fade, they do not scale or blur, and the button does not grow', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page, 'copy-button', { reduced: true });
    await page.locator('#icon-only').hover();
    await page.waitForTimeout(300);
    expect(await page.locator('#icon-only').evaluate((n) => getComputedStyle(n).transform)).toBe('none');
    await page.locator('#icon-only').click();
    await expect(page.locator('#icon-only')).toHaveAttribute('data-state', 'copied');
    await page.waitForTimeout(300);
    const check = await face(page, '#icon-only', 1).evaluate((n) => { const cs = getComputedStyle(n); return { opacity: cs.opacity, transform: cs.transform, filter: cs.filter, durations: n.getAnimations().map((a) => a.effect.getTiming().duration) }; });
    expect(check.opacity).toBe('1');
    expect(check.transform).toBe('none');
    expect(check.filter).toBe('none');
  });

  test('a button without something to copy is an error', async ({ page }) => {
    await open(page, 'copy-button');
    const messages = await page.evaluate(async () => {
      const { mount } = await import('/motion/copy-button.js');
      const run = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
      const b = () => Object.assign(document.createElement('button'), {});
      return [run(() => mount(b(), {})), run(() => mount(b(), { content: 'x', variant: 'neon' }))];
    });
    expect(messages[0]).toContain('needs the text to copy');
    expect(messages[1]).toContain('no variant "neon"');
  });

  test('nothing sticks out and destroy restores the markup', async ({ page }) => {
    await open(page, 'copy-button');
    expect(await leaks(page, '[data-motion="copy-button"]')).toEqual([]);
    const { before, after } = await roundTrip(page, { module: '/motion/copy-button.js', html: '<button data-copy="x" aria-label="Copiar">Copiar texto</button>', mount: {} });
    expect(after).toBe(before);
    const live = await page.evaluate(() => [document.querySelectorAll('[role="status"].visually-hidden').length, document.querySelectorAll('[data-motion="copy-button"]').length]);
    expect(live[0]).toBe(live[1]);
  });
});

// ───────────────────────── Theme toggler ─────────────────────────
const themeOf = (page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const visibleFace = (page, id) => (typeof id === 'string' ? page.locator(id) : id).locator('.tt__icon').evaluateAll((faces) => faces.map((n) => Number(getComputedStyle(n).opacity)));

test.describe('theme toggler', () => {
  test('mounts as a toggle button showing the sun in light and the moon in dark', async ({ page }) => {
    await open(page, 'theme-toggler');
    await expect(page.locator('#main-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#main-toggle')).toHaveAccessibleName('Tema oscuro');
    expect(await visibleFace(page, '#main-toggle')).toEqual([1, 0]);
    await open(page, 'theme-toggler', { theme: 'dark' });
    await expect(page.locator('#main-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect(await visibleFace(page, '#main-toggle')).toEqual([0, 1]);
  });

  test('a click runs a view transition that reveals the new theme from the button, in percent', async ({ page }) => {
    await open(page, 'theme-toggler');
    await page.evaluate(() => {
      window.__vt = 0;
      const start = document.startViewTransition.bind(document);
      document.startViewTransition = (cb) => { window.__vt += 1; return start(cb); };
    });
    const box = await page.locator('#main-toggle').boundingBox();
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.locator('#main-toggle').click();
    const during = await page.evaluate(() => ({ vt: document.documentElement.dataset.themeVt, from: document.documentElement.style.getPropertyValue('--theme-vt-clip-from'), duration: document.documentElement.style.getPropertyValue('--theme-toggle-vt-duration'), count: window.__vt }));
    expect(during.count).toBe(1);
    expect(during.vt).toBe('shape');
    expect(during.duration).toBe('400ms');
    const m = /^circle\(0% at ([\d.]+)% ([\d.]+)%\)$/.exec(during.from);
    expect(m).not.toBeNull();
    const vw = 1280; const vh = 900;
    expect(Number(m[1])).toBeCloseTo(((box.x + box.width / 2) / vw) * 100, 1);
    expect(Number(m[2])).toBeCloseTo(((box.y + box.height / 2) / vh) * 100, 1);
    await expect.poll(() => page.evaluate(() => document.documentElement.getAnimations({ subtree: true }).some((a) => a.effect?.pseudoElement === '::view-transition-new(root)'))).toBe(true);
    await expect.poll(() => themeOf(page)).toBe('dark');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.themeVt ?? 'done'), { timeout: 3000 }).toBe('done');
    await expect(page.locator('#main-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect(await visibleFace(page, '#main-toggle')).toEqual([0, 1]);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(light);
  });

  test('the sun and the moon play their own animation when they come in, and on hover', async ({ page }) => {
    await open(page, 'theme-toggler');
    await page.locator('#main-toggle').click();
    await expect.poll(() => themeOf(page)).toBe('dark');
    const moon = await page.evaluate(() => [...document.querySelectorAll('#main-toggle [data-icon="moon"] [data-part]')].flatMap((n) => n.getAnimations()).length);
    expect(moon).toBe(1);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.themeVt ?? 'done'), { timeout: 3000 }).toBe('done');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);
    await page.locator('#main-toggle').hover();
    const hover = await page.evaluate(() => [...document.querySelectorAll('#main-toggle svg, #main-toggle [data-part]')].flatMap((n) => n.getAnimations()).length);
    expect(hover).toBeGreaterThan(0);
  });

  test('a second click goes back to light', async ({ page }) => {
    await open(page, 'theme-toggler', { theme: 'dark' });
    await page.locator('#main-toggle').click();
    await expect.poll(() => themeOf(page)).toBe('light');
    await expect(page.locator('#main-toggle')).toHaveAttribute('aria-pressed', 'false');
  });

  test('every toggle on the page follows a change that comes from outside', async ({ page }) => {
    await open(page, 'theme-toggler');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const pressed = await page.locator('[data-motion="theme-toggler"]').evaluateAll((all) => all.map((b) => b.getAttribute('aria-pressed')));
    expect(new Set(pressed)).toEqual(new Set(['true']));
    await page.waitForTimeout(400);
    expect(await visibleFace(page, page.locator('[data-motion="theme-toggler"]').nth(3))).toEqual([0, 1]);
  });

  test('the keyboard toggles with Enter', async ({ page }) => {
    await open(page, 'theme-toggler');
    await page.locator('#main-toggle').focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => themeOf(page)).toBe('dark');
  });

  test('reduced motion: the page cross-fades in 140 ms, with no shape and no reveal animation', async ({ page }) => {
    await open(page, 'theme-toggler', { reduced: true });
    await page.locator('#main-toggle').click();
    const during = await page.evaluate(() => ({ vt: document.documentElement.dataset.themeVt, duration: document.documentElement.style.getPropertyValue('--theme-toggle-vt-duration'), from: document.documentElement.style.getPropertyValue('--theme-vt-clip-from') }));
    expect(during.vt).toBe('fade');
    expect(during.duration).toBe('140ms');
    expect(during.from).toBe('');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.documentElement.getAnimations({ subtree: true }).filter((a) => a.effect?.pseudoElement === '::view-transition-new(root)').map((a) => a.effect.getKeyframes().some((k) => k.clipPath)))).not.toContain(true);
    await expect.poll(() => themeOf(page)).toBe('dark');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.themeVt ?? 'done'), { timeout: 3000 }).toBe('done');
  });

  test('without View Transitions the theme changes at once', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(document, 'startViewTransition', { value: undefined, configurable: true }); });
    await open(page, 'theme-toggler');
    await page.locator('#main-toggle').click();
    expect(await themeOf(page)).toBe('dark');
    expect(await page.evaluate(() => document.documentElement.dataset.themeVt ?? 'none')).toBe('none');
  });

  test('the clip paths of every shape start collapsed on the button and end covering the page', async ({ page }) => {
    await open(page, 'theme-toggler');
    const result = await page.evaluate(async () => {
      const { clipPaths, VARIANTS } = await import('/motion/theme-toggler.js');
      const out = {};
      for (const v of VARIANTS) out[v] = clipPaths(v, 100, 50, 1300, 1280, 900);
      let error = '';
      try { clipPaths('triangulo', 0, 0, 1, 1, 1); } catch (e) { error = e.message; }
      return { out, error, variants: VARIANTS };
    });
    expect(result.variants).toEqual(['circle', 'square', 'triangle', 'diamond', 'hexagon', 'rectangle', 'star']);
    for (const [from, to] of Object.values(result.out)) {
      expect(from).toMatch(/^(circle|polygon)\(/);
      expect(to).not.toBe(from);
      expect(`${from}${to}`).not.toMatch(/px/);
    }
    expect(result.error).toContain('no variant "triangulo"');
  });

  test('the storage key is written when asked, and nothing is written when not', async ({ page }) => {
    await open(page, 'theme-toggler');
    const stored = await page.evaluate(async () => {
      const { mount } = await import('/motion/theme-toggler.js');
      const b = document.createElement('button');
      document.body.append(b);
      const api = mount(b, { storageKey: 'ledger-theme' });
      const seen = [];
      b.addEventListener('themechange', (e) => seen.push(e.detail.theme));
      b.click();
      await new Promise((r) => setTimeout(r, 900));
      const out = { stored: localStorage.getItem('ledger-theme'), seen, theme: api.theme };
      api.destroy();
      b.remove();
      return out;
    });
    expect(stored).toEqual({ stored: 'dark', seen: ['dark'], theme: 'dark' });
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'ledger-theme'))).toEqual([]);
  });

  test('nothing sticks out and destroy restores the markup', async ({ page }) => {
    await open(page, 'theme-toggler');
    expect(await leaks(page, '[data-motion="theme-toggler"]')).toEqual([]);
    const { before, after } = await roundTrip(page, { module: '/motion/theme-toggler.js', html: '<button aria-label="Tema">T</button>', mount: {} });
    expect(after).toBe(before);
  });
});

// ───────────────────────── Flip button ─────────────────────────
const flipState = (page, selector) => page.locator(selector).evaluate((b) => {
  const [front, back] = [b.querySelector('[data-face="front"]'), b.querySelector('[data-face="back"]')];
  return { flipped: b.dataset.flipped, front: Number(getComputedStyle(front).opacity), back: Number(getComputedStyle(back).opacity), frontTransform: front.style.transform };
});

test.describe('flip button', () => {
  test('mounts with the front as its name and the back as decoration', async ({ page }) => {
    await open(page, 'flip-button');
    await expect(page.locator('#back-of')).toHaveAccessibleName('Ver dorso');
    await expect(page.locator('#back-of [data-face="back"]')).toHaveAttribute('aria-hidden', 'true');
    expect(await flipState(page, '#back-of')).toMatchObject({ flipped: 'false', front: 1, back: 0 });
  });

  test('hover turns the front away and the back in on an underdamped spring: it overshoots 90 degrees and settles', async ({ page }) => {
    await open(page, 'flip-button');
    const box = await page.locator('#back-of').boundingBox();
    const samples = await page.evaluate(({ x, y }) => new Promise((resolve) => {
      const b = document.querySelector('#back-of');
      const front = b.querySelector('[data-face="front"]');
      const out = [];
      const t0 = performance.now();
      b.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse', clientX: x, clientY: y }));
      const tick = () => { out.push({ deg: parseFloat(/rotateX\((-?[\d.]+)deg\)/.exec(front.style.transform)?.[1] ?? '0'), opacity: Number(getComputedStyle(front).opacity) }); if (performance.now() - t0 < 1200) requestAnimationFrame(tick); else resolve(out); };
      tick();
    }), { x: box.x + 5, y: box.y + 5 });
    expect(samples.some((s) => s.deg > 5 && s.deg < 85)).toBe(true);
    expect(samples.some((s) => s.opacity > 0.1 && s.opacity < 0.9)).toBe(true);
    expect(Math.max(...samples.map((s) => s.deg))).toBeGreaterThan(90.5);
    expect(samples.at(-1).deg).toBeCloseTo(90, 0);
    expect(samples.at(-1).opacity).toBe(0);
  });

  test('a real mouse flips it and leaving flips it back', async ({ page }) => {
    await open(page, 'flip-button');
    await page.locator('#back-of').hover();
    await page.waitForTimeout(900);
    expect(await flipState(page, '#back-of')).toMatchObject({ flipped: 'true', front: 0, back: 1 });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(900);
    expect(await flipState(page, '#back-of')).toMatchObject({ flipped: 'false', front: 1, back: 0 });
  });

  test('the keyboard focus flips it too, and leaving the button turns it back', async ({ page }) => {
    await open(page, 'flip-button');
    await tabTo(page, page.locator('#back-of'));
    await expect(page.locator('#back-of')).toHaveAttribute('data-flipped', 'true');
    await page.keyboard.press('Tab');
    await expect(page.locator('#back-of')).toHaveAttribute('data-flipped', 'false');
  });

  test('the direction decides the axis: top and bottom turn on X, left and right on Y', async ({ page }) => {
    await open(page, 'flip-button');
    const axes = await page.evaluate(async () => {
      const out = {};
      for (const b of document.querySelectorAll('section:nth-of-type(2) [data-motion="flip-button"]')) {
        b.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        await new Promise((r) => setTimeout(r, 60));
        out[b.dataset.from] = b.querySelector('[data-face="front"]').style.transform.match(/(rotate[XY])\(/)[1];
        b.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
      }
      return out;
    });
    expect(axes).toEqual({ top: 'rotateX', bottom: 'rotateX', left: 'rotateY', right: 'rotateY' });
  });

  test('a touch does not flip it: there is no hover to answer', async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 800 }, baseURL: `http://127.0.0.1:${process.env.AU_PORT ?? 8793}` });
    const page = await context.newPage();
    await page.goto('/motion/flip-button.html');
    await page.waitForLoadState('networkidle');
    await page.locator('#back-of').tap();
    await page.waitForTimeout(300);
    expect(await flipState(page, '#back-of')).toMatchObject({ flipped: 'false', front: 1 });
    await context.close();
  });

  test('pressing shrinks it to 95 %', async ({ page }) => {
    await open(page, 'flip-button');
    const box = await page.locator('#back-of').boundingBox();
    await page.mouse.move(box.x + 8, box.y + 8);
    await page.mouse.down();
    await page.waitForTimeout(400);
    expect(await page.locator('#back-of').evaluate((n) => new DOMMatrix(getComputedStyle(n).transform).a)).toBeCloseTo(0.95, 2);
    await page.mouse.up();
  });

  test('reduced motion: no turn, the faces cross-fade', async ({ page }) => {
    await open(page, 'flip-button', { reduced: true });
    await page.locator('#back-of').hover();
    await page.waitForTimeout(300);
    const state = await page.locator('#back-of').evaluate((b) => { const f = b.querySelector('[data-face="front"]'); return { transform: f.style.transform, duration: getComputedStyle(f).transitionDuration, opacity: getComputedStyle(f).opacity }; });
    expect(state.transform).toBe('none');
    expect(state.opacity).toBe('0');
    expect(state.duration.split(', ')).toContain('0.14s');
  });

  test('a bad direction is an error', async ({ page }) => {
    await open(page, 'flip-button');
    const message = await page.evaluate(async () => { const { mount } = await import('/motion/flip-button.js'); try { mount(document.createElement('button'), { from: 'arriba', front: 'a', back: 'b' }); return ''; } catch (e) { return e.message; } });
    expect(message).toContain('from is top, bottom, left, right');
  });

  test('nothing sticks out and destroy restores the markup', async ({ page }) => {
    await open(page, 'flip-button');
    expect(await leaks(page, '[data-motion="flip-button"]')).toEqual([]);
    const { before, after } = await roundTrip(page, { module: '/motion/flip-button.js', html: '<button>Hola</button>', mount: { front: 'Hola', back: 'Chau' } });
    expect(after).toBe(before);
  });
});

// ───────────────────────── Flip card ─────────────────────────
const cardState = (page, selector) => page.locator(selector).evaluate((card) => {
  const f = card.querySelector(':scope > [data-face="front"]');
  const b = card.querySelector(':scope > [data-face="back"]');
  const m = (n) => { const t = getComputedStyle(n).transform; return t === 'none' ? 1 : new DOMMatrix(t).m11; };
  return { flipped: card.dataset.flipped, frontCos: m(f), backCos: m(b), frontInert: f.inert, backInert: b.inert, frontHidden: f.getAttribute('aria-hidden'), backHidden: b.getAttribute('aria-hidden') };
});

test.describe('flip card', () => {
  test('mounts as a group showing the front, with the back inert and hidden from assistive technology', async ({ page }) => {
    await open(page, 'flip-card');
    await expect(page.locator('.invoice')).toHaveAttribute('role', 'group');
    await expect(page.locator('.invoice')).toHaveAttribute('aria-label', 'Factura A 0001-00004821');
    expect(await cardState(page, '.invoice')).toMatchObject({ flipped: 'false', frontCos: 1, frontInert: false, backInert: true, frontHidden: 'false', backHidden: 'true' });
    expect(await page.locator('.invoice > [data-face]').evaluateAll((n) => n.map((x) => getComputedStyle(x).backfaceVisibility))).toEqual(['hidden', 'hidden']);
  });

  test('«Ver dorso» turns the card on Y in 500 ms: half turned in the middle, the back facing at the end', async ({ page }) => {
    await open(page, 'flip-card');
    const frames = await page.evaluate(() => new Promise((resolve) => {
      const front = document.querySelector('.invoice [data-face="front"]');
      const out = [];
      const t0 = performance.now();
      document.querySelector('.invoice [data-face="front"] [data-flip-toggle]').click();
      const tick = () => { out.push(new DOMMatrix(getComputedStyle(front).transform).m11); if (performance.now() - t0 < 800) requestAnimationFrame(tick); else resolve(out); };
      tick();
    }));
    expect(frames.some((c) => c < 0.8 && c > -0.8)).toBe(true);
    expect(frames.at(-1)).toBeCloseTo(-1, 1);
    expect(await cardState(page, '.invoice')).toMatchObject({ flipped: 'true', frontInert: true, backInert: false });
    expect((await cardState(page, '.invoice')).backCos).toBeCloseTo(1, 1);
  });

  test('from the keyboard the focus follows to the toggle of the face that appears, and back', async ({ page }) => {
    await open(page, 'flip-card');
    await page.locator('.invoice [data-face="front"] [data-flip-toggle]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.invoice [data-face="back"] [data-flip-toggle]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.invoice [data-face="front"] [data-flip-toggle]')).toBeFocused();
    await expect(page.locator('.invoice')).toHaveAttribute('data-flipped', 'false');
  });

  test('a click on the body turns a click card, and the flip event says so', async ({ page }) => {
    await open(page, 'flip-card');
    await page.evaluate(() => { window.__flips = []; document.querySelector('.invoice').addEventListener('flip', (e) => window.__flips.push(e.detail.flipped)); });
    await page.locator('.invoice .client').click();
    await expect(page.locator('.invoice')).toHaveAttribute('data-flipped', 'true');
    await page.locator('.invoice [data-face="back"] .meta').click();
    await expect(page.locator('.invoice')).toHaveAttribute('data-flipped', 'false');
    expect(await page.evaluate(() => window.__flips)).toEqual([true, false]);
  });

  test('the client card has a visual anchor on the front and a centred, bold, 16 px set of figures on the back', async ({ page }) => {
    await open(page, 'flip-card');
    const card = '[aria-label="Cliente Estudio Quiroga y Asoc."]';
    const logo = await page.locator(`${card} .logo`).evaluate((n) => { const r = n.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), radius: getComputedStyle(n).borderRadius }; });
    expect(logo).toEqual({ w: 64, h: 64, radius: '50%' });
    await page.locator(card).hover();
    await expect(page.locator(card)).toHaveAttribute('data-flipped', 'true');
    await page.waitForTimeout(700);
    const back = await page.locator(`${card} [data-face="back"]`).evaluate((face) => {
      const f = face.getBoundingClientRect();
      const stats = face.querySelector('.stats').getBoundingClientRect();
      const figures = [...face.querySelectorAll('.stat b')].map((b) => { const s = getComputedStyle(b); return [Number(s.fontWeight), s.fontSize]; });
      const kids = [...face.children].filter((n) => !n.matches('[data-flip-toggle]')).map((n) => n.getBoundingClientRect());
      const gaps = kids.slice(1).map((r, i) => r.top - kids[i].bottom);
      const items = [...face.querySelectorAll('.stat')].map((n) => { const r = n.getBoundingClientRect(); return (r.left + r.right) / 2; });
      const first = Math.min(...kids.map((r) => r.top));
      return { centred: (stats.left + stats.right) / 2 - (f.left + f.right) / 2, spread: (items[0] + items[1]) / 2 - (f.left + f.right) / 2, figures, gaps, top: first - f.top };
    });
    expect(Math.abs(back.centred)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.spread)).toBeLessThanOrEqual(2);
    expect(back.figures).toEqual([[700, '16px'], [700, '16px']]);
    expect(Math.max(...back.gaps)).toBeLessThanOrEqual(32);
  });

  test('a hover card turns with the mouse and back on leaving, and its button wins over the hover', async ({ page }) => {
    await open(page, 'flip-card');
    const card = page.locator('[aria-label="Cliente Estudio Quiroga y Asoc."]');
    await card.hover();
    await expect(card).toHaveAttribute('data-flipped', 'true');
    await page.locator('[aria-label="Cliente Estudio Quiroga y Asoc."] [data-face="back"] [data-flip-toggle]').click();
    await expect(card).toHaveAttribute('data-flipped', 'false');
    await page.mouse.move(0, 0);
    await card.hover();
    await expect(card).toHaveAttribute('data-flipped', 'true');
    await page.mouse.move(0, 0);
    await expect(card).toHaveAttribute('data-flipped', 'false');
  });

  test('a touch turns a hover card on tap', async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 900 }, baseURL: `http://127.0.0.1:${process.env.AU_PORT ?? 8793}` });
    const page = await context.newPage();
    await page.goto('/motion/flip-card.html');
    await page.waitForLoadState('networkidle');
    const card = page.locator('[aria-label="Cliente Estudio Quiroga y Asoc."]');
    await card.locator('[data-face="front"]').tap({ position: { x: 20, y: 20 } });
    await expect(card).toHaveAttribute('data-flipped', 'true');
    await card.locator('[data-face="back"]').tap({ position: { x: 20, y: 20 } });
    await expect(card).toHaveAttribute('data-flipped', 'false');
    await context.close();
  });

  test('reduced motion: nothing turns, the faces cross-fade', async ({ page }) => {
    await open(page, 'flip-card', { reduced: true });
    await page.locator('.invoice [data-face="front"] [data-flip-toggle]').click();
    await page.waitForTimeout(300);
    const state = await page.locator('.invoice').evaluate((c) => [...c.querySelectorAll(':scope > [data-face]')].map((n) => { const cs = getComputedStyle(n); return [cs.transform, cs.opacity, cs.transitionDuration.split(',').map((d) => parseFloat(d) * 1000)]; }));
    expect(state.map(([transform, opacity]) => [transform, opacity])).toEqual([['none', '0'], ['none', '1']]);
    for (const [, , durations] of state) {
      expect(durations.length).toBeGreaterThan(0);
      for (const d of durations) expect(d).toBeLessThanOrEqual(150);
    }
  });

  test('a face that is taller than the card scrolls instead of sticking out', async ({ page }) => {
    await open(page, 'flip-card');
    expect(await leaks(page, '[data-motion="flip-card"]')).toEqual([]);
    const overflow = await page.locator('.invoice > [data-face="front"]').evaluate((n) => getComputedStyle(n).overflowY);
    expect(overflow).toBe('auto');
  });

  test('a card without toggles gets one on each face, and destroy takes them away', async ({ page }) => {
    await open(page, 'flip-card');
    const result = await page.evaluate(async () => {
      const host = Object.assign(document.createElement('div'), { innerHTML: '<div><div data-face="front">F</div><div data-face="back">B</div></div>' });
      document.body.append(host);
      const { mount } = await import('/motion/flip-card.js');
      const api = mount(host.firstElementChild, { trigger: 'click' });
      const toggles = [...host.querySelectorAll('[data-flip-toggle]')].map((b) => b.textContent);
      api.destroy();
      const left = host.innerHTML.replace(/ (style|class)=""/g, '');
      host.remove();
      return { toggles, left };
    });
    expect(result.toggles).toEqual(['Ver dorso', 'Ver frente']);
    expect(result.left).toBe('<div><div data-face="front">F</div><div data-face="back">B</div></div>');
  });

  test('a card without both faces, or with a bad trigger, is an error', async ({ page }) => {
    await open(page, 'flip-card');
    const messages = await page.evaluate(async () => {
      const { mount } = await import('/motion/flip-card.js');
      const run = (html, opts) => { const el = Object.assign(document.createElement('div'), { innerHTML: html }).firstElementChild; try { mount(el, opts); return ''; } catch (e) { return e.message; } };
      return [run('<div><div data-face="front"></div></div>'), run('<div><div data-face="front"></div><div data-face="back"></div></div>', { trigger: 'doble' })];
    });
    expect(messages[0]).toContain('needs a [data-face="front"]');
    expect(messages[1]).toContain('trigger is "hover" or "click"');
  });
});

// ───────────────────────── Icons ─────────────────────────
const REQUIRED = ['plus', 'x', 'check', 'search', 'send', 'trash', 'copy', 'users', 'settings', 'layout-dashboard', 'bell', 'refresh'];
// How many tracks Animate UI's default animation runs per icon (a part with two tracks counts twice).
const TRACKS = { plus: 2, x: 2, check: 3, search: 1, send: 3, trash: 3, copy: 4, users: 4, settings: 1, 'layout-dashboard': 6, bell: 2, refresh: 1, sun: 16, moon: 1 };
const playing = (page, name) => page.evaluate((name) => {
  const svg = document.querySelector(`#tiles svg[data-icon="${name}"]`);
  return [svg, ...svg.querySelectorAll('[data-part]')].flatMap((n) => n.getAnimations()).length;
}, name);

test.describe('animated icons', () => {
  test('every icon Ledger uses is there as inline svg, decorative, 24-unit', async ({ page }) => {
    await open(page, 'icons');
    const names = await page.evaluate(async () => (await import('/motion/icons.js')).ICON_NAMES);
    for (const name of REQUIRED) expect(names).toContain(name);
    for (const name of names.filter((n) => n !== 'minus')) {
      const info = await page.evaluate((name) => { const svg = document.querySelector(`#tiles svg[data-icon="${name}"]`); return svg && { box: svg.getAttribute('viewBox'), hidden: svg.getAttribute('aria-hidden'), stroke: svg.getAttribute('stroke'), width: svg.getBoundingClientRect().width }; }, name);
      expect(info, name).toEqual({ box: '0 0 24 24', hidden: 'true', stroke: 'currentColor', width: 28 });
    }
  });

  for (const [name, tracks] of Object.entries(TRACKS)) {
    test(`${name}: hover plays its ${tracks} tracks and leaving plays them back until nothing is left running`, async ({ page }) => {
      await open(page, 'icons');
      const tile = page.locator(`#tiles .tile:has(svg[data-icon="${name}"])`);
      await tile.hover();
      expect(await playing(page, name)).toBe(tracks);
      await page.mouse.move(0, 0);
      await expect.poll(() => playing(page, name), { timeout: 3000 }).toBe(0);
    });
  }

  test('the parts really move in the middle of the animation (plus turns, bell swings, trash lid dips)', async ({ page }) => {
    await open(page, 'icons');
    const midTransform = async (name, part) => {
      await page.locator(`#tiles .tile:has(svg[data-icon="${name}"])`).hover();
      await page.waitForTimeout(200);
      const t = await page.evaluate(({ name, part }) => { const svg = document.querySelector(`#tiles svg[data-icon="${name}"]`); return getComputedStyle(part === 'root' ? svg : svg.querySelector(`[data-part="${part}"]`)).transform; }, { name, part });
      await page.mouse.move(0, 0);
      await page.waitForTimeout(500);
      return t;
    };
    expect(matrixOf(await midTransform('plus', 'line2')).b).not.toBe(0);
    expect(matrixOf(await midTransform('bell', 'clapper')).e).not.toBe(0);
    expect(matrixOf(await midTransform('trash', 'lid')).f).toBeGreaterThan(0);
  });

  test('the sun draws its rays one after the other: eight rays, 150 ms apart', async ({ page }) => {
    await open(page, 'icons');
    await page.locator('#tiles .tile:has(svg[data-icon="sun"])').hover();
    const delays = await page.evaluate(() => [...document.querySelectorAll('#tiles svg[data-icon="sun"] [data-part]')].map((n) => n.getAnimations()[0].effect.getTiming().delay));
    expect(delays.map(Math.round)).toEqual([0, 150, 300, 450, 600, 750, 900, 1050]);
  });

  test('the keyboard focus plays it too, and a touch does not', async ({ page }) => {
    await open(page, 'icons');
    await tabTo(page, page.locator('#tiles .tile').first());
    expect(await playing(page, 'plus')).toBe(2);
    await page.keyboard.press('Tab');
    await expect.poll(() => playing(page, 'plus'), { timeout: 3000 }).toBe(0);
    const touched = await page.evaluate(() => {
      const tile = document.querySelector('#tiles .tile:has(svg[data-icon="bell"])');
      tile.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }));
      return [...tile.querySelectorAll('[data-part]')].flatMap((n) => n.getAnimations()).length;
    });
    expect(touched).toBe(0);
  });

  test('icons inside a button play when the button is hovered, not only the icon', async ({ page }) => {
    await open(page, 'icons');
    await page.getByRole('button', { name: /Nueva factura/ }).hover();
    const n = await page.evaluate(() => [...document.querySelectorAll('.inline .btn--primary [data-part]')].flatMap((p) => p.getAnimations()).length);
    expect(n).toBe(2);
  });

  test('reduced motion: the drawing fades in 140 ms and its parts stay still', async ({ page }) => {
    await open(page, 'icons', { reduced: true });
    await page.locator('#tiles .tile:has(svg[data-icon="bell"])').hover();
    const state = await page.evaluate(() => {
      const svg = document.querySelector('#tiles svg[data-icon="bell"]');
      return { parts: [...svg.querySelectorAll('[data-part]')].flatMap((n) => n.getAnimations()).length, own: svg.getAnimations().map((a) => a.effect.getTiming().duration) };
    });
    expect(state).toEqual({ parts: 0, own: [140] });
  });

  test('iconSvg draws the static icon, and an unknown name is an error', async ({ page }) => {
    await open(page, 'icons');
    const result = await page.evaluate(async () => {
      const { iconSvg } = await import('/motion/icons.js');
      let message = '';
      try { iconSvg('hexagono'); } catch (e) { message = e.message; }
      return { svg: iconSvg('check', { size: 16, label: 'Hecho' }), message };
    });
    expect(result.svg).toContain('width="16"');
    expect(result.svg).toContain('role="img" aria-label="Hecho"');
    expect(result.message).toContain('no icon called "hexagono"');
  });

  test('nothing sticks out of a tile, and destroy removes the drawing and the listeners', async ({ page }) => {
    await open(page, 'icons');
    expect(await leaks(page, '#tiles .tile')).toEqual([]);
    const result = await page.evaluate(async () => {
      const { mount } = await import('/motion/icons.js');
      const host = Object.assign(document.createElement('button'), { innerHTML: '<span></span>' });
      document.body.append(host);
      const api = mount(host.firstElementChild, { name: 'plus' });
      const had = host.querySelectorAll('svg').length;
      api.destroy();
      host.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      const out = { had, left: host.innerHTML, animations: host.getAnimations({ subtree: true }).length };
      host.remove();
      return out;
    });
    expect(result).toEqual({ had: 1, left: '<span></span>', animations: 0 });
  });
});

// ───────────────────────── Accessibility ─────────────────────────
// WCAG 2.2 AA: axe leaves `target-size` (2.5.8) off unless asked.
const AXE_OPTIONS = { resultTypes: ['violations'], rules: { 'target-size': { enabled: true } } };
const axeFile = (() => { try { return createRequire(import.meta.url).resolve('axe-core/axe.min.js'); } catch { return process.env.AXE_CORE ?? null; } })();
for (const name of ['tabs', 'sliding-number', 'copy-button', 'theme-toggler', 'flip-button', 'flip-card', 'icons']) {
  for (const theme of ['light', 'dark']) {
    test(`axe: ${name} · ${theme} has no serious or critical violations`, async ({ page }) => {
      test.skip(!axeFile, 'axe-core is not installed: set AXE_CORE to its axe.min.js');
      // axe reads the @import of a stylesheet relative to the page, not to the sheet: send those to the real files.
      await page.route(/\/motion\/(tokens|primitives|effects|life|showcase|components)\.css$/, (route) => route.continue({ url: route.request().url().replace('/motion/', '/') }));
      await open(page, name, { theme });
      await page.waitForTimeout(700);
      await page.addScriptTag({ path: axeFile });
      const violations = await page.evaluate(async (options) => (await window.axe.run(document, options)).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), AXE_OPTIONS);
      expect(violations).toEqual([]);
    });
  }
}
