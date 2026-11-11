// Tests of the Aceternity ports (animated-tooltip, expandable-card, focus-cards, floating-dock,
// sticky-scroll-reveal), each against its own demo page: it mounts, answers to the mouse, the touch and the
// keyboard, ends in the right state, keeps its feedback under reduced motion, draws nothing outside its
// container, logs no console error and leaves no node behind after `destroy()`.
import { test, expect } from '@playwright/test';

const PORT = process.env.AC_PORT ?? 8745;
const url = (name) => `http://127.0.0.1:${PORT}/motion/${name}.html`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const errors = new WeakMap();
test.beforeEach(({ page }) => {
  const list = [];
  errors.set(page, list);
  page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); });
  page.on('pageerror', (e) => list.push(e.message));
});
test.afterEach(({ page }) => { expect(errors.get(page), 'console and page errors').toEqual([]); });

const open = async (page, name) => { await page.goto(url(name)); await page.waitForLoadState('networkidle'); };
const destroy = (page, module, selector) => page.evaluate(async ([module, selector]) => {
  const { mount } = await import(`./${module}.js`);
  mount(document.querySelector(selector)).destroy();
}, [module, selector]);
// Every visible descendant of `root` lies inside the rectangle of `box` (a pixel of tolerance).
const containedIn = (page, root, box) => page.evaluate(([root, box]) => {
  const b = document.querySelector(box).getBoundingClientRect();
  return [...document.querySelector(root).querySelectorAll('*')].filter((n) => {
    const s = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    if (!r.width || !r.height || s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    return r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1;
  }).map((n) => n.className || n.tagName);
}, [root, box]);
// Every demo opens with the two buttons of its theme switch: the component's first stop is the third.
const tab = async (page, times) => { for (let i = 0; i < times; i++) await page.keyboard.press('Tab'); };
const rectOf =(loc) => loc.evaluate((n) => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });

// ───────────────────────── animated-tooltip ─────────────────────────
test.describe('animated-tooltip', () => {
  test('hover raises the tooltip with its name and role, and it tilts and slides with the pointer', async ({ page }) => {
    await open(page, 'animated-tooltip');
    const item = page.locator('#team .ac-tip__item').nth(2);
    await expect(item).toHaveAttribute('aria-label', 'Paula Benítez');
    const r = await rectOf(item);
    await page.mouse.move(r.cx, r.cy);
    const tip = item.locator('.ac-tip__tip');
    await expect(tip).toHaveAttribute('role', 'tooltip');
    await expect(tip).toContainText('Paula Benítez');
    await expect(tip).toContainText('Facturación');
    await expect(item).toHaveAttribute('aria-describedby', await tip.getAttribute('id'));
    await page.mouse.move(r.x + r.w * 0.92, r.cy, { steps: 4 });
    await wait(900);
    const right = parseFloat(await page.locator('#team').evaluate((n) => n.style.getPropertyValue('--ac-tip-r')));
    const shiftRight = parseFloat(await page.locator('#team').evaluate((n) => n.style.getPropertyValue('--ac-tip-x')));
    expect(right).toBeGreaterThan(5);
    expect(shiftRight).toBeGreaterThan(5);
    await page.mouse.move(r.x + r.w * 0.08, r.cy, { steps: 4 });
    await wait(900);
    expect(parseFloat(await page.locator('#team').evaluate((n) => n.style.getPropertyValue('--ac-tip-r')))).toBeLessThan(-5);
    // at rest the tooltip is fully shown, at scale 1
    await wait(600);
    const rest = await tip.evaluate((n) => ({ o: getComputedStyle(n).opacity, t: n.style.transform }));
    expect(rest.o).toBe('1');
    expect(rest.t).toMatch(/scale\(1(\.0+)?\)/);
  });

  test('the tooltip springs: it overshoots its resting scale on the way in', async ({ page }) => {
    await open(page, 'animated-tooltip');
    const item = page.locator('#team .ac-tip__item').nth(1);
    const r = await rectOf(item);
    await page.evaluate(() => {
      window.__scales = [];
      const watch = () => { const t = document.querySelector('.ac-tip__tip'); if (t) window.__scales.push(parseFloat(/scale\(([\d.]+)\)/.exec(t.style.transform)?.[1] ?? '0')); requestAnimationFrame(watch); };
      watch();
    });
    await page.mouse.move(r.cx, r.cy);
    await wait(1200);
    const scales = await page.evaluate(() => window.__scales.filter(Boolean));
    expect(Math.min(...scales)).toBeLessThan(0.8);
    expect(Math.max(...scales)).toBeGreaterThan(1.05);
  });

  test('leaving removes the tooltip; moving to the next avatar swaps it', async ({ page }) => {
    await open(page, 'animated-tooltip');
    const items = page.locator('#team .ac-tip__item');
    const a = await rectOf(items.nth(0));
    const b = await rectOf(items.nth(3));
    await page.mouse.move(a.cx, a.cy);
    await expect(page.locator('#team .ac-tip__tip')).toHaveCount(1);
    await page.mouse.move(b.cx, b.cy, { steps: 6 });
    await expect(items.nth(3).locator('.ac-tip__tip')).toContainText('Nicolás Roldán');
    await expect(page.locator('#team .ac-tip__tip')).toHaveCount(1, { timeout: 2500 });
    await page.mouse.move(0, 0);
    await expect(page.locator('#team .ac-tip__tip')).toHaveCount(0, { timeout: 2500 });
  });

  test('keyboard: focus shows it untilted, Escape hides it', async ({ page }) => {
    await open(page, 'animated-tooltip');
    await tab(page, 3);
    const focused = page.locator('#team .ac-tip__item:focus-visible');
    await expect(focused.locator('.ac-tip__tip')).toBeVisible();
    await wait(700);
    expect(parseFloat(await page.locator('#team').evaluate((n) => n.style.getPropertyValue('--ac-tip-r')))).toBeCloseTo(0, 0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#team .ac-tip__tip')).toHaveCount(0, { timeout: 2500 });
  });

  test('touch: a tap shows it and it stays until a tap elsewhere', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await open(page, 'animated-tooltip');
    await page.locator('#team .ac-tip__item').nth(4).tap();
    await wait(600);
    await expect(page.locator('#team .ac-tip__tip')).toHaveCount(1);
    await page.touchscreen.tap(10, 400);
    await expect(page.locator('#team .ac-tip__tip')).toHaveCount(0, { timeout: 2500 });
    await ctx.close();
  });

  test('draws inside its stage, in both themes, with legible text', async ({ page }) => {
    await open(page, 'animated-tooltip');
    for (const theme of ['light', 'dark']) {
      await page.locator(`[data-ac-theme=${theme}]`).click();
      const r = await rectOf(page.locator('#team .ac-tip__item').nth(2));
      await page.mouse.move(r.cx, r.cy);
      await wait(900);
      expect(await containedIn(page, '#stage-team', '#stage-team')).toEqual([]);
      const ratio = await page.locator('.ac-tip__name').evaluate((n) => {
        const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        const rgb = (c) => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data]; };
        const lum = ([r, g, b]) => [r, g, b].map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        const fg = lum(rgb(getComputedStyle(n).color));
        const bg = lum(rgb(getComputedStyle(n.parentElement).backgroundColor));
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      await page.mouse.move(0, 0);
      await wait(900);
    }
  });

  test('destroy leaves no tooltip, no attribute and no style behind', async ({ page }) => {
    await open(page, 'animated-tooltip');
    const r = await rectOf(page.locator('#team .ac-tip__item').nth(0));
    await page.mouse.move(r.cx, r.cy);
    await wait(300);
    await destroy(page, 'animated-tooltip', '#team');
    const left = await page.locator('#team').evaluate((n) => ({ tips: n.querySelectorAll('.ac-tip__tip').length, cls: n.className, style: n.style.length, described: n.querySelectorAll('[aria-describedby]').length }));
    expect(left).toEqual({ tips: 0, cls: '', style: 0, described: 0 });
  });

  test('mounting an element with no avatars is an error, not a silent empty row', async ({ page }) => {
    await open(page, 'animated-tooltip');
    const message = await page.evaluate(async () => {
      const { mount } = await import('./animated-tooltip.js');
      try { mount(document.createElement('div')); return 'mounted'; } catch (e) { return e.message; }
    });
    expect(message).toMatch(/data-name/);
  });
});

