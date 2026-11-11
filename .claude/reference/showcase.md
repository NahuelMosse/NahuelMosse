# Showcase: a screen that impresses on its own, in a video

Read it when the design line's **expression** dial is 8 to 10: a presentation, a landing, a demo,
anything that is shown rather than used eight hours a day. The product register —2 to 4— is in
`modern-interface.md`. Every item below names the component of `components.md` it comes from: a
showcase is **composed from the catalog**, not drawn.

*Measured: a presentation site built with the product register and a hand-written set scored 5 out
of 10 against the team's references —flat background, hover without depth, a figure that does not
lead—, after ten hours.*

## The message comes before the scene

A showcase sells something to someone. Before the first component, the design line writes three
lines: **who watches** —and what they do not know—, **what they must conclude** in one sentence, and
**the three proofs** that carry it. Every section is one of those proofs or it goes.

*Measured: a presentation of the method, with its design approved, still failed as marketing —
figures without saying what they compared, and whole sections that argued against the method—.*

- **Every number carries its context in the same frame**: what is measured, against what, and why
  it matters to the viewer. `97 %` alone says nothing; `97 % of 120 criteria met — without the
  method, 61 %` says it. Internal names —card IDs, criterion codes, tool names— are translated to
  what they mean to the viewer or removed.
- **A comparison leads with the difference that favors the thesis**, and the figure that costs is
  shown as the price of that difference, next to it: `20 min instead of 3 — and zero data lost`.
  Never a section whose conclusion is the opposite of the thesis.
- **Limits are told, not hidden**, in one sentence where the claim is made —`three cards measured,
  same model`—; not a section of their own that undoes what came before. Nothing is invented or
  stretched to fit the thesis: a claim the data does not hold is cut, not softened.
- **One idea per scene, said in the headline**; the panel proves it. A headline that describes
  (“Time”) instead of stating (“Twenty minutes buy a card nobody has to fix”) is a gap.

## What the video has to show

The principle: something alive in the first 3 s, one protagonist object, material surfaces, and a story that advances while something
stays. The catalog components are options for each beat, not a required list:

- **0-3 s, something alive:** a background with light or a grid that breathes, a headline that enters by word (`@magicui/light-rays`, `@aceternity/spotlight-new`, `@magicui/flickering-grid`, `@magicui/text-animate`).
- **3-8 s, the main figure leads:** it assembles itself at display size (`@magicui/number-ticker`).
- **Scroll:** content enters staggered, once (`@magicui/blur-fade`: 0.4 s, 6 px, +0.04 s per item); the story advances while a panel or beam stays (`@aceternity/sticky-scroll-reveal`, `@aceternity/tracing-beam`).
- **Pointer:** light follows the cursor on surfaces; the important card has a living border (`@magicui/magic-card`, `@aceternity/card-spotlight`, `@magicui/border-beam`).
- **Depth, navigation, detail:** material edges instead of flat boxes; switching section slides, never cuts; a card opens into its detail in place (`@kokonutui/liquid-glass-card`, `@animate-ui/components-animate-tabs`, Motion Primitives `morphing-dialog`).
- **The end:** a call to action that shines (`@magicui/shimmer-button`, `@aceternity/hover-border-gradient`).

## Every scene is composed, not a card on a void

*Measured: a first showcase built from the catalog scored 7 in impact and 4 in closeness to the
references; the judge's five gaps were all composition, not components —no charts, one card on an
empty background, flat cards, a diffuse glow, tiny text—.* So every scene follows these:

1. **A bento, not a card.** Each scene fills about 70 % of the frame with a grid of panels of
   different sizes —a large figure, a chart, chips, a short list—, like the references' dashboards.
   A lone card on an empty background is the failure. `@magicui/bento-grid`,
   `@aceternity/bento-grid`.
2. **A comparison is drawn, not typed.** Comparisons are bars that grow; evolutions are
   areas that draw; the active point glows and its value is read in the header of the card; the scale is visible.
   `@shadcn/chart` (Recharts area and bar) with the active dot in the accent and a soft glow
   (`filter: drop-shadow(0 0 8px <accent>)`), styled to the direction; `@magicui/animated-circular-progress-bar` for a ratio.
3. **Surfaces with material**: an inner gradient (from the surface to a little of the accent), a
   1 px top highlight (`inset 0 1px 0 rgb(255 255 255 / .08)`), backdrop blur where something passes
   behind, and stacked cards where there is a collection (`@aceternity/card-stack`,
   `@kokonutui/card-stack`). Flat black with a hairline is the product register, not this one.
