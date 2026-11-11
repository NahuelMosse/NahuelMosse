// Tests of the Motion Primitives ports, run against their isolated demos: the morphing dialog and
// popover, the transition panel, the animated background, the two toolbars and Kokonut's. Each one is
// mounted, driven with the mouse, the keyboard and a touch, sampled frame by frame in the page to prove
// it travels (and where it ends), repeated under reduced motion (fades, no travel), checked for AA
// contrast in both themes, for overflow, for console errors, and for nodes left behind by destroy().
import { test, expect } from '@playwright/test';

const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const list = [];
  errors.set(page, list);
  page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.includes('favicon')) list.push(m.text()); });
  page.on('pageerror', (e) => list.push(String(e)));
  await page.addInitScript(() => {
    // Runs `act`, then reads `read()` on every frame for `ms`: what a moving component did, frame by frame.
    window.__sample = (act, read, ms) => new Promise((resolve) => {
      act();
      const out = [];
      const t0 = performance.now();
      const tick = () => { const t = performance.now() - t0; out.push({ t, v: read() }); if (t < ms) requestAnimationFrame(tick); else resolve(out); };
      requestAnimationFrame(tick);
    });
    // What the person sees of a box whose size travels by transform: its surface (the ::before, scaled) and the part of
    // an element that its clip-path shows.
    window.__surface = (el) => {
      const r = el.getBoundingClientRect();
      const m = new DOMMatrix(getComputedStyle(el, '::before').transform);
      return { left: r.left + m.e, top: r.top + m.f, width: r.width * m.a, height: r.height * m.d };
    };
    window.__shown = (el) => {
      const r = el.getBoundingClientRect();
      const inset = /^inset\(([^)]*?)(?: round [^)]*)?\)$/.exec(getComputedStyle(el).clipPath);
      if (!inset) return { left: r.left, top: r.top, width: r.width, height: r.height };
      const [top, right = top, bottom = top, left = right] = inset[1].trim().split(/\s+/).map(parseFloat);
      return { left: r.left + left, top: r.top + top, width: r.width - left - right, height: r.height - top - bottom };
    };
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const rgb = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data]; };
    const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    // Contrast of an element's text over what is painted behind it (its ancestors' backgrounds, composited).
    window.__contrast = (el) => {
      const layers = [];
      // A box paints its own background, then its ::before over it (the surface of the toolbars and the panel).
      for (let n = el; n; n = n.parentElement) {
        const before = getComputedStyle(n, '::before');
        const b = before.content !== 'none' && before.position === 'absolute' ? rgb(before.backgroundColor) : [0, 0, 0, 0];
        if (b[3] > 0) layers.push(b);
        if (b[3] === 255) break;
        const c = rgb(getComputedStyle(n).backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] === 255) break;
      }
      let bg = [255, 255, 255];
      for (const l of layers.reverse()) { const a = l[3] / 255; bg = [0, 1, 2].map((i) => l[i] * a + bg[i] * (1 - a)); }
      const f = rgb(getComputedStyle(el).color);
      const a = f[3] / 255;
      const fg = [0, 1, 2].map((i) => f[i] * a + bg[i] * (1 - a));
      const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
  });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

const open = async (page, name, query = '') => {
  await page.goto(`/motion/${name}.html${query}`);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
};
const reduce = (page) => page.emulateMedia({ reducedMotion: 'reduce' });
const rectOf = (locator) => locator.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; });
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
// A descendant that paints outside the box that clips it is an overflow the person sees cut.
const overflowing = (locator) => locator.evaluate((box) => {
  const r = box.getBoundingClientRect();
  return [...box.querySelectorAll('*')].filter((n) => {
    const s = getComputedStyle(n);
    if (s.visibility === 'hidden' || s.display === 'none' || n.closest('[hidden]') || n.closest('svg') !== null && n.tagName !== 'svg') return false;
    const b = n.getBoundingClientRect();
    if (!b.width || !b.height) return false;
    return b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1;
  }).map((n) => n.className || n.tagName);
});
const themes = ['', '?theme=dark'];

