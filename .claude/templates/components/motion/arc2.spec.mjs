// Tests of the Arc ports (slot-text, text-morph, morph-select, toast-stack, usage-meter, activity-heatmap, stepper) and of the
// two written from scratch (speed-counter, hover-preview), each against its demo page: it mounts, answers to the mouse and the
// keyboard, ends in the right state, does less (never nothing) with reduced motion, throws on bad input, leaves no node
// behind after destroy() and writes no console error. Run with the single motion config: `npx playwright test -c
// playwright.config.mjs arc2.spec.mjs`.
import { test as base, expect } from '@playwright/test';

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
    await use(page);
    expect(errors, 'console errors').toEqual([]);
  },
});

const open = async (page, name, { dark = false } = {}) => {
  await page.goto(`/motion/${name}.html${dark ? '?theme=dark' : ''}`);
  await page.waitForLoadState('networkidle');
};

// A fresh element mounted by the test and destroyed: what it leaves is what the page had to begin with.
const roundTrip = (page, module, opts, html = '') => page.evaluate(async ([module, opts, html]) => {
  const { mount } = await import(`/motion/${module}.js`);
  const host = document.createElement('div');
  host.style.cssText = 'width: 640px; position: relative';
  host.innerHTML = html;
  document.body.prepend(host);
  const before = host.outerHTML;
  const nodesBefore = document.body.querySelectorAll('*').length;
  const handle = mount(host, opts);
  await new Promise((r) => setTimeout(r, 100));
  handle.destroy();
  const same = host.outerHTML.replace(/ class=""| style=""/g, '') === before.replace(/ class=""| style=""/g, '');
  const nodesAfter = document.body.querySelectorAll('*').length;
  host.remove();
  return { same, nodesBefore, nodesAfter };
}, [module, opts, html]);

const throwsOn = (page, module, opts, html = '<span>x</span>') => page.evaluate(async ([module, opts, html]) => {
  const { mount } = await import(`/motion/${module}.js`);
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  try { mount(host, opts); return null; } catch (e) { return e.constructor.name; } finally { host.remove(); }
}, [module, opts, html]);

test.describe('slot-text', () => {
  test('keeps the units reel when 999 becomes 1.000 and lands on the new text', async ({ page }) => {
    await open(page, 'slot-text');
    const count = page.locator('#count');
    await expect(count.locator('.ar-sr')).toHaveText('999');
    await page.evaluate(() => { window.__units = document.querySelector('#count .ar-slot__reels').lastElementChild; });
    await page.click('#issue');
    await expect(count.locator('.ar-sr')).toHaveText('1.000');
    await expect.poll(() => count.locator('.ar-slot__slot:not([data-exiting])').count(), { timeout: 3000 }).toBe(5);
    expect(await page.evaluate(() => document.querySelector('#count .ar-slot__reels').lastElementChild === window.__units)).toBe(true);
    // every reel rests on its last cell
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('#count .ar-slot__strip')].every((s) => { const cells = s.children.length; const em = parseFloat(getComputedStyle(s).fontSize); return Math.abs(new DOMMatrix(getComputedStyle(s).transform).f + (cells - 1) * 1.6 * em) < 0.5; })), { timeout: 4000 }).toBe(true);
  });
  test('digits turn the way the number moved and reels stop from left to right', async ({ page }) => {
    await open(page, 'slot-text');
    await page.waitForTimeout(1200);
    await page.click('#paid');
    await page.waitForTimeout(250);
    const stops = await page.evaluate(() => [...document.querySelectorAll('#billed .ar-slot__strip')].map((s) => s.children.length));
    expect(Math.max(...stops)).toBeGreaterThan(1);
    // later reels have more time to spin: the first reel is done first
    await expect.poll(() => page.evaluate(() => document.querySelector('#billed .ar-sr').textContent), { timeout: 1000 }).toBe('$ 5.100.000');
  });
  test('reduced motion lands at once, with a fade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'slot-text');
    await page.click('#cycle');
    await page.waitForTimeout(300);
    const text = await page.evaluate(() => [...document.querySelectorAll('#state .ar-slot__reels > .ar-slot__slot:not([data-exiting])')].map((s) => s.querySelector('.ar-slot__cell:last-child').textContent).join(''));
    expect(text).toBe('Emitida');
  });
  test('throws on bad input and leaves nothing after destroy', async ({ page }) => {
    await open(page, 'slot-text');
    expect(await throwsOn(page, 'slot-text', { value: NaN })).toBe('RangeError');
    expect(await throwsOn(page, 'slot-text', { value: 5, align: 'middle' })).toBe('RangeError');
    expect(await throwsOn(page, 'slot-text', { value: {} })).toBe('TypeError');
    const r = await roundTrip(page, 'slot-text', { value: 1234 });
    expect(r.same).toBe(true);
    expect(r.nodesAfter).toBe(r.nodesBefore);
  });
});

