# Scroll and 3D scenes: when they earn their weight

A scene that follows the scroll (a pinned timeline, a WebGL canvas, a loader curtain) costs bytes, frames and a failure mode that stays invisible: a blank canvas. This is the contract for one.
Source: landonorris.com, Site of the Year 2025 (own measurement, evidence strength `*`: one site, taste to weigh). Product 3D itself follows `reference/3d.md`.

## When it earns its weight

- One idea carried end to end (a portrait cut, masked and reassembled), not an effect per section. Without that idea a photo or a video does the job (`reference/assets.md`).
- A scene only where the object or place is the protagonist and a real reference exists; the rest of the page works with the scene removed.
- Every scene has a fallback still: no WebGL, `prefers-reduced-motion` and a failed load show the same composition as an image, never an empty box.

## The canvas is never blank

- `design-round` runs the row `canvas-nonblank`: each visible canvas is screenshotted at t0 + 2 s and after each scroll; a canvas whose pixels are uniform (sd under 1.5) fails.
- A WebGL canvas only counts as painted if the screenshot shows it; reading the canvas buffer after the frame returns blank without `preserveDrawingBuffer`.
- With WebGL off the page shows the fallback still, and the row passes on that still.

## Budget and init

- glb + hdr 1 MB or less, glb optimised with Draco (`gltf-transform optimize`), one HDRI of 1k, MSDF fonts only if text is drawn in GL. The measured site ships three Draco glb (976 KB) and two 1k HDRIs: past the budget, so the budget is a ceiling to defend, not a trait of the winner.
- A scene below the fold initialises when it nears the viewport (`IntersectionObserver`, 1 viewport of margin), never at load.
- One WebGL context per page; scenes share the renderer and move between canvases. A second context is a second GPU budget and loses the first on mobile.
- The load curve of `excellence.md` rule 6 holds: the LCP element is never the canvas, and the canvas does not delay it.

## Pinned timelines

- A pin has an explicit length in px or viewports (`end: "+=2240"`), is scrubbed by the scroll and releases before the page ends. Pins of the measured site: 900, 2240 and 900 px of 13.6k px of scroll.
- `design-round --scrub` captures 5 frames across each pin and one after it and reports the pin lengths and their share of the scroll: keep it under half of the page, and a pin with nothing new to show for 1000 px is a wall.
- Content stays reachable: the pinned layer sits under the text, not over the links, and a keyboard user reaches the next section.
- Lenis or any smooth scroll drives one clock (GSAP ticker); no second scroller.

## Loader curtain

- A first-frame brand curtain of 3 s or less. The content is reachable and focusable while it runs; the curtain has `pointer-events: none` once it is no longer needed and its controls leave the click sweep.

## Scroll as a variable

- Color is a scroll variable: the background interpolates between sections (dark, gray, cream) from one custom property set by scroll progress; the nav recolors with it.
- Text contrast is measured at both ends of each interpolation and at its middle, on painted pixels (`palette: text contrast`).

## Fluid rem: one composition scaled

- Sizes in rem over a root size that scales with the viewport between a floor and a ceiling: the layout is scaled, not reflowed. Mobile gets its own unit.
- Check at 390 and 320: `scrollWidth <= clientWidth`, the display line count, tap targets of 44 px at the scaled size. A composition that scales needs the mobile-specific moves of `composition.md` rule 7 on top (the crop changes, the headline moves up).
