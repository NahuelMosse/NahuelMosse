# NM-4 · rondas

Captures: README rendered with GitHub's own renderer (`gh api markdown`, gfm) inside github-markdown-css, `.markdown-body` at 1012 px (viewport 1076 with 32 px of page padding, so the column is x 32..1044), and a 390 px viewport (16 px padding), dark and light, full page, every widget scrolled into view so its animation settles. Widgets are the local drawings of `scripts/live.mjs` (`assets/live/`), not the deployed ones. `design-round.mjs` does not fit (it captures a running app), so the captures are the card's own; `measure.json` next to each set holds the rendered box of every image, its drawn size, scale and the type sizes as shown. Captures are in `rondas/` (not committed).

`r0` is main before this card, `r1` the first pass, `r2` the last set.

## Direction

The free look of NM-3 stays: red tab and loose label on the cards, a red mark and loose label on the wide widgets, hairlines only where they were, no outline, no band, no fixed box. Only the geometry changes: every SVG is drawn at the width the README shows it (full 1012, a third 337, a quarter 252), so a type size is the same number of pixels everywhere (11 labels, 14 text, 20 names, 30 stats, 48 figures, 80 the npm counter); every image of a row sits against the next one and insets its content by its position, so the outer edges of a row are the full-width elements' (content x 24 and 988 of the column); one inset (24), labels on one baseline (34), the wide and band widgets 176 high.

## Round 0 · what was misaligned (1012 px column, dark)

1. Scale: each SVG drawn at its own width and shown scaled. Link chips 300 -> 232.8 (x0.776: 18 px address shown at 14, 11 px label at 8.5); repo and tool cards 300 -> 323.8 (x1.079: 19 px name shown 20.5, 13 px text 14, 11 px label 11.9); npm package cards 350 -> 323.8 (x0.925: 18 px name shown 16.7); full-width widgets 1100 -> 1012 (x0.92: 14 px titles shown 12.9, 48 px figures 44.2, 56 px skyline figure 51.5, npm counter 103); heatmap 971 -> 1012 (x1.042: 14 px title shown 14.6); chapter headers x0.92 (16 px label shown 14.7). The same role measured 11, 11.9, 12.9, 14, 14.6 and 14.7 px on screen.
2. Row edges: rows of three were 3 x 323.8 + whitespace, so their images spanned x 47.9..1028.1 against the full-width widgets' 32..1044 (16 px short on each side); their content started at x 47.9 + 24 x 1.079 = 73.8 against the wide titles' 32 + 24 x 0.92 = 54. The four chips were 232.8 wide with gutters, spanning x 63.2..1007.4 (31 px short on the left, 37 on the right), content at x 63.2 + 2.
3. Insets: the heatmap's grid at x 46 and its labels at x 8 (wide titles at 24); building's hairlines bled 0..1100 (shown 1012, the full image) while streak's ended at 24; skyline origin at x 90; chips' content at x 2.
4. Heights: link chips 43.4; preview 182.1; repo and tool card 183.5; npm package 101.8; npm 250.2; skyline 478.4 (the figure and number in two corners, about 45 % of the box empty); heatmap 226.2; streak 169.3; building 174.8. Four band widgets with four different heights (183.5, 169.3, 174.8, and 250.2 for npm).
5. Titles: repo "REPOSITORY" 11 px at x 24, tool title 11 px with 1.6 tracking, npm/skyline/streak 14 px bone with a 10 px red square at y 34, heatmap 14 px at y 26 and x 46 with no mark, building 13 px red with a pulsing round dot at y 39; chips 11 px at tracking 3. Three baselines (26, 34, 39), three tracking values, three marks.
6. Vertical rhythm: block gaps 22 px except where the heights above leave rows of different weight (cards 183.5 under previews of 182.1, npm package row 101.8 under a 250 px counter).
7. npm counter 112 px, the loudest object on the page next to 20 px names.

## Round 1 · changes

1. Character: unchanged; tab, mark and hairlines as they were.
2. Hierarchy and typography: all widgets drawn at their displayed width (`slot()` in live.mjs and build_plates.py, banner redrawn at 1012 x 304); one scale 11 / 14 / 20 / 30 / 48 / 80; every title is the 8 px red square with an 11 px label at tracking 2, x 24, baseline 34 (building's square pulses, heatmap gets its mark); chapter headers' label on that baseline, word 77 px.
3. Depth and color: none.
4. Composition: rows of three and four join with `""` and 33.3 % / 24.9 % widths (sync_portfolio.mjs); content offsets 23.5 / 15.8 / 8.2 for thirds and 22 / 17 / 12 / 7 for quarters, gutters 24; the wide widgets' hairlines (streak, building) span 24..988; skyline fills 24..988 and its height comes from the data; heatmap grid fills 54..988; npm counter 80 with the sparkline on the right half; card height 176 (repo, tool, building, streak), npm package 104.
5. Motion and states: classes and keyframes unchanged.

First pass of the captures was taken before the lower widgets had started their animations (off-screen SVG images do not run): the skyline and the npm counter showed mid-animation. The harness now scrolls each widget into view; the skyline's figure collided with its number at the right end.

## Round 2 · changes

1. Skyline: slope 3.2 / week and bars to 104, so it reads as a skyline, and the contribution figure moved to the empty lower left (it sat over the tall recent bars at the right): 1012 x 294, was 478 shown.
2. Re-captured r0 with the same harness (main in a worktree) so before and after are comparable.
3. 390 px: the page is the same layout at x0.354, chips 89 px wide from x 16.2 to 372.8, banner and wide widgets 16..374: no wrap, no overflow.

## Measures, last set (1012 px column, dark)

- Scale: every image shown at x1.000 (r0: 0.776 to 1.079); type on screen 11, 14, 20, 30, 48, 80 (r0: 8.5 to 103, nine different sizes for the roles of label and text).
- Row edges: thirds at x 32.5, 369.5, 706.5, 1043.5 with no gap between images; quarters at 33.5, 285.5, 537.5, 789.5, 1041.5; content from x 56 to x 1020 (the column's 24 px insets) in both rows and in the wide widgets (r0: thirds 73.8..1010.7, chips 65..1006, wide 54..990).
- Heights: chips 48 (43.4), cards 176 (183.5), npm package 104 (101.8), npm 212 (250.2), skyline 294 (478.4), heatmap 244 (226.2), streak 176 (169.3), building 176 (174.8).
- Titles: all at baseline 34, x 24, 11 px, tracking 2.

## Open

- The animated previews (assets/previews) are not redrawn: they render 337 x 189.5 and fade to transparent at their edges.
- At 390 px the whole page is the 1012 layout scaled by 0.354 (11 px titles show at 3.9 px); a phone layout is not part of this card.
- `prefers-reduced-motion` freezes the npm counter's digit columns at their first row (existing behavior, not touched).
- The live widgets of NahuelMosse/profile-widgets must be ported from scripts/live.mjs before this merges: the README points at the lab's drawings, which are still the old sizes.
