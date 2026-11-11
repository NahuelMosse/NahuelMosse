# Excellence: the last 10 % of a screen

Fourteen rules measured on nine award-level sites. Each is a pattern with numbers, how to check it and the tool that measures it.
Evidence strength of each rule: `***` three or more concordant sources with at least one measured study (law); `**` awarded practice or several experts, no study (follow it);
`*` one source or only our own measurement (taste: a difference to weigh, never a failure by itself).
`node .claude/tools/design-round.mjs <url> --out <dir> --gpu` measures rules 1 to 5 and the load of rule 6 in one call; the rest are read from
the captures or from `motion-audit.mjs <url> --measure` (`report.json`). A rule that is out of range is a difference to correct, not a taste.

## Typography and surface

1. `*` **Display large against the body, line height tight (0.8-1.0 for uppercase display). Report only, never a failure. Applies to a landing with expression 8-10; a product screen uses the scale of `modern-interface.md`.** The nine references run 5x to 9x with line height 0.95 or less; the
   49 Awwwards winners, 2025-2026, run a median of 2.9x (range 2-9x; 30 % reach 5x at 1440, 11 % at 390) and a median line height of 1.0 (27 % at 0.95 or less).
   Neither correlates with the jury score. A Site of the Year runs 8x at line height 0.85 (97 px against 12 px). Check: `fontSize` of the display over the one of `body`, and `lineHeight / fontSize`; the display is the block with the most painted text (area times font size), not the `h1`: screen-reader copies and clipped or transparent lines do not count. Tool: `design-round.mjs` (`display/body ratio`, listed as `info`).
2. `**` **Negative tracking only on display (32 px or more): -0.02 to -0.03 em. Body is 0 or positive; small capitals +0.05 to +0.12 em.** The product sites tighten their display; small lowercase text needs air.
   Check: `letterSpacing / fontSize` of the display is negative, of the body is 0 or more; `normal` on a display fails. Tool: `design-round.mjs`.
3. `**` **Two or three families and at most 9 distinct sizes in the first viewport.** Seen 7 of 9; a screen with 16 sizes has no scale.
   Check: count of `Math.round(fontSize)` over the visible text nodes. Tool: `design-round.mjs` (`font sizes`).
4. `*` **A texture is an option for dark or scene pages, never required; none is a valid declaration.** Fine grain or noise over the flat surface, 4 of 9, and 4 of the 5 dark or scene sites; a paper texture or contour lines are a texture too (a Site of the Year uses no grain). Grain, when used: opacity 4 to 8 %, animated at 12 fps or less. `design-round --grain none` declares none.
   Check: a `grain` or `noise` class, `feTurbulence` or a `url(*noise*)`; a 100 % capture over a dark plane. Tool: `design-round.mjs` (`grain`, with `--grain baked|none` declarations).
5. `**` **One dominant tone and one accent, no pure black or white backgrounds.** 6 of 9 (`#08090A`, `#05090B`, warm whites, display-p3).
   Check: computed `background-color` of `body` and of each section against `#000` and `#fff`. Tool: `page.evaluate` on the captures.

## Motion

6. `*` **The load is a choreography of 2 to 3 waves 200 to 300 ms apart, 0.9 to 2 s from the first movement, and it never hides the LCP element.** The LCP element
   is visible and painted at t0 and the wave moves it with `transform`; a fade from `opacity: 0` delays the LCP by the length of the fade. A fourth wave at 3.9 s arrives after the
   awarded sites are done. Check: `load` of `report.json` grouped by `startMs` every 100 ms; the opacity of the LCP element at t0 is 1. Tool: `motion-audit.mjs --measure`, summarized by `design-round.mjs`.
7. `***` **The load curve is ease-out with no overshoot; the spring is kept for what is touched.** 4 of 4 measurable; the largest overshoot seen is 2.3 %.
   Check: `grammar.shapes` and `maxOvershoot`. Tool: `motion-audit.mjs --measure`.
8. `*` **Stagger has two registers: 25 to 40 ms between letters, 200 to 250 ms between blocks.** 82 ms is in neither.
   Check: `grammar.staggerMs` and `roles.cards.stepMs`. Tool: `motion-audit.mjs --measure --click <cta>`.
9. `**` **The press scales, in 100 ms.** Seen 2 of 2 products (`scaleX`, 100 to 184 ms). Check: `roles.cta.press`. Tool: `motion-audit.mjs --measure --click <cta>`.

## Content and character

10. `*` **On a portfolio or showcase page: one live detail that is real data, not decoration**: a clock, the cursor coordinates, a typeset load counter. 3 of 9.
    Check: captures at 0 and 2000 ms; the text changes with no interaction. Tool: `design-round.mjs` captures.
11. `*` **On a portfolio or showcase page, a custom cursor carries content (image, coordinates, text), never a bare ring and dot.** 3 of 9 carry content; 5 of 9 keep the native one.
    Check: fixed elements with `pointer-events: none` under 160 px. Tool: `page.evaluate`.
12. `***` **Sound only behind an explicit gate or a toggle visible from the first frame.** 3 of 9, all with a scene.
    Check: no `AudioContext` created before a gesture. Tool: `page.evaluate` with an init script.
13. `**` **An image is treated in the language of the brand, never pasted raw**: duotone, grading, tone pulled to the background, fog of the scene color.
    3 of 4 of the sites with strong imagery. Check: a capture of one section with an image. Tool: `design-round.mjs` captures.
14. `*` **A headline with two voices in the same sentence** (weight, style or tone): serif light with grotesk black, white then gray, handwritten notes.
    3 of 9. Check: the hero capture. Tool: `design-round.mjs` captures.

## Real assets, not code

An object or a place that exists is shown with a real photo treated (grading, duotone) or with video, never with 3D modeled by code: it looks cheap (3D only by `reference/3d.md`).
Generative work (SVG, canvas, shader) is for data, curves and textures. Sources with a free license and no payment: Pexels (photo and footage), Wikimedia Commons, Openverse, Poly Haven, ambientCG, Fontshare.
Every asset is credited in `specs/<card>/CREDITS.md` with URL, author and license. GSAP has its own free license; it is not MIT.

## Measured on

| Site | Genre |
|---|---|
| emotion-agency.com | agency, preloader with counter and audio gate |
| signal-a.studio | typographic, no WebGL |
| overworldaudio.com | audio studio, WebGL scene |
| tympanus.net/Development/ScrollPanels | editorial, image panels on scroll |
| tympanus.net/Development/ScrollTextMotion | text motion on scroll |
| guillaumecolombel.fr | GSAP showcase, fogged 3D |
| illoca.unseen.co | GSAP showcase, duotone illustration and grain |
| linear.app | product, UI typography and micro-interaction |
| family.co | product, stagger and UI animation |