test.describe('animated-tooltip with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('it fades in with no tilt, no travel and no bounce', async ({ page }) => {
    await open(page, 'animated-tooltip');
    const item = page.locator('#team .ac-tip__item').nth(2);
    const r = await rectOf(item);
    await page.mouse.move(r.cx, r.cy);
    const tip = item.locator('.ac-tip__tip');
    await expect(tip).toHaveAttribute('data-state', 'in');
    await page.mouse.move(r.x + r.w * 0.9, r.cy, { steps: 4 });
    await wait(300);
    expect(await tip.evaluate((n) => n.style.transform)).toBe('');
    expect(await tip.evaluate((n) => getComputedStyle(n).transitionDuration)).toBe('0.12s');
    expect(parseFloat(await page.locator('#team').evaluate((n) => n.style.getPropertyValue('--ac-tip-r')))).toBeCloseTo(0, 0);
    await page.mouse.move(0, 0);
    await expect(page.locator('#team .ac-tip__tip')).toHaveCount(0, { timeout: 1500 });
  });
});

// ───────────────────────── focus-cards ─────────────────────────
test.describe('focus-cards', () => {
  test('hover lights one card and blurs and shrinks the others', async ({ page }) => {
    await open(page, 'focus-cards');
    const cards = page.locator('#templates .ac-focus__card');
    await expect(cards).toHaveCount(6);
    const r = await rectOf(cards.nth(1));
    expect(await cards.nth(0).evaluate((n) => getComputedStyle(n).filter)).toBe('none');
    await page.mouse.move(r.cx, r.cy);
    await wait(500);
    await expect(cards.nth(1)).toHaveAttribute('data-state', 'active');
    expect(await cards.nth(1).locator('.ac-focus__cap').evaluate((n) => getComputedStyle(n).opacity)).toBe('1');
    expect(await cards.nth(1).evaluate((n) => getComputedStyle(n).filter)).toBe('none');
    for (const i of [0, 2, 3, 4, 5]) {
      const s = await cards.nth(i).evaluate((n) => ({ f: getComputedStyle(n).filter, t: getComputedStyle(n).transform }));
      expect(s.f).toBe('blur(8px)');
      expect(s.t).toBe('matrix(0.98, 0, 0, 0.98, 0, 0)');
    }
    await page.mouse.move(0, 0);
    await wait(500);
    for (let i = 0; i < 6; i++) {
      expect(await cards.nth(i).evaluate((n) => getComputedStyle(n).filter)).toBe('none');
      expect(await cards.nth(i).locator('.ac-focus__cap').evaluate((n) => getComputedStyle(n).opacity)).toBe('0');
    }
  });

  test('the change takes 300 ms, not an instant', async ({ page }) => {
    await open(page, 'focus-cards');
    const cards = page.locator('#templates .ac-focus__card');
    const r = await rectOf(cards.nth(1));
    // The transition is observed, not timed: the listener freezes it the moment it runs, 40 % of the way through.
    await cards.nth(0).evaluate((n) => {
      window.__seen = null;
      n.addEventListener('transitionrun', (e) => {
        if (e.propertyName !== 'filter' || window.__seen) return;
        const a = n.getAnimations().find((x) => x.transitionProperty === 'filter');
        const duration = a.effect.getComputedTiming().duration;
        a.pause();
        a.currentTime = duration * 0.4;
        window.__seen = { duration, mid: parseFloat(getComputedStyle(n).filter.replace(/[^\d.]/g, '')) || 0 };
      });
    });
    await page.mouse.move(r.cx, r.cy);
    await page.waitForFunction(() => window.__seen);
    const seen = await page.evaluate(() => window.__seen);
    expect(seen.duration).toBe(300);
    expect(seen.mid).toBeGreaterThan(0);
    expect(seen.mid).toBeLessThan(8);
  });

  test('keyboard: focus does what hover does, and each card has a visible ring', async ({ page }) => {
    await open(page, 'focus-cards');
    await tab(page, 4);
    const cards = page.locator('#templates .ac-focus__card');
    await expect(cards.nth(1)).toHaveAttribute('data-state', 'active');
    await expect(cards.nth(0)).toHaveAttribute('data-state', 'dim');
    expect(await cards.nth(1).evaluate((n) => getComputedStyle(n).outlineStyle)).toBe('solid');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(cards.nth(1)).not.toHaveAttribute('data-state', /.+/);
  });

  test('touch: a tap activates the card and a tap outside clears it', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await open(page, 'focus-cards');
    await page.locator('#templates .ac-focus__card').nth(2).tap();
    await expect(page.locator('#templates .ac-focus__card').nth(2)).toHaveAttribute('data-state', 'active');
    await page.touchscreen.tap(5, 5);
    await expect(page.locator('#templates .ac-focus__card[data-state]')).toHaveCount(0);
    await ctx.close();
  });

  test('draws inside its stage and stacks to one column on a phone', async ({ page }) => {
    await open(page, 'focus-cards');
    const r = await rectOf(page.locator('#templates .ac-focus__card').nth(0));
    await page.mouse.move(r.cx, r.cy);
    await wait(500);
    expect(await containedIn(page, '#stage-templates', '#stage-templates')).toEqual([]);
    await page.setViewportSize({ width: 390, height: 800 });
    const a = await rectOf(page.locator('#templates .ac-focus__card').nth(0));
    const b = await rectOf(page.locator('#templates .ac-focus__card').nth(1));
    expect(b.y).toBeGreaterThan(a.y + a.h);
    expect(a.h).toBe(240);
  });

  test('destroy removes every state', async ({ page }) => {
    await open(page, 'focus-cards');
    const r = await rectOf(page.locator('#templates .ac-focus__card').nth(1));
    await page.mouse.move(r.cx, r.cy);
    await destroy(page, 'focus-cards', '#templates');
    expect(await page.locator('#templates [data-state]').count()).toBe(0);
    expect(await page.locator('#templates').evaluate((n) => n.className + n.hasAttribute('data-focused'))).toBe('false');
  });
});

