# Performance and load testing: rules a card can meet and a reviewer can check

**When it is read:** when the card has a performance requirement, touches a hot path (the
word `hot-path` on its line of `## Tasks`), adds a list or an endpoint that grows with the data, a front
route, or when a release asks for the full load test. **How:** only the sections the card touches, with
`Read` and a line range of the heading; never whole. `card.md` names the rule IDs that apply, and the
`builder` receives those IDs and their ranges. **Tools are options, not obligations:** k6, Gatling,
JMeter, Locust, Artillery, autocannon and wrk2 are named as options; a rule demands a property (open
model, percentiles, a threshold that cuts the pipeline), never a tool. **[NV] marks guidance not
verified**: a hypothesis, never the only evidence of a `meets`; **[kit convention]** marks a threshold
that does not come from a source. The plan and report templates are `templates/load-test.md` (module api). How each
rule is checked: `J` judgment with written evidence, `C` a command that exits 0 or not, `T` an automated
test. Source numbers `Bn` and `Ln` are in Sources. None of the example commands or scripts was run.

## Rules that are criteria

| Rule | Criterion |
|---|---|
| PERF-01 | R9 |
| PERF-02, PERF-03, PERF-09, PERF-13, PERF-14, LOAD-06 | O10 |
| PERF-04, PERF-05, PERF-06, PERF-07, PERF-10, PERF-11 | O15 |
| PERF-08, PERF-12, LOAD-01, LOAD-02, LOAD-03, LOAD-04, LOAD-05, LOAD-07, LOAD-08, LOAD-09, LOAD-10, LOAD-11, LOAD-12, LOAD-13, LOAD-14, LOAD-15, LOAD-16, LOAD-19, LOAD-21, LOAD-22, LOAD-23, LOAD-24 | O22 |
| LOAD-20 | O22 |
| LOAD-25 | A1 |
| FE-PERF-MOD-01, FE-PERF-MOD-02, FE-PERF-CAR-07, FE-PERF-JS-01, FE-PERF-INT-01, FE-PERF-INT-02, FE-PERF-INT-05, FE-PERF-CLS-01, FE-PERF-CLS-03, FE-PERF-MEM-02, FE-PERF-MED-01, FE-PERF-MED-02, FE-PERF-MED-03, FE-PERF-MED-04 | O15 |
| FE-PERF-REN-07 | I25 |

The rules outside this table are judgment or guidance, with no criterion of their own.

## 1. Default budgets (as ASM when the card gives none)

When the card gives no number, `card.md` writes the default as an `ASM-NN` with its source (PERF-01). Where
a source gives an example and not a norm, it says so; the builder proposes another value with a source
if the card justifies it.

| What | Default | Source and nature |
|---|---|---|
| LCP (p75, mobile and desktop) | 2.5 s or less | B29, official threshold [V] |
| INP (p75) | 200 ms or less | B29, official threshold [V] |
| CLS (p75) | 0.1 or less | B29 [V]; already in the node-ts screen spec |
| Response to a local interaction (no network) | 100 ms or less; a long task 50 ms or less | B37 (0.1 s) and B31 RAIL [V] |
| Critical-path JS, “JS-light” site (about 15 % JS), loaded in 3 s at p75 | 0.3 MiB or less (total 2.0 MiB or less) | B30 (Russell, “The Performance Inequality Gap, 2026”) [V]; the article **does not say whether the MiB are compressed**: measuring compressed is the conservative reading |
| Critical-path JS, “JS-heavy” SPA (about 50 % JS), loaded in 3 s at p75 | 0.62 MiB or less (total 1.2 MiB or less) | B30 [V]; same compression caveat |
| Same with a 5 s goal | JS-light 0.57 / 3.7 MiB; JS-heavy 1.15 / 2.3 MiB | B30 [V] |
| Lighthouse | `categories:performance` of 0.9 or more as *warn*; hard assertions over CWV and bytes | B32, an example of the docs, not a norm [V] |
| An interactive API read by a screen (p95, in the test environment, no other load) | 200 ms or less | An example of B38 (“p95 ≤ 200 ms”) and of the k6 docs [V]: an example, not a norm; coherent with the screen answering in under 1 s (B37) |
| API: budget per layer | API 400 ms · database 150 ms · errors 1 % or less | A literal example of B38 [V]; useful as a split when the total is about 1 s |
| Error rate under nominal load | 1 % or less (and 0 % of unhandled 5xx) | B38 [V] for the 1 %; the 0 % is the study's criterion [kit convention] |
| An operation the user waits for (export, report) | over 1 s shows progress; over 10 s progress with an estimate or background work | B37 [V] |
| Growth with the volume | p95 at 10x the data is at most 2 × the p95 at the requirement's data | [kit convention] (PERF-09) |
| Runs per measurement | 3 or more in the lab (LHCI); 2 or more in a row for load | B32 [V]; Grafana k6 “run each test at least twice” (L7) [V] |
| Resource limiting under nominal load | 70 % utilization or less | [kit convention] (Little and queueing: latency grows non-linearly near 1) |
| Regression that fails a gate | +10 % of p95 or p99 and outside the spread between runs | [kit convention] (LOAD-23) |

The per-card smoke test stays the 200-requests-per-screen script of the node-ts profile (O10): a sequential
measure of the service time, under the O10 budget. The fixed-rate script of section 4 enters when the card
asks for requests per second or concurrency; the full test (criterion O22) is for a release, a hot-path
card or a volume requirement.

## 2. Performance (PERF)

**PERF-01** — Every performance requirement has a number, a percentile, a load condition and a data volume; if the card does not give it, ask (AMB) and, if it expires, assume the default of section 1 as an ASM. · How J · criterion R9 · Check: the plan has “p95 ≤ X ms with N rows and R req/s” or the corresponding ASM · Source B38, B29.

**PERF-02** — Report percentiles (p50, p95, p99) and the maximum; never averages alone; do not average percentiles across windows or instances. · How C · criterion O10 · Check: `rg -n -i "avg|average|mean" <measurement script>`: if it appears, p95/p99/max appear too. The node-ts profile's script (p95 of 200 orders) is partial: it lacks p99 and max · Source B34, B22.

**PERF-03** — Measure the latency of errors together with that of successes and report the error rate of the same run. · How C · criterion O10 · Check: the report has `errors / total` and the latency includes the failed responses · Source B22.

**PERF-04** — Frontend: Core Web Vitals at p75 —LCP 2.5 s or less, INP 200 ms or less, CLS 0.1 or less— measured in the field (RUM, CrUX) when there is traffic and in the lab (Lighthouse) always. · How C · criterion O15 · Check: Lighthouse CI with assertions; in the field `web-vitals` reporting to an endpoint; node-ts `npx @lhci/cli autorun` with a `lighthouserc.json`; in navigation mode it gives no INP, so Playwright with the `web-vitals` library (onLCP, onINP, onCLS with `reportAllChanges`), CPU x4 through CDP and the card's interactions is the lab measure of the node-ts profile. The lab is an approximation of the p75 of field data · Source B29.

**PERF-05** — A bytes budget in CI: critical-path JS at or under the value of section 1 according to the type of site, measured compressed, and the build fails if it is exceeded. · How C · criterion O15 · Check: `npx size-limit` in CI; node-ts `"size-limit": [{ "path": "dist/assets/*.js", "limit": "300 kB" }]`; generic `resource-summary:script:size` in LHCI. size-limit measures with Brotli by default, Gzip optional · Source B30, B33, B31.

**PERF-06** — Lighthouse/LHCI with at least 3 runs and the median; never a single run as evidence. · How C · criterion O15 · Check: `lighthouserc.json` without `numberOfRuns: 1` (the default is 3) · Source B32.

**PERF-07** — Main-thread work in chunks of 50 ms or less; nothing long and synchronous in an interaction handler. · How T · criterion O15 · Check: Playwright: a `PerformanceObserver` of `longtask` during the interaction: none above 50 ms in the card's scenario (with CPU throttling x4 to approximate the reference device) · Source B31 (RAIL).

**PERF-08** — Backend: latency is measured with open load (a fixed arrival rate) when the question is “how does it behave at N req/s”; a sequential client only measures the service time with no queue. · How C · criterion O22 · Check: see LOAD-04. The 200-orders script of the node-ts profile is sequential: it measures service time, not behavior under load · Source B34, L5.

**PERF-09** — Every endpoint that lists is bounded (pagination with a maximum limit) and its latency does not grow with the volume: measure with the requirement's volume and with 10x. · How T · criterion O10 · Check: a test with N and 10N rows: p95(10N) / p95(N) is 2 or less [kit convention threshold]. Intent covered by K10 and O10 (“does not degrade with more data”); the explicit 10x was missing. See DB-IDX-07 in `reference/database.md` (module data) · Source B26.

**PERF-10** — HTTP responses with an explicit `Cache-Control`: hashed assets `public, max-age=31536000, immutable`; HTML and API with user data `private` or `no-store`; nothing depends on heuristics. · How T · criterion O15 · Check: a test asks for an asset, an HTML and an authenticated endpoint and checks each one's header; node-ts `expect(res.headers.get('cache-control')).toBe('private, no-store')` on the user endpoint; `immutable` is RFC 8246 [NV] · Source B36.

**PERF-11** — If a response varies by a header (language, `Authorization`, encoding), declare `Vary`; never a shared cache of an authenticated response without `private`. · How T · criterion O15 · Check: the same test as PERF-10 with two users · Source B36.