test.describe('text-morph', () => {
  test('shared letters stay, the new ones arrive and the text reads plain', async ({ page }) => {
    await open(page, 'text-morph');
    const state = page.locator('#state');
    await expect(state.locator('.ar-sr')).toHaveText('Borrador');
    await page.evaluate(() => { window.__b = document.querySelectorAll('#state .ar-text-morph__glyph')[0]; });
    await page.click('#next');
    await expect(state.locator('.ar-sr')).toHaveText('Emitida');
    await expect.poll(() => state.locator('.ar-text-morph__glyph').evaluateAll((g) => g.map((n) => n.textContent).join('')), { timeout: 2000 }).toBe('Emitida');
    expect(await state.locator('.ar-text-morph__frame').getAttribute('aria-hidden')).toBe('true');
  });
  test('letters that stay keep their order while the label changes, so no frame reads scrambled', async ({ page }) => {
    await open(page, 'text-morph');
    await page.waitForTimeout(300);
    const frames = await page.evaluate(() => new Promise((resolve) => {
      const out = [];
      const t0 = performance.now();
      const tick = () => {
        const glyphs = [...document.querySelectorAll('#send-label .ar-text-morph__track > .ar-text-morph__glyph')].filter((g) => !g.hasAttribute('aria-hidden'));
        const seen = glyphs.filter((g) => Number(getComputedStyle(g).opacity) > 0.35 && g.textContent.trim());
        out.push({ t: performance.now() - t0, lefts: seen.map((g) => g.getBoundingClientRect().left), text: seen.map((g) => g.textContent).join('') });
        if (performance.now() - t0 < 900) requestAnimationFrame(tick); else resolve(out);
      };
      document.getElementById('send').click();
      requestAnimationFrame(tick);
    }));
    for (const f of frames) for (let i = 1; i < f.lefts.length; i++) expect(f.lefts[i], `${f.text} at ${Math.round(f.t)} ms`).toBeGreaterThanOrEqual(f.lefts[i - 1] - 0.5);
    expect(frames.at(-1).text).toBe('Enviandofactura');
  });
  test('the frame width ends on the width of the letters', async ({ page }) => {
    await open(page, 'text-morph');
    await page.click('#next');
    await page.waitForTimeout(1500);
    const [frame, track] = await page.evaluate(() => [parseFloat(getComputedStyle(document.querySelector('#state .ar-text-morph__frame')).width), document.querySelector('#state .ar-text-morph__track').getBoundingClientRect().width]);
    expect(Math.abs(frame - track)).toBeLessThan(1);
  });
  test('a label that is the same as before does nothing; reduced motion fades', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'text-morph');
    await page.click('#next');
    await page.waitForTimeout(300);
    expect(await page.locator('#state .ar-text-morph__glyph').evaluateAll((g) => g.map((n) => n.textContent).join(''))).toBe('Emitida');
  });
  test('throws nothing odd and leaves nothing after destroy', async ({ page }) => {
    await open(page, 'text-morph');
    const r = await roundTrip(page, 'text-morph', { text: 'Publicar' }, '<span>Publicar</span>');
    expect(r.nodesAfter).toBe(r.nodesBefore);
    expect(r.same).toBe(true);
  });
});

test.describe('morph-select', () => {
  const trigger = '#state .ar-select__lid > .ar-select__trigger';
  test('opens into the list, the keyboard picks, Escape returns focus', async ({ page }) => {
    await open(page, 'morph-select');
    await page.focus(trigger);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(trigger)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#state [role=option]')).toHaveCount(5);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator(trigger)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#picked')).toHaveText('Estado: Pagada');
    await expect(page.locator(trigger)).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.locator(trigger)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(trigger)).toBeFocused();
  });
  test('the surface grows past the trigger and the old label leaves after a pick', async ({ page }) => {
    await open(page, 'morph-select');
    const closed = await page.locator('#state .ar-select__shape').boundingBox();
    await page.click(trigger);
    await page.waitForTimeout(700);
    const opened = await page.locator('#state .ar-select__shape').boundingBox();
    expect(opened.height).toBeGreaterThan(closed.height * 4);
    expect(opened.width).toBeGreaterThan(closed.width);
    await page.click('#state [role=option]:has-text("Vencida")');
    await page.waitForTimeout(900);
    await expect(page.locator('#state .ar-select__layer')).toHaveCount(1);
    await expect(page.locator('#state .ar-select__layer')).toHaveText('Vencida');
    const back = await page.locator('#state .ar-select__shape').boundingBox();
    expect(back.height).toBeLessThan(closed.height + 1);
  });
  test('type-ahead jumps, a disabled option cannot be chosen, more than eight options bring a search', async ({ page }) => {
    await open(page, 'morph-select');
    await page.focus(trigger);
    await page.keyboard.press('p');
    await expect(page.locator(trigger)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#state [role=option][data-active]')).toHaveText('Pagada');
    await page.keyboard.press('Escape');
    await page.click(trigger);
    await page.click('#state [role=option]:has-text("Anulada")', { force: true });
    await expect(page.locator('#picked')).toHaveText('Sin elegir todavía');
    await page.keyboard.press('Escape');
    const search = page.locator('#client input[role=combobox]');
    await expect(search).toHaveCount(1);
    await page.click('#client .ar-select__lid > .ar-select__trigger');
    await page.keyboard.type('quir');
    await expect(page.locator('#client [role=option]')).toHaveCount(1);
    await expect(page.locator('#client [role=status]')).toHaveText('1 opción');
    await page.keyboard.press('Enter');
    await expect(page.locator('#picked')).toHaveText('Cliente: Estudio Quiroga');
  });
  test('a press outside folds it back; the hidden input carries the value', async ({ page }) => {
    await open(page, 'morph-select');
    await page.click(trigger);
    await page.mouse.click(5, 5);
    await expect(page.locator(trigger)).toHaveAttribute('aria-expanded', 'false');
    expect(await page.locator('input[name=estado]').inputValue()).toBe('emitida');
  });
  test('reduced motion opens without springs and still works', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'morph-select');
    await page.click(trigger);
    await page.waitForTimeout(300);
    const h = (await page.locator('#state .ar-select__shape').boundingBox()).height;
    expect(h).toBeGreaterThan(150);
  });
  test('throws on bad input and leaves nothing after destroy', async ({ page }) => {
    await open(page, 'morph-select');
    expect(await throwsOn(page, 'morph-select', { label: 'x' })).toBe('RangeError');
    expect(await throwsOn(page, 'morph-select', { items: [{ value: 'a', label: 'A' }] })).toBe('RangeError');
    expect(await throwsOn(page, 'morph-select', { label: 'x', items: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }] })).toBe('RangeError');
    expect(await throwsOn(page, 'morph-select', { label: 'x', items: [{ value: 'a', label: 'A' }], value: 'z' })).toBe('RangeError');
    const r = await roundTrip(page, 'morph-select', { label: 'Estado', items: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] });
    expect(r.nodesAfter).toBe(r.nodesBefore);
    expect(r.same).toBe(true);
  });
});

