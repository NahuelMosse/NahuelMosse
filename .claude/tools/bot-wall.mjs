// bot-wall.mjs: tells a page the site served from the page the site is. A Cloudflare challenge loads fine, with a 403 or 503,
// and a capture of it looks like a capture of the site: probe, motion-audit and design-round ask here before they measure.
// External pages only (not loopback, not file:): our own app answers 404 and has short pages on purpose. KIT_BOT_WALL_LOCAL=1
// checks those too (the tests of this check use it).
// `wallOf(page, response, url)` returns the reason as a string, or null when the page is the site.
// Little visible text alone is not a wall: a page that is a canvas, a video or an app shell (WebGL sites) has none. A wall needs
// positive evidence (a status, a challenge title or marker); the thin-text rule applies only to a bare page with no media.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TITLES = /just a moment|attention required|verify you are human|access denied|are you a robot|security check|ddos protection/i;
const BODIES = /enable javascript and cookies|verify you are human|captcha|checking your browser|cf-chl|cf-browser-verification|access denied|unusual traffic/i;
// The same words without a bare «captcha»: in the markup of a live site a reCAPTCHA script on a sign-up form is not a challenge.
const BODIES_HTML = /enable javascript and cookies|verify you are human|checking your browser|cf-chl|cf-browser-verification|access denied|unusual traffic/i;
const MARKERS = /challenges\.cloudflare\.com|cf-turnstile|_px[a-z]*captcha|px-captcha|perimeterx|datadome|geo\.captcha-delivery|ak-challenge|akamai-bot|_abck|h-captcha|hcaptcha\.com\/1\/api|g-recaptcha|recaptcha\/(api|enterprise)|incapsula|_incapsula_resource/i;
const SHORT_TEXT = 200;
const MEDIA_SHARE = 0.25;
const SHELL_NODES = 40;
const WALL_TEXT = 1500;

export const isExternal = (url) => {
  if (process.env.KIT_BOT_WALL_LOCAL === '1') return true;
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && !['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(u.hostname);
  } catch { return false; }
};

// Pure: the reason for the numbers read from the page, or null.
// `media` is { share, nodes }: the biggest canvas/video as a share of the viewport and the visible element count; absent in old callers.
// Script, style and noscript bodies are never evidence: a shop's own script may name «captcha» without a challenge in sight.
// The opening tag stays, so a challenge script loaded by its `src` still counts.
// A script nothing closes before the end loses what follows it; a closed one keeps only its opening tag.
export const withoutScripts = (html) => String(html).replace(/(<(script|style|noscript)\b[^>]*>)(?![\s\S]*<\/\2)[\s\S]*$/i, '$1').replace(/(<(script|style|noscript)\b[^>]*>)[\s\S]*?<\/\2\s*>/gi, '$1');

export const reasonOf = ({ status, title, text, html: raw, media = { share: 0, nodes: 0 } }) => {
  const html = withoutScripts(raw);
  if (status >= 400) return `status ${status}`;
  if (TITLES.test(title)) return `title "${title.trim().slice(0, 60)}"`;
  const alive = media.share >= MEDIA_SHARE || media.nodes >= SHELL_NODES;
  const body = BODIES.exec(text) ?? (text.length < WALL_TEXT && !alive ? BODIES_HTML.exec(html) : null);
  if (text.length < WALL_TEXT && body) return `text matches "${body[0]}"`;
  const marker = text.length < WALL_TEXT && !alive ? MARKERS.exec(html) : null;
  if (marker) return `challenge marker "${marker[0]}"`;
  if (text.trim().length < SHORT_TEXT && !alive) return `only ${text.trim().length} characters of visible text`;
  return null;
};

export const wallOf = async (page, response, url) => {
  if (!isExternal(url)) return null;
  const read = await page.evaluate(() => ({ title: document.title, text: document.body?.innerText ?? '', html: (() => { const c = document.documentElement.cloneNode(true); c.querySelectorAll('script, style, noscript').forEach((n) => { n.textContent = ''; }); return c.outerHTML.slice(0, 60000); })(),
    media: {
      share: Math.max(0, ...[...document.querySelectorAll('canvas, video')].map((e) => { const r = e.getBoundingClientRect(); return (Math.min(r.width, innerWidth) * Math.min(r.height, innerHeight)) / (innerWidth * innerHeight); })),
      nodes: document.body ? document.body.querySelectorAll('*').length : 0,
    } })).catch(() => null);
  if (!read) return null;
  return reasonOf({ status: response?.status() ?? 0, ...read });
};

export const wallMessage = (url, reason) => `could not run: ${url} answered a bot wall / error page (${reason})`;
export class BotWall extends Error {
  constructor(url, reason, message = wallMessage(url, reason)) { super(message); this.botWall = true; }
}