test.describe('focus-cards with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the others dim instead of blurring and shrinking', async ({ page }) => {
    await open(page, 'focus-cards');
    const cards = page.locator('#templates .ac-focus__card');
    const r = await rectOf(cards.nth(1));
    await page.mouse.move(r.cx, r.cy);
    await wait(300);
    const s = await cards.nth(0).evaluate((n) => ({ f: getComputedStyle(n).filter, t: getComputedStyle(n).transform, o: getComputedStyle(n).opacity, d: getComputedStyle(n).transitionDuration }));
    expect(s.f).toBe('none');
    expect(s.t).toBe('none');
    expect(Number(s.o)).toBeLessThan(0.7);
    expect(s.d).toContain('0.12s');
  });
});

// ───────────────────────── floating-dock ─────────────────────────
test.describe('floating-dock', () => {
  const tiles = (page) => page.locator('#dock .ac-dock__tile');
  const widths = (page) => tiles(page).evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().width));

  test('at rest the tiles are 40 px and the bar is 64 px tall', async ({ page }) => {
    await open(page, 'floating-dock');
    expect((await widths(page)).map(Math.round)).toEqual([40, 40, 40, 40, 40, 40, 40]);
    expect((await rectOf(page.locator('#dock .ac-dock__bar'))).h).toBe(64);
  });

  test('the tile under the pointer grows to 80 px, its neighbours by distance, and they relax when it leaves', async ({ page }) => {
    await open(page, 'floating-dock');
    const first = await rectOf(page.locator('#dock .ac-dock__link').nth(0));
    const bar = await rectOf(page.locator('#dock .ac-dock__bar'));
    const plateRest = (await rectOf(page.locator('#dock .ac-dock__plate'))).w;
    await page.mouse.move(first.cx, first.cy - 6, { steps: 3 });
    await wait(900);
    const w = await widths(page);
    expect(w[0]).toBeGreaterThan(74);
    expect(w[0]).toBeGreaterThan(w[1]);
    expect(w[1]).toBeGreaterThan(w[2]);
    expect(w[2]).toBeGreaterThanOrEqual(w[6]);
    expect(Math.round(w[6])).toBe(40);
    // the bar keeps its height and the tile grows upward from the bar's floor
    const t0 = await rectOf(tiles(page).nth(0));
    expect(t0.y + t0.h).toBeCloseTo(bar.y + bar.h - 12, 0);
    expect(t0.y).toBeLessThan(bar.y);
    // the plate widens with what the tiles gained, with its corners still round
    expect((await rectOf(page.locator('#dock .ac-dock__plate'))).w).toBeGreaterThan(plateRest + 30);
    expect(await page.locator('#dock .ac-dock__plate').evaluate((n) => n.style.clipPath)).toMatch(/round/);
    await page.mouse.move(bar.cx, bar.y - 200, { steps: 3 });
    await wait(1200);
    expect((await widths(page)).map(Math.round)).toEqual([40, 40, 40, 40, 40, 40, 40]);
  });

  test('the growth follows a spring: it is not instant, never dips under 40 px and settles at 80 px', async ({ page }) => {
    await open(page, 'floating-dock');
    const mid = await rectOf(page.locator('#dock .ac-dock__link').nth(3));
    await page.evaluate(() => {
      window.__w = [];
      const watch = () => { window.__w.push(document.querySelectorAll('#dock .ac-dock__tile')[3].getBoundingClientRect().width); requestAnimationFrame(watch); };
      watch();
    });
    await page.mouse.move(mid.cx, mid.cy);
    await wait(1200);
    const seen = await page.evaluate(() => window.__w);
    expect(seen.some((w) => w > 45 && w < 75)).toBe(true);
    expect(Math.max(...seen)).toBeCloseTo(80, 0);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(39.5);
  });

  test('the label rises over the hovered tile and goes when it leaves', async ({ page }) => {
    await open(page, 'floating-dock');
    const link = page.locator('#dock .ac-dock__link').nth(2);
    const label = link.locator('.ac-dock__label');
    expect(await label.evaluate((n) => getComputedStyle(n).opacity)).toBe('0');
    const r = await rectOf(link);
    await page.mouse.move(r.cx, r.cy);
    await wait(700);
    expect(await label.evaluate((n) => getComputedStyle(n).opacity)).toBe('1');
    await expect(label).toHaveText('Registrar cobro');
    expect((await rectOf(label)).y + (await rectOf(label)).h).toBeLessThan((await rectOf(tiles(page).nth(2))).y);
    await page.mouse.move(0, 0);
    await wait(500);
    expect(await label.evaluate((n) => getComputedStyle(n).opacity)).toBe('0');
  });

  test('keyboard: a focused link grows as the pointer would, and each link has a name', async ({ page }) => {
    await open(page, 'floating-dock');
    await tab(page, 4);
    await wait(900);
    const w = await widths(page);
    expect(w[1]).toBeGreaterThan(74);
    expect(w[0]).toBeLessThan(w[1]);
    const names = await page.locator('#dock .ac-dock__link').evaluateAll((ns) => ns.map((n) => n.getAttribute('aria-label')));
    expect(names).toEqual(['Nueva factura', 'Nuevo cliente', 'Registrar cobro', 'Enviar recordatorio', 'Exportar', 'Conciliar', 'Ajustes']);
    expect(await page.locator('#dock .ac-dock__link').nth(1).evaluate((n) => getComputedStyle(n).outlineStyle)).toBe('solid');
    await tab(page, 7);
    await wait(1200);
    expect((await widths(page)).map(Math.round)).toEqual([40, 40, 40, 40, 40, 40, 40]);
  });

  test('draws inside its stage while magnified, in both themes', async ({ page }) => {
    await open(page, 'floating-dock');
    for (const theme of ['light', 'dark']) {
      await page.locator(`[data-ac-theme=${theme}]`).click();
      const r = await rectOf(page.locator('#dock .ac-dock__link').nth(3));
      await page.mouse.move(r.cx, r.cy, { steps: 4 });
      await wait(900);
      expect(await containedIn(page, '#stage-dock', '#stage-dock')).toEqual([]);
      await page.mouse.move(0, 0);
      await wait(600);
    }
  });

  test('on a phone the bar is gone: one button opens a column of actions and Escape closes it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page, 'floating-dock');
    await expect(page.locator('#dock .ac-dock__bar')).toBeHidden();
    const toggle = page.locator('#dock .ac-dock__toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#dock .ac-dock__m-item').first()).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const items = page.locator('#dock .ac-dock__m-item');
    await expect(items).toHaveCount(7);
    await wait(1000);
    for (let i = 0; i < 7; i++) await expect(items.nth(i)).toBeVisible();
    const ys = await items.evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().y));
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    const t = await rectOf(toggle);
    expect((await rectOf(items.nth(6))).y).toBeLessThan(t.y);
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    await wait(900);
    await expect(items.first()).toBeHidden();
    await toggle.click();
    await page.mouse.click(10, 10);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('on a phone the actions rise one after another, bottom first', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page, 'floating-dock');
    await page.locator('#dock .ac-dock__toggle').click();
    await wait(150);
    const o = await page.locator('#dock .ac-dock__m-item').evaluateAll((ns) => ns.map((n) => Number(getComputedStyle(n).opacity)));
    expect(o[6]).toBeGreaterThan(o[0]);
  });

  test('touch on a wide screen does not leave a tile magnified', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await open(page, 'floating-dock');
    await page.locator('#dock .ac-dock__link').nth(2).tap();
    await wait(800);
    expect((await widths(page)).map(Math.round)).toEqual([40, 40, 40, 40, 40, 40, 40]);
    await ctx.close();
  });

  test('destroy gives the links back to the element and removes what it built', async ({ page }) => {
    await open(page, 'floating-dock');
    await destroy(page, 'floating-dock', '#dock');
    const left = await page.locator('#dock').evaluate((n) => ({ cls: n.className, kids: [...n.children].map((c) => c.tagName + (c.getAttribute('style') ?? '') + c.className), title: n.children[0].dataset.title, svg: n.children[0].querySelectorAll('svg').length, built: n.querySelectorAll('.ac-dock__bar, .ac-dock__mobile, .ac-dock__tile, .ac-dock__label').length }));
    expect(left.cls).toBe('');
    expect(left.kids).toEqual(Array(7).fill('A'));
    expect(left.svg).toBe(1);
    expect(left.built).toBe(0);
  });
});

