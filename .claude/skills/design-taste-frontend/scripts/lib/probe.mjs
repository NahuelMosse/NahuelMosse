// probe() runs INSIDE the page (it is serialised and evaluated through cdp.mjs), so it must stay
// self-contained: no imports, no closures over module scope.
// It measures what a design reviewer looks at — headline line counts, the type system, colour,
// surfaces, decoration — and the specific tells this skill bans.
export function probe() {
  const W = innerWidth, H = innerHeight, SY = scrollY;
  const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

  // --- colour normalisation (handles oklch(), color(), named colours, etc.)
  const cvs = document.createElement('canvas'); cvs.width = cvs.height = 1;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  const colorCache = new Map();
  const rgba = (c) => {
    if (colorCache.has(c)) return colorCache.get(c);
    ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const v = { r: d[0], g: d[1], b: d[2], a: round(d[3] / 255) };
    colorCache.set(c, v); return v;
  };
  const hex = (v) => '#' + [v.r, v.g, v.b].map((n) => n.toString(16).padStart(2, '0')).join('');
  const lum = (v) => {
    const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(v.r) + 0.7152 * f(v.g) + 0.0722 * f(v.b);
  };
  const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return round((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05), 1); };
  const hsl = (v) => {
    const r = v.r / 255, g = v.g / 255, b = v.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2; let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
    }
    return { h: Math.round(h), s: round(s), l: round(l) };
  };

  // --- monospace detection by measurement, not by font name
  const mctx = document.createElement('canvas').getContext('2d');
  const monoCache = new Map();
  const isMono = (family) => {
    if (monoCache.has(family)) return monoCache.get(family);
    mctx.font = `40px ${family}`;
    const a = mctx.measureText('iiiiiiii').width, b = mctx.measureText('WWWWWWWW').width;
    const v = Math.abs(a - b) < 1;
    monoCache.set(family, v); return v;
  };
  const firstFam = (ff) => ff.split(',')[0].replace(/["']/g, '').trim();
  // Text kept for screen readers only (the usual .sr-only / .visually-hidden patterns) is not on the page.
  const srHidden = (el) => {
    for (let p = el, i = 0; p && p !== document.body && i < 4; p = p.parentElement, i++) {
      const cs = getComputedStyle(p); const r = p.getBoundingClientRect();
      if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || /inset\(50%\)/.test(cs.clipPath) || (r.width <= 2 && r.height <= 2 && cs.overflow !== 'visible')) return true;
    }
    return false;
  };
  const GENERIC = /^(serif|sans-serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|cursive|fantasy|inherit|-apple-system|BlinkMacSystemFont|Segoe UI|Arial|Helvetica|Helvetica Neue|Times New Roman|Times|Georgia|Verdana|Tahoma|Courier New|Courier|Roboto|Apple Color Emoji)$/i;

  // --- collect elements
  const all = [...document.body.querySelectorAll('*')].slice(0, 9000);
  const texts = [];
  const big = [];
  for (const el of all) {
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const area = r.width * r.height;
    if (area >= 60 * 30) big.push({ el, r, cs, area, top: r.top + SY });
    let direct = '';
    for (const n of el.childNodes) if (n.nodeType === 3) direct += n.nodeValue;
    direct = direct.replace(/\s+/g, ' ').trim();
    if (!direct) continue;
    if (tag === 'OPTION' || el.closest('svg') || srHidden(el)) continue;
    const size = parseFloat(cs.fontSize);
    if (!size || size < 6) continue;
    const ls = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) / size;
    const lh = cs.lineHeight === 'normal' ? 1.2 : parseFloat(cs.lineHeight) / size;
    texts.push({
      el, tag, text: direct, chars: direct.length, fam: firstFam(cs.fontFamily), ff: cs.fontFamily,
      size: round(size, 1), weight: +cs.fontWeight || 400, ls: round(ls, 3), lh: round(lh, 2),
      upper: cs.textTransform === 'uppercase' || (direct.length > 2 && direct === direct.toUpperCase() && /[A-Z]{2}/.test(direct)),
      italic: cs.fontStyle === 'italic', align: cs.textAlign, color: cs.color,
      top: r.top + SY, bottom: r.bottom + SY, left: r.left, right: r.right, w: r.width, h: r.height,
      clipText: (cs.webkitBackgroundClip || cs.backgroundClip || '').includes('text'),
      inCode: !!el.closest('pre, code, kbd, samp, textarea'), inUI: !!el.closest('[data-ui]'), textShadow: cs.textShadow !== 'none',
    });
  }

  // --- heading blocks: climb from a large text node to the block that holds the whole headline
  // An element that is a complete text unit by itself: separate links, list items or paragraphs set large
  // are separate lines of content, never the wrapped lines of one headline.
  const UNIT = 'h1, h2, h3, h4, h5, h6, [role="heading"], p, li, a, button, blockquote, dt, dd, figcaption, td, th, label, summary';
  const blockOf = (t) => {
    let cur = t.el;
    // usable as the block when it holds only this size of type (a title with its own small description is not one block)
    const clean = (el) => (el.innerText || '').trim().length <= 320 && !texts.some((o) => o.el !== t.el && el.contains(o.el) && o.size < t.size * 0.72);
    let unit = t.el.closest(UNIT);
    if (unit && unit.matches('a, button')) { const outer = unit.parentElement?.closest('h1, h2, h3, h4, h5, h6, p, blockquote, li'); if (outer && clean(outer)) unit = outer; }
    if (unit && clean(unit)) return unit;
    while (cur.parentElement && cur.parentElement !== document.body) {
      if (cur.matches(UNIT)) break;
      const p = cur.parentElement;
      if (p.matches('ul, ol, dl, nav, menu, table, tbody')) break;
      const inner = (p.innerText || '').trim();
      if (inner.length > 220) break;
      let ok = true;
      for (const o of texts) if (o.el !== t.el && p.contains(o.el) && o.size < t.size * 0.72) { ok = false; break; }
      if (!ok) break;
      cur = p;
    }
    return cur;
  };
  // Count lines from the text itself: inline images or media set inside a sentence are not lines.
  const linesOf = (el, size) => {
    const tops = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue.trim()) continue;
      range.selectNodeContents(node);
      for (const rc of range.getClientRects()) {
        if (rc.width < 1 || rc.height < size * 0.35) continue;
        const mid = rc.top + rc.height / 2;
        if (!tops.some((t) => Math.abs(t - mid) < size * 0.55)) tops.push(mid);
      }
    }
    return Math.max(1, tops.length);
  };
  const describeBlock = (el, t) => {
    const r = el.getBoundingClientRect();
    const text = (el.innerText || t.text).replace(/\s+/g, ' ').trim();
    const cx = (r.left + r.right) / 2 / W;
    const fams = new Set(texts.filter((o) => el.contains(o.el)).map((o) => o.fam + (o.italic ? ' italic' : '')));
    return {
      text: text.slice(0, 200), words: text.split(' ').filter(Boolean).length, chars: text.length,
      lines: linesOf(el, t.size), size: t.size, vw: round((t.size / W) * 100, 1), font: t.fam, weight: t.weight,
      tracking: t.ls, leading: t.lh, upper: t.upper, italic: t.italic, mono: isMono(t.ff),
      align: /center/.test(t.align) ? 'center' : /right|end/.test(t.align) ? 'right' : 'left',
      position: cx < 0.42 ? 'left' : cx > 0.58 ? 'right' : 'center',
      widthRatio: round(r.width / W), top: Math.round(r.top + SY), mixedFonts: fams.size > 1 ? [...fams] : undefined,
      gradientText: texts.some((o) => el.contains(o.el) && o.clipText) || undefined, tag: el.tagName.toLowerCase(),
      // a title (h1–h6, or unmarked large text) or a statement (a paragraph, quotation or list item set large)
      kind: el.closest('h1,h2,h3,h4,h5,h6,[role="heading"]') || el.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]') ? 'heading'
        : t.el.closest('p, blockquote, li, dd, q, figcaption') || text.length > 150 ? 'statement' : 'heading',
    };
  };
  const headingMin = W < 600 ? 22 : Math.max(26, W * 0.019);
  const seenBlocks = new Set();
  const headings = [];
  for (const t of texts.filter((x) => x.size >= headingMin && !x.inCode).sort((a, b) => b.size - a.size)) {
    const blk = blockOf(t);
    if (seenBlocks.has(blk) || [...seenBlocks].some((b) => b.contains(blk) || blk.contains(b))) continue;
    seenBlocks.add(blk);
    const d = describeBlock(blk, t);
    if (d.kind === 'statement' && d.chars > 150 && d.size <= 30) continue; // a lead paragraph, not display type
    headings.push({ ...d, _el: blk });
  }
  headings.sort((a, b) => a.top - b.top);

  // hero headline = largest heading block that starts inside the first viewport
  const inHero = headings.filter((h) => h.top < H * 0.95);
  let hero = inHero.slice().sort((a, b) => b.size - a.size || b.chars - a.chars)[0] || null;
  if (hero) hero.kind = 'heading'; // the main line of the first screen is a headline whatever its tag
  const h1el = document.querySelector('h1');
  if (!hero) {
    // quiet pages: fall back to the h1, then to the largest text in the first viewport
    const h1r = h1el && h1el.getBoundingClientRect();
    const pick = (h1r && h1r.top < H * 0.95 && h1r.width > 0 && texts.find((t) => h1el.contains(t.el))) ||
      texts.filter((t) => t.top - SY < H * 0.95 && t.size >= 18 && t.chars >= 8).sort((a, b) => b.size - a.size)[0];
    if (pick) { const blk = h1el && h1el.contains(pick.el) ? h1el : blockOf(pick); hero = { ...describeBlock(blk, pick), _el: blk }; }
  }
  let h1 = null;
  if (h1el && h1el.getBoundingClientRect().width > 0) {
    const cs = getComputedStyle(h1el); const size = parseFloat(cs.fontSize);
    const text = (h1el.innerText || '').replace(/\s+/g, ' ').trim();
    // Where the ink of the headline sits: centred when its gaps to the viewport edges match, left or right when one gap
    // is clearly wider; a headline that fills the width says nothing.
    const range = document.createRange(); range.selectNodeContents(h1el);
    const ink = [...range.getClientRects()].filter((r) => r.width > 1);
    let align = null;
    if (ink.length) {
      const gl = Math.min(...ink.map((r) => r.left)), gr = innerWidth - Math.max(...ink.map((r) => r.right));
      align = Math.max(gl, gr) < innerWidth * 0.12 ? 'full' : Math.abs(gl - gr) < innerWidth * 0.06 ? 'center' : gl < gr ? 'left' : 'right';
    }
    const letters = text.replace(/[^\p{L}]/gu, '');
    const caps = cs.textTransform === 'uppercase' || cs.fontVariantCaps === 'all-small-caps' || (letters.length > 1 && letters === letters.toUpperCase());
    h1 = { text: text.slice(0, 200), words: text.split(' ').filter(Boolean).length, lines: linesOf(h1el, size), size: round(size, 1), font: firstFam(cs.fontFamily), align, caps };
  }

  // --- eyebrows: a small short label sitting directly above a heading block
  // Sticky and fixed layers overlap other content by design; their geometry says nothing about what labels what.
  const pinned = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) { const pos = getComputedStyle(p).position; if (pos === 'fixed' || pos === 'sticky') return true; } return false; };
  const eyebrows = [];
  for (const h of headings) {
    const hr = h._el.getBoundingClientRect(); const htop = hr.top + SY;
    if (h._el.closest('[data-ui]')) continue;
    const cand = texts.filter((t) => !t.inUI && !h._el.contains(t.el) && t.size <= Math.min(18, h.size * 0.5) && t.chars <= 44 && t.chars >= 2 &&
      t.bottom <= htop + 4 && htop - t.bottom <= Math.min(140, Math.max(72, h.size * 1.1)) && t.right > hr.left - 8 && t.left < hr.right + 8 &&
      !t.el.closest('button') &&
      !t.el.closest('nav, [role="navigation"], footer') && !(t.top < 120 && t.el.closest('header')) && !pinned(t.el) && pinned(h._el) === false)
      .sort((a, b) => b.bottom - a.bottom)[0];
    if (!cand) continue;
    // must be alone on its row (a real paragraph above a heading is not an eyebrow)
    if (texts.some((t) => t !== cand && Math.abs(t.top - cand.top) < 6 && t.chars > 44)) continue;
    // a note that sits closer to the heading above it than to this one belongs to that heading
    const gapDown = htop - cand.bottom;
    if (headings.some((o) => o !== h && !o._el.contains(cand.el) && (() => { const or = o._el.getBoundingClientRect(); const gapUp = cand.top - (or.bottom + SY); return gapUp >= -2 && gapUp < gapDown && or.left < cand.right && or.right > cand.left; })())) continue;
    let pill = false; let p = cand.el;
    for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
      const cs = getComputedStyle(p); const pr = p.getBoundingClientRect();
      if (pr.width < 420 && pr.height < 56 && parseFloat(cs.borderTopLeftRadius) >= 10 && (rgba(cs.backgroundColor).a > 0.04 || parseFloat(cs.borderTopWidth) > 0)) pill = true;
    }
    eyebrows.push({ text: cand.text.slice(0, 50), above: h.text.slice(0, 40), upper: cand.upper, tracked: cand.ls >= 0.04, mono: isMono(cand.ff), pill, size: cand.size, top: Math.round(cand.top) });
  }

  // --- decorative numbering: 01 / 02 / (03) / 04. / 001 / "Step 02"
  const numbered = texts.filter((t) => !t.inCode && !t.inUI && (/^[(\[\/#]?\s?0\d{1,2}\s?[)\]\/.:—–-]?$/.test(t.text) || /^0\d\s?[\/.—–-]\s/.test(t.text) || /^(step|phase|no\.?|n°|nº|chapter|part|fig\.?)\s?0\d{1,2}\b/i.test(t.text)));

  // --- type system
  const famChars = new Map(); const sizeChars = new Map(); let totalChars = 0; let monoChars = 0; let monoProse = 0; const monoFams = new Set(); const monoSamples = [];
  let microLabels = 0; let microLabelChars = 0; let upperChars = 0; let centerChars = 0; const microSamples = [];
  for (const t of texts) {
    totalChars += t.chars;
    famChars.set(t.fam, (famChars.get(t.fam) || 0) + t.chars);
    if (!t.inUI) { const s = Math.round(t.size); sizeChars.set(s, (sizeChars.get(s) || 0) + t.chars); } // interface fragments keep their own sizes
    if (isMono(t.ff)) {
      monoChars += t.chars; monoFams.add(t.fam);
      if (!t.inCode) { monoProse += t.chars; if (monoSamples.length < 6) monoSamples.push(t.text.slice(0, 40)); }
    }
    if (t.size <= 14 && t.upper && t.ls >= 0.05 && !t.inUI && !t.el.closest('nav, button, a[href]')) { microLabels++; microLabelChars += t.chars; if (microSamples.length < 6) microSamples.push(t.text.slice(0, 40)); }
    if (t.upper) upperChars += t.chars;
    if (/center/.test(t.align)) centerChars += t.chars;
  }
  const families = [...famChars.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([family, chars]) => ({ family, share: round(chars / totalChars), mono: isMono(`"${family}", serif`) && isMono(`"${family}", sans-serif`) }));
  const bodyTexts = texts.filter((t) => t.size >= 10 && t.size <= 24 && t.chars >= 60 && !t.inCode && !t.inUI);
  const bodyBy = new Map();
  for (const t of bodyTexts) { const k = t.fam + '|' + Math.round(t.size); bodyBy.set(k, (bodyBy.get(k) || 0) + t.chars); }
  const bodyTop = [...bodyBy.entries()].sort((a, b) => b[1] - a[1])[0];
  const bodySample = bodyTop ? bodyTexts.find((t) => t.fam + '|' + Math.round(t.size) === bodyTop[0]) : null;
  const longest = bodyTexts.slice().sort((a, b) => b.chars - a.chars)[0];
  const sizes = [...sizeChars.entries()].sort((a, b) => a[0] - b[0]).map(([s]) => s);
  const maxText = texts.slice().sort((a, b) => b.size - a.size)[0];
  const smallText = texts.filter((t) => t.size < 13 && t.chars >= 12 && !t.inUI && !t.inCode).length; // interface fragments keep their true sizes
  const loaded = new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '').toLowerCase()));
  const declared = new Set([...document.fonts].map((f) => f.family.replace(/["']/g, '').toLowerCase()));
  const notLoaded = families.map((f) => f.family).filter((f) => !GENERIC.test(f) && !loaded.has(f.toLowerCase()) && (declared.has(f.toLowerCase()) || declared.size > 0));

  // --- colours
  const bodyBg = (() => {
    for (const el of [document.body, document.documentElement]) { const v = rgba(getComputedStyle(el).backgroundColor); if (v.a > 0.5) return v; }
    return { r: 255, g: 255, b: 255, a: 1 };
  })();
  const sectionBgs = [];
  for (const b of big) {
    if (b.area < W * H * 0.3) continue;
    const v = rgba(b.cs.backgroundColor); if (v.a < 0.9) continue;
    const hx = hex(v); if (!sectionBgs.some((s) => s.color === hx)) sectionBgs.push({ color: hx, top: Math.round(b.top), hsl: hsl(v) });
  }
  const textColorChars = new Map();
  for (const t of texts) { const v = rgba(t.color); if (v.a < 0.3) continue; const hx = hex(v); textColorChars.set(hx, (textColorChars.get(hx) || 0) + t.chars); }
  const textColors = [...textColorChars.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([color, c]) => ({ color, share: round(c / totalChars) }));

  // effective background behind an element (null when an image or gradient sits behind it)
  const bgBehind = (el) => {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.backgroundImage !== 'none' || p.tagName === 'VIDEO' || p.tagName === 'CANVAS') return null;
      const v = rgba(cs.backgroundColor); if (v.a >= 0.9) return v;
      if (cs.position === 'absolute' || cs.position === 'fixed') return null; // may overlap media
    }
    return bodyBg;
  };
  // media that may sit behind text without being its ancestor (an absolutely placed hero image, a video layer)
  const mediaRects = big.filter((b) => b.area >= 120 * 80 && (b.el.tagName === 'IMG' || b.el.tagName === 'VIDEO' || b.el.tagName === 'CANVAS' || b.el.tagName === 'PICTURE' || b.el.tagName === 'IFRAME' || b.el.tagName === 'svg' || b.cs.backgroundImage !== 'none')).map((b) => ({ el: b.el, l: b.r.left, r: b.r.right, t: b.r.top + SY, b: b.r.bottom + SY }));
  const overMedia = (t) => {
    const area = Math.max(1, t.w * t.h);
    for (const m of mediaRects) {
      const ox = Math.min(t.right, m.r) - Math.max(t.left, m.l), oy = Math.min(t.bottom, m.b) - Math.max(t.top, m.t);
      if (ox > 0 && oy > 0 && (ox * oy) / area >= 0.25) return true;
    }
    return false;
  };
  const lowContrast = [];
  for (const t of texts) {
    if (t.chars < 4 || t.top - SY > H * 6) continue;
    const fg = rgba(t.color); if (fg.a < 0.99) continue;
    if (overMedia(t)) continue; // cannot know the pixels behind it; judge that from the screenshot
    // text blended with difference or exclusion inverts whatever lies under it; its colour alone says nothing
    let blended = false;
    for (let p = t.el, i = 0; p && p !== document.body && i < 6; p = p.parentElement, i++) if (/difference|exclusion/.test(getComputedStyle(p).mixBlendMode)) { blended = true; break; }
    if (blended) continue;
    const bg = bgBehind(t.el); if (!bg) continue;
    const c = contrast(fg, bg); const need = t.size >= 24 || (t.size >= 18.5 && t.weight >= 700) ? 3 : 4.5;
    if (c < need) lowContrast.push({ text: t.text.slice(0, 40), ratio: c, need, size: t.size, fg: hex(fg), bg: hex(bg) });
  }
  lowContrast.sort((a, b) => a.ratio - b.ratio);

  // --- buttons
  const buttons = [];
  for (const el of document.querySelectorAll('a, button, [role="button"], input[type="submit"]')) {
    const r = el.getBoundingClientRect(); if (r.height < 28 || r.height > 84 || r.width < 64 || r.width > Math.min(W * 0.96, 900)) continue;
    const cs = getComputedStyle(el); let bg = rgba(cs.backgroundColor); const bw = parseFloat(cs.borderTopWidth) || 0;
    const grad = cs.backgroundImage.includes('gradient(');
    if (grad && bg.a < 0.5) { const first = cs.backgroundImage.match(/(rgba?\([^)]+\)|oklch\([^)]+\)|color\([^)]+\)|#[0-9a-f]{3,8})/i); if (first) bg = rgba(first[1]); }
    if (bg.a < 0.5 && bw < 1) continue;
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    buttons.push({
      text: (el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 40), filled: bg.a >= 0.5, bg: bg.a >= 0.5 ? hex(bg) : null, bgHsl: bg.a >= 0.5 ? hsl(bg) : null, fg: hex(rgba(cs.color)),
      radius: rad >= r.height / 2 - 1 ? 'pill' : Math.round(rad), h: Math.round(r.height), top: Math.round(r.top + SY),
      shadow: cs.boxShadow !== 'none' && !/^rgba?\(0, 0, 0, 0\)/.test(cs.boxShadow), gradient: grad, upper: cs.textTransform === 'uppercase', mono: isMono(cs.fontFamily),
    });
  }
  const mode = (arr) => { const m = new Map(); for (const a of arr) m.set(JSON.stringify(a), (m.get(JSON.stringify(a)) || 0) + 1); const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0]; return top ? JSON.parse(top[0]) : undefined; };
  const filledBtns = buttons.filter((b) => b.filled);

  // --- surfaces and decoration
  const isOverlay = (el) => { for (let p = el, i = 0; p && i < 4; p = p.parentElement, i++) { const pos = getComputedStyle(p).position; if (pos === 'fixed' || pos === 'sticky') return true; if (p.matches('dialog, [role="dialog"], [role="menu"], [role="tooltip"], [popover]')) return true; } return false; };
  // real tables, form fields and interface fragments (marked data-ui) keep their own lines
  const formish = (el) => el.matches('input, textarea, select, table, thead, tbody, tr, td, th, hr') || !!el.closest('table, [data-ui]');
  let shadowStatic = 0, shadowOverlay = 0; const shadowSamples = []; let gradients = 0; let scrims = 0; const gradientSamples = []; let gradientText = 0;
  let hairlines = 0; const hairlineSamples = []; let outlinedBoxes = 0; let blurred = 0; let roundedBoxes = 0; let squareMedia = 0; let roundedMedia = 0; const mediaRadii = []; const boxRadii = [];
  let dashed = 0;
  const label = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')).slice(0, 60);
  for (const b of big) {
    const { cs, r, el } = b;
    const sh = cs.boxShadow;
    if (sh !== 'none' && !/^rgba?\(0, 0, 0, 0\) 0px 0px 0px 0px$/.test(sh)) {
      const outer = sh.split(/,(?![^(]*\))/).some((part) => !/inset/.test(part) && !/ 0px 0px 0px 0px/.test(part) && !/rgba\(\d+, \d+, \d+, 0\)/.test(part));
      if (outer) { if (isOverlay(el) || el.closest('[data-ui]')) shadowOverlay++; else { shadowStatic++; if (shadowSamples.length < 4) shadowSamples.push(label(el) + ' → ' + sh.slice(0, 80)); } }
    }
    if (cs.backgroundImage.includes('gradient(')) {
      if ((cs.webkitBackgroundClip || cs.backgroundClip || '').includes('text')) {
        // a heading shaded along the lightness of one hue (white to grey) is a designed choice; several hues, or body text, is the tell
        const stops = [...cs.backgroundImage.matchAll(/rgba?\(([^)]+)\)/g)].map((mm) => mm[1].split(/[,\s/]+/).filter(Boolean).map(Number));
        const hue = ([r0, g0, b0]) => { const [r1, g1, b1] = [r0, g0, b0].map((v) => v / 255); const mx = Math.max(r1, g1, b1), d = mx - Math.min(r1, g1, b1); if (!d) return 0; const h = mx === r1 ? ((g1 - b1) / d) % 6 : mx === g1 ? (b1 - r1) / d + 2 : (r1 - g1) / d + 4; return (h * 60 + 360) % 360; };
        const tinted = stops.filter((c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) > 14).map(hue);
        const oneHue = stops.length > 1 && !/oklch|oklab|color\(|lab\(|lch\(|hsl/.test(cs.backgroundImage) && tinted.every((h) => Math.min(Math.abs(h - tinted[0]), 360 - Math.abs(h - tinted[0])) <= 25);
        const heading = el.matches('h1, h2') || parseFloat(cs.fontSize) >= 32;
        if (!(oneHue && heading)) gradientText++;
      }
      else if (b.area >= W * H * 0.02) {
        // neutral stops with changing alpha = a legibility scrim over media, not decoration
        const stops = [...cs.backgroundImage.matchAll(/rgba?\(([^)]+)\)/g)].map((mm) => mm[1].split(/[,\s/]+/).filter(Boolean).map(Number));
        const exotic = /oklch|oklab|color\(|lab\(|lch\(|hsl/.test(cs.backgroundImage);
        const scrim = !exotic && stops.length > 0 && stops.every((c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) <= 14) && stops.some((c) => c.length > 3 && c[3] < 1);
        if (scrim) scrims++; else { gradients++; if (gradientSamples.length < 4) gradientSamples.push(label(el) + ' → ' + cs.backgroundImage.slice(0, 110)); }
      }
    }
    if ((cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none')) blurred++;
    const bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0, bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
    const thin = (w, c, style) => w > 0 && w <= 1.5 && style !== 'none' && rgba(c).a > 0.02;
    const topLine = thin(bt, cs.borderTopColor, cs.borderTopStyle), botLine = thin(bb, cs.borderBottomColor, cs.borderBottomStyle);
    const leftLine = thin(bl, cs.borderLeftColor, cs.borderLeftStyle), rightLine = thin(br, cs.borderRightColor, cs.borderRightStyle);
    if (!formish(el)) {
      if (topLine && botLine && leftLine && rightLine) { if (r.width >= 150 && r.height >= 80) outlinedBoxes++; }
      else if ((r.width >= 240 && (topLine || botLine)) || (r.height >= 240 && (leftLine || rightLine))) { hairlines++; if (hairlineSamples.length < 5) hairlineSamples.push(label(el) + ' ' + Math.round(r.width) + 'px'); }
      // thin dashed or dotted lines; a heavy dotted edge (3px or more) is a drawn perforation, not a hairline
      if ([[cs.borderTopStyle, bt], [cs.borderBottomStyle, bb], [cs.borderLeftStyle, bl], [cs.borderRightStyle, br]].some(([st, w]) => /dashed|dotted/.test(st) && w > 0 && w < 3)) dashed++;
    }
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    const isMedia = el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'CANVAS' || /url\(/.test(cs.backgroundImage);
    if (isMedia && r.width >= 200 && r.height >= 140) {
      let effective = rad; let p = el.parentElement;
      for (let i = 0; i < 3 && p && effective === 0; i++, p = p.parentElement) { const pcs = getComputedStyle(p); if (pcs.overflow !== 'visible') effective = parseFloat(pcs.borderTopLeftRadius) || 0; }
      if (effective > 1) { roundedMedia++; mediaRadii.push(Math.round(effective)); } else squareMedia++;
    } else if (rad >= 6 && r.width >= 150 && r.height >= 80 && (rgba(cs.backgroundColor).a > 0.04 || bt > 0)) { roundedBoxes++; boxRadii.push(Math.round(Math.min(rad, 99))); }
  }
  // elements that are themselves a thin rule (1px tall or 1px wide)
  for (const el of all) {
    const r = el.getBoundingClientRect();
    const horiz = r.height > 0 && r.height <= 1.5 && r.width >= 160, vert = r.width > 0 && r.width <= 1.5 && r.height >= 160;
    if (!horiz && !vert) continue; if (formish(el) && (el.tagName !== 'HR' || el.closest('[data-ui]'))) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.03) continue;
    if (rgba(cs.backgroundColor).a > 0.02 || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0 || cs.backgroundImage !== 'none') { hairlines++; if (hairlineSamples.length < 5) hairlineSamples.push(label(el) + ' ' + Math.round(Math.max(r.width, r.height)) + 'px rule'); }
  }

  // --- repeated card rows (three or more same-size boxed siblings)
  const cardRows = [];
  const seenParents = new Set();
  for (const b of big) {
    const p = b.el.parentElement; if (!p || seenParents.has(p)) continue; seenParents.add(p);
    // cards carry text; a row of photographs or media tiles is not a card row
    const kids = [...p.children].filter((k) => { const r = k.getBoundingClientRect(); return r.width >= 150 && r.width < W * 0.9 && r.height >= 90 && !k.matches('img, picture, video, canvas, svg, figure:not(:has(figcaption))') && (k.innerText || '').trim().length >= 12; }); // full-width bands are sections, not cards
    if (kids.length < 3) continue;
    const boxed = kids.filter((k) => { const cs = getComputedStyle(k); return (rgba(cs.backgroundColor).a > 0.04 || parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== 'none') && true; });
    if (boxed.length < 3) continue;
    const w0 = boxed[0].getBoundingClientRect().width;
    const same = boxed.filter((k) => Math.abs(k.getBoundingClientRect().width - w0) < 3);
    if (same.length < 3) continue;
    const iconTop = same.filter((k) => { const first = k.querySelector('svg, img, i, [class*="icon" i]'); if (!first) return false; const r = first.getBoundingClientRect(); return r.width > 0 && r.width <= 64 && r.height <= 64; }).length;
    cardRows.push({ count: same.length, iconTopped: iconTop >= same.length - 1 && iconTop >= 3, rounded: (parseFloat(getComputedStyle(same[0]).borderTopLeftRadius) || 0) >= 6, top: Math.round(same[0].getBoundingClientRect().top + SY) });
  }

  // --- craft tells, with the thresholds of the impeccable detector (Apache 2.0)
  const notContent = (el) => formish(el) || !!el.closest('[data-ui], nav, svg, button') || el.matches('img, video, canvas, picture, iframe');
  const groundOf = (el) => bgBehind(el) || bodyBg;
  const ownFill = (el, cs) => { const v = rgba(cs.backgroundColor); return v.a > 0.04 && hex(v) !== hex(groundOf(el.parentElement || document.body)); };
  const outlined = (cs) => (parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== 'none' && rgba(cs.borderTopColor).a > 0.1) || (cs.boxShadow !== 'none' && !/^rgba\(0, 0, 0, 0\)/.test(cs.boxShadow));
  const rounded = (cs) => ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].some((k) => (parseFloat(cs[k]) || 0) > 0);
  // a coloured stripe on one side of a rounded box: a top, left or right border of 2–12px while the others are hairlines or none
  const sideTabs = [];
  for (const { el, cs, r } of big) {
    if (notContent(el) || r.width < 120 || !rounded(cs) || (el.innerText || '').trim().length < 12) continue;
    const side = (s) => { const w = parseFloat(cs[`border${s}Width`]) || 0; return { s, w, on: w > 0 && cs[`border${s}Style`] !== 'none' && rgba(cs[`border${s}Color`]).a > 0.3 }; };
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map(side);
    const thick = sides.filter((x) => x.on && x.w >= 2);
    if (thick.length !== 1 || thick[0].s === 'Bottom' || thick[0].w > 12 || sides.some((x) => x !== thick[0] && x.on && x.w > 1.5)) continue;
    sideTabs.push(`${label(el)} (${thick[0].s.toLowerCase()} ${Math.round(thick[0].w)}px)`);
  }
  // a card inside a card: a rounded box with a border or a shadow inside another drawn box (a fill-only tile inside is not counted)
  const cardish = (el, cs, r) => r.width >= 150 && r.height >= 80 && r.width < W * 0.9 && (parseFloat(cs.borderTopLeftRadius) || 0) >= 6 && !notContent(el);
  const outerCards = big.filter(({ el, cs, r }) => cardish(el, cs, r) && (ownFill(el, cs) || outlined(cs)) && !el.matches('dialog, [role="dialog"]')).map((b) => b.el);
  const nestedCards = big.filter(({ el, cs, r }) => cardish(el, cs, r) && outlined(cs) && outerCards.some((o) => o !== el && o.contains(el))).map((b) => label(b.el));
  // type set against how text reads: running text with tight leading or wide tracking, long uppercase, letters crushed together
  const prose = texts.filter((t) => t.chars >= 60 && t.size >= 12 && t.size <= 24 && !t.inCode && !t.inUI && !t.el.closest('button, nav'));
  const sample = (t, v) => `"${t.text.slice(0, 32)}" ${v}`;
  const tightLeading = prose.filter((t) => t.h >= t.size * t.lh * 1.8 && t.lh < 1.3).map((t) => sample(t, `${t.lh}×`));
  const wideTracking = prose.filter((t) => !t.upper && t.ls > 0.05).map((t) => sample(t, `${t.ls}em`));
  const capsBody = texts.filter((t) => t.upper && t.chars >= 80 && !t.inCode && !t.inUI).map((t) => sample(t, `${t.chars} chars`));
  const crushed = texts.filter((t) => t.chars >= 3 && !t.inCode && t.ls < (t.size >= 40 ? -0.09 : -0.07)).map((t) => sample(t, `${t.ls}em at ${t.size}px`));
  // heading levels that skip a step (h2 then h4): the outline screen readers walk has a hole
  const skippedHeadings = []; let prevLevel = 0;
  for (const h of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const r = h.getBoundingClientRect(); if (!r.width && !r.height) continue;
    const lvl = +h.tagName[1];
    if (prevLevel && lvl > prevLevel + 1) skippedHeadings.push(`h${prevLevel} → h${lvl} "${(h.innerText || '').trim().slice(0, 32)}"`);
    prevLevel = lvl;
  }
  // the name of a working file shown to visitors («credits in CREDITS.md»): the build's notes leaked into the page. Code
  // samples do not count, nor `.js`, which ends product names (Next.js).
  const fileNames = new Set(); const fileWalk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = fileWalk.nextNode()) && fileNames.size < 6;) {
    const p = n.parentElement;
    if (!p || p.closest('code, pre, kbd, samp, script, style, noscript, template, [hidden], [aria-hidden="true"]') || !p.getClientRects().length) continue;
    for (const f of n.data.matchAll(/\b[\w-]+\.(?:md|mdx|json|mjs|cjs|tsx?|jsx|ya?ml|env|log)\b/gi)) fileNames.add(f[0]);
  }
  // text pressed against the inside of its own box: under max(8px, half the font size) beside it, or max(4px, 0.3×) above and below
  const surface = (el, cs) => ownFill(el, cs) || outlined(cs);
  const textBox = new Map(); const rng = document.createRange();
  const glyphs = (t) => { if (!textBox.has(t)) { rng.selectNodeContents(t.el); textBox.set(t, rng.getBoundingClientRect()); } return textBox.get(t); };
  const cramped = [];
  for (const { el, cs, r } of big) {
    if (r.width < 120 || r.height < 40 || r.width >= W * 0.9 || notContent(el) || !surface(el, cs)) continue;
    let worst = null;
    for (const t of texts) {
      // display type and decorative letters are placed as shapes; the inset rule is for text that is read
      if (t.inUI || t.size > 32 || t.el.closest('[aria-hidden="true"]') || !el.contains(t.el)) continue;
      let inner = false;
      for (let p = t.el; p && p !== el; p = p.parentElement) { if (surface(p, getComputedStyle(p))) { inner = true; break; } }
      if (inner) continue;
      const g = glyphs(t);
      const h = Math.min(g.left - r.left, r.right - g.right), v = Math.min(g.top - r.top, r.bottom - g.bottom);
      if (h < -2 || v < -2) continue;
      const hNeed = Math.max(8, t.size * 0.5), vNeed = Math.max(4, t.size * 0.3);
      if (h < hNeed || v < vNeed) { worst = h < hNeed ? `${Math.round(h)}px beside "${t.text.slice(0, 24)}"` : `${Math.round(v)}px above or below "${t.text.slice(0, 24)}"`; break; }
    }
    if (worst) cramped.push(`${label(el)}: ${worst}`);
  }
  // a neutral grey ink set on a strong colour: the grey reads dirty, a tint of the ground reads as part of it
  const greyOnColour = [];
  for (const t of texts) {
    if (t.chars < 4 || t.inCode || t.inUI) continue;
    const fg = rgba(t.color); if (fg.a < 0.5) continue;
    const f = hsl(fg); if (f.s > 0.25 || f.l < 0.3 || f.l > 0.8) continue;
    const bg = bgBehind(t.el); if (!bg) continue;
    const b = hsl(bg); if (b.s < 0.3 || b.l < 0.2 || b.l > 0.85) continue;
    greyOnColour.push(`"${t.text.slice(0, 28)}" ${hex(fg)} on ${hex(bg)}`);
  }
  // justified text in a column of 45 characters or fewer (width / (0.5 × font size)) without hyphens: auto, over two lines or more;
  // scripts that do not stretch word spaces (CJK, Thai, Arabic) are exempt
  const NO_WORD_SPACES = /[؀-ۿݐ-ݿࢠ-ࣿ฀-๿ᄀ-ᇿ⺀-鿿ꥠ-꥿가-퟿豈-﫿ﭐ-﷿ﹰ-﻿ｦ-ﾟ]/;
  const justified = [];
  for (const t of texts) {
    if (t.inCode || t.inUI || t.align !== 'justify' || t.chars < 20) continue;
    const cs = getComputedStyle(t.el);
    if ((cs.hyphens || cs.webkitHyphens) === 'auto') continue;
    const letters = [...t.text.slice(0, 400)].filter((ch) => /\p{L}/u.test(ch));
    if (letters.filter((ch) => NO_WORD_SPACES.test(ch)).length > letters.length / 2) continue;
    const measure = t.w - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    if (measure > 0 && measure / (t.size * 0.5) <= 45 && t.h >= t.size * t.lh * 1.8) justified.push(sample(t, `${Math.round(measure / (t.size * 0.5))} chars a line`));
  }
  // an h1 of 72px or more with 40 characters or more that takes 28% of the viewport height or 25% of its area
  const oversizedH1 = [];
  for (const h of document.querySelectorAll('h1')) {
    const r = h.getBoundingClientRect(); const text = (h.innerText || '').trim();
    if (r.width < 1 || r.height < 1 || getComputedStyle(h).visibility === 'hidden') continue;
    const px = parseFloat(getComputedStyle(h).fontSize);
    if (px >= 72 && text.length >= 40 && (r.height / H >= 0.28 || (r.width * r.height) / (W * H) >= 0.25)) oversizedH1.push(`"${text.slice(0, 40)}" ${Math.round(px)}px, ${Math.round(r.height / H * 100)}vh`);
  }
  // hairline-and-tile grids and repeating stripes painted as a background (the element or its ::before / ::after)
  const HAIRLINE = /\b\d{1,3}(?:\.\d+)?px\s*,\s*(?:transparent|rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\))\s+\d{1,3}(?:\.\d+)?px|(?:transparent|rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\))\s+calc\(100%\s*-\s*\d{1,3}(?:\.\d+)?px\)/g;
  const stripeKind = (cs) => {
    const img = `${cs.backgroundImage} ${cs.maskImage || ''} ${cs.webkitMaskImage || ''}`;
    for (const m of img.matchAll(/repeating-(?:linear|radial|conic)-gradient\(/g)) {
      let depth = 1, i = m.index + m[0].length; const start = i;
      for (; i < img.length && depth; i++) { if (img[i] === '(') depth++; else if (img[i] === ')') depth--; }
      const stops = img.slice(start, i - 1).split(/,(?![^(]*\))/).map((s) => s.trim());
      const last = stops[stops.length - 1].split(/\s+(?![^(]*\))/);
      // a ramp that ends at the full length draws once across the box: a faceted fill, not stripes
      if (!(last.length === 1 || /^(100%|360deg|1turn)$/.test(last[last.length - 1]))) return 'stripes';
    }
    const hairlines = (cs.backgroundImage.match(HAIRLINE) || []).length;
    if (hairlines >= 2 && /\d(px)/.test(cs.backgroundSize)) return 'grid';
    return null;
  };
  const stripeGrid = [];
  for (const el of all) {
    if (stripeGrid.length >= 6 || el.closest('[data-ui]') || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    for (const pseudo of [null, '::before', '::after']) {
      const kind = stripeKind(getComputedStyle(el, pseudo));
      if (kind) { stripeGrid.push(`${label(el)}${pseudo || ''} (${kind})`); break; }
    }
  }
  // cards in a row that scrolls sideways, resting with a card against the row's edge and no gutter around it
  const edgeFlush = [];
  const scrolls = (cs) => /auto|scroll/.test(cs.overflowX);
  for (const sc of all) {
    if (edgeFlush.length >= 4 || sc === document.body || !scrolls(getComputedStyle(sc))) continue;
    const sr = sc.getBoundingClientRect();
    if (sc.scrollWidth <= sc.clientWidth + 8 || sc.scrollLeft > 4 || sr.width < 120 || sr.height < 60 || sr.top + SY > 2 * H) continue;
    const scs = getComputedStyle(sc);
    const paints = rgba(scs.backgroundColor).a > 0 || scs.backgroundImage !== 'none' || ['Left', 'Right'].some((s) => parseFloat(scs[`border${s}Width`]) > 0);
    const inLeft = paints ? 0 : Math.max(0, sr.left), inRight = paints ? 0 : Math.max(0, W - sr.right);
    const gutter = (v) => v >= 12 && v <= 48;
    const contentLeft = sr.left + sc.clientLeft, contentRight = contentLeft + sc.clientWidth;
    let firstRight = Infinity, lastLeft = -Infinity, worst = null, count = 0;
    for (const card of sc.querySelectorAll('*')) {
      const owner = (() => { for (let p = card.parentElement; p; p = p.parentElement) if (p === sc || scrolls(getComputedStyle(p))) return p; return null; })();
      if (owner !== sc || card.matches('td, th, tr, thead, tbody, tfoot, caption, colgroup, col')) continue;
      const r = card.getBoundingClientRect(); const cs = getComputedStyle(card);
      if (r.width < 80 || r.height < 40 || cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (!(rgba(cs.backgroundColor).a > 0.5 || ['Top', 'Right', 'Bottom', 'Left'].filter((s) => parseFloat(cs[`border${s}Width`]) > 0).length >= 2)) continue;
      firstRight = Math.min(firstRight, r.right); lastLeft = Math.max(lastLeft, r.left);
      const leftGap = r.left - contentLeft, rightGap = contentRight - r.right;
      const flushRight = leftGap >= 6 && rightGap < 8 && rightGap > -24 && !(rightGap >= 0 && gutter(inRight));
      const flushLeft = rightGap >= 6 && leftGap < 8 && leftGap > -24 && !(leftGap >= 0 && gutter(inLeft));
      if (!flushRight && !flushLeft) continue;
      count++; const gap = Math.round(flushRight ? rightGap : leftGap);
      if (!worst || gap < worst.gap) worst = { gap, edge: flushRight ? 'right' : 'left', card };
    }
    // one card, or cards stacked in a column, is not a row that scrolls past an edge
    if (count && firstRight <= lastLeft + 1) edgeFlush.push(`${label(sc)}: ${count} card(s) flush against the ${worst.edge} edge (${worst.gap}px, e.g. ${label(worst.card)})`);
  }
  // a clipping box (overflow hidden or clip) that cuts a menu, listbox, tooltip or popover positioned out of it
  const clippedLayers = [];
  const POPOVER = '[popover], dialog[open], [role="dialog"], [role="listbox"], [role="menu"], [role="menubar"], [role="tooltip"]';
  const clipsAxis = (cs) => { const ov = (v) => /hidden|clip/.test(v); const sc = /auto|scroll/.test(`${cs.overflow} ${cs.overflowX} ${cs.overflowY}`); return sc ? null : { x: ov(cs.overflowX) || ov(cs.overflow), y: ov(cs.overflowY) || ov(cs.overflow) }; };
  for (const layer of document.querySelectorAll(POPOVER)) {
    if (clippedLayers.length >= 4 || getComputedStyle(layer).position !== 'absolute' || layer.matches(':modal')) continue;
    const lr = layer.getBoundingClientRect(); if (lr.width < 1 || lr.height < 1) continue;
    for (let p = layer.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const ax = clipsAxis(getComputedStyle(p)); if (!ax || (!ax.x && !ax.y)) continue;
      const pr = p.getBoundingClientRect(); if (pr.width <= 0 || pr.height <= 0) continue;
      // the nearest clipping box is the one that cuts the layer; a carousel or ticker window cuts on purpose
      if (!/carousel|slider|swiper|marquee|ticker|viewport|track/i.test(`${p.className} ${p.id}`) && ((ax.x && (lr.left < pr.left - 2 || lr.right > pr.right + 2)) || (ax.y && (lr.top < pr.top - 2 || lr.bottom > pr.bottom + 2)))) clippedLayers.push(`${label(p)} clips ${label(layer)}`);
      break;
    }
  }

  // --- spacing and rhythm (Gestalt proximity): a heading sits closer to what it introduces than to what came before
  const readable = texts.filter((t) => !t.inUI && !t.el.closest('nav, header, footer, button, [aria-hidden="true"]'));
  const headingRhythm = []; let rhythmMeasured = 0;
  for (const h of document.querySelectorAll('h2, h3, h4')) {
    if (h.closest('nav, header, footer, [data-ui], button, [aria-hidden="true"]')) continue;
    const r = h.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const top = r.top + SY, bottom = r.bottom + SY;
    let above = Infinity, below = Infinity;
    for (const t of readable) {
      if (h.contains(t.el) || t.el.contains(h) || t.right <= r.left || t.left >= r.right) continue;
      if (t.bottom <= top + 1) above = Math.min(above, top - t.bottom);
      else if (t.top >= bottom - 1) below = Math.min(below, t.top - bottom);
    }
    if (!isFinite(above) || !isFinite(below) || below > 160) continue;
    rhythmMeasured++;
    if (above <= below + 2) headingRhythm.push(`"${(h.innerText || '').trim().slice(0, 28)}" ${Math.round(above)}px above, ${Math.round(below)}px below`);
  }
  // one gap everywhere is no rhythm: the gap each stack of blocks uses, counted once per stack
  const stackGaps = [];
  for (const p of all) {
    if (p.closest('[data-ui], nav, svg') || formish(p)) continue;
    const kids = [...p.children].filter((k) => { const r = k.getBoundingClientRect(); const cs = getComputedStyle(k); return r.width > 0 && r.height > 0 && !/absolute|fixed/.test(cs.position) && !/inline/.test(cs.display); });
    if (kids.length < 2) continue;
    const gaps = new Set();
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect();
      if (b.top >= a.bottom - 1 && b.left < a.right && b.right > a.left) { const g = Math.round(b.top - a.bottom); if (g >= 4) gaps.add(Math.round(g / 4) * 4); }
    }
    stackGaps.push(...gaps);
  }
  const gapCount = new Map(); for (const g of stackGaps) gapCount.set(g, (gapCount.get(g) || 0) + 1);
  const topGap = [...gapCount.entries()].sort((a, b) => b[1] - a[1])[0];
  const monotonous = stackGaps.length >= 10 && topGap && topGap[1] / stackGaps.length >= 0.8 ? { gap: topGap[0], share: round(topGap[1] / stackGaps.length) } : null;
  // two text sizes so close they read as a mistake rather than a step (16 and 17, 32 and 34)
  // from the body up: interface labels at 12–15px step by a pixel on purpose
  const usedSizes = [...sizeChars.entries()].filter(([s, c]) => s >= 16 && c >= 40).map(([s]) => s).sort((a, b) => a - b);
  const nearSizes = []; for (let i = 1; i < usedSizes.length; i++) if (usedSizes[i] / usedSizes[i - 1] < 1.08) nearSizes.push(`${usedSizes[i - 1]}/${usedSizes[i]}px`);
  // a heading whose last line holds a single short word (text-wrap: balance prevents it)
  const headingTop = Math.max(0, ...[...document.querySelectorAll('h1, h2, h3')].filter((h) => h.getBoundingClientRect().height > 2 && h.textContent.trim()).map((h) => parseFloat(getComputedStyle(h).fontSize)));
  const orphans = [];
  for (const h of document.querySelectorAll('h1, h2, h3')) {
    const cs = getComputedStyle(h); if (/balance|pretty/.test(cs.textWrap || cs.textWrapStyle || '') || h.closest('[aria-hidden="true"]')) continue;
    // lines set by hand (a <br>, a block per line or per letter) are the author's, not the browser's
    if (h.querySelector('br') || [...h.querySelectorAll('*')].some((k) => !/^inline/.test(getComputedStyle(k).display))) continue;
    const words = (h.innerText || '').trim().split(/\s+/); if (words.length < 4) continue;
    rng.selectNodeContents(h); const lines = new Map();
    for (const q of rng.getClientRects()) { if (q.width < 1) continue; const k = Math.round(q.top / 4); const l = lines.get(k) || { left: q.left, right: q.right }; l.left = Math.min(l.left, q.left); l.right = Math.max(l.right, q.right); lines.set(k, l); }
    const ws = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l.right - l.left);
    if (ws.length >= 2 && ws[ws.length - 1] < Math.max(...ws) * 0.2) orphans.push(`"${(h.innerText || '').trim().slice(0, 36)}"`);
  }
  // touch targets on a phone: under 24×24 with a neighbour closer than 24px fails WCAG 2.5.8; controls under 44px are hard to hit
  const targets = { small: [], short: [] };
  if (W < 600) {
    const hits = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role="button"], [role="link"]')].filter((el) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || el.closest('[data-ui], [aria-hidden="true"], [inert]')) return false;
      // a picture of an app scaled down with a transform is an illustration, not controls to press
      if (el.offsetHeight && (r.height < el.offsetHeight * 0.9 || r.width < el.offsetWidth * 0.9)) return false;
      // a link inside a sentence is exempt (WCAG 2.5.8, inline)
      return !(el.matches('a') && /inline/.test(cs.display) && el.parentElement && el.parentElement.matches('p, li, span, td, dd, label, small'));
    }).map((el) => { const r = el.getBoundingClientRect(); return { el, r, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });
    for (const t of hits) {
      const name = `${t.el.tagName.toLowerCase()} «${(t.el.innerText || t.el.value || t.el.getAttribute('aria-label') || '').trim().slice(0, 20)}» ${Math.round(t.r.width)}×${Math.round(t.r.height)}`;
      if ((t.r.width < 24 || t.r.height < 24) && hits.some((o) => o !== t && !o.el.contains(t.el) && !t.el.contains(o.el) && Math.hypot(o.cx - t.cx, o.cy - t.cy) < 24)) targets.small.push(name);
      else if (t.el.matches('button, input, select, [role="button"]') && t.r.height < 44 && !t.el.matches('input[type=checkbox], input[type=radio]')) targets.short.push(name);
    }
  }

  // --- findability (Google Search Central, ogp.me, web.dev): what a public page needs in its head and its images
  const meta = (sel) => (document.head && document.head.querySelector(sel)?.getAttribute('content') || '').trim();
  const firstScreenImg = (i) => { const r = i.getBoundingClientRect(); return r.top + SY < H && r.width * r.height >= W * H * 0.08; };
  const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden'; };
  const GENERIC_LINK = /^(click here|here|learn more|read more|more|this|go|start|link|continue|aquí|acá|click aquí|clic aquí|haga clic aquí|leer más|ver más|más|saber más|más información|este enlace|continuar)$/i;
  const seo = {
    title: (document.title || '').trim(),
    description: meta('meta[name="description" i]'),
    lang: document.documentElement.getAttribute('lang') || '',
    viewport: meta('meta[name="viewport" i]'),
    robots: meta('meta[name="robots" i]'),
    canonical: [...document.querySelectorAll('link[rel="canonical" i]')].map((l) => l.getAttribute('href') || ''),
    ogMissing: ['og:title', 'og:type', 'og:image', 'og:url'].filter((p) => !meta(`meta[property="${p}"]`)),
    twitterCard: meta('meta[name="twitter:card" i]'),
    jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => { try { const j = JSON.parse(s.textContent); const items = Array.isArray(j) ? j : j['@graph'] || [j]; return items.every((i) => i && i['@type']) ? 'ok' : 'without @type'; } catch { return 'not valid JSON'; } }),
    imgNoAlt: [...document.images].filter((i) => shown(i) && !i.hasAttribute('alt') && !i.closest('[aria-hidden="true"]')).map((i) => (i.currentSrc || i.src || '').split('/').pop().slice(0, 40)).slice(0, 6),
    // a picture with no reserved box makes the page jump while it loads (CLS)
    imgNoSize: [...document.querySelectorAll('img, video, iframe')].filter((i) => { if (!shown(i) || i.getBoundingClientRect().width < 32) return false; const cs = getComputedStyle(i); return !(i.getAttribute('width') && i.getAttribute('height')) && cs.aspectRatio === 'auto' && !/absolute|fixed/.test(cs.position); }).map((i) => (i.currentSrc || i.src || i.tagName).split('/').pop().slice(0, 40)).slice(0, 6),
    lazyHero: [...document.images].filter((i) => i.loading === 'lazy' && shown(i) && firstScreenImg(i)).map((i) => (i.currentSrc || i.src).split('/').pop().slice(0, 40)),
    genericLinks: [...new Set([...document.querySelectorAll('a[href]')].filter((a) => shown(a) && !a.getAttribute('aria-label') && GENERIC_LINK.test((a.innerText || '').replace(/[→›»>]/g, '').trim())).map((a) => (a.innerText || '').trim()))].slice(0, 6),
  };

  // --- hero media
  const heroMedia = [];
  for (const b of big) {
    const { el, r, cs } = b; if (r.top > H * 0.9 || r.bottom < 0) continue;
    const type = el.tagName === 'IMG' ? 'img' : el.tagName === 'VIDEO' ? 'video' : el.tagName === 'CANVAS' ? 'canvas' : el.tagName === 'svg' && r.width > 240 ? 'svg' : /url\(/.test(cs.backgroundImage) ? 'bg-image' : el.tagName === 'IFRAME' ? 'iframe' : null;
    if (!type) continue;
    const vw = Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)), vh = Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0));
    const ratio = (vw * vh) / (W * H); if (ratio >= 0.08) heroMedia.push({ type, ratio: round(ratio) });
  }
  heroMedia.sort((a, b) => b.ratio - a.ratio);
  const brokenImages = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().width > 0 && (i.currentSrc || i.src)).map((i) => (i.currentSrc || i.src).slice(0, 120)).slice(0, 8);

  // --- navigation
  const navEl = document.querySelector('header nav, nav, header, [role="navigation"]');
  let nav = null;
  if (navEl) {
    let host = navEl; let fixed = false; let p = navEl;
    for (let i = 0; i < 4 && p && p !== document.body; i++, p = p.parentElement) { const pos = getComputedStyle(p).position; if (pos === 'fixed' || pos === 'sticky') { fixed = true; host = p; break; } }
    const hr = host.getBoundingClientRect(); const hcs = getComputedStyle(host);
    const links = [...navEl.querySelectorAll('a')].filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.top < 140; });
    nav = { links: links.length, fixed, height: Math.round(hr.height), floatingPill: hr.width < W * 0.92 && parseFloat(hcs.borderTopLeftRadius) >= 16 && hr.top > 4, blur: (hcs.backdropFilter || 'none') !== 'none' };
  }

  // data-ui is for cropped interface fragments, not for wrapping the page
  const uiAbuse = [...document.querySelectorAll('[data-ui]')].some((el) => el.querySelector('h1') || el.getBoundingClientRect().height > H * 1.6 || el === document.body);
  const uiFragments = document.querySelectorAll('[data-ui]').length;
  // pictures that were not drawn by the page's own code: photographs, footage, raster artwork.
  // Inline SVG and .svg files do not count; cropped interface fragments (data-ui) are counted apart.
  const svgSrc = (u) => /\.svg(\?|#|$)|^data:image\/svg/i.test(u || '');
  let realPictures = 0, videoCount = 0, widestPicture = 0; const pictureSamples = [];
  for (const el of all) {
    if (el.closest('[data-ui]') || el.closest('svg')) continue;
    const r = el.getBoundingClientRect(); if (r.width < 120 || r.height < 90 || r.width * r.height < 160 * 120) continue;
    if (el.tagName === 'IMG') {
      const src = el.currentSrc || el.src;
      if (el.naturalWidth > 0 && !svgSrc(src)) { realPictures++; widestPicture = Math.max(widestPicture, r.width / W); if (pictureSamples.length < 8) pictureSamples.push(src.split('/').pop().slice(0, 48)); }
      continue;
    }
    if (el.tagName === 'VIDEO') { realPictures++; videoCount++; widestPicture = Math.max(widestPicture, r.width / W); continue; }
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg.includes('url(')) { const u = (bg.match(/url\(["']?([^"')]+)/) || [])[1]; if (!svgSrc(u)) realPictures++; }
  }
  const uiPictures = [...document.querySelectorAll('[data-ui]')].filter((el) => { const r = el.getBoundingClientRect(); return r.width >= 300 && r.height >= 200; }).length;
  // which elements push the page wider than the viewport (the deepest ones that are not clipped by an ancestor)
  let overflowCulprits = [];
  if (document.documentElement.scrollWidth > W + 2) {
    const clippedByAncestor = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { if (getComputedStyle(p).overflowX !== 'visible' && p.getBoundingClientRect().right <= W + 2) return true; } return false; };
    const wide = all.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > W + 2 && !clippedByAncestor(el); });
    overflowCulprits = wide.filter((el) => !wide.some((o) => o !== el && el.contains(o))).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : ''} (+${Math.round(el.getBoundingClientRect().right - W)}px)`);
  }
  // rows that scroll sideways with content past their edge (read as clipped in screenshots and by most visitors)
  const sideScrollers = all.filter((el) => { if (el.closest('[data-ui], table, pre, code')) return false; const cs = getComputedStyle(el); return /auto|scroll/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 24 && el.clientHeight > 40; }).length;
  // content cut by a clipping ancestor or the viewport, or spilling past the side of the card it sits in: text cut at a side
  // edge, or a control cut on any edge. A shot that fades out at the bottom of its frame is a style; a word, a badge or a
  // slider cut in half is a bug. A sticker set on purpose across a card edge is positioned, so the drawn card stops counting there.
  const draws = (cs) => parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth) > 0 || cs.boxShadow !== 'none';
  const clipBoxes = (el) => {
    const boxes = [{ left: 0, right: W, top: -Infinity, bottom: Infinity }];
    let card = !/absolute|fixed/.test(getComputedStyle(el).position);
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/hidden|clip/.test(cs.overflowX + cs.overflowY)) boxes.push(p.getBoundingClientRect());
      else if (card && draws(cs)) { const b = p.getBoundingClientRect(); boxes.push({ left: b.left, right: b.right, top: -Infinity, bottom: Infinity }); card = false; }
      if (/absolute|fixed/.test(cs.position)) card = false;
    }
    return boxes;
  };
  const paints = (cs) => !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || parseFloat(cs.borderLeftWidth) > 0;
  const controlSel = 'input:not([type=hidden]), button, select, textarea, [role="slider"], [role="switch"]';
  const clipped = all.filter((el) => {
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0 || el.closest('[aria-hidden="true"]')) return false;
    const control = el.matches(controlSel);
    const leafText = !control && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !el.querySelector(controlSel);
    if (!control && !leafText) return false;
    // a block's box runs wider than its words: measure the words, unless the box is painted (a badge is seen by its shape)
    let r = el.getBoundingClientRect();
    if (leafText && !paints(cs)) { const range = document.createRange(); range.selectNodeContents(el); r = range.getBoundingClientRect(); }
    if (r.width < 4 || r.height < 4) return false;
    for (const b of clipBoxes(el)) {
      const side = r.left < b.left - 1 || r.right > b.right + 1;
      const edge = side || r.top < b.top - 1 || r.bottom > b.bottom + 1;
      const inside = r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom;
      if (inside && (control ? edge : side)) return true;
    }
    return false;
  });
  const clippedContent = clipped.filter((el) => !clipped.some((o) => o !== el && o.contains(el))).slice(0, 4).map((el) => `${el.tagName.toLowerCase()}${el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : ''} «${(el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 24)}»`);
  const blendText = texts.filter((t) => { for (let p = t.el, i = 0; p && p !== document.body && i < 6; p = p.parentElement, i++) if (/difference|exclusion/.test(getComputedStyle(p).mixBlendMode)) return true; return false; }).length;
  // three small empty dots in a row over a picture: the "window" a screenshot was dressed in
  const fakeChrome = [...document.querySelectorAll('div,span,header,figure > *')].filter((bar) => {
    const kids = [...bar.children];
    if (kids.length !== 3 || bar.textContent.trim()) return false;
    const dots = kids.map((k) => ({ r: k.getBoundingClientRect(), cs: getComputedStyle(k) }));
    if (!dots.every(({ r, cs }) => r.width >= 4 && r.width <= 16 && Math.abs(r.width - r.height) <= 1 && parseFloat(cs.borderRadius) >= r.width * 0.4)) return false;
    const frame = bar.parentElement?.closest('figure, div, a, article, section');
    return !!frame?.querySelector('img, video, picture, canvas');
  }).length;
  // a list of three or more items where every item leads with a check mark: a glyph, a ::before glyph, or a check icon
  const CHECK = /^[\s]*[✓✔☑✅]/u;
  const leadsWithCheck = (li) => {
    if (CHECK.test(li.textContent) || CHECK.test(getComputedStyle(li, '::before').content.replace(/^["']|["']$/g, ''))) return true;
    const first = li.firstElementChild;
    if (!first || !/^(svg|i|span|img)$/i.test(first.tagName) || first.textContent.trim()) return false;
    return /check|tick/i.test(`${first.getAttribute('class') || ''} ${first.getAttribute('data-lucide') || ''} ${first.getAttribute('aria-label') || ''} ${first.getAttribute('alt') || ''} ${first.getAttribute('src') || ''}`);
  };
  const checkLists = [...document.querySelectorAll('ul, ol')].filter((list) => {
    const items = [...list.children].filter((c) => c.tagName === 'LI');
    return items.length >= 3 && items.every(leadsWithCheck);
  }).length;
  const bodyText = document.body.innerText || '';
  const emoji =(bodyText.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []);
  const doc = document.documentElement; const pageH = Math.max(doc.scrollHeight, document.body.scrollHeight);
  const headingStats = headings.map(({ _el, ...h }) => h);
  const heroOut = hero ? (({ _el, ...h }) => h)(hero) : null;
  const below = headingStats.filter((h) => !heroOut || h.top !== heroOut.top);

  return {
    viewport: { w: W, h: H },
    page: { height: pageH, screens: round(pageH / H, 1), words: bodyText.split(/\s+/).filter(Boolean).length,
      img: document.images.length, video: document.querySelectorAll('video').length, canvas: document.querySelectorAll('canvas').length, svg: document.querySelectorAll('svg').length, sections: document.querySelectorAll('section').length,
      horizontalOverflow: doc.scrollWidth > W + 2 ? doc.scrollWidth - W : 0, overflowCulprits, uiFragments, uiAbuse, realPictures, videoCount, widestPicture: round(widestPicture), uiPictures, pictureSamples, blendText, sideScrollers, clippedContent, fakeChrome, checkLists, brokenImages, emoji: [...new Set(emoji)].slice(0, 10),
      videosNoPoster: [...document.querySelectorAll('video')].filter((v) => !v.getAttribute('poster') && v.getBoundingClientRect().width >= 160).length,
      // A clip that failed to load, found no source, or autoplays and still has no frame shows a grey box. A lazy clip
      // (no autoplay) with no data yet is waiting, not broken.
      videosBroken: [...document.querySelectorAll('video')].filter((v) => v.getBoundingClientRect().width >= 160
        && (v.error || v.networkState === 3 || (v.autoplay && v.readyState < 2))).map((v) => (v.currentSrc || v.querySelector('source')?.src || v.src || '(no source)').slice(0, 120)).slice(0, 8) },
    hero: heroOut, h1,
    headings: headingStats.slice(0, 40),
    headingSummary: { count: headingStats.length, maxLines: Math.max(0, ...headingStats.map((h) => h.lines)), over2Lines: headingStats.filter((h) => h.lines > 2 && h.kind !== 'statement').length, statements: headingStats.filter((h) => h.kind === 'statement').length, centered: headingStats.filter((h) => h.align === 'center').length, medianWords: below.length ? below.map((h) => h.words).sort((a, b) => a - b)[Math.floor(below.length / 2)] : null, mixedFontHeadings: headingStats.filter((h) => h.mixedFonts).length },
    type: {
      families, familyCount: famChars.size, sizes, sizeCount: sizes.length, notLoaded,
      body: bodySample ? { font: bodySample.fam, size: bodySample.size, leading: bodySample.lh, weight: bodySample.weight, tracking: bodySample.ls, contrast: (() => { const bg = bgBehind(bodySample.el); return bg ? contrast(rgba(bodySample.color), bg) : null; })() } : null,
      measureChars: longest ? Math.round(longest.w / (longest.size * 0.5)) : null,
      max: maxText ? { size: maxText.size, vw: round((maxText.size / W) * 100, 1), font: maxText.fam, text: maxText.text.slice(0, 40) } : null,
      monoShare: round(monoChars / Math.max(1, totalChars)), monoProseShare: round(monoProse / Math.max(1, totalChars)), monoFamilies: [...monoFams], monoSamples,
      microLabels, microLabelShare: round(microLabelChars / Math.max(1, totalChars), 3), microSamples,
      upperShare: round(upperChars / Math.max(1, totalChars)), centerShare: round(centerChars / Math.max(1, totalChars)), smallText,
    },
    eyebrows, numbered: numbered.slice(0, 12).map((t) => ({ text: t.text.slice(0, 30), size: t.size, top: Math.round(t.top) })),
    color: {
      bodyBg: hex(bodyBg), bodyBgHsl: hsl(bodyBg), dark: lum(bodyBg) < 0.18, sectionBgs: sectionBgs.slice(0, 10), textColors,
      button: filledBtns.length ? { bg: mode(filledBtns.map((b) => b.bg)), hsl: mode(filledBtns.map((b) => b.bgHsl)), fg: mode(filledBtns.map((b) => b.fg)) } : null,
      lowContrast: lowContrast.slice(0, 6),
    },
    buttons: { count: buttons.length, inHero: buttons.filter((b) => b.top < H).length, radius: mode(buttons.map((b) => b.radius)), height: mode(buttons.map((b) => b.h)), withShadow: buttons.filter((b) => b.shadow).length, withGradient: buttons.filter((b) => b.gradient).length, mono: buttons.filter((b) => b.mono).length, upper: buttons.filter((b) => b.upper).length, heroLabels: buttons.filter((b) => b.top < H).map((b) => b.text).filter(Boolean).slice(0, 5) },
    surfaces: { shadowStatic, shadowOverlay, shadowSamples, gradients, scrims, gradientSamples, gradientText, hairlines, hairlineSamples, outlinedBoxes, dashed, blurred, roundedBoxes, boxRadius: mode(boxRadii) ?? 0, squareMedia, roundedMedia, mediaRadius: mode(mediaRadii) ?? 0, textShadow: texts.filter((t) => t.textShadow).length, cardRows: cardRows.slice(0, 8) },
    craft: { sideTabs, nestedCards, tightLeading, wideTracking, capsBody, crushed, skippedHeadings, fileNames: [...fileNames], cramped, greyOnColour, justified, oversizedH1, stripeGrid, edgeFlush, clippedLayers, headingRhythm, rhythmMeasured, monotonous, nearSizes, orphans, targets, headingTop },
    seo,
    heroMedia: heroMedia.slice(0, 4), nav,
    fontsLoaded: [...loaded].slice(0, 12),
  };
}

// textSpacing() applies the reader overrides of WCAG 1.4.12 (line height 1.5, paragraph spacing 2×, letters 0.12em,
// words 0.16em) and returns the text that a clipping box then cuts: a box of fixed height that only fits the text as set.
export function textSpacing() {
  const clipping = (el) => { for (let p = el, i = 0; p && p !== document.body && i < 5; p = p.parentElement, i++) { const cs = getComputedStyle(p); if (/hidden|clip/.test(cs.overflowX + cs.overflowY) && cs.webkitLineClamp === 'none' && cs.textOverflow !== 'ellipsis' && (p.scrollHeight > p.clientHeight + 2 || p.scrollWidth > p.clientWidth + 2)) return p; } return null; };
  const leaves = [...document.body.querySelectorAll('*')].slice(0, 6000).filter((el) => {
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION)$/.test(el.tagName) || el.closest('svg, [aria-hidden="true"], [data-ui]')) return false;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim().length > 2)) return false;
    const r = el.getBoundingClientRect(); const scaled = el.offsetHeight && r.height < el.offsetHeight * 0.9;
    return r.width > 0 && r.height > 0 && !scaled && el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && el.innerText.trim();
  });
  const before = new Set(leaves.filter(clipping));
  const style = document.createElement('style');
  style.textContent = '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}';
  document.head.appendChild(style);
  const cut = leaves.filter((el) => !before.has(el) && clipping(el)).slice(0, 6).map((el) => `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : ''} «${(el.innerText || '').trim().slice(0, 24)}»`);
  style.remove();
  return cut;
}

// VITALS is installed before the page loads and keeps the layout shifts and the largest paint as they happen (web.dev).
export const VITALS = `(() => {
  const v = window.__vitals = { cls: 0, lcp: null, lcpTag: null };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) v.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { const e = l.getEntries().at(-1); if (e) { v.lcp = Math.round(e.startTime); v.lcpTag = e.element ? e.element.tagName.toLowerCase() : null; } }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
})()`;

// frame() runs at each scroll position the inspector photographs. It reports large text that something
// else is lying on top of (a picture sliding over a headline), and how much of the screen holds anything.
export function frame() {
  const W = innerWidth, H = innerHeight;
  const pinnedTop = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if ((cs.position === 'fixed' || cs.position === 'sticky') && p.getBoundingClientRect().top < 140 && p.getBoundingClientRect().height < 180) return true; } return false; };
  // 1. covered text. Hit-testing skips elements with pointer-events: none (a pinned title usually has it),
  // which would make whatever lies beneath look as if it were on top; switch it on while sampling.
  const hitStyle = document.createElement('style');
  hitStyle.textContent = '*, *::before, *::after { pointer-events: auto !important; }';
  document.head.appendChild(hitStyle);
  const covered = [], clipped = [], pinnedOver = [];
  const label = (el, direct) => (el.innerText || direct).replace(/\s+/g, ' ').trim().slice(0, 48);
  const pinnedLow = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) { const pcs = getComputedStyle(p); if (pcs.position === 'fixed' || pcs.position === 'sticky') return !pinnedTop(el); } return false; };
  // Does the element found on top actually paint anything there? A transparent layout box does not hide text.
  const paints = (hit, el) => {
    for (let p = hit; p && p !== document.body && !p.contains(el); p = p.parentElement) {
      if (/^(IMG|VIDEO|CANVAS|PICTURE|IFRAME|svg)$/.test(p.tagName) || p.closest('svg')) return true;
      const pcs = getComputedStyle(p);
      if (pcs.backgroundImage !== 'none') return true;
      const m = pcs.backgroundColor.match(/rgba?\(([^)]+)\)/); const parts = m ? m[1].split(/[,\s/]+/).filter(Boolean) : [];
      if (parts.length && (parts.length < 4 || parseFloat(parts[3]) > 0.05)) return true;
      if (p === hit) for (const n of p.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return true; // its own text lies on ours
    }
    return false;
  };
  const pictures = [...document.querySelectorAll('img, picture, svg, canvas, video')].filter((m) => !m.parentElement?.closest('svg')).map((m) => ({ m, r: m.getBoundingClientRect() })).filter(({ r }) => r.width >= 80 && r.height >= 80 && r.bottom > 0 && r.top < H);
  for (const el of document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, blockquote, li, a, button, span, div')) {
    let direct = ''; for (const n of el.childNodes) if (n.nodeType === 3) direct += n.nodeValue;
    if (direct.trim().length < 3) continue;
    const cs = getComputedStyle(el); const size = parseFloat(cs.fontSize); if (size < 24 || cs.visibility === 'hidden' || +cs.opacity < 0.3) continue;
    let srOnly = false;
    for (let p = el, i = 0; p && p !== document.body && i < 4; p = p.parentElement, i++) { const pcs = getComputedStyle(p); const pr = p.getBoundingClientRect(); if (pcs.clip === 'rect(0px, 0px, 0px, 0px)' || /inset\(50%\)/.test(pcs.clipPath) || (pr.width <= 2 && pr.height <= 2 && pcs.overflow !== 'visible')) { srOnly = true; break; } }
    if (srOnly) continue;
    // the boxes that clip this text (overflow other than visible, or a clip-path)
    const clips = []; for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const pcs = getComputedStyle(p); if (pcs.overflowY !== 'visible' || pcs.overflowX !== 'visible' || pcs.clipPath !== 'none') clips.push(p.getBoundingClientRect()); }
    // a scroll scene moves pictures across its own held stage by design; its text is judged by the scene rules
    const pinned = size >= 32 && pinnedLow(el) && !el.closest('.scene.is-live');
    // lines of one heading set as separate spans overlap each other's glyph boxes; that is not a collision
    const unit = el.closest('h1, h2, h3, h4, h5, h6, p, blockquote');
    const range = document.createRange(); let total = 0, hidden = 0, cutTop = false, area = 0, over = 0;
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.nodeValue.trim()) continue;
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.width < 6 || r.bottom < 0 || r.top > H) continue;
        // sampled at two heights inside the line box (a display face's glyph box often spills past it and
        // under the next line), so a band lying over the top or the bottom of the letters is found too
        const lh = parseFloat(cs.lineHeight); const band = Math.min(r.height, Number.isFinite(lh) ? lh : r.height);
        for (const dy of [-0.2, 0.2]) for (const fx of [0.12, 0.37, 0.63, 0.88]) {
          const x = r.left + r.width * fx, y = r.top + r.height * 0.55 + band * dy; if (x < 0 || x >= W || y < 0 || y >= H) continue;
          total++; const hit = document.elementFromPoint(x, y);
          if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !pinnedTop(hit) && !(unit && unit.contains(hit) && !/^(IMG|VIDEO|CANVAS|PICTURE|svg)$/.test(hit.tagName) && !hit.closest('svg')) && paints(hit, el)) hidden++;
        }
        // the glyph box starts above the capitals (ascender room), so only a cut well into it is a real crop
        if (size >= 40 && r.top >= -4 && clips.some((c) => c.top > r.top + r.height * 0.3 && c.top < r.bottom - r.height * 0.2)) cutTop = true;
        if (pinned) { area += r.width * r.height; for (const { m, r: pr } of pictures) { if (m.contains(el) || el.contains(m)) continue; const ox = Math.min(r.right, pr.right) - Math.max(r.left, pr.left), oy = Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top); if (ox > 0 && oy > 0) over += ox * oy; } }
      }
    }
    if (total >= 4 && hidden / total >= 0.2) covered.push({ text: label(el, direct), share: Math.round((hidden / total) * 100) / 100 });
    if (cutTop) clipped.push({ text: label(el, direct) });
    if (pinned && area && over / area >= 0.15) pinnedOver.push({ text: label(el, direct), share: Math.min(1, Math.round((over / area) * 100) / 100) });
  }
  hitStyle.remove();
  // 2. how much of the screen holds anything: text glyph boxes, media, or a ground that differs from the page's
  const opaque = (c) => c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c);
  const pageBg = [document.body, document.documentElement].map((e) => getComputedStyle(e).backgroundColor).find(opaque) || 'rgb(255, 255, 255)';
  const textRects = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const rg = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim() || !n.parentElement) continue; const pcs = getComputedStyle(n.parentElement); if (pcs.visibility === 'hidden' || +pcs.opacity < 0.2) continue;
    rg.selectNodeContents(n); for (const r of rg.getClientRects()) if (r.bottom > 0 && r.top < H && r.width > 1) textRects.push(r);
  }
  let filled = 0, samples = 0;
  for (let gx = 0; gx < 24; gx++) for (let gy = 0; gy < 15; gy++) {
    const x = (gx + 0.5) * (W / 24), y = (gy + 0.5) * (H / 15); samples++;
    if (textRects.some((r) => x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 4 && y <= r.bottom + 4)) { filled++; continue; }
    let el = document.elementFromPoint(x, y);
    for (let i = 0; el && i < 6 && el !== document.body && el !== document.documentElement; i++, el = el.parentElement) {
      if (/^(IMG|VIDEO|CANVAS|PICTURE|svg|IFRAME)$/.test(el.tagName) || el.closest('svg')) { filled++; break; }
      const cs = getComputedStyle(el);
      if (cs.backgroundImage !== 'none') { filled++; break; }
      const bg = cs.backgroundColor; if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') { if (bg !== pageBg) filled++; break; }
    }
  }
  // 3. the large text in view, to spot one statement held on screen for screen after screen
  const big = [...new Set([...document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, blockquote')].filter((el) => { const r = el.getBoundingClientRect(); return !el.closest('.scene.is-live') && parseFloat(getComputedStyle(el).fontSize) >= 32 && r.top >= -4 && r.bottom <= H + 4 && r.height > 0; }).map((el) => (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60)).filter((t) => t.length >= 4))];
  return { covered, clipped, pinnedOver, filled: Math.round((filled / samples) * 100) / 100, big, y: Math.round(scrollY) };
}

// layout() runs once, back at the top after the page has been scrolled through (so reveals have fired).
// It measures the frame of the page rather than its details: the two outer margins, sections whose content
// huddles on one side, blank stretches with nothing in them, the title, untitled sections, text pressed
// against the edge of the screen and how many left edges the text uses.
export function layout() {
  const W = innerWidth, H = innerHeight, SY = scrollY;
  const D = document.documentElement, B = document.body;
  const pageH = Math.max(D.scrollHeight, B.scrollHeight);
  const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]; };
  const shown = (el) => { for (let p = el, i = 0; p && p !== B && i < 30; p = p.parentElement, i++) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; if (i < 4 && (cs.clip === 'rect(0px, 0px, 0px, 0px)' || /inset\(50%\)/.test(cs.clipPath))) return false; } return true; };
  const layerOf = (el) => { for (let p = el; p && p !== B; p = p.parentElement) { const pos = getComputedStyle(p).position; if (pos === 'fixed') return 'fixed'; if (pos === 'sticky') return 'sticky'; } return null; };
  const sel = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')).slice(0, 60);
  const boxes = [];
  // A range is layout geometry: an ellipsised or scrolled line reaches past what the reader sees. Clip
  // each text box to the window its element's overflow allows (its own box and every clipping ancestor).
  const clipMemo = new Map();
  const clipBox = (el) => {
    if (!el || el === B || el === document.documentElement) return null;
    if (clipMemo.has(el)) return clipMemo.get(el);
    const cs = getComputedStyle(el);
    let box = cs.position === 'fixed' ? null : clipBox(el.parentElement);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      const r = el.getBoundingClientRect();
      const own = { l: cs.overflowX !== 'visible' ? r.left : -Infinity, r: cs.overflowX !== 'visible' ? r.right : Infinity, t: cs.overflowY !== 'visible' ? r.top : -Infinity, b: cs.overflowY !== 'visible' ? r.bottom : Infinity };
      box = box ? { l: Math.max(box.l, own.l), r: Math.min(box.r, own.r), t: Math.max(box.t, own.t), b: Math.min(box.b, own.b) } : own;
    }
    clipMemo.set(el, box);
    return box;
  };
  // text, one box per text node (its line boxes merged)
  const walker = document.createTreeWalker(B, NodeFilter.SHOW_TEXT); const rg = document.createRange();
  for (let n = walker.nextNode(); n && boxes.length < 6000; n = walker.nextNode()) {
    const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t.length < 2) continue;
    const el = n.parentElement; if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION)$/.test(el.tagName) || el.closest('svg')) continue;
    rg.selectNodeContents(n); const r = rg.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if (!shown(el)) continue;
    const c = clipBox(el);
    const l = c ? Math.max(r.left, c.l) : r.left, rr = c ? Math.min(r.right, c.r) : r.right;
    const tp = c ? Math.max(r.top, c.t) : r.top, bt = c ? Math.min(r.bottom, c.b) : r.bottom;
    if (rr - l < 2 || bt - tp < 2) continue;
    const cs = getComputedStyle(el);
    boxes.push({ kind: 'text', el, l, r: rr, t: tp + SY, b: bt + SY, chars: t.length, text: t.slice(0, 50), size: parseFloat(cs.fontSize), align: cs.textAlign, layer: layerOf(el), tag: el.tagName });
  }
  // pictures, drawings and controls
  for (const el of B.querySelectorAll('img, video, canvas, picture, iframe, svg, input, select, textarea, button, [role="button"], a, div, section, figure, span, li')) {
    const tag = el.tagName;
    let kind = null;
    if (/^(IMG|VIDEO|CANVAS|PICTURE|IFRAME)$/.test(tag)) kind = 'media';
    else if (tag === 'svg') { if (el.parentElement && el.parentElement.closest('svg')) continue; kind = 'media'; }
    else if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(tag) || el.getAttribute('role') === 'button') kind = 'control';
    else { const bi = getComputedStyle(el).backgroundImage; if (bi && bi.includes('url(')) kind = 'media'; else continue; }
    const r = el.getBoundingClientRect(); if (r.width < 24 || r.height < 24) continue;
    if (kind === 'media' && r.width * r.height < 48 * 48) continue;
    if (!shown(el)) continue;
    boxes.push({ kind, el, l: r.left, r: r.right, t: r.top + SY, b: r.bottom + SY, chars: 0, size: 0, layer: layerOf(el), tag });
  }
  const flow = boxes.filter((b) => b.layer !== 'fixed');
  // 1. the frame: how far the page's content comes to each edge (full-bleed things say nothing about margins)
  // a row that runs off one edge (a carousel, a bled display line) says nothing about that side's margin
  const framed = flow.filter((b) => b.r - b.l < W * 0.97 && b.l >= -1 && b.r <= W + 1);
  const L = framed.length ? Math.max(0, pct(framed.map((b) => b.l), 0.02)) : null;
  const R = framed.length ? Math.max(0, W - pct(framed.map((b) => b.r), 0.98)) : null;
  // 2. sections: descend through single wrappers, then take the blocks
  const tall = (c) => { const r = c.getBoundingClientRect(); return r.height >= 120 && r.width >= W * 0.6 && getComputedStyle(c).position !== 'fixed' && shown(c); };
  let root = B;
  for (let i = 0; i < 12; i++) { const kids = [...root.children].filter(tall); if (kids.length === 1) root = kids[0]; else break; }
  // a tall block is split into its parts; the parts of a block that has its own heading continue it
  let blocks = [...root.children].filter(tall).map((el) => ({ el, cont: false }));
  for (let pass = 0; pass < 2; pass++) blocks = blocks.flatMap((b) => { const k = [...b.el.children].filter(tall); if (b.el.getBoundingClientRect().height > H * 1.6 && k.length >= 2) { const titled = b.cont || !!b.el.querySelector('h1, h2, h3, h4, [role="heading"]'); return k.map((el) => ({ el, cont: titled })); } return [b]; });
  const continues = new Set(blocks.filter((b) => b.cont).map((b) => b.el));
  blocks = blocks.map((b) => b.el);
  const bodySize = (() => { const m = new Map(); for (const b of flow) if (b.kind === 'text' && b.chars >= 40) m.set(Math.round(b.size), (m.get(Math.round(b.size)) || 0) + b.chars); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 16; })();
  const sections = blocks.slice(0, 40).map((s, i) => {
    const r = s.getBoundingClientRect(); const top = r.top + SY, bot = r.bottom + SY;
    const inside = flow.filter((b) => b.t >= top - 2 && b.b <= bot + 2 && s.contains(b.el));
    const own = inside.filter((b) => b.r - b.l < W * 0.97);
    const text = inside.filter((b) => b.kind === 'text');
    const media = inside.filter((b) => b.kind === 'media' && (b.r - b.l) * (b.b - b.t) >= 160 * 120);
    const words = text.reduce((a, b) => a + b.text.split(' ').length + Math.max(0, Math.round((b.chars - 50) / 6)), 0);
    const headRe = /^H[1-4]$/;
    const heading = text.filter((b) => (b.el.closest('h1,h2,h3,h4,[role="heading"]') || b.size >= Math.max(22, bodySize * 1.35)) && b.t <= top + Math.max(520, (bot - top) * 0.45)).sort((a, b) => b.size - a.size)[0];
    const cs = getComputedStyle(s);
    // the widest stretch across the section's content band that nothing covers, edge to edge excluded
    let middle = 0;
    if (own.length >= 2) {
      const iv = own.map((b) => [Math.max(0, b.l), Math.min(W, b.r)]).sort((a, b) => a[0] - b[0]);
      let end = iv[0][1];
      for (const [a, b2] of iv.slice(1)) { if (a > end) middle = Math.max(middle, a - end); end = Math.max(end, b2); }
    }
    return {
      sel: sel(s), tag: s.tagName.toLowerCase(), top: Math.round(top), height: Math.round(r.height), words, media: media.length, middle: Math.round(middle),
      heading: heading ? { text: heading.text, size: Math.round(heading.size), tag: (heading.el.closest('h1,h2,h3,h4,h5,h6') || heading.el).tagName.toLowerCase() } : null,
      left: own.length ? Math.round(Math.max(0, Math.min(...own.map((b) => b.l)))) : null, right: own.length ? Math.round(Math.max(0, W - Math.max(...own.map((b) => b.r)))) : null,
      textLeft: text.length ? Math.round(Math.min(...text.map((b) => b.l))) : null, textRight: text.length ? Math.round(W - Math.max(...text.map((b) => b.r))) : null,
      fullBleed: inside.some((b) => b.kind === 'media' && b.r - b.l >= W * 0.97), footer: s.tagName === 'FOOTER' || !!s.querySelector('footer') || i === blocks.length - 1,
      hero: top < H * 0.5, continues: continues.has(s), pinned: cs.position === 'sticky' || !!s.querySelector('.pin-spacer') || [...s.querySelectorAll('*')].slice(0, 400).some((e) => getComputedStyle(e).position === 'sticky' && e.getBoundingClientRect().height > H * 0.5),
    };
  });
  // 3. blank stretches: rows of the page with no text, picture or control, between the first and the last content.
  // A sticky element's track (its parent) and a pinning spacer are scroll distance, not blank page.
  const STEP = 4, rows = Math.ceil(pageH / STEP), occ = new Uint8Array(rows);
  const mark = (t, b, v) => { for (let y = Math.max(0, Math.floor(t / STEP)); y < Math.min(rows, Math.ceil(b / STEP)); y++) occ[y] = v; };
  for (const b of flow) if (b.layer !== 'sticky') mark(b.t, b.b, 1);
  for (const el of B.querySelectorAll('.pin-spacer')) { const r = el.getBoundingClientRect(); mark(r.top + SY, r.bottom + SY, 2); }
  let scanned = 0;
  for (const el of B.querySelectorAll('*')) { if (++scanned > 9000) break; const cs = getComputedStyle(el); if (cs.position === 'sticky' && el.parentElement) { const r = el.parentElement.getBoundingClientRect(); mark(r.top + SY, r.bottom + SY, 2); } }
  let first = 0; while (first < rows && occ[first] !== 1) first++;
  let last = rows - 1; while (last > 0 && occ[last] !== 1) last--;
  const gaps = []; let run = 0;
  for (let y = first; y <= last + 1; y++) { if (y <= last && occ[y] === 0) run++; else { if (run * STEP >= H * 0.3) gaps.push({ top: (y - run) * STEP, height: run * STEP }); run = 0; } }
  // 4. the title
  const h1s = [...document.querySelectorAll('h1')].filter((h) => { const r = h.getBoundingClientRect(); return r.width > 0 && r.height > 0 && shown(h); }).map((h) => { const r = h.getBoundingClientRect(); return { text: (h.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80), size: Math.round(parseFloat(getComputedStyle(h).fontSize)), top: Math.round(r.top + SY), firstScreen: r.top + SY < H * 0.95 }; });
  // 5. text pressed against the edge of the screen (type deliberately bled past the edge is a different device)
  // fixed headers and corner labels count here: that is where text most often creeps to the edge
  const edge = 16;
  const edgeText = boxes.filter((b) => b.kind === 'text' && b.chars >= 3 && b.size < 40 && b.l >= -1 && b.r <= W + 1 && (b.l < edge || b.r > W - edge) && !b.el.closest('[class*="marquee" i],[class*="ticker" i],marquee,[data-ui],table')).slice(0, 8).map((b) => ({ text: b.text, side: b.l < edge ? 'left' : 'right', px: Math.round(b.l < edge ? b.l : W - b.r) }));
  // display type that runs off one edge by a sliver while it starts inside the margin: a fit error, not a bleed
  const slivers = boxes.filter((b) => b.kind === 'text' && b.size >= 40 && b.chars >= 3 && ((b.l >= 8 && b.r > W + 1 && b.r - W < b.size * 0.25) || (b.r <= W - 8 && b.l < -1 && -b.l < b.size * 0.25))).slice(0, 4).map((b) => ({ text: b.text.slice(0, 30), px: Math.round(b.r > W ? b.r - W : -b.l), side: b.r > W ? 'right' : 'left' }));
  // the largest empty rectangle on the first screen (below a 90px band for the navigation), on a 24 x 15 grid
  let voidShare = 0, voidBox = null;
  if (W >= 1000) {
    const C = 24, Rn = 15, cw = W / C, ch = H / Rn, occ2 = Array.from({ length: Rn }, () => new Array(C).fill(0));
    for (const b of boxes) { if (b.t - SY > H || b.b - SY < 0) continue; const c0 = Math.max(0, Math.floor(b.l / cw)), c1 = Math.min(C - 1, Math.floor((b.r - 1) / cw)), r0 = Math.max(0, Math.floor((b.t - SY) / ch)), r1 = Math.min(Rn - 1, Math.floor((b.b - SY - 1) / ch)); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) occ2[r][c] = 1; }
    const top = Math.ceil(90 / ch), hgt = new Array(C).fill(0);
    for (let r = top; r < Rn; r++) {
      for (let c = 0; c < C; c++) hgt[c] = occ2[r][c] ? 0 : hgt[c] + 1;
      for (let c = 0; c < C; c++) { let mn = Infinity; for (let k = c; k < C && hgt[k]; k++) { mn = Math.min(mn, hgt[k]); const a = mn * (k - c + 1); if (a > voidShare) { voidShare = a; voidBox = { x: Math.round(c * cw), y: Math.round((r - mn + 1) * ch), w: Math.round((k - c + 1) * cw), h: Math.round(mn * ch) }; } } }
    }
    voidShare = Math.round((voidShare / (C * Rn)) * 100) / 100;
  }
  // a fixed picture layer that covers the screen (a canvas scene, a film) hides what the DOM cannot see
  const stage = boxes.some((b) => b.layer === 'fixed' && b.kind === 'media' && (b.r - b.l) * (b.b - b.t) >= W * H * 0.9);
  // the first screen: is the title a bare name, with nothing at reading size saying what this is?
  const firstText = flow.filter((b) => b.kind === 'text' && b.t < H * 0.95 && b.size >= 18 && !b.el.closest('h1, nav, header nav, button, a'));
  const explains = firstText.some((b) => b.text.split(' ').length >= 6 || b.chars >= 36);
  // 6. left edges used by running text and headings (left-aligned blocks only)
  // headings and paragraphs only: the items of a grid or a list each start their own column on purpose
  const lefts = flow.filter((b) => b.kind === 'text' && b.size >= 14 && !/center|right|end/.test(b.align) && b.l >= 0 && (b.el.closest('h1, h2, h3') || (b.chars >= 60 && b.el.closest('p, blockquote'))) && !b.el.closest('nav, footer, [data-ui], table, li, figcaption')).map((b) => b.l).sort((a, b) => a - b);
  const edges = []; for (const x of lefts) { const e = edges.find((g) => Math.abs(g.x - x) <= 10); if (e) e.n++; else edges.push({ x: Math.round(x), n: 1 }); }
  edges.sort((a, b) => b.n - a.n);
  return { viewport: { w: W, h: H }, pageH, margins: { left: L == null ? null : Math.round(L), right: R == null ? null : Math.round(R) }, sections, gaps, h1s, edgeText, edges: edges.slice(0, 12), leftBlocks: lefts.length, bodySize, stage, explains, slivers, voidShare, voidBox };
}

// app() measures what an app screen (dashboard, admin, settings, inbox) gets right or wrong: the shell,
// how much of the canvas is used, panels and their edges, numbers in tables and KPIs, chart colours,
// the icon-in-a-tinted-square habit, placeholder data, and what happens to the sidebar on a phone.
export function app() {
  const W = innerWidth, H = innerHeight, SY = scrollY, B = document.body;
  const cvs = document.createElement('canvas'); cvs.width = cvs.height = 1;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  const rgba = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; };
  const hex = (v) => '#' + [v.r, v.g, v.b].map((n) => n.toString(16).padStart(2, '0')).join('');
  const lum = (v) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(v.r) + 0.7152 * f(v.g) + 0.0722 * f(v.b); };
  const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100; };
  const hsl = (v) => { const r = v.r / 255, g = v.g / 255, b = v.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return { h: Math.round(h), s, l }; };
  const shown = (el, cs) => { cs = cs || getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const groundOf = (el) => { for (let p = el; p; p = p.parentElement) { const v = rgba(getComputedStyle(p).backgroundColor); if (v.a >= 0.9) return v; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const pageBg = groundOf(B);
  const all = [...B.querySelectorAll('*')].slice(0, 12000);
  // 1. the shell: a tall column at one side (sidebar) and a bar across the top
  let sidebar = null, topbar = null;
  for (const el of all) {
    const r = el.getBoundingClientRect(); if (r.width < 40) continue;
    if (!sidebar && r.left <= 1 && r.top <= 80 && r.height >= H * 0.7 && r.width >= 48 && r.width <= Math.min(360, W * 0.45) && (el.querySelectorAll('a, button').length >= 3) && shown(el)) sidebar = { w: Math.round(r.width), tag: el.tagName.toLowerCase(), links: el.querySelectorAll('a, button').length, share: Math.round((r.width / W) * 100) / 100 };
    if (!topbar && r.top <= 1 && r.left <= (sidebar ? sidebar.w + 2 : 2) && r.width >= W * 0.6 && r.height >= 36 && r.height <= 96 && shown(el)) topbar = { h: Math.round(r.height) };
    if (sidebar && topbar) break;
  }
  // 2. how much of the canvas the content uses (right of the sidebar)
  const x0 = sidebar ? sidebar.w : 0;
  // the text itself (a block element's box runs to the edge whatever its text does), pictures, charts and controls
  const boxes = [];
  const tw = document.createTreeWalker(B, NodeFilter.SHOW_TEXT); const trg = document.createRange();
  for (let n = tw.nextNode(); n && boxes.length < 5000; n = tw.nextNode()) {
    if (n.nodeValue.trim().length < 2 || !n.parentElement || n.parentElement.closest('svg')) continue;
    const cs = getComputedStyle(n.parentElement); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) continue;
    trg.selectNodeContents(n); const r = trg.getBoundingClientRect(); if (r.width < 2 || r.left < x0 - 1 || (cs.position === 'fixed' && r.left > W * 0.5)) continue;
    boxes.push(r);
  }
  for (const el of B.querySelectorAll('svg, canvas, img, video, input, select, textarea, button, table')) {
    if (el.parentElement && el.parentElement.closest('svg')) continue;
    const r = el.getBoundingClientRect(); if (r.width < 8 || r.height < 8 || r.left < x0 - 1 || !shown(el)) continue;
    boxes.push(r);
  }
  const rights = boxes.map((r) => r.right).sort((a, b) => a - b), lefts = boxes.map((r) => r.left).sort((a, b) => a - b);
  const canvas = boxes.length ? { left: Math.round(lefts[Math.floor(lefts.length * 0.02)] - x0), right: Math.round(W - rights[Math.floor(rights.length * 0.98)]) } : null;
  // 3. panels: boxes that read as cards (a fill one step from the ground, a border, or a shadow)
  const panels = []; const radii = new Map(); let heavyBorders = 0, heavyShadows = 0, softShadows = 0, glass = 0; const borderSamples = [], shadowSamples = [];
  for (const el of all) {
    const r = el.getBoundingClientRect(); if (r.width < 140 || r.height < 72 || r.width > W * 0.98) continue;
    const cs = getComputedStyle(el); if (!shown(el, cs)) continue;
    const bg = rgba(cs.backgroundColor), bw = parseFloat(cs.borderTopWidth) || 0, bc = rgba(cs.borderTopColor);
    const ground = groundOf(el.parentElement || B);
    const filled = bg.a >= 0.9 && contrast(bg, ground) >= 1.04, bordered = bw >= 0.5 && cs.borderTopStyle !== 'none' && bc.a > 0.05;
    const sh = cs.boxShadow !== 'none' ? cs.boxShadow : '';
    if (!filled && !bordered && !sh) continue;
    if (!(el.innerText || '').trim()) continue;
    panels.push({ el, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + SY), left: Math.round(r.left), bottom: Math.round(r.bottom + SY), right: Math.round(r.right) });
    const rad = Math.round(parseFloat(cs.borderTopLeftRadius) || 0); radii.set(rad, (radii.get(rad) || 0) + 1);
    if (bordered) { const c = contrast({ ...bc, a: 1 }, bg.a >= 0.9 ? bg : ground); if (c >= (lum(ground) > 0.4 ? 1.45 : 1.9)) { heavyBorders++; if (borderSamples.length < 3) borderSamples.push(`${hex(bc)} on ${hex(bg.a >= 0.9 ? bg : ground)} (${c}:1)`); } }
    if (sh) {
      for (const part of sh.split(/,(?![^(]*\))/)) {
        if (/inset/.test(part)) continue; const col = part.match(/rgba?\([^)]+\)/); const nums = part.replace(/rgba?\([^)]+\)/, '').trim().split(/\s+/).map(parseFloat);
        const a = col ? rgba(col[0]).a : 1; const blur = nums[2] || 0, y = Math.abs(nums[1] || 0);
        if (a <= 0.02 || (blur === 0 && y === 0 && !(nums[3] > 0))) continue;
        // on a dark ground a black shadow barely shows; there it only counts when it is near-opaque
        const darkGround = lum(ground) < 0.2;
        if (darkGround ? a >= 0.45 : ((a >= 0.12 && blur >= 12) || y >= 8 || a >= 0.25)) { heavyShadows++; if (shadowSamples.length < 3) shadowSamples.push(part.trim().slice(0, 70)); } else softShadows++;
      }
    }
    if (cs.backdropFilter && cs.backdropFilter !== 'none') glass++;
  }
  // top-level panels only (a card inside a panel is part of it): rows that end ragged, and how many
  // panels start on the first screen
  const panelEls = new Set(panels.map((p) => p.el));
  const tops = panels.filter((p) => { for (let a = p.el.parentElement; a && a !== B; a = a.parentElement) if (panelEls.has(a)) return false; return p.w < W * 0.97 || p.h < H * 2; });
  // a column of cards stacked with a gutter of 24px or less is one block: two cards on the left that end level with
  // one tall card on the right are not ragged. A pair is ragged only when the cards and their columns both end apart.
  const below = (p) => tops.find((q) => q !== p && Math.abs(q.left - p.left) <= 4 && Math.abs(q.w - p.w) <= 4 && q.top >= p.bottom - 2 && q.top - p.bottom <= 24);
  const columnBottom = (p) => { let b = p.bottom; for (let q = below(p), n = 0; q && n < 12; q = below(q), n++) b = q.bottom; return b; };
  const ragged = [];
  for (let i = 0; i < tops.length; i++) for (let k = i + 1; k < tops.length; k++) {
    const a = tops[i], b = tops[k];
    if (Math.abs(a.top - b.top) > 4 || a.w < 200 || b.w < 200 || (a.right > b.left - 4 && b.right > a.left - 4)) continue; // side by side, same row
    const diff = Math.min(Math.abs(a.bottom - b.bottom), Math.abs(columnBottom(a) - columnBottom(b))), tall = Math.max(a.h, b.h);
    if (diff > Math.max(24, tall * 0.12)) ragged.push({ diff, top: a.top });
  }
  // the largest blank band inside a card: the vertical gap between consecutive pieces of its content (text, charts,
  // pictures, controls, rules, fills), or from the last piece to the card's padding edge. A legend pinned to the foot
  // of a stretched card, or four rows in a card kept at its neighbour's height, leave one.
  const voids = [];
  const seen = new Map();
  const visibleIn = (el, root) => { if (seen.has(el)) return seen.get(el); let ok = true; for (let p = el; p && p !== root.parentElement; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05 || cs.position === 'fixed') { ok = false; break; } } seen.set(el, ok); return ok; };
  for (const p of tops) {
    if (p.el.matches('nav, aside, header, footer, dialog, [role="navigation"], [role="dialog"]') || p.el.querySelector('nav') || (sidebar && p.left < sidebar.w - 4) || p.h < 120) continue;
    if (panels.filter((q) => q.el !== p.el && p.el.contains(q.el)).length >= 2) continue; // a frame of cards, not a card
    const cs = getComputedStyle(p.el), pr = p.el.getBoundingClientRect();
    const inTop = pr.top + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.paddingTop) || 0), inBottom = pr.bottom - (parseFloat(cs.borderBottomWidth) || 0) - (parseFloat(cs.paddingBottom) || 0);
    const bg = rgba(cs.backgroundColor), spans = [];
    const tw2 = document.createTreeWalker(p.el, NodeFilter.SHOW_TEXT), rg = document.createRange();
    // text that opens a section (a heading, a summary, or text at 14px/600 or 15px/500 and up) may follow a wider, placed gap
    for (let n = tw2.nextNode(); n; n = tw2.nextNode()) { if (!n.nodeValue.trim() || !n.parentElement || n.parentElement.closest('svg') || !visibleIn(n.parentElement, p.el)) continue; rg.selectNodeContents(n); const r = rg.getBoundingClientRect(); if (r.height > 0 && r.width > 0) { const pcs = getComputedStyle(n.parentElement); const fs = parseFloat(pcs.fontSize), fw = +pcs.fontWeight; spans.push([r.top, r.bottom, !!n.parentElement.closest('h1, h2, h3, h4, h5, h6, [role="heading"], summary, legend, caption') || (fw >= 600 && fs >= 14) || (fw >= 500 && fs >= 15)]); } }
    for (const el of p.el.querySelectorAll('*')) {
      if (el.parentElement && el.parentElement.closest('svg')) continue;
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 1 || !visibleIn(el, p.el)) continue;
      if (/^(svg|canvas|img|video|input|select|textarea|button|hr|progress|meter|iframe)$/i.test(el.tagName)) { spans.push([r.top, r.bottom]); continue; }
      const ecs = getComputedStyle(el), fillC = rgba(ecs.backgroundColor);
      if (fillC.a >= 0.1 && (bg.a < 0.9 || contrast({ ...fillC, a: 1 }, bg) >= 1.03) && r.height >= 2) spans.push([r.top, r.bottom]);
      if ((parseFloat(ecs.borderTopWidth) || 0) >= 0.5 && ecs.borderTopStyle !== 'none' && rgba(ecs.borderTopColor).a > 0.05) spans.push([r.top, r.top + 1]);
      if ((parseFloat(ecs.borderBottomWidth) || 0) >= 0.5 && ecs.borderBottomStyle !== 'none' && rgba(ecs.borderBottomColor).a > 0.05) spans.push([r.bottom - 1, r.bottom]);
    }
    const ys = spans.filter(([a, b]) => b > inTop - 2 && a < inBottom + 2).sort((a, b) => a[0] - b[0]);
    if (!ys.length) continue;
    // a band counts when it is over 40px, or over 64px when the content after it opens a new section
    let end = ys[0][1], gap = 0, at = null;
    for (const [a, b] of ys.slice(1)) { const g = a - end, section = ys.some(([t, , hd]) => hd && Math.abs(t - a) < 6); if (g > (section ? 64 : 40) && g > gap) { gap = g; at = end; } end = Math.max(end, b); }
    if (inBottom - end > 40 && inBottom - end > gap) { gap = inBottom - end; at = end; }
    const head = (p.el.querySelector('h1, h2, h3, h4, [role="heading"], header') || p.el).innerText || '';
    if (gap > 40) voids.push({ gap: Math.round(gap), at: Math.round(at + SY), panel: head.trim().split('\n')[0].slice(0, 40) });
  }
  voids.sort((a, b) => b.gap - a.gap);
  const firstScreen = tops.filter((p) => p.top < H - 48).length;
  // the icon-in-a-tinted-square habit: small boxes with a coloured fill holding one icon, repeated
  const chips = []; let tiles = 0;
  for (const el of all) {
    const r = el.getBoundingClientRect(); if (r.width < 24 || r.width > 64 || Math.abs(r.width - r.height) > 4) continue;
    const cs = getComputedStyle(el); const bg = rgba(cs.backgroundColor); if (bg.a < 0.08) continue;
    const icon = el.querySelector('svg, i, img, [class*="icon" i]'); if (!icon || (el.innerText || '').trim().length > 2) continue;
    const c = hsl(bg); if (c.s < 0.18 && bg.a > 0.5) { if (r.width >= 28 && !el.closest('button, a, nav, aside, [role="navigation"]')) tiles++; continue; } // neutral: an avatar, a button, or a boxed icon
    chips.push({ hue: c.h, size: Math.round(r.width), radius: cs.borderTopLeftRadius });
  }
  const chipHues = new Set(chips.map((c) => Math.round(c.hue / 30)));
  // 5. numbers: tables and KPI figures
  const numRe = /^[−\-+]?[$€£¥]?\s?\d[\d,.\s]*(%|[kKmMbB]|\s?(ms|s|h|min|GB|MB|kB|x))?$/;
  const cells = [...B.querySelectorAll('td, [role="cell"], [role="gridcell"]')].filter((el) => numRe.test((el.innerText || '').trim()));
  const leftNums = cells.filter((el) => { const a = getComputedStyle(el).textAlign; const inner = el.firstElementChild ? getComputedStyle(el.firstElementChild).textAlign : a; return /left|start/.test(a) && /left|start/.test(inner) && getComputedStyle(el).justifyContent !== 'flex-end'; }).length;
  const figures = [];
  for (const el of all) { if (el.children.length) continue; const t = (el.innerText || '').trim(); if (!numRe.test(t) || t.length < 2) continue; const cs = getComputedStyle(el); if (!shown(el, cs)) continue; figures.push({ size: parseFloat(cs.fontSize), tabular: /tabular-nums/.test(cs.fontVariantNumeric) || /"tnum"/.test(cs.fontFeatureSettings), weight: +cs.fontWeight }); }
  const tabularShare = figures.length ? Math.round((figures.filter((f) => f.tabular).length / figures.length) * 100) / 100 : null;
  const rows = [...B.querySelectorAll('tbody tr, [role="row"]')].map((tr) => Math.round(tr.getBoundingClientRect().height)).filter((h) => h > 0);
  // 6. chart colours: saturated fills and strokes inside SVG charts and canvas-free charts
  const hues = new Map();
  for (const svg of B.querySelectorAll('svg')) {
    const r = svg.getBoundingClientRect(); if (r.width < 120 || r.height < 60) continue;
    for (const s of svg.querySelectorAll('path, rect, circle, line, polyline, polygon')) {
      const cs = getComputedStyle(s);
      for (const c of [cs.fill, cs.stroke]) { if (!c || c === 'none' || c.startsWith('url')) continue; const v = rgba(c); if (v.a < 0.3) continue; const h = hsl(v); if (h.s < 0.25 || h.l < 0.12 || h.l > 0.92) continue; const k = Math.round(h.h / 24); hues.set(k, (hues.get(k) || 0) + 1); }
    }
  }
  // bars and segments drawn with divs count too (a common way to fake a chart)
  // 7. placeholder data
  const text = B.innerText || '';
  const placeholders = [...new Set((text.match(/\b(John|Jane) Doe\b|\bAcme( Inc| Corp)?\b|\bLorem ipsum\b|\bexample\.com\b|\bUser Name\b|\bFirstname Lastname\b|\b123 Main St\b|\bfoo(bar)?\b/gi) || []).map((s) => s.toLowerCase()))];
  // 8. type at app sizes
  const sizes = new Map(); let tiny = 0; const tinySamples = [];
  const walker = document.createTreeWalker(B, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { const t = n.nodeValue.trim(); if (t.length < 2 || !n.parentElement) continue; const cs = getComputedStyle(n.parentElement); if (cs.visibility === 'hidden' || cs.display === 'none') continue; const s = Math.round(parseFloat(cs.fontSize)); sizes.set(s, (sizes.get(s) || 0) + t.length); if (s < 11 && t.length >= 3) { tiny++; if (tinySamples.length < 4) tinySamples.push(t.slice(0, 24) + ' ' + s + 'px'); } }
  const total = [...sizes.values()].reduce((a, b) => a + b, 0) || 1;
  const under13 = Math.round(([...sizes.entries()].filter(([s]) => s < 13).reduce((a, [, c]) => a + c, 0) / total) * 100) / 100;
  const h1 = document.querySelector('h1'); const h1r = h1 && h1.getBoundingClientRect();
  // the screen's hero: its h1 when that is on the first screen, else the largest text there. Text is read with a
  // space between element children, so a figure and its unit ("£55.94" and "at cost") do not run together.
  const spaced = (el) => { const out = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t && n.parentElement && !n.parentElement.closest('svg, script, style') && getComputedStyle(n.parentElement).display !== 'none') out.push(t); } return out.join(' ').replace(/\s+([,.;:!?%])/g, '$1').trim(); };
  let heroEl = h1 && h1r && h1r.width > 0 && h1r.top + SY < H * 0.95 ? h1 : null;
  if (!heroEl) {
    let best = null; const hw = document.createTreeWalker(B, NodeFilter.SHOW_TEXT);
    for (let n = hw.nextNode(); n; n = hw.nextNode()) {
      const el = n.parentElement; if (!el || n.nodeValue.trim().length < 2 || el.closest('svg, nav, aside, [role="navigation"]')) continue;
      const r = el.getBoundingClientRect(); if (r.top + SY > H * 0.95 || r.width < 1 || (sidebar && r.left < sidebar.w - 2)) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
      const size = parseFloat(cs.fontSize); if (!best || size > best.size) best = { el, size };
    }
    if (best) { heroEl = best.el; for (let p = heroEl; p && p !== B; p = p.parentElement) if (!/^inline/.test(getComputedStyle(p).display)) { heroEl = p; break; } }
  }
  let hero = null;
  if (heroEl) {
    const big = [...heroEl.querySelectorAll('*'), heroEl].map((e) => ({ e, s: parseFloat(getComputedStyle(e).fontSize) })).filter((o) => [...o.e.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim())).sort((a, b) => b.s - a.s)[0]?.e || heroEl;
    const cs = getComputedStyle(big), size = parseFloat(cs.fontSize), txt = spaced(heroEl), r = heroEl.getBoundingClientRect();
    const tops2 = []; const lw = document.createTreeWalker(heroEl, NodeFilter.SHOW_TEXT); const lr = document.createRange();
    for (let n = lw.nextNode(); n; n = lw.nextNode()) { if (!n.nodeValue.trim()) continue; lr.selectNodeContents(n); for (const rc of lr.getClientRects()) { const mid = rc.top + rc.height / 2; if (rc.width >= 1 && !tops2.some((t) => Math.abs(t - mid) < size * 0.55)) tops2.push(mid); } }
    const lh = parseFloat(cs.lineHeight);
    hero = { text: txt.slice(0, 200), words: txt.split(' ').filter(Boolean).length, chars: txt.length, lines: Math.max(1, tops2.length), size: Math.round(size), vw: Math.round((size / W) * 1000) / 10, font: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(), weight: +cs.fontWeight, tracking: Math.round(((parseFloat(cs.letterSpacing) || 0) / size) * 100) / 100, leading: Number.isFinite(lh) ? Math.round((lh / size) * 100) / 100 : 1.2, top: Math.round(r.top + SY), tag: heroEl.tagName.toLowerCase(), kind: 'heading', align: 'left', position: 'left' };
  }
  // charts and timelines on the screen (for the data-hue check): sizeable SVGs with marks, or blocks named as one
  const chartRe = /(^|[\s_-])(chart|plot|graph|timeline|calendar|cal|gantt|heatmap|matrix|strip)([\s_-]|$)/i;
  const chartCount = [...B.querySelectorAll('svg')].filter((s) => { if (s.parentElement && s.parentElement.closest('svg')) return false; const r = s.getBoundingClientRect(); return r.width >= 200 && r.height >= 80 && s.querySelectorAll('path, rect, line, polyline, circle').length >= 6 && shown(s); }).length
    + [...B.querySelectorAll('[class]')].filter((e) => typeof e.className === 'string' && chartRe.test(e.className) && !e.closest('svg') && (() => { const r = e.getBoundingClientRect(); return r.width >= 200 && r.height >= 80 && shown(e); })()).length;
  return {
    viewport: { w: W, h: H }, dark: lum(pageBg) < 0.2, ground: hex(pageBg),
    sidebar, topbar, canvas, hero, charts: chartCount,
    layout: { panels: tops.length, firstScreen, ragged: ragged.slice(0, 6), voids: voids.slice(0, 4) },
    tiles,
    panels: { count: panels.length, radii: [...radii.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6), heavyBorders, borderSamples, heavyShadows, softShadows, shadowSamples, glass },
    chips: { count: chips.length, hues: chipHues.size, samples: chips.slice(0, 4) },
    numbers: { cells: cells.length, leftAligned: leftNums, figures: figures.length, tabularShare, kpiMax: figures.length ? Math.max(...figures.map((f) => f.size)) : null },
    rows: rows.length ? { count: rows.length, median: rows.sort((a, b) => a - b)[Math.floor(rows.length / 2)] } : null,
    chartHues: hues.size,
    placeholders,
    type: { under13, tiny, tinySamples, sizes: [...sizes.keys()].sort((a, b) => a - b) },
    title: h1 && h1r.width > 0 ? { text: (h1.innerText || '').trim().slice(0, 60), size: Math.round(parseFloat(getComputedStyle(h1).fontSize)), top: Math.round(h1r.top + SY) } : null,
  };
}

// Share of a screenshot's pixels that are strongly coloured (saturated, neither near-black nor near-white).
// The studied app screens keep it near 3%; pale tints barely count. Runs inside any page; takes a data: URL.
export async function colourShare(dataUrl) {
  const img = new Image(); img.src = dataUrl; await img.decode();
  const w = 240, h = Math.max(1, Math.round((240 * img.height) / img.width));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    const s = mx === mn ? 0 : l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
    if (s >= 0.4 && l >= 0.18 && l <= 0.82) n++;
  }
  return Math.round((n / (w * h)) * 1000) / 1000;
}

// Dominant colours of a screenshot. Runs inside any page; takes a data: URL.
export async function palette(dataUrl) {
  const img = new Image(); img.src = dataUrl; await img.decode();
  const w = 96, h = Math.max(1, Math.round((96 * img.height) / img.width));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data; const bins = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4);
    const b = bins.get(k) || [0, 0, 0, 0]; b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++; bins.set(k, b);
  }
  const total = w * h;
  return [...bins.values()].sort((a, b) => b[3] - a[3]).slice(0, 6).map((b) => ({
    color: '#' + [0, 1, 2].map((i) => Math.round(b[i] / b[3]).toString(16).padStart(2, '0')).join(''), share: Math.round((b[3] / total) * 100) / 100,
  }));
}
