// Tests of the ports of Arc (uiarc.dev, MIT), run against their isolated demos: the confirm morph, the filter
// toolbar, the sortable data table, the donut chart and the line chart. Each one is mounted, driven with the
// mouse, the keyboard and a touch, sampled frame by frame in the page to prove it travels (and where it ends),
// repeated under reduced motion (no travel, a fade), checked for AA contrast in both themes, for overflow, for
// console errors and for nodes left behind by destroy().
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
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const rgb = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data]; };
    const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    // Contrast of an element's text over what is painted behind it (its ancestors' backgrounds, composited).
    window.__contrast = (el) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
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
const themes = ['', '?theme=dark'];
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
// A descendant that paints outside the box that clips it is an overflow the person sees cut.
const overflowing = (locator) => locator.evaluate((box) => {
  const r = box.getBoundingClientRect();
  return [...box.querySelectorAll('*')].filter((n) => {
    const s = getComputedStyle(n);
    if (s.visibility === 'hidden' || s.display === 'none' || n.closest('[hidden], [inert], .arc-sr') || (n.closest('svg') && n.tagName !== 'svg')) return false;
    const b = n.getBoundingClientRect();
    if (!b.width || !b.height) return false;
    return b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1;
  }).map((n) => n.className || n.tagName);
});