test.describe('floating-dock with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('tiles do not magnify and the label fades in 120 ms', async ({ page }) => {
    await open(page, 'floating-dock');
    const link = page.locator('#dock .ac-dock__link').nth(3);
    const r = await rectOf(link);
    await page.mouse.move(r.cx, r.cy, { steps: 4 });
    await wait(800);
    const w = await page.locator('#dock .ac-dock__tile').evaluateAll((ns) => ns.map((n) => Math.round(n.getBoundingClientRect().width)));
    expect(w).toEqual([40, 40, 40, 40, 40, 40, 40]);
    const label = link.locator('.ac-dock__label');
    expect(await label.evaluate((n) => getComputedStyle(n).opacity)).toBe('1');
    expect(await label.evaluate((n) => getComputedStyle(n).transitionDuration)).toBe('0.12s');
  });
});

// ───────────────────────── expandable-card ─────────────────────────
test.describe('expandable-card', () => {
  const card = (page, i = 0) => page.locator('#clients [data-card]').nth(i);
  const panel = (page) => page.locator('.ac-xc__panel');

  test('a click opens the client as a dialog, with the picture, title and description carried over', async ({ page }) => {
    await open(page, 'expandable-card');
    await card(page, 1).locator('.ac-xc__trigger').click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toHaveAttribute('role', 'dialog');
    await expect(panel(page)).toHaveAttribute('aria-modal', 'true');
    await expect(panel(page).getByRole('heading', { name: 'Estudio Quiroga' })).toBeVisible();
    await expect(panel(page)).toContainText('Servicios contables');
    await expect(panel(page)).toContainText('Condición de pago: contado');
    await expect(panel(page).getByRole('link', { name: 'Ver cliente' })).toBeVisible();
    await expect(page.locator('.ac-xc__close')).toBeFocused();
    expect(await page.locator('#clients').evaluate((n) => n.hasAttribute('inert'))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
    expect(await card(page, 1).evaluate((n) => getComputedStyle(n).visibility)).toBe('hidden');
  });

  test('the opening is a shared-layout transition: it starts on the card, passes through between, and lands at 500 px', async ({ page }) => {
    await open(page, 'expandable-card');
    const from = await rectOf(card(page, 0));
    const media = await rectOf(card(page, 0).locator('.ac-xc__media'));
    await page.evaluate(() => {
      window.__f = [];
      const watch = () => {
        const p = document.querySelector('.ac-xc__panel');
        if (p) { const r = p.getBoundingClientRect(); const m = p.querySelector('.ac-xc__pmedia').getBoundingClientRect(); window.__f.push({ t: performance.now(), x: r.x, y: r.y, w: r.width, h: r.height, mw: m.width, mh: m.height, mx: m.x, my: m.y }); }
        requestAnimationFrame(watch);
      };
      watch();
    });
    await card(page, 0).locator('.ac-xc__trigger').click();
    await wait(900);
    const f = await page.evaluate(() => window.__f);
    const first = f[0];
    const last = f[f.length - 1];
    // first frame: the card's own rectangle, and the picture on the card's picture
    expect(Math.abs(first.x - from.x)).toBeLessThan(3);
    expect(Math.abs(first.w - from.w)).toBeLessThan(3);
    expect(Math.abs(first.mw - media.w)).toBeLessThan(3);
    expect(Math.abs(first.mx - media.x)).toBeLessThan(3);
    // last frame: the sheet
    expect(Math.round(last.w)).toBe(500);
    expect(Math.round(last.mw)).toBe(500);
    expect(Math.round(last.mh)).toBe(320);
    // in between, monotone growth and a duration near 450 ms
    const ws = f.map((s) => s.w);
    for (let i = 1; i < ws.length; i++) expect(ws[i]).toBeGreaterThanOrEqual(ws[i - 1] - 0.5);
    const settled = f.find((s) => Math.abs(s.w - 500) < 1);
    expect(settled.t - first.t).toBeGreaterThan(300);
    expect(settled.t - first.t).toBeLessThan(700);
    expect(f.some((s) => s.w > from.w + 20 && s.w < 480)).toBe(true);
    // at rest the sheet carries no transform
    expect(await panel(page).evaluate((n) => n.style.transform)).toBe('');
    expect(await panel(page).evaluate((n) => n.querySelector('.ac-xc__pmedia').style.transform)).toBe('');
  });

  test('the corners stay round while the sheet stretches', async ({ page }) => {
    await open(page, 'expandable-card');
    await card(page, 0).locator('.ac-xc__trigger').click();
    await wait(120);
    const clip = await panel(page).evaluate((n) => n.style.clipPath);
    expect(clip).toMatch(/^inset\(0(px)? round [\d.]+px \/ [\d.]+px\)$/);
    const [rx, ry] = clip.match(/round ([\d.]+)px \/ ([\d.]+)px/).slice(1).map(Number);
    const t = await panel(page).evaluate((n) => new DOMMatrix(getComputedStyle(n).transform));
    expect(rx * t.a).toBeGreaterThan(11);
    expect(rx * t.a).toBeLessThan(25);
    expect(ry * t.d).toBeGreaterThan(11);
    expect(ry * t.d).toBeLessThan(25);
  });

  test('Escape, the close button and a press outside each return it to the card, and focus goes back', async ({ page }) => {
    await open(page, 'expandable-card');
    const trigger = card(page, 2).locator('.ac-xc__trigger');
    for (const how of ['escape', 'button', 'outside']) {
      await trigger.click();
      await expect(panel(page)).toBeVisible();
      await wait(600);
      if (how === 'escape') await page.keyboard.press('Escape');
      if (how === 'button') await page.locator('.ac-xc__close').click();
      if (how === 'outside') await page.mouse.click(8, 8);
      await expect(panel(page)).toHaveCount(0, { timeout: 2000 });
      await expect(trigger).toBeFocused();
      expect(await card(page, 2).evaluate((n) => getComputedStyle(n).visibility)).toBe('visible');
      expect(await page.locator('#clients').evaluate((n) => n.hasAttribute('inert'))).toBe(false);
      expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    }
  });

  test('a press inside the sheet does not close it', async ({ page }) => {
    await open(page, 'expandable-card');
    await card(page, 0).locator('.ac-xc__trigger').click();
    await wait(600);
    await panel(page).locator('.ac-xc__ptitle').click();
    await expect(panel(page)).toBeVisible();
  });

  test('closing halfway reverses from where it is, without a jump', async ({ page }) => {
    await open(page, 'expandable-card');
    await page.evaluate(() => {
      window.__w = [];
      const watch = () => { const p = document.querySelector('.ac-xc__panel'); if (p) window.__w.push(Math.round(p.getBoundingClientRect().width)); requestAnimationFrame(watch); };
      watch();
      window.addEventListener('keydown', () => window.__w.push('esc'), true);
    });
    await card(page, 0).locator('.ac-xc__trigger').click();
    await wait(150);
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0, { timeout: 2000 });
    const w = await page.evaluate(() => window.__w);
    const at = w.indexOf('esc');
    expect(at).toBeGreaterThan(3);
    const widths = w.filter((v) => v !== 'esc');
    const peak = Math.max(...widths);
    expect(peak).toBeLessThan(500);
    expect(peak).toBeGreaterThan(Math.min(...widths) + 40);
    // no frame jumps: the largest step between frames is a fraction of the whole travel
    const steps = widths.slice(1).map((v, i) => Math.abs(v - widths[i]));
    expect(Math.max(...steps)).toBeLessThan(90);
  });

  test('keyboard: Tab stays inside the sheet', async ({ page }) => {
    await open(page, 'expandable-card');
    await tab(page, 3);
    await page.keyboard.press('Enter');
    await expect(panel(page)).toBeVisible();
    await wait(600);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement.closest('.ac-xc__panel'))).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('.ac-xc__panel'))).toBe(true);
  });

  test('the sheet and what it shows stay inside the viewport, in both themes', async ({ page }) => {
    await open(page, 'expandable-card');
    for (const theme of ['light', 'dark']) {
      await page.locator(`[data-ac-theme=${theme}]`).click();
      await card(page, 3).locator('.ac-xc__trigger').click();
      await wait(700);
      expect(await containedIn(page, '.ac-xc__panel', '.ac-xc__panel')).toEqual([]);
      const r = await rectOf(panel(page));
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.h).toBeLessThanOrEqual(900);
      await page.keyboard.press('Escape');
      await expect(panel(page)).toHaveCount(0, { timeout: 2000 });
    }
  });

  test('destroy while open leaves the page as it was', async ({ page }) => {
    await open(page, 'expandable-card');
    await card(page, 0).locator('.ac-xc__trigger').click();
    await wait(200);
    await destroy(page, 'expandable-card', '#clients');
    expect(await page.locator('.ac-xc__layer').count()).toBe(0);
    const left = await page.evaluate(() => ({ inert: document.querySelector('#clients').hasAttribute('inert'), overflow: document.documentElement.style.overflow, cls: document.querySelector('#clients').className, card: document.querySelector('#clients [data-card]').className, hidden: document.querySelector('#clients [data-card]').style.visibility }));
    expect(left).toEqual({ inert: false, overflow: '', cls: '', card: '', hidden: '' });
  });

  test('a card without its parts is an error', async ({ page }) => {
    await open(page, 'expandable-card');
    const message = await page.evaluate(async () => {
      const { mount } = await import('./expandable-card.js');
      const host = document.createElement('ul');
      host.innerHTML = '<li data-card><p>sin partes</p></li>';
      try { mount(host); return 'mounted'; } catch (e) { return e.message; }
    });
    expect(message).toMatch(/data-part/);
  });
});

