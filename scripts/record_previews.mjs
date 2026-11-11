// Records the raw footage for the animated project previews; scripts/build_previews.py runs this and turns the videos
// into the repo cards' WebPs. Rebuilt by hand, not by the daily workflow.
//
//   node scripts/record_previews.mjs --portfolio ../Portfolio-d --site http://localhost:<port> --out <dir> [--only <key>]
//
// - portfolio: the site scrolled chapter by chapter, from a `next start` of the checkout's build at --site. The cold open
//   and the closing chapters are left out: they carry the owner's portrait.
// - motion-audit, http-attack, migrations-safe: each tool cloned into <out>/tools and run for real on its own test
//   fixture (a fixture page, a deliberately vulnerable API on 127.0.0.1, a SQLite seed and migration), then its real
//   output replayed in a terminal at a fixed pace, since the real runs take 30 to 50 s.
// Playwright comes from the portfolio checkout's node_modules.
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const portfolio = resolve(arg("portfolio", "../Portfolio-d"));
const site = arg("site");
const out = resolve(arg("out", "previews-raw"));
const only = arg("only");
const nodeModules = join(portfolio, "node_modules");
const { chromium } = createRequire(nodeModules + "/")("playwright");
mkdirSync(out, { recursive: true });
const wanted = (key) => !only || only === key;

const VIEW = { width: 1280, height: 720 };
const browser = await chromium.launch();

// Opens `url`, runs `act` while recording, and keeps the video as <out>/<key>.webm and the length of the action, which
// is the end of the video, in <out>/<key>.json.
async function record(key, url, prepare, act) {
  const tmp = join(out, `tmp-${key}`);
  rmSync(tmp, { recursive: true, force: true });
  const context = await browser.newContext({ viewport: VIEW, colorScheme: "dark", recordVideo: { dir: tmp, size: VIEW } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await prepare(page);
  const t0 = Date.now();
  await act(page);
  const seconds = (Date.now() - t0) / 1000;
  await context.close();
  renameSync(join(tmp, readdirSync(tmp).find((f) => f.endsWith(".webm"))), join(out, `${key}.webm`));
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(join(out, `${key}.json`), JSON.stringify({ seconds }));
  console.log(`${key}: ${seconds.toFixed(1)} s`);
}

if (site && wanted("portfolio"))
  await record("portfolio", site, async (page) => {
    await page.waitForTimeout(4000);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(h / 12));
    await page.waitForTimeout(2500);
  }, async (page) => {
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 720); await page.waitForTimeout(1250); }
  });

// ---------- the tools, run on their fixtures ----------

const tools = join(out, "tools");
mkdirSync(tools, { recursive: true });
function clone(name) {
  const dir = join(tools, name);
  if (!existsSync(dir)) execFileSync("git", ["clone", "-q", "--depth", "1", `https://github.com/NahuelMosse/${name}`, dir]);
  return dir;
}
function run(cwd, file, args) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [file, ...args], { cwd, env: { ...process.env, MSYS_NO_PATHCONV: "1", NO_COLOR: "1" } });
    let text = "";
    child.stdout.on("data", (d) => (text += d));
    child.stderr.on("data", (d) => (text += d));
    child.on("close", () => done(text.replace(/\r/g, "").trimEnd()));
  });
}

const demos = [];

if (wanted("motion-audit")) {
  const dir = clone("motion-audit");
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  for (const p of ["playwright", "playwright-core"])
    if (!existsSync(join(dir, "node_modules", p))) symlinkSync(join(nodeModules, p), join(dir, "node_modules", p), "junction");
  const output = await run(join(dir, "test", "fixtures"), join(dir, "skills/motion-audit/scripts/motion-audit.mjs"), ["bad.html", "--out", "report"]);
  demos.push({ key: "motion-audit", title: "motion-audit · test/fixtures/bad.html", command: ["npx motion-audit bad.html --out report"], output });
}