4. **One hero object**: something that is not text or a card in the first screen —an orbit of
   icons, a globe, a 3D marquee of captures, a map— (`@magicui/orbiting-circles`, `@magicui/globe`,
   `@magicui/icon-cloud`, `@aceternity/3d-marquee`, `@aceternity/world-map`).
5. **One accent per scene, with intention**: the accent lights one thing —the active bar, the main
   button, the chart's point— and ignites when the scene enters; never a diffuse stain behind the
   text.
6. **No dead frame**: while scrolling something is always moving —a pinned scene that advances, a
   figure that counts, a chart that draws, a slow parallax—. A frame of the showreel with nothing in
   motion and nothing lit is a gap.
7. **Readable in the video**: body text 16 px or more, labels 13 px or more, both at 4.5:1; one focus
   per scene, the rest recedes.
8. **Surface contrast, not one dark plane**: at least one card filled with the accent's gradient and
   light text, and one light panel in the dark page —the references do it—; a page that is all dark
   cards with a thin accent border reads as “a well-built dashboard, not a showreel”.
9. **The hero object is the protagonist**: large in the first screen (50–60 % of its height is a reference), with material
   and parallax with the pointer; small icons around a number do not count. Glass or refraction only when the brand asks for it.
10. **Charts with craft, never the library default**: an area with a gradient fill fading to the
    background and a glowing active point that follows the pointer while the header of the card reads its value; bars that
    grow staggered with the key one in a second accent. Flat single-color blocks are the default.
11. **Every section fills the viewport when it is the focus** —pin it, or size it to the screen—: no
    300 px of black between sections, no third of the frame empty.
12. **Nothing broken in a frame**: no clipped glyph (a `%` cut by `overflow`), no nested scroll inside
    a card, no box with two lines and empty space. The judge looks at frames; so does the client.

*Measured: the second lap, with rules 1–7 applied, still scored 5–6 —“correct but predictable,
amber bars on black, no memorable moment”—; rules 8–12 are the judge's five gaps.*

## The direction that goes with it

- **The accent follows the brand.** Dark with a glowing accent is one option of this register; a bright neutral with a vivid one is
  another. The accent appears in light, not only in fills: beams, glows, the spotlight.
- **Display type with character**, large and tight (-0.02 to -0.04 em), with a calm text face; the
  figure in tabular numbers at display size.
- **Layers**: background (light, grid, noise) → glass surfaces with light edges → content → the
  pointer's light on top.
- **Choreography, not decoration**: one main movement per section; the rest settles. What moves
  helps read: the figure that assembles, the panel that stays while the story advances.

## The system behind, for what the catalog does not cover

GSAP with ScrollTrigger for scroll timelines —`scrub: 1` or more, never `0`—, Lenis for smooth
scrolling synced to ScrollTrigger (`lenis.on('scroll', ScrollTrigger.update)`), and a shader or
Three.js only if the direction asks for it. The vendored skills `build-awwwards-quality-sites` and
`cinematic-gsap-lenis-motion-system` (Meng To, MIT) carry the recipes; the official `gsap-core`,
`gsap-react`, `gsap-scrolltrigger`, `gsap-plugins` and `gsap-timeline` (GreenSock, MIT) carry the API
and its cleanup. Every GSAP plugin is free, SplitText and ScrollSmoother included: none needs a paid account or token.

## What is touched is tested by touching it

A frame does not show how a drag feels. Every signature interaction —drag a globe, tilt a card,
open a dialog, switch a tab— is **exercised** in step 9 with a script: drag a known distance, hover,
click, and compare what moved against the rule.

- **Direct manipulation is 1:1**: the point under the pointer stays under the pointer. A globe of
  radius `r` px rotates `dx / r` radians for `dx` px of drag; a slider moves its thumb the same
  pixels as the pointer. A library default that turns a 100 px drag into half a turn is a defect.
- **Inertia, if any, decays in under 1 s** and never reverses; with reduced motion, none.
- **Pointer effects follow without lag or overshoot**: the spotlight under the cursor, the tilt at
  most 8–10°.

*Measured: a globe from the catalog passed the judge's frames and the motion audit; the user dragged
it once and it spun far more than the hand.*

## The product shown inside the page