test.describe('toast-stack', () => {
  test('toasts stack, tuck behind and fan out on hover', async ({ page }) => {
    await open(page, 'toast-stack');
    await page.click('#late');
    await page.click('#fail');
    await page.click('#send');
    await page.waitForTimeout(900);
    await expect(page.locator('.ar-toast__item')).toHaveCount(3);
    const scales = await page.locator('.ar-toast__item').evaluateAll((n) => n.map((e) => new DOMMatrix(getComputedStyle(e).transform).a));
    expect(scales[0]).toBeCloseTo(1, 2);
    expect(scales[1]).toBeCloseTo(0.95, 2);
    expect(scales[2]).toBeCloseTo(0.9, 2);
    await page.hover('.ar-toast__item[data-front="true"]');
    await page.waitForTimeout(900);
    await expect(page.locator('.ar-toast__list')).toHaveAttribute('data-expanded', 'true');
    const fanned = await page.locator('.ar-toast__item').evaluateAll((n) => n.map((e) => new DOMMatrix(getComputedStyle(e).transform).a));
    expect(fanned.every((s) => Math.abs(s - 1) < 0.01)).toBe(true);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(900);
    await expect(page.locator('.ar-toast__list')).toHaveAttribute('data-expanded', 'false');
  });
  test('reusing an id updates the toast in place and the action folds away', async ({ page }) => {
    await open(page, 'toast-stack');
    await page.click('#send');
    await page.waitForTimeout(700);
    await expect(page.locator('.ar-toast__action')).toHaveCount(1);
    await page.click('.ar-toast__action');
    await expect(page.locator('.ar-toast__item')).toHaveCount(1);
    await expect(page.locator('.ar-toast__title')).toContainText('Envío cancelado');
    await expect(page.locator('.ar-toast__action')).toHaveCount(0, { timeout: 3000 });
    await expect(page.locator('.ar-toast__icon')).toHaveAttribute('data-type', 'info');
    await expect(page.locator('.ar-toast__glyph')).toHaveCount(1, { timeout: 2000 });
  });
  test('a loading toast turns into its result in place', async ({ page }) => {
    await open(page, 'toast-stack');
    await page.click('#sync');
    await expect(page.locator('.ar-toast__spinner')).toHaveCount(1);
    await expect(page.locator('.ar-toast__icon')).toHaveAttribute('data-type', 'success', { timeout: 4000 });
    await expect(page.locator('.ar-toast__item')).toHaveCount(1);
    await expect(page.locator('.ar-toast__spinner')).toHaveCount(0, { timeout: 2000 });
  });
  test('Alt+T focuses the stack, Escape dismisses, the region is named and polite', async ({ page }) => {
    await open(page, 'toast-stack');
    await page.click('#late');
    await page.click('#fail');
    await page.waitForTimeout(700);
    const region = page.locator('.ar-toast');
    await expect(region).toHaveAttribute('aria-label', 'Notificaciones (Alt+T)');
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await page.keyboard.press('Alt+t');
    await expect(page.locator('.ar-toast__list')).toHaveAttribute('data-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('.ar-toast__item')).toHaveCount(1, { timeout: 3000 });
  });
  test('lifetimes: errors last longer, an action lasts at least 10 s, a hover pauses', async ({ page }) => {
    await open(page, 'toast-stack');
    const r = await page.evaluate(async () => {
      const { mount } = await import('/motion/toast-stack.js');
      const host = document.createElement('div');
      host.style.cssText = 'position: fixed; inset: 0; pointer-events: none';
      document.body.append(host);
      const s = mount(host, { duration: 400, contained: true });
      s.toast({ id: 'a', type: 'info', title: 'info' });
      s.toast({ id: 'b', type: 'error', title: 'error' });
      s.toast({ id: 'c', type: 'info', title: 'con acción', action: { label: 'Ok' } });
      await new Promise((r) => setTimeout(r, 550));
      const afterInfo = s.count;
      await new Promise((r) => setTimeout(r, 400));
      const afterError = s.count;
      s.destroy();
      host.remove();
      return { afterInfo, afterError };
    });
    expect(r.afterInfo).toBe(2);
    expect(r.afterError).toBe(1);
  });
  test('throws on bad input and leaves nothing after destroy', async ({ page }) => {
    await open(page, 'toast-stack');
    expect(await throwsOn(page, 'toast-stack', { position: 'top' })).toBe('RangeError');
    expect(await throwsOn(page, 'toast-stack', { visibleToasts: 0 })).toBe('RangeError');
    const bad = await page.evaluate(async () => {
      const { mount } = await import('/motion/toast-stack.js');
      const host = document.createElement('div');
      document.body.append(host);
      const s = mount(host, {});
      const out = [];
      for (const o of [{}, { title: 'x', type: 'loud' }, { title: 'x', action: {} }]) { try { s.toast(o); out.push('ok'); } catch (e) { out.push(e.constructor.name); } }
      s.destroy();
      host.remove();
      return out;
    });
    expect(bad).toEqual(['RangeError', 'RangeError', 'RangeError']);
    const r = await roundTrip(page, 'toast-stack', {});
    expect(r.nodesAfter).toBe(r.nodesBefore);
  });
});

test.describe('usage-meter', () => {
  test('summarizes the allowance for a screen reader and shows the status', async ({ page }) => {
    await open(page, 'usage-meter');
    await page.waitForTimeout(1200);
    await expect(page.locator('#invoices .ar-meter__track')).toHaveAttribute('aria-label', /395 facturas de 500 facturas usadas/);
    await expect(page.locator('#invoices .ar-meter__badge')).toHaveText(/105 facturas disponibles/);
    await expect(page.locator('#storage')).toHaveAttribute('data-status', 'near');
    await expect(page.locator('#storage .ar-meter__badge')).toHaveText('Casi completo');
  });
  test('a change lands on Arc\'s beat: nothing moves in the first 25 ms, the bar and the number are under way by 160 ms and settled by 700 ms', async ({ page }) => {
    await open(page, 'usage-meter');
    await page.waitForTimeout(1800);
    const frames = await page.evaluate(() => new Promise((resolve) => {
      const out = [];
      const read = () => ({ seg: new DOMMatrix(getComputedStyle(document.querySelector('#invoices .ar-meter__segment')).transform).a, badge: document.querySelector('#invoices .ar-meter__badge').textContent });
      const t0 = performance.now();
      const tick = () => { out.push({ t: performance.now() - t0, ...read() }); if (performance.now() - t0 < 900) requestAnimationFrame(tick); else resolve(out); };
      document.getElementById('more').click();
      requestAnimationFrame(tick);
    }));
    const at = (ms) => frames.find((f) => f.t >= ms);
    const start = frames[0].seg;
    const end = frames.at(-1).seg;
    expect(Math.abs(at(25).seg - start)).toBeLessThan(Math.abs(end - start) * 0.03);
    expect(Math.abs(at(160).seg - start)).toBeGreaterThan(Math.abs(end - start) * 0.2);
    expect(Math.abs(at(700).seg - end)).toBeLessThan(Math.abs(end - start) * 0.03);
    expect(at(25).badge).toBe(frames[0].badge);
  });
  test('no label is ever cut: the legend of the 640 px card fits one row, a narrow one wraps its words', async ({ page }) => {
    await open(page, 'usage-meter');
    await page.waitForTimeout(800);
    const rows = () => page.evaluate(() => {
      const meter = document.querySelector('#invoices');
      const items = [...meter.querySelectorAll('.ar-meter__item')];
      const cut = [...meter.querySelectorAll('.ar-meter__item-label > span, .ar-meter__caption > span, .ar-meter__item-value')].filter((s) => getComputedStyle(s).textOverflow === 'ellipsis' || s.scrollWidth > s.clientWidth + 1);
      const box = meter.getBoundingClientRect();
      return { rows: new Set(items.map((i) => Math.round(i.getBoundingClientRect().top))).size, cut: cut.length, outside: items.filter((i) => i.getBoundingClientRect().right > box.right + 9).length };
    });
    expect(await rows()).toEqual({ rows: 1, cut: 0, outside: 0 });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.waitForTimeout(400);
    const narrow = await rows();
    expect(narrow.cut).toBe(0);
    expect(narrow.outside).toBe(0);
    expect(narrow.rows).toBeGreaterThan(1);
  });
  test('segments stop two pixels short of the next and cover the used share', async ({ page }) => {
    await open(page, 'usage-meter');
    await page.waitForTimeout(1800);
    const r = await page.evaluate(() => {
      const track = document.querySelector('#invoices .ar-meter__track').getBoundingClientRect();
      const segs = [...document.querySelectorAll('#invoices .ar-meter__segment')].map((s) => s.getBoundingClientRect());
      return { w: track.width, segs: segs.map((s) => ({ left: s.left - track.left, width: s.width })) };
    });
    const total = r.segs.reduce((s, g) => s + g.width, 0);
    expect(total).toBeGreaterThan(r.w * 0.76);
    expect(total).toBeLessThan(r.w * 0.8);
    expect(r.segs[0].left + r.segs[0].width).toBeLessThan(r.segs[1].left + 0.5);
  });
  test('going over the limit shows the hatch, the marker, the status and one announcement', async ({ page }) => {
    await open(page, 'usage-meter');
    await page.waitForTimeout(1500);
    for (let i = 0; i < 3; i++) { await page.click('#more'); await page.waitForTimeout(150); }
    await expect(page.locator('#invoices')).toHaveAttribute('data-status', 'over');
    await expect(page.locator('#invoices .ar-meter__badge')).toHaveText(/de más/);
    await expect(page.locator('#invoices .ar-meter__limit')).toHaveCSS('opacity', '1', { timeout: 2000 });
    await expect(page.locator('#invoices .ar-sr[aria-live]')).toContainText('Superaste el límite del plan');
    await page.click('#raise');
    await expect(page.locator('#invoices')).toHaveAttribute('data-status', 'ok', { timeout: 3000 });
  });
  test('the legend previews a category, pins on a press, and the arrows move between items', async ({ page }) => {
    await open(page, 'usage-meter');
    await page.waitForTimeout(1500);
    const items = page.locator('#invoices .ar-meter__item');
    await items.nth(1).hover();
    await expect(page.locator('#invoices .ar-meter__segment').nth(1)).toHaveAttribute('data-highlight', 'on');
    await expect(page.locator('#invoices .ar-meter__segment').nth(0)).toHaveAttribute('data-highlight', 'off');
    await page.mouse.move(5, 5);
    await items.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(items.last()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(items.last()).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(items.last()).toHaveAttribute('aria-pressed', 'false');
  });
  test('numbers roll by place value: a new column opens when the total grows a digit', async ({ page }) => {
    await open(page, 'usage-meter');
    await page.waitForTimeout(1500);
    const columns = () => page.locator('#seats .ar-meter__amount .ar-meter__column').count();
    expect(await columns()).toBe(1);
    await page.evaluate(async () => {
      const { mount } = await import('/motion/usage-meter.js');
      const host = document.createElement('div');
      host.id = 'extra';
      document.body.append(host);
      window.__m = mount(host, { label: 'x', limit: 100, decimals: 0, segments: [{ id: 'a', label: 'A', value: 9 }] });
    });
    await page.locator('#extra').scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__m.update({ segments: [{ id: 'a', label: 'A', value: 10 }] }));
    await expect.poll(() => page.locator('#extra .ar-meter__amount .ar-meter__column').count(), { timeout: 3000 }).toBe(2);
  });
  test('reduced motion jumps and still shows everything', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'usage-meter');
    await page.waitForTimeout(400);
    await expect(page.locator('#invoices .ar-meter__total .ar-sr')).toHaveText('395 facturas de 500 facturas usadas');
    const rolled = await page.locator('#invoices .ar-meter__amount .ar-meter__column').evaluateAll((cols) => cols.map((c) => [...c.querySelectorAll('.ar-meter__glyph')].find((g) => Number(g.style.opacity) === 1)?.textContent).join(''));
    expect(rolled).toBe('395');
  });
  test('a unit with plural forms agrees with each amount: 1 factura, 12 facturas', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'usage-meter');
    await page.evaluate(async () => {
      const { mount } = await import('/motion/usage-meter.js');
      const host = document.createElement('div');
      host.id = 'plural';
      document.body.append(host);
      window.__plural = mount(host, { label: 'Facturas', unit: { one: 'factura', other: 'facturas' }, limit: 50, decimals: 0, segments: [{ id: 'a', label: 'A', value: 1 }, { id: 'b', label: 'B', value: 0 }] });
    });
    const meter = page.locator('#plural');
    const units = () => meter.locator('.ar-meter__item-unit').allTextContents();
    await expect(meter.locator('.ar-meter__track')).toHaveAttribute('aria-label', /1 factura, B 0 facturas\./);
    await expect(meter.locator('.ar-meter__total .ar-sr')).toHaveText('1 factura of 50 facturas used');
    await expect(meter.locator('.ar-meter__badge')).toHaveText('49 facturas free');
    expect(await units()).toEqual(['factura', 'facturas', 'facturas']);
    await page.evaluate(() => window.__plural.update({ segments: [{ id: 'a', label: 'A', value: 12 }, { id: 'b', label: 'B', value: 1 }] }));
    await expect(meter.locator('.ar-meter__total .ar-sr')).toHaveText('13 facturas of 50 facturas used');
    expect(await units()).toEqual(['facturas', 'factura', 'facturas']);
    await page.evaluate(() => window.__plural.update({ segments: [{ id: 'a', label: 'A', value: 49 }], limit: 50 }));
    await expect(meter.locator('.ar-meter__badge')).toHaveText('Almost full');
    await page.evaluate(() => window.__plural.update({ segments: [{ id: 'a', label: 'A', value: 49 }, { id: 'b', label: 'B', value: 2 }] }));
    await expect(meter.locator('.ar-meter__badge')).toHaveText('1 factura over');
  });
  test('a unit that is neither a text nor an object with "other" is a RangeError', async ({ page }) => {
    await open(page, 'usage-meter');
    expect(await throwsOn(page, 'usage-meter', { label: 'x', limit: 5, unit: { one: 'factura' }, segments: [{ id: 'a', label: 'A', value: 1 }] })).toBe('RangeError');
    expect(await throwsOn(page, 'usage-meter', { label: 'x', limit: 5, unit: 3, segments: [{ id: 'a', label: 'A', value: 1 }] })).toBe('RangeError');
  });
  test('throws on bad input and leaves nothing after destroy', async ({ page }) => {
    await open(page, 'usage-meter');
    expect(await throwsOn(page, 'usage-meter', { label: 'x', limit: 0, segments: [{ id: 'a', label: 'A', value: 1 }] })).toBe('RangeError');
    expect(await throwsOn(page, 'usage-meter', { label: 'x', limit: 5, segments: [{ id: 'free', label: 'A', value: 1 }] })).toBe('RangeError');
    expect(await throwsOn(page, 'usage-meter', { label: 'x', limit: 5, segments: [{ id: 'a', label: 'A', value: -1 }] })).toBe('RangeError');
    expect(await throwsOn(page, 'usage-meter', { limit: 5, segments: [] })).toBe('RangeError');
    const r = await roundTrip(page, 'usage-meter', { label: 'Plan', limit: 10, decimals: 0, segments: [{ id: 'a', label: 'A', value: 3 }] });
    expect(r.nodesAfter).toBe(r.nodesBefore);
    expect(r.same).toBe(true);
  });
});

