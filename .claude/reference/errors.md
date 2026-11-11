# Error handling: rules a card can meet and a reviewer can check

**When it is read:** when the card adds a failure path: a new error, an external call, a
queue or a job, a screen that fetches data, a form, a process entry point. **How:** only the sections
the card touches, with `Read` and a line range of the heading; never whole. `card.md` names the rule IDs
that apply, and the `builder` receives those IDs and their ranges. Language-independent: the main
example is TypeScript/Node and each rule brings its generic equivalent. **Libraries and tools are options,
not obligations.** **[NV] marks guidance not verified**: a hypothesis, never the only evidence of a `meets`.
Neighboring topics are cited by prefix: the problem-details body and the API contract in
`reference/documentation.md` (module docs; API-*); logs, the error reference id and support in
`reference/observability.md` (module observability; OBS-*); idempotency and transactions in
`reference/database.md` (module data; DB-TX-*). The **error taxonomy** of the repo
and the **matrix of policy per external dependency** (the evidence of D8) are sections of
`templates/system-design.md` (“Errors” and “External dependencies”); the anatomy of the user's message is
below. How each rule is checked: `J` judgment with written evidence, `C` a command that exits 0 or not, `T`
an automated test. The `rg` examples assume code under `src/`; the patterns of the last section were tried
with `rg` over a sample file (false positives are reviewed by hand). Source numbers `Bn` are in Sources.

## Rules that are criteria

| Rule | Criterion |
|---|---|
| ERR-TAX-03, ERR-PROC-01, ERR-PROC-07 | E5 |
| ERR-TAX-02, ERR-TAX-04, ERR-CAP-05, ERR-LAY-02, ERR-LAY-03, ERR-LAY-04, ERR-LAY-05 | E11 |
| ERR-CAP-01, ERR-CAP-03, ERR-CAP-04, ERR-CAP-06, ERR-CAP-08 | E12 |
| ERR-CAP-09, ERR-PROC-02, ERR-PROC-03, ERR-UX-08, ERR-TEST-04 | E13 |
| ERR-JOB-02, ERR-JOB-03 | E14 |
| ERR-TEST-01, ERR-TEST-03 | E15 |
| ERR-UX-01, ERR-UX-02, ERR-UX-03, ERR-UX-06 | E16 |
| ERR-CAP-02 | E6 |
| ERR-DES-01, ERR-DES-02 | E10 |
| ERR-DES-05 | E2 |
| ERR-JOB-01 | E4 |
| ERR-PROC-05 | E7 |
| ERR-RES-01, ERR-RES-02, ERR-JOB-04 | E8 |
| ERR-RES-03, ERR-RES-04, ERR-TEST-06 | E9 |
| ERR-RES-05, ERR-RES-06, ERR-RES-07, ERR-RES-08, ERR-TEST-02 | D8 |
| ERR-LAY-01 | D2 |
| ERR-DES-03, ERR-DES-04 | K8 |
| ERR-DES-06 | K11 |
| ERR-CAP-07 | K1 |
| ERR-CAP-10 | K9 |
| ERR-RES-09 | K10 |
| ERR-PROC-04 | O4 |
| ERR-JOB-05 | O6 |
| ERR-UX-04, ERR-UX-05 | I7 |
| ERR-UX-10 | I11 |

The rules outside this table are judgment or guidance, with no criterion of their own. The detectors of the last
section, by stack (no catch that only logs, no floating promises, the cause chain kept), are lines of the gate.

## 1. Taxonomy (TAX)

**ERR-TAX-01** — Classify each error the code can produce into one of three classes and treat each class differently: (a) expected domain, (b) operational infrastructure failure, (c) bug. · How J · criterion none · Check: the taxonomy of the repo (the “Errors” section of `templates/system-design.md`) is in the card's plan, with one row per new error. Domain: insufficient balance, email already registered, slot taken; resolved by the user or the caller, with a message; not retried. Operational: timeout, connection refused, provider 503, full disk; resolved by the system (retry, breaker, degradation) or the operator; retried only if transient and idempotent. Bug: an unexpected `undefined`, a broken invariant, an “impossible” branch; resolved by the programmer, the process aborts the operation or ends; never retried. node-ts `class InsufficientFunds extends DomainError {}`, `class PaymentGatewayTimeout extends InfraError { retryable = true }`, a bug is not modeled, an `Error`/`assert` is thrown; generic Java checked/unchecked, Rust `Result` against `panic!`, Go `error` against `panic`, Effect `E` against *defect* · Source B3, B4, B10, B13, B7.

**ERR-TAX-02** — Expected errors are part of the contract: typed (a discriminated union, a class with a stable `code`) and documented; bugs are not part of the contract. · How C+T · criterion E11 · Check: `tsc --noEmit` with an exhaustive `switch` (`const _: never = e`) over the union of errors of each use case; one test per variant; node-ts `type TransferError = { kind: 'insufficient-funds' } | { kind: 'account-frozen'; until: Date }`; generic `sealed interface` (Java/Kotlin), an error `enum` (Rust), sentinels/types with `errors.Is/As` (Go) · Source B7, B10, B12, B14.

**ERR-TAX-03** — Do not turn a bug into a recoverable error: a broken invariant aborts the operation (and, if the process state is doubtful, the process); it is not returned as a domain error nor retried. · How J+T · criterion E5 · Check: E5 says “the server keeps running”; this bounds when it must **not** (see ERR-PROC-01/07). node-ts `assert(order.items.length > 0, 'order with no items after validation')` instead of `if (!order.items.length) return { kind: 'empty-order' }` when it was already validated at the edge; generic `debug_assert!`/`unreachable!` (Rust), `IllegalStateException` (Java), `Debug.Assert`/`UnreachableException` (.NET) · Source B3, B4, B7, B13.