// ───────────────────────────── morphing dialog ─────────────────────────────
test.describe('morphing dialog', () => {
  const trigger = (page, n = 0) => page.locator('#clients [data-md="trigger"]').nth(n);
  const settled = (page) => page.waitForFunction(() => { const b = document.querySelector('.mdlg-box'); return b && b.style.transform === '' && getComputedStyle(b).opacity === '1'; });

  test('the card is a button that opens a modal dialog named by the client, with the focus inside', async ({ page }) => {
    await open(page, 'morphing-dialog');
    await expect(trigger(page)).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
    await trigger(page).click();
    const dialog = page.getByRole('dialog', { name: 'Sánchez Hermanos S.A.' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-describedby', /.+/);
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Cerrar ficha' })).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  });

  test('the box grows out of the card on a spring: it starts at the card, passes through the middle and lands centered', async ({ page }) => {
    await open(page, 'morphing-dialog');
    const card = await rectOf(trigger(page));
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#clients [data-md="trigger"]').click(), () => {
      const b = document.querySelector('.mdlg-box');
      const r = b.getBoundingClientRect();
      const title = b.querySelector('[data-md="title"]').getBoundingClientRect();
      return { w: r.width, h: r.height, left: r.left, titleTop: title.top, titleLeft: title.left, box: +getComputedStyle(b).opacity, backdrop: +getComputedStyle(document.querySelector('.mdlg-backdrop')).opacity };
    }, 1100));
    const v = frames.map((f) => f.v);
    expect(Math.abs(v[0].w - card.width)).toBeLessThan(card.width * 0.25);
    expect(v.some((f) => f.w > card.width + 40 && f.w < 460)).toBe(true);
    expect(Math.max(...v.map((f) => f.w))).toBeLessThan(500 * 1.05);
    expect(new Set(v.map((f) => Math.round(f.w))).size).toBeGreaterThan(8);
    expect(v[0].backdrop).toBeLessThan(0.6);
    await settled(page);
    const landed = await rectOf(page.locator('.mdlg-box'));
    expect(landed.width).toBe(500);
    expect(near(landed.left, (1280 - 500) / 2, 1)).toBe(true);
    expect(await page.locator('.mdlg-backdrop').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    // the title flies from the card's title to its place in the sheet
    const cardTitle = await rectOf(trigger(page).locator('[data-md="title"]'));
    expect(Math.abs(v[0].titleTop - cardTitle.top)).toBeLessThan(30);
    expect((await rectOf(page.locator('.mdlg-box [data-md="title"]'))).top).toBeGreaterThan(cardTitle.top + 40);
  });

  test('at rest nothing is left transformed and nothing paints outside the box', async ({ page }) => {
    await open(page, 'morphing-dialog');
    await trigger(page).click();
    await settled(page);
    const state = await page.evaluate(() => {
      const b = document.querySelector('.mdlg-box');
      return { box: getComputedStyle(b).transform, inner: getComputedStyle(b.querySelector('.mdlg-inner')).transform, parts: [...b.querySelectorAll('[data-md]')].map((n) => getComputedStyle(n).transform), radius: getComputedStyle(b).borderTopLeftRadius };
    });
    expect(state.box).toBe('none');
    expect(state.inner).toBe('none');
    expect(state.parts.every((t) => t === 'none')).toBe(true);
    expect(state.radius).toBe('12px');
    expect(await overflowing(page.locator('.mdlg-box'))).toEqual([]);
  });

  test('Escape closes it, the card gets the focus back and the page scrolls again; the way back travels too', async ({ page }) => {
    await open(page, 'morphing-dialog');
    await trigger(page).click();
    await settled(page);
    const widths = await page.evaluate(() => window.__sample(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), () => document.querySelector('.mdlg-box')?.getBoundingClientRect().width ?? 0, 900));
    expect(widths.some((f) => f.v > 0 && f.v < 450)).toBe(true);
    await expect(page.locator('.mdlg-portal')).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    expect(await trigger(page).evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  });

  test('the close button and a press outside close it', async ({ page }) => {
    await open(page, 'morphing-dialog');
    await trigger(page).click();
    await settled(page);
    await page.getByRole('button', { name: 'Cerrar ficha' }).click();
    await expect(page.locator('.mdlg-portal')).toHaveCount(0);
    await trigger(page, 1).click();
    await settled(page);
    await page.mouse.click(8, 8);
    await expect(page.locator('.mdlg-portal')).toHaveCount(0);
    await trigger(page, 2).click();
    await settled(page);
    await page.locator('.mdlg-box').click({ position: { x: 40, y: 150 } });
    await expect(page.locator('.mdlg-box')).toBeVisible();
  });

  test('the focus is trapped: Tab wraps from the last control to the first and Shift+Tab back', async ({ page }) => {
    await open(page, 'morphing-dialog');
    await trigger(page).click();
    await settled(page);
    const close = page.getByRole('button', { name: 'Cerrar ficha' });
    const last = page.getByRole('button', { name: 'Emitir factura' });
    await close.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(last).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
  });

  test('keyboard opens it with Enter and Space', async ({ page }) => {
    await open(page, 'morphing-dialog');
    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.mdlg-portal')).toHaveCount(0);
    await page.keyboard.press('Space');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('reduced motion fades the dialog in place, with no travel', async ({ page }) => {
    await reduce(page);
    await open(page, 'morphing-dialog');
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#clients [data-md="trigger"]').click(), () => {
      const b = document.querySelector('.mdlg-box');
      return { transform: getComputedStyle(b).transform, opacity: +getComputedStyle(b).opacity, w: b.getBoundingClientRect().width };
    }, 400));
    const v = frames.map((f) => f.v);
    expect(v.every((f) => f.transform === 'none' && Math.round(f.w) === 500)).toBe(true);
    expect(v[0].opacity).toBeLessThan(1);
    expect(v.at(-1).opacity).toBe(1);
    const fadeMs = frames.find((f) => f.v.opacity === 1)?.t ?? 9999;
    expect(fadeMs).toBeGreaterThan(60);
    expect(fadeMs).toBeLessThan(260);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mdlg-portal')).toHaveCount(0);
  });

  test.describe('on a touch screen', () => {
    test.use({ hasTouch: true });
    test('a tap opens it and a tap outside closes it', async ({ page }) => {
      await open(page, 'morphing-dialog');
      await trigger(page).tap();
      await expect(page.getByRole('dialog')).toBeVisible();
      await settled(page);
      await page.touchscreen.tap(8, 8);
      await expect(page.locator('.mdlg-portal')).toHaveCount(0);
    });
  });

  test('on a small screen the sheet fits the window and scrolls inside', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await open(page, 'morphing-dialog');
    await trigger(page).click();
    await settled(page);
    const box = await rectOf(page.locator('.mdlg-box'));
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.left + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeLessThanOrEqual(600 * 0.9 + 1);
    const scrolls = await page.locator('.mdlg-scroll').evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrolls).toBe(true);
  });

  for (const q of themes) {
    test(`AA contrast on the card and the sheet ${q || '(light)'}`, async ({ page }) => {
      await open(page, 'morphing-dialog', q);
      const card = await page.evaluate(() => [...document.querySelectorAll('#clients [data-md="trigger"] [data-md]')].filter((n) => n.dataset.md !== 'image').map((n) => window.__contrast(n)));
      expect(Math.min(...card)).toBeGreaterThanOrEqual(4.5);
      await trigger(page).click();
      await settled(page);
      const sheet = await page.evaluate(() => [...document.querySelectorAll('.mdlg-box [data-md="title"], .mdlg-box [data-md="subtitle"], .mdlg-box dt, .mdlg-box dd, .mdlg-box td, .mdlg-box th, .mdlg-box .mdlg-close')].map((n) => window.__contrast(n)));
      expect(Math.min(...sheet)).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('destroy() leaves no node, listener effect or attribute behind, even if open', async ({ page }) => {
    await open(page, 'morphing-dialog');
    await trigger(page).click();
    await settled(page);
    await page.evaluate(async () => { const m = await import('/motion/morphing-dialog.js'); m.mount(document.querySelector('[data-motion="morphing-dialog"]')).destroy(); });
    await expect(page.locator('.mdlg-portal')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    await expect(trigger(page)).not.toHaveAttribute('aria-haspopup', /.*/);
    await trigger(page).click();
    await expect(page.locator('.mdlg-portal')).toHaveCount(0);
  });
});

// ───────────────────────────── morphing popover ─────────────────────────────
test.describe('morphing popover', () => {
  const trigger = (page, id = 'note') => page.locator(`#${id} [data-mpo="trigger"]`);
  const box = (page, id = 'note') => page.locator(`#${id} .mpop-box`);
  const settled = (page, id = 'note') => page.waitForFunction((id) => { const b = document.querySelector(`#${id} .mpop-box`); return b && b.style.transform === '' && getComputedStyle(b).opacity === '1'; }, id);

  test('its Escape is taken before the layers under it: a handler of the page sees it already handled', async ({ page }) => {
    await open(page, 'morphing-popover');
    await page.evaluate(() => { window.__under = []; document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__under.push(e.defaultPrevented); }); });
    await trigger(page).click();
    await expect(box(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(box(page)).toBeHidden();
    expect(await page.evaluate(() => window.__under)).toEqual([true]);
  });

  test('the button opens a dialog with the text field focused', async ({ page }) => {
    await open(page, 'morphing-popover');
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
    await trigger(page).click();
    await expect(page.getByRole('dialog', { name: 'Nota de la factura' })).toBeVisible();
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('textbox', { name: 'Nota de la factura' })).toBeFocused();
  });

  test('the panel opens over the button and grows from its rect; the label flies to the placeholder', async ({ page }) => {
    await open(page, 'morphing-popover');
    const button = await rectOf(trigger(page));
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#note [data-mpo="trigger"]').click(), () => {
      const b = document.querySelector('#note .mpop-box');
      const r = b.getBoundingClientRect();
      const label = b.querySelector('[data-mpo="label"]').getBoundingClientRect();
      return { w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2, labelLeft: label.left, labelTop: label.top };
    }, 900));
    const v = frames.map((f) => f.v);
    expect(v[0].w).toBeLessThan(button.width * 1.6);
    expect(v.some((f) => f.w > button.width + 60 && f.w < 330)).toBe(true);
    expect(v.at(-1).w).toBeCloseTo(364, 0);
    expect(v.at(-1).h).toBeCloseTo(200, 0);
    expect(near(v[0].cx, button.left + button.width / 2, 12)).toBe(true);
    expect(near(v[0].labelLeft, v.at(-1).labelLeft, 200)).toBe(true);
    expect(new Set(v.map((f) => Math.round(f.labelLeft))).size).toBeGreaterThan(4);
  });

  test('Escape closes it and the draft survives; submitting emits the note, clears the field and closes', async ({ page }) => {
    await open(page, 'morphing-popover');
    await trigger(page).click();
    await settled(page);
    const field = page.getByRole('textbox', { name: 'Nota de la factura' });
    await field.fill('Llamar a Sánchez antes del vencimiento');
    await expect(box(page)).toHaveAttribute('data-filled', '');
    await expect.poll(() => page.locator('#note [data-mpo="label"]').last().evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    await page.keyboard.press('Escape');
    await expect(box(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    await trigger(page).click();
    await settled(page);
    await expect(field).toHaveValue('Llamar a Sánchez antes del vencimiento');
    await page.getByRole('button', { name: 'Guardar nota' }).click();
    await expect(page.locator('#notes li')).toHaveText(['Llamar a Sánchez antes del vencimiento']);
    await expect(box(page)).toHaveCount(0);
    await trigger(page).click();
    await expect(field).toHaveValue('');
  });

  test('the back arrow and a press outside close it', async ({ page }) => {
    await open(page, 'morphing-popover');
    await trigger(page).click();
    await settled(page);
    await page.getByRole('button', { name: 'Cerrar sin guardar' }).first().click();
    await expect(box(page)).toHaveCount(0);
    await trigger(page).click();
    await settled(page);
    await page.mouse.click(10, 10);
    await expect(box(page)).toHaveCount(0);
    await trigger(page).click();
    await settled(page);
    await box(page).click({ position: { x: 100, y: 60 } });
    await expect(box(page)).toBeVisible();
  });

  test('next to the window edge it slides in so it is not cut', async ({ page }) => {
    await open(page, 'morphing-popover');
    await trigger(page, 'edge').scrollIntoViewIfNeeded();
    await trigger(page, 'edge').click();
    await settled(page, 'edge');
    const r = await rectOf(box(page, 'edge'));
    expect(r.left).toBeGreaterThanOrEqual(8 - 0.5);
    expect(r.left + r.width).toBeLessThanOrEqual(1280 - 8 + 0.5);
    expect(r.top).toBeGreaterThanOrEqual(0);
  });

  test('at rest it is untransformed and nothing paints outside it', async ({ page }) => {
    await open(page, 'morphing-popover');
    await trigger(page).click();
    await settled(page);
    expect(await box(page).evaluate((b) => [getComputedStyle(b).transform, getComputedStyle(b.firstElementChild).transform, getComputedStyle(b).borderTopLeftRadius])).toEqual(['none', 'none', '12px']);
    expect(await overflowing(box(page))).toEqual([]);
  });

  test('reduced motion fades it in place', async ({ page }) => {
    await reduce(page);
    await open(page, 'morphing-popover');
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#note [data-mpo="trigger"]').click(), () => {
      const b = document.querySelector('#note .mpop-box');
      return { transform: getComputedStyle(b).transform, w: Math.round(b.getBoundingClientRect().width), o: +getComputedStyle(b).opacity };
    }, 350));
    expect(frames.every((f) => f.v.transform === 'none' && f.v.w === 364)).toBe(true);
    expect(frames[0].v.o).toBeLessThan(1);
    expect(frames.at(-1).v.o).toBe(1);
  });

  test.describe('on a touch screen', () => {
    test.use({ hasTouch: true });
    test('a tap opens and a tap outside closes', async ({ page }) => {
      await open(page, 'morphing-popover');
      await trigger(page).tap();
      await expect(box(page)).toBeVisible();
      await settled(page);
      await page.touchscreen.tap(10, 10);
      await expect(box(page)).toHaveCount(0);
    });
  });

  for (const q of themes) {
    test(`AA contrast on the button and the panel ${q || '(light)'}`, async ({ page }) => {
      await open(page, 'morphing-popover', q);
      expect(await trigger(page).evaluate((el) => window.__contrast(el))).toBeGreaterThanOrEqual(4.5);
      await trigger(page).click();
      await settled(page);
      const parts = await page.evaluate(() => [...document.querySelectorAll('#note .mpop-box .mpop-btn, #note .mpop-box textarea, #note .mpop-box .mpop-label')].map((n) => window.__contrast(n)));
      expect(Math.min(...parts)).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('destroy() removes the panel and the attributes, even if open', async ({ page }) => {
    await open(page, 'morphing-popover');
    await trigger(page).click();
    await settled(page);
    await page.evaluate(async () => { const m = await import('/motion/morphing-popover.js'); m.mount(document.getElementById('note')).destroy(); });
    await expect(page.locator('#note .mpop-box')).toHaveCount(0);
    await expect(trigger(page)).not.toHaveAttribute('aria-expanded', /.*/);
    await trigger(page).click();
    await expect(page.locator('#note .mpop-box')).toHaveCount(0);
  });
});

// ───────────────────────────── transition panel ─────────────────────────────
test.describe('transition panel', () => {
  const next = (page) => page.getByRole('button', { name: /Siguiente|Emitir factura/ });
  const prev = (page) => page.getByRole('button', { name: 'Anterior' });
  const visibleSteps = (page) => page.locator('#alta [data-tp="step"]:not([hidden])');
  const rest = (page) => page.waitForFunction(() => document.querySelectorAll('#alta [data-tp="step"]:not([hidden])').length === 1 && document.querySelector('#alta [data-tp="step"]:not([hidden])').getAnimations().length === 0 && document.querySelector('#alta [data-tp="viewport"]').getAnimations().length === 0);

  test('starts on the first step, without Previous, with every step named', async ({ page }) => {
    await open(page, 'transition-panel');
    await expect(visibleSteps(page)).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Paso 1 de 4: Cliente' })).toBeVisible();
    await expect(prev(page)).toBeHidden();
    await expect(next(page)).toHaveText('Siguiente');
  });

  test('going forward the new step comes in from the right while the old one slides out to the left and fades, and the card follows the height', async ({ page }) => {
    await open(page, 'transition-panel');
    const frames = await page.evaluate(() => window.__sample(() => [...document.querySelectorAll('#alta button')].find((b) => b.dataset.tp === 'next').click(), () => {
      const x = (n) => (n ? new DOMMatrix(getComputedStyle(n).transform).m41 : null);
      const leaving = document.querySelector('#alta .tpanel__leaving');
      const arriving = document.querySelector('#alta [data-tp="step"]:not([hidden]):not(.tpanel__leaving)');
      return { lx: x(leaving), lo: leaving ? +getComputedStyle(leaving).opacity : null, lpos: leaving ? getComputedStyle(leaving).position : null, ax: x(arriving), ao: +getComputedStyle(arriving).opacity, h: window.__surface(document.querySelector('#alta')).height, title: arriving.dataset.title };
    }, 900));
    const v = frames.map((f) => f.v);
    expect(v[0].ax).toBeGreaterThan(150);
    expect(v[0].lpos).toBe('absolute');
    expect(v.some((f) => f.lx !== null && f.lx < -20)).toBe(true);
    expect(v.some((f) => f.lo !== null && f.lo > 0 && f.lo < 1)).toBe(true);
    expect(v.at(-1).ax).toBe(0);
    expect(v.at(-1).title).toBe('Conceptos');
    expect(v.at(-1).lx).toBeNull();
    const heights = v.map((f) => f.h);
    const [from, to] = [heights[0], heights.at(-1)];
    expect(Math.abs(from - to)).toBeGreaterThan(20);
    expect(heights.some((h) => h > Math.min(from, to) + 5 && h < Math.max(from, to) - 5)).toBe(true);
    await rest(page);
    await expect(visibleSteps(page)).toHaveCount(1);
  });

  test('going back it comes in from the left; Previous shows from the second step on', async ({ page }) => {
    await open(page, 'transition-panel');
    await next(page).click();
    await rest(page);
    await expect(prev(page)).toBeVisible();
    const first = await page.evaluate(() => window.__sample(() => [...document.querySelectorAll('#alta button')].find((b) => b.dataset.tp === 'prev').click(), () => new DOMMatrix(getComputedStyle(document.querySelector('#alta [data-tp="step"]:not([hidden]):not(.tpanel__leaving)')).transform).m41, 200));
    expect(first[0].v).toBeLessThan(-150);
    await rest(page);
    await expect(prev(page)).toBeHidden();
  });

  test('the last step says Emitir factura and pressing it announces the end', async ({ page }) => {
    await open(page, 'transition-panel');
    for (let i = 0; i < 3; i++) { await next(page).click(); await rest(page); }
    await expect(next(page)).toHaveText('Emitir factura');
    await expect(page.getByRole('group', { name: 'Paso 4 de 4: Confirmar' })).toBeVisible();
    await next(page).click();
    await expect(page.locator('#log')).toHaveText('Factura emitida (demo).');
    await expect(visibleSteps(page)).toHaveCount(1);
  });

  test('pressing fast hands each step over from where it is, and only the last one is left', async ({ page }) => {
    await open(page, 'transition-panel');
    await next(page).click();
    await next(page).click();
    await prev(page).click();
    await next(page).click();
    await next(page).click();
    await rest(page);
    await expect(visibleSteps(page)).toHaveCount(1);
    await expect(visibleSteps(page)).toHaveAttribute('data-title', 'Confirmar');
    expect(await page.locator('#alta [data-tp="step"][hidden]').evaluateAll((els) => els.every((e) => e.hasAttribute('inert')))).toBe(true);
  });

  test('a screen reader hears the step change', async ({ page }) => {
    await open(page, 'transition-panel');
    await next(page).click();
    await expect(page.locator('#alta .tpanel__status')).toHaveText('Paso 2 de 4: Conceptos');
  });

  test('reduced motion crossfades with no sliding', async ({ page }) => {
    await reduce(page);
    await open(page, 'transition-panel');
    const frames = await page.evaluate(() => window.__sample(() => [...document.querySelectorAll('#alta button')].find((b) => b.dataset.tp === 'next').click(), () => {
      const a = document.querySelector('#alta [data-tp="step"]:not([hidden]):not(.tpanel__leaving)');
      return { transform: getComputedStyle(a).transform, o: +getComputedStyle(a).opacity };
    }, 400));
    expect(frames.every((f) => f.v.transform === 'none')).toBe(true);
    expect(frames[0].v.o).toBeLessThan(1);
    expect(frames.at(-1).v.o).toBe(1);
  });

  test('every step fits its card at rest and at a narrow width', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 700 });
    await open(page, 'transition-panel');
    for (let i = 0; i < 4; i++) {
      expect(await overflowing(page.locator('#alta'))).toEqual([]);
      if (i < 3) { await next(page).click(); await rest(page); }
    }
  });

  for (const q of themes) {
    test(`AA contrast on every step ${q || '(light)'}`, async ({ page }) => {
      await open(page, 'transition-panel', q);
      for (let i = 0; i < 4; i++) {
        const c = await page.evaluate(() => [...document.querySelectorAll('#alta [data-tp="step"]:not([hidden]) :is(h3, p, td, th, dt, dd, label), #alta .tpanel__btn')].filter((n) => n.offsetParent !== null).map((n) => window.__contrast(n)));
        expect(Math.min(...c)).toBeGreaterThanOrEqual(4.5);
        if (i < 3) { await next(page).click(); await rest(page); }
      }
    });
  }

  test('destroy() restores every step and removes the live region', async ({ page }) => {
    await open(page, 'transition-panel');
    await next(page).click();
    await rest(page);
    await page.evaluate(async () => { const m = await import('/motion/transition-panel.js'); m.mount(document.getElementById('alta')).destroy(); });
    await expect(page.locator('#alta .tpanel__status')).toHaveCount(0);
    expect(await page.locator('#alta [data-tp="step"]').evaluateAll((els) => els.every((e) => !e.hidden && !e.hasAttribute('inert') && !e.hasAttribute('aria-label')))).toBe(true);
  });
});