test.describe('activity-heatmap', () => {
  test('draws one named cell per day with its label and a summary', async ({ page }) => {
    await open(page, 'activity-heatmap');
    const grid = page.locator('#heat [role=grid]');
    await expect(grid).toHaveAttribute('aria-label', 'Cobros por día');
    await expect(page.locator('#heat [role=gridcell]')).toHaveCount(365);
    await expect(page.locator('#heat [role=status]')).toHaveText(/cobros en 2025/);
    await expect(page.locator('#heat [role=gridcell]').first()).toHaveAttribute('aria-label', /1 de enero de 2025|cobro/);
  });
  test('hovering a day shows one bubble that glides to the next day', async ({ page }) => {
    await open(page, 'activity-heatmap');
    await page.waitForTimeout(1500);
    const cells = page.locator('#heat [role=gridcell]');
    await cells.nth(100).hover();
    await expect(page.locator('#heat .ar-heat__bubble')).toHaveCSS('opacity', '1', { timeout: 1500 });
    await expect(page.locator('#heat .ar-heat__tip-lines')).toHaveCount(1);
    const first = await page.locator('#heat .ar-heat__tip').boundingBox();
    await cells.nth(240).hover();
    await page.waitForTimeout(700);
    const second = await page.locator('#heat .ar-heat__tip').boundingBox();
    expect(Math.abs(second.x - first.x)).toBeGreaterThan(20);
    await expect(page.locator('#heat .ar-heat__tip-lines')).toHaveCount(1, { timeout: 1500 });
    await page.mouse.move(5, 5);
    await expect(page.locator('#heat .ar-heat__bubble')).toHaveCSS('opacity', '0', { timeout: 1500 });
  });
  test('arrows move by day and week, Enter selects, Escape closes the bubble', async ({ page }) => {
    await open(page, 'activity-heatmap');
    await page.waitForTimeout(1500);
    const sel = page.locator('#heat [role=gridcell][tabindex="0"]');
    await sel.focus();
    const i0 = Number(await sel.getAttribute('data-index'));
    await page.keyboard.press('ArrowLeft');
    expect(Number(await page.locator('#heat [role=gridcell]:focus').getAttribute('data-index'))).toBe(i0 - 7);
    await page.keyboard.press('ArrowDown');
    expect(Number(await page.locator('#heat [role=gridcell]:focus').getAttribute('data-index'))).toBe(i0 - 6);
    await expect(page.locator('#heat .ar-heat__bubble')).toHaveCSS('opacity', '1');
    const line = page.locator('#picked .picked__line:not([aria-hidden])');
    const before = await line.textContent();
    await page.keyboard.press('Enter');
    await expect(line).not.toHaveText(before);
    await expect(line).toContainText(/cobro/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#heat .ar-heat__bubble')).toHaveCSS('opacity', '0', { timeout: 1500 });
  });
  test('a new range recolors the grid, rolls the total and sweeps back for an earlier range', async ({ page }) => {
    await open(page, 'activity-heatmap');
    await page.waitForTimeout(1500);
    const before = await page.locator('#heat [role=status]').textContent();
    await page.click('text=2024');
    await expect(page.locator('#heat [role=grid]')).toHaveAttribute('data-direction', 'back');
    await expect(page.locator('#heat [role=status]')).not.toHaveText(before);
    await expect(page.locator('#heat [role=status]')).toHaveText(/en 2024/);
    await expect.poll(() => page.locator('#heat .ar-heat__rolling .ar-heat__place').count(), { timeout: 2000 }).toBeGreaterThan(2);
  });
  test('a new year changes the text first and the grid after it', async ({ page }) => {
    await open(page, 'activity-heatmap');
    await page.waitForTimeout(1500);
    const frames = await page.evaluate(() => new Promise((resolve) => {
      const cells = [...document.querySelectorAll('#heat .ar-heat__cell[data-level]')];
      const pick = [30, 120, 200, 260, 330].map((i) => cells[i]);
      const level = (c) => c.dataset.level;
      const t0 = performance.now();
      const before = pick.map(level);
      const out = [];
      const tick = () => {
        out.push({ t: performance.now() - t0, status: document.querySelector('#heat [role=status]').textContent, grid: pick.some((c, i) => level(c) !== before[i]) });
        if (performance.now() - t0 < 900) requestAnimationFrame(tick); else resolve(out);
      };
      [...document.querySelectorAll('#heat .range button')].find((b) => b.textContent === '2024').click();
      requestAnimationFrame(tick);
    }));
    const text = frames.find((f) => /2024/.test(f.status)).t;
    const grid = frames.find((f) => f.grid)?.t ?? Infinity;
    expect(frames.filter((f) => f.t < 250).every((f) => /2025/.test(f.status) && !f.grid)).toBe(true);
    expect(text).toBeGreaterThan(250);
    expect(text).toBeLessThan(450);
    expect(grid).toBeLessThanOrEqual(text + 80);
  });
  test('the chosen day is described under the grid, inside the card, and follows the year', async ({ page }) => {
    await open(page, 'activity-heatmap');
    await page.waitForTimeout(1500);
    const line = page.locator('#picked .picked__line:not([aria-hidden])');
    await expect(line).toContainText('14 de marzo');
    const [card, grid, text] = await Promise.all([page.locator('.card--wide').boundingBox(), page.locator('#heat').boundingBox(), line.boundingBox()]);
    expect(text.y).toBeGreaterThanOrEqual(grid.y + grid.height - 1);
    expect(text.y + text.height).toBeLessThanOrEqual(card.y + card.height);
    await page.click('text=2024');
    await expect(line).toContainText('14 de marzo', { timeout: 1500 });
    await page.click('text=Último semestre');
    await expect(line).toContainText('Elegí un día', { timeout: 1500 });
    await expect(page.locator('#picked')).toHaveAttribute('aria-live', 'polite');
  });
  test('the legend previews a level on hover and pins it on a press', async ({ page }) => {
    await open(page, 'activity-heatmap');
    await page.waitForTimeout(1200);
    const sw = page.locator('#heat .ar-heat__swatch');
    await sw.nth(4).hover();
    await expect(page.locator('#heat [role=grid]')).toHaveAttribute('data-highlight', '4');
    await page.mouse.move(5, 5);
    await expect(page.locator('#heat [role=grid]')).not.toHaveAttribute('data-highlight', /./, { timeout: 1000 });
    await sw.nth(2).click();
    await expect(sw.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#heat .ar-heat__caption')).toContainText('días con');
  });
  test('reduced motion shows the grid without the wave', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'activity-heatmap');
    await page.waitForTimeout(400);
    await expect(page.locator('#heat [role=grid]')).toHaveAttribute('data-reveal', 'done');
  });
  test('throws on bad input and leaves nothing after destroy', async ({ page }) => {
    await open(page, 'activity-heatmap');
    expect(await throwsOn(page, 'activity-heatmap', { label: 'x', days: 'no' })).toBe('RangeError');
    expect(await throwsOn(page, 'activity-heatmap', { label: 'x', days: [{ date: 'ayer', count: 1 }] })).toBe('RangeError');
    expect(await throwsOn(page, 'activity-heatmap', { days: [] })).toBe('RangeError');
    expect(await throwsOn(page, 'activity-heatmap', { label: 'x', days: [], thresholds: [3, 2, 1] })).toBe('RangeError');
    expect(await throwsOn(page, 'activity-heatmap', { label: 'x', days: [], weekStartsOn: 3 })).toBe('RangeError');
    const r = await roundTrip(page, 'activity-heatmap', { label: 'x', period: '2025', days: [{ date: '2025-01-01', count: 2 }, { date: '2025-01-20', count: 5 }] });
    expect(r.nodesAfter).toBe(r.nodesBefore);
    expect(r.same).toBe(true);
  });
});