test.describe('expandable-card on a phone', () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true });
  test('the sheet fills the screen, square, and a tap on a card opens it', async ({ page }) => {
    await open(page, 'expandable-card');
    const cols = await page.locator('#clients').evaluate((n) => getComputedStyle(n).gridTemplateColumns.split(' ').length);
    expect(cols).toBe(1);
    await page.locator('#clients [data-card]').nth(0).locator('.ac-xc__trigger').tap();
    await wait(800);
    const r = await rectOf(page.locator('.ac-xc__panel'));
    expect(Math.round(r.w)).toBe(390);
    expect(Math.round(r.h)).toBe(800);
    expect(Math.round(r.x)).toBe(0);
    expect(await page.locator('.ac-xc__panel').evaluate((n) => n.style.clipPath)).toMatch(/^inset\(0(px)?( round 0px)?\)$/);
    await expect(page.locator('.ac-xc__close')).toBeVisible();
    await page.locator('.ac-xc__close').tap();
    await expect(page.locator('.ac-xc__panel')).toHaveCount(0, { timeout: 2000 });
  });
});

test.describe('expandable-card with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the sheet fades in place: no transform at any frame, and it is complete in about 140 ms', async ({ page }) => {
    await open(page, 'expandable-card');
    await page.evaluate(() => {
      window.__t = [];
      const watch = () => { const p = document.querySelector('.ac-xc__panel'); if (p) window.__t.push({ t: p.style.transform, o: Number(p.style.opacity), c: p.style.clipPath }); requestAnimationFrame(watch); };
      watch();
    });
    await page.locator('#clients [data-card]').nth(0).locator('.ac-xc__trigger').click();
    await wait(600);
    const f = await page.evaluate(() => window.__t);
    expect(f.every((s) => s.t === '')).toBe(true);
    expect(f.some((s) => s.o > 0 && s.o < 1)).toBe(true);
    expect(f[f.length - 1].o).toBe(1);
    expect(Math.round((await rectOf(page.locator('.ac-xc__panel'))).w)).toBe(500);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ac-xc__panel')).toHaveCount(0, { timeout: 1500 });
  });
});