// ───────────────────────────── animated background ─────────────────────────────
test.describe('animated background', () => {
  const pill = (page, id) => page.locator(`#${id} .abg__hl`);
  const item = (page, id, key) => page.locator(`#${id} [data-id="${key}"]`);
  const geometry = (page, id) => page.evaluate((id) => { const root = document.getElementById(id); const p = root.querySelector('.abg__hl').getBoundingClientRect(); return { left: p.left, top: p.top, width: p.width, height: p.height, opacity: +getComputedStyle(root.querySelector('.abg__hl')).opacity }; }, id);
  const onto = async (page, id, key) => { const g = await geometry(page, id); const r = await rectOf(item(page, id, key)); return near(g.left, r.left) && near(g.top, r.top) && near(g.width, r.width) && near(g.height, r.height); };
  const center = async (locator) => { const r = await rectOf(locator); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const landed = (page, id, key) => expect.poll(() => onto(page, id, key), { timeout: 2500 }).toBe(true);

  test('in hover mode the highlight appears in place on the first item, slides to the next, and fades out where it is on leaving', async ({ page }) => {
    await open(page, 'animated-background');
    expect((await geometry(page, 'menu')).opacity).toBe(0);
    await page.mouse.move(...await center(item(page, 'menu', 'facturas')));
    await landed(page, 'menu', 'facturas');
    await expect.poll(async () => (await geometry(page, 'menu')).opacity, { timeout: 1500 }).toBeGreaterThan(0.99);
    expect(await item(page, 'menu', 'facturas').getAttribute('data-checked')).toBe('true');
    const start = await geometry(page, 'menu');
    await page.mouse.move(...await center(item(page, 'menu', 'reportes')));
    const frames = await page.evaluate(() => window.__sample(() => {}, () => { const p = document.querySelector('#menu .abg__hl').getBoundingClientRect(); return { top: p.top, o: +getComputedStyle(document.querySelector('#menu .abg__hl')).opacity }; }, 600));
    const tops = frames.map((f) => f.v.top);
    expect(tops.some((t) => t > start.top + 20 && t < tops.at(-1) - 20)).toBe(true);
    expect(frames.every((f) => f.v.o > 0.9)).toBe(true);
    await landed(page, 'menu', 'reportes');
    const end = await geometry(page, 'menu');
    await page.mouse.move(5, 5);
    await expect.poll(async () => (await geometry(page, 'menu')).opacity, { timeout: 1500 }).toBeLessThan(0.02);
    const after = await geometry(page, 'menu');
    expect(near(after.top, end.top)).toBe(true);
    expect(await page.locator('#menu [data-checked="true"]').count()).toBe(0);
  });

  test('the first hover shows it already on the item, with no slide from elsewhere', async ({ page }) => {
    await open(page, 'animated-background');
    await page.mouse.move(...await center(item(page, 'menu', 'vencimientos')));
    const frames = await page.evaluate(() => window.__sample(() => {}, () => document.querySelector('#menu .abg__hl').getBoundingClientRect().top, 120));
    const target = (await rectOf(item(page, 'menu', 'vencimientos'))).top;
    expect(frames.every((f) => near(f.v, target, 2))).toBe(true);
  });

  test('keeps the item\'s corner radius while it scales', async ({ page }) => {
    await open(page, 'animated-background');
    await page.mouse.move(...await center(item(page, 'menu', 'clientes')));
    await landed(page, 'menu', 'clientes');
    const [rx, ry] = await page.evaluate(() => { const p = document.querySelector('#menu .abg__hl'); const r = p.getBoundingClientRect(); const [a, b] = getComputedStyle(p).borderTopLeftRadius.split(' ').map(parseFloat); return [a * (r.width / 100), (b ?? a) * (r.height / 100)]; });
    expect(near(rx, 8, 0.6)).toBe(true);
    expect(near(ry, 8, 0.6)).toBe(true);
  });

  test('the keyboard moves it like the pointer', async ({ page }) => {
    await open(page, 'animated-background');
    await page.locator('[data-theme-set="dark"]').focus();
    await page.keyboard.press('Tab');
    await expect(item(page, 'menu', 'facturas')).toBeFocused();
    await landed(page, 'menu', 'facturas');
    await page.keyboard.press('Tab');
    await landed(page, 'menu', 'clientes');
    expect((await geometry(page, 'menu')).opacity, 'the fade is a spring: it reaches 1 asymptotically').toBeCloseTo(1, 3);
  });

  test('with a default value it is shown from the start; leaving the pointer hides it', async ({ page }) => {
    await open(page, 'animated-background');
    expect(await onto(page, 'tabs', 'Facturas')).toBe(true);
    expect((await geometry(page, 'tabs')).opacity).toBe(1);
    await page.mouse.move(...await center(item(page, 'tabs', 'Cobranzas')));
    await landed(page, 'tabs', 'Cobranzas');
    await page.mouse.move(5, 5);
    await expect.poll(async () => (await geometry(page, 'tabs')).opacity, { timeout: 1500 }).toBeLessThan(0.02);
  });

  test('over a grid of cards, with the slow spring, it crosses between rows and columns', async ({ page }) => {
    await open(page, 'animated-background');
    await page.locator('#cards').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.mouse.move(...await center(item(page, 'cards', 'card-0')));
    await landed(page, 'cards', 'card-0');
    await page.mouse.move(...await center(item(page, 'cards', 'card-5')));
    const frames = await page.evaluate(() => window.__sample(() => {}, () => { const r = document.querySelector('#cards .abg__hl').getBoundingClientRect(); return [r.left, r.top]; }, 1500));
    const last = frames.at(-1).v;
    expect(frames.some((f) => f.v[0] > 0 && f.v[0] < last[0] - 30 && f.v[1] < last[1] - 30)).toBe(true);
    await landed(page, 'cards', 'card-5');
  });

  test('in click mode a link is not marked pressed: pressed is a state of buttons, a link says where you are with aria-current', async ({ page }) => {
    await open(page, 'animated-background');
    const out = await page.evaluate(async () => {
      const { mount } = await import('/motion/animated-background.js');
      const nav = document.createElement('nav');
      nav.innerHTML = '<a href="#a" data-id="a" aria-current="page">A</a><a href="#b" data-id="b">B</a><button data-id="c">C</button>';
      document.body.append(nav);
      const handle = mount(nav, { mode: 'click', defaultValue: 'a' });
      handle.set('b');
      const seen = [...nav.querySelectorAll('[data-id]')].map((n) => n.getAttribute('aria-pressed'));
      handle.destroy();
      nav.remove();
      return seen;
    });
    expect(out).toEqual([null, null, 'false']);
  });

  test('in click mode a click moves it, marks the button pressed and announces the change', async ({ page }) => {
    await open(page, 'animated-background');
    await item(page, 'segmented', 'Mes').scrollIntoViewIfNeeded();
    expect(await onto(page, 'segmented', 'Mes')).toBe(true);
    await expect(item(page, 'segmented', 'Mes')).toHaveAttribute('aria-pressed', 'true');
    await item(page, 'segmented', 'Semana').click();
    await expect(item(page, 'segmented', 'Semana')).toHaveAttribute('aria-pressed', 'true');
    await expect(item(page, 'segmented', 'Mes')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#log')).toHaveText('Período: Semana');
    await landed(page, 'segmented', 'Semana');
    expect((await geometry(page, 'segmented')).opacity).toBe(1);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    expect((await geometry(page, 'segmented')).opacity).toBe(1);
  });

  test('the eased tween of the segmented control reaches the item without overshooting', async ({ page }) => {
    await open(page, 'animated-background');
    await item(page, 'segmented', 'Mes').scrollIntoViewIfNeeded();
    const target = await rectOf(item(page, 'segmented', 'Año'));
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#segmented [data-id="Año"]').click(), () => document.querySelector('#segmented .abg__hl').getBoundingClientRect().left, 500));
    const lefts = frames.map((f) => f.v);
    expect(Math.max(...lefts)).toBeLessThanOrEqual(target.left + 0.6);
    expect(near(lefts.at(-1), target.left)).toBe(true);
    expect(lefts.some((l) => l > lefts[0] + 20 && l < target.left - 20)).toBe(true);
  });

  test('reduced motion puts it on the item at once and only fades', async ({ page }) => {
    await reduce(page);
    await open(page, 'animated-background');
    await page.mouse.move(...await center(item(page, 'menu', 'facturas')));
    await page.waitForTimeout(250);
    await page.mouse.move(...await center(item(page, 'menu', 'reportes')));
    const frames = await page.evaluate(() => window.__sample(() => {}, () => document.querySelector('#menu .abg__hl').getBoundingClientRect().top, 150));
    const target = (await rectOf(item(page, 'menu', 'reportes'))).top;
    expect(frames.every((f) => near(f.v, target, 2))).toBe(true);
  });

  test('no node of the demo overflows its container', async ({ page }) => {
    await open(page, 'animated-background');
    for (const id of ['menu', 'cards', 'segmented', 'tabs']) {
      await item(page, id, await page.locator(`#${id} [data-id]`).first().getAttribute('data-id')).hover();
      await page.waitForTimeout(500);
      expect(await overflowing(page.locator(`#${id}`))).toEqual([]);
    }
  });

  for (const q of themes) {
    test(`AA contrast of the items, resting and under the highlight ${q || '(light)'}`, async ({ page }) => {
      await open(page, 'animated-background', q);
      const rest = await page.evaluate(() => [...document.querySelectorAll('.abg-menu__item, .abg-tab, .abg-card__title, .abg-card__text')].map((n) => window.__contrast(n)));
      expect(Math.min(...rest)).toBeGreaterThanOrEqual(4.5);
      await page.mouse.move(...await center(item(page, 'menu', 'clientes')));
      await landed(page, 'menu', 'clientes');
      await page.waitForTimeout(400);
      // The highlight is translucent: the link takes its fill as its own background so the contrast
      // is measured over what is really painted (the page, then the fill).
      const ratio = await page.evaluate(() => {
        const hl = document.querySelector('#menu .abg__hl');
        const link = document.querySelector('#menu [data-id="clientes"]');
        link.style.backgroundColor = getComputedStyle(hl).backgroundColor;
        const r = window.__contrast(link);
        link.style.backgroundColor = '';
        return r;
      });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('destroy() removes the highlight, the probe and the marks', async ({ page }) => {
    await open(page, 'animated-background');
    await item(page, 'menu', 'facturas').hover();
    await page.evaluate(async () => { const m = await import('/motion/animated-background.js'); m.mount(document.getElementById('menu')).destroy(); });
    await expect(page.locator('#menu .abg__hl, #menu .abg__probe')).toHaveCount(0);
    await expect(page.locator('#menu [data-checked]')).toHaveCount(0);
    await item(page, 'menu', 'clientes').hover();
    await expect(page.locator('#menu .abg__hl')).toHaveCount(0);
  });
});

// ───────────────────────────── toolbar dynamic ─────────────────────────────
test.describe('toolbar dynamic', () => {
  const expand = (page) => page.getByRole('button', { name: 'Buscar facturas' });
  const boxWidth = (page) => page.locator('#search').evaluate((el) => window.__surface(el).width);
  const still = (page) => page.waitForFunction(() => document.querySelector('#search [data-td="box"]').getAnimations().length === 0);

  test('starts small with its two icons; the first is disabled', async ({ page }) => {
    await open(page, 'toolbar-dynamic');
    expect(await boxWidth(page)).toBeLessThan(120);
    await expect(page.getByRole('button', { name: 'Exportar selección' })).toBeDisabled();
    await expect(expand(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('the lupa opens it into a search field: the width travels on a spring and the field takes the focus', async ({ page }) => {
    await open(page, 'toolbar-dynamic');
    const start = await boxWidth(page);
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#search [data-td="expand"]').click(), () => window.__surface(document.querySelector('#search')).width, 700));
    const w = frames.map((f) => f.v);
    expect(w[0]).toBeLessThan(start + 120);
    expect(w.some((n) => n > start + 40 && n < 290)).toBe(true);
    expect(w.at(-1)).toBeCloseTo(300, 0);
    expect(Math.max(...w)).toBeLessThan(300 * 1.05);
    await expect(page.getByRole('searchbox', { name: 'Buscar facturas' })).toBeFocused();
    await expect(expand(page)).toBeHidden();
  });

  test('the focused field has a neutral 1 px border, not a 2 px blue ring', async ({ page }) => {
    for (const dark of [false, true]) {
      await open(page, 'toolbar-dynamic', dark ? '?theme=dark' : '');
      await page.locator('#search [data-td="expand"]').click();
      const input = page.getByRole('searchbox');
      await expect(input).toBeFocused();
      await page.waitForTimeout(300);
      const ring = await input.evaluate((n) => { const cs = getComputedStyle(n); return { shadow: cs.boxShadow, outline: cs.outlineColor, outlineWidth: cs.outlineWidth, border: getComputedStyle(document.documentElement).getPropertyValue('--text-soft') }; });
      const layers = ring.shadow.split(/,(?![^(]*\))/).map((s) => s.trim());
      expect(layers, `${dark ? 'dark' : 'light'}: one ring`).toHaveLength(1);
      expect(layers[0]).toMatch(/ 0px 0px 0px 1px$/);
      const [r, g, b] = layers[0].match(/\d+/g).slice(0, 3).map(Number);
      expect(Math.max(r, g, b) - Math.min(r, g, b), 'neutral colour').toBeLessThan(24);
    }
  });

  test('typing is reported; Back, Escape and a press outside fold it back', async ({ page }) => {
    await open(page, 'toolbar-dynamic');
    await page.locator('#search [data-td="expand"]').click();
    await page.getByRole('searchbox').fill('Sánchez');
    await expect(page.locator('#log')).toHaveText('Buscando «Sánchez»');
    await page.getByRole('button', { name: 'Volver' }).click();
    await still(page);
    expect(await boxWidth(page)).toBeLessThan(120);
    await expect(page.locator('#search [data-td="expand"]')).toBeFocused();
    await page.locator('#search [data-td="expand"]').click();
    await page.keyboard.press('Escape');
    await still(page);
    expect(await boxWidth(page)).toBeLessThan(120);
    await page.locator('#search [data-td="expand"]').click();
    await page.mouse.click(10, 10);
    await still(page);
    expect(await boxWidth(page)).toBeLessThan(120);
  });

  test('reduced motion swaps the rows with a fade and no width travel', async ({ page }) => {
    await reduce(page);
    await open(page, 'toolbar-dynamic');
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#search [data-td="expand"]').click(), () => Math.round(document.querySelector('#search [data-td="box"]').getBoundingClientRect().width), 300));
    expect(frames.every((f) => f.v === 300)).toBe(true);
  });

  test.describe('on a touch screen', () => {
    test.use({ hasTouch: true });
    test('a tap opens it and a tap outside folds it', async ({ page }) => {
      await open(page, 'toolbar-dynamic');
      await page.locator('#search [data-td="expand"]').tap();
      await expect(page.getByRole('searchbox')).toBeVisible();
      await page.touchscreen.tap(10, 10);
      await expect(page.getByRole('searchbox')).toBeHidden();
    });
  });

  test('nothing overflows the bar, closed or open, and it fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 600 });
    await open(page, 'toolbar-dynamic');
    expect(await overflowing(page.locator('#search'))).toEqual([]);
    await page.locator('#search [data-td="expand"]').click();
    await still(page);
    expect(await overflowing(page.locator('#search'))).toEqual([]);
    const r = await rectOf(page.locator('#search'));
    expect(r.left + r.width).toBeLessThanOrEqual(320);
  });

  for (const q of themes) {
    test(`AA contrast of the icons, the field and its placeholder ${q || '(light)'}`, async ({ page }) => {
      await open(page, 'toolbar-dynamic', q);
      expect(await page.locator('#search [data-td="expand"]').evaluate((el) => window.__contrast(el))).toBeGreaterThanOrEqual(4.5);
      await page.locator('#search [data-td="expand"]').click();
      await expect(page.getByRole('searchbox')).toBeVisible();
      expect(await page.locator('#search [data-td="input"]').evaluate((el) => window.__contrast(el))).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('destroy() puts the closed row back and drops the listeners', async ({ page }) => {
    await open(page, 'toolbar-dynamic');
    await page.locator('#search [data-td="expand"]').click();
    await page.evaluate(async () => { const m = await import('/motion/toolbar-dynamic.js'); m.mount(document.getElementById('search')).destroy(); });
    await expect(page.locator('#search')).not.toHaveAttribute('data-state', /.*/);
    await expect(page.locator('#search [data-td="expand"]')).not.toHaveAttribute('aria-expanded', /.*/);
    await expect(page.locator('#search [data-td="closed"]')).toBeVisible();
  });
});

// ───────────────────────────── toolbar expandable ─────────────────────────────
test.describe('toolbar expandable', () => {
  const action = (page, name) => page.getByRole('button', { name, exact: true });
  const clip = (page) => page.locator('#selection [data-te="clip"]');
  const still = (page) => page.waitForFunction(() => document.querySelector('#selection [data-te="clip"]').getAnimations().length === 0);

  test('the Escape that folds the panel is spent there: a layer around the bar does not get it as well', async ({ page }) => {
    await open(page, 'toolbar-expandable');
    await page.evaluate(() => { window.__outer = []; document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__outer.push(e.defaultPrevented); }); });
    await action(page, 'Descargar').click();
    await page.keyboard.press('Escape');
    await expect(action(page, 'Descargar')).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.__outer), 'the first is prevented, the second (nothing open) is not').toEqual([true, false]);
  });

  test('starts folded: a toolbar of four named actions and the count', async ({ page }) => {
    await open(page, 'toolbar-expandable');
    await expect(page.getByRole('toolbar', { name: 'Acciones sobre las facturas seleccionadas' }).or(page.locator('#selection [role="toolbar"]'))).toBeVisible();
    await expect(clip(page)).toBeHidden();
    await expect(page.locator('#selection .tbe__count')).toHaveText('3 seleccionadas');
    for (const n of ['Enviar por email', 'Descargar', 'Etiquetar', 'Anular']) await expect(action(page, n)).toHaveAttribute('aria-expanded', 'false');
  });

  test('an action opens its panel above the bar: the height grows on a spring up to the content, and the content fades in', async ({ page }) => {
    await open(page, 'toolbar-expandable');
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#selection [data-te-item="send"]').click(), () => {
      const c = document.querySelector('#selection [data-te="clip"]');
      const p = document.querySelector('#selection [data-te-panel="send"]');
      return { h: c.hidden ? 0 : window.__shown(c).height, o: +getComputedStyle(p).opacity, bottom: document.querySelector('#selection .tbe__menu').getBoundingClientRect().bottom };
    }, 800));
    const v = frames.map((f) => f.v);
    const final = v.at(-1).h;
    expect(final).toBeGreaterThan(60);
    expect(v.some((f) => f.h > 10 && f.h < final - 10)).toBe(true);
    expect(Math.max(...v.map((f) => f.h))).toBeLessThan(final * 1.12);
    expect(v.some((f) => f.o > 0 && f.o < 1)).toBe(true);
    expect(v.at(-1).o).toBe(1);
    await expect(action(page, 'Enviar por email')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('region', { name: 'Enviar por email' })).toBeVisible();
    await expect(page.locator('#selection [data-te-panel]:not([hidden])')).toHaveCount(1);
  });

  test('another action swaps the content and the height follows; the same action folds it', async ({ page }) => {
    await open(page, 'toolbar-expandable');
    await action(page, 'Enviar por email').click();
    await still(page);
    const send = (await rectOf(clip(page))).height;
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#selection [data-te-item="void"]').click(), () => window.__shown(document.querySelector('#selection [data-te="clip"]')).height, 600));
    await still(page);
    const voided = (await rectOf(clip(page))).height;
    expect(Math.abs(send - voided)).toBeGreaterThan(5);
    expect(frames.some((f) => f.v > Math.min(send, voided) + 2 && f.v < Math.max(send, voided) - 2)).toBe(true);
    await expect(page.getByRole('region', { name: 'Anular' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Enviar por email' })).toBeHidden();
    await action(page, 'Anular').click();
    await expect(clip(page)).toBeHidden();
    await expect(action(page, 'Anular')).toHaveAttribute('aria-expanded', 'false');
  });

  test('Escape folds it and gives the focus back to the action; a press outside folds it too', async ({ page }) => {
    await open(page, 'toolbar-expandable');
    await action(page, 'Descargar').click();
    await expect(clip(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(clip(page)).toBeHidden();
    await expect(action(page, 'Descargar')).toBeFocused();
    await action(page, 'Etiquetar').click();
    await expect(clip(page)).toBeVisible();
    await page.mouse.click(10, 10);
    await expect(clip(page)).toBeHidden();
  });

  test('arrows, Home and End move between the actions with a roving tab stop', async ({ page }) => {
    await open(page, 'toolbar-expandable');
    await action(page, 'Enviar por email').focus();
    await page.keyboard.press('ArrowRight');
    await expect(action(page, 'Descargar')).toBeFocused();
    await expect(action(page, 'Descargar')).toHaveAttribute('tabindex', '0');
    await expect(action(page, 'Enviar por email')).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('End');
    await expect(action(page, 'Anular')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(action(page, 'Enviar por email')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(action(page, 'Anular')).toBeFocused();
  });

  test('the open panel keeps the width of the bar and nothing overflows', async ({ page }) => {
    await open(page, 'toolbar-expandable');
    await action(page, 'Anular').click();
    await still(page);
    const [bar, panel] = await page.evaluate(() => [document.querySelector('#selection .tbe__menu').getBoundingClientRect().width, document.querySelector('#selection [data-te="body"]').getBoundingClientRect().width]);
    expect(near(bar, panel)).toBe(true);
    expect(await overflowing(page.locator('#selection'))).toEqual([]);
  });

  test('reduced motion swaps the panel at once and fades its content', async ({ page }) => {
    await reduce(page);
    await open(page, 'toolbar-expandable');
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#selection [data-te-item="send"]').click(), () => Math.round(document.querySelector('#selection [data-te="clip"]').getBoundingClientRect().height), 300));
    expect(new Set(frames.map((f) => f.v)).size).toBe(1);
    expect(frames[0].v).toBeGreaterThan(60);
  });

  test.describe('on a touch screen', () => {
    test.use({ hasTouch: true });
    test('a tap opens an action and a tap outside folds it', async ({ page }) => {
      await open(page, 'toolbar-expandable');
      await action(page, 'Etiquetar').tap();
      await expect(clip(page)).toBeVisible();
      await page.touchscreen.tap(10, 10);
      await expect(clip(page)).toBeHidden();
    });
  });

  for (const q of themes) {
    test(`AA contrast of the count, the icons and the open panel ${q || '(light)'}`, async ({ page }) => {
      await open(page, 'toolbar-expandable', q);
      await action(page, 'Enviar por email').click();
      await still(page);
      const c = await page.evaluate(() => [...document.querySelectorAll('#selection .tbe__count, #selection .tbe__btn, #selection [data-te-panel]:not([hidden]) p, #selection [data-te-panel]:not([hidden]) .tbe__action')].map((n) => window.__contrast(n)));
      expect(Math.min(...c)).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('destroy() leaves the bar plain', async ({ page }) => {
    await open(page, 'toolbar-expandable');
    await action(page, 'Enviar por email').click();
    await page.evaluate(async () => { const m = await import('/motion/toolbar-expandable.js'); m.mount(document.getElementById('selection')).destroy(); });
    await expect(clip(page)).toBeHidden();
    await expect(page.locator('#selection [data-te-item]').first()).not.toHaveAttribute('aria-expanded', /.*/);
    await action(page, 'Descargar').click();
    await expect(clip(page)).toBeHidden();
  });
});

// ───────────────────────────── Kokonut toolbar ─────────────────────────────
test.describe('Kokonut toolbar', () => {
  const tool = (page, key) => page.locator(`#tools [data-kt-item="${key}"]`);
  const labelWidth = (page, key) => tool(page, key).locator('.ktb__label').evaluate((el) => el.getBoundingClientRect().width);
  const pad = (page, key) => tool(page, key).evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
  const still = (page) => page.waitForFunction(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.('#tools') && !a.effect.target.classList.contains('ktb__pop') && !a.effect.target.classList.contains('ktb__line')).length === 0);

  test('starts with Facturas open as a pill and the rest as icons, all named', async ({ page }) => {
    await open(page, 'kokonut-toolbar');
    await expect(tool(page, 'facturas')).toHaveAttribute('aria-pressed', 'true');
    expect(await labelWidth(page, 'facturas')).toBeGreaterThan(30);
    expect(await labelWidth(page, 'clientes')).toBe(0);
    expect(await pad(page, 'facturas')).toBe(16);
    expect(await pad(page, 'clientes')).toBe(8);
    await expect(page.getByRole('toolbar', { name: 'Herramientas de facturas' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exportar' })).toBeVisible();
  });

  test('choosing a tool opens its pill and closes the previous one together: the pill and the label shown travel', async ({ page }) => {
    await open(page, 'kokonut-toolbar');
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#tools [data-kt-item="exportar"]').click(), () => {
      const item = (k) => document.querySelector(`#tools [data-kt-item="${k}"]`);
      const w = (k) => window.__shown(item(k).querySelector('.ktb__label')).width;
      const p = (k) => window.__surface(item(k)).width;
      return { open: w('exportar'), old: w('facturas'), pillOpen: p('exportar'), pillOld: p('facturas'), padOpen: parseFloat(getComputedStyle(item('exportar')).paddingLeft) };
    }, 700));
    const v = frames.map((f) => f.v);
    const natural = v.at(-1).open;
    expect(natural).toBeGreaterThan(30);
    expect(v.some((f) => f.open > 4 && f.open < natural - 4)).toBe(true);
    expect(v.some((f) => f.old > 4 && f.old < v[0].old - 4)).toBe(true);
    expect(v.some((f) => f.pillOpen > v[0].pillOpen + 4 && f.pillOpen < v.at(-1).pillOpen - 4), 'the opening pill grows').toBe(true);
    expect(v.some((f) => f.pillOld < v[0].pillOld - 4 && f.pillOld > v.at(-1).pillOld + 4), 'the closing pill shrinks').toBe(true);
    expect(v.at(-1).old).toBe(0);
    expect(v.at(-1).padOpen).toBe(16);
    expect(Math.max(...v.map((f) => f.open))).toBeLessThanOrEqual(natural + 0.5);
    await expect(tool(page, 'facturas')).toHaveAttribute('aria-pressed', 'false');
  });

  test('a notice pops above the bar with its line and goes away by itself', async ({ page }) => {
    await open(page, 'kokonut-toolbar');
    await tool(page, 'buscar').click();
    const pill = page.locator('#tools .ktb__pill');
    await expect(pill).toHaveText('Buscar: listo');
    const bar = await rectOf(page.locator('#tools .ktb__bar'));
    await page.waitForTimeout(400);
    const notice = await rectOf(pill);
    expect(notice.top + notice.height).toBeLessThan(bar.top);
    await expect(page.locator('#tools .ktb__line')).toBeVisible();
    await tool(page, 'filtros').click();
    await expect(pill).toHaveText('Filtros: listo');
    await expect(page.locator('#tools .ktb__pop')).toHaveCount(1);
    await expect(page.locator('#tools .ktb__pop')).toHaveCount(0, { timeout: 3500 });
  });

  test('pressing the open tool again closes it without a notice', async ({ page }) => {
    await open(page, 'kokonut-toolbar');
    await tool(page, 'facturas').click();
    await expect(tool(page, 'facturas')).toHaveAttribute('aria-pressed', 'false');
    await still(page);
    expect(await labelWidth(page, 'facturas')).toBe(0);
  });

  test('the toggle flips between its two states and answers hover and press', async ({ page }) => {
    await open(page, 'kokonut-toolbar');
    const toggle = page.getByRole('button', { name: 'Solo lectura' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.hover();
    await page.waitForTimeout(300);
    expect(await toggle.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)).toBeCloseTo(1.02, 2);
    await toggle.click();
    const on = page.getByRole('button', { name: 'Edición' });
    await expect(on).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(450);
    expect(await on.evaluate((el) => window.__contrast(el))).toBeGreaterThanOrEqual(4.5);
    await page.mouse.move(5, 5);
    await on.click({ position: { x: 4, y: 4 }, trial: true });
  });

  test('arrows, Home and End walk the tools and the toggle with a roving tab stop', async ({ page }) => {
    await open(page, 'kokonut-toolbar');
    await tool(page, 'facturas').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tool(page, 'clientes')).toBeFocused();
    await expect(tool(page, 'clientes')).toHaveAttribute('tabindex', '0');
    await expect(tool(page, 'facturas')).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('End');
    await expect(page.locator('#tools [data-kt="toggle"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tool(page, 'facturas')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(tool(page, 'facturas')).toHaveAttribute('aria-pressed', 'false');
  });

  test('reduced motion opens the pill at once and fades the notice with no travel', async ({ page }) => {
    await reduce(page);
    await open(page, 'kokonut-toolbar');
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#tools [data-kt-item="clientes"]').click(), () => Math.round(document.querySelector('#tools [data-kt-item="clientes"] .ktb__label').getBoundingClientRect().width), 250));
    expect(new Set(frames.map((f) => f.v)).size).toBe(1);
    expect(frames[0].v).toBeGreaterThan(30);
    const transform = await page.locator('#tools .ktb__pop').evaluate((el) => getComputedStyle(el).transform);
    expect(transform).toBe('none');
  });

  test.describe('on a touch screen', () => {
    test.use({ hasTouch: true });
    test('a tap selects a tool and flips the toggle', async ({ page }) => {
      await open(page, 'kokonut-toolbar');
      await tool(page, 'enviar').tap();
      await expect(tool(page, 'enviar')).toHaveAttribute('aria-pressed', 'true');
      await page.locator('#tools [data-kt="toggle"]').tap();
      await expect(page.locator('#tools [data-kt="toggle"]')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test('the bar and its notice stay inside the window on a phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await open(page, 'kokonut-toolbar');
    const r = await rectOf(page.locator('#tools .ktb__bar'));
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  for (const q of themes) {
    test(`AA contrast of tools, selected pill, notice and toggle ${q || '(light)'}`, async ({ page }) => {
      await open(page, 'kokonut-toolbar', q);
      await tool(page, 'clientes').click();
      await still(page);
      await expect(page.locator('#tools .ktb__pill')).toBeVisible();
      await page.waitForTimeout(350);
      const c = await page.evaluate(() => [...document.querySelectorAll('#tools .ktb__item, #tools .ktb__toggle, #tools .ktb__pill')].map((n) => window.__contrast(n)));
      expect(Math.min(...c)).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('destroy() removes the notice and the tab stops', async ({ page }) => {
    await open(page, 'kokonut-toolbar');
    await tool(page, 'buscar').click();
    await page.evaluate(async () => { const m = await import('/motion/kokonut-toolbar.js'); m.mount(document.getElementById('tools')).destroy(); });
    await expect(page.locator('#tools .ktb__pop')).toHaveCount(0);
    await expect(tool(page, 'clientes')).not.toHaveAttribute('tabindex', /.*/);
    await tool(page, 'clientes').click();
    await expect(page.locator('#tools .ktb__pop')).toHaveCount(0);
  });
});

// ───────────────────────────── what the four size-changing ports may not do ─────────────────────────────
const SIZE_PORTS = {
  'toolbar-expandable': async (page) => { for (const k of ['send', 'void', 'void']) { await page.locator(`#selection [data-te-item="${k}"]`).click(); await page.waitForTimeout(450); } },
  'transition-panel': async (page) => { const go = (n) => page.locator(`#alta [data-tp="${n}"]`).click(); await go('next'); await page.waitForTimeout(450); await go('next'); await page.waitForTimeout(450); await go('prev'); await page.waitForTimeout(450); },
  'toolbar-dynamic': async (page) => { await page.locator('#search [data-td="expand"]').click(); await page.waitForTimeout(450); await page.locator('#search [data-td="back"]').click(); await page.waitForTimeout(450); },
  'kokonut-toolbar': async (page) => { for (const k of ['exportar', 'clientes', 'clientes']) { await page.locator(`#tools [data-kt-item="${k}"]`).click(); await page.waitForTimeout(450); } },
};
test.describe('size changes of toolbars and panel', () => {
  for (const [name, drive] of Object.entries(SIZE_PORTS)) {
    test(`${name}: no animation touches a property of layout`, async ({ page }) => {
      await page.addInitScript(() => {
        window.__animated = new Set();
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (keyframes, options) {
          const names = Array.isArray(keyframes) ? keyframes.flatMap((k) => Object.keys(k)) : Object.keys(keyframes ?? {});
          for (const n of names) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(n)) window.__animated.add(n);
          return animate.call(this, keyframes, options);
        };
      });
      await open(page, name);
      await drive(page);
      const animated = await page.evaluate(() => [...window.__animated]);
      expect(animated.length, 'something animated').toBeGreaterThan(0);
      expect(animated.filter((n) => /^(height|width|top|left|right|bottom|inset|margin|padding|(row|column)?[gG]ap|min|max)/.test(n)), 'layout properties animated').toEqual([]);
    });

    test(`${name}: seven mounts and destroys leave nothing on the window or the document and no observer connected`, async ({ page }) => {
      await page.addInitScript(() => {
        const listeners = [];
        const connected = new Set();
        const same = (a, b) => a.t === b.t && a.type === b.type && a.fn === b.fn && a.c === b.c;
        const entry = (t, type, fn, o) => ({ t, type, fn, c: typeof o === 'boolean' ? o : !!o?.capture });
        const add = EventTarget.prototype.addEventListener;
        const remove = EventTarget.prototype.removeEventListener;
        EventTarget.prototype.addEventListener = function (type, fn, o) {
          if ((this === window || this === document) && fn) {
            const e = entry(this, type, fn, o);
            if (!listeners.some((x) => same(x, e))) { listeners.push(e); o?.signal?.addEventListener('abort', () => { const i = listeners.findIndex((x) => same(x, e)); if (i >= 0) listeners.splice(i, 1); }, { once: true }); }
          }
          return add.call(this, type, fn, o);
        };
        EventTarget.prototype.removeEventListener = function (type, fn, o) {
          if ((this === window || this === document) && fn) { const i = listeners.findIndex((x) => same(x, entry(this, type, fn, o))); if (i >= 0) listeners.splice(i, 1); }
          return remove.call(this, type, fn, o);
        };
        for (const Observer of [ResizeObserver, MutationObserver, IntersectionObserver]) {
          const { observe, disconnect } = Observer.prototype;
          Observer.prototype.observe = function (...a) { connected.add(this); return observe.apply(this, a); };
          Observer.prototype.disconnect = function () { connected.delete(this); return disconnect.call(this); };
        }
        window.__leaks = () => ({ listeners: listeners.map((e) => `${e.t === window ? 'window' : 'document'}:${e.type}`).sort(), observers: connected.size });
      });
      await open(page, name);
      const result = await page.evaluate(async (name) => {
        const { mount } = await import(`/motion/${name}.js`);
        const root = document.querySelector(`[data-motion="${name}"]`);
        const cycle = () => { mount(root).destroy(); };
        cycle();
        const before = window.__leaks();
        for (let i = 0; i < 7; i++) cycle();
        return { before, after: window.__leaks() };
      }, name);
      expect(result.after.listeners).toEqual(result.before.listeners);
      expect(result.after.observers).toBe(result.before.observers);
    });
  }
});