**ERR-TAX-04** — Everything thrown or rejected is an instance of `Error` (or a subclass) with a stable `name` and `code`; never a string or a loose object. · How C · criterion E11 · Check: `rg -n 'throw\s+["'"'"'`]' src/` is 0; typescript-eslint `only-throw-error` and `prefer-promise-reject-errors` on [NV exact behavior]; generic Python inherits from `Exception`; Go types that implement `error`, not `errors.New` with text the caller parses · Source B13, B14, B11.

## 2. Designing them out of existence (DES)

**ERR-DES-01** — Before adding an error, try to define it out of existence: redefine the operation so the case is not a failure (deleting something non-existent = “it stays non-existent”; clipping an out-of-bounds range). · How J · criterion E10 · Check: the technique and its limit: only if the caller does not need to distinguish the case; if it needs to, hiding it is swallowing an error (ERR-CAP-02). node-ts `async function removeTag(id, tag) { await db.tags.deleteMany({ id, tag }) }` with no `if (!exists) throw NotFound`; an idempotent `DELETE` that answers 204 also if it did not exist; generic `rm -f`, `INSERT … ON CONFLICT DO NOTHING` · Source B1.

**ERR-DES-02** — For the common case offer the form that does not throw (tester-doer, `tryX`, a `find` that returns a typed `undefined`); keep the exception for the exceptional. · How J · criterion E10 · Check: if it happens routinely, a check; if it is rare, an exception. node-ts `findUser(id): Promise<User | undefined>` plus `getUser(id): Promise<User>` that throws; `Number.isNaN(Number(x))` rather than `try { parse } catch`; generic `int.TryParse`, `dict.get(k)`, `Optional<T>`, `Option<T>` · Source B11, B12, B7.

**ERR-DES-03** — Make invalid states unrepresentable: validate once when building the type and let the rest of the code receive only valid values. · How T · criterion K8 · Check: after the edge nothing is revalidated or handled “just in case”; node-ts `const Email = z.string().email().brand<'Email'>()` and domain functions accept `Email`, not `string`; generic value objects with a private constructor, *newtype* · Source B7.

**ERR-DES-04** — Fail fast at the edge: validate input and preconditions before taking resources or starting effects. · How T · criterion K8 · Check: the order validate → reserve resources → effects; node-ts `const input = schema.parse(req.body)` as the handler's first line and a test with an invalid body checks the repository was not called (`expect(repo.save).not.toHaveBeenCalled()`); generic guard clauses, `ArgumentNullException.ThrowIfNull` · Source B2 [NV content], B14, B11.

**ERR-DES-05** — Seek failure atomicity: if the operation fails, the state stays as before (undo the partial), without trying to “fix” half. · How T · criterion E2 · Check: adds the case outside the database (files, external calls, in-memory state); node-ts write to a temp file and `rename` at the end; a test injects a failure at step 2 of 3 and asserts step 1 did not remain. Transactions and compensations: DB-TX-* · Source B12, B11, B23.

**ERR-DES-06** — Use `Result`/`Either` only for domain errors the caller decides; the unexpected operational and the bugs stay as exceptions. If the repo already chose a style, follow it. · How J · criterion K11 · Check: do not reinvent try/catch nor force functional idioms on the consumer; node-ts neverthrow `ResultAsync<Order, OrderError>` in the application layer with `eslint-plugin-neverthrow` so the result is not ignored (rule name [NV]), or Effect if the repo uses it; without a library a discriminated union `{ ok: true, value } | { ok: false, error }`; generic `Result<T, E>` (Rust), `Either`, `(T, error)` (Go) · Source B8, B5, B9, B10.

## 3. Where to catch (CAP)

**ERR-CAP-01** — Catch only where you can do something concrete: recover, translate between layers, add context or release a resource. If not, let it rise to the edge. · How J+C · criterion E12 · Check: `rg -c 'catch\s*\(' src/` per file and review each one against the four reasons; a `catch` that does none of the four is deleted. Generic in Go `if err != nil { return fmt.Errorf("…: %w", err) }` is “adding context”; a bare `return err` at every level adds nothing · Source B11, B13, B4.

**ERR-CAP-02** — Never an empty `catch` nor `.catch(() => {})`; if ignoring is right, make it a specific type and a line that says why. · How C · criterion E6 · Check: `npx eslint --rule '{"no-empty":"error"}' src/`, `rg -U -n 'catch\s*(\([^)]*\))?\s*\{\s*\}' src/` and `rg -n '\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*(\{\s*\}|undefined|null)\s*\)' src/` are 0. `no-empty` does **not** flag a `catch` that holds only a comment, so the `rg` pattern that also sees a comment-only block is needed: `rg -U -n 'catch\s*(\([^)]*\))?\s*\{\s*((//[^\n]*|/\*[\s\S]*?\*/)\s*)*\}' src/` [Untested on this machine]; it also covers `catch { return null }` (see the detectors). Acceptable in node-ts: `catch (e) { if (isNodeError(e) && e.code === 'ENOENT') return defaults; throw e; } // no config: defaults are used`; generic `catch (FileNotFoundException e) { /* reason */ }`, Python `except FileNotFoundError:` with a comment, never `except: pass` · Source B12, B30.

**ERR-CAP-03** — Log each error once, where it is resolved (normally the central handler at the edge); in the middle, either handle it or rethrow it with context, not both. · How C+J · criterion E12 · Check: ``rg -U -n 'catch\s*\([^)]*\)\s*\{[^{}]*(console|log|logger)\.\w+\([^{}]*\bthrow\b' src/`` and each finding is justified or the log removed; the same pattern in `catch (Exception e) { log.error(…); throw e; }`. No duplicates that inflate the log and confuse the count. Format and level: OBS-* · Source B14, B23.