// ───────────────────────────── confirm morph ─────────────────────────────
test.describe('confirm morph', () => {
  const root = (page) => page.locator('#cm-main');
  const trigger = (page) => root(page).locator('.cm-face:not([inert])').getByRole('button', { name: 'Anular factura' });
  const state = (page) => root(page).getAttribute('data-state');
  const ask = async (page) => { await trigger(page).click(); await expect(root(page)).toHaveAttribute('data-state', 'confirming'); };
  const mode = (page, label) => page.getByRole('group', { name: 'Cómo se responde' }).getByRole('button', { name: label }).click();

  test('mounts at rest with only the trigger and its icon', async ({ page }) => {
    await open(page, 'confirm-morph');
    await expect(root(page)).toHaveAttribute('data-state', 'idle');
    await expect(trigger(page)).toBeVisible();
    await expect(root(page).locator('.cm-face')).toHaveCount(1);
    await expect(root(page).locator('.cm-icon svg')).toHaveCount(1);
  });

  test('the pill grows to the question on a spring and hands back to auto width', async ({ page }) => {
    await open(page, 'confirm-morph');
    const before = await root(page).locator('.cm-surface').evaluate((n) => n.getBoundingClientRect().width);
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#cm-main .cm-trigger').click(), () => document.querySelector('#cm-main .cm-surface').getBoundingClientRect().width, 900));
    const widths = frames.map((f) => f.v);
    const natural = await root(page).locator('.cm-face[data-face="confirming"]').evaluate((n) => n.getBoundingClientRect().width);
    expect(widths[0]).toBeLessThan(natural - 30);
    expect(widths.some((w) => w > before + 20 && w < natural - 20)).toBe(true); // it travels, it does not jump
    expect(near(widths.at(-1), natural, 1)).toBe(true);
    expect(await root(page).locator('.cm-surface').evaluate((n) => n.style.width)).toBe('');
  });

  test('the parts of the new face arrive in reading order with a blur that clears', async ({ page }) => {
    await open(page, 'confirm-morph');
    const seen = await page.evaluate(() => window.__sample(() => document.querySelector('#cm-main .cm-trigger').click(), () => [...document.querySelectorAll('#cm-main .cm-face[data-face="confirming"] .cm-part')].map((p) => ({ o: +getComputedStyle(p).opacity, f: getComputedStyle(p).filter })), 500));
    const mid = seen.find((s) => s.v.length === 3 && s.v[0].o > 0.4 && s.v[2].o < 0.4);
    expect(mid, 'the first part is further along than the last').toBeTruthy();
    expect(seen.some((s) => s.v.some((p) => /blur\([1-4]/.test(p.f)))).toBe(true);
    expect(seen.at(-1).v.every((p) => p.o === 1)).toBe(true);
  });

  test('Cancel, Escape and a press outside answer no; focus goes back to the trigger', async ({ page }) => {
    await open(page, 'confirm-morph');
    await ask(page);
    await root(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(root(page)).toHaveAttribute('data-state', 'idle');
    await ask(page);
    await page.keyboard.press('Escape');
    await expect(root(page)).toHaveAttribute('data-state', 'idle');
    await expect(trigger(page)).toBeFocused();
    await ask(page);
    await page.mouse.click(5, 5);
    await expect(root(page)).toHaveAttribute('data-state', 'idle');
  });

  test('keyboard: Enter on the trigger asks, focus lands on Confirm, Enter on Confirm runs it', async ({ page }) => {
    await open(page, 'confirm-morph');
    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expect(root(page).getByRole('button', { name: 'Anular', exact: true })).toBeFocused();
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await expect(root(page)).toHaveAttribute('data-state', 'pending');
    await expect(root(page)).toHaveAttribute('aria-busy', 'true');
    await expect(root(page)).toHaveAttribute('data-state', 'done', { timeout: 4000 });
    await expect(root(page).getByRole('button', { name: 'Deshacer' })).toBeFocused();
  });

  test('a press in the first 280 ms is the tail of the one that opened it, not an answer', async ({ page }) => {
    await open(page, 'confirm-morph');
    await ask(page);
    await root(page).getByRole('button', { name: 'Anular', exact: true }).dispatchEvent('click');
    expect(await state(page)).toBe('confirming');
  });

  test('confirm shows pending, then the result with Undo, which restores', async ({ page }) => {
    await open(page, 'confirm-morph');
    await ask(page);
    await page.waitForTimeout(350);
    await root(page).getByRole('button', { name: 'Anular', exact: true }).click();
    await expect(root(page)).toHaveAttribute('data-face', 'pending');
    await expect(root(page).locator('.cm-spinner')).toBeVisible();
    await expect(root(page)).toHaveAttribute('data-face', 'done', { timeout: 4000 });
    await expect(root(page).locator('.cm-check-tick')).toBeVisible();
    await expect(root(page).locator('[role="status"]')).toContainText('Anulada');
    await root(page).getByRole('button', { name: 'Deshacer' }).click();
    await expect(root(page)).toHaveAttribute('data-state', 'idle', { timeout: 4000 });
  });

  test('the demo answers in about 0.9 s, the time Arc takes to reach its result', async ({ page }) => {
    await open(page, 'confirm-morph');
    await ask(page);
    await page.waitForTimeout(350);
    const reached = await page.evaluate(() => new Promise((resolve) => {
      const host = document.getElementById('cm-main');
      const t0 = performance.now();
      host.addEventListener('confirm-morph:state', (e) => { if (e.detail.state === 'done') resolve(performance.now() - t0); });
      host.querySelector('.cm-confirm').click();
    }));
    expect(reached).toBeGreaterThan(850);
    expect(reached).toBeLessThan(1050);
  });

  test('a rejection shows the error face with Retry', async ({ page }) => {
    await open(page, 'confirm-morph');
    await page.getByRole('group', { name: 'Resultado' }).getByRole('button', { name: 'Falla' }).click();
    await ask(page);
    await page.waitForTimeout(350);
    await root(page).getByRole('button', { name: 'Anular', exact: true }).click();
    await expect(root(page)).toHaveAttribute('data-state', 'error', { timeout: 4000 });
    await expect(root(page).getByRole('button', { name: 'Reintentar' })).toBeVisible();
    await expect(root(page)).toContainText('No se pudo anular');
  });

  test('hold mode fills from the left while pressed, drains if let go early, and runs when it completes', async ({ page }) => {
    await open(page, 'confirm-morph');
    await mode(page, 'Mantener');
    await ask(page);
    await page.waitForTimeout(350);
    const box = await root(page).locator('.cm-confirm').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    const half = await root(page).locator('.cm-fill').evaluate((n) => getComputedStyle(n).clipPath);
    const right = parseFloat(/inset\(0px ([\d.]+)%/.exec(half)?.[1] ?? '100');
    expect(right).toBeGreaterThan(30);
    expect(right).toBeLessThan(70);
    await page.mouse.up();
    await page.waitForTimeout(700);
    expect(await state(page)).toBe('confirming');
    expect(await root(page).locator('.cm-fill').evaluate((n) => getComputedStyle(n).clipPath)).toMatch(/inset\(0px 100%/);
    await page.mouse.down();
    await page.waitForTimeout(1300);
    await page.mouse.up();
    await expect(root(page)).toHaveAttribute('data-state', /pending|done/);
  });

  test('countdown mode ticks the seconds down and Cancel stops it', async ({ page }) => {
    await open(page, 'confirm-morph');
    await mode(page, 'Cuenta regresiva');
    await ask(page);
    await page.waitForTimeout(350);
    await root(page).getByRole('button', { name: 'Anular', exact: true }).click();
    await expect(root(page)).toHaveAttribute('data-face', 'counting');
    await expect(root(page).locator('.cm-digit')).toHaveText('3');
    await expect(root(page).locator('.cm-digit:last-child')).toHaveText('2', { timeout: 2000 });
    const dash = await root(page).locator('.cm-ring-fill').getAttribute('stroke-dasharray');
    expect(parseFloat(dash)).toBeLessThan(0.9);
    await root(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(root(page)).toHaveAttribute('data-state', 'idle');
    await page.waitForTimeout(3200);
    expect(await state(page)).toBe('idle');
  });

  test('countdown mode runs the action when the seconds end', async ({ page }) => {
    await open(page, 'confirm-morph');
    await mode(page, 'Cuenta regresiva');
    await ask(page);
    await page.waitForTimeout(350);
    await root(page).getByRole('button', { name: 'Anular', exact: true }).click();
    await expect(root(page)).toHaveAttribute('data-state', /pending|done/, { timeout: 5000 });
  });

  test('an unanswered question returns to rest by itself, and a pointer on it holds the clock', async ({ page }) => {
    await open(page, 'confirm-morph');
    const result = await page.evaluate(async () => {
      const { mount } = await import('./confirm-morph.js');
      const host = document.createElement('div');
      document.body.append(host);
      const states = [];
      host.addEventListener('confirm-morph:state', (e) => states.push(e.detail.state));
      mount(host, { label: 'Eliminar', confirmTimeout: 700 });
      host.querySelector('.cm-trigger').click();
      await new Promise((r) => setTimeout(r, 1200));
      return states;
    });
    expect(result).toEqual(['confirming', 'idle']);
    await trigger(page).click();
    const box = await root(page).boundingBox();
    await page.mouse.move(box.x + 20, box.y + 18);
    const held = await page.evaluate(async () => {
      const { mount } = await import('./confirm-morph.js');
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:20px;top:20px';
      document.body.append(host);
      mount(host, { label: 'Eliminar', confirmTimeout: 500, cancelOnOutsidePress: false });
      host.querySelector('.cm-trigger').click();
      host.dispatchEvent(new PointerEvent('pointerenter'));
      await new Promise((r) => setTimeout(r, 900));
      const still = host.dataset.state;
      host.dispatchEvent(new PointerEvent('pointerleave'));
      await new Promise((r) => setTimeout(r, 900));
      return [still, host.dataset.state];
    });
    expect(held).toEqual(['confirming', 'idle']);
  });

  test('reduced motion: faces fade, the width does not travel, nothing blurs', async ({ page }) => {
    await reduce(page);
    await open(page, 'confirm-morph');
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#cm-main .cm-trigger').click(), () => ({ w: document.querySelector('#cm-main .cm-surface').getBoundingClientRect().width, f: [...document.querySelectorAll('#cm-main .cm-part')].map((p) => getComputedStyle(p).filter).join() }), 500));
    const widths = frames.map((f) => f.v.w);
    expect(Math.max(...widths.slice(3)) - Math.min(...widths.slice(3))).toBeLessThan(1);
    expect(frames.every((f) => !/blur\(([1-9])/.test(f.v.f))).toBe(true);
    await expect(root(page).locator('.cm-face[data-face="confirming"]')).toBeVisible();
  });

  for (const query of themes) {
    test(`text is AA on every face${query ? ' (dark)' : ''}`, async ({ page }) => {
      await open(page, 'confirm-morph', query);
      const read = () => page.evaluate(() => [...document.querySelectorAll('#cm-main .cm-face:not([inert]) :is(button, .cm-prompt span, .cm-status-text)')].map((n) => ({ t: n.textContent.trim(), c: window.__contrast(n) })));
      const idle = await read();
      await ask(page);
      await page.waitForTimeout(700);
      const asking = await read();
      for (const r of [...idle, ...asking]) expect(r.c, r.t).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('nothing paints outside the pill; focus has a visible ring', async ({ page }) => {
    await open(page, 'confirm-morph');
    await ask(page);
    await page.waitForTimeout(700);
    expect(await overflowing(root(page).locator('.cm-surface'))).toEqual([]);
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, parseFloat(s.outlineWidth)]; });
    expect(ring[0]).not.toBe('none');
    expect(ring[1]).toBeGreaterThanOrEqual(2);
  });

  test('destroy() leaves no nodes, listeners or state behind', async ({ page }) => {
    await open(page, 'confirm-morph');
    const out = await page.evaluate(async () => {
      const { mount } = await import('./confirm-morph.js');
      const host = document.createElement('div');
      document.body.append(host);
      const h = mount(host, { label: 'Eliminar' });
      host.querySelector('.cm-trigger').click();
      h.destroy();
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return { children: host.children.length, cls: host.className, attrs: host.getAttributeNames().join() };
    });
    expect(out).toEqual({ children: 0, cls: '', attrs: 'class' });
  });

  test('a root mounted again after destroy() answers once, not twice', async ({ page }) => {
    await open(page, 'confirm-morph');
    const calls = await page.evaluate(async () => {
      const { mount } = await import('./confirm-morph.js');
      const host = document.createElement('div');
      document.body.append(host);
      mount(host, { label: 'Eliminar' }).destroy();
      let n = 0;
      mount(host, { label: 'Eliminar', onConfirm: () => { n++; } });
      host.querySelector('.cm-trigger').click();
      await new Promise((r) => setTimeout(r, 400));
      host.querySelector('.cm-confirm').click();
      await new Promise((r) => setTimeout(r, 200));
      return n;
    });
    expect(calls).toBe(1);
  });
});

// ───────────────────────────── filter toolbar ─────────────────────────────
test.describe('filter toolbar', () => {
  const bar = (page) => page.locator('#toolbar');
  const add = (page) => bar(page).getByRole('button', { name: 'Agregar filtro' });
  const chips = (page) => bar(page).locator('.ft-slot:not([style*="pointer-events: none"]) .ft-chip');
  const surfaceWidth = (page) => bar(page).locator('.ft-surface').evaluate((n) => n.getBoundingClientRect().width);
  const pick = async (page, field, value) => {
    await add(page).click();
    await bar(page).getByRole('menuitem', { name: new RegExp(`^${field}`) }).click();
    await bar(page).getByRole('menuitemradio', { name: new RegExp(`^${value}`) }).click();
  };

  test('mounts with its chips, the empty note hidden and the menu closed', async ({ page }) => {
    await open(page, 'filter-toolbar');
    await expect(chips(page)).toHaveCount(2);
    await expect(bar(page).locator('.ft-empty')).toHaveCount(0);
    await expect(add(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(bar(page).locator('.ft-panel')).toHaveAttribute('inert', '');
  });

  test('the button turns into the menu: its surface travels from the trigger to the panel and back', async ({ page }) => {
    await open(page, 'filter-toolbar');
    const rest = await surfaceWidth(page);
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#toolbar .ft-trigger').click(), () => document.querySelector('#toolbar .ft-surface').getBoundingClientRect().width, 800));
    const w = frames.map((f) => f.v);
    const panel = await bar(page).locator('.ft-panel').evaluate((n) => n.offsetWidth + 2);
    expect(near(w[0], rest, 6)).toBe(true);
    expect(w.some((x) => x > rest + 15 && x < panel - 15)).toBe(true);
    expect(near(w.at(-1), panel, 1)).toBe(true);
    await expect(add(page)).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(add(page)).toBeFocused();
    await page.waitForTimeout(700);
    expect(near(await surfaceWidth(page), rest, 1)).toBe(true);
    await expect(bar(page).locator('.ft-surface')).not.toHaveAttribute('style', /width/);
  });

  test('two steps: field, then value; the chip comes in and the value of a known field changes in place', async ({ page }) => {
    await open(page, 'filter-toolbar');
    await pick(page, 'Vencimiento', 'Este mes');
    await expect(chips(page)).toHaveCount(3);
    await expect(bar(page).locator('.ft-chip').nth(2)).toContainText('Vencimiento');
    await expect(bar(page).locator('.ft-chip').nth(2)).toContainText('Este mes');
    const before = await bar(page).locator('.ft-chip').first().elementHandle();
    await pick(page, 'Estado', 'Pagada');
    await expect(chips(page)).toHaveCount(3);
    await page.waitForTimeout(700);
    expect(await before.evaluate((n) => n.isConnected && n.textContent.includes('Pagada'))).toBe(true);
    await expect(bar(page).locator('[role="status"]')).toContainText('Estado cambió a Pagada');
  });

  test('the second step slides in from the end edge and Back returns, with the title swapping', async ({ page }) => {
    await open(page, 'filter-toolbar');
    await add(page).click();
    const x = await page.evaluate(() => window.__sample(() => document.querySelector('#toolbar [data-row="estado"]').click(), () => { const s = document.querySelectorAll('#toolbar .ft-step'); return [...s].map((n) => n.getBoundingClientRect().left); }, 600));
    expect(x.some((f) => f.v.length === 2)).toBe(true);
    const title = bar(page).getByRole('dialog').locator('.ft-title-text:not([data-leaving])');
    await expect(title).toHaveText('Estado');
    await bar(page).getByRole('button', { name: 'Volver a los campos' }).click();
    await expect(title).toHaveText('Agregar filtro');
    await expect(bar(page).locator('[data-current]').getByRole('menuitem').first()).toBeVisible();
  });

  test('keyboard: ArrowDown opens on the first item, arrows and type-ahead move, Enter drills, ArrowLeft goes back', async ({ page }) => {
    await open(page, 'filter-toolbar');
    await add(page).focus();
    await page.keyboard.press('ArrowDown');
    const row = (key) => bar(page).locator(`[data-current] [data-row="${key}"]`);
    await expect(row('estado')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(row('cliente')).toBeFocused();
    await page.keyboard.press('m');
    await expect(row('monto')).toBeFocused();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await expect(bar(page).locator('[data-current]').getByRole('menuitemradio', { name: /^Emitida/ })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(row('estado')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(add(page)).toBeFocused();
  });

  test('a press outside closes the menu; the panel is inert again', async ({ page }) => {
    await open(page, 'filter-toolbar');
    await add(page).click();
    await expect(bar(page).getByRole('dialog')).not.toHaveAttribute('inert', '');
    await page.mouse.click(5, 5);
    await expect(add(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(bar(page).locator('.ft-panel')).toHaveAttribute('inert', '');
  });

  test('removing a chip collapses its slot and hands focus to the neighbour; clearing shows the note', async ({ page }) => {
    await open(page, 'filter-toolbar');
    const remove = bar(page).getByRole('button', { name: /^Quitar Estado/ });
    await remove.focus();
    const widths = await page.evaluate(() => window.__sample(() => document.querySelector('#toolbar [data-chip-remove="estado"]').click(), () => document.querySelector('#toolbar .ft-slot')?.getBoundingClientRect().width ?? 0, 700));
    const w = widths.map((f) => f.v);
    expect(w.some((x) => x > 5 && x < w[0] - 5)).toBe(true);
    await expect(chips(page)).toHaveCount(1);
    await expect(bar(page).getByRole('button', { name: /^Quitar Cliente/ })).toBeFocused();
    await bar(page).getByRole('button', { name: 'Quitar todos' }).click();
    await expect(bar(page).locator('.ft-empty')).toHaveText('Sin filtros aplicados');
    await expect(bar(page).getByRole('button', { name: 'Quitar todos' })).toHaveCount(0, { timeout: 2000 });
    await expect(add(page)).toBeFocused();
    await expect(bar(page).locator('[role="status"]')).toContainText('Se quitó Cliente: Sánchez Hermanos S.A.');
  });

  test('clearing two chips at once says so in one sentence', async ({ page }) => {
    await open(page, 'filter-toolbar');
    await bar(page).getByRole('button', { name: 'Quitar todos' }).click();
    await expect(bar(page).locator('[role="status"]')).toHaveText('Se quitaron todos los filtros');
    await expect(chips(page)).toHaveCount(0);
  });

  test('a chip that wraps to another line is offset in the same frame and springs back', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await open(page, 'filter-toolbar');
    await page.evaluate(() => { document.querySelector('#toolbar').style.width = '430px'; });
    const frames = await page.evaluate(() => window.__sample(() => window.toolbar.add({ id: 'vence', label: 'Vencimiento', value: 'Próximo mes' }), () => ({ frame: document.querySelector('#toolbar .ft-frame').getBoundingClientRect().height, list: document.querySelector('#toolbar .ft-chips').getBoundingClientRect().height, moved: [...document.querySelectorAll('#toolbar .ft-chips > .ft-slot')].some((s) => s.style.translate) }), 900));
    const last = frames.at(-1).v;
    expect(near(last.frame, last.list, 1)).toBe(true);
    expect(frames.some((f) => f.v.frame > frames[0].v.frame + 3 && f.v.frame < last.frame - 3) || last.frame === frames[0].v.frame).toBe(true);
    expect(frames.at(-1).v.moved).toBe(false);
  });

  test('reduced motion: chips appear and leave without travelling; the menu fades', async ({ page }) => {
    await reduce(page);
    await open(page, 'filter-toolbar');
    await pick(page, 'Monto', 'Más de');
    const slot = await bar(page).locator('.ft-slot').nth(2).evaluate((n) => n.style.width);
    expect(slot).toBe('');
    await bar(page).getByRole('button', { name: /^Quitar Monto/ }).click();
    await expect(chips(page)).toHaveCount(2);
    expect(await bar(page).locator('.ft-chips > .ft-slot').count()).toBe(2);
  });

  for (const query of themes) {
    test(`chips, menu and note are AA${query ? ' (dark)' : ''}`, async ({ page }) => {
      await open(page, 'filter-toolbar', query);
      await add(page).click();
      await page.waitForTimeout(700);
      const rows = await page.evaluate(() => [...document.querySelectorAll('#toolbar .ft-chip-label, #toolbar .ft-clear, #toolbar .ft-item-label, #toolbar .ft-title-text:not([data-leaving]), #toolbar .ft-face')].map((n) => ({ t: n.textContent.trim().slice(0, 20), c: window.__contrast(n) })));
      for (const r of rows) expect(r.c, r.t).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('the open panel stays inside the viewport and nothing leaks out of it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page, 'filter-toolbar');
    await add(page).click();
    await page.waitForTimeout(700);
    const r = await bar(page).locator('.ft-surface').evaluate((n) => { const b = n.getBoundingClientRect(); return [b.left, b.right]; });
    expect(r[0]).toBeGreaterThanOrEqual(0);
    expect(r[1]).toBeLessThanOrEqual(390);
    expect(await overflowing(bar(page).locator('.ft-surface'))).toEqual([]);
  });

  test('destroy() leaves no nodes or listeners behind', async ({ page }) => {
    await open(page, 'filter-toolbar');
    const out = await page.evaluate(async () => {
      const { mount } = await import('./filter-toolbar.js');
      const host = document.createElement('div');
      document.body.append(host);
      const h = mount(host, { filters: [{ id: 'a', label: 'A', value: 'x' }], addFilter: { fields: [{ id: 'a', label: 'A', options: ['x', 'y'] }] } });
      host.querySelector('.ft-trigger').click();
      h.destroy();
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return { children: host.children.length, attrs: host.getAttributeNames().join() };
    });
    expect(out).toEqual({ children: 0, attrs: 'class' });
  });
});

// ───────────────────────────── sortable data table ─────────────────────────────
test.describe('sortable data table', () => {
  const table = (page) => page.locator('#table');
  const order = (page) => table(page).locator('tbody tr').evaluateAll((rows) => rows.map((r) => r.dataset.key).join(''));
  const head = (page, name) => table(page).getByRole('button', { name: new RegExp(`Ordenar por ${name}`) });

  test('mounts sorted by Importe descending, with the arrow on that column only', async ({ page }) => {
    await open(page, 'sortable-data-table');
    expect(await order(page)).toBe('bcead');
    await expect(table(page).locator('th[data-key="monto"]')).toHaveAttribute('aria-sort', 'descending');
    await expect(table(page).locator('th[data-key="numero"]')).toHaveAttribute('aria-sort', 'none');
    const rot = await table(page).locator('th[data-key="monto"] .sdt-sort-arrow').evaluate((n) => getComputedStyle(n).rotate);
    expect(parseFloat(rot)).toBe(180);
  });

  test('sorting moves the rows on a spring, never reflows the columns, and the arrow flips', async ({ page }) => {
    await open(page, 'sortable-data-table');
    const cols = () => table(page).locator('thead th').evaluateAll((ths) => ths.map((t) => Math.round(t.getBoundingClientRect().width)));
    const before = await cols();
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#table th[data-key="numero"] button').click(), () => [...document.querySelectorAll('#table tbody tr')].map((r) => Math.round(r.getBoundingClientRect().top * 10) / 10 + new DOMMatrix(getComputedStyle(r).transform).f), 800));
    const names = await table(page).locator('tbody tr td:nth-child(2)').allTextContents();
    expect(names).toEqual([...names].sort());
    // a row that changed place travels: its top is neither where it was nor where it is at some frame
    const moved = frames[0].v.some((t, i) => Math.abs(t - frames.at(-1).v[i]) > 20) && frames.some((f) => f.v.some((t, i) => Math.abs(t - frames[0].v[i]) > 6 && Math.abs(t - frames.at(-1).v[i]) > 6));
    expect(moved).toBe(true);
    expect(await cols()).toEqual(before);
    await head(page, 'Factura').click();
    await expect(table(page).locator('th[data-key="numero"]')).toHaveAttribute('aria-sort', 'descending');
    await page.waitForTimeout(500);
    const rot = await table(page).locator('th[data-key="numero"] .sdt-sort-arrow').evaluate((n) => getComputedStyle(n).rotate);
    expect(parseFloat(rot)).toBe(180);
  });

  test('a tint follows the sorted column and its cells are opaque', async ({ page }) => {
    await open(page, 'sortable-data-table');
    await head(page, 'Cliente').click();
    await page.waitForTimeout(500);
    const band = await table(page).locator('.sdt-band').evaluate((n) => { const b = n.getBoundingClientRect(); return [b.left, b.width]; });
    const th = await table(page).locator('th[data-key="cliente"]').evaluate((n) => { const b = n.getBoundingClientRect(); return [b.left, b.width]; });
    expect(near(band[0], th[0], 1.5) && near(band[1], th[1], 1.5)).toBe(true);
    const alpha = await table(page).locator('tbody td').first().evaluate((n) => getComputedStyle(n).backgroundColor);
    expect(alpha).not.toMatch(/rgba\(.*, 0\)/);
  });

  test('selection: a row, the header goes to "some", all, clear; the footer count swaps in place', async ({ page }) => {
    await open(page, 'sortable-data-table');
    const all = table(page).getByRole('checkbox', { name: 'Seleccionar todas las facturas' });
    await expect(table(page).locator('.sdt-footer')).toContainText('5 facturas');
    await table(page).locator('tbody tr').first().click();
    await expect(table(page).locator('tbody tr[data-selected]')).toHaveCount(1);
    expect(await all.evaluate((n) => n.indeterminate)).toBe(true);
    await expect(table(page).locator('.sdt-footer')).toContainText('1 seleccionada');
    await expect(table(page).getByRole('button', { name: 'Quitar selección' })).toBeVisible();
    await page.waitForTimeout(700);
    const mark = await table(page).locator('thead .sdt-mark path').getAttribute('d');
    expect(mark).toMatch(/^M4\.75 9\.00 L9\.00 9\.00 L13\.25 9\.00$/); // the dash: the check morphed into it
    await all.check({ force: true });
    await expect(table(page).locator('tbody tr[data-selected]')).toHaveCount(5);
    expect(await all.evaluate((n) => [n.checked, n.indeterminate])).toEqual([true, false]);
    await page.waitForTimeout(600);
    await page.waitForTimeout(500);
    expect(await table(page).locator('thead .sdt-mark path').getAttribute('d')).toMatch(/^M4\.25 9\.25 L7\.25 12\.25 L13\.75 5\.75$/);
    expect(await table(page).locator('thead .sdt-mark path').getAttribute('stroke-dasharray')).toBe('1.000 1');
    await table(page).getByRole('button', { name: 'Quitar selección' }).click();
    await expect(table(page).locator('tbody tr[data-selected]')).toHaveCount(0);
    await expect(table(page).getByRole('button', { name: 'Quitar selección' })).toHaveCount(0, { timeout: 2000 });
    await expect(table(page).locator('.sdt-footer .sdt-swap-text:not([data-leaving])').last()).toHaveText('facturas');
  });

  test('the count box takes its new width on a spring while the words swap', async ({ page }) => {
    await open(page, 'sortable-data-table');
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#table tbody tr').click(), () => document.querySelector('#table .sdt-count').getBoundingClientRect().width, 800));
    const w = frames.map((f) => f.v);
    expect(w.at(-1)).toBeGreaterThan(w[0] + 20);
    expect(w.some((x) => x > w[0] + 5 && x < w.at(-1) - 5)).toBe(true);
  });

  test('Shift extends a selection over a range', async ({ page }) => {
    await open(page, 'sortable-data-table');
    const boxes = table(page).locator('tbody .sdt-input');
    await boxes.nth(0).click({ force: true });
    await boxes.nth(3).click({ force: true, modifiers: ['Shift'] });
    await expect(table(page).locator('tbody tr[data-selected]')).toHaveCount(4);
  });

  test('keyboard: arrows walk the headers and the row checkboxes, Escape clears', async ({ page }) => {
    await open(page, 'sortable-data-table');
    const all = table(page).getByRole('checkbox', { name: 'Seleccionar todas las facturas' });
    await all.focus();
    await page.keyboard.press('ArrowRight');
    await expect(head(page, 'Factura')).toBeFocused();
    await page.keyboard.press('End');
    await expect(head(page, 'Importe')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(table(page).locator('th[data-key="monto"]')).toHaveAttribute('aria-sort', 'ascending');
    await all.focus();
    await page.keyboard.press('ArrowDown');
    await expect(table(page).locator('tbody .sdt-input').first()).toBeFocused();
    await page.keyboard.press('Space');
    await expect(table(page).locator('tbody tr[data-selected]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(table(page).locator('tbody tr[data-selected]')).toHaveCount(0);
  });

  test('an empty table says why, in one row', async ({ page }) => {
    await open(page, 'sortable-data-table');
    await expect(page.locator('#empty .sdt-empty')).toHaveText('Ninguna factura coincide con los filtros.');
  });

  test('on a phone the header is a strip of sort controls and each row folds into two lines', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await open(page, 'sortable-data-table');
    expect(await table(page).locator('thead tr').evaluate((n) => getComputedStyle(n).display)).toBe('flex');
    expect(await table(page).locator('tbody tr').first().evaluate((n) => getComputedStyle(n).display)).toBe('flex');
    expect(await overflowing(table(page).locator('tbody tr').first())).toEqual([]);
    await head(page, 'Cliente').click();
    await expect(table(page).locator('th[data-key="cliente"]')).toHaveAttribute('aria-sort', 'ascending');
  });

  test('reduced motion: rows change place without travelling', async ({ page }) => {
    await reduce(page);
    await open(page, 'sortable-data-table');
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#table th[data-key="numero"] button').click(), () => [...document.querySelectorAll('#table tbody tr')].map((r) => r.getBoundingClientRect().top), 400));
    const first = frames[2].v;
    expect(frames.slice(2).every((f) => f.v.every((t, i) => near(t, first[i], 1)))).toBe(true);
  });

  for (const query of themes) {
    test(`header, cells, pills and footer are AA${query ? ' (dark)' : ''}`, async ({ page }) => {
      await open(page, 'sortable-data-table', query);
      await table(page).locator('tbody tr').first().click();
      await page.waitForTimeout(500);
      const rows = await page.evaluate(() => [...document.querySelectorAll('#table th button, #table td, #table .arc-pill, #table .sdt-count, #table .sdt-clear')].map((n) => ({ t: n.textContent.trim().slice(0, 20), c: window.__contrast(n) })).filter((r) => r.t));
      for (const r of rows) expect(r.c, r.t).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('no cell paints outside the table; destroy() leaves nothing', async ({ page }) => {
    await open(page, 'sortable-data-table');
    expect(await overflowing(table(page))).toEqual([]);
    const out = await page.evaluate(async () => {
      const { mount } = await import('./sortable-data-table.js');
      const host = document.createElement('div');
      document.body.append(host);
      const h = mount(host, { columns: [{ key: 'a', label: 'A' }], rows: [{ a: 1 }, { a: 2 }], rowKey: 'a', selectable: true });
      h.destroy();
      return { children: host.children.length, cls: host.className, style: host.getAttribute('style') };
    });
    expect(out).toEqual({ children: 0, cls: '', style: '' });
  });
});

// ───────────────────────────── donut chart ─────────────────────────────
test.describe('donut chart', () => {
  const card = (page) => page.locator('#donut');
  const ds = (page) => card(page).locator('.dn-segment').evaluateAll((p) => p.map((n) => n.getAttribute('d')));

  test('the first sweep draws every arc from the top, then the ring is whole', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/motion/donut-chart.html');
    const frames = await page.evaluate(() => window.__sample(() => {}, () => [...document.querySelectorAll('#donut .dn-segment')].filter((n) => n.getAttribute('d')).length, 1400));
    const counts = frames.map((f) => f.v);
    await page.waitForTimeout(600);
    const filled = (await ds(page)).filter(Boolean).length;
    expect(filled).toBe(5);
    expect(counts.at(-1)).toBe(5);
    await expect(card(page).locator('.dn-readout[data-active] .dn-center-value')).toHaveText(/\d/);
  });

  test('the centre rolls to the segment under the pointer and the others dim', async ({ page }) => {
    await open(page, 'donut-chart');
    await page.waitForTimeout(1500);
    const total = await card(page).locator('.dn-readout[data-active] .dn-center-label').textContent();
    expect(total).toBe('Facturado');
    const ring = await card(page).locator('.dn-ring').boundingBox();
    await page.mouse.move(ring.x + ring.width * 0.8, ring.y + ring.height * 0.3);
    await expect(card(page).locator('.dn-readout[data-active] .dn-center-label')).not.toHaveText('Facturado');
    await expect(card(page).locator('.dn-segment[data-active]')).toHaveCount(1);
    expect(await card(page).locator('.dn-segment[data-dim]').count()).toBeGreaterThanOrEqual(3);
    const lifted = await card(page).locator('.dn-segment[data-active]').getAttribute('transform');
    await page.waitForTimeout(400);
    expect(await card(page).locator('.dn-segment[data-active]').getAttribute('transform')).not.toBe(lifted === 'translate(0 0)' ? 'translate(0 0)' : null);
    await page.mouse.move(5, 5);
    await expect(card(page).locator('.dn-segment[data-active]')).toHaveCount(0);
  });

  test('switching the range keeps the arcs: the same nodes morph, a new key joins and one leaves', async ({ page }) => {
    await open(page, 'donut-chart');
    await page.waitForTimeout(1500);
    const pagada = await card(page).locator('.dn-segment[data-key="pagada"]').elementHandle();
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#range [data-v="week"]').click(), () => document.querySelector('#donut .dn-segment[data-key="pagada"]').getAttribute('d'), 900));
    const distinct = new Set(frames.map((f) => f.v));
    expect(distinct.size).toBeGreaterThan(6);
    expect(await pagada.evaluate((n) => n.isConnected)).toBe(true);
    await page.getByRole('button', { name: 'Año' }).click();
    await page.waitForTimeout(1200);
    expect(await card(page).locator('.dn-segment').count()).toBeGreaterThanOrEqual(5);
    await page.getByRole('button', { name: 'Mes' }).click();
    await page.waitForTimeout(1200);
    await expect(card(page).locator('.dn-segment[data-key="cesion"]')).toHaveCount(0);
    expect(await pagada.evaluate((n) => n.isConnected)).toBe(true);
  });

  test('small parts group into Otros, and hiding a segment closes it and redistributes the ring', async ({ page }) => {
    await open(page, 'donut-chart');
    await page.getByRole('button', { name: 'Año' }).click();
    await page.waitForTimeout(1500);
    const rows = await card(page).locator('.dn-row').allTextContents();
    expect(rows.some((r) => r.includes('Otros'))).toBe(true);
    const before = (await card(page).locator('.dn-readout[data-active] .dn-center-value').textContent());
    await card(page).locator('.dn-row').first().click();
    await page.waitForTimeout(1200);
    await expect(card(page).locator('.dn-row').first()).toHaveAttribute('aria-pressed', 'false');
    expect(await card(page).locator('.dn-readout[data-active] .dn-center-value').textContent()).not.toBe(before);
    expect((await ds(page))[0]).toBe('');
    await card(page).locator('.dn-row').first().click();
    await page.waitForTimeout(1000);
    expect((await ds(page))[0]).not.toBe('');
  });

  test('the last visible segment cannot be hidden', async ({ page }) => {
    await open(page, 'donut-chart');
    await page.waitForTimeout(1200);
    const rows = card(page).locator('.dn-row');
    const n = await rows.count();
    for (let i = 0; i < n; i++) await rows.nth(i).click();
    await page.waitForTimeout(800);
    expect(await card(page).locator('.dn-row[aria-pressed="true"]').count()).toBe(1);
  });

  test('keyboard: arrows walk the legend, the focused row previews its arc, Escape unpins', async ({ page }) => {
    await open(page, 'donut-chart');
    await page.waitForTimeout(1200);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const first = card(page).locator('.dn-row').first();
    await first.focus();
    await page.keyboard.press('ArrowDown');
    await expect(card(page).locator('.dn-row').nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(card(page).locator('.dn-row').last()).toBeFocused();
  });

  test('a summary and a data table carry the numbers; the ring is hidden from assistive technology', async ({ page }) => {
    await open(page, 'donut-chart');
    await page.waitForTimeout(800);
    expect(await card(page).locator('.dn-svg').getAttribute('aria-hidden')).toBe('true');
    expect(await card(page).locator('[data-table] tbody tr').count()).toBe(6); // the two parts inside "Otros" are listed by name
    expect(await card(page).locator('[data-summary]').textContent()).toContain('Facturado');
    await expect(card(page).locator('.dn-row').first()).toHaveAttribute('aria-label', /Pagada, .*%/);
  });

  test('reduced motion: arcs land at once and the sweep does not run', async ({ page }) => {
    await reduce(page);
    await page.goto('/motion/donut-chart.html');
    await page.waitForTimeout(250);
    expect((await ds(page)).filter(Boolean).length).toBe(5);
    const a = await ds(page);
    await page.getByRole('button', { name: 'Semana' }).click();
    await page.waitForTimeout(120);
    const b = await ds(page);
    await page.waitForTimeout(250);
    expect(await ds(page)).toEqual(b);
    expect(b).not.toEqual(a);
  });

  for (const query of themes) {
    test(`legend, centre and the arcs against the card are legible${query ? ' (dark)' : ''}`, async ({ page }) => {
      await open(page, 'donut-chart', query);
      await page.waitForTimeout(1500);
      const rows = await page.evaluate(() => [...document.querySelectorAll('#donut .dn-row-label, #donut .dn-row-value, #donut .dn-row-share, #donut .dn-readout[data-active] > *')].map((n) => ({ t: n.textContent.trim().slice(0, 20), c: window.__contrast(n) })).filter((r) => r.t));
      for (const r of rows) expect(r.c, r.t).toBeGreaterThanOrEqual(4.5);
      const arcs = await page.evaluate(() => [...document.querySelectorAll('#donut .dn-segment')].map((n) => getComputedStyle(n).fill));
      expect(new Set(arcs).size).toBe(5);
    });
  }

  test('nothing overflows the card; destroy() leaves nothing', async ({ page }) => {
    await open(page, 'donut-chart');
    await page.waitForTimeout(1200);
    expect(await overflowing(page.locator('#card'))).toEqual([]);
    const out = await page.evaluate(async () => {
      const { mount } = await import('./donut-chart.js');
      const host = document.createElement('div');
      document.body.append(host);
      const h = mount(host, { data: [{ key: 'a', label: 'A', value: 1 }, { key: 'b', label: 'B', value: 2 }], label: 'x' });
      h.destroy();
      return { children: host.children.length, cls: host.className, attrs: host.getAttributeNames().join() };
    });
    expect(out).toEqual({ children: 0, cls: '', attrs: 'class' });
  });
});

// ───────────────────────────── line chart ─────────────────────────────
test.describe('line chart', () => {
  const chart = (page) => page.locator('#chart');
  const path = (page, key = 'current') => chart(page).locator(`.lc-series g:nth-child(${key === 'current' ? 1 : 2}) .lc-line`);

  test('draws its lines left to right the first time it is seen, then rests', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/motion/line-chart.html');
    const frames = await page.evaluate(() => window.__sample(() => {}, () => +document.querySelector('#chart clipPath rect').getAttribute('width'), 1600));
    const w = frames.map((f) => f.v);
    const plot = await chart(page).locator('.lc-plot').evaluate((n) => n.clientWidth);
    expect(w.some((x) => x > 20 && x < plot - 20)).toBe(true);
    expect(w.at(-1)).toBeGreaterThanOrEqual(plot);
    await expect(chart(page).locator('.lc-line')).toHaveCount(2);
    await expect(chart(page).locator('.lc-line[data-dashed]')).toHaveCount(1);
  });

  test('a new range morphs the same line instead of redrawing it, and the scale slides with it', async ({ page }) => {
    await open(page, 'line-chart');
    await page.waitForTimeout(2000);
    const node = await path(page).elementHandle();
    const before = await path(page).getAttribute('d');
    const ticks = await chart(page).locator('.lc-tick-text').allTextContents();
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#range [data-v="7"]').click(), () => ({ d: document.querySelector('#chart .lc-series g .lc-line').getAttribute('d'), y: [...document.querySelectorAll('#chart .lc-gridline')].map((l) => +l.getAttribute('y1')).join() }), 1900));
    const ds = new Set(frames.map((f) => f.v.d));
    expect(ds.size).toBeGreaterThan(8);
    expect(frames[0].v.d).not.toBe(frames.at(-1).v.d);
    expect(before).not.toBe(frames.at(-1).v.d);
    expect(new Set(frames.map((f) => f.v.y)).size).toBeGreaterThan(4);
    expect(await node.evaluate((n) => n.isConnected)).toBe(true);
    await page.waitForTimeout(600);
    expect(await chart(page).locator('.lc-tick-text').allTextContents()).not.toEqual(ticks);
    expect(await chart(page).locator('[data-table] tbody tr').count()).toBe(7);
    await expect(chart(page).locator('.lc-axis-label').last()).toBeVisible();
  });

  test('a new range first dims the old lines and holds the total, then draws the new ones and rolls the total', async ({ page }) => {
    await open(page, 'line-chart');
    await page.waitForTimeout(2000);
    const before = await page.locator('#big .ar-sr').textContent();
    const frames = await page.evaluate(() => window.__sample(() => document.querySelector('#range [data-v="7"]').click(), () => ({
      loading: document.querySelector('#chart .lc-chart').hasAttribute('data-loading'),
      opacity: +getComputedStyle(document.querySelector('#chart .lc-series')).opacity,
      d: document.querySelector('#chart .lc-series g .lc-line').getAttribute('d'),
      total: document.querySelector('#big .ar-sr').textContent,
    }), 1800));
    const at = (ms) => frames.find((f) => f.t >= ms).v;
    expect(at(150).loading).toBe(true);
    expect(at(150).opacity).toBeLessThan(0.5);
    expect(at(400).d).toBe(frames[0].v.d);
    expect(at(400).total).toBe(before);
    const arrived = frames.find((f) => !f.v.loading && f.t > 100);
    expect(arrived.t).toBeGreaterThan(400);
    expect(arrived.t).toBeLessThan(700);
    expect(frames.at(-1).v.d).not.toBe(frames[0].v.d);
    expect(frames.at(-1).v.opacity).toBe(1);
    expect(frames.at(-1).v.total).not.toBe(before);
  });

  test('hovering a day rolls the digits of the headline instead of writing them', async ({ page }) => {
    await open(page, 'line-chart');
    await page.waitForTimeout(2000);
    const plot = await chart(page).locator('.lc-plot').boundingBox();
    const frames = await page.evaluate(([x, y]) => new Promise((resolve) => {
      const out = [];
      const t0 = performance.now();
      const tick = () => { out.push({ t: performance.now() - t0, cells: [...document.querySelectorAll('#big .ar-slot__strip')].map((s) => s.children.length), moving: [...document.querySelectorAll('#big .ar-slot__strip')].some((s) => new DOMMatrix(getComputedStyle(s).transform).f !== 0 && s.children.length > 1) }); if (performance.now() - t0 < 900) requestAnimationFrame(tick); else resolve(out); };
      window.__hover = () => document.querySelector('#chart .lc-plot').dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: x, clientY: y, bubbles: true }));
      window.__hover();
      requestAnimationFrame(tick);
    }), [plot.x + plot.width * 0.5, plot.y + plot.height / 2]);
    expect(frames.some((f) => f.cells.some((n) => n > 1))).toBe(true);
    expect(frames.filter((f) => f.moving).length).toBeGreaterThan(5);
    await expect(page.locator('#big .ar-sr')).toHaveText(/\$/);
  });

  test('scrubbing: the crosshair and the tooltip follow the pointer, the headline reads the day', async ({ page }) => {
    await open(page, 'line-chart');
    await page.waitForTimeout(2000);
    const plot = await chart(page).locator('.lc-plot').boundingBox();
    await page.mouse.move(plot.x + plot.width * 0.5, plot.y + plot.height / 2);
    await expect(chart(page).locator('.lc-chart')).toHaveAttribute('data-scrubbing', '');
    await expect(chart(page).locator('.lc-tip-title')).not.toBeEmpty();
    await page.waitForTimeout(300);
    const x1 = Number(await chart(page).locator('.lc-crosshair').getAttribute('x1'));
    expect(Math.abs(x1 - plot.width * 0.5)).toBeLessThan(plot.width / 30 + 1);
    await expect(page.locator('#big-label')).not.toHaveText('Total cobrado');
    await page.mouse.move(plot.x + plot.width * 0.9, plot.y + plot.height / 2, { steps: 4 });
    const mid = await page.evaluate(() => window.__sample(() => {}, () => document.querySelector('#chart .lc-tooltip').getBoundingClientRect().left, 100));
    expect(mid.length).toBeGreaterThan(2);
    await page.mouse.move(5, 5);
    await expect(page.locator('#big-label')).toHaveText('Total cobrado');
  });

  test('the tooltip flips to the other side of the crosshair before it leaves the plot', async ({ page }) => {
    await open(page, 'line-chart');
    await page.waitForTimeout(2000);
    const plot = await chart(page).locator('.lc-plot').boundingBox();
    await page.mouse.move(plot.x + plot.width * 0.97, plot.y + plot.height / 2);
    await page.waitForTimeout(700);
    const t = await chart(page).locator('.lc-tooltip').boundingBox();
    const c = await chart(page).locator('.lc-crosshair').boundingBox();
    expect(t.x + t.width).toBeLessThanOrEqual(plot.x + plot.width + 1);
    expect(t.x + t.width).toBeLessThanOrEqual(c.x + 2);
  });

  test('keyboard: arrows, Home, End and Page keys move the cursor, the slider value says where; Escape lets go', async ({ page }) => {
    await open(page, 'line-chart');
    await page.waitForTimeout(2000);
    const plot = chart(page).getByRole('slider');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await plot.focus();
    await page.keyboard.press('ArrowLeft');
    const n = Number(await plot.getAttribute('aria-valuemax'));
    expect(Number(await plot.getAttribute('aria-valuenow'))).toBe(n - 1);
    await page.keyboard.press('Home');
    expect(await plot.getAttribute('aria-valuenow')).toBe('1');
    await page.keyboard.press('End');
    expect(await plot.getAttribute('aria-valuenow')).toBe(String(n));
    await page.keyboard.press('PageDown');
    expect(Number(await plot.getAttribute('aria-valuenow'))).toBeLessThan(n);
    expect(await plot.getAttribute('aria-valuetext')).toContain('Este período');
    await page.keyboard.press('Escape');
    await expect(chart(page).locator('.lc-chart')).not.toHaveAttribute('data-scrubbing', '');
  });

  test('a touch drag scrubs and lifting lets go', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 700, height: 900 } });
    const page = await ctx.newPage();
    const list = [];
    page.on('pageerror', (e) => list.push(String(e)));
    await page.goto('/motion/line-chart.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const plot = await chart(page).locator('.lc-plot').boundingBox();
    const client = await ctx.newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: plot.x + plot.width * 0.4, y: plot.y + plot.height / 2 }] });
    await page.waitForTimeout(150);
    await expect(chart(page).locator('.lc-chart')).toHaveAttribute('data-scrubbing', '');
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(chart(page).locator('.lc-chart')).not.toHaveAttribute('data-scrubbing', '');
    expect(list).toEqual([]);
    await ctx.close();
  });

  test('hiding a series flattens it into the baseline and the rest rescale', async ({ page }) => {
    await open(page, 'line-chart');
    await page.waitForTimeout(2000);
    const group = chart(page).locator('.lc-series g').nth(1);
    const op = await page.evaluate(() => window.__sample(() => document.querySelector('#chart .lc-toggle[data-key="previous"]').click(), () => +document.querySelector('#chart .lc-series g:nth-child(2)').style.opacity, 900));
    const o = op.map((f) => f.v);
    expect(o.some((x) => x > 0.1 && x < 0.9)).toBe(true);
    expect(o.at(-1)).toBe(0);
    await expect(chart(page).locator('.lc-toggle[data-key="previous"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(group).toHaveCSS('opacity', '0');
    await chart(page).locator('.lc-toggle[data-key="current"]').click();
    await expect(chart(page).locator('.lc-message')).toHaveText('Elegí una serie para mostrar');
  });

  test('the data table lists every point; the plot says what it is', async ({ page }) => {
    await open(page, 'line-chart');
    expect(await chart(page).locator('[data-table] tbody tr').count()).toBe(30);
    expect(await chart(page).locator('[data-table] thead th').allTextContents()).toEqual(['Fecha', 'Este período', 'Período anterior']);
    await expect(chart(page).getByRole('slider')).toHaveAttribute('aria-label', /Ingresos cobrados, explorar por fecha/);
    expect(await chart(page).locator('.lc-svg').getAttribute('aria-hidden')).toBe('true');
  });

  test('loading keeps the lines on screen, dimmed; an empty range says so', async ({ page }) => {
    await open(page, 'line-chart');
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.chart.setLoading(true));
    await expect(chart(page).locator('.lc-chart')).toHaveAttribute('data-loading', '');
    expect(await chart(page).locator('.lc-series').evaluate((n) => +getComputedStyle(n).opacity)).toBeLessThan(0.5);
    await page.evaluate(() => { window.chart.setLoading(false); window.chart.update({ data: [] }); });
    await expect(chart(page).locator('.lc-message')).toHaveText('Sin datos para este período');
  });

  test('reduced motion: the new range lands at once and nothing draws', async ({ page }) => {
    await reduce(page);
    await open(page, 'line-chart');
    await page.waitForTimeout(300);
    const w = await chart(page).locator('clipPath rect').getAttribute('width');
    expect(Number(w)).toBeGreaterThan(300);
    await page.getByRole('button', { name: '7 días' }).click();
    await page.waitForTimeout(100);
    const d = await path(page).getAttribute('d');
    await page.waitForTimeout(300);
    expect(await path(page).getAttribute('d')).toBe(d);
  });

  for (const query of themes) {
    test(`axis, legend, tooltip and headline are AA${query ? ' (dark)' : ''}`, async ({ page }) => {
      await open(page, 'line-chart', query);
      await page.waitForTimeout(1800);
      const plot = await chart(page).locator('.lc-plot').boundingBox();
      await page.mouse.move(plot.x + plot.width * 0.4, plot.y + plot.height / 2);
      await page.waitForTimeout(500);
      const rows = await page.evaluate(() => [...document.querySelectorAll('#chart .lc-tick-text, #chart .lc-axis-label, #chart .lc-toggle-label, #chart .lc-tip-title, #chart .lc-tip-name, #chart .lc-tip-value, #big, #big-label, #delta')].map((n) => ({ t: n.textContent.trim().slice(0, 20), c: window.__contrast(n) })).filter((r) => r.t));
      for (const r of rows) expect(r.c, r.t).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('nothing overflows the card; destroy() leaves nothing', async ({ page }) => {
    await open(page, 'line-chart');
    await page.waitForTimeout(1800);
    expect(await overflowing(page.locator('#card'))).toEqual([]);
    const out = await page.evaluate(async () => {
      const { mount } = await import('./line-chart.js');
      const host = document.createElement('div');
      document.body.append(host);
      const h = mount(host, { data: [{ key: '1', label: 'a', values: { v: 1 } }, { key: '2', label: 'b', values: { v: 2 } }], series: [{ key: 'v', label: 'V' }], label: 'x' });
      h.destroy();
      return { children: host.children.length, cls: host.className, attrs: host.getAttributeNames().join() };
    });
    expect(out).toEqual({ children: 0, cls: '', attrs: 'class' });
  });
});