A landing proves a product by showing it at work: a window of the app, a feature card, a cursor that
does the task. That fragment is a faux UI built in the page's code, and it is read at reading size, so
it is judged as a product screen, not as decoration.

1. **Start from a gold and prove the still.** The gold is the `ref/` capture closest to what the fragment
   shows: the product's own UI, or its category's in `design-refs.md`. Build the opening and the payoff
   as stills first. Put each one beside the gold at the size it is shown, at 390 and 1440, and say the one
   difference. If yours is the sparser, flatter or smaller one, fix that before any motion.
2. **It answers this product, not its category.** A window floating whole with even margins, or the same
   phone framing on every page, could be any product.
3. **Framing.** One gutter, and the window bleeds off at least one edge. Filler may run off the crop. A
   title, an action, a value or a chip is either whole or out of frame. No corner of the frame is empty
   without a reason.
4. **Density.** The subject is real words and values. Placeholder bars go only beside it and where the
   crop cuts. A list in frame has no more placeholder rows than worded ones. A pane has no void under its
   list. Rows sit at their own pitch, padded 12 px (8 px dense), never spread out to fill the pane.
5. **Each beat looked at frame by frame.** Extract every press, entrance, exit, hand-off and loop seam
   from the showreel's `.webm` at 20 fps or more (`ffmpeg -ss <s> -t 1 -i <reel>.webm -vf fps=25 beat-%02d.png`).
   Matching end frames prove nothing about the frames between them.

The pairs below are each the same scene twice, with one thing wrong. Find the one that looks like the
defect and do what the right column says.

| Still: what you see | What the good one does |
|---|---|
| Text at 9–10 px to fit more rows | Names at 13–14 px, metadata at 11–12 px, and fewer rows |
| Every row carries a hash, author, duration and badge | Real detail only on the row the story is about |
| A colored glow on the card, button or status | One soft neutral shadow |
| A violet-to-pink ground, gradient text, a tinted card | The product's own neutrals and one accent on what matters |
| Sparkles, wands or a gradient «AI» chip | The product's own mark, or a plain label that says what happens |
| Filled and outline icons side by side, an emoji as an icon | One pack, one stroke, color only where it carries a state |
| An icon in translucent ink that darkens where strokes cross | One opaque color; a lighter opaque gray for a quieter icon |
| A one-letter tile in a brand color beside a real company | The company's mark, or its name alone |
| A stat's unit wrapped onto its own line | The number and its unit on one line |
| Words closer than 8 px to the edge of a card or row | 12 px inset, and the same inset carried round the bottom |
| Four equal tiles, each a heading over bars | One tile leads, and each tile is a specific moment with its words |
| A whole app scaled down into a small slot | Crop to the useful content at reading size, and let the chrome run off |
| A desktop screen shrunk to the phone | Reflow before shrinking; nothing under 10 px at 390 |

| Motion: what you see | What the good one does |
|---|---|
| A label replaced in one frame | A stable control; the old words leave while the new ones enter |
| The result appears before the press | The press and the surface respond first, then the state changes |
| A new row shoves its neighbors in one frame | The container's height animates and carries the rows below |
| An icon swapped for another (plus to close) | The same strokes rotate, so the shapes keep their relation |
| A message removed with no exit | It stays mounted for its exit, then leaves |
| An interrupted highlight restarts from the start | It retargets from where it is |
| A flying object lands a few pixels off | Measure the target itself, not its padded wrapper |
| A loop resets and erases what was built | The reset has a visible cause (a press on Clear) |
| A spinner starts turning after it appears | It is already turning when it fades in, and keeps turning while it fades out |
| Related changes start in the same frame | Starts offset, movements overlapping |
| A chart fades in whole | The line draws from its start, the area follows, the end dot lands when the line arrives |

A checker can flag a jump and still miss a wrong path, an implausible gesture or an unreadable crop.
The report says which frames were looked at, and what no frame covered.

## What does not change in a showcase

- Only `transform`, `opacity` and `filter` animate; never layout properties.
- **Reduced motion**: backgrounds still, text without the staggered entrance, figures at their
  value, no parallax; the content and the light on hover stay.
- **Slow hardware**: `motion-audit --cpu 4` with no long frames while scrolling; heavy backgrounds
  lower their density or stop off screen.
- Content readable from the first frame and every control reachable by keyboard.

## How it is judged

`showreel.mjs` records the 30–45 s tour above; it is checked against the design line's references: impact in 3 s, choreography,
depth and materials, detail, *would you show it in a video?*