if (wanted("http-attack")) {
  const dir = clone("http-attack");
  const server = spawn(process.execPath, [join(dir, "tests/fixtures/vulnerable-server.mjs"), "0", ":memory:"]);
  const port = await new Promise((ok) => { let s = ""; server.stdout.on("data", (d) => { s += d; const m = s.match(/ on (\d+)/); if (m) ok(m[1]); }); });
  const args = [`http://127.0.0.1:${port}`, "--header", "Authorization: Bearer alice", "--other-header", "Authorization: Bearer bob",
    "--write", 'POST /items {"name":"Ana","email":"ana@example.com"}', "--write", 'POST /notes {"title":"Hello"}',
    "--read", "/items?limit=10", "--search", "/items q", "--unique", 'POST /items {"name":"Uno","email":"uno@example.com"}'];
  const output = await run(dir, join(dir, "skills/http-attack/scripts/http-attack.mjs"), args);
  server.kill();
  demos.push({ key: "http-attack", title: "http-attack · tests/fixtures/vulnerable-server.mjs", output, command: [
    `npx http-attack http://127.0.0.1:${port} \\`,
    `  --header "Authorization: Bearer alice" --other-header "Authorization: Bearer bob" \\`,
    `  --write 'POST /items {"name":"Ana","email":"ana@example.com"}' --write 'POST /notes {"title":"Hello"}' \\`,
    `  --read '/items?limit=10' --search '/items q' --unique 'POST /items {"name":"Uno","email":"uno@example.com"}'`] });
}

if (wanted("migrations-safe")) {
  const dir = clone("migrations-safe");
  const work = join(tools, "migrations-safe-fixture");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  execFileSync("bash", [join(dir, "evals/sqlite-rehearsal/fixture.sh").replace(/\\/g, "/")], { cwd: work });
  const output = await run(work, join(dir, "skills/migrations-safe/scripts/migrations-safe.mjs"), ["rehearse", "db/seed.sql", "db/migrations/0007_tasks_cleanup.sql"]);
  demos.push({ key: "migrations-safe", title: "migrations-safe · evals/sqlite-rehearsal", output,
    command: ["npx migrations-safe rehearse db/seed.sql db/migrations/0007_tasks_cleanup.sql"] });
}

// The replay: the command typed, then the real output line by line, then a hold on the end of the report.
const font = join(portfolio, "public", "fonts", "courier-prime-400.woff2").replace(/\\/g, "/");
for (const demo of demos) {
  writeFileSync(join(out, `${demo.key}.txt`), demo.output + "\n");
  const html = join(out, `${demo.key}.html`);
  writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:CP;src:url("file:///${font}")}
html,body{margin:0;background:#0c0c0b;height:100%;overflow:hidden}
body{font:28px/1.36 CP,monospace;color:#ede4d0}
.bar{height:64px;display:flex;align-items:center;gap:14px;padding:0 30px;border-bottom:1px solid #2a2824;color:#8a8273;font-size:20px;letter-spacing:.12em}
.bar i{width:14px;height:14px;background:#d2231b;display:inline-block}
#t{position:absolute;inset:64px 0 0 0;padding:20px 30px;overflow:hidden;white-space:pre}
.p{color:#d2231b}.c{color:#ede4d0}.dim{color:#6f695e}.bad{color:#d2231b}.sum{color:#ede4d0;font-weight:bold}
</style><div class="bar"><i></i>${demo.title.toUpperCase().replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div><div id="t"></div>
<script>
const command = ${JSON.stringify(demo.command)}, lines = ${JSON.stringify(demo.output.split("\n"))};
const t = document.getElementById("t");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function cls(l) {
  if (/^(FAIL|error|LOST)\\b/.test(l)) return "bad";
  if (/^(pass|warning)\\b/.test(l) || /^\\s/.test(l)) return "dim";
  if (/probes run|to fix|problem\\(s\\)|^audited|^runner/.test(l)) return "sum";
  return "c";
}
function add(html) { const d = document.createElement("div"); d.innerHTML = html || " "; t.appendChild(d); t.scrollTop = t.scrollHeight; }
window.play = async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < command.length; i++) {
    const d = document.createElement("div"); t.appendChild(d);
    const pre = i ? "" : '<span class="p">$</span> ';
    for (let k = 1; k <= command[i].length; k += 3) { d.innerHTML = pre + esc(command[i].slice(0, k)); await sleep(14); }
    d.innerHTML = pre + esc(command[i]);
  }
  await sleep(500);
  const gap = Math.max(25, Math.min(380, 6200 / lines.length));
  for (const l of lines) { add('<span class="' + cls(l) + '">' + esc(l) + "</span>"); await sleep(gap); }
  await sleep(2600);
};
</script>`);
  await record(demo.key, "file:///" + html.replace(/\\/g, "/"), async () => {}, async (page) => { await page.evaluate(() => window.play()); });
}

await browser.close();
