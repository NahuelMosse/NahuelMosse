// Records the raw footage of the portfolio's animated preview; scripts/build_previews.py runs this and turns the video into
// the repo card's WebP. Rebuilt by hand, not by the daily workflow.
//
//   node scripts/record_previews.mjs --portfolio ../Portfolio-d --site http://localhost:<port> --out <dir>
//
// The site is scrolled chapter by chapter from a `next start` of the checkout's build at --site. The cold open and the
// closing chapters are left out: they carry the owner's portrait. Playwright comes from the checkout's node_modules.
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const portfolio = resolve(arg("portfolio", "../Portfolio-d"));
const site = arg("site");
const out = resolve(arg("out", "previews-raw"));
if (!site) throw new Error("--site is required: a `next start` of the portfolio checkout");
const { chromium } = createRequire(join(portfolio, "node_modules") + "/")("playwright");
mkdirSync(out, { recursive: true });

const VIEW = { width: 1280, height: 720 };
const browser = await chromium.launch();
const tmp = join(out, "tmp-portfolio");
rmSync(tmp, { recursive: true, force: true });
const context = await browser.newContext({ viewport: VIEW, colorScheme: "dark", recordVideo: { dir: tmp, size: VIEW } });
const page = await context.newPage();
await page.goto(site, { waitUntil: "networkidle" });
await page.waitForTimeout(4000);
const height = await page.evaluate(() => document.documentElement.scrollHeight);
await page.evaluate((y) => window.scrollTo(0, y), Math.round(height / 12));
await page.waitForTimeout(2500);
const t0 = Date.now();
for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 720); await page.waitForTimeout(1250); }
// The length of the scroll, which is the end of the video; build_previews.py cuts the loading before it.
const seconds = (Date.now() - t0) / 1000;
await context.close();
await browser.close();
renameSync(join(tmp, readdirSync(tmp).find((f) => f.endsWith(".webm"))), join(out, "portfolio.webm"));
rmSync(tmp, { recursive: true, force: true });
writeFileSync(join(out, "portfolio.json"), JSON.stringify({ seconds }));
console.log(`portfolio: ${seconds.toFixed(1)} s`);