**ERR-CAP-04** — When wrapping, preserve the cause and add the level's context (which operation, which ids), without personal data. · How T+C · criterion E12 · Check: a test `await expect(svc.pay(o)).rejects.toMatchObject({ cause: driverError })`; `rg -n 'new \w*Error\(\s*(e|err|error)\.message\s*\)' src/` is 0 (it loses type, stack and cause); node-ts ``throw new PaymentFailed(`charge of order ${orderId}`, { cause: err })``; `cause` does not come out in `JSON.stringify`, so the logger has to serialize it; generic `fmt.Errorf("charge order %s: %w", id, err)`, `new PaymentException(msg, e)`, `raise PaymentFailed(...) from err` · Source B16, B6, B11, B13, B12.

**ERR-CAP-05** — Throw errors of the caller's level of abstraction; do not leak implementation details upwards (driver codes, SDK classes). · How T · criterion E11 · Check: the dependency-direction test also fails if `domain/` or `application/` import error classes of `pg`, `axios`, `@aws-sdk/*`, `stripe`; generic in Go `%v` instead of `%w` so as not to expose `sql.ErrNoRows`. D2 and rule 3 of `rules/architecture.md` apply this to types of error, not only to imports · Source B12, B6.

**ERR-CAP-06** — Catch specific types; the catch-everything goes only at the edge (central handler, worker loop, `main`). · How J · criterion E12 · Check: node-ts `catch (e) { if (e instanceof UniqueViolation) return conflict(); throw e; }`; generic `catch (SpecificException)`, `except ValueError:`, `errors.As(err, &target)` · Source B11, B23.

**ERR-CAP-07** — The `catch` variable is `unknown` and is narrowed before use; no `any` on errors. · How C · criterion K1 · Check: `tsconfig` with `"strict": true` and without `"useUnknownInCatchVariables": false`; `rg -n 'catch\s*\(\s*\w+\s*:\s*any\s*\)' src/` is 0; typescript-eslint `use-unknown-in-catch-callback-variable` for `.catch(e => …)` [NV behavior]; Python `except Exception as e` plus `isinstance` · Source B30.

**ERR-CAP-08** — Rethrow without losing the original stack. · How C · criterion E12 · Check: node-ts `throw err` keeps the stack; `throw new Error(err.message)` and `throw { ...err }` lose it; `return await` inside `try` so the rejection goes through the `catch` and the stack stays whole; C# `throw;` not `throw ex;`; Java `throw e` keeps, `new X(e.getMessage())` does not · Source B11, B14.

**ERR-CAP-09** — Every promise is awaited, returned or has `.catch`; nothing floating. In parallel: `Promise.all`/`allSettled` and the aggregate is handled. · How C · criterion E13 · Check: typescript-eslint `@typescript-eslint/no-floating-promises` and `no-misused-promises` at `error`, with type checking on; Python `asyncio` tasks without `await` (`RuntimeWarning: coroutine … was never awaited`); C# `async void` outside event handlers. The empty-catch grep does not see the async case · Source B14, B30.

**ERR-CAP-10** — Emitters and streams carry their `error` handler; pipelines are built with `pipeline` so that the error of any stage propagates and closes everything. · How J+T · criterion K9 · Check: node-ts `await pipeline(src, transform, dest)` of `node:stream/promises` [NV: the stream docs were not opened]; a `.pipe()` with no `error` handlers on each stage is a finding; Java `try-with-resources` over each resource of the chain · Source B14.

## 4. Propagation between layers (LAY)

**ERR-LAY-01** — The domain expresses its failures with domain errors, in the business's vocabulary; it knows no HTTP, nor the ORM, nor the SDK. · How T · criterion D2 · Check: node-ts `class SlotTaken extends DomainError { readonly code = 'SLOT_TAKEN' }` in `domain/`; no `HttpException` nor `status: 409` there. The error type respects the same arrow as the imports · Source B12, `rules/architecture.md` (rules 1 and 3).

**ERR-LAY-02** — Infrastructure translates the provider's failures to own errors and marks whether they are transient (retryable) or permanent. · How T · criterion E11 · Check: node-ts in the adapter `if (res.status === 429 || res.status >= 500) throw new GatewayUnavailable({ retryable: true, cause })`; a validation `4xx` → `GatewayRejected({ retryable: false })`; `AbortSignal`'s `TimeoutError` → `GatewayTimeout({ retryable: true })`; a test with a fake that returns each case; generic map `SQLSTATE 40001` → retryable (DB-TX-*), `23505` → domain conflict. The `retryable` mark feeds the retry policy · Source B6, B20, B19.

**ERR-LAY-03** — The interface maps error → response (HTTP or UI) in a single place, with an explicit table; what is not in the table is a generic 500 with a reference id. · How T · criterion E11 · Check: node-ts `const toHttp: Record<DomainError['code'], number> = { SLOT_TAKEN: 409, NOT_FOUND: 404, … }` used by the error middleware; a test per row plus a test of an unknown `Error` → 500 with no detail; generic `@ControllerAdvice` (Spring), `UseExceptionHandler` (ASP.NET Core), middleware in Go/Express/FastAPI. The body is Problem Details (API-07); the reference id is OBS-SUP-01 · Source B14, B23.

**ERR-LAY-04** — 4xx for what the client can correct, 5xx only for what the server could not handle; never `200` with `{ error }` nor `{ success: false }`. · How T · criterion E11 · Check: `rg -n 'status\(200\)[^;]*(error|success:\s*false)' src/`; a contract test per error of the table · Source B23.