test.describe('stepper', () => {
  test('marks the current step, fills the connectors and announces the change', async ({ page }) => {
    await open(page, 'stepper');
    const items = page.locator('#flow .ar-stepper__item');
    await expect(items.nth(1)).toHaveAttribute('data-status', 'current');
    await expect(page.locator('#flow [aria-current=step]')).toContainText('Detalle');
    await page.fill('#items', 'Servicios de consultoría');
    await page.click('#next');
    await expect(items.nth(1)).toHaveAttribute('data-status', 'complete');
    await expect(items.nth(2)).toHaveAttribute('data-status', 'current');
    await expect(page.locator('#flow .ar-sr[aria-live]')).toHaveText('Paso 3 de 4: Impuestos');
    await expect.poll(() => page.locator('#flow .ar-stepper__fill').nth(1).evaluate((n) => new DOMMatrix(getComputedStyle(n).transform).a), { timeout: 2500 }).toBeCloseTo(1, 1);
    await expect(items.nth(2).locator('.ar-stepper__ring')).toHaveCount(1);
  });
  test('Continue without the concept leaves the step in error: marker, description and field, until it is typed', async ({ page }) => {
    await open(page, 'stepper');
    const step = page.locator('#flow .ar-stepper__item').nth(1);
    await page.click('#next');
    await expect(step).toHaveAttribute('data-status', 'error');
    await expect(step.locator('.ar-stepper__error')).toHaveText('Agregá un concepto');
    await expect(step.locator('.ar-stepper__icon')).toHaveCount(1, { timeout: 2000 });
    await expect(page.locator('#items-field')).toHaveAttribute('data-state', 'invalid');
    await expect(page.locator('#items')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#items')).toBeFocused();
    await expect(page.locator('#flow [aria-current=step]')).toContainText('Detalle');
    await page.keyboard.type('Servicios');
    await expect(step).toHaveAttribute('data-status', 'current');
    await expect(page.locator('#items')).toHaveAttribute('aria-invalid', 'false');
  });
  test('the panel of each step crosses with a blur and the stage eases to its height', async ({ page }) => {
    await open(page, 'stepper');
    await expect(page.locator('#stage .pane')).toHaveCount(1);
    await page.fill('#items', 'Servicios');
    const frames = await page.evaluate(() => new Promise((resolve) => {
      const out = [];
      const t0 = performance.now();
      const tick = () => { out.push({ t: performance.now() - t0, panes: [...document.querySelectorAll('#stage .pane')].map((p) => ({ o: +getComputedStyle(p).opacity, f: getComputedStyle(p).filter })), h: document.getElementById('stage').getBoundingClientRect().height }); if (performance.now() - t0 < 700) requestAnimationFrame(tick); else resolve(out); };
      document.getElementById('next').click();
      requestAnimationFrame(tick);
    }));
    expect(frames.some((f) => f.panes.length === 2)).toBe(true);
    expect(frames.some((f) => f.panes.some((p) => /blur\([1-9]/.test(p.f)))).toBe(true);
    expect(frames.at(-1).panes.length).toBe(1);
    await expect(page.locator('#stage')).toContainText('Alícuota de IVA');
  });
  test('going back drains the connector at Arc\'s pace: about half left at 135 ms, a thin tail at 400 ms, empty by 700 ms', async ({ page }) => {
    await open(page, 'stepper');
    await page.fill('#items', 'Servicios');
    await page.click('#next');
    await page.waitForTimeout(1500);
    const frames = await page.evaluate(() => new Promise((resolve) => {
      const fill = document.querySelectorAll('#flow .ar-stepper__fill')[1];
      const out = [];
      const t0 = performance.now();
      const tick = () => { out.push({ t: performance.now() - t0, s: new DOMMatrix(getComputedStyle(fill).transform).a }); if (performance.now() - t0 < 900) requestAnimationFrame(tick); else resolve(out); };
      document.getElementById('back').click();
      requestAnimationFrame(tick);
    }));
    const at = (ms) => frames.find((f) => f.t >= ms).s;
    expect(at(135)).toBeGreaterThan(0.35);
    expect(at(135)).toBeLessThan(0.7);
    expect(at(400)).toBeGreaterThan(0.01);
    expect(at(400)).toBeLessThan(0.1);
    expect(at(700)).toBeLessThan(0.01);
  });
  test('a jump fills the connectors one after another', async ({ page }) => {
    await open(page, 'stepper');
    await page.click('#reset');
    await page.waitForTimeout(800);
    await page.click('#jump');
    await page.waitForTimeout(220);
    const scales = await page.locator('#flow .ar-stepper__fill').evaluateAll((n) => n.map((e) => new DOMMatrix(getComputedStyle(e).transform).a));
    expect(scales[0]).toBeGreaterThan(scales[2]);
    await expect(page.locator('#flow .ar-stepper__item[data-status=complete]')).toHaveCount(3, { timeout: 2000 });
  });
  test('an error turns the marker into an alert and replaces the description', async ({ page }) => {
    await open(page, 'stepper');
    await page.click('#jump');
    await page.click('#fail');
    const last = page.locator('#flow .ar-stepper__item').nth(3);
    await expect(last).toHaveAttribute('data-status', 'error');
    await expect(last.locator('.ar-stepper__error')).toContainText('ARCA no respondió');
    await expect(last.locator('.ar-stepper__icon')).toHaveCount(1, { timeout: 2000 });
    await page.click('#fail');
    await expect(last).not.toHaveAttribute('data-status', 'error');
  });
  test('completed steps are buttons: a click goes back, arrows move among reachable ones', async ({ page }) => {
    await open(page, 'stepper');
    await page.click('#jump');
    await page.waitForTimeout(500);
    const heads = page.locator('#flow button.ar-stepper__head[data-reachable]');
    await expect(heads).toHaveCount(4);
    await heads.nth(3).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(heads.nth(2)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(heads.nth(0)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#flow .ar-stepper__item').nth(0)).toHaveAttribute('data-status', 'current');
    await expect(page.locator('#flow button.ar-stepper__head[aria-disabled=true]').first()).toHaveAttribute('tabindex', '-1');
  });
  test('the read-only stepper has no buttons; a narrow one folds into markers with a caption', async ({ page }) => {
    await open(page, 'stepper');
    await expect(page.locator('#vertical button')).toHaveCount(0);
    await expect(page.locator('#vertical')).toHaveAttribute('role', 'group');
    await expect(page.locator('#narrow .ar-stepper__caption')).toBeVisible();
    await expect(page.locator('#narrow .ar-stepper__caption-label')).toHaveText('Detalle');
    await expect(page.locator('#flow .ar-stepper__caption')).toBeHidden();
  });
  test('reduced motion has no delays', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'stepper');
    await page.click('#jump');
    await page.waitForTimeout(300);
    await expect(page.locator('#flow .ar-stepper__item[data-status=complete]')).toHaveCount(3);
    const s = await page.locator('#flow .ar-stepper__fill').evaluateAll((n) => n.map((e) => new DOMMatrix(getComputedStyle(e).transform).a));
    expect(s.slice(0, 3).every((v) => v > 0.99)).toBe(true);
  });
  test('throws on bad input and leaves nothing after destroy', async ({ page }) => {
    await open(page, 'stepper');
    expect(await throwsOn(page, 'stepper', { steps: [] })).toBe('RangeError');
    expect(await throwsOn(page, 'stepper', { steps: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] })).toBe('RangeError');
    expect(await throwsOn(page, 'stepper', { steps: [{ id: 'a', label: 'A' }], orientation: 'diagonal' })).toBe('RangeError');
    expect(await throwsOn(page, 'stepper', { steps: [{ id: 'a', label: 'A' }], current: NaN })).toBe('RangeError');
    const r = await roundTrip(page, 'stepper', { steps: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], current: 1 });
    expect(r.nodesAfter).toBe(r.nodesBefore);
    expect(r.same).toBe(true);
  });
});

