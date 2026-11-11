---
paths: ["apps/**","src/**","packages/**","lib/**"]
---

# Speed: fast by construction

Slow software is mostly decided by the shape of the code, and the fast shape costs the same to write the first time. Write it
that way from the first line; measuring later is a safety net, not the method. No layer is added for speed (cache store, queue,
CDN, memoization) until a number asks for it: this file is about how code is written, not about more architecture.

**Before the code**, the plan answers for each screen or endpoint the card touches: which queries it runs and over how many
rows today and in a year; which is the slowest path and what the person sees meanwhile; which action must feel instant. What
the card does not answer is an `ASM` with its test.

## Data
- The query comes from the screen: select the fields and rows it shows, and bring related rows in the same query (the ORM's
  include/join/`in`). Never a query inside a loop or a `map`.
- The index is born with the table, in the same migration: every foreign key column and every column a list filters or sorts by.
- Every list has a limit (a default and a maximum) and a total order with a unique tiebreaker; keyset pagination once it grows.
- Writes in bulk (`createMany`, `updateMany`, one `INSERT … VALUES (…), (…)`), not one per iteration.

## Server
- Independent I/O runs together (`Promise.all`, `asyncio.gather`, `Task.WhenAll`); `await` in a loop only when each step needs
  the previous one.
- Nothing heavy or synchronous on the request path: no `*Sync` APIs, bounded input to JSON parsing and regexes, heavy CPU to a
  worker.
- Every GET says how it is cached: hashed assets `public, max-age=31536000, immutable`; HTML and user data `private, no-cache`
  with an ETag; `no-store` only for what is sensitive. Responses carry the resource's fields, compressed, never the whole row.
- An operation that can take over a second answers at once and reports its progress.

## Screen
- The first view arrives with its data (the route's loader, a server component, or a prefetch in the router), never a `fetch`
  in a mount effect. Independent requests start together; a child does not wait for its parent's render to ask.
- Split by route and by interaction (`import()` for modals, editors, charts and heavy libraries); import by name, not the
  whole library.
- Every action answers within 100 ms (pressed state); work over 50 ms yields to the browser.
- A mutation that rarely fails is optimistic with rollback (`useOptimistic`, or TanStack Query's cancel, snapshot, set,
  rollback on error, invalidate on settle). Never for money or what cannot be undone.
- Changing page or filter keeps the previous data on screen until the new one arrives; the next route and its data are
  prefetched on hover, focus or touchstart (never a route with side effects).
- Waiting: the skeleton delay and the progress thresholds are UX-CARGA-1 in `.claude/reference/ui-patterns.md` (module ui).
- Images carry width and height, AVIF/WebP and `srcset`, lazy only below the fold, the main one eager; fonts are WOFF2,
  subset, with `font-display`.

## Flutter
- `const` widgets; `ListView.builder`/`GridView.builder` for lists; no costly work in `build()`; `setState` on the smallest
  subtree; no `Opacity`, `saveLayer` or clips inside animations. The frame budget is in `.claude/profiles/flutter.md`.

The gate's `slow-code` check (`tools/hygiene.mjs`) reads the lines a card added and fails a query or a request per iteration
(a `for`, `.map`, `.forEach`), an `await` per iteration that is not a `Promise.all`, `forEach` with an async callback, a `*Sync`
call inside a server function, a `fetch` in a mount effect, and a `findMany`, `.objects.all()` or `SELECT` with neither a
limit nor a filter. A line kept on purpose carries `kit-keep: <why>`; a whole file, `declared · slow-code · <file> · <why>` in
the Log.

The numbers and their sources: `.claude/reference/performance.md`.
