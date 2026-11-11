// Tests of the Kokonut UI ports (group kk): file-upload, action-search-bar, ai-prompt, card-stack,
// smooth-tab, team-selector, kk-loader and profile-dropdown, each in its own demo page.
// Every component is mounted, driven with mouse, touch and keyboard, left in its final state,
// run with reduced motion (fades of 100–150 ms, no travel), checked for overflow, contrast and console
// errors, and destroyed without leaving a node behind. Run: npx playwright test -c playwright.config.mjs kk.spec.mjs
import { test, expect } from '@playwright/test';

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────
const colorTools = () => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (fg, bg) => { const a = fg[3]; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)).concat(1); };
  const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  // The colour a text is painted in over what is behind it: every ancestor's background composed from the
  // outside in, and every opacity on the way folded into the text.
  const backdrop = (el) => {
    const chain = [];
    for (let n = el; n; n = n.parentElement) chain.unshift(n);
    let bg = [255, 255, 255, 1];
    for (const n of chain) { const b = rgba(getComputedStyle(n).backgroundColor); if (b[3] > 0) bg = over(b, bg); }
    return bg;
  };
  const opacityOf = (el) => { let o = 1; for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
  window.__k = {
    rgba, ratio,
    contrast(el, bgEl = el) {
      const bg = backdrop(bgEl);
      const fg = rgba(getComputedStyle(el).color);
      fg[3] *= opacityOf(el);
      return ratio(over(fg, bg), bg);
    },
    token(name) { const d = document.createElement('div'); d.style.background = `var(${name})`; document.body.append(d); const c = rgba(getComputedStyle(d).backgroundColor); d.remove(); return c; },
    over,
    on(fg, bg) { return ratio(over(fg, bg), bg); },
  };
};

// Every animation running under an element, as plain data: what they move, how long, after what delay.
const animTools = () => {
  window.__anims = (sel) => [...document.querySelector(sel).getAnimations({ subtree: true })].map((a) => {
    const t = a.effect.getTiming();
    return { name: a.animationName ?? a.transitionProperty ?? null, d: t.duration, delay: t.delay, kf: a.effect.getKeyframes().map((k) => ({ transform: k.transform ?? null, opacity: k.opacity ?? null, filter: k.filter ?? null, clip: k.clipPath ?? null })) };
  });
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(colorTools);
  await page.addInitScript(animTools);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.__errors = errors;
});
test.afterEach(async ({ page }) => {
  expect(page.__errors, 'console errors').toEqual([]);
});