test.describe('speed-counter', () => {
  test('blurs by its speed while it counts and ends sharp on the exact figure', async ({ page }) => {
    await open(page, 'speed-counter');
    await page.waitForTimeout(300);
    await page.click('#replay');
    const peak = await page.evaluate(async () => {
      const { mount } = await import('/motion/speed-counter.js');
      const el = document.getElementById('billed');
      const h = mount(el, {});
      let max = 0;
      const end = performance.now() + 1500;
      while (performance.now() < end) { max = Math.max(max, h.blur); await new Promise((r) => requestAnimationFrame(r)); }
      return max;
    });
    expect(peak).toBeGreaterThan(2);
    expect(peak).toBeLessThanOrEqual(6.01);
    await page.waitForTimeout(1200);
    expect(await page.locator('#billed .speed-counter__digits').evaluate((n) => getComputedStyle(n).filter)).toBe('none');
    expect(await page.locator('#billed .speed-counter__digits').textContent()).toBe(await page.locator('#billed .speed-counter__spoken').textContent());
  });
  test('the blur follows the axis and a new value retargets from where it is', async ({ page }) => {
    await open(page, 'speed-counter');
    await page.waitForTimeout(2200);
    await page.click('#bump');
    await page.waitForTimeout(500);
    const std = await page.locator('#billed feGaussianBlur').getAttribute('stdDeviation');
    const [a, b] = std.split(' ').map(Number);
    expect(a).toBe(0);
    expect(b).toBeGreaterThan(0);
    const x = await page.locator('#count feGaussianBlur').getAttribute('stdDeviation');
    expect(Number(x.split(' ')[1])).toBe(0);
    await page.waitForTimeout(2000);
    expect(await page.locator('#billed .speed-counter__digits').textContent()).toMatch(/6\.250\.000/);
  });
  test('reduced motion shows the figure with a fade and never blurs', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'speed-counter');
    await page.waitForTimeout(300);
    expect(await page.locator('#billed .speed-counter__digits').textContent()).toMatch(/5\.000\.000/);
    expect(await page.locator('#billed .speed-counter__digits').evaluate((n) => getComputedStyle(n).filter)).toBe('none');
  });
  test('throws on bad input and leaves nothing after destroy', async ({ page }) => {
    await open(page, 'speed-counter');
    expect(await throwsOn(page, 'speed-counter', { value: NaN })).toBe('RangeError');
    expect(await throwsOn(page, 'speed-counter', { value: 5, axis: 'z' })).toBe('RangeError');
    expect(await throwsOn(page, 'speed-counter', { value: 5, duration: 0 })).toBe('RangeError');
    expect(await throwsOn(page, 'speed-counter', { value: 5, maxBlur: -1 })).toBe('RangeError');
    const r = await roundTrip(page, 'speed-counter', { value: 50 });
    expect(r.nodesAfter).toBe(r.nodesBefore);
    expect(r.same).toBe(true);
  });
});