**ERR-LAY-05** — The error response carries no stack, driver messages, SQL, file paths or internal class names; the detail goes to the log. · How T+C · criterion E11 · Check: a test forces an internal exception (`jest.spyOn(repo, 'save').mockRejectedValue(new Error('ECONNREFUSED 10.0.0.3:5432'))`) and asserts the body contains no `at `, `ECONNREFUSED`, `10.0.0.3`, `Error:`; `rg -n '(\.stack\b|res\.(status\(\d+\)\.)?(json|send)\(\s*(e|err|error)\s*\))' src/` is 0 outside tests and the logger; `server.error.include-stacktrace=never` (Spring) [NV]; `app.UseDeveloperExceptionPage()` only in development (.NET) [NV]. E6 covers the trace leak · Source B18, B23.

## 5. Resilience (RES)

**ERR-RES-01** — Every remote call has an explicit timeout —connection and response apart when the client allows—, chosen from the downstream's latency (for instance p99.9 if 0.1 % of false timeouts is accepted), never the default. · How C+J · criterion E8 · Check: `rg -n 'fetch\(' src/ | rg -v 'signal'` is 0 (or the common wrapper); `axios.create({ timeout })` clients, database pools with `connectionTimeoutMillis`/`statement_timeout` (DB-OPS-*); the value and its why in the matrix per dependency; node-ts `await fetch(url, { signal: AbortSignal.timeout(2_000) })` and tell `err.name === 'TimeoutError'` from `'AbortError'`; generic `HttpClient.Timeout` (.NET), `connectTimeout` plus `HttpRequest.timeout` (Java 11+), `context.WithTimeout` (Go), `requests.get(url, timeout=(3, 10))` · Source B20, B19, B2, B16.

**ERR-RES-02** — Propagate the deadline and the cancellation: each child call receives the time that is left, and if the client left, the work is aborted. · How T · criterion E8 · Check: node-ts `const signal = AbortSignal.any([req.signal ?? abortOnClose(req), AbortSignal.timeout(budgetMs)])` passed to each `fetch`/query; a test cancels the request and checks the downstream call received `abort`; generic `context.Context` (Go), `CancellationToken` (.NET), gRPC deadlines · Source B19, B16, B22.

**ERR-RES-03** — Retry only transient failures of idempotent operations, with exponential backoff with a cap and jitter, a maximum of attempts, and in a single layer of the stack. · How T · criterion E9 · Check: a test with a fake clock: exactly N attempts, growing waits within `[0, min(cap, base·2^n)]`, zero retries on `retryable: false` or a non-idempotent method; node-ts `const delay = Math.random() * Math.min(capMs, baseMs * 2 ** attempt)` (*full jitter*), the HTTP library's retries off if the layer above already retries; Polly `AddRetry` with `UseJitter`, resilience4j `IntervalFunction.ofExponentialRandomBackoff` [NV name], `tenacity` (Python) [NV]. Three retries × five layers is 243×; honoring `Retry-After` [NV]; server-side idempotency: DB-TX-* · Source B20, B19.

**ERR-RES-04** — Limit the total volume of retries (a budget or a token bucket per client/server) so that, with the dependency down, the load is not multiplied. · How J+T · criterion E9 · Check: node-ts a counter of retries per window; if it exceeds 10 % of the calls, no more retries [NV: the 10 % is illustrative] · Source B20, B19.

**ERR-RES-05** — Put a circuit breaker in front of each dependency that can fall and is called often; when it opens, fail fast without calling it, and leave it visible (log/metric). · How T · criterion D8 · Check: a test: after N failures the breaker opens and the next call fails without touching the fake; after the wait time it lets a trial one through; node-ts `opossum` [NV] or an own breaker of 30 lines; generic resilience4j `CircuitBreaker`, Polly `AddCircuitBreaker` · Source B2, B22, B19.

**ERR-RES-06** — Isolate resources per dependency (bulkhead): a pool or a concurrency semaphore of its own, so that a slow dependency does not exhaust the threads/connections/sockets of everything else. · How T · criterion D8 · Check: with dependency A hanging, the calls to B keep answering; node-ts `p-limit` [NV] or a semaphore per client, `undici` `Agent({ connections })` per host [NV]; generic resilience4j `Bulkhead`, Polly `AddConcurrencyLimiter` [NV], separate pools · Source B2, B22, B19.

**ERR-RES-07** — A fallback only if it is tested and exercised; prefer improving the primary or failing fast. Never a fallback that moves the load to a weaker resource (cache down → everything to the database). · How J+T · criterion D8 · Check: every fallback of the matrix has its test with the dependency down, and the decision says which load it moves and where; if what it returns is old data, the UI says so. Why the default fallback is suspect: it is hard to test, can fail itself, hides latent bugs because it runs little and can worsen the outage (the 2001 case: the cache fell and all servers went straight to the database, which locked up) · Source B21.

**ERR-RES-08** — Declare the graceful degradation: which functionality is turned off, what the user sees, how it is measured and who receives the alert. · How J · criterion D8 · Check: node-ts if the recommendation engine fails, the cart shows without the block and `recommendations_degraded` is recorded; the checkout does not depend on it. Degradation is exercised on purpose because it almost never runs · Source B19.

**ERR-RES-09** — Steady state: everything that grows has a cap —in-memory queues, caches, logs, pending retries, query results—. · How J · criterion K10 · Check: node-ts `new LRUCache({ max })`; mandatory pagination; `highWaterMark` in streams. Adds queues and in-memory caches · Source B2 [NV content], B23.

**ERR-RES-10** — Under saturation, reject early (429/503 with `Retry-After`) instead of accepting and collapsing. · How T (load) · criterion none · Check: the shape of the response is API-*; see PERF-12 in `reference/performance.md` · Source B19, B2.

## 6. Processes (PROC)

**ERR-PROC-01** — On a bug or an unknown state, the process ends and an external supervisor restarts it; there is no attempt to continue. · How T · criterion E5 · Check: see ERR-PROC-02 and ERR-PROC-06. “A crashed app is more reliable and diagnosable than an app with undefined behavior”. It complements E5 (the server keeps running on **operational** errors) and adds the limit · Source B4, B3, B13, B15, B11.

**ERR-PROC-02** — The global handlers (`uncaughtException`, `unhandledRejection`) only record the error as fatal, do a short synchronous cleanup and exit with a non-zero code; they never “carry on”. · How C+T · criterion E13 · Check: `rg -n "process\.on\(\s*['\"](uncaughtException|unhandledRejection)" src/` and each handler ends in `process.exit(1)` or rethrows; a test with a child process that throws without catching and asserts `exitCode !== 0` and a fatal log line; node-ts `process.on('uncaughtException', (err) => { logger.fatal({ err }, 'uncaught'); process.exitCode = 1; shutdown().finally(() => process.exit(1)); })` with a time cap on the shutdown; generic `AppDomain.UnhandledException` (.NET, log only), `Thread.setDefaultUncaughtExceptionHandler` (Java), `sys.excepthook` (Python). “It is not safe to resume normal operation after `'uncaughtException'`” · Source B15, B14.

**ERR-PROC-03** — Do not relax the unhandled-rejections mode: in Node 15 and later the default is `throw`; no `--unhandled-rejections=warn|none`. · How C · criterion E13 · Check: `rg -n 'unhandled-rejections' package.json Dockerfile* .nvmrc *.yml` is 0 or `=strict`/`=throw` · Source B15.

**ERR-PROC-04** — Clean shutdown on `SIGTERM`/`SIGINT`: stop accepting, drain what is in flight with a time cap, close pools and queues, exit. · How T · criterion O4 · Check: node-ts `process.once('SIGTERM', async () => { server.close(); const t = setTimeout(() => { server.closeAllConnections(); process.exit(1) }, 10_000); await Promise.allSettled([db.end(), queue.close()]); clearTimeout(t); process.exit(0) })`; an integration test: a slow request in flight plus `SIGTERM`: the request ends and the process exits with 0; generic `IHostApplicationLifetime.ApplicationStopping` (.NET), shutdown hooks (JVM), `signal.NotifyContext` (Go) · Source B17, B2 [NV content].

**ERR-PROC-05** — A startup error (missing or invalid configuration, corrupt data, a pending migration) is reported with a clear message and the process exits with non-zero before accepting traffic, overwriting nothing. · How T · criterion E7 · Check: node-ts `const env = EnvSchema.parse(process.env)` at startup; a test: without `DATABASE_URL` the process exits with 1 and the message names the variable (without printing its value); generic `ValidateOnStart()` (.NET) [NV], `@Validated @ConfigurationProperties` (Spring) [NV]. Adds configuration and startup dependencies beside corrupt data · Source B3, B4, B11.

**ERR-PROC-06** — Define supervision outside the process: a restart policy with backoff, health checks that reflect whether the process can serve, and an alert if it restarts in a loop. · How J · criterion none · Check: generic `restartPolicy` plus `livenessProbe`/`readinessProbe` (Kubernetes), `Restart=on-failure` plus `RestartSec` (systemd), OTP supervisors · Source B4, B15.

**ERR-PROC-07** — An operational error in a request does not bring the process down: it is answered, recorded, and the server keeps serving the others. · How T · criterion E5 · Check: the boundary with PROC-01: operational → it continues; a bug with doubtful shared state → it ends · Source B13, B23.

## 7. Errors to the user (UX)

**The anatomy of the user's message.** (1) *What happened*, required: the problem in the user's words, specific, with no blame or jargon (“We could not save the appointment.”). (2) *Why*, if known with certainty: the probable cause; if it is not known, it is not invented (“Someone else booked that slot while you were filling in the form.”). (3) *What to do*, required: one concrete action, ideally a button (“Pick another slot.”). (4) *What was kept*, if there is typed data: reassure about what was written (“Your data is still filled in.”). (5) *Reference*, only on unexpected errors: a short id support can search (“Code: 7F3K-29QD”, see OBS-SUP-01). Form: next to the field (validation) plus a summary with links and focus (ERR-UX-04); a banner with `role="alert"` for failures with no focus (ERR-UX-05); an own page for 403/404/service down (ERR-UX-10). Forbidden: “Something went wrong” alone, “invalid”, “oops”, “please” unless the system is at fault, a stack, internal codes as the only content, color alone.

**ERR-UX-01** — Each message says what happened and what to do, in the user's language, specific, without blame; no “Something went wrong”, “invalid”, “oops” nor internal codes as the only content. · How C+J · criterion E16 · Check: `rg -n -i "(something went wrong|an error (has )?occurred|unknown error|oops|inv[aá]lid[oa]?\b)" src/` and each finding is rewritten or justified (add the phrases of the product's language); node-ts “We could not charge the card ending in 4242: the bank rejected it. Try another card or contact your bank.” instead of “Payment error”. Problem, cause and solution · Source B24, B25, B26.