**PERF-12** — Under saturation the service rejects or degrades (a concurrency limit, a bounded queue, 503/429 with `Retry-After`) instead of queueing without limit. · How T · criterion O22 · Check: a stress test: above the capacity, the success rate of what is admitted is kept and memory does not grow without a ceiling · Source B26, L11.

**PERF-13** — Every optimization brings a before/after measurement on the same machine, volume and runs; without a measurement the change is not accepted for performance. · How J · criterion O10 · Check: the PR shows both tables. O10 (a machine with no other load) is partial · Source B35, B38.

**PERF-14** — When diagnosing, walk USE per resource (CPU, memory, disk, network, connection pool, event loop) before touching code. · How J · criterion O10 · Check: the analysis names the limiting resource and its evidence; node-ts `monitorEventLoopDelay()` of `node:perf_hooks` for event-loop saturation, `pool.waitingCount` of `pg` for the pool · Source B35.

## 3. Load testing (LOAD)

**Test types** (L4, L7, L15). **Smoke:** is the script working and does the system answer with minimal load (1–5 VU or a few req/s; seconds to minutes; every change, in CI). **Load (average-load):** does it meet the objectives under the expected load; it is the **baseline** (the requirement's nominal load; 5–60 min; often, per release). **Stress:** what happens above what is expected, and does it degrade in control (above the average, for instance peak × 1.5–2; 5–60 min; before production and for planned peaks). **Spike:** does it survive a sudden jump, does the autoscaling arrive, does it recover (very high, rising in seconds; minutes; public apps, events). **Soak / endurance:** do leaks or exhaustion show up over time (memory, connections, disk) (the nominal load; hours; after load passes, before big releases). **Breakpoint / capacity:** where is the limit and which resource saturates first (a rising ramp until it breaks; rarely, to plan capacity). The type is chosen by the question and declared in the plan.

**Method.** (1) The objective comes from the SLO: the test verifies numbers that exist before it; with no SLO the number comes from the card or is an ASM. (2) The load model is declared: *open* (an arrival rate; users do not wait for the system to finish before arriving: how public traffic behaves) or *closed* (a fixed population that waits for the response and thinks: a worker pool or a batch client). (3) Arrival rate, think time (only in a closed model) and the scenario mix with the proportions of real use; varied input data so as not to hit the same row. (4) The database with the requirement's volume (and 10x for PERF-09) and a realistic distribution. (5) A discarded and declared warm-up. (6) A representative, isolated environment: the machine measured has no other load (O10 measured it: 84 ms alone against 589 ms with two inspections in parallel). (7) The generator outside the measured machine, or declared: if it shares the machine, the report says so and gives the generator's CPU; if it cannot be moved, the result is “could not run” for the absolute gate and “measured locally” as data. (8) At least two identical runs in a row and the spread between them reported. (9) Enough samples for the percentile: at least 10 / (1 − p) requests (p95: 200, p99: 1000, p99.9: 10,000) [kit convention derivation, NV as a norm]; it matches the 200 orders of the node-ts script for p95.

**Measurement.** p50, p95, p99 and max; throughput achieved against offered (if the achieved is below the offered in an open model, the system is already saturated); the error rate of the same run with the errors' latency included; saturation (USE) per resource during the run. **Coordinated omission:** in a closed model (or with a generator that waits), when the system stalls the generator stops sending and does not record the wait of the requests that should have gone out; the high percentiles come out optimistic by orders of magnitude (L1, L2, L5). The remedy: an open model with the latency measured from the scheduled instant (wrk2, the `arrival-rate` executors of k6, Gatling's `injectOpen`, Artillery's `arrivalRate`) or the `recordValueWithExpectedInterval` correction (L3). HDR histograms record all the samples with a bounded relative error and combining runs is done by **adding histograms**, not by averaging percentiles (the combination by sum [NV] in the pages opened). **Little's law (L = λW)** is the coherence check: with 200 req/s and 50 ms each there are on average 10 in the system; a pool of 5 connections with 40 ms of use per request saturates at 125 req/s; if the report contradicts Little, the measurement is wrong (L10). **USL (Gunther):** with 6 or more points (concurrency, throughput) alpha (contention) and beta (coherence, which makes the throughput *drop*) are fitted, and N_max = √((1−α)/β) (L9). **Queues:** latency grows non-linearly as utilization approaches 1; in an M/M/1, R = S / (1 − ρ): at 50 % the response is 2× the service, at 90 % 10× (standard queueing theory, [NV] this session); hence the capacity objective is set with margin.

**Tools (options).**

| Tool | Script | Open model | Threshold that cuts CI | Note |
|---|---|---|---|---|
| k6 | JavaScript (own runtime, not Node) | yes: `constant-arrival-rate`, `ramping-arrival-rate` [V] | `thresholds` + `abortOnFail` [V] | A good default option for CI gates |
| Gatling | Scala/Java/Kotlin (and JS/TS) | yes: `injectOpen` [V] | assertions [NV] | Detailed HTML reports |
| JMeter | GUI/XML | “Open Model Thread Group” [V existence] | assertions/plugins [NV] | Heavy to maintain as code |
| Locust | Python | not native: users with `wait_time`; `constant_throughput` only bounds [V] | configurable exit code [NV] | Beware of CO |
| Artillery | YAML + JS | `arrivalRate` (VU arrivals) [V] | the `ensure` plugin, non-zero exit [V] | |
| autocannon | Node (CLI and API) | a maximum rate with `-R` [V]; CO correction [NV] | through the API: compare results and `process.exit(1)` | Micro-benchmarks of a Node endpoint |
| wrk2 | Lua | yes, constant rate and corrected latency [V] | not native: parse the output | wrk measures from when the request leaves and each connection waits for the response (CO); wrk2 fixes the rate and measures from the scheduled instant; the project is marked experimental [V] |

### Objective and design

**LOAD-01** — Every load test starts from objectives written before running it: latency percentile, maximum error rate, throughput and data volume, derived from the SLO, the card or an ASM. · How J · criterion O22 · Check: the plan (template `templates/load-test.md`, module api) has the “Objective” section with a number and an origin for each · Source L15.

**LOAD-02** — Choose the type of test by the question (the types above) and do not call a smoke a “load test”. · How J · criterion O22 · Check: the plan names the type and its question · Source L4.

**LOAD-03** — Declare the load model (open or closed) and justify it by how real traffic arrives; public users' traffic → open. · How J+C · criterion O22 · Check: k6 the scenario uses `constant-arrival-rate`/`ramping-arrival-rate` (`rg -n "arrival-rate" load/`); Artillery `arrivalRate`; Gatling `injectOpen` · Source L5, L18.

**LOAD-04** — If the question is “latency under N req/s”, measure the latency from each request's scheduled instant (an open model or a coordinated-omission correction); a loop that waits for each response does not answer that question. · How T · criterion O22 · Check: the “CTRL+Z” test of L1: pause the server 2 s during the run (`kill -STOP <pid>; sleep 2; kill -CONT <pid>`): the reported p99 must reflect seconds, not milliseconds; if not, the generator has CO; node-ts the script of section 4; generic wrk2 `-R`, k6 *arrival-rate* · Source L1, L2, L3, L5.

**LOAD-05** — The scenario mix and its proportions come from real use or the requirement, and the input data vary (ids, filters, users) so as not to measure one hot row. · How J+C · criterion O22 · Check: the script reads ids from a file or generates them at random over the seed; `rg -n "/items/1\b|id=1\b" load/` is empty · Source L15.

**LOAD-06** — The database has the requirement's volume and distribution before measuring (and 10x if growth is evaluated), with the seed versioned and reproducible. · How C · criterion O10 · Check: `SELECT count(*)` of the main tables in the report; a seed script in the repo with a fixed seed · Source L15, B26 (PERF-09).

**LOAD-07** — External dependencies under load are treated in a declared way: real (when the requirement is end to end and the third party allows it) or simulated with realistic latency; never an instant mock without saying so. · How J · criterion O22 · Check: the plan lists each dependency and its mode; the stub has configured latency (for instance p50 80 ms / p99 400 ms measured from the third party). D8 and E8 (timeout policy): the test must exercise it · Source L15.

### Environment and execution

**LOAD-08** — The environment replicates the shape of production (database type and version, pool, cache, CPU/memory limits) and the differences are declared in the report. · How J · criterion O22 · Check: the “Environment” table of the report · Source L15, `reference/ci-cd.md` (module ci) DPL-02.

**LOAD-09** — The generator runs on another machine or container with its own resources; if it shares the machine, it is declared and its CPU use is reported. · How C · criterion O22 · Check: the report has “generator: host X, max CPU Y %”. If the generator passes about 80 % of CPU the run is worth nothing [kit convention threshold] · Source L8, O10 of the kit (measured).

**LOAD-10** — An explicit and discarded warm-up; the measurement starts after it. · How C · criterion O22 · Check: the script or the tool has the warm-up phase with a duration; the report names it (autocannon `-W`, wrk2 calibrates at least 10 s) · Source L17, L2.

**LOAD-11** — Do not measure with a misleading hot cache: if production sees cache misses (first visit, diverse keys, TTL) the test reproduces them; if measured with a hot cache, it is also reported cold. · How J · criterion O22 · Check: two rows in the report (cold/hot) or a justification of why one is enough · Source L15.

**LOAD-12** — Run each test at least twice in a row, identical, and report the difference between runs; if the difference exceeds the regression to be detected, the test does not serve as a gate. · How C · criterion O22 · Check: the report has the runs separately · Source L7.

**LOAD-13** — During the run observe USE of each resource (CPU, memory, event loop, database pool, network) and report which one limits. · How C+J · criterion O22 · Check: node-ts `monitorEventLoopDelay()` (`node:perf_hooks`), `process.memoryUsage()`, `pg`'s `pool.waitingCount` sampled every second; generic `pidstat`, `vmstat`, provider metrics · Source L8, L11 (capacity in resources, not in QPS).

### Measurement and reading

**LOAD-14** — Report p50, p95, p99, max, throughput achieved against offered and error rate; no average without percentiles next to it; never averages of percentiles. · How C · criterion O22 · Check: the report's JSON has `p50, p95, p99, max, rps_offered, rps_achieved, errors` · Source L1, L12.

**LOAD-15** — The number of requests measured is enough for the percentile reported (10 / (1 − p) or more); with fewer, the percentile is not reported. · How C · criterion O22 · Check: the script computes `n >= 10 / (1 - p)` before printing each percentile. 200 requests are enough for p95, not for p99 · Source [kit convention] derivation, NV as a norm.

**LOAD-16** — Errors count: the latency includes the failed responses and the error rate is a threshold of its own (1 % or less by default); a client timeout is an error, not a discarded sample. · How C · criterion O22 · Check: the script adds `!res.ok` and exceptions to `errors` and records their latency · Source L12, L15.

**LOAD-17** — Check the report against Little's law (mean concurrency about throughput × mean latency); if it does not close, review the measurement before concluding. · How J · criterion none · Check: one line in the report with the calculation · Source L10.

**LOAD-18** — In capacity tests measure at least 6 load levels and, if extrapolating, fit the USL and report alpha, beta and N_max; do not extrapolate linearly. · How J · criterion none · Check: a table of levels and coefficients · Source L9.

**LOAD-19** — Above the capacity, the system rejects or degrades in control (429/503, a bounded queue, load shedding) and recovers when the load drops; the stress/spike test verifies it. · How T · criterion O22 · Check: a spike at 2–3× the capacity: what is admitted keeps its SLO, what is rejected answers fast with 429/503, memory does not grow without a ceiling, and after the peak the p95 returns to the baseline within N minutes · Source L11, L14.

**LOAD-20** — A soak before a release that changes connection handling, cache or queues: memory, descriptors and connections at the end are about those at the start (steady state). · How C · criterion O22 · Check: sample `process.memoryUsage().heapUsed` and open connections every minute; slope about 0 in the second half · Source L4, L15, L14.

### Gates and regression

**LOAD-21** — The thresholds are in the script and make the pipeline fail (exit code non-zero); there is no threshold that is only read on a chart. · How C · criterion O22 · Check: k6 `thresholds`; Artillery strict `ensure`; autocannon through the API with `process.exit(1)`; the node-ts script of section 4 · Source L6, L20.

**LOAD-22** — A load smoke per card that touches a hot endpoint (in CI, seconds); a full load test per release, in a dedicated environment; stress/soak/breakpoint according to risk. · How C · criterion O22 · Check: a CI job `load-smoke` on the PR; a `load-release` job scheduled or manual. The plan's `load:` line in `## Verification` is run through `once.mjs` and `required.mjs` asks for it when the File map says `hot-path` · Source L7.

**LOAD-23** — Each test is compared against a saved baseline (same script, data, environment); a regression of p95 or p99 above the agreed threshold (for instance +10 % and outside the spread between runs [kit convention]) fails. · How C · criterion O22 · Check: a versioned `baseline.json` and a comparison script · Source L7, L15.

**LOAD-24** — If the script, the mix, the data or the environment changes, a new baseline is created and it is not compared with the old one. · How J · criterion O22 · Check: the baseline stores the hash of the script and a description of the environment; if it differs, the comparison is skipped and declared · Source L7.

**LOAD-25** — The report uses the template and declares what did not run (the three states of the kit): a test that did not run is not “passed”. · How C · criterion A1 · Check: `rg -n "Not run" specs/<card>/load-report.md` when it applies · Source the method's invariant 3.

## 4. Example: an open fixed-rate load with no dependencies (node-ts)

The open variant of the 200-orders script: it measures from the scheduled instant, so a pause of the server
or of the generator itself shows in the latency (the conservative side). It enters when the card asks for
requests per second or concurrency.

```ts
// load/open-rate.ts — node --experimental-strip-types load/open-rate.ts
const url = process.env.TARGET_URL!;
const rate = Number(process.env.RATE ?? 50);          // offered requests/s
const seconds = Number(process.env.SECONDS ?? 30);
const warmup = Number(process.env.WARMUP ?? 5);       // discarded seconds
const p95Max = Number(process.env.P95_MS ?? 200);
const errMax = Number(process.env.ERR_RATE ?? 0.01);

const total = rate * (warmup + seconds);
const t0 = performance.now();
const lat: number[] = [];
let errors = 0, measured = 0;

await Promise.all(Array.from({ length: total }, async (_, i) => {
  const scheduled = t0 + (i * 1000) / rate;
  await new Promise((r) => setTimeout(r, Math.max(0, scheduled - performance.now())));
  let ok = false;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    await res.arrayBuffer();
    ok = res.ok;
  } catch { ok = false; }
  if (scheduled - t0 < warmup * 1000) return;
  measured++;
  if (!ok) errors++;
  lat.push(performance.now() - scheduled);
}));

lat.sort((a, b) => a - b);
const q = (p: number) => (lat.length >= 10 / (1 - p) ? lat[Math.ceil(p * lat.length) - 1] : null);
const elapsed = (performance.now() - t0) / 1000 - warmup;
const report = { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: lat.at(-1),
  offered_rps: rate, achieved_rps: measured / elapsed, error_rate: errors / measured, n: measured };
console.log(JSON.stringify(report));
if ((report.p95 ?? Infinity) > p95Max || report.error_rate > errMax) process.exit(1);
```

Declared limits: `achieved_rps` includes the final queue; the default connection pool of `fetch` (undici)
[NV] may limit the concurrency; for more than a few hundred req/s or for reports with a histogram, use
k6, wrk2 or autocannon. The k6 equivalent (generic):

```js
export const options = {
  scenarios: { nominal: { executor: 'constant-arrival-rate', rate: 50, timeUnit: '1s',
    duration: '5m', preAllocatedVUs: 50, maxVUs: 200 } },
  thresholds: { http_req_duration: ['p(95)<200', 'p(99)<500'], http_req_failed: ['rate<0.01'] },
};
```

(`http_req_failed` as a built-in metric is [NV] in the pages opened.)

## 5. Front-end performance (FE-PERF)

The browser runs the network, the parse, the style and layout, the script, the paint and the composite;
everything but the network, the image decode and the compositor goes through **one main thread**, and a
task of more than 50 ms blocks input (FB4). Reading geometry after writing styles forces the layout at that
moment (FB26, FB27). The default is vanilla (HTML, CSS, ES modules) with `node-ts` and Playwright as the
verification stack; React, Vue and Svelte appear as notes. What sections 1 to 4 already say is not repeated:
the budgets are section 1, the byte budget and the field Web Vitals are PERF-04 to PERF-07, the cache is
PERF-10 and PERF-11. **Evidence marks:** **[V]** checked in the source; **[V-exec]** checked by running it
on a lab page with Playwright 1.63 and stable Chrome (2026-10-14: a bad page against a good one); **[NV]**
not verified, a hypothesis and never the only evidence of a `meets`; **[NV-ej]** an example written for this
reference and not run. Source numbers `FBn` are in Sources. **Kit** says what the method already covers
(`modern-interface.md`, `component-techniques.md` and `motion-audit.mjs`, all of module ui, and the
`node-ts` profile) or “not covered”. The `rg` detectors are lines of the gate: they
point, the measurement decides.

**Which rule is a criterion.** The measurable ones back O15 (front: JS and Web Vitals under budget, by
command) and I25 (a loop pauses off screen); the rest are judgment or guidance with no criterion of their
own. The study proposed as new criteria, cheap and mechanical, the leak test (MEM-02), the forced layout
by LoAF (INT-02), the lab INP and LoAF of the card's interaction (INT-01, JS-01), the detectors for IMG-01
and CAR-02, and bfcache (NAV-01); they stay rules until a card shows a need.

### 5.1 Model and diagnosis (MOD)

**FE-PERF-MOD-01** — Before optimizing, name the subpart that dominates: LCP in TTFB, load delay, load duration or render delay; INP in input delay, processing or presentation. · How T+J · criterion O15 · Check: the card's report carries the table of subparts measured with `web-vitals/attribution` (field) or the probe (lab), and the optimization attacks the largest one. `onLCP(({ value, attribution: a }) => send({ value, ttfb: a.timeToFirstByte, delay: a.resourceLoadDelay, load: a.resourceLoadDuration, render: a.elementRenderDelay, el: a.target }))` **[NV-ej]**. Kit: not covered; PERF-14 (USE) is the back-end equivalent · Source FB1, FB2, FB36.

**FE-PERF-MOD-02** — Load delay and render delay of the LCP are each under 10 % of the LCP; above that the problem is discovery or render, not bytes. · How T · criterion O15 · Check: LCP attribution in the lab with CPU ×4 and Slow 4G. The 40 / 10 / 40 / 10 split is guidance, not a target, in the source [V] · Source FB1.

### 5.2 Loading (CAR)

**FE-PERF-CAR-01** — The LCP resource is in the initial HTML: an `<img src>` or a `<link rel=preload>`, never only a CSS background or injected by script. · How C+T · criterion none · Check: `curl -s <url> | rg -c '<img[^>]+fetchpriority="high"'` gives 1; in Playwright the `url` of the LCP entry appears in the raw HTML (`expect(html).toContain(new URL(lcpUrl).pathname)`) **[NV-ej]**. Kit: not covered · Source FB1, FB9.

**FE-PERF-CAR-02** — `fetchpriority="high"` on the LCP image and on no other (two per page at most); `loading="lazy"` never on the LCP nor on what is visible at load. About 17 % of mobile pages lazy-load their LCP (FB34) [V]. · How C+T · criterion none · Check: detector FE-DET-01 and, in the test, the LCP element has `loading !== 'lazy'`. Kit: not covered · Source FB1, FB9, FB29, FB34.

**FE-PERF-CAR-03** — Order of the `<head>` per capo.js: charset and viewport, `title`, preconnect and critical preload, CSS, `defer` or `module`, and at the end prefetch and speculationrules; no synchronous `<script src>`. · How C · criterion none · Check: detector FE-DET-12 plus the capo.js or ct.css extension as judgment. Kit: not covered · Source FB16, FB18, FB43.

**FE-PERF-CAR-04** — No `@import` in the CSS that is served: each one adds a round trip to the critical path; concatenate in the build or use several `<link>`. · How C · criterion none · Check: detector FE-DET-11 over the **served** CSS (`dist/`), not the source when there is a bundler. Kit: not covered · Source FB16.

**FE-PERF-CAR-05** — Every own script is `type="module"` or `defer`; `async` only for scripts independent of the DOM and of order (analytics); never `document.write`. · How C · criterion none · Check: detectors FE-DET-12 and FE-DET-13. Kit: not covered · Source FB16, FB32, FB43.

**FE-PERF-CAR-06** — `preconnect` only to origins used in the first seconds (a font, the CDN of the LCP image), with `crossorigin` for fonts; the rest, nothing or `dns-prefetch`. The cap of two or three is practice and not in the source **[NV]**. · How J · criterion none · Check: review of the `<head>`. Kit: not covered · Source FB20, FB32.

**FE-PERF-CAR-07** — Split the code by route and by interaction with `import()`; the entry chunk respects the budget of PERF-05 and no initial chunk passes about 100 kB compressed without a justification. · How C · criterion O15 · Check: `npx size-limit` (PERF-05) and `rg -c "import\(" src` above 0 when there is more than one route. `btn.addEventListener('click', async () => (await import('./editor.js')).open(), { once: true })`. Kit: not covered; PERF-05 gives the budget and this rule adds the how · Source FB13, FB30, B30.

**FE-PERF-CAR-08** — Import by subpath or by name from ESM packages with `sideEffects`; never the whole library (`import _ from 'lodash'`, `import * as icons`, `moment`). The median page ships 206 kB (44 %) of unused JS (FB35) [V]. · How C+J · criterion none · Check: detector FE-DET-15 and the bundler's report (`--analyze`, `source-map-explorer`). Kit: not covered; PERF-05 catches it by size and not by cause · Source FB35, FB44.

**FE-PERF-CAR-09** — HTML, CSS, JS, SVG and JSON are served with `br` (or `zstd`) from the server or the CDN; images, WOFF2 fonts and video are not recompressed. 12 % of scripts go uncompressed (FB35) [V]. · How T · criterion none · Check: a request with `accept-encoding: br, gzip` to `/assets/app.js` answers a `content-encoding` of `br`, `zstd` or `gzip` **[NV-ej]**. Kit: not covered · Source FB35, FB45.

**FE-PERF-CAR-10** — Cache: covered by PERF-10 and PERF-11. This adds that `immutable` is verified in RFC 8246 [V], that a file without a fingerprint never carries `immutable` (FB17), and that in a service worker the Cache API ignores `Cache-Control`, so its strategy is declared apart (CAR-11). · How T · criterion none · Source FB17, FB41, FB42.

**FE-PERF-CAR-11** — With a service worker: cache-first only for hashed assets, network-first for HTML and API, stale-while-revalidate for the non-critical, and a versioned precache that is cleaned at `activate` (the cleaning is **[NV]**: it was not on the page read). · How J+T · criterion none · Check: an offline test in Playwright (`context.setOffline(true)`) of the promised route. Kit: not covered · Source FB42.

**FE-PERF-CAR-12** — Large embedded data (about 10 kB or more) goes as `JSON.parse('…')` and not as a JS literal; inline scripts over 1 kB are external. Low priority. · How J · criterion none · Kit: not covered · Source FB13.

### 5.3 JavaScript (JS)

**FE-PERF-JS-01** — No frame over 50 ms in the card's scenario, neither at load nor when interacting, measured with LoAF at CPU ×4. · How T · criterion O15 · Check: a `PerformanceObserver` of `long-animation-frame` in an `addInitScript`; zero frames over 50 ms in the interaction; at load, the cap declared in the budget (5.12) **[V-exec]**. Kit: covered in part by `motion-audit.mjs --cpu 4` (module ui), which reports frames over 50 ms on hover, press and focus; PERF-07 asks it with `longtask` and LoAF replaces it because it also attributes the script and the forced layout · Source FB4, FB6, FB39.

**FE-PERF-JS-02** — Work over 50 ms is split and yields with `await scheduler.yield()`, falling back to `setTimeout(0)`: what is visible first, then yield, then the rest. `isInputPending` is not used (FB4). Lab INP 32 ms against 1120 ms with five 40 ms chunks and yield [V-exec]. · How T+C · criterion none · Check: `const yieldToMain = () => globalThis.scheduler?.yield ? scheduler.yield() : new Promise((r) => setTimeout(r, 0)); for (const chunk of chunks) { process(chunk); await yieldToMain(); }`. Kit: not covered · Source FB4, FB5.

**FE-PERF-JS-03** — Computation that does not touch the DOM and passes 50 ms at CPU ×4 (parsing files, sorting or filtering thousands of rows, diffs, cryptography, images) goes to a Worker, with Comlink or `postMessage` and `transfer` for the buffers. A worker reduces risk and does not make the app faster (FB23). · How J+T · criterion none · Check: JS-01 green with the volume of the card. Kit: not covered · Source FB23.

**FE-PERF-JS-04** — Choose the render pattern by the real interactivity and write it in the plan: mostly static content, HTML or SSG, or SSR with islands; a page with much interaction, SPA or SSR with hydration; never hydrate the whole page for one widget. Notes: React has streaming SSR, `Suspense` and selective hydration; Astro has `client:visible` and `client:idle`; Qwik has resumability. · How J · criterion none · Kit: not covered (it touches D · Design) · Source FB15, FB48.

**FE-PERF-JS-05** — Adding a framework or a UI dependency over 10 kB compressed requires the number before and after in the route's budget. The 10 kB threshold is this reference's criterion. · How C+J · criterion none · Check: size-limit. Kit: PERF-05 and PERF-13 · Source FB48, B30.

### 5.4 Interaction (INT)

**FE-PERF-INT-01** — The handler paints the feedback in the same frame (button state, spinner, optimistic) and defers the rest: `await yieldToMain()` before the heavy work or the network. · How T · criterion O15 · Check: the duration of the `event` entry (with `interactionId`) is 200 ms or less at CPU ×4; the lab goal of its own is 100 ms or less **[V-exec]**. Kit: `modern-interface.md` (“respond on pointer-down”) asks it as intent and does not measure INP · Source FB2, FB4.

**FE-PERF-INT-02** — No forced layout in loops: all the geometry reads (FB27) before any style write, or reads in rAF and writes in the next frame. `const hs = rows.map((r) => r.offsetHeight); rows.forEach((r, i) => r.style.setProperty('--h', `${hs[i]}px`));`. · How C+T · criterion O15 · Check: detector FE-DET-08 and, in the test, `forcedStyleAndLayoutDuration` of the LoAF scripts at 5 ms or less in the interaction (0 ms against 740 ms on the lab pages) [V-exec]. Kit: not covered; `component-techniques.md` asks for FLIP, which reads and writes apart · Source FB6, FB26, FB27.

**FE-PERF-INT-03** — Continuous events are bounded: `pointermove`, `scroll`, `resize` and `input` that paint get one rAF per frame (`frame ||= requestAnimationFrame(...)`); those that go to the network or do expensive work get a debounce (the 100–300 ms range is practice **[NV]**); `touchstart`, `touchmove` and `wheel` are `{ passive: true }` unless they call `preventDefault`. · How C+J · criterion none · Check: detectors FE-DET-16 and FE-DET-17. Kit: not covered · Source FB2, FB32.

**FE-PERF-INT-04** — Reveal, lazy-load and sticky with IntersectionObserver or `animation-timeline: view()`, never with a `scroll` listener that reads geometry. · How C+J · criterion none · Check: detector FE-DET-17. Kit: covered by `modern-interface.md` (“never with a `scroll` listener”) · Source FB32.

**FE-PERF-INT-05** — Every view has under 1400 DOM nodes (alert at 800); what is hidden or rare is inserted when it opens, not at load. · How T · criterion O15 · Check: `expect(await page.evaluate(() => document.getElementsByTagName('*').length)).toBeLessThan(1400)`. Kit: not covered · Source FB46.

### 5.5 Render and animation (REN)

**FE-PERF-REN-01** — Only `transform` and `opacity` for movement; never `top`, `left`, `width`, `height` or margins, neither from WAAPI nor writing `.style` in a rAF. · How C+T · criterion none · Check: detectors FE-DET-04 to FE-DET-07. Kit: covered: `modern-interface.md` forbids it, `motion-audit.mjs` flags the transitions of `LAYOUT_PROPS` on hover, press and focus, and `component-techniques.md` asks for FLIP (gap: `motion-audit.mjs` does not see the WAAPI animations that opening clicks trigger) · Source FB3, FB25, FB26.

**FE-PERF-REN-02** — Never `transition: all`; the properties are listed. · How C · criterion none · Check: detector FE-DET-03. Kit: covered by `modern-interface.md` · Source FB25.

**FE-PERF-REN-03** — `will-change` as a last resort: only on elements that will really animate, set by script before and removed (`auto`) when done; in base CSS only for a few unique elements. · How C+J · criterion none · Check: detector FE-DET-18. Kit: not covered · Source FB24, FB25.

**FE-PERF-REN-04** — Effects that are expensive to paint (`backdrop-filter`, `filter: blur`, a large `box-shadow`, conic gradients with `mask`) are not animated on large surfaces nor in a loop; if animated, measure with LoAF at CPU ×4. The relative cost of `backdrop-filter` is **[NV]**: no source quantifies it. · How J+T · criterion none · Kit: `modern-interface.md` asks to remove the blur with `prefers-reduced-transparency` (accessibility, not cost) · Source FB25.

**FE-PERF-REN-05** — Long sections off screen get `content-visibility: auto; contain-intrinsic-size: auto <estimated height>`. · How C+J · criterion none · Kit: not covered · Source FB2, FB10.

**FE-PERF-REN-06** — Lists that may pass a few hundred rows are virtualized or paginated; infinite scroll without virtualizing is not a solution. The threshold is **[NV]**: it is measured with INT-05. · How T · criterion none · Check: INT-05 with the ×10 volume of PERF-09. Kit: O10 on the server; on the client, not covered · Source FB46, FB47.

**FE-PERF-REN-07** — Every loop (CSS `infinite`, a perpetual rAF, a visual `setInterval`) pauses off screen and with `document.hidden`, and respects `prefers-reduced-motion`. · How C+T · criterion I25 · Check: detectors FE-DET-21 and FE-DET-22 plus a test. Kit: covered by `modern-interface.md` (“every loop pauses off screen”) and by the `pauseOffscreen` helper of the set · Source FB4.

**FE-PERF-REN-08** — Layout movements (reorder, expand, shared element) are FLIP or View Transitions. · How J · criterion none · Kit: covered by `component-techniques.md` · Source FB26, FB49.

### 5.6 Images, fonts and video (IMG, FNT)

**FE-PERF-IMG-01** — Every `<img>`, `<video>` and `<iframe>` declares `width` and `height`, or an `aspect-ratio` in CSS. 62 % of mobile pages have at least one without (FB34) [V]. · How C+T · criterion none · Check: detector FE-DET-02 and CLS-03. Kit: covered by the result (CLS 0.1 or less in the `node-ts` “stability”), not by the cause · Source FB3, FB29, FB34.

**FE-PERF-IMG-02** — Content images carry `srcset` with `w` descriptors and `sizes`; the file chosen is at most 2× the displayed size × DPR. · How T · criterion none · Check: `naturalWidth <= 2 * clientWidth * devicePixelRatio` for each visible `img` **[NV-ej]**. Kit: not covered · Source FB30.

**FE-PERF-IMG-03** — Photos in AVIF or WebP inside `<picture>` with a fallback; if negotiated by `Accept`, the response carries `Vary: Accept`. · How C+T · criterion none · Check: `rg -c '<source[^>]+type="image/(avif|webp)"'` and a header test. Kit: not covered · Source FB14, FB30.

**FE-PERF-IMG-04** — `loading="lazy"` (and `decoding="async"` if the image is large) on images and iframes below the fold; never on the LCP (CAR-02). · How C · criterion none · Check: detectors FE-DET-01 and FE-DET-20. Kit: not covered · Source FB29, FB30.

**FE-PERF-IMG-05** — Video: `preload="none"` or `metadata` and a sized `poster`; animated GIFs are replaced by `<video muted loop playsinline>`; third-party embeds go behind a facade (TER-02). The content of the source is **[NV]**. · How C+J · criterion none · Kit: not covered · Source FB14, FB30.

**FE-PERF-FNT-01** — Every `@font-face` declares `font-display`: `optional` for body text, `swap` for brand or headings. · How C · criterion none · Check: detector FE-DET-10. Kit: not covered; the component set meets it · Source FB3, FB19, FB20.

**FE-PERF-FNT-02** — Only WOFF2, subset or with `unicode-range`; preload only the most critical font (one, with `crossorigin`); `@font-face` inline in the `<head>`; a variable font only if it replaces several weights. · How C+J · criterion none · Check: `rg -n "\.(ttf|otf|woff)['\")]" -g '*.css'` is empty. Kit: not covered · Source FB19, FB20.

**FE-PERF-FNT-03** — The fallback font is adjusted with `size-adjust` and `ascent-override` so the font swap does not move the layout. · How T · criterion none · Check: CLS with the font delayed by `page.route` (200 ms) is 0.01 or less. Kit: not covered · Source FB3, FB21.

### 5.7 Layout stability (CLS)

**FE-PERF-CLS-01** — Late content (banners, notices, results, ads, embeds) has its space reserved (`min-height`, `aspect-ratio`, a skeleton of the same size) or is inserted below the viewport. A banner injected without reserve gave CLS 0.128, with reserve 0 [V-exec]. · How T · criterion O15 · Check: a `layout-shift` observer in Playwright. Kit: covered in result by the `node-ts` “stability” (CLS 0.1 or less at load and on scroll) · Source FB3.

**FE-PERF-CLS-02** — Animations do not move the layout: `top` and `left` count as a shift (FB3); use `transform`. · How C · criterion none · Check: REN-01. Source FB3, FB25.

**FE-PERF-CLS-03** — CLS is measured at load, on scroll **and after each interaction of the card that brings data**: the lab sees only the load (FB37). · How T · criterion O15 · Kit: load and scroll, yes; after an interaction, not · Source FB3, FB37.

### 5.8 Navigation (NAV)

**FE-PERF-NAV-01** — Pages are eligible for bfcache: no `unload` or permanent `beforeunload` (`pagehide` instead), no `Cache-Control: no-store` except for sensitive data, WebSocket and IndexedDB closed on `pagehide` and reopened on `pageshow` with `persisted`. `unload` is on 10 % of pages and `no-store` on 23 % (FB34) [V]. · How C+T · criterion none · Check: detector FE-DET-14; `await page.goto(a); await page.goto(b); await page.goBack();` and the navigation type is `back_forward` **[NV-ej]** (how to detect the restore in headless Playwright is **[NV]**; by hand, DevTools › Application › Back/forward cache › *Run Test*). Kit: not covered. PERF-10 asks `no-store` for user data and that **conflicts** with bfcache: as FB7 says, `no-store` only on what is really sensitive and `private, no-cache` on the rest · Source FB7, FB34.

**FE-PERF-NAV-02** — Speculation Rules: document rules with eagerness `moderate` or `conservative`; exclude with `not` the logout, cart and links with effects; defer analytics until `prerenderingchange` if `document.prerendering`. `<script type="speculationrules">{"prerender":[{"where":{"and":[{"href_matches":"/*"},{"not":{"href_matches":"/logout"}}]},"eagerness":"moderate"}]}</script>`. · How J+C · criterion none · Check: `rg -n 'type="speculationrules"'` and review the `not`. Kit: not covered · Source FB8.

**FE-PERF-NAV-03** — View Transitions only as progressive enhancement: duration in the range of `modern-interface.md` (250–400 ms), a `prefers-reduced-motion` version, nothing that blocks render waiting for the network. The memory cost of the snapshots is **[NV]**. · How J · criterion none · Kit: covered in duration and reduced motion by `modern-interface.md` · Source FB49.

### 5.9 Third parties and analytics (TER)

**FE-PERF-TER-01** — Every third-party script is in an inventory with its owner, its purpose, its bytes and its main-thread time (LoAF `sourceURL`, grouping `scripts[].sourceURL` by origin); what has no owner nor measurable value is removed. · How J+T · criterion none · Kit: not covered · Source FB6, FB32.

**FE-PERF-TER-02** — Third parties with `async` or `defer`, loaded after the interaction or on entering the viewport; heavy embeds (video, chat, maps) behind a facade; Partytown only experimentally and with proof the script works (its state is **[NV]**). The Lighthouse facade audit was removed in Lighthouse 13. · How C+J · criterion none · Check: detector FE-DET-20. Kit: not covered · Source FB31, FB32, FB33.

**FE-PERF-TER-03** — RUM and analytics send with `navigator.sendBeacon` on `visibilitychange` → `hidden`; never on `unload`. · How C · criterion none · Check: detector FE-DET-14. Kit: not covered · Source FB7, FB36.

### 5.10 Memory and leaks (MEM)

**FE-PERF-MEM-01** — Every `mount` returns a `destroy` that undoes whatever it created: listeners, above all those of `window` and `document` (one `AbortController` and `{ signal }` for all); `setInterval`, `setTimeout` and `requestAnimationFrame`; `Resize`, `Intersection` and `MutationObserver` (`disconnect`); subscriptions and hanging promises. In React, the cleanup of `useEffect`; in Vue, `onUnmounted`; in Svelte, the function `onMount` returns. · How C+T · criterion none · Check: detector FE-DET-21 and MEM-02. Kit: not covered as a criterion; the `motion/` layer of the set does it · Source FB12, FB28.

**FE-PERF-MEM-02** — Leak test: 7 mount/destroy cycles, forced GC, and the deltas of `JSEventListeners` and `Nodes` equal to 0; the `window` listeners the same before and after. The good lab page gave Δlisteners 0 and Δnodes 0; the bad one, Δlisteners 7, Δnodes 14 and 7 `resize` listeners on `window`: multiples of 7, as FB28 predicts [V-exec]. · How T · criterion O15 · Check: `HeapProfiler.collectGarbage`, `Performance.getMetrics` and `DOMDebugger.getEventListeners` over CDP. Kit: not covered · Source FB12, FB28.

**FE-PERF-MEM-03** — No array, `Map` or module cache holds DOM nodes or component instances; if needed, `WeakMap` or `WeakRef`. Verified with a heap snapshot filtered by `Detached` after the card's flow. · How T+J · criterion none · Check: Δnodes of MEM-02. Kit: not covered · Source FB12, FB28.

### 5.11 Measurement (MED)

**FE-PERF-MED-01** — Standard lab profile: mobile viewport 390×844, CPU ×4 (the Lighthouse default) and Slow 4G (150 ms RTT, 1.6 Mbps down, 750 kbps up); a second pass at CPU ×6 for the low end. Using ×6 as the standard is this reference's criterion. · How T · criterion O15 · Check: `Emulation.setCPUThrottlingRate` and `Network.emulateNetworkConditions` [V-exec]. Kit: `motion-audit.mjs --cpu 4`; network, not covered · Source FB13, FB39, B30.

**FE-PERF-MED-02** — In the field: `web-vitals/attribution` v5 sending LCP, INP and CLS with their attribution to an own endpoint (p75 per route and device); CrUX only if the origin is eligible (public, with traffic, opt-in Chrome, no iOS). PERF-04 asks for field CWV and this adds the attribution. · How C+J · criterion O15 · Check: the endpoint receives. Source FB36, FB37, FB38.

**FE-PERF-MED-03** — The budget per route is a gate, with the template of 5.12; the CI fails if it is exceeded. PERF-04 to PERF-06 give the thresholds and this adds LoAF, lab INP, nodes and leaks. · How C · criterion O15 · Source B31, B32, B33.

**FE-PERF-MED-04** — Lighthouse in navigation mode does not measure INP: the card's interaction is measured with Playwright (the `event` entry and LoAF) or a *timespan* flow (**[NV]** this session); TBT is only a proxy. · How T · criterion O15 · Kit: not covered · Source FB37.

**FE-PERF-MED-05** — To diagnose, record in DevTools Performance (*Record and reload* for the load, *Record* for the interaction) with the same throttling; the evidence is the Insights tab and the Interactions track, not an impression (protocol 5.14). · How J · criterion none · Kit: not covered · Source FB11.

**FE-PERF-MED-06** — Before and after on the same machine, with no other load and at least 3 runs (the median). · How J · criterion none · Kit: O10 (“machine under no other load”) · Source B31, B32.

### 5.12 Template: performance budget per route

It goes in the card's plan. If the card gives no numbers it is asked (AMB) and, if it expires, these defaults are assumed as ASM (PERF-01). What did not run is declared `could not run` with its reason.

| Route | Metric | Threshold | Where it is measured |
|---|---|---|---|
| `/<route>` | LCP (lab) | 2.5 s or less | probe or LHCI, 390×844, CPU ×4, Slow 4G, median of 3 (PERF-04, PERF-06) |
| | load delay and render delay of the LCP | each under 10 % of the LCP | probe with attribution (MOD-02) |
| | CLS at load + scroll + after the interaction | 0.1 or less (own goal 0.05) | Playwright `layout-shift` (CLS-03) |
| | lab INP of the card's interaction | 200 ms or less (own goal 100) | Playwright, `event` entry (INT-01) |
| | frames over 50 ms in the interaction | 0 | LoAF (JS-01) |
| | forced layout in the interaction | 5 ms or less | LoAF `forcedStyleAndLayoutDuration` (INT-02) |
| | initial JS (br) | per section 1 and B30 | size-limit (PERF-05) |
| | DOM nodes | under 1400 | `getElementsByTagName('*').length` (INT-05) |
| | leaks in 7 cycles | Δlisteners = 0, Δnodes = 0 | CDP `Performance.getMetrics` (MEM-02) |
| | field (if there is traffic) | LCP, INP, CLS at p75 | web-vitals/attribution (MED-02) |

### 5.13 Template: checklist for a component (`mount` and `destroy`)

1. `mount` is idempotent: mounting twice does not duplicate listeners (a guard or a prior `destroy`).
2. Every `addEventListener` carries the `{ signal }` of one `AbortController` or has its `remove`; those of `window` and `document` for sure.
3. Every `setInterval`, recurrent `setTimeout` and `requestAnimationFrame` keeps its id and `destroy` cancels it.
4. Every `new XObserver` has its `disconnect()` in `destroy`.
5. No module structure retains nodes or instances (MEM-03).
6. Continuous events are bounded by rAF or debounce; touch and wheel are `passive` (INT-03).
7. No geometry reads after writes inside a loop or frame (INT-02).
8. Animations use only `transform` and `opacity`, with listed properties (no `all`); `will-change` set and removed (REN-01 to REN-03).
9. Loops pause off screen, with `document.hidden` and with `prefers-reduced-motion` (REN-07).
10. Large blur or shadow effects are not animated (REN-04).
11. The component's images and media have dimensions; `lazy` only below the fold (IMG-01, IMG-04).
12. The MEM-02 test is green and detector FE-DET-21 does not flag the file.

### 5.14 Protocol: ten minutes of profiling

| min | Step | Expected output |
|---|---|---|
| 0–1 | Chrome in a guest window (no extensions). DevTools › Performance › Capture settings: CPU ×4 (or *Calibrate*), Slow 4G, the Memory box | settings written down |
| 1–3 | *Record and reload*. In Insights: LCP by subpart, render-blocking, layout shifts (violet diamonds) | the dominant subpart of the LCP (MOD-01) |
| 3–5 | *Record*, do the card's interaction 3 times and stop. Interactions track: red triangles (over 200 ms), with input delay, processing and presentation. In Main: long tasks with a red triangle and violet *Layout* blocks inside a handler (forced layout) | the dominant phase of INP, the guilty function |
| 5–7 | With the Memory box: *Collect garbage*, mount and unmount the view 7 times, *Collect garbage*. Listener and node counters | do they rise in multiples of 7? (MEM-02) |
| 7–9 | Memory › Heap snapshot › `Detached` filter › retainers of the first | who retains the node (MEM-03) |
| 9–10 | Application › Back/forward cache › *Run Test* | restored, or the reason (NAV-01) |

It closes with a table of three columns: finding, FE-PERF rule and evidence (capture or number). Without a number there is no finding (PERF-13).

### 5.15 Detectors (criterion O15, informative)

`rg` with PCRE2 over the front-end files of the diff, excluding `*.spec.*` and `*.test.*`. Tried on a bad sample with 22 anti-patterns, a good one with the right versions and the kit's component set. They point and the measurement decides: **FE-DET-21** is a per-file heuristic that cannot see that a listener sits on a node that dies with the component, and **FE-DET-01** catches only the literal combination. `H` = `-g '*.{html,htm,astro,vue,svelte,jsx,tsx}'`, `C` = `-g '*.{css,scss,vue,svelte,astro,html}'`, `J` = `-g '*.{js,mjs,ts,jsx,tsx,vue,svelte}'`.

| ID | Anti-pattern | Pattern | Files |
|---|---|---|---|
| FE-DET-01 | `lazy` and `fetchpriority=high` on the same `<img>` | `<img\b(?=[^>]*\bloading=["']?lazy)(?=[^>]*\bfetchpriority=["']?high)[^>]*>` | H |
| FE-DET-02 | `<img>` without `width` or `height` | `<img\b(?![^>]*\bwidth=)(?![^>]*\bheight=)(?![^>]*\{\.\.\.)[^>]*>` | H |
| FE-DET-03 | `transition: all`, outside comments | `^(?!\s*(/\*\|\*\|//))[^\`]*?transition(-property)?\s*:\s*all\b` | C, J |
| FE-DET-04 | transition of layout properties | `transition(-property)?\s*:[^;{}]*(?<![-\w])(top\|left\|right\|bottom\|width\|height\|margin(-\w+)?\|padding(-\w+)?)\b(?![-\w])` | C |
| FE-DET-05 | `@keyframes` with layout properties (multiline, `-U`) | `@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*?[^{}]*\{[^}]*(?<![-\w])(top\|left\|width\|height\|margin\|padding)\s*:` | C |
| FE-DET-06 | WAAPI animating `width`, `height`, `top`, `left` | `\.animate\(\s*\[?[^)]*?\b(width\|height\|top\|left\|margin\w*\|padding\w*)\s*:` | J |
| FE-DET-07 | rAF loop that writes `.style.top`, `left`, `width`, `height` (`-U`) | `function\s+(\w+)\s*\([^)]*\)\s*\{[^}]*\.style\.(top\|left\|right\|bottom\|width\|height\|margin\w*)\s*=[^}]*requestAnimationFrame\(\s*\1\s*\)` | J |
| FE-DET-08 | a geometry read and a `.style` write in the same loop body (`-U`) | `(?:for\s*\(.*\)\|while\s*\(.*\)\|\.forEach\(\s*(?:\([^)]*\)\|\w+)\s*=>)\s*\{[^}]*?\b(?:offset(?:Height\|Width\|Top\|Left)\|client(?:Height\|Width)\|scroll(?:Top\|Height)\|getBoundingClientRect\|getComputedStyle)\b[^}]*?\.style\.` | J |
| FE-DET-09 | `innerHTML +=` | `\.innerHTML\s*\+=` | J |
| FE-DET-10 | `@font-face` without `font-display` (`-U`) | `@font-face\s*\{(?![^}]*font-display)[^}]*\}` | C |
| FE-DET-11 | `@import` in CSS | `^\s*@import\b\|<style>[^<]*@import` | C |
| FE-DET-12 | `<script src>` without `defer`, `async` or `module` | `<script\b(?=[^>]*\bsrc=)(?![^>]*\b(defer\|async\|type=["']?module))[^>]*>` | H |
| FE-DET-13 | `document.write` | `document\.write\(` | H, J |
| FE-DET-14 | `unload` or `beforeunload` | `addEventListener\(\s*['"](unload\|beforeunload)['"]\|\bonunload\s*=` | H, J |
| FE-DET-15 | import of a whole library | `^\s*import\s+(\*\s+as\s+\w+\|\w+)\s+from\s+['"](lodash\|moment\|rxjs\|date-fns\|lucide\|lucide-react\|@mui/icons-material\|@fortawesome/[\w-]+\|antd\|ramda)['"]\|require\(['"](lodash\|moment)['"]\)` | J |
| FE-DET-16 | `touch*` or `wheel` without `passive` | `addEventListener\(\s*['"](touchstart\|touchmove\|wheel\|mousewheel)['"](?![^)]*passive)` | J |
| FE-DET-17 | a `scroll` listener without `passive` (a signal: check for rAF or IntersectionObserver) | `addEventListener\(\s*['"]scroll['"](?![^\n]*passive)` | J |
| FE-DET-18 | `will-change` other than `auto` in CSS | `will-change\s*:\s*+(?!auto\b)` | C |
| FE-DET-19 | a `useEffect` that only does `setX` (a cascade; a React note) (`-U`) | `useEffect\(\s*\(\)\s*=>\s*\{\s*set[A-Z]\w*\(` | `*.jsx`, `*.tsx` |
| FE-DET-20 | a third-party `<iframe>` without `loading` | `<iframe\b(?![^>]*loading=)[^>]*src=["']https?://` | H |
| FE-DET-21 | per file: `setInterval`, rAF, `addEventListener` or `Observer(` without its cleanup, or more than 3× the creations over the cleanups | `rg -c` of the creation against `clearInterval`, `cancelAnimationFrame`, `removeEventListener\|signal\|AbortController`, `disconnect\(` | J |
| FE-DET-22 | a file with `infinite` and no `prefers-reduced-motion` | `rg -l infinite` and `rg -L prefers-reduced-motion` | C |

Adjustments the test forced: FE-DET-03 excludes comments and specs (it flagged a comment and the very test of the rule); FE-DET-18 uses the possessive `\s*+` (without it `will-change: auto` was a false positive by backtracking); FE-DET-17 had to stop flagging `passive` listeners after a `;` on the same line; FE-DET-08 flags only a read and a write inside the same `{…}`, because `.map()` that reads everything and then writes is the right pattern.

### 5.16 What AI-generated code usually does

| # | Rule | What the agent does | Detector or test |
|---|---|---|---|
| 1 | IMG-01 | `<img>` without `width` and `height` | FE-DET-02 and CLS |
| 2 | CAR-02 | `loading="lazy"` on every image, the hero included | FE-DET-01 and the LCP test |
| 3 | REN-01 | animates `top`, `left`, `width`, `height`, also through WAAPI | FE-DET-04 to FE-DET-07 |
| 4 | REN-02 | `transition: all` | FE-DET-03 |
| 5 | MEM-01 | `addEventListener` on `window` without `remove` or `signal` | FE-DET-21 and MEM-02 |
| 6 | MEM-01 | a `setInterval` or rAF that is never cancelled | FE-DET-21 |
| 7 | INT-02 | reads `offsetHeight` or `getBoundingClientRect` and writes style in the same loop | FE-DET-08 and forced LoAF |
| 8 | CAR-08 | `import _ from 'lodash'`, `import * as icons` | FE-DET-15 and size-limit |
| 9 | CAR-07 | one entry with no `import()` for heavy routes or modals | size-limit and `rg -c "import\("` |
| 10 | FNT-01 | `@font-face` without `font-display` | FE-DET-10 |
| 11 | JS-02, INT-01 | a synchronous handler of hundreds of ms with no feedback nor yield | probe INP and LoAF |
| 12 | INT-03 | `pointermove` or `scroll` that paints on every event with no rAF | FE-DET-16, FE-DET-17 and judgment |
| 13 | REN-03 | `will-change` in the base CSS of many elements “just in case” | FE-DET-18 |
| 14 | NAV-01, TER-03 | `unload` for analytics; `no-store` on everything | FE-DET-14 and the bfcache test |
| 15 | MED-04 | presents a desktop Lighthouse run as evidence of INP | a probe at CPU ×4 (PERF-06) |

## Sources

- B22 — Google SRE Book, ch. 6 “Monitoring Distributed Systems” — https://sre.google/sre-book/monitoring-distributed-systems/
- B26 — Michael Nygard, *Release It!*, 2nd ed., 2018 (index; content [NV]) — https://pragprog.com/titles/mnee2/release-it-second-edition/
- B29 — web.dev, “Web Vitals” and “Defining the Core Web Vitals metrics thresholds” — https://web.dev/articles/vitals · https://web.dev/articles/defining-core-web-vitals-thresholds
- B30 — Alex Russell, “The Performance Inequality Gap, 2026”, 24 November 2025 — https://infrequently.org/2025/11/performance-inequality-gap-2026/
- B31 — web.dev, “Performance budgets 101” and “RAIL” — https://web.dev/articles/performance-budgets-101 · https://web.dev/articles/rail
- B32 — Lighthouse CI, configuration docs — https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md
- B33 — size-limit (Andrey Sitnik) — https://github.com/ai/size-limit
- B34 — Gil Tene, “How NOT to Measure Latency”, through Tyler Treat's summary — https://bravenewgeek.com/everything-you-know-about-latency-is-wrong/
- B35 — Brendan Gregg, *Systems Performance*, 2nd ed., 2020; USE Method; Active Benchmarking — https://www.brendangregg.com/systems-performance-2nd-edition-book.html · https://www.brendangregg.com/activebenchmarking.html
- B36 — RFC 9111, HTTP Caching, 2022 — https://www.rfc-editor.org/rfc/rfc9111.html
- B37 — Jakob Nielsen, “Response Times: The 3 Important Limits”, 1993 — https://www.nngroup.com/articles/response-times-3-important-limits/
- B38 — Azure Well-Architected, PE:06 “Performance testing” — https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/performance-test
- L1 — Gil Tene, “How NOT to Measure Latency” (QCon SF 2012) and Tyler Treat's summary, 2015 — https://qconsf.com/sf2012/dl/qcon-sanfran-2012/slides/GilTene_HowNotToMeasureLatency.pdf · https://bravenewgeek.com/everything-you-know-about-latency-is-wrong/
- L2 — wrk2 (Gil Tene) — https://github.com/giltene/wrk2
- L3 — HdrHistogram — https://hdrhistogram.github.io/HdrHistogram/ · https://github.com/HdrHistogram/HdrHistogram
- L4 — Grafana k6, “Load test types” — https://grafana.com/docs/k6/latest/testing-guides/test-types/
- L5 — Grafana k6, “Open and closed models” — https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/
- L6 — Grafana k6, “Thresholds” — https://grafana.com/docs/k6/latest/using-k6/thresholds/
- L7 — Grafana k6, “Automated performance testing” — https://grafana.com/docs/k6/latest/testing-guides/automated-performance-testing/
- L8 — Brendan Gregg, USE Method and Active Benchmarking — https://www.brendangregg.com/usemethod.html · https://www.brendangregg.com/activebenchmarking.html
- L9 — Neil Gunther, Universal Scalability Law — http://www.perfdynamics.com/Manifesto/USLscalability.html
- L10 — J. D. C. Little, “A Proof for the Queuing Formula: L = λW”, Operations Research 9(3), 1961 — https://en.wikipedia.org/wiki/Little%27s_law
- L11 — Google SRE Book, ch. 21 “Handling Overload” — https://sre.google/sre-book/handling-overload/
- L12 — Google SRE Book, ch. 6 “Monitoring Distributed Systems” — https://sre.google/sre-book/monitoring-distributed-systems/
- L14 — Michael Nygard, *Release It!*, 2nd ed. (stability anti-patterns and patterns) — https://pragprog.com/titles/mnee2/release-it-second-edition/
- L15 — Azure Well-Architected, PE:06 “Architecture strategies for performance testing” — https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/performance-test
- L17 — autocannon (Matteo Collina) — https://github.com/mcollina/autocannon
- L18 — Gatling, “Injection” — https://docs.gatling.io/concepts/injection/
- L20 — Artillery, test script and the `ensure` plugin — https://www.artillery.io/docs/reference/test-script · https://www.artillery.io/docs/reference/extensions/ensure
- FB1 — web.dev, “Optimize Largest Contentful Paint” — https://web.dev/articles/optimize-lcp
- FB2 — web.dev, “Optimize Interaction to Next Paint” — https://web.dev/articles/optimize-inp
- FB3 — web.dev, “Optimize Cumulative Layout Shift” — https://web.dev/articles/optimize-cls
- FB4 — web.dev, “Optimize long tasks” — https://web.dev/articles/optimize-long-tasks
- FB5 — Chrome for Developers, “Use scheduler.yield()”; MDN `Scheduler.yield()` — https://developer.chrome.com/blog/use-scheduler-yield · https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield
- FB6 — Chrome for Developers, “Long Animation Frames API” — https://developer.chrome.com/docs/web-platform/long-animation-frames
- FB7 — web.dev, “Back/forward cache” — https://web.dev/articles/bfcache
- FB8 — Chrome for Developers, “Prerender pages in Chrome”; MDN `Document.prerendering` — https://developer.chrome.com/docs/web-platform/prerender-pages · https://developer.mozilla.org/en-US/docs/Web/API/Document/prerendering
- FB9 — web.dev, “Optimize resource loading with the Fetch Priority API” — https://web.dev/articles/fetch-priority
- FB10 — web.dev, “content-visibility” — https://web.dev/articles/content-visibility
- FB11 — Chrome DevTools, “Performance features reference” — https://developer.chrome.com/docs/devtools/performance/reference
- FB12 — Chrome DevTools, “Fix memory problems” — https://developer.chrome.com/docs/devtools/memory-problems
- FB13 — Addy Osmani and Mathias Bynens, “The cost of JavaScript in 2019”, V8 blog — https://v8.dev/blog/cost-of-javascript-2019
- FB14 — Addy Osmani, *Image Optimization*, Smashing, 2021 (index; content [NV]) — https://www.smashingmagazine.com/printed-books/image-optimization/
- FB15 — patterns.dev, “Islands Architecture” and “Streaming SSR” — https://www.patterns.dev/vanilla/islands-architecture/ · https://www.patterns.dev/react/streaming-ssr/
- FB16 — Harry Roberts, “CSS and Network Performance”, 2018 — https://csswizardry.com/2018/11/css-and-network-performance/
- FB17 — Harry Roberts, “Cache-Control for Civilians” — https://csswizardry.com/2019/03/cache-control-for-civilians/
- FB18 — Rick Viscomi, capo.js, head order rules; Harry Roberts, ct.css — https://rviscomi.github.io/capo.js/user/rules/ · https://csswizardry.com/ct/
- FB19 — Zach Leatherman, “A Comprehensive Guide to Font Loading Strategies” — https://www.zachleat.com/web/comprehensive-webfonts/
- FB20 — web.dev, “Best practices for fonts” — https://web.dev/articles/font-best-practices
- FB21 — web.dev, “CSS size-adjust for @font-face” — https://web.dev/articles/css-size-adjust
- FB22 — Jake Archibald, “In The Loop”, JSConf.Asia 2018 (existence only; content [NV]) — https://www.youtube.com/watch?v=cCOL7MC4Pl0
- FB23 — Surma, “Use web workers to run JavaScript off the browser's main thread”; Comlink — https://web.dev/articles/off-main-thread · https://github.com/GoogleChromeLabs/comlink
- FB24 — MDN, `will-change` — https://developer.mozilla.org/en-US/docs/Web/CSS/will-change
- FB25 — Paul Lewis, “Stick to compositor-only properties and manage layer count” — https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count
- FB26 — Wagner, Lewis and Pollard, “Avoid large, complex layouts and layout thrashing” — https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing
- FB27 — Paul Irish, “What forces layout / reflow” (gist) — https://gist.github.com/paulirish/5d52fb081b3570c81e3a
- FB28 — Nolan Lawson, “Fixing memory leaks in web applications”, 2020 — https://nolanlawson.com/2020/02/19/fixing-memory-leaks-in-web-applications/
- FB29 — web.dev, “Browser-level image lazy loading” — https://web.dev/articles/browser-level-image-lazy-loading
- FB30 — web.dev, *Learn Performance*: image performance, code splitting — https://web.dev/learn/performance
- FB31 — Lighthouse, “Lazy load third-party resources with facades” — https://developer.chrome.com/docs/lighthouse/performance/third-party-facades
- FB32 — Addy Osmani and Arthur Evans, “Loading Third-Party JavaScript” — https://web.dev/articles/optimizing-content-efficiency-loading-third-party-javascript
- FB33 — Partytown (QwikDev) — https://partytown.qwik.dev/
- FB34 — HTTP Archive, *Web Almanac 2025*: Performance and Page Weight (data of July 2025) — https://almanac.httparchive.org/en/2025/performance · https://almanac.httparchive.org/en/2025/page-weight
- FB35 — HTTP Archive, *Web Almanac 2024*: JavaScript and Performance — https://almanac.httparchive.org/en/2024/javascript · https://almanac.httparchive.org/en/2024/performance
- FB36 — GoogleChrome/web-vitals v5 — https://github.com/GoogleChrome/web-vitals
- FB37 — web.dev, “Why lab and field data can be different” — https://web.dev/articles/lab-and-field-data-differences
- FB38 — CrUX, “Methodology” — https://developer.chrome.com/docs/crux/methodology
- FB39 — Lighthouse, “Throttling” — https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md
- FB40 — Ilya Grigorik, *High Performance Browser Networking*, ch. 1 — https://hpbn.co/primer-on-latency-and-bandwidth/
- FB41 — RFC 9111 “HTTP Caching”; RFC 8246 “HTTP Immutable Responses” — https://www.rfc-editor.org/rfc/rfc9111.html · https://www.rfc-editor.org/rfc/rfc8246.html
- FB42 — Workbox, “Strategies for service worker caching” — https://developer.chrome.com/docs/workbox/caching-strategies-overview
- FB43 — MDN, `<script>` — https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script
- FB44 — webpack, “Tree Shaking” — https://webpack.js.org/guides/tree-shaking/
- FB45 — MDN, `Content-Encoding`; Chrome, “Compression dictionary transport” — https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Encoding · https://developer.chrome.com/blog/shared-dictionary-compression
- FB46 — web.dev, “How large DOM sizes affect interactivity” — https://web.dev/articles/dom-size-and-interactivity
- FB47 — Jason Miller and Houssein Djirdeh, “Virtualize large lists with react-window” — https://web.dev/articles/virtualize-long-lists-react-window
- FB48 — Tim Kadlec, “The Cost of Javascript Frameworks”, 2020 — https://timkadlec.com/remembers/2020-04-21-the-cost-of-javascript-frameworks/
- FB49 — Chrome for Developers, “What's new in view transitions (2024)” — https://developer.chrome.com/blog/view-transitions-update-io24

## Not verified

- Gil Tene's original slides (the PDF exceeds the download limit): quotations taken from Tyler Treat's summary, which reproduces his examples.
- JMeter: parameters of the Open Model Thread Group and the limits of the Constant Throughput Timer; Gatling: assertions; Locust: exit code by threshold.
- autocannon: whether it corrects coordinated omission with `-R`.
- k6: the exact exit code on a failed threshold and the `http_req_failed` metric (they did not appear in the pages opened).
- Combining HdrHistograms by sum and `copyCorrectedForCoordinatedOmission`: they did not appear in the pages opened.
- The M/M/1 formula and the 70 % utilization margin: standard theory and a criterion of the study, not verified in a source this session.
- The content of *Release It!* and *Systems Performance* beyond indexes and the author's pages; the per-ID practices of AWS's Performance Efficiency pillar.
- Thresholds of the kit that do not come from a source: 10 / (1 − p) samples, +10 % of regression, about 80 % of generator CPU, p95 at 10x within 2×, 70 % of the limiting resource.
- Neither the section 4 script nor the k6 one was run.
- Section 5 (front end): support of `scheduler.yield` in Firefox (FB5); the exact version of zstd in Chrome (FB45); the 28-day window of CrUX on the page read (FB38); the content of FB14, FB22 and of the HTTP/2 and HTTP/3 chapters of FB40; the relation of capo.js with “Get Your Head Straight”; the state of Partytown; the caps of preconnect (CAR-06) and of debounce (INT-03); the virtualization threshold (REN-06); the quantitative cost of `backdrop-filter` (REN-04); the memory cost of View Transitions; the cleaning of the precache at `activate` (CAR-11); how to detect a bfcache restore in headless Playwright (NAV-01); Lighthouse *timespan* flows (MED-04); and every fragment marked **[NV-ej]**. For Paul Irish's essays on the main thread no text apart from the FB27 gist was found: they are covered by FB27 and FB23.