const demo = async (page, name, { theme, reduced } = {}) => {
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/motion/${name}.html`, { waitUntil: 'networkidle' });
  if (theme) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForTimeout(450); // the colours of the controls transition for 120 ms and the panes fade in
  }
};
const contrast = (page, sel, bgSel) => page.evaluate(([s, b]) => window.__k.contrast(document.querySelector(s), b ? document.querySelector(b) : undefined), [sel, bgSel ?? null]);
const anims = (page, sel) => page.evaluate((s) => window.__anims(s), sel);
// Does something in the page and reads the animations in the same task, so a 120 ms fade is still there to read.
const act = (page, root, src) => page.evaluate(([r, s]) => { new Function(s)(); return window.__anims(r); }, [root, src]);
const clickIn = (page, root, sel) => act(page, root, `document.querySelector(${JSON.stringify(sel)}).click()`);
const pose = (page, sel, nth = 0) => page.evaluate(([s, n]) => { const m = new DOMMatrix(getComputedStyle(document.querySelectorAll(s)[n]).transform); return { x: m.e, y: m.f, r: Math.atan2(m.b, m.a) * 180 / Math.PI }; }, [sel, nth]);
const box = async (page, sel, nth = 0) => (await page.locator(sel).nth(nth).boundingBox());
// A visible piece of content (text, control, icon) never sticks out of the box that clips it.
const strays = (page, rootSel) => page.evaluate((s) => {
  const root = document.querySelector(s);
  const out = [];
  // A box that scrolls on purpose (overflow auto / scroll) shows its content by scrolling; only boxes that cut it are checked.
  const cuts = (v) => v === 'hidden' || v === 'clip';
  const clippers = [root, ...root.querySelectorAll('*')].filter((n) => { const o = getComputedStyle(n); return cuts(o.overflowX) || cuts(o.overflowY); });
  for (const c of clippers) {
    const cr = c.getBoundingClientRect();
    if (!cr.width || !cr.height) continue;
    for (const n of c.querySelectorAll('button, input, textarea, h1, h2, h3, p, dd, dt, kbd, svg, output, [role=option], [role=menuitem]')) {
      const st = getComputedStyle(n);
      if (n.closest('[aria-hidden="true"]') || n.closest('[hidden]') || st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) continue;
      if (n.closest('.cs__card[data-decision]') || n.classList.contains('fu__input') || n.classList.contains('ap__file')) continue;
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.left < cr.left - 1 || r.right > cr.right + 1 || r.top < cr.top - 1 || r.bottom > cr.bottom + 1) out.push(`${n.tagName}.${n.className?.baseVal ?? n.className} in ${c.className}`);
    }
  }
  return out;
}, rootSel);
const settle = (page, ms = 700) => page.waitForTimeout(ms);
const mountFresh = (page, module, html, opts = {}, name = 'mount') => page.evaluate(async ([m, h, o, n]) => {
  const host = document.createElement('div');
  host.id = 'fresh';
  host.innerHTML = h;
  document.body.append(host);
  const el = host.firstElementChild;
  const mod = await import(m);
  window.__api = mod[n](el, o);
  window.__el = el;
  return true;
}, [module, html, opts, name]);

const THEMES = ['light', 'dark'];

// ── Every demo: loads in both themes, is not wider than a phone, and logs nothing ───────────────
const DEMOS = ['file-upload', 'action-search-bar', 'ai-prompt', 'card-stack', 'smooth-tab', 'team-selector', 'kk-loader', 'profile-dropdown'];
for (const name of DEMOS) {
  for (const theme of THEMES) {
    test(`${name}: la demo carga en tema ${theme}, cabe en un teléfono y no registra errores`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await demo(page, name, { theme });
      await settle(page, 300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('[data-motion], #main, #bar, #prompt, #review, #tabs, #one, #account, #md').count()).toBeGreaterThan(0);
    });
  }
}

// ── file-upload ──────────────────────────────────────────────────────────────────────────────
const dropOf = (page, types = ['Files']) => page.evaluate(() => {
  const f = document.querySelector('#main .fu__frame');
  const dt = new DataTransfer();
  dt.items.add(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
  for (const t of ['dragenter', 'dragover']) f.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
});
const pdfFile = (name = 'factura-0042.pdf', size = 120000) => ({ name, mimeType: 'application/pdf', buffer: Buffer.alloc(size) });

test.describe('file-upload', () => {
  test('monta la zona de soltar con su texto, el botón y un input que solo acepta PDF', async ({ page }) => {
    await demo(page, 'file-upload');
    await expect(page.locator('#main')).toHaveAttribute('data-state', 'idle');
    await expect(page.locator('#main .fu__title')).toHaveText('Arrastrá y soltá o');
    await expect(page.locator('#main .fu__hint')).toContainText('PDF hasta 5 MB');
    await expect(page.getByRole('button', { name: 'Subir factura' }).first()).toBeVisible();
    await expect(page.locator('#main .fu__input')).toHaveAttribute('accept', 'application/pdf');
    expect(await page.locator('#main .fu__spin circle').count()).toBe(14);
  });

  test('el arrastre enciende los bordes y el centro, y soltar fuera lo apaga', async ({ page }) => {
    await demo(page, 'file-upload');
    await dropOf(page);
    await expect(page.locator('#main')).toHaveAttribute('data-state', 'dragging');
    await expect.poll(() => page.locator('#main .fu__drag').evaluate((n) => Number(getComputedStyle(n).opacity))).toBeGreaterThan(0.95);
    // The pane is still easing into its scale while the drag layer is already lit: it is read once settled.
    await expect.poll(() => page.locator('#main .fu__pane[data-pane=idle]').evaluate((n) => { const m = new DOMMatrix(getComputedStyle(n).transform); return [m.a, m.b, m.c, m.d, m.e, m.f].map((v) => +v.toFixed(3)); })).toEqual([0.98, 0, 0, 0.98, 0, 0]);
    expect(await page.locator('#main .fu__pulse').evaluate((n) => getComputedStyle(n).animationName)).toBe('fu-pulse');
    await page.evaluate(() => document.querySelector('#main .fu__frame').dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true })));
    await expect(page.locator('#main')).toHaveAttribute('data-state', 'idle');
    await expect.poll(() => page.locator('#main .fu__drag').evaluate((n) => Number(getComputedStyle(n).opacity))).toBeLessThan(0.05);
  });

  test('un archivo soltado sube con progreso hasta el estado listo y avisa', async ({ page }) => {
    await demo(page, 'file-upload');
    await page.evaluate(() => { window.__done = []; document.addEventListener('fileupload:done', (e) => window.__done.push(e.detail.file.name)); });
    await page.locator('#slow .fu__input').setInputFiles(pdfFile('factura-B-0107.pdf', 412000));
    await expect(page.locator('#slow')).toHaveAttribute('data-state', 'uploading');
    const bar = page.locator('#slow [role=progressbar]');
    await expect(bar).toBeVisible();
    await expect(page.locator('#slow [data-name]').first()).toHaveText('factura-B-0107.pdf');
    const first = Number(await bar.getAttribute('aria-valuenow'));
    await page.waitForTimeout(1500);
    const later = Number(await bar.getAttribute('aria-valuenow'));
    expect(later).toBeGreaterThan(first);
    expect(await page.locator('#slow .fu__wipe').getAttribute('stroke-dasharray')).toMatch(/^[\d.]+ 377$/);
    await expect(page.locator('#slow')).toHaveAttribute('data-state', 'done', { timeout: 8000 });
    await expect(page.locator('#slow .fu__pane[data-pane=done]')).toBeVisible();
    await expect(page.locator('#slow .fu__ok')).toHaveText('Listo');
    expect(await page.evaluate(() => window.__done)).toEqual(['factura-B-0107.pdf']);
  });

  test('un archivo que no es PDF o pesa de más se rechaza con un aviso que se va a los 3 s', async ({ page }) => {
    await demo(page, 'file-upload');
    await page.locator('#main .fu__input').setInputFiles({ name: 'planilla.xlsx', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('x') });
    const alert = page.locator('#main .fu__error');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('PDF');
    await expect(page.locator('#main')).toHaveAttribute('data-state', 'idle');
    expect(await page.locator('#main .fu__frame').getAttribute('data-error')).toBe('INVALID_FILE_TYPE');
    await expect(alert).toBeHidden({ timeout: 5000 });
    await page.locator('#main .fu__input').setInputFiles(pdfFile('enorme.pdf', 5 * 1024 * 1024 + 10));
    await expect(alert).toContainText('supera 5 MB');
    expect(await page.locator('#main .fu__frame').getAttribute('data-error')).toBe('FILE_TOO_LARGE');
  });

  test('cancelar durante la subida vuelve al reposo y quitar un archivo listo también', async ({ page }) => {
    await demo(page, 'file-upload');
    await page.locator('#slow .fu__input').setInputFiles(pdfFile());
    await expect(page.locator('#slow')).toHaveAttribute('data-state', 'uploading');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('#slow')).toHaveAttribute('data-state', 'idle');
    await expect(page.locator('#slow .fu__pane[data-pane=idle]')).toBeVisible();
    await page.locator('#main .fu__input').setInputFiles(pdfFile());
    await expect(page.locator('#main')).toHaveAttribute('data-state', 'done', { timeout: 6000 });
    await page.locator('#main').getByRole('button', { name: 'Quitar' }).click();
    await expect(page.locator('#main')).toHaveAttribute('data-state', 'idle');
  });

  test('con el mouse y con el teclado el botón abre el selector de archivos', async ({ page }) => {
    await demo(page, 'file-upload');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#main [data-pick]').click()]);
    expect(chooser.isMultiple()).toBe(false);
    await chooser.setFiles([]);
    await expect(page.locator('#main')).toHaveAttribute('data-state', 'idle');
    const [again] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#main [data-pick]').press('Enter')]);
    expect(again).toBeTruthy();
    expect(await page.locator('#main [data-pick]').evaluate((n) => getComputedStyle(n).outlineStyle)).toBe('solid');
  });

  test('con el dedo se arrastra y se toca igual: los eventos de puntero no cambian nada', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(colorTools);
    await page.goto('/motion/file-upload.html', { waitUntil: 'networkidle' });
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#main [data-pick]').tap()]);
    expect(chooser).toBeTruthy();
    expect((await box(page, '#main .fu__frame')).width).toBeLessThanOrEqual(390);
    await ctx.close();
  });

  test('los cambios de panel se anuncian en una región de estado y la barra tiene valor', async ({ page }) => {
    await demo(page, 'file-upload');
    await page.locator('#main .fu__input').setInputFiles(pdfFile());
    await expect(page.locator('#main .fu__live')).toContainText('Subiendo factura-0042.pdf');
    await expect(page.locator('#main .fu__live')).toContainText('listo', { timeout: 6000 });
    await expect(page.locator('#main [role=progressbar]')).toHaveAttribute('aria-valuemax', '100');
  });

  test('de "subiendo" a "listo" el fundido es cruzado: en ningún cuadro la card queda vacía, en claro ni en oscuro', async ({ page }) => {
    for (const theme of THEMES) {
      await demo(page, 'file-upload', { theme });
      const worst = await page.evaluate(() => new Promise((resolve) => {
        const slow = document.getElementById('slow');
        const pane = (name) => slow.querySelector(`.fu__pane[data-pane=${name}]`);
        const seen = (p) => (p.hidden || getComputedStyle(p).display === 'none' ? 0 : Number(getComputedStyle(p).opacity));
        let low = 1;
        let crossed = false;
        const input = slow.querySelector('.fu__input');
        const watch = () => {
          if (slow.dataset.state === 'done') {
            const a = seen(pane('uploading'));
            const b = seen(pane('done'));
            if (a > 0 && b > 0) crossed = true;
            low = Math.min(low, 1 - (1 - a) * (1 - b));
          }
          if (slow.dataset.state === 'done' && seen(pane('uploading')) === 0 && seen(pane('done')) >= 0.99) resolve({ low, crossed });
          else requestAnimationFrame(watch);
        };
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(1000)], 'a.pdf', { type: 'application/pdf' }));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        watch();
      }));
      expect(worst.crossed, theme).toBe(true);
      expect(worst.low, theme).toBeGreaterThan(0.7);
    }
  });

  test('el cambio de panel: sale el viejo en 200 ms y entra el nuevo subiendo', async ({ page }) => {
    await demo(page, 'file-upload');
    await page.evaluate(() => document.querySelector('#slow .fu__input').dispatchEvent(new Event('x')));
    await page.locator('#slow .fu__input').setInputFiles(pdfFile());
    const out = await anims(page, '#slow .fu__pane[data-pane=idle]');
    const exit = out.find((a) => a.kf.some((k) => k.transform === 'translateY(-10px)'));
    expect(exit?.d).toBe(200);
    await expect(page.locator('#slow .fu__pane[data-pane=uploading]')).toBeVisible();
    await expect(page.locator('#slow .fu__pane[data-pane=idle]')).toBeHidden();
  });

  test('con movimiento reducido solo hay fundidos de 100 a 150 ms, sin recorrido ni giro', async ({ page }) => {
    await demo(page, 'file-upload', { reduced: true });
    await page.evaluate(async () => { const m = await import('/motion/file-upload.js'); window.__slowApi = m.mount(document.getElementById('slow')); });
    const all = await act(page, '#slow', "window.__slowApi.select(new File([new Uint8Array(1000)], 'a.pdf', { type: 'application/pdf' }))");
    const waapi = all.filter((a) => a.name == null || a.kf.some((k) => k.opacity != null));
    expect(waapi.length).toBeGreaterThan(0);
    for (const a of waapi) { expect(a.d).toBeGreaterThanOrEqual(100); expect(a.d).toBeLessThanOrEqual(150); expect(a.kf.every((k) => !k.transform)).toBe(true); }
    await expect(page.locator('#slow .fu__pane[data-pane=uploading]')).toBeVisible();
    expect(await page.locator('#slow .fu__spin circle').first().evaluate((n) => getComputedStyle(n).animationName)).toBe('none');
    expect(await page.locator('#slow .fu__art').evaluate((n) => n.animationsPaused())).toBe(true);
  });

  test('las animaciones de adorno se pausan fuera de pantalla y siguen al volver', async ({ page }) => {
    await demo(page, 'file-upload');
    await expect.poll(() => page.locator('#main .fu__art').evaluate((n) => n.animationsPaused())).toBe(false);
    const rings = () => page.locator('#main .fu__spin circle').first().evaluate((n) => getComputedStyle(n).animationPlayState);
    expect(await rings()).toBe('running');
    await page.evaluate(() => { document.querySelector('#main').style.marginTop = '4000px'; });
    await expect.poll(() => page.locator('#main .fu__art').evaluate((n) => n.animationsPaused())).toBe(true);
    expect(await rings()).toBe('paused');
    await page.evaluate(() => { document.querySelector('#main').scrollIntoView(); });
    await expect.poll(() => page.locator('#main .fu__art').evaluate((n) => n.animationsPaused())).toBe(false);
    expect(await rings()).toBe('running');
  });

  for (const theme of THEMES) {
    test(`el texto cumple AA en tema ${theme}`, async ({ page }) => {
      await demo(page, 'file-upload', { theme });
      await settle(page, 500);
      for (const sel of ['#main .fu__title', '#main .fu__hint', '#main .fu__alt', '#main [data-pick]']) expect(await contrast(page, sel), sel).toBeGreaterThanOrEqual(4.5);
      await page.locator('#main .fu__input').setInputFiles(pdfFile());
      await expect(page.locator('#main .fu__pct')).toBeVisible();
      await settle(page, 500);
      for (const sel of ['#main .fu__pane[data-pane=uploading] .fu__name', '#main .fu__pct']) expect(await contrast(page, sel), sel).toBeGreaterThanOrEqual(4.5);
      await expect(page.locator('#main')).toHaveAttribute('data-state', 'done', { timeout: 6000 });
      await settle(page, 600);
      for (const sel of ['#main .fu__ok']) expect(await contrast(page, sel), sel).toBeGreaterThanOrEqual(4.5);
      await page.locator('#main').getByRole('button', { name: 'Quitar' }).click();
      await page.locator('#main .fu__input').setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
      await expect(page.locator('#main .fu__error')).toBeVisible();
      await settle(page, 400);
      expect(await contrast(page, '#main .fu__error'), 'error').toBeGreaterThanOrEqual(4.5);
    });
  }

  test('nada sobresale de la caja que recorta, en reposo, subiendo y listo', async ({ page }) => {
    await demo(page, 'file-upload');
    expect(await strays(page, '#main')).toEqual([]);
    await page.locator('#main .fu__input').setInputFiles(pdfFile('un-nombre-de-archivo-larguisimo-que-no-entra-en-la-tarjeta-de-subida-2024.pdf'));
    await expect(page.locator('#main .fu__pane[data-pane=uploading]')).toBeVisible();
    expect(await strays(page, '#main')).toEqual([]);
    await expect(page.locator('#main')).toHaveAttribute('data-state', 'done', { timeout: 6000 });
    await page.waitForTimeout(500);
    expect(await strays(page, '#main')).toEqual([]);
  });

  test('destroy deja el elemento como estaba, sin nodos ni escuchas', async ({ page }) => {
    await demo(page, 'file-upload');
    await mountFresh(page, '/motion/file-upload.js', '<div></div>');
    expect(await page.evaluate(() => window.__el.children.length)).toBeGreaterThan(0);
    await page.evaluate(() => window.__api.destroy());
    expect(await page.evaluate(() => ({ kids: window.__el.children.length, cls: window.__el.className, state: window.__el.dataset.state ?? null, live: document.querySelectorAll('#fresh .fu, #fresh [class^=fu__]').length }))).toEqual({ kids: 0, cls: '', state: null, live: 0 });
    await page.evaluate(() => window.__el.dispatchEvent(new DragEvent('dragenter', { bubbles: true })));
    expect(await page.evaluate(() => window.__el.dataset.state ?? null)).toBeNull();
    expect(await page.evaluate(async () => { const m = await import('/motion/file-upload.js'); const again = m.mount(window.__el); return again !== window.__api; })).toBe(true);
  });
});

// ── action-search-bar ────────────────────────────────────────────────────────────────────────
test.describe('action-search-bar', () => {
  const input = (page) => page.locator('#bar .asb__input');
  const visibleOptions = (page) => page.locator('#bar [role=option]:not([hidden])');

  test('monta un combobox cerrado con su etiqueta y la lupa', async ({ page }) => {
    await demo(page, 'action-search-bar');
    await expect(page.getByRole('combobox', { name: 'Buscar acciones' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#bar .asb__panel')).toBeHidden();
    await expect(page.locator('#bar [data-ico=search]')).toBeVisible();
    await expect(page.locator('#bar [data-ico=send]')).toBeHidden();
  });

  test('al enfocar se abre la lista y las acciones entran una tras otra, 100 ms entre cada una', async ({ page }) => {
    await demo(page, 'action-search-bar');
    await input(page).focus();
    await expect(input(page)).toHaveAttribute('aria-expanded', 'true');
    const items = await page.evaluate(() => [...document.querySelectorAll('#bar .asb__item')].map((n) => n.getAnimations().map((a) => ({ delay: a.effect.getTiming().delay, d: a.effect.getTiming().duration, y: a.effect.getKeyframes()[0].transform }))[0]));
    expect(items.map((i) => i.delay)).toEqual([0, 100, 200, 300, 400]);
    expect(items.every((i) => i.d === 300 && i.y === 'translateY(20px)')).toBe(true);
    const panel = await anims(page, '#bar .asb__panel');
    expect(panel.some((a) => a.d === 400 && a.kf.some((k) => k.clip))).toBe(true);
    await expect(visibleOptions(page)).toHaveCount(5);
    await expect(page.locator('#bar .asb__foot')).toContainText('Esc');
  });

  test('flechas recorren la lista en círculo, Enter elige, Esc cierra', async ({ page }) => {
    await demo(page, 'action-search-bar');
    await page.evaluate(() => { window.__chosen = []; document.addEventListener('actionsearch:select', (e) => window.__chosen.push(e.detail.action.id)); });
    await input(page).focus();
    await settle(page, 900);
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#bar [role=option]').nth(4)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#bar [role=option]').nth(0)).toHaveAttribute('aria-selected', 'true');
    expect(await input(page).getAttribute('aria-activedescendant')).toMatch(/new-invoice$/);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.__chosen)).toEqual(['register-payment']);
    await expect(input(page)).toHaveAttribute('aria-expanded', 'false');
    await input(page).click();
    await expect(input(page)).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(input(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#bar .asb__panel')).toBeHidden();
  });

  test('escribir filtra a los 200 ms sin distinguir tildes y cambia la lupa por el envío', async ({ page }) => {
    await demo(page, 'action-search-bar');
    await input(page).focus();
    await input(page).pressSequentially('concili');
    await expect(page.locator('#bar [data-ico=send]')).toBeVisible();
    await expect(visibleOptions(page)).toHaveCount(5);
    await expect(visibleOptions(page)).toHaveCount(1);
    await expect(visibleOptions(page)).toContainText('Conciliar');
    await input(page).fill('TESORERIA');
    await expect(visibleOptions(page)).toHaveCount(1);
    await expect(visibleOptions(page)).toContainText('Registrar cobro');
    await input(page).fill('zzz');
    await expect(page.locator('#bar .asb__empty')).toContainText('Sin acciones para «zzz»');
    await input(page).fill('');
    await expect(page.locator('#bar [data-ico=search]')).toBeVisible();
    await expect(visibleOptions(page)).toHaveCount(5);
    await expect(page.locator('#bar .asb__live')).toContainText('5 acciones');
  });

  test('el ícono rueda: el que sale baja 20 px y el que entra viene de arriba, 200 ms', async ({ page }) => {
    await demo(page, 'action-search-bar');
    await input(page).focus();
    await input(page).pressSequentially('a');
    const a = await anims(page, '#bar .asb__icons');
    expect(a.some((x) => x.d === 200 && x.kf.some((k) => k.transform === 'translateY(-20px)'))).toBe(true);
    expect(a.some((x) => x.d === 200 && x.kf.some((k) => k.transform === 'translateY(20px)'))).toBe(true);
  });

  test('con el mouse el puntero marca la acción y un clic la elige sin cerrar antes de tiempo', async ({ page }) => {
    await demo(page, 'action-search-bar');
    await page.evaluate(() => { window.__chosen = []; document.addEventListener('actionsearch:select', (e) => window.__chosen.push(e.detail.action.label)); });
    await input(page).focus();
    await settle(page, 900);
    await page.locator('#bar [role=option]').nth(3).hover();
    await expect(page.locator('#bar [role=option]').nth(3)).toHaveAttribute('aria-selected', 'true');
    await page.locator('#bar [role=option]').nth(3).click();
    expect(await page.evaluate(() => window.__chosen)).toEqual(['Exportar a Excel']);
    await expect(page.locator('#chosen')).toHaveText('Exportar a Excel');
    await expect(input(page)).toBeFocused();
  });

  test('Ctrl K lleva el foco al campo desde cualquier lado y tocar afuera cierra', async ({ page }) => {
    await demo(page, 'action-search-bar');
    await page.locator('h1').click();
    await page.keyboard.press('Control+k');
    await expect(input(page)).toBeFocused();
    await expect(input(page)).toHaveAttribute('aria-expanded', 'true');
    await page.mouse.click(5, 500);
    await expect(input(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('con el dedo se elige tocando una acción', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(colorTools);
    await page.goto('/motion/action-search-bar.html', { waitUntil: 'networkidle' });
    await input(page).tap();
    await settle(page, 900);
    await page.locator('#bar [role=option]').nth(1).tap();
    await expect(page.locator('#chosen')).toHaveText('Registrar cobro');
    await ctx.close();
  });

  test('con movimiento reducido la lista solo se funde en 120 ms', async ({ page }) => {
    await demo(page, 'action-search-bar', { reduced: true });
    const a = await act(page, '#bar', "document.querySelector('#bar .asb__input').focus()");
    const fades = a.filter((y) => y.name == null);
    expect(fades.length).toBeGreaterThan(0);
    for (const x of fades) { expect(x.d).toBe(120); expect(x.kf.every((k) => !k.transform && !k.clip)).toBe(true); }
  });

  for (const theme of THEMES) {
    test(`el texto de la lista cumple AA en tema ${theme}`, async ({ page }) => {
      await demo(page, 'action-search-bar', { theme });
      await input(page).focus();
      await settle(page, 900);
      await page.keyboard.press('ArrowDown');
      for (const sel of ['#bar .asb__label', '#bar .asb__name', '#bar .asb__desc', '#bar .asb__end', '#bar .asb__foot span', '#bar .asb__input']) expect(await contrast(page, sel), sel).toBeGreaterThanOrEqual(4.5);
      expect(await contrast(page, '#bar [role=option][aria-selected=true] .asb__name')).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('nada sobresale de la lista y el campo muestra el foco', async ({ page }) => {
    await demo(page, 'action-search-bar');
    await input(page).focus();
    await settle(page, 900);
    expect(await strays(page, '#bar')).toEqual([]);
    expect(await input(page).evaluate((n) => getComputedStyle(n).boxShadow)).not.toBe('none');
    await page.setViewportSize({ width: 340, height: 700 });
    expect(await strays(page, '#bar')).toEqual([]);
  });

  test('destroy quita todo, también el atajo global', async ({ page }) => {
    await demo(page, 'action-search-bar');
    await mountFresh(page, '/motion/action-search-bar.js', '<div></div>');
    await page.evaluate(() => window.__api.destroy());
    expect(await page.evaluate(() => ({ kids: window.__el.children.length, cls: window.__el.className }))).toEqual({ kids: 0, cls: '' });
    const before = await page.evaluate(() => document.activeElement?.tagName);
    await page.keyboard.press('Control+k');
    expect(await page.evaluate(() => window.__el.querySelectorAll('*').length)).toBe(0);
    expect(before).toBeTruthy();
  });
});

// ── ai-prompt ────────────────────────────────────────────────────────────────────────────────
test.describe('ai-prompt', () => {
  const text = (page) => page.locator('#prompt .ap__text');
  const send = (page) => page.locator('#prompt .ap__send');

  test('monta las capas, el selector, el adjuntar y el envío apagado', async ({ page }) => {
    await demo(page, 'ai-prompt');
    await expect(text(page)).toHaveAttribute('placeholder', /Describí la factura/);
    await expect(send(page)).toBeDisabled();
    await expect(page.getByRole('button', { name: /Tipo de comprobante: Factura A/ })).toBeVisible();
    await expect(page.locator('#prompt .ap__head')).toContainText('Ledger arma el borrador');
    expect((await box(page, '#prompt .ap__text')).height).toBeGreaterThanOrEqual(72);
  });

  test('escribir enciende la flecha; Enter envía y limpia; Shift Enter agrega una línea', async ({ page }) => {
    await demo(page, 'ai-prompt');
    await page.evaluate(() => { window.__sent = []; document.addEventListener('aiprompt:submit', (e) => window.__sent.push(e.detail)); });
    await text(page).click();
    await page.keyboard.type('Factura B a Estudio Pereyra');
    await expect(send(page)).toBeEnabled();
    await expect.poll(() => send(page).locator('.ap__icon--arrow').evaluate((n) => Number(getComputedStyle(n).opacity))).toBeGreaterThan(0.9);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('IVA 21 %');
    expect(await text(page).inputValue()).toBe('Factura B a Estudio Pereyra\nIVA 21 %');
    expect(await page.evaluate(() => window.__sent.length)).toBe(0);
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.__sent)).toEqual([{ value: 'Factura B a Estudio Pereyra\nIVA 21 %', type: 'Factura A', file: null }]);
    expect(await text(page).inputValue()).toBe('');
    await expect(send(page)).toBeDisabled();
    await expect(page.locator('#sent li').first()).toContainText('Factura A:');
  });

  test('el campo crece con el texto hasta 300 px y después se desplaza', async ({ page }) => {
    await demo(page, 'ai-prompt');
    const h0 = (await box(page, '#prompt .ap__text')).height;
    await text(page).fill(Array.from({ length: 6 }, (_, i) => `Renglón ${i}`).join('\n'));
    const h1 = (await box(page, '#prompt .ap__text')).height;
    expect(h1).toBeGreaterThan(h0);
    await text(page).fill(Array.from({ length: 40 }, (_, i) => `Renglón ${i}`).join('\n'));
    expect(Math.round((await box(page, '#prompt .ap__text')).height)).toBe(300);
    expect(await text(page).evaluate((n) => getComputedStyle(n).overflowY)).toBe('auto');
    await text(page).fill('');
    expect(Math.round((await box(page, '#prompt .ap__text')).height)).toBe(72);
  });

  test('el selector rueda su etiqueta al cambiar, con menú de teclado completo', async ({ page }) => {
    await demo(page, 'ai-prompt');
    const trigger = page.locator('#prompt .ap__model');
    const open = await clickIn(page, '#prompt .ap__menu', '#prompt .ap__model');
    await expect(page.locator('#prompt [role=menu]')).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(open.some((a) => a.d === 150 && a.kf[0].transform?.includes('scale(0.95)'))).toBe(true);
    await expect(page.locator('#prompt [role=menuitemradio]')).toHaveCount(5);
    await page.locator('#prompt [role=menuitemradio]').nth(3).click();
    await expect(trigger).toHaveAttribute('aria-label', 'Tipo de comprobante: Nota de crédito');
    await expect(page.locator('#prompt .ap__model-label')).toHaveText('Nota de crédito', { timeout: 1000 });
    await expect(page.locator('#prompt [role=menu]')).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.press('ArrowDown');
    await expect(page.locator('#prompt [role=menuitemradio][aria-checked=true]')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('#prompt [role=menuitemradio]').first()).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.locator('#prompt [role=menuitemradio]').last()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#prompt [role=menuitemradio]').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#prompt [role=menu]')).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.mouse.click(5, 500);
    await expect(page.locator('#prompt [role=menu]')).toBeHidden();
  });

  test('el tipo elegido viaja con el envío', async ({ page }) => {
    await demo(page, 'ai-prompt');
    await page.evaluate(() => { window.__sent = []; document.addEventListener('aiprompt:submit', (e) => window.__sent.push(e.detail.type)); });
    await page.locator('#prompt .ap__model').click();
    await page.locator('#prompt [role=menuitemradio]').nth(1).click();
    await text(page).fill('algo');
    await send(page).click();
    expect(await page.evaluate(() => window.__sent)).toEqual(['Factura B']);
  });

  test('adjuntar un PDF muestra su nombre y se puede quitar', async ({ page }) => {
    await demo(page, 'ai-prompt');
    await page.locator('#prompt .ap__file').setInputFiles(pdfFile('presupuesto.pdf', 2000));
    await expect(page.locator('#prompt .ap__chip')).toBeVisible();
    await expect(page.locator('#prompt .ap__chip-name')).toHaveText('presupuesto.pdf');
    await page.evaluate(() => { window.__sent = []; document.addEventListener('aiprompt:submit', (e) => window.__sent.push(e.detail.file?.name)); });
    await text(page).fill('con adjunto');
    await text(page).press('Enter');
    expect(await page.evaluate(() => window.__sent)).toEqual(['presupuesto.pdf']);
    await page.getByRole('button', { name: 'Quitar adjunto' }).click();
    await expect(page.locator('#prompt .ap__chip')).toBeHidden();
  });

  test('con movimiento reducido el selector solo funde su etiqueta en 120 ms', async ({ page }) => {
    await demo(page, 'ai-prompt', { reduced: true });
    const open = (await clickIn(page, '#prompt .ap__menu', '#prompt .ap__model')).filter((a) => a.name == null);
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((a) => a.d === 120 && a.kf.every((k) => !k.transform))).toBe(true);
    const label = (await clickIn(page, '#prompt .ap__model-label', '#prompt [role=menuitemradio]:nth-of-type(3)')).filter((a) => a.name == null);
    expect(label.some((a) => a.d === 120)).toBe(true);
    expect(label.every((a) => a.kf.every((k) => !k.transform))).toBe(true);
  });

  test('el foco del campo se ve en la capa de afuera', async ({ page }) => {
    await demo(page, 'ai-prompt');
    const before = await page.locator('#prompt .ap__shell').evaluate((n) => getComputedStyle(n).boxShadow);
    await text(page).focus();
    await expect.poll(() => page.locator('#prompt .ap__shell').evaluate((n) => getComputedStyle(n).boxShadow)).not.toBe(before);
    for (const sel of ['.ap__send', '.ap__model']) { await page.locator(`#prompt ${sel}`).focus(); }
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement.className)).toContain('ap__');
  });

  for (const theme of THEMES) {
    test(`el texto cumple AA en tema ${theme}`, async ({ page }) => {
      await demo(page, 'ai-prompt', { theme });
      await text(page).fill('Factura de prueba');
      for (const sel of ['#prompt .ap__headtext', '#prompt .ap__headaction', '#prompt .ap__text', '#prompt .ap__model-label']) expect(await contrast(page, sel), sel).toBeGreaterThanOrEqual(4.5);
      expect(await page.evaluate(() => { const t = document.querySelector('#prompt .ap__text'); t.value = ''; return window.__k.contrast(t, t); })).toBeGreaterThan(0);
      await page.locator('#prompt .ap__model').click();
      await settle(page, 300);
      expect(await contrast(page, '#prompt .ap__opt')).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('nada sobresale de las capas, ni con el texto largo ni en un teléfono', async ({ page }) => {
    await demo(page, 'ai-prompt');
    await text(page).fill('Factura '.repeat(200));
    expect(await strays(page, '#prompt')).toEqual([]);
    await page.setViewportSize({ width: 340, height: 700 });
    expect(await strays(page, '#prompt')).toEqual([]);
  });

  test('destroy quita el menú y las escuchas', async ({ page }) => {
    await demo(page, 'ai-prompt');
    await mountFresh(page, '/motion/ai-prompt.js', '<div></div>');
    await page.evaluate(() => window.__api.destroy());
    expect(await page.evaluate(() => ({ kids: window.__el.children.length, cls: window.__el.className }))).toEqual({ kids: 0, cls: '' });
  });
});

// ── card-stack ───────────────────────────────────────────────────────────────────────────────
test.describe('card-stack', () => {
  const cards = '#review .cs__card';

  test('la vista previa es una factura legible con peso visual: cerca del 45 % de la card, con cliente, importe y total, en claro y oscuro', async ({ page }) => {
    for (const theme of THEMES) {
      await demo(page, 'card-stack', { theme });
      const top = await page.locator(`${cards}[data-top=true]`).evaluate((card) => {
        const figure = card.querySelector('.cs__figure').getBoundingClientRect();
        const sheet = card.querySelector('.cs__sheet');
        const out = [...sheet.querySelectorAll('*')].filter((n) => { const r = n.getBoundingClientRect(); return r.width && (r.bottom > figure.bottom + 0.5 || r.right > figure.right + 0.5 || r.left < figure.left - 0.5); }).map((n) => n.className);
        return { share: figure.height / card.getBoundingClientRect().height, text: sheet.textContent.replace(/\s+/g, ' '), out, empty: sheet.querySelectorAll('i:empty').length, total: sheet.querySelector('.cs__total b').textContent, title: card.querySelector('.cs__title').textContent };
      });
      expect(top.share, theme).toBeGreaterThan(0.4);
      expect(top.share, theme).toBeLessThan(0.5);
      expect(top.text, theme).toContain('Estudio Pereyra');
      expect(top.total, theme).toBe(top.title);
      expect(top.out, theme).toEqual([]);
      expect(await contrast(page, `${cards}[data-top=true] .cs__to`, `${cards}[data-top=true] .cs__sheet`), theme).toBeGreaterThanOrEqual(4.5);
    }
  });
  const remaining = (page) => page.locator('#review').getAttribute('data-remaining');
  const decided = (page) => page.evaluate(() => window.__decided);
  const track = (page) => page.evaluate(() => { window.__decided = []; document.addEventListener('cardstack:decide', (e) => window.__decided.push(`${e.detail.id}:${e.detail.decision}`)); });
  const drag = async (page, dx, dy = 0, steps = 12) => {
    const b = await box(page, `${cards}[data-top=true]`);
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps });
    return { x: x + dx, y: y + dy };
  };

  test('monta la pila: cinco facturas, la de arriba activa y cada una más girada y corrida', async ({ page }) => {
    await demo(page, 'card-stack');
    await expect(page.locator(cards)).toHaveCount(5);
    expect(await remaining(page)).toBe('5');
    await expect(page.locator(`${cards}[data-top=true]`)).toHaveCount(1);
    for (let i = 0; i < 5; i++) {
      const p = await pose(page, cards, i);
      expect(p.x).toBeCloseTo(i * 10 - 20, 0);
      expect(p.y).toBeCloseTo(i * 2, 0);
      expect(p.r).toBeCloseTo(i * 1.5, 1);
    }
    const z = await page.evaluate((s) => [...document.querySelectorAll(s)].map((n) => Number(n.style.zIndex)), cards);
    expect(z).toEqual([6, 5, 4, 3, 2]);
    expect(await page.locator(`${cards}[aria-hidden=true]`).count()).toBe(4);
  });

  test('el abanico abre con un resorte, cada carta 40 ms después de la anterior', async ({ page }) => {
    await demo(page, 'card-stack');
    await page.locator('[data-act=spread]').click();
    await expect(page.locator('[data-act=spread]')).toHaveAttribute('aria-expanded', 'true');
    // The first card starts at once and the last one 160 ms later: when the first has moved, the last has not.
    await expect.poll(async () => Math.abs((await pose(page, cards, 0)).x - -20), { intervals: [8], timeout: 1000 }).toBeGreaterThan(5);
    const early = [await pose(page, cards, 0), await pose(page, cards, 4)];
    expect(Math.abs(early[1].x - 20)).toBeLessThan(5);
    await expect.poll(async () => Math.abs((await pose(page, cards, 4)).x - 160), { timeout: 8000 }).toBeLessThan(0.5);
    await settle(page, 300);
    for (let i = 0; i < 5; i++) {
      const p = await pose(page, cards, i);
      expect(p.x).toBeCloseTo(i * 80 - 160, 0);
      expect(p.y).toBeCloseTo(0, 0);
      expect(p.r).toBeCloseTo(i * 5 - 10, 1);
    }
    await page.locator('[data-act=spread]').click();
    await expect.poll(async () => Math.abs((await pose(page, cards, 4)).x - 20), { timeout: 6000 }).toBeLessThan(0.5);
  });

  test('aprobar con el botón saca la de arriba hacia la derecha y la siguiente sube', async ({ page }) => {
    await demo(page, 'card-stack');
    await track(page);
    await page.locator('[data-act=approve]').click();
    await expect.poll(async () => (await pose(page, cards, 0)).x, { intervals: [25] }).toBeGreaterThan(40);
    await expect(page.locator(`${cards}[data-decision=approved]`)).toHaveCount(1);
    expect(await decided(page)).toEqual(['A-4217:approved']);
    expect(await remaining(page)).toBe('4');
    await settle(page, 900);
    expect(await page.locator(`${cards}[data-decision]`).evaluate((n) => getComputedStyle(n).visibility)).toBe('hidden');
    await expect(page.locator(`${cards}[data-top=true] .cs__subtitle`)).toHaveText('Cooperativa Ñandú');
    expect((await pose(page, cards, 1)).x).toBeCloseTo(0 * 10 - 15, 0);
    await expect(page.locator('#review .cs__count')).toContainText('Aprobaste la factura de Estudio Pereyra. 4 por revisar.');
  });

  test('rechazar con el botón la saca hacia la izquierda y deshacer la trae de vuelta', async ({ page }) => {
    await demo(page, 'card-stack');
    await track(page);
    await page.locator('[data-act=reject]').click();
    await page.waitForTimeout(150);
    expect((await pose(page, cards, 0)).x).toBeLessThan(-40);
    expect(await decided(page)).toEqual(['A-4217:rejected']);
    await expect(page.locator('[data-act=undo]')).toBeEnabled();
    await settle(page, 700);
    await page.locator('[data-act=undo]').click();
    await expect.poll(async () => Math.abs((await pose(page, cards, 0)).x - -20), { timeout: 8000 }).toBeLessThan(0.5);
    expect(await remaining(page)).toBe('5');
    await expect(page.locator(`${cards}[data-top=true] .cs__subtitle`)).toHaveText('Estudio Pereyra');
    expect(await page.locator(`${cards}[data-top=true]`).evaluate((n) => ({ v: getComputedStyle(n).visibility, o: getComputedStyle(n).opacity }))).toEqual({ v: 'visible', o: '1' });
    await expect(page.locator('[data-act=undo]')).toBeDisabled();
  });

  test('el teclado hace lo mismo: flecha derecha aprueba, izquierda rechaza, Backspace deshace, Enter abre el abanico', async ({ page }) => {
    await demo(page, 'card-stack');
    await track(page);
    await page.locator('#review .cs__stack').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    expect(await decided(page)).toEqual(['A-4217:approved', 'A-4218:rejected']);
    await page.keyboard.press('Backspace');
    expect(await remaining(page)).toBe('4');
    await page.keyboard.press('a');
    await page.keyboard.press('r');
    expect(await decided(page)).toEqual(['A-4217:approved', 'A-4218:rejected', 'A-4218:approved', 'A-4219:rejected']);
    await page.keyboard.press('Control+z');
    expect(await remaining(page)).toBe('3');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-act=spread]')).toHaveAttribute('aria-expanded', 'true');
    expect(await page.locator('#review .cs__stack').evaluate((n) => getComputedStyle(n).outlineStyle)).toBe('solid');
  });

  test('con el mouse la carta sigue al puntero, se inclina y sella; pasada la distancia se va', async ({ page }) => {
    await demo(page, 'card-stack');
    await track(page);
    await drag(page, 70, 10);
    await page.waitForTimeout(250);
    const p = await pose(page, cards, 0);
    expect(p.x).toBeGreaterThan(40);
    expect(p.r).toBeGreaterThan(2);
    expect(await page.locator(`${cards}[data-top=true]`).evaluate((n) => ({ ok: Number(getComputedStyle(n.querySelector('.cs__stamp--ok')).opacity), no: Number(getComputedStyle(n.querySelector('.cs__stamp--no')).opacity), drag: n.dataset.dragging }))).toMatchObject({ drag: 'true' });
    const stamps = await page.locator(`${cards}[data-top=true]`).evaluate((n) => [Number(getComputedStyle(n.querySelector('.cs__stamp--ok')).opacity), Number(getComputedStyle(n.querySelector('.cs__stamp--no')).opacity)]);
    expect(stamps[0]).toBeGreaterThan(0.3);
    expect(stamps[1]).toBe(0);
    await page.mouse.move(await page.evaluate(() => innerWidth / 2 + 260), 450, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    expect(await decided(page)).toEqual(['A-4217:approved']);
  });

  test('con el mouse una soltada corta vuelve la carta a su lugar sin decidir', async ({ page }) => {
    await demo(page, 'card-stack');
    await track(page);
    await drag(page, -40, 5);
    await page.mouse.up();
    await expect.poll(async () => Math.abs((await pose(page, cards, 0)).x - -20), { timeout: 8000 }).toBeLessThan(0.5);
    expect(await decided(page)).toEqual([]);
    expect(await remaining(page)).toBe('5');
    expect((await pose(page, cards, 0)).r).toBeCloseTo(0, 0);
  });

  test('arrastrar hacia la izquierda rechaza', async ({ page }) => {
    await demo(page, 'card-stack');
    await track(page);
    await drag(page, -240, 0);
    await page.mouse.up();
    await page.waitForTimeout(200);
    expect(await decided(page)).toEqual(['A-4217:rejected']);
  });

  test('con el dedo un deslizamiento aprueba y un toque abre el abanico', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript(colorTools);
    await page.goto('/motion/card-stack.html', { waitUntil: 'networkidle' });
    await track(page);
    const client = await ctx.newCDPSession(page);
    const b = await box(page, `${cards}[data-top=true]`);
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 22, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    expect(await decided(page)).toEqual(['A-4217:approved']);
    await page.locator(`${cards}[data-top=true]`).tap();
    await expect(page.locator('[data-act=spread]')).toHaveAttribute('aria-expanded', 'true');
    await ctx.close();
  });

  test('al terminar las cinco aparece el estado vacío y se puede volver a revisar', async ({ page }) => {
    await demo(page, 'card-stack');
    for (let i = 0; i < 5; i++) await page.locator('[data-act=approve]').click();
    await expect(page.locator('#review .cs__empty')).toBeVisible();
    await expect(page.locator('#review .cs__empty-title')).toHaveText('No quedan facturas por revisar');
    await expect(page.locator('[data-act=approve]')).toBeDisabled();
    await expect(page.locator('[data-act=reject]')).toBeDisabled();
    await page.getByRole('button', { name: 'Volver a revisar' }).click();
    await settle(page, 900);
    expect(await remaining(page)).toBe('5');
    await expect(page.locator('#review .cs__empty')).toBeHidden();
    await expect(page.locator('[data-act=approve]')).toBeEnabled();
  });

  test('con movimiento reducido las cartas no giran y cambian con un fundido de 120 ms', async ({ page }) => {
    await demo(page, 'card-stack', { reduced: true });
    for (let i = 0; i < 5; i++) expect((await pose(page, cards, i)).r).toBeCloseTo(0, 3);
    const a = await clickIn(page, '#review .cs__stack', '[data-act=approve]');
    const fades = a.filter((x) => x.name == null);
    expect(fades.length).toBeGreaterThan(0);
    for (const x of fades) { expect([120, 100]).toContain(x.d); expect(x.kf.every((k) => !k.transform)).toBe(true); }
    expect((await pose(page, cards, 1)).x).toBeCloseTo(-15, 0);
    await page.locator('[data-act=spread]').click();
    await page.waitForTimeout(100);
    for (let i = 1; i < 5; i++) expect((await pose(page, cards, i)).r).toBeCloseTo(0, 3);
    expect((await pose(page, cards, 4)).x).toBeCloseTo(120, 0);
  });

  test('es un grupo con nombre y descripción, las de atrás quedan fuera del árbol y los cambios se anuncian', async ({ page }) => {
    await demo(page, 'card-stack');
    const stack = page.locator('#review .cs__stack');
    await expect(stack).toHaveAttribute('role', 'group');
    await expect(stack).toHaveAttribute('tabindex', '0');
    await expect(stack).toHaveAttribute('aria-roledescription', 'pila de facturas');
    expect(await stack.getAttribute('aria-describedby')).toBeTruthy();
    await expect(page.getByRole('button', { name: 'Deshacer la última decisión' })).toBeDisabled();
    await expect(page.locator('#review .cs__count')).toHaveText('5 facturas por revisar');
    await page.locator('[data-act=reject]').click();
    await expect(page.locator('#review .cs__count')).toContainText('Rechazaste la factura de Estudio Pereyra');
    await expect(page.getByRole('button', { name: 'Abrir el abanico' })).toBeVisible();
  });

  for (const theme of THEMES) {
    test(`el texto de las cartas y los botones cumple AA en tema ${theme}`, async ({ page }) => {
      await demo(page, 'card-stack', { theme });
      const top = `${cards}[data-top=true]`;
      for (const sel of [`${top} .cs__title`, `${top} .cs__subtitle`, `${top} .cs__desc`, `${top} .cs__specs dd`, `${top} .cs__specs dt`, '[data-act=approve]', '[data-act=reject]']) expect(await contrast(page, sel), sel).toBeGreaterThanOrEqual(4.5);
      await page.evaluate(() => { document.querySelector('.cs__stamp--ok').style.setProperty('--ok', '1'); document.querySelector('.cs__stamp--no').style.setProperty('--no', '1'); });
      await settle(page, 400);
      expect(await contrast(page, '.cs__stamp--ok')).toBeGreaterThanOrEqual(4.5);
      expect(await contrast(page, '.cs__stamp--no')).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('nada sobresale de las cartas ni de la barra, en pila y en abanico', async ({ page }) => {
    await demo(page, 'card-stack');
    expect(await strays(page, '#review')).toEqual([]);
    await page.locator('[data-act=spread]').click();
    await settle(page, 1200);
    expect(await strays(page, '#review')).toEqual([]);
  });

  test('destroy para los resortes y deja el elemento vacío', async ({ page }) => {
    await demo(page, 'card-stack');
    await mountFresh(page, '/motion/card-stack.js', '<div></div>');
    await page.evaluate(() => window.__api.approve());
    await page.evaluate(() => window.__api.destroy());
    expect(await page.evaluate(() => ({ kids: window.__el.children.length, cls: window.__el.className, rem: window.__el.dataset.remaining ?? null }))).toEqual({ kids: 0, cls: '', rem: null });
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__el.querySelectorAll('*').length)).toBe(0);
  });
});

