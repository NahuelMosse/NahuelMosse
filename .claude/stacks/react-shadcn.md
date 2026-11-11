# Profile: React, Tailwind and the component catalog

The stack for screens: what the libraries of `reference/components.md` need, so a screen is
**composed from the catalog** instead of drawn by hand. A repo that already has a frontend keeps
its own; this profile is for new screens or for a card that asks for this level. **Read only the
section of the step you are in.**

## Setup (the first card that needs it)

```
npm create vite@latest <app> -- --template react-ts
npm i motion lucide-react clsx tailwind-merge class-variance-authority
npm i -D tailwindcss @tailwindcss/vite @types/node
npx shadcn@latest init
```

- Tailwind v4 through `@tailwindcss/vite`; the tokens of the design line in the `@theme` block of
  the main CSS —colors in `oklch()`, radii, fonts— and nowhere else.
- `components.json` as `npx shadcn init` writes it; the community registries (`@magicui`,
  `@aceternity`, `@kokonutui`, `@animate-ui`, `@coss`, `@react-aria`) resolve through shadcn's
  directory with no extra configuration. Motion Primitives installs by URL:
  `npx shadcn@latest add "https://motion-primitives.com/c/<name>.json"`.
- React Aria Components (`npm i react-aria-components`) for what the catalog does not cover.
- GSAP and Lenis (`npm i gsap lenis`) only in a showcase card that needs scroll timelines.
- Installed components land in `src/components/ui/` and in one folder per registry; they are the
  project's code from then on, adapted to its tokens. They are the only place a native `<button>`,
  `<input>`, `<select>`, `<table>` or `<dialog>` is written: on a screen it fails the gate (`I-catalog`),
  and the task that builds the screen names the items it composes in `reuses:`.
- The `shadcn` skill (from shadcn-ui, loaded by itself in a repo with `components.json`) carries the
  CLI (`npx shadcn@latest search`, `docs`, `info`), the need → component table and the rules of
  composition: before writing a styled `div`, `npx shadcn@latest search` across the registries.

## Every component that comes in

```
npx shadcn@latest add @magicui/number-ticker
```

Then, before using it on a screen: tokens instead of its default colors, its reduced-motion version
checked (`useReducedMotion` from `motion/react`, or `motion-reduce:` classes), and its place in the
gallery route (`src/gallery.tsx`, `/gallery`) in every state.

## The `## Gate` of `card.md`

```
types: npx tsc --noEmit
unit: npx vitest run
lint: npx eslint src
build: npx vite build
scenarios: npx playwright test --project=gate
mutate src/lib/<logic>.ts: npx vitest run src/lib/<logic>.test.ts
motion gallery: node .claude/tools/motion-audit.mjs http://127.0.0.1:<port>/gallery --cpu 4
showreel: node .claude/tools/showreel.mjs http://127.0.0.1:<port>/ --out specs/<card>/showreel
budget: npx size-limit
vitals: npm run verify:vitals
```

`budget:` measures the initial JS per route against the budget of O15 and `vitals:` the LCP, INP and CLS
(O15 of `stacks/node-ts.md`); both run alone, at the end, over the production build. Untested on this machine.

- **Mutation only over logic with unit tests** (`src/lib/`): `mutate.mjs` refuses a browser suite.
  What a component does on screen is covered by the scenarios and the gallery tests.
- The app is served from the production build (`npx vite preview --port <port>`) for `motion-audit`,
  `showreel` and the captures; never the dev server.
- **No timing in a scenario**: frames and milliseconds are `motion-audit --cpu 4`, alone.
- **Stable before frozen**: the card's new scenarios run 3 times before they are frozen —
  `npx playwright test --grep "@<ID>" --repeat-each=3`, and for unit tests
  `node .claude/tools/repeat.mjs 3 -- npx vitest run --sequence.shuffle`—; one failure is “could not run: unstable”, never frozen.
- **The expected value is written**: the spec files' ESLint block carries the `no-restricted-syntax`
  selector of `stacks/node-ts.md` (“Before committing the RED tests”) against `expect(…filter|map|reduce|sort|find…)`.
- **Components ahead**: the catalog components the design line names are installed when the card
  starts, in the background (`npx shadcn@latest add …` with a log), while the questions are answered; the
  card does not wait for the network at implementation.

## Screen: states and motion

The screen audit (`templates/design-line.md`, “The screen audit”) is answered per screen; what
`motion-audit` measures is cited from its report, the rest from the showreel's frames.

| Item | Measured by |
|---|---|
| Hover, press, keyboard focus | `motion-audit` |
| Open and close, content in and out, layout changes | `motion-audit` (transitions on the elements that appear) and the showreel |
| Selection, navigation continuity, progressive disclosure | the showreel and a scenario per change |
| Loading, loading → success, error, empty → populated | a scenario per state, with its capture |
| Drag and reorder | a scenario with the keyboard path |
| Reduced motion | `motion-audit` (reduced pass) and a scenario with `reducedMotion: 'reduce'` |