**ERR-UX-02** — When the cause is unknown, say so honestly, offer an action (retry, save a draft, contact) and show a reference id that support can search. · How T · criterion E16 · Check: node-ts “We could not save the changes. Your data is still in the form. Try again in a few minutes; if it keeps happening, write to us with the code 7F3K-29QD.” Generation and correlation of the id: OBS-* · Source B26.

**ERR-UX-03** — On an error, what the user typed stays: the form is not cleared, the draft is not lost, there is no return to the previous screen. · How T (e2e) · criterion E16 · Check: an e2e: fill in, force a 500 with `page.route`, submit, assert the fields keep their value. I10 asks that the screen comes back as it was; this adds the server-error case · Source B24, B25.

**ERR-UX-04** — Validation errors: a message next to the field and a summary at the top with links to each field, the same text in both; on submit, focus goes to the summary; the `<title>` starts with “Error: ”. · How T (e2e/a11y) · criterion I7 · Check: an e2e: submit empty → `expect(page.locator('.error-summary')).toBeFocused()`, `expect(page).toHaveTitle(/^Error: /)`, each link of the summary leads to its field; `aria-invalid="true"` and `aria-describedby` pointing to the message [NV: a general ARIA pattern, not verified in these pages]. Validation goes on submit; after an error, the field with the error is re-validated while it is corrected · Source B25, B27.

