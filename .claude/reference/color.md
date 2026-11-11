# Palette method

Each step ends in a check that can be run. A failed check sends you back to that step; it is not patched at the end. Numbers marked (*) are practical thresholds of this method, not standards; the rest come from WCAG/APCA or brand guides. Report the result of every check in three states: passed, failed, could not run.

## 0. Brief
One line: category, 3 personality adjectives, and the 5 competitors or references of the genre.
- Check: 5+ references with their dominant color noted; one sentence on following the category convention or differing from it on purpose.

## 1. Value structure first (no hue)
Fix the OKLCH L ladder of 7 roles: background, surface 1, surface 2, border, muted text, text, accent. Dark example: .18 / .23 / .28 / .38 / .72 / .93 / accent .68-.80.
- Check: ΔL >= .10 between neighboring surfaces and >= .25 between background and muted text (*); the grayscale test: a capture with `filter: grayscale(1)` (and blur 8px) keeps CTA, headline and background separated; the accent is >= .10 ΔL from muted text. The CTA separates from its adjacent background and from body and muted text by OKLCH distance, not by L alone: ΔL >= .15, or ΔC >= .08, or hue >= 40° when both have chroma >= .04 (*). A saturated accent and a pale background of the same luminance separate by chroma (landonorris.com: L .96 and .97, ΔC .22).

## 2. Hue harmony by the brand concept
Pick the main hue, then the scheme by personality: energy/CTA = complementary as a heuristic (dominant 60-70%, complement 10-15%, never equal parts); calm/content = analogous; many hues = triadic with one dominant; safe default = split-complementary; sophistication = monochrome + neutral.
- Check: classify the hues in use by LCH angle and match them to the declared scheme; in triadic or tetradic one hue dominates.

## 3. Temperature
One dominant (warm or cool); the opposite, muted, in one place only (accent, edge light, a datum).
- Check: the opposite temperature covers <= 15% of the area in a capture (*).

## 4. Neutrals with a hue
Neutrals carry the brand or accent hue: OKLCH chroma .005-.03, one hue across the scale, monotone even L curve; no #000 or #fff unless a brand decision.
- Check: chroma and hue of each neutral measured; the L curve is monotone.

## 5. One accent
Chroma hierarchy: neutrals and backgrounds low, one action color high. The action color comes from the brand or the product (a flavor, the pack), never a hue that exists only for the CTA. The accent is reserved for the primary CTA when it also colors non-actions (headings, labels, decoration); an accent that is the action color of the whole page (every button, link and wipe in one lime) is valid. A second accent only for one moment. Secondary colors are never headline, button or body text; no color on color. Ramps shift hue (shadows cooler, lights warmer, 5-15 degrees per step (*)).
- Check: at most 2 accent tokens besides the primary in a view; the CTA has the largest ΔE of its surroundings; accent area <= 10-15%; `design-round` row `palette: accent reserved` (applies only when the accent also colors non-actions).

## 6. Proportions as a range
Declare the proportion: 60/30/10 by default, 75/20/5 when the audience does not know the brand, 60/20/10/10 with four colors. It is a heuristic, not a standard.
- Check: measured proportion (k-means of 5 clusters over a capture) within ±10 points of the declared one.

## 7. Per-variant palettes (plans, categories, flavors)
Applies when the page has variants; otherwise this step is skipped.
The same L ladder per role in every variant; only the hue (and chroma if needed) changes. Default: brand dominant + one accent per variant. The CTA fill has equal OKLCH L in every variant.
- Check: variant x role table with L within ±.03 per role (*); hues of variants >= 40 degrees apart; each variant's (background, accent) pair Lc >= 60 for the button and 4.5:1 for text; `design-round` row `palette: variant CTA fills`.

## 8. Contrast: WCAG and APCA
WCAG: text 4.5:1, text >= 24px (or 18.67px bold) 3:1, UI and focus 3:1; hover, focus and active states measured apart; test the lowest-contrast zone of gradients. APCA (beta, not a standard): body Lc >= 75, headlines >= 45-60, loose text >= 30, with polarity. Accent text on paper needs its own darker token (L <= .55).
- Check: every text color against the surface it really sits on, not the base (the round samples the painted pixels under the text, ignoring text at opacity 0 and lines clipped away); `design-round` rows `palette: text contrast` (WCAG, fails) and `palette: APCA Lc` (reported). Text over a photo or a gradient is judged against the worst tenth of the pixels behind it (3:1 or more): row `palette: text over images`; the fix is a scrim or a calmer crop, not a bigger weight. Colorblindness: `Emulation.setEmulatedVisionDeficiency`; meaning never rests on color alone.

## 9. Dark surfaces
Base not black unless a brand decision (#0E1014-#3A4049 range), 3-4 surfaces by elevation (5-12% white mixed in), text at 87% (secondary 60%), accent desaturated 15-20% and lighter; no accent in large fills.
- Check: stepped L of surfaces; accent chroma lower than in light; contrast against the elevated surface.

## 10. Derive in CSS
Tokens in `oklch()` with an sRGB fallback and a `@media (color-gamut: p3)` override; derivatives with `oklch(from var(--base) ...)`; mixes and gradients `in oklch`/`in oklab`. Relative syntax does not clip out-of-gamut: measure the result.
- Check: no loose hex outside `:root`; the palette tokens are written in the Direction with their OKLCH L and the results of steps 1-8.

## 11. Final check
1. Grayscale + blur 8px: hierarchy intact. 2. WCAG. 3. APCA. 4. Color vision deficiency. 5. Measured proportion against the declared. 6. The real page in context, not the swatch: a color looks different next to its neighbor. Image treatment does not fix a bad palette: decide the palette before choosing hero imagery.