// ───────────────────────── sticky-scroll-reveal ─────────────────────────
test.describe('sticky-scroll-reveal', () => {
  const scrollTo = (page, f) => page.locator('#steps').evaluate((n, f) => n.scrollTo({ top: (n.scrollHeight - n.clientHeight) * f, behavior: 'instant' }), f);
  const opacities = (page) => page.locator('#steps .ac-ssr__step > h3').evaluateAll((ns) => ns.map((n) => Number(getComputedStyle(n).opacity)));

  test('the active step is the one closest to the scroll progress; the others dim', async ({ page }) => {
    await open(page, 'sticky-scroll-reveal');
    await expect(page.locator('#steps')).toHaveAttribute('data-step', '0');
    await wait(500);
    const o0 = await opacities(page);
    expect(o0[0]).toBe(1);
    expect(o0[1]).toBeLessThan(0.7);
    await scrollTo(page, 0.4);
    await wait(500);
    await expect(page.locator('#steps')).toHaveAttribute('data-step', '1');
    await expect(page.locator('#steps .ac-ssr__step').nth(1)).toHaveAttribute('aria-current', 'step');
    const o1 = await opacities(page);
    expect(o1[1]).toBe(1);
    expect(o1[0]).toBeLessThan(0.7);
    await scrollTo(page, 1);
    await wait(500);
    await expect(page.locator('#steps')).toHaveAttribute('data-step', '2');
    await scrollTo(page, 0);
    await wait(500);
    await expect(page.locator('#steps')).toHaveAttribute('data-step', '0');
    await expect(page.locator('#steps [aria-current=step]')).toHaveCount(1);
  });

  test('the pinned panel stays put while the steps scroll, and shows the active visual', async ({ page }) => {
    await open(page, 'sticky-scroll-reveal');
    const panel = page.locator('#steps .ac-ssr__panel');
    const a = await rectOf(panel);
    const host = await rectOf(page.locator('#steps'));
    await scrollTo(page, 1);
    await wait(500);
    const b = await rectOf(panel);
    expect(Math.abs(b.y - a.y)).toBeLessThan(2);
    expect(b.y).toBeGreaterThanOrEqual(host.y);
    expect(b.y + b.h).toBeLessThanOrEqual(host.y + host.h);
    const layers = await page.locator('#steps .ac-ssr__layer').evaluateAll((ns) => ns.map((n) => Number(getComputedStyle(n).opacity)));
    expect(layers).toEqual([0, 0, 1]);
    expect(await panel.getAttribute('aria-hidden')).toBe('true');
  });

  test('the background is interpolated with the scroll: a tone at each step, a blend in between and never a cut', async ({ page }) => {
    await open(page, 'sticky-scroll-reveal');
    const bg = () => page.locator('#steps').evaluate((n) => getComputedStyle(n).backgroundColor);
    const tone = (i) => page.evaluate((i) => { const d = document.createElement('div'); d.style.backgroundColor = `color-mix(in oklab, var(--ac-ssr-bg-${i}) 100%, transparent)`; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; }, i);
    const at = async (f) => { await scrollTo(page, f); await wait(60); return bg(); };
    const channels = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const near = async (f, i) => { const got = channels(await at(f)); const want = channels(await tone(i)); got.forEach((v, k) => expect(Math.abs(v - want[k])).toBeLessThan(0.004)); };
    await near(0, 0);
    await near(1 / 3, 1);
    await near(1, 2);
    const run = [];
    for (const f of [0, 0.08, 0.16, 0.24, 0.32]) run.push(channels(await at(f)));
    const sum = (c) => c[0] + c[1] + c[2];
    const steps = run.slice(1).map((c, i) => sum(c) - sum(run[i]));
    expect(new Set(run.map(String)).size).toBe(run.length);
    expect(steps.every((d) => Math.sign(d) === Math.sign(steps[0]) && d !== 0)).toBe(true);
    expect(Math.max(...steps.map(Math.abs))).toBeLessThan(Math.abs(sum(run.at(-1)) - sum(run[0])) * 0.6);
  });

  test('keyboard: the container takes focus and its arrow keys scroll it', async ({ page }) => {
    await open(page, 'sticky-scroll-reveal');
    await tab(page, 3);
    await expect(page.locator('#steps')).toBeFocused();
    expect(await page.locator('#steps').evaluate((n) => getComputedStyle(n).outlineStyle)).not.toBe('none');
    for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowDown');
    await wait(500);
    expect(await page.locator('#steps').evaluate((n) => n.scrollTop)).toBeGreaterThan(200);
    expect(await page.locator('#steps').getAttribute('role')).toBe('region');
  });

  test('on a narrow screen the pinned panel is not shown and the steps still read', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await open(page, 'sticky-scroll-reveal');
    await expect(page.locator('#steps .ac-ssr__panel')).toBeHidden();
    await expect(page.locator('#steps .ac-ssr__step').first()).toBeVisible();
  });

  test('texts stay readable and inside the container, in both themes', async ({ page }) => {
    await open(page, 'sticky-scroll-reveal');
    for (const theme of ['light', 'dark']) {
      await page.locator(`[data-ac-theme=${theme}]`).click();
      await wait(450);
      const ratio = await page.locator('#steps .ac-ssr__step').first().locator('h3').evaluate((n) => {
        const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        const rgb = (c) => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data]; };
        const lum = ([r, g, b]) => [r, g, b].map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        const fg = lum(rgb(getComputedStyle(n).color));
        const bg = lum(rgb(getComputedStyle(document.querySelector('#steps')).backgroundColor));
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      const width = await page.locator('#steps').evaluate((n) => n.scrollWidth - n.clientWidth);
      expect(width).toBeLessThanOrEqual(0);
    }
  });

  test('destroy gives the steps and their visuals back', async ({ page }) => {
    await open(page, 'sticky-scroll-reveal');
    await scrollTo(page, 1);
    await wait(300);
    await destroy(page, 'sticky-scroll-reveal', '#steps');
    const left = await page.locator('#steps').evaluate((n) => ({ kids: [...n.children].map((c) => c.tagName + c.className), visuals: [...n.children].map((c) => c.querySelectorAll(':scope > [data-visual]').length), cls: n.className, attrs: [n.getAttribute('tabindex'), n.getAttribute('role'), n.dataset.step ?? null], act: n.querySelectorAll('[data-active], [aria-current]').length }));
    expect(left.kids).toEqual(['SECTION', 'SECTION', 'SECTION']);
    expect(left.visuals).toEqual([1, 1, 1]);
    expect(left.cls).toBe('');
    expect(left.attrs).toEqual([null, null, null]);
    expect(left.act).toBe(0);
  });
});

test.describe('sticky-scroll-reveal with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the changes stay and last 120 ms', async ({ page }) => {
    await open(page, 'sticky-scroll-reveal');
    expect(await page.locator('#steps .ac-ssr__step > h3').first().evaluate((n) => getComputedStyle(n).transitionDuration)).toBe('0.12s');
    await page.locator('#steps').evaluate((n) => n.scrollTo({ top: n.scrollHeight, behavior: 'instant' }));
    await expect(page.locator('#steps')).toHaveAttribute('data-step', '2');
  });
});