**ERR-UX-05** — Errors that appear without moving focus (a save failure, a lost connection) are announced with `role="alert"` or a live region; `assertive` only for the urgent. · How T (a11y) · criterion I7 · Check: a `<div role="alert">` container present in the DOM from the start and its text is changed (WCAG 4.1.3) · Source B27.

**ERR-UX-06** — The error is not communicated with color alone; it goes with text (and optionally an icon). · How T (a11y) · criterion E16 · Check: a11y test · Source B24.

**ERR-UX-07** — Every screen that fetches data declares and tests its states: loading, empty, error, offline and partial; “empty” is not “error” nor the reverse. · How T+J · criterion none · Check: one test per state (network mock: 200 with an empty list, 500, network down, slow); the offline state is decided by the real failure of `fetch`, not by `navigator.onLine` (“inherently unreliable”, only a hint) · Source B24, B28.

**ERR-UX-08** — In the frontend there is a global net: `window` `error` and `unhandledrejection` report to the backend; error boundaries go per zone (a broken widget does not bring the page down) with a fallback that lets the user continue. · How T+C · criterion E13 · Check: `rg -n "addEventListener\(\s*['\"](error|unhandledrejection)" src/` finds at least 1 in the client's startup; boundaries do **not** catch event handlers nor async code: those errors are handled in the handler (the component's error state); a window `error` event [NV]; Flutter `ErrorWidget.builder` [NV] · Source B28.

**ERR-UX-09** — Fit the form to the severity and the moment: a modal only for what blocks; validation appears on submit or on leaving the field after a first error, not while typing. · How J · criterion none · Check: review. “Presenting errors too early is a hostile pattern” · Source B24.

**ERR-UX-10** — Lack of permission, not eligible, service unavailable and non-existent resource are not validation errors: they have a page or state of their own. · How T · criterion I11 · Check: tests of 403, 404 and service down; I11 covers 404, this adds 403 and service down · Source B25.

## 8. Jobs and queues (JOB)

**ERR-JOB-01** — Every queue consumer and every retryable job is idempotent: delivery is at-least-once. · How T · criterion E4 · Check: a test processes the same message twice and asserts a single effect; implementation: DB-TX-* · Source B29, B20.

**ERR-JOB-02** — Bounded retries with backoff; after the maximum, the message goes to a dead letter queue. Permanent errors (a malformed message, a business rule) are not retried: they go straight to the DLQ or to a rejection state. · How T+C · criterion E14 · Check: node-ts BullMQ `attempts` plus `backoff: { type: 'exponential' }` and `UnrecoverableError` for permanent ones [NV names]; SQS `RedrivePolicy` with `maxReceiveCount` · Source B29, B19, B20.

**ERR-JOB-03** — The DLQ has an alarm, a retention longer than the source queue's and a written redrive procedure. · How C+J · criterion E14 · Check: IaC with the alarm over the DLQ's `ApproximateNumberOfMessagesVisible > 0` [NV metric name]; a runbook for the redrive. A DLQ with no alarm is a distributed empty catch · Source B29.

**ERR-JOB-04** — Each job has a timeout or a heartbeat; a hung job is detected and released. Periodic ones carry jitter or an offset per host. · How T · criterion E8 · Check: a test of the timeout and of the release · Source B20, B2 [NV].

**ERR-JOB-05** — Each job failure leaves in the log the job's or message's id, the attempt number and the chained cause. · How J · criterion O6 · Check: review the log of a forced failure; format: OBS-* · Source B13, B14.

**ERR-JOB-06** — If order matters, decide explicitly what happens with a message that fails (block the partition or break the order); a DLQ on FIFO breaks the order. · How J · criterion none · Check: the decision is in the plan · Source B29.

## 9. Testing errors (TEST)

**ERR-TEST-01** — Each error of the card's taxonomy has a test that provokes it and asserts the type/code, the effect (state intact) and what the caller sees. · How T · criterion E15 · Check: node-ts `await expect(transfer(a, b, 1e9)).rejects.toBeInstanceOf(InsufficientFunds); expect(await balance(a)).toBe(before)`. Every error branch the card adds has its test: a live mutant on an error branch fails E15, not only T3 · Source B14.

**ERR-TEST-02** — Inject each dependency's failures at the edge with a fake: timeout, 5xx, 429, connection refused, a malformed response, slowness. One row of the matrix per dependency = at least one test. · How T · criterion D8 · Check: node-ts `msw`/`nock`/`undici MockAgent` [NV API] or a local fake server; for the timeout, a handler that never answers and a short `AbortSignal.timeout` · Source B2 [NV content], B21.

**ERR-TEST-03** — Run mutation over the files with error branches: a surviving mutant in a `catch` or a guard is a branch with no test. · How C · criterion E15 · Check: `npx stryker run --mutate 'src/payments/**/*.ts'` and review the survivors on `catch`/`throw`/`if (!…)` lines; that *BlockStatement* empties `catch` blocks [NV]. `tools/required.mjs` already demands the mutation; this looks at the mutants in `catch` and guards · Source B30.

**ERR-TEST-04** — Test the global handler and the shutdown: a child process that throws without catching exits non-zero and leaves a fatal log; `SIGTERM` drains and exits with 0. · How T · criterion E13 · Check: node-ts `const r = spawnSync(process.execPath, ['fixtures/crash.js']); expect(r.status).not.toBe(0)` · Source B15, B17.

