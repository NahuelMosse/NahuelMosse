# NM-1 · rondas

Captures: README rendered with GitHub's own renderer (`gh api markdown`, gfm) inside github-markdown-css, `.markdown-body` at 1012 px (and a 390 px viewport, 16 px page padding), dark and light by `prefers-color-scheme`, full page, SVG animations settled. `measure.json` next to each set holds the rendered box of every image. `design-round.mjs` does not fit (it captures a running app's viewports, not a rendered README), so the captures are the card's own.

`rondas/r0` is before; `rondas/r2` is the last set. `r1` is the first pass before the card height was unified at 176 (not committed).

## Direction

Every widget is drawn at the size the README shows it at in the 1012 px column (full width 1012, a third 337, a quarter 252), so a type size is the same number of pixels in every card at every width, and every card shares one frame: a 1 px outline at 16 % of the ink, a title band of 48 px tinted at 4 % with a red 8 px mark and the title in 11 px caps, a 24 px inset, baselines on a 4 px grid. Type: 11 titles and labels, 13 body, 20 names, 30 stats, 48 figures, 80 the npm counter.

## Round 0 · what was inconsistent (1012 px)

1. Frame: five different treatments. Repo and tool cards had no outline, only a 48x3 red tab at the top and a hairline at 166.5; npm package cards a hairline at 101.5 and no tab; npm, skyline and heatmap nothing at all; streak a hairline at H-8.5; building a hairline top and bottom bleeding 0..1100 (it was 1044 px wide on screen, past the 1012 column of the others, x 32..1044 against the cards' 48..1028).
2. Title band: repo "REPOSITORY" 11 px dim, tool title 11 px dim with 1.6 tracking, npm packages none (the name at 18 px was the title), npm/skyline/streak 14 px bone with a 10 px red square, heatmap 14 px bone with no square at y 26 and x 46 (the others y 34, x 24), building 13 px red with a red dot, link chips and views 11 px red with no mark.
3. Scale: each SVG was drawn at its own width, so type scaled differently. Repo/tool cards 300 px drawn, 324 shown (x1.08: 19 px name shown at 20.5, 13 px body at 14); npm packages 350 -> 324 (x0.93: 18 px name at 16.7); full-width 1100 -> 1012 (x0.92: 14 px titles at 12.9, 48 px stats at 44); heatmap 971 -> 1012 (x1.04); link chips 300 -> 233 (x0.78: 18 px address at 14). The same role (a title, a name, a number) measured 11, 12.9, 14 and 15 px on screen depending on the card.
4. Heights: preview 182, repo 184, tool 184, npm package 102, npm 250, skyline 478, heatmap 226, streak 169, building 175; chips 43 (links) and the whole thing looked uneven. Skyline: 478 px with the figure alone in the upper right and the prisms in a diagonal leaving about 45 % of the card empty; npm: a 112 px red counter, the loudest object on the page next to cards of 18 px type.
5. Rows did not span the column: three-up rows were 3 x 324 + 8 px of whitespace = 980 px, centered, so their outer edges sat 16 px inside the full-width widgets (x 48..1028 against 32..1044). The four link chips were 233 px with 4-5 px gutters, left edge x 63 against 32.
6. Inner margins: 24 px in most, but heatmap labels at x 8 and grid at x 46, the chips at x 2, the skyline origin at 90.
7. Vertical rhythm: gaps between blocks 22 px everywhere except preview -> card 6 (intended, they are one unit).
8. Chapter headers 1100 -> 1012 (x0.92), label 16 px at y 40 (shown 14.7 at y 37), word at x 20, thread ending 30 px before the right edge.

## Round 1 · changes

1. Character: one frame and band for every card (`card()` in live.mjs; chips and headers in build_plates.py). The red tab, hairline-only and bleeding frames are gone.
2. Hierarchy and typography: the type scale above; every title the same size, case, tracking (1.5) and place (x 24+16, baseline 32); the npm counter 112 -> 80, skyline and streak figures both 48, package stat 30, building name 30.
3. Depth and color: the band tint (fg at 4 %), same outline opacity (16 %) in dark and light; heatmap legend moved into its band (no extra row below the grid).
4. Composition: drawn at 1012 / 337 / 252 natural widths; three-up and four-up rows drawn with no whitespace between images (README template: `join("")`, widths 33.3 % and 24.9 %) and an inset per slot (0, 6, 12 px for thirds; 0, 4, 8, 12 for the chips) so the frames span 33..1043 against the full-width cards' 32..1044 with 18 px (thirds) and 16 px (chips) gutters. Skyline redrawn to fill the inner width (week pitch 17.2 px, 112 px max bar, height computed from the data: 338 px, was 478). Heatmap grid fills the inner width (pitch 17.5). Npm card: counter and sparkline split by a hairline at x 528. Headers 1012 x 136, label on the cards' title baseline, word and label at x 22/24, thread to 6 px before the right edge.
5. Motion and states: unchanged classes and keyframes (`u`, `f`, `d`, `r`, the counter roll, the pulsing mark now a square in "currently building").

## Round 2 · changes

1. Third-width cards, streak and building unified at 176 px (were 168 in round 1: the foot row sat 25 px under a two-line body and 20 px over the bottom edge; now 156 baseline, 20 px bottom, same as the card grid); foot row of repo, tool and npm package on one baseline (156).
2. Light theme checked: the band tint and outline read at the same strength as dark; no card needed its own tone.
3. 390 px checked: the same proportions at x0.354, nothing wraps (three-up cards 115 px, chips 89 px), no card emptier than its row.

## Measures, last set (1012 px, dark)

- Frame: 1 px, ink at 16 %, on all 18 widgets (4 chips, 9 third-width cards, 5 wide).
- Title band 48 px (chips: none, mark and label at y 16..24); inset 24 (chips 16); title 11 px caps tracking 1.5, baseline 32.
- Heights: chips 64; third-width cards 176 (repo, tool, npm package); previews 190; wide: npm 240, skyline 338 (data-driven), heatmap 228, streak 176, building 176.
- Gutters: 18 (cards), 16 (chips) at 1012; every block gap 22 px (paragraph margin + baseline), preview -> its card 5.
- Row span: 33..1043 (cards), 34..1041 (chips), 32..1044 (wide).

## Open

- At 390 px the whole page is the 1012 layout scaled by 0.354: 11 px titles show at 3.9 px and 13 px body at 4.6 px, in every card alike. Making them readable needs a different layout for phones (`<source media>` variants per widget, a stacked one-column set); not done, out of the card's wording (content, size, layout of the same widgets) and doubles the assets.
- The animated previews (assets/previews, built by build_previews.py) are not redrawn; they fade to transparent at their edges and now render 337 x 190.