// A `ref:` of a product screen (`ref-kind: product` in `## Look`) is captured only when the capture shows product UI. A login, a homepage or a
// docs page is never the reference of a dashboard. `productVerdict` is pure over the numbers `readProduct` reads in the page: { kind, why } with
// kind `login-wall`, `marketing` or `not-product`, or null when the page shows product UI. Measured on 26 public URLs: every login, every
// marketing page and the empty or blocked ones are caught; a status page counts by its words and its repeated rows.
const LOGIN_PATH = /(^|\/)(log[-_]?in|sign[-_]?in|signin|login|auth|sso|accounts?\/login)(\/|$|\?)/i;
const LOGIN_TITLE = /^\s*(log ?in|sign ?in)\b|\b(log ?in|sign ?in) (to|\|)/i;
const NOT_FOUND_TITLE = /\b(404|not found|page not found)\b/i;
const STATUS_WORDS = 3;
const STATUS_ROWS = 20;
export const productVerdict = (r) => {
  if (r.password || ((LOGIN_PATH.test(r.path) || LOGIN_TITLE.test(r.title)) && r.textLen < 800)) return { kind: 'login-wall', why: r.password ? 'visible password field' : `login ${LOGIN_PATH.test(r.path) ? 'path' : 'title'} with ${r.textLen} characters` };
  if (NOT_FOUND_TITLE.test(r.title)) return { kind: 'not-product', why: `the title says "${r.title.trim().slice(0, 60)}"` };
  if (r.textLen < 300 && /\bno data\b/i.test(r.text ?? '') && r.numerals < 3) return { kind: 'not-product', why: 'the only content is "No data"' };
  const status = r.statusWords >= STATUS_WORDS && r.rows >= STATUS_ROWS;
  const product = [r.numerals >= 8, r.rows >= 5, r.chart, r.sidebar || r.table, status].filter(Boolean).length;
  const marketing = [r.h1Px >= 44, r.cta, r.footerLinks >= 12, r.longParas >= 5].filter(Boolean).length;
  if ((r.h1Px >= 44 && r.cta && product < 3) || (marketing >= 2 && product < 2)) return { kind: 'marketing', why: `hero h1 ${Math.round(r.h1Px)}px${r.cta ? ' + CTA' : ''}, footer links ${r.footerLinks}, product signals ${product}/5` };
  if (product < 2) return { kind: 'not-product', why: `product signals ${product}/5 (numerals ${r.numerals}, rows ${r.rows}, chart ${r.chart}, sidebar or table ${r.sidebar || r.table}, status ${status})` };
  return null;
};

// Runs in the page, at the top of the document (the first viewport).
export const readProduct = () => {
  const vw = innerWidth; const vh = innerHeight;
  const vis = (el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && b.bottom > 0 && b.top < vh; };
  const all = [...document.body.querySelectorAll('*')].filter(vis);
  const text = document.body.innerText;
  const numerals = all.filter((e) => e.children.length === 0 && /\d/.test(e.textContent) && /^[\s\d.,:%+\-–−$€£kKmMgGbBsx/]+[A-Za-z%]{0,3}$/.test(e.textContent.trim())).length;
  let rows = 0;
  for (const p of all) {
    const kids = [...p.children].filter(vis); if (kids.length < 4) continue;
    const hs = kids.map((k) => k.getBoundingClientRect().height).filter((h) => h > 12 && h < 140); if (hs.length < 4) continue;
    const med = hs.slice().sort((a, b) => a - b)[hs.length >> 1];
    const same = kids.filter((k) => Math.abs(k.getBoundingClientRect().height - med) <= 3).length; if (same > rows) rows = same;
  }
  const chart = all.some((e) => ['svg', 'canvas'].includes(e.tagName.toLowerCase()) && e.getBoundingClientRect().width >= 300 && e.getBoundingClientRect().height >= 100);
  const sidebar = all.some((e) => { const b = e.getBoundingClientRect(); return (e.tagName === 'ASIDE' || e.tagName === 'NAV' || /sidebar/i.test(String(e.className))) && b.left <= 4 && b.width >= 48 && b.width <= 340 && b.height >= 0.6 * vh; });
  const h1Px = Math.max(0, ...all.filter((e) => e.tagName === 'H1' && e.getBoundingClientRect().top < 0.7 * vh).map((e) => parseFloat(getComputedStyle(e).fontSize)));
  const cta = all.some((e) => /^(A|BUTTON)$/.test(e.tagName) && /get started|sign up|start (for )?free|book a demo|request a demo|try .{0,20}free|contact sales|view components|get a demo|talk to sales/i.test(e.textContent));
  return {
    password: all.some((e) => e.matches('input[type=password]')), textLen: text.length, text: text.slice(0, 600), numerals, rows, chart, sidebar,
    table: !!document.querySelector('table, [role=table], [role=grid]'), h1Px, cta,
    footerLinks: Math.max(0, ...[...document.querySelectorAll('footer')].map((f) => f.querySelectorAll('a').length)),
    longParas: [...document.querySelectorAll('p')].filter((p) => p.textContent.trim().length > 120).length,
    statusWords: (text.match(/operational|degraded|outage|incident|uptime/gi) ?? []).length,
    title: document.title, path: location.pathname + location.search,
  };
};

// `ref-kind: product` in the `## Look` of the card in progress (`specs/.current`), or KIT_REF_KIND=product.
export const refKindOf = (root = process.cwd()) => {
  if (process.env.KIT_REF_KIND) return process.env.KIT_REF_KIND;
  try {
    const cur = readFileSync(join(root, 'specs', '.current'), 'utf8').trim();
    const look = readFileSync(join(root, 'specs', cur, 'card.md'), 'utf8').split(/^## /m).find((x) => /^Look\b/.test(x));
    return look?.match(/^\s*[-*]?\s*ref-kind:\s*([\w-]+)/im)?.[1].toLowerCase() ?? null;
  } catch { return null; }
};

const KIND_LABEL = { 'login-wall': 'login wall', marketing: 'marketing page', 'not-product': 'page with no product UI' };
export const productMessage = (url, v) => `could not run: ${url} is a ${KIND_LABEL[v.kind] ?? v.kind} (${v.why}): the ref of a product screen shows product UI; use a public demo or a public page of the product itself`;
// The reason a reference page cannot stand for a product screen, or null (also null when the card is not `ref-kind: product`, or the page is our own).
export const productRefOf = async (page, url, root = process.cwd()) => {
  if (!isExternal(url) || refKindOf(root) !== 'product') return null;
  const read = await page.evaluate(readProduct).catch(() => null);
  const v = read ? productVerdict(read) : null;
  return v ? productMessage(url, v) : null;
};