**ERR-TEST-05** — Light chaos before accepting a resilience policy: turn the dependency off locally or in staging and verify that what the matrix says happens. · How J · criterion none · Check: `docker stop <dep>` (or a latency-adding proxy such as Toxiproxy [NV]) during a short e2e; the evidence in `specs/<card>/` · Source B2, B19.

**ERR-TEST-06** — Retries are tested with a fake clock: the exact number of attempts, growing waits with jitter within range, and zero retries for the non-idempotent or permanent. · How T · criterion E9 · Check: a test with a fake clock (E9 was judgment; it becomes a test) · Source B20, B19.

## 10. Typical errors of AI-generated code (AI)

Each with its detector. The `rg` were tried over a sample file on 2026-10-13; in the terminal they go without the escaped `|`.

| ID | Anti-pattern | Detector | Rule that resolves it |
|---|---|---|---|
| ERR-AI-01 | `catch {}` / `catch (e) {}` | `rg -U -n 'catch\s*(\([^)]*\))?\s*\{\s*\}' src/` plus `no-empty`, plus the comment-aware pattern of ERR-CAP-02 | CAP-02 |
| ERR-AI-02 | `catch (e) { console.log(e) }` and carry on | `rg -U -n 'catch\s*\(\s*\w+[^)]*\)\s*\{\s*console\.(log\|error\|warn)\([^)]*\);?\s*\}' src/` | CAP-01, CAP-03 |
| ERR-AI-03 | `catch { return null }` / `[]` / `false`: the caller cannot tell “there is none” from “it failed” | `rg -U -n 'catch\s*(\([^)]*\))?\s*\{[^{}]*return\s+(null\|undefined\|false\|\[\]\|\{\})\s*;?\s*\}' src/` | DES-02, TAX-02 |
| ERR-AI-04 | `.catch(() => {})` | `rg -n '\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*(\{\s*\}\|undefined\|null)\s*\)' src/` | CAP-02 |
| ERR-AI-05 | A `try` that wraps the whole handler with a single generic `catch` | judgment plus cognitive complexity (K3) | CAP-06, LAY-03 |
| ERR-AI-06 | A retry with no cap or backoff (`while (true) { try … catch { sleep } }`) | `rg -U -n 'while\s*\(\s*true\s*\)\s*\{[^}]*\btry\b' src/` | RES-03, RES-04 |
| ERR-AI-07 | “Something went wrong” with no what-happened or what-to-do | `rg -n -i "(something went wrong\|an error (has )?occurred)" src/` | UX-01, UX-02 |
| ERR-AI-08 | A stack or an internal message to the client: `res.status(500).json({ error: err.stack })`, `res.send(err)` | `rg -n '(\.stack\b\|res\.(status\(\d+\)\.)?(json\|send)\(\s*(e\|err\|error)\s*\))' src/` | LAY-05 |
| ERR-AI-09 | `catch (e: any)` / `as any` over the error | `rg -n 'catch\s*\(\s*\w+\s*:\s*any\s*\)' src/` plus `strict` | CAP-07 |
| ERR-AI-10 | Promises with no `await` (a loose `save(x)`, `forEach(async …)`) | `@typescript-eslint/no-floating-promises`, `no-misused-promises` | CAP-09 |
| ERR-AI-11 | `throw "text"` / `reject("text")` | `rg -n 'throw\s+["'"'"'`]' src/` plus `only-throw-error` | TAX-04 |
| ERR-AI-12 | `throw new Error(err.message)`: loses type, stack and cause | `rg -n 'new \w*Error\(\s*(e\|err\|error)\.message\s*\)' src/` | CAP-04, CAP-08 |
| ERR-AI-13 | `process.on('uncaughtException', log)` with no exit | `rg -n "process\.on\(\s*['\"](uncaughtException\|unhandledRejection)" src/` and read the body | PROC-02 |
| ERR-AI-14 | `fetch`/HTTP client with no timeout | `rg -n 'fetch\(' src/ \| rg -v 'signal'`; `axios.create` without `timeout` | RES-01 |
| ERR-AI-15 | `log.error(e); throw e;` in every layer (a duplicated log) | ``rg -U -n 'catch\s*\([^)]*\)\s*\{[^{}]*(console\|log\|logger)\.\w+\([^{}]*\bthrow\b' src/`` | CAP-03 |
| ERR-AI-16 | `200` with `{ success: false }` | `rg -n 'status\(200\)[^;]*(error\|success:\s*false)' src/` | LAY-04 |
| ERR-AI-17 | A silent fallback to empty or default data (“if the API fails, an empty list”) | judgment: look for a `catch` that returns a default value in adapters | RES-07, UX-07 |

The 15 rules of most impact for an agent, in order: CAP-02, LAY-05, RES-01, CAP-09, AI-03/DES-02, RES-03, PROC-02, CAP-04, UX-01/02, LAY-03, CAP-07, UX-03, CAP-03, TAX-01/03, TEST-01/02.

## Sources