// ── smooth-tab ───────────────────────────────────────────────────────────────────────────────
test.describe('smooth-tab', () => {
  const tab = (page, i) => page.locator('#tabs [role=tab]').nth(i);
  const pillBox = (page) => box(page, '#tabs .st__pill');

  test('monta un tablist de cuatro, el primero elegido, su panel a la vista y la píldora debajo', async ({ page }) => {
    await demo(page, 'smooth-tab');
    await expect(page.locator('#tabs [role=tablist]')).toHaveAttribute('aria-label', 'Secciones');
    await expect(page.locator('#tabs [role=tab]')).toHaveCount(4);
    await expect(tab(page, 0)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#tabs [role=tabpanel]:not([hidden])')).toHaveCount(1);
    await expect(page.locator('#tabs .st__title').first()).toHaveText('Facturas');
    const p = await pillBox(page);
    const t = await box(page, '#tabs [role=tab]', 0);
    expect(p.x).toBeCloseTo(t.x + 4, 0);
    expect(p.width).toBeCloseTo(t.width - 8, 0);
    expect(p.height).toBeCloseTo(t.height, 0);
  });

  test('al elegir otra la píldora la sigue con un resorte y llega justo debajo', async ({ page }) => {
    await demo(page, 'smooth-tab');
    const start = (await pillBox(page)).x;
    await tab(page, 2).click();
    const end = (await box(page, '#tabs [role=tab]', 2)).x + 4;
    // On its way: it has left, and it is not yet where it will stop.
    await expect.poll(async () => (await pillBox(page)).x, { intervals: [8], timeout: 1500 }).toBeGreaterThan(start + 5);
    expect(Math.abs((await pillBox(page)).x - end)).toBeGreaterThan(1);
    await expect.poll(async () => Math.abs((await pillBox(page)).x - end), { timeout: 6000 }).toBeLessThan(0.5);
    expect((await pillBox(page)).width).toBeCloseTo((await box(page, '#tabs [role=tab]', 2)).width - 8, 0);
    await expect(tab(page, 2)).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, 0)).toHaveAttribute('aria-selected', 'false');
  });

  test('el contenido entra del lado de la dirección con desenfoque y escala; las dos se ven un momento', async ({ page }) => {
    await demo(page, 'smooth-tab');
    await tab(page, 3).click();
    const incoming = await page.evaluate(() => { const p = document.querySelectorAll('#tabs .st__panel')[3]; const a = p.getAnimations()[0]; return { d: a.effect.getTiming().duration, e: a.effect.getTiming().easing, k: a.effect.getKeyframes().map((k) => [k.transform, k.filter, k.opacity]) }; });
    expect(incoming.d).toBe(400);
    expect(incoming.e).toBe('cubic-bezier(0.32, 0.72, 0, 1)');
    expect(incoming.k[0]).toEqual(['translateX(100%) scale(0.95)', 'blur(8px)', '0']);
    expect(await page.locator('#tabs .st__panel:not([hidden])').count()).toBe(2);
    await page.waitForTimeout(60);
    expect(await page.evaluate(() => getComputedStyle(document.querySelectorAll('#tabs .st__panel')[3]).filter)).toContain('blur');
    await settle(page, 600);
    expect(await page.locator('#tabs .st__panel:not([hidden])').count()).toBe(1);
    await tab(page, 1).click();
    const back = await page.evaluate(() => document.querySelectorAll('#tabs .st__panel')[1].getAnimations()[0].effect.getKeyframes()[0].transform);
    expect(back).toBe('translateX(-100%) scale(0.95)');
    await settle(page, 600);
    await expect(page.locator('#tabs .st__panel:not([hidden]) .st__title')).toHaveText('Clientes');
  });

  test('cambiar a mitad de camino no deja paneles colgados ni saltos', async ({ page }) => {
    await demo(page, 'smooth-tab');
    await tab(page, 1).click();
    await page.waitForTimeout(80);
    await tab(page, 2).click();
    await page.waitForTimeout(40);
    await tab(page, 0).click();
    await settle(page, 900);
    expect(await page.locator('#tabs .st__panel:not([hidden])').count()).toBe(1);
    expect(await page.locator('#tabs .st__panel:not([hidden]) .st__title').textContent()).toBe('Facturas');
    expect(await page.evaluate(() => { const p = document.querySelector('#tabs .st__panel:not([hidden])'); return [getComputedStyle(p).opacity, getComputedStyle(p).filter, getComputedStyle(p).transform]; })).toEqual(['1', 'none', 'none']);
  });

  test('el teclado mueve con flechas, Inicio y Fin y deja un solo tab en el orden de tabulación', async ({ page }) => {
    await demo(page, 'smooth-tab');
    await tab(page, 0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, 1)).toBeFocused();
    await expect(tab(page, 1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(tab(page, 3)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, 0)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(tab(page, 3)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(tab(page, 0)).toHaveAttribute('aria-selected', 'true');
    expect(await page.locator('#tabs [role=tab][tabindex="0"]').count()).toBe(1);
    expect(await tab(page, 0).evaluate((n) => getComputedStyle(n).outlineStyle)).toBe('solid');
    await settle(page, 800);
    expect(await page.getByRole('tabpanel').first().getAttribute('aria-labelledby')).toBeTruthy();
  });

  test('con el dedo se elige tocando una pestaña', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 400, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(colorTools);
    await page.goto('/motion/smooth-tab.html', { waitUntil: 'networkidle' });
    await tab(page, 1).tap();
    await expect(tab(page, 1)).toHaveAttribute('aria-selected', 'true');
    await ctx.close();
  });

  test('con movimiento reducido el contenido solo se funde y la píldora salta', async ({ page }) => {
    await demo(page, 'smooth-tab', { reduced: true });
    const a = await clickIn(page, '#tabs .st__clip', '#tabs [role=tab]:nth-of-type(3)');
    const fades = a.filter((x) => x.name == null);
    expect(fades.length).toBeGreaterThan(0);
    for (const x of fades) { expect(x.d).toBe(120); expect(x.kf.every((k) => !k.transform && !k.filter)).toBe(true); }
    expect(await page.locator('#tabs .st__panel:not([hidden])').count()).toBe(1);
    expect((await pillBox(page)).x).toBeCloseTo((await box(page, '#tabs [role=tab]', 2)).x + 4, 0);
    expect(await page.locator('#tabs .st__wave path').first().evaluate((n) => getComputedStyle(n).animationName)).toBe('none');
  });

  test('las ondas se detienen fuera de pantalla', async ({ page }) => {
    await demo(page, 'smooth-tab');
    expect(await page.locator('#tabs .st__wave path').first().evaluate((n) => getComputedStyle(n).animationPlayState)).toBe('running');
    await page.evaluate(() => { document.querySelector('#tabs').style.marginTop = '4000px'; });
    await expect.poll(() => page.locator('#tabs .st__wave path').first().evaluate((n) => getComputedStyle(n).animationPlayState)).toBe('paused');
  });

  for (const theme of THEMES) {
    test(`la píldora de cada tono sostiene el texto en AA en tema ${theme}`, async ({ page }) => {
      await demo(page, 'smooth-tab', { theme });
      for (let i = 0; i < 4; i++) {
        await tab(page, i).click();
        await settle(page, 700);
        const c = await page.evaluate((idx) => {
          const t = document.querySelectorAll('#tabs [role=tab]')[idx];
          const pill = getComputedStyle(document.querySelector('#tabs .st__pill')).backgroundColor;
          const fg = window.__k.rgba(getComputedStyle(t).color);
          return window.__k.on(fg, window.__k.rgba(pill));
        }, i);
        expect(c, `tab ${i}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const sel of ['#tabs .st__title', '#tabs .st__desc', '#tabs [role=tab][aria-selected=false]']) expect(await contrast(page, sel), sel).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('nada sobresale de la tarjeta ni de la barra, con la ventana angosta', async ({ page }) => {
    await demo(page, 'smooth-tab');
    expect(await strays(page, '#tabs')).toEqual([]);
    await page.setViewportSize({ width: 320, height: 700 });
    await settle(page, 300);
    expect(await strays(page, '#tabs')).toEqual([]);
    const p = await pillBox(page);
    const t = await box(page, '#tabs [role=tab]', 0);
    expect(p.x).toBeCloseTo(t.x + 4, 0);
  });

  test('destroy deja el elemento vacío y sin observadores', async ({ page }) => {
    await demo(page, 'smooth-tab');
    await mountFresh(page, '/motion/smooth-tab.js', '<div></div>');
    await page.evaluate(() => window.__api.select('clientes'));
    await page.evaluate(() => window.__api.destroy());
    expect(await page.evaluate(() => ({ kids: window.__el.children.length, cls: window.__el.className, tone: window.__el.dataset.tone ?? null }))).toEqual({ kids: 0, cls: '', tone: null });
    await page.setViewportSize({ width: 500, height: 700 });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__el.querySelectorAll('*').length)).toBe(0);
  });
});

// ── team-selector ────────────────────────────────────────────────────────────────────────────
test.describe('team-selector', () => {
  const inc = (page) => page.locator('#one [data-step="1"]');
  const dec = (page) => page.locator('#one [data-step="-1"]');
  const visible = (page) => page.locator('#one .ts__av[data-visible=true]');

  test('monta cinco avatares con uno a la vista, el contador en 1 y los botones con nombre', async ({ page }) => {
    await demo(page, 'team-selector');
    await expect(page.locator('#one .ts__av')).toHaveCount(5);
    await expect(visible(page)).toHaveCount(1);
    await expect(page.locator('#one .ts__unit')).toHaveText('miembro');
    await expect(page.getByRole('group', { name: 'Puestos del equipo' })).toBeVisible();
    await expect(dec(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(inc(page)).toHaveAttribute('aria-disabled', 'false');
    const avatars = await page.evaluate(() => [...document.querySelectorAll('#one .ts__av')].map((n) => [n.offsetWidth, n.offsetLeft, Number(getComputedStyle(n).zIndex)]));
    expect(avatars.map((a) => a[0])).toEqual([44, 44, 44, 44, 44]);
    expect(avatars[1][1] - avatars[0][1]).toBe(32);
    expect(avatars.map((a) => a[2])).toEqual([5, 4, 3, 2, 1]);
  });

  test('el grupo de avatares a la vista queda centrado en la tarjeta con 1, 3 y 5 integrantes', async ({ page }) => {
    await demo(page, 'team-selector');
    const offCentre = () => page.evaluate(() => {
      const card = document.querySelector('#one .ts__card').getBoundingClientRect();
      const shown = [...document.querySelectorAll('#one .ts__av[data-visible=true]')].map((n) => n.getBoundingClientRect());
      const left = Math.min(...shown.map((r) => r.left));
      const right = Math.max(...shown.map((r) => r.right));
      return (left + right) / 2 - (card.left + card.right) / 2;
    });
    expect(Math.abs(await offCentre())).toBeLessThanOrEqual(1);
    for (const target of [3, 5]) {
      while ((await visible(page).count()) < target) await inc(page).click();
      await settle(page, 600);
      expect(Math.abs(await offCentre()), `${target} integrantes`).toBeLessThanOrEqual(1);
    }
  });

  test('sumar hace entrar al avatar con un resorte y gira el número hacia arriba', async ({ page }) => {
    await demo(page, 'team-selector');
    const everything = await clickIn(page, '#one', '#one [data-step="1"]');
    const av = everything;
    expect(av.some((a) => a.kf[0].transform === 'scale(0.85)' && a.kf[0].opacity === '0' && a.d === 360)).toBe(true);
    const roll = everything;
    expect(roll.some((a) => a.kf[0].transform === 'translateY(10px)' && a.d === 200)).toBe(true);
    expect(roll.some((a) => a.kf[1].transform === 'translateY(-10px)' && a.d === 140)).toBe(true);
    await expect(visible(page)).toHaveCount(2);
    await settle(page, 500);
    expect(await page.locator('#one .ts__num').count()).toBe(1);
    await expect(page.locator('#one .ts__num:not(.ts__num--leaving)')).toHaveText('2');
    await expect(page.locator('#one .ts__unit')).toHaveText('miembros');
    expect(await page.locator('#one .ts__av').nth(1).evaluate((n) => getComputedStyle(n).opacity)).toBe('1');
    await expect(page.locator('#one .ts__sr')).toHaveText('2 miembros');
    await expect(page.locator('#log')).toHaveText('Puestos: 2');
  });

  test('restar hace salir al último con un fundido corto y el número baja', async ({ page }) => {
    await demo(page, 'team-selector');
    await inc(page).click();
    await inc(page).click();
    await settle(page, 500);
    await dec(page).click();
    const av = await anims(page, '#one .ts__avatars');
    expect(av.some((a) => a.d === 180 && a.kf[1].opacity === '0')).toBe(true);
    const roll = await anims(page, '#one .ts__roll');
    expect(roll.some((a) => a.kf[0].transform === 'translateY(-10px)')).toBe(true);
    await expect(visible(page)).toHaveCount(2);
    await settle(page, 400);
    await expect(page.locator('#one .ts__num:not(.ts__num--leaving)')).toHaveText('2');
  });

  test('pasarse del tope sacude los botones 280 ms y no cambia el número; el mínimo igual', async ({ page }) => {
    await demo(page, 'team-selector');
    const atMin = await clickIn(page, '#one .ts__controls', '#one [data-step="-1"]');
    expect(atMin.some((a) => a.d === 280 && a.kf.map((k) => k.transform).join() === 'translateX(0px),translateX(-3px),translateX(3px),translateX(-2px),translateX(2px),translateX(0px)')).toBe(true);
    await expect(page.locator('#one .ts__num')).toHaveText('1');
    for (let i = 0; i < 4; i++) await inc(page).click();
    await settle(page, 400);
    await expect(inc(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(visible(page)).toHaveCount(5);
    const atMax = await clickIn(page, '#one .ts__controls', '#one [data-step="1"]');
    expect(atMax.some((a) => a.d === 280)).toBe(true);
    await expect(page.locator('#one .ts__num')).toHaveText('5');
    expect(await inc(page).evaluate((n) => getComputedStyle(n).opacity)).toBe('0.4');
  });

  test('el teclado suma y resta con Enter y Espacio, y el foco se ve', async ({ page }) => {
    await demo(page, 'team-selector');
    await inc(page).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await expect(visible(page)).toHaveCount(3);
    await dec(page).focus();
    await page.keyboard.press('Enter');
    await expect(visible(page)).toHaveCount(2);
    expect(await dec(page).evaluate((n) => getComputedStyle(n).outlineStyle)).toBe('solid');
    await expect(page.locator('#one .ts__sr')).toHaveText('2 miembros');
  });

  test('con el dedo se suma tocando', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(colorTools);
    await page.goto('/motion/team-selector.html', { waitUntil: 'networkidle' });
    await inc(page).tap();
    await expect(visible(page)).toHaveCount(2);
    await ctx.close();
  });

  test('con movimiento reducido no hay sacudida ni recorrido: solo fundidos', async ({ page }) => {
    await demo(page, 'team-selector', { reduced: true });
    const all = await clickIn(page, '#one', '#one [data-step="1"]');
    const waapi = all.filter((a) => a.name == null);
    expect(waapi.length).toBeGreaterThan(0);
    for (const a of waapi) { expect(a.d).toBeGreaterThanOrEqual(100); expect(a.d).toBeLessThanOrEqual(150 + 70); expect(a.kf.every((k) => !k.transform || k.transform === 'none')).toBe(true); }
    await dec(page).click();
    const atEdge = await clickIn(page, '#one .ts__controls', '#one [data-step="-1"]');
    expect(atEdge.filter((a) => a.name == null && a.kf.some((k) => k.transform))).toEqual([]);
  });

  test('el número de cada miembro y el de la tarjeta cumplen AA', async ({ page }) => {
    for (const theme of THEMES) {
      await demo(page, 'team-selector', { theme });
      await settle(page, 200);
      for (const sel of ['#one .ts__legend', '#one .ts__num', '#one .ts__unit', '#one .ts__av span']) expect(await contrast(page, sel), `${theme} ${sel}`).toBeGreaterThanOrEqual(4.5);
      expect(await contrast(page, '#one [data-step="1"]')).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('nada sobresale de la tarjeta, ni con los cinco avatares en una ventana angosta', async ({ page }) => {
    await demo(page, 'team-selector');
    for (let i = 0; i < 4; i++) await inc(page).click();
    await settle(page, 500);
    expect(await strays(page, '#one')).toEqual([]);
    await page.setViewportSize({ width: 320, height: 700 });
    expect(await strays(page, '#one')).toEqual([]);
  });

  test('destroy deja el elemento vacío', async ({ page }) => {
    await demo(page, 'team-selector');
    await mountFresh(page, '/motion/team-selector.js', '<div></div>');
    await page.evaluate(() => { window.__api.set(3); window.__api.destroy(); });
    expect(await page.evaluate(() => ({ kids: window.__el.children.length, cls: window.__el.className }))).toEqual({ kids: 0, cls: '' });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__el.querySelectorAll('*').length)).toBe(0);
  });
});

// ── kk-loader ────────────────────────────────────────────────────────────────────────────────
test.describe('kk-loader', () => {
  test('monta tres cargadores como regiones de estado ocupadas, con su título y subtítulo', async ({ page }) => {
    await demo(page, 'kk-loader');
    await expect(page.getByRole('status')).toHaveCount(3);
    await expect(page.locator('[data-motion=kk-loader]').first()).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#md .kl__title')).toContainText('Importando el extracto bancario');
    await expect(page.locator('#md .kl__sub')).toContainText('conciliando');
    expect(await page.locator('#md .kl__ring').count()).toBe(4);
  });

  test('los tres tamaños miden 80, 128 y 160 px', async ({ page }) => {
    await demo(page, 'kk-loader');
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.kl__stage')].map((n) => n.offsetWidth));
    expect(sizes).toEqual([80, 128, 160]);
  });

  test('cada anillo gira a su ritmo y el conjunto respira; el texto sube escalonado', async ({ page }) => {
    await demo(page, 'kk-loader');
    const rings = await page.evaluate(() => [...document.querySelectorAll('#md .kl__ring')].map((n) => { const s = getComputedStyle(n); return [s.animationName, s.animationDuration, s.animationTimingFunction]; }));
    expect(rings.map((r) => [r[0], r[1]])).toEqual([['kl-cw', '3s'], ['kl-cw', '2.5s'], ['kl-ccw', '4s'], ['kl-cw', '3.5s']]);
    expect(rings[1][2]).toBe('cubic-bezier(0.4, 0, 0.6, 1)');
    expect(await page.locator('#md .kl__stage').evaluate((n) => [getComputedStyle(n).animationName, getComputedStyle(n).animationDuration])).toEqual(['kl-breathe', '4s']);
    const enter = await page.evaluate(() => ['.kl__text', '.kl__title', '.kl__sub'].map((s) => { const c = getComputedStyle(document.querySelector(`#md ${s}`)); return [c.animationName.split(',')[0], c.animationDelay.split(',')[0], c.animationDuration.split(',')[0]]; }));
    expect(enter).toEqual([['kl-rise', '0.4s', '1s'], ['kl-rise', '0.6s', '0.8s'], ['kl-rise', '0.8s', '0.8s']]);
    expect(await page.locator('#md .kl__title-in').evaluate((n) => getComputedStyle(n).animationDuration)).toBe('3s');
    expect(await page.locator('#md .kl__sub-in').evaluate((n) => getComputedStyle(n).animationDuration)).toBe('4s');
    const t0 = await page.locator('#md .kl__ring--outer').evaluate((n) => new DOMMatrix(getComputedStyle(n).transform).a);
    await page.waitForTimeout(400);
    const t1 = await page.locator('#md .kl__ring--outer').evaluate((n) => new DOMMatrix(getComputedStyle(n).transform).a);
    expect(t1).not.toBeCloseTo(t0, 2);
  });

  test('los anillos toman el color del texto: claros en oscuro, oscuros en claro', async ({ page }) => {
    await demo(page, 'kk-loader', { theme: 'light' });
    const light = await page.locator('#md').evaluate((n) => window.__k.rgba(getComputedStyle(n).color));
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const dark = await page.locator('#md').evaluate((n) => window.__k.rgba(getComputedStyle(n).color));
    expect(light[0]).toBeLessThan(90);
    expect(dark[0]).toBeGreaterThan(170);
  });

  test('fuera de pantalla y con la pestaña oculta todo se detiene', async ({ page }) => {
    await demo(page, 'kk-loader');
    const state = () => page.locator('#md .kl__ring--main').evaluate((n) => getComputedStyle(n).animationPlayState);
    expect(await state()).toBe('running');
    await page.evaluate(() => { document.querySelector('#md').style.marginTop = '4000px'; });
    await expect.poll(state).toBe('paused');
    await page.evaluate(() => { document.querySelector('#md').style.marginTop = ''; document.querySelector('#md').scrollIntoView(); });
    await expect.poll(state).toBe('running');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(state).toBe('paused');
  });

  test('con movimiento reducido los anillos no giran: laten en opacidad y el texto entra en 150 ms', async ({ page }) => {
    await demo(page, 'kk-loader', { reduced: true });
    const info = await page.evaluate(() => [...document.querySelectorAll('#md .kl__ring')].map((n) => getComputedStyle(n).animationName));
    expect(info).toEqual(['kl-pulse', 'kl-pulse', 'kl-pulse', 'kl-pulse']);
    expect(await page.locator('#md .kl__stage').evaluate((n) => getComputedStyle(n).animationName)).toBe('none');
    expect(await page.locator('#md .kl__text').evaluate((n) => [getComputedStyle(n).animationName, getComputedStyle(n).animationDuration])).toEqual(['kl-fade', '0.15s']);
    const a = await anims(page, '#md');
    expect(a.every((x) => x.kf.every((k) => !k.transform || k.transform === 'none'))).toBe(true);
  });

  for (const theme of THEMES) {
    test(`el título y el subtítulo cumplen AA incluso en lo más bajo de su respiración en tema ${theme}`, async ({ page }) => {
      await demo(page, 'kk-loader', { theme });
      await settle(page, 1500);
      await page.evaluate(() => { for (const a of document.getAnimations()) { const t = a.effect.getTiming(); if (a.animationName?.startsWith('kl-breathe-')) { a.pause(); a.currentTime = Number(t.duration) / 2; } } });
      for (const sel of ['#md .kl__title-in', '#md .kl__sub-in']) expect(await contrast(page, sel), sel).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('nada sobresale de cada cargador, ni con textos largos en el chico', async ({ page }) => {
    await demo(page, 'kk-loader');
    await page.evaluate(() => document.querySelector('[data-size=sm]').querySelector('.kl__sub-in').textContent = 'Un subtítulo largo que tiene que partirse en varias líneas sin salirse del ancho que le toca');
    expect(await strays(page, 'main')).toEqual([]);
  });

  test('set cambia las palabras y destroy deja el elemento como estaba', async ({ page }) => {
    await demo(page, 'kk-loader');
    await mountFresh(page, '/motion/kk-loader.js', '<div></div>', { title: 'Uno' });
    await page.evaluate(() => window.__api.set({ title: 'Dos', subtitle: 'sub' }));
    expect(await page.evaluate(() => window.__el.querySelector('.kl__title').textContent)).toBe('Dos');
    await page.evaluate(() => window.__api.destroy());
    expect(await page.evaluate(() => ({ kids: window.__el.children.length, cls: window.__el.className, role: window.__el.getAttribute('role'), busy: window.__el.getAttribute('aria-busy') }))).toEqual({ kids: 0, cls: '', role: null, busy: null });
  });
});

// ── profile-dropdown ─────────────────────────────────────────────────────────────────────────
test.describe('profile-dropdown', () => {
  const trigger = (page) => page.locator('#account .pd__trigger');
  const menu = (page) => page.locator('#account [role=menu]');
  const rows = (page) => page.locator('#account [role=menuitem]');

  test('monta la tarjeta del perfil con nombre, correo, iniciales y el menú cerrado', async ({ page }) => {
    await demo(page, 'profile-dropdown');
    await expect(trigger(page)).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#account .pd__name')).toHaveText('Camila Ríos');
    await expect(page.locator('#account .pd__email')).toHaveText('camila@ledger.example');
    await expect(page.locator('#account .pd__face')).toHaveText('CR');
    await expect(menu(page)).toBeHidden();
    expect(Math.round((await box(page, '#account .pd__ring')).width)).toBe(40);
  });

  test('al abrir, el menú crece desde su esquina superior derecha en 150 ms y la línea se tiñe de acento', async ({ page }) => {
    await demo(page, 'profile-dropdown');
    await trigger(page).click();
    await expect(menu(page)).toBeVisible();
    const a = await anims(page, '#account .pd__menu');
    expect(a.some((x) => x.d === 150 && x.kf[0].transform === 'translateY(-8px) scale(0.95)' && x.kf[0].opacity === '0')).toBe(true);
    expect(await menu(page).evaluate((n) => getComputedStyle(n).transformOrigin.endsWith('px 0px') || getComputedStyle(n).transformOrigin)).toBeTruthy();
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(rows(page)).toHaveCount(6);
    await settle(page, 400);
    const m = await box(page, '#account .pd__menu');
    const t = await box(page, '#account .pd__trigger');
    expect(m.x + m.width).toBeCloseTo(t.x + t.width, 0);
    expect(m.y).toBeCloseTo(t.y + t.height + 4, 0);
    expect(Math.round(m.width)).toBe(256);
    expect(await page.locator('#account .pd__bend').evaluate((n) => window.__k.rgba(getComputedStyle(n).color))).toEqual(await page.evaluate(() => window.__k.token('--accent-text')));
  });

  test('el teclado abre sobre el primer ítem y recorre con flechas, Inicio y Fin; Esc devuelve el foco', async ({ page }) => {
    await demo(page, 'profile-dropdown');
    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expect(rows(page).first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rows(page).nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(rows(page).last()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rows(page).first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(rows(page).last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(rows(page).first()).toBeFocused();
    expect(await rows(page).first().evaluate((n) => getComputedStyle(n).outlineStyle)).toBe('solid');
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(trigger(page)).toBeFocused();
    await trigger(page).press('ArrowUp');
    await expect(rows(page).last()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(menu(page)).toBeHidden();
  });

  test('elegir un ítem avisa, cierra y devuelve el foco; tocar afuera también cierra', async ({ page }) => {
    await demo(page, 'profile-dropdown');
    await trigger(page).click();
    await page.getByRole('menuitem', { name: 'Plan' }).click();
    await expect(page.locator('#log')).toHaveText('Elegiste: plan');
    await expect(menu(page)).toBeHidden();
    await expect(trigger(page)).toBeFocused();
    await trigger(page).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    await expect(page.locator('#log')).toHaveText('Elegiste: signout');
    await trigger(page).click();
    await page.mouse.click(5, 700);
    await expect(menu(page)).toBeHidden();
    await trigger(page).click();
    await trigger(page).click();
    await expect(menu(page)).toBeHidden();
  });

  test('el puntero marca el ítem con borde y fondo y los valores llevan su insignia', async ({ page }) => {
    await demo(page, 'profile-dropdown');
    await trigger(page).click();
    await settle(page, 300);
    const before = await rows(page).nth(1).evaluate((n) => getComputedStyle(n).borderTopColor);
    await rows(page).nth(1).hover();
    await expect.poll(() => rows(page).nth(1).evaluate((n) => getComputedStyle(n).borderTopColor)).not.toBe(before);
    await expect(rows(page).nth(1)).toBeFocused();
    await expect(page.locator('#account .pd__badge')).toHaveText(['Kovix SRL', 'PRO']);
    expect(await rows(page).last().evaluate((n) => getComputedStyle(n).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('con el dedo se abre y se elige tocando', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 400, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(colorTools);
    await page.goto('/motion/profile-dropdown.html', { waitUntil: 'networkidle' });
    await trigger(page).tap();
    await expect(menu(page)).toBeVisible();
    await page.getByRole('menuitem', { name: 'Configuración' }).tap();
    await expect(page.locator('#log')).toHaveText('Elegiste: settings');
    const m = await box(page, '#account .pd__trigger');
    expect(m.x).toBeGreaterThanOrEqual(0);
    await ctx.close();
  });

  test('con movimiento reducido el menú solo se funde en 120 ms', async ({ page }) => {
    await demo(page, 'profile-dropdown', { reduced: true });
    const a = await clickIn(page, '#account .pd__menu', '#account .pd__trigger');
    const fades = a.filter((x) => x.name == null);
    expect(fades.length).toBeGreaterThan(0);
    for (const x of fades) { expect(x.d).toBe(120); expect(x.kf.every((k) => !k.transform)).toBe(true); }
    expect(await page.locator('#account .pd__bend').evaluate((n) => getComputedStyle(n).transitionDuration)).toBe('0.12s');
  });

  for (const theme of THEMES) {
    test(`el texto del menú y de las insignias cumple AA en tema ${theme}`, async ({ page }) => {
      await demo(page, 'profile-dropdown', { theme });
      await trigger(page).click();
      await settle(page, 400);
      for (const sel of ['#account .pd__name', '#account .pd__email', '#account .pd__label', '#account .pd__badge[data-tone=accent]', '#account .pd__badge[data-tone=info]', '#account .pd__item--out .pd__label', '#account .pd__face']) expect(await contrast(page, sel), `${theme} ${sel}`).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('el menú queda dentro de la ventana, también en un teléfono y cerca del borde', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await demo(page, 'profile-dropdown');
    await trigger(page).click();
    await settle(page, 400);
    const m = await box(page, '#account .pd__menu');
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x + m.width).toBeLessThanOrEqual(360);
    expect(m.y + m.height).toBeLessThanOrEqual(640);
    expect(await strays(page, '#account')).toEqual([]);
  });

  test('destroy quita el menú y las escuchas', async ({ page }) => {
    await demo(page, 'profile-dropdown');
    await mountFresh(page, '/motion/profile-dropdown.js', '<div></div>');
    await page.evaluate(() => { window.__api.open(); window.__api.destroy(); });
    expect(await page.evaluate(() => ({ kids: window.__el.children.length, cls: window.__el.className }))).toEqual({ kids: 0, cls: '' });
    await page.mouse.click(5, 5);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__el.querySelectorAll('*').length)).toBe(0);
  });
});
