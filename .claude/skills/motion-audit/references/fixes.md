# Fix catalogue

Load this when a finding is diagnosed and a fix has to be chosen. Each row maps a root cause to the
fix that removes it and the tempting fix that does not.

| Root cause | Correct fix | Wrong fix |
|---|---|---|
| Hover/press rule changes a property the `transition` does not list | List exactly the properties that change: `transition: background-color 140ms var(--ease-out), transform 120ms var(--ease-out)` | `transition: all` |
| Button has no hover or press state | Tint or shadow on hover, `scale(0.97)` or a 1-2 px `translateY` on press | Leaving frequent buttons static "because they are frequent" |
| `outline: none` with nothing in its place | `:focus-visible { outline: 2px solid ...; outline-offset: 2px }` (or a ring on the wrapper with `:focus-within`) | `:focus` ring shown on every mouse click; removing the outline |
| A control is revealed only by `:hover` (`opacity-0 group-hover:opacity-100`) | Reveal it on `:focus-visible` and `:focus-within` too (`group-focus-within:opacity-100`, `focus-visible:opacity-100`) | Keeping it `display: none` until hover |
| Width/height/margin/top animated (expand, grow, slide) | `transform`/`opacity`; for size, FLIP (measure, invert with `scale`, play), `grid-template-rows: 0fr -> 1fr` for accordions, or `interpolate-size: allow-keywords` with a short duration | `max-height: 9999px` hacks; `will-change` on everything |
| Long frame when the gesture starts | Move work out of the handler: precompute, `requestIdleCallback`, `scheduler.yield()`, defer the fetch until after the first frame of the transition; animate on the compositor | Shortening the animation so the stutter is shorter |
| Long frames while scrolling | Scroll-driven animations (`animation-timeline: view()`) or IntersectionObserver instead of scroll listeners; no layout reads in scroll handlers; fewer and lighter blurs and shadows animating | `passive: true` alone (it fixes input delay, not frame cost) |
| `ease-in` or `linear` on a response | Strong ease-out (`cubic-bezier(0.23, 1, 0.32, 1)`) for enter and feedback; ease-in-out only for on-screen movement between two places; springs for gesture-driven motion | `ease` everywhere |
| Durations out of band or inconsistent | Duration tokens per gesture (`--dur-hover`, `--dur-press`, `--dur-enter`, `--dur-overlay`) used by every component; list deliberate ones in `tokens.durations` of the config | Tuning each component by eye |
| Hover driven by `@keyframes`, or a JS animation restarting from its start value | CSS transitions (they reverse from the current value) or springs that retarget from the live value | `animation-fill-mode` tricks; disabling pointer events during the animation |
| Toggle reversed mid-motion restarts (`not-interruptible`): open and close are `@keyframes` classes, each starting at its own `from` | Transitions between two states (`.open { transform: none }` with `transition: transform ...`), which reverse from the current value; or WAAPI: keep the `Animation` and call `reverse()`, or start the new one from `getComputedStyle(el).transform`; with Motion or springs, retarget from the live value | Disabling the button or pointer events while it animates; a longer duration |
| Dialog, menu or toast mounted on open has no exit and jumps | Keep it mounted until the exit finishes (Presence, `onAnimationEnd`, `<dialog>` with `@starting-style` and `transition-behavior: allow-discrete`) | Unmounting in the same tick as the state change |
| JS animation and CSS transition on the same property | One owner per property: remove the CSS transition where the library animates | Adding `!important` |
| `:hover` transform on touch | Wrap motion in `@media (hover: hover) and (pointer: fine)`; keep colour feedback outside it | Removing hover motion everywhere |
| Reduced motion ignored | `@media (prefers-reduced-motion: reduce)`: drop translate, large scale, parallax and loops; keep opacity and colour changes and a small press scale; in JS honour `matchMedia` (Motion: `MotionConfig reducedMotion="user"`) | `* { animation: none !important; transition: none !important }`: it also kills feedback and can strand entrances at opacity 0 |
| Entrance leaves content at opacity 0 when its animation is skipped | Put the visible state in the base style and animate *from* hidden (`@starting-style`, `animation-fill-mode: backwards`, or a class added by an observer that is a no-op under reduced motion) | Hiding content until JS runs |
| Infinite decorative loop | Stop it or replace it with a slow opacity pulse under reduced motion; pause off-screen | Leaving it because it is "small" |
| A section appears with no entrance (`no-entrance`, info) | Only if the design calls for it: a short opacity + 8-16 px translate on first view, 30-80 ms stagger for groups, once only | Re-animating on every scroll pass; entrances over 600 ms; adding motion just to silence an info |