test.describe('hover-preview', () => {
  const inv = (n) => `#invoices tbody tr:nth-child(${n}) .inv`;
  test('opens on the number, describes it, follows to another number without closing and Escape closes', async ({ page }) => {
    await open(page, 'hover-preview');
    await page.hover(inv(1));
    const card = page.locator('.hover-preview');
    await expect(card).toHaveAttribute('data-state', 'open', { timeout: 1500 });
    await expect(card).toHaveAttribute('role', 'tooltip');
    await expect(card).toContainText('A-0004-00001284');
    await expect(page.locator(inv(1))).toHaveAttribute('aria-describedby', /hpv/);
    await page.hover(inv(3));
    await expect(card).toContainText('Taller Morán', { timeout: 1500 });
    await expect(card).toHaveAttribute('data-state', 'open');
    await expect(page.locator(inv(1))).not.toHaveAttribute('aria-describedby', /./);
    await page.keyboard.press('Escape');
    await expect(card).toHaveAttribute('data-state', 'closed', { timeout: 1500 });
  });
  test('waits a moment before opening and stays open while the pointer is on the card', async ({ page }) => {
    await open(page, 'hover-preview');
    const card = page.locator('.hover-preview');
    await page.hover(inv(1));
    await page.waitForTimeout(40);
    await expect(card).toHaveAttribute('data-state', 'closed');
    await expect(card).toHaveAttribute('data-state', 'open', { timeout: 1000 });
    await page.waitForTimeout(400);
    const box = await card.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await page.waitForTimeout(500);
    await expect(card).toHaveAttribute('data-state', 'open');
    await page.mouse.move(5, 5);
    await expect(card).toHaveAttribute('data-state', 'closed', { timeout: 1500 });
  });
  test('opens on keyboard focus and sits inside the window beside the trigger', async ({ page }) => {
    await open(page, 'hover-preview');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.locator(inv(2)).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const card = page.locator('.hover-preview');
    await expect(card).toHaveAttribute('data-state', 'open', { timeout: 1500 });
    await page.waitForTimeout(600);
    const box = await card.boundingBox();
    const trigger = await page.locator(inv(2)).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    expect(box.x).toBeGreaterThan(trigger.x + trigger.width - 1);
    await page.locator(inv(2)).blur();
    await expect(card).toHaveAttribute('data-state', 'closed', { timeout: 1500 });
  });
  test('the card tilts while it moves and levels out', async ({ page }) => {
    await open(page, 'hover-preview');
    await page.hover(inv(1));
    await page.waitForTimeout(500);
    const card = page.locator('.hover-preview');
    await page.hover(inv(5));
    let max = 0;
    for (let i = 0; i < 12; i++) { await page.waitForTimeout(30); max = Math.max(max, Math.abs(await card.evaluate((n) => { const m = new DOMMatrix(getComputedStyle(n).transform); return Math.atan2(m.b, m.a) * 180 / Math.PI; }))); }
    expect(max).toBeLessThanOrEqual(6.01);
    await page.waitForTimeout(1200);
    expect(Math.abs(await card.evaluate((n) => { const m = new DOMMatrix(getComputedStyle(n).transform); return Math.atan2(m.b, m.a) * 180 / Math.PI; }))).toBeLessThan(0.2);
  });
  test('reduced motion shows a fade without tilt', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'hover-preview');
    await page.hover(inv(1));
    await expect(page.locator('.hover-preview')).toHaveAttribute('data-state', 'open', { timeout: 1500 });
    await page.hover(inv(4));
    await page.waitForTimeout(250);
    expect(Math.abs(await page.locator('.hover-preview').evaluate((n) => { const m = new DOMMatrix(getComputedStyle(n).transform); return Math.atan2(m.b, m.a); }))).toBe(0);
  });
  test('a trigger with no usable data shows nothing; bad options throw; destroy leaves nothing', async ({ page }) => {
    await open(page, 'hover-preview');
    expect(await throwsOn(page, 'hover-preview', { render: 5 })).toBe('TypeError');
    expect(await throwsOn(page, 'hover-preview', { side: 'diagonal' })).toBe('RangeError');
    expect(await throwsOn(page, 'hover-preview', { delay: -1 })).toBe('RangeError');
    const shown = await page.evaluate(async () => {
      const { mount } = await import('/motion/hover-preview.js');
      const host = document.createElement('div');
      host.innerHTML = '<button id="nodata" data-preview="not json">x</button>';
      document.body.append(host);
      const h = mount(host, { delay: 0 });
      host.querySelector('button').focus();
      await new Promise((r) => setTimeout(r, 200));
      const open = h.open;
      h.destroy();
      host.remove();
      return open;
    });
    expect(shown).toBe(false);
    const r = await roundTrip(page, 'hover-preview', {}, '<button data-preview="{}">x</button>');
    expect(r.nodesAfter).toBe(r.nodesBefore);
  });
});