- B1 — John Ousterhout, *A Philosophy of Software Design*, 2nd ed., 2021, ch. 10 “Define Errors Out of Existence” [NV chapter text] — https://web.stanford.edu/~ouster/cgi-bin/book.php · https://wiki.tcl-lang.org/page/Define+Errors+Out+of+Existence
- B2 — Michael Nygard, *Release It!*, 2nd ed., 2018 (index; content [NV]) — https://pragprog.com/titles/mnee2/release-it-second-edition/
- B3 — Joe Duffy, “The Error Model” (Midori), 2016 — https://joeduffyblog.com/2016/02/07/the-error-model/
- B4 — Joe Armstrong, *Making reliable distributed systems in the presence of software errors*, KTH, 2003 — https://erlang.org/download/armstrong_thesis_2003.pdf
- B5 — Rob Pike, “Errors are values”, Go blog, 2015 — https://go.dev/blog/errors-are-values
- B6 — Damien Neil and Jonathan Amsterdam, “Working with Errors in Go 1.13”, 2019 — https://go.dev/blog/go1.13-errors
- B7 — *The Rust Programming Language*, ch. 9.3 “To panic! or Not to panic!” — https://doc.rust-lang.org/book/ch09-03-to-panic-or-not-to-panic.html
- B8 — Scott Wlaschin, “Railway Oriented Programming” and “Against Railway-Oriented Programming” — https://fsharpforfunandprofit.com/rop/ · https://fsharpforfunandprofit.com/posts/against-railway-oriented-programming/
- B9 — neverthrow — https://github.com/supermacro/neverthrow
- B10 — Effect, “Expected Errors” — https://effect.website/docs/error-management/expected-errors/
- B11 — Microsoft, “Best practices for exceptions” (.NET) — https://learn.microsoft.com/en-us/dotnet/standard/exceptions/best-practices-for-exceptions
- B12 — Joshua Bloch, *Effective Java*, 3rd ed., ch. 10, items 69–77 (titles only [NV body]) — https://www.informit.com/store/effective-java-9780134686059
- B13 — Dave Pacheco, “Error Handling in Node.js”, Joyent, 2014 (through a translation) — https://habr.com/en/articles/222761/
- B14 — Yoni Goldberg et al., *Node.js Best Practices*, section 2 — https://github.com/goldbergyoni/nodebestpractices
- B15 — Node.js docs, `process`: `'uncaughtException'`, `'unhandledRejection'` — https://nodejs.org/api/process.html · https://nodejs.org/en/blog/release/v15.0.0
- B16 — MDN: `AbortSignal.timeout()` and `Error.cause` — https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static · https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause
- B17 — Node.js docs, `http.Server.close()` / `closeAllConnections()` — https://nodejs.org/api/http.html
- B18 — RFC 9457, Problem Details for HTTP APIs, 2023 — https://www.rfc-editor.org/rfc/rfc9457.html
- B19 — Google SRE Book, ch. 22 “Addressing Cascading Failures” — https://sre.google/sre-book/addressing-cascading-failures/
- B20 — AWS Builders' Library, “Timeouts, retries, and backoff with jitter” — https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
- B21 — AWS Builders' Library, “Avoiding fallback in distributed systems” — https://aws.amazon.com/builders-library/avoiding-fallback-in-distributed-systems/
- B22 — Polly “Resilience pipelines”; resilience4j — https://www.pollydocs.org/pipelines/ · https://resilience4j.readme.io/docs/getting-started
- B23 — OWASP Error Handling Cheat Sheet; OWASP Top 10:2025 A10 “Mishandling of Exceptional Conditions” — https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html · https://top10.owasp.org/2025/A10_2025-Mishandling_of_Exceptional_Conditions
- B24 — Tim Neusesser and Evan Sunwall, “Error-Message Guidelines”, Nielsen Norman Group, 2023 — https://www.nngroup.com/articles/error-message-guidelines/
- B25 — GOV.UK Design System, “Error message” and “Error summary” — https://design-system.service.gov.uk/components/error-message/ · https://design-system.service.gov.uk/components/error-summary/
- B26 — Microsoft, “Error Messages” (Windows UX guidelines) — https://learn.microsoft.com/en-us/windows/win32/uxguide/mess-error
- B27 — W3C, Understanding WCAG 2.2, SC 4.1.3 Status Messages — https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- B28 — React docs, `Component` (error boundaries); MDN `unhandledrejection` and `navigator.onLine` — https://react.dev/reference/react/Component · https://developer.mozilla.org/en-US/docs/Web/API/Window/unhandledrejection_event · https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine
- B29 — AWS, “Using dead-letter queues in Amazon SQS” — https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
- B30 — Tools: ESLint `no-empty`, typescript-eslint `no-floating-promises`, TS `useUnknownInCatchVariables`, Stryker supported mutators — https://eslint.org/docs/latest/rules/no-empty · https://typescript-eslint.io/rules/no-floating-promises/ · https://www.typescriptlang.org/tsconfig/#useUnknownInCatchVariables · https://stryker-mutator.io/docs/mutation-testing-elements/supported-mutators/

## Not verified

- The inner content of Ousterhout ch. 10 (masking, aggregation, “just crash?”): only the title, the examples (`unset`, `substring`) and the central idea, through reviews and the Tcl wiki.
- The content of each pattern of *Release It!* (index only) and the body of items 69–77 of *Effective Java* (titles only).
- Joyent's original in English (the URL is down): a translation was used.
- The `throw` default of `--unhandled-rejections` since v15: verified through release notes found by search, not through the CLI page (truncated).
- Microsoft “Error messages”: the Windows UX guide (Win32) was verified; the Microsoft Writing Style Guide was not opened.
- The global `error` event of `window`, `pipeline` of `node:stream/promises`, `aria-invalid` / `aria-describedby`, `Retry-After`: general knowledge, not opened.
- API names of libraries cited as examples: `opossum`, `p-limit`, `undici` `Agent`/`MockAgent`, `msw`, `nock`, BullMQ, `tenacity`, Polly `AddConcurrencyLimiter`, resilience4j `IntervalFunction`, Toxiproxy, Spring/.NET options.
- That Stryker's *BlockStatement* mutator empties `catch` blocks: verify in a run.
- The exact behavior of `only-throw-error`, `prefer-promise-reject-errors` and `use-unknown-in-catch-callback-variable` (only that they exist was seen).
- The comment-aware empty-catch pattern of ERR-CAP-02 is derived from the study's patterns and was not run.
- The numeric values of the dependency matrix example are illustrative, not measured recommendations.
