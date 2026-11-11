# Composition: the rules of a frame

A frame is one viewport (390x844 or 1440x900) along the scroll. The rules are judged per frame, not per page, and the page is composed starting at 390.
Source: 49 Awwwards winners, 2025-2026 (own measurement, p25-p75 of 185 frames at 390 and 152 at 1440 once frames the instrument could not read are
dropped). The winners score 7.2-8.2, so the ranges describe a top group, not what separates it from an ordinary site; with 17-19 sites per measure none
correlates with the jury score (evidence strength `*`: taste to weigh, a range out of bounds is a difference, not a failure by itself).
Frames 1 and 2 weigh most (57 % of the time on the first, 74 % on two, 81 % on three): they get the wide strict bounds (focus 15-60 %, empty at most 70 %);
the rest of the frames use the ranges as guides.

## Frame rules for landing frames (strict in frames 1 and 2)

The numbers below describe landing frames. A product screen uses the product rows of `design-round` and `modern-interface.md`.

The rules of focus, scale, air, axes, competing and density are taste (`*`). A flag on them is a difference to weigh: it is never chased if the frame looks worse against the reference than before. Each round starts with a visual judgment of the frame next to the same frame of the reference, then the numbers. A round spent only moving numbers, with no visual gain, is a failure mode, not progress.

| # | Rule | 390 | 1440 | Measure |
|---|---|---|---|---|
| 1 | One dominant, three levels at most | focus 18-44 % of the frame (frames 1 and 2: 15-60 %) | 12-60 % | largest visible box over the viewport area, a box over 90 % of the viewport being the backdrop and not the focus; it beats the second by 1.2-3.3x |
| 2 | Visible jump of scale | 2-3 sizes; headline at least 48 px next to a label of 12 px or less | display 98-194 px | distinct font sizes (step 1.25); largest over smallest |
| 3 | Air with a destination | at most 70 % empty (measured 28-66 %), on one side or around the focus | at most 70 % (measured 34-80 %) | empty 24 px cells and their split; never spread across rows |
| 4 | Few axes, one off-axis on purpose | 2-5 left edges | 2-9 | left edges grouped at 8 px |
| 5 | Few compete | at most 3 elements with 50 % or more of the focus weight | same | boxes with area of 50 % or more of the largest |
| 6 | Bounded density | 4-17 elements | 5-24 | visible text and media boxes |
| 7 | Recompose on the phone, never stack | at least one full-bleed block; the headline moves up, the crop changes | | the same frame at 1440 and 390: focus, order, crop; `scrollWidth <= clientWidth` at 320 |
| 8 | One path | one column or centered, or a Z with the focus in the middle | Z or diagonal | thirds the focus occupies |

Frames that are data (a sheet, figures, lists, cards) need a focus too: a headline of 48 px or more, one accented card among equals, an image
bleeding off the edge. A data frame of equal-weight pieces with no focus is the usual failure at 390.
At 1440 the hero content spans half the width or more, and at least two sections change their number of columns from 390 (rules 16 of `responsive-classes.md`; rows `desktop hero span` and `desktop composition`): a centered phone column with empty sides is a stretched phone, not a composition.
An asymmetry with an anchor (2/3 + 1/3) is allowed; thirds and the golden ratio are not an argument.

## Intent: when the ranges are reported, not flagged

The ranges describe a page of ordinary frames. A section family built on purpose to break them says so in the card's `## Look` with `intent: collage|statement|grid|pinned-media`
(`design-round --intent <name|card.md>`). Under an intent, rules 1, 4, 5 and 6 (focus share, axes, competing, elements) print as `report:` and are not flags; rules 2, 3, 7 and 8 and the void-frame row keep their bounds.
- `collage`: items of different sizes drifting at different speeds; many compete on purpose and one photo leads (for example 8-12 items, a photo at about 35 % of the width).
- `statement`: centered lines of one display size with air on each side (for example 20 %); few elements, no image.
- `grid`: equals with no single focus (cards); dense, little empty, a staggered column carries the rhythm.
- `pinned-media`: a full-bleed layer held while text or a second layer moves over it.
An intent is declared, never inferred from the frame that failed; without it the ranges are flags as before.
Evidence (`*`, one site): landonorris.com, Site of the Year 2025, 1440 px. The first reading flagged 10 of 12 frames: a full-bleed pinned portrait read as a focus of 100 %, a 3143 px pinned drift collage carries 8-12 competing items, the helmet grid has 41 elements and 5 % empty. The same frames carry a scale jump of 8:1 (display 93-97 px at line height 0.85 against 12 px labels) and type that overflows the viewport on both sides.

## Page rhythm (weak evidence, advice and not a gate)

Two sources, eight sites; it weighs less than frames 1 and 2.
- Alternate dense and airy blocks (45-75 % of the changes), change plane every 1-2 blocks.
- Short bands between long blocks; a block of at least 0.09-0.45 viewport heights.
- 5-10 distinct layouts down the page, one zone of surprise, the rest in the prototypical structure.

## Per-frame table

Each round writes a table by frame with the numbers above and a flag per rule out of range, after the visual judgment of each frame against the reference. The designer looks first at the frames with two flags or
more, from 390 up, frames 1 and 2 before the rest, and corrects those that also look poorer; a flag on a frame that looks at level is left, with `intent:` if the section is air or density on purpose.
