# Established styles

An optional catalogue of dialects, to recognise a page by and to borrow from; a screen is not required to name one. One visual language per page, plus at most one extra signature. A blend takes one trait from the second style (a radius, a texture, a motion), never a second full vocabulary. A style is a closed set of variables (palette, type, radius, shadow, motion): read them from `getComputedStyle` and compare with its block. The click signal is never sacrificed to a style: every CTA looks pressable, 3:1 UI contrast, 4.5:1 body text. Peak styles age fast (neumorphism 2019-21, Corporate Memphis 2017-23, dark-tech, brutalism): treat them as a dialect, not an identity. Fonts are Google Fonts (OFL) unless noted; images are Unsplash/Pexels/CC0, own SVG, Hero Patterns. Live examples are pointers checked on 2026-10-24 and may change; `none verified` means no live example was opened. Fonts and palettes named are examples of the dialect, not a recipe. Uppercase and tightly tracked titles belong to expressive pages; a product screen keeps the scale of `modern-interface.md`. Options that fit several dialects: a warm low-chroma background with one accent, and a display serif with an italic of contrast.

### 1. Swiss / International Typographic
- Rules: 12-column modular grid, flush-left ragged-right, asymmetry anchored to the grid, 2-3 colors, radius 0-4px; rules and circles only if functional.
- Palette: white/black/gray + 1 accent (signal red, cobalt, yellow). Type: grotesque in a strict scale (Archivo, Inter, Work Sans, Libre Franklin, IBM Plex Sans).
- Imagery/motion: documentary photo cropped to the grid, no frames; linear wipes, immediate changes.
- Fits: precise, objective, technical feeling. Avoid: warm or emotional feeling; pastiche without strong content.
- Live: pentagram.com, allcapstype.com.
### 2. Bauhaus
- Rules: circle/square/triangle with a repeated semantic role; functional asymmetry; bars and diagonals.
- Palette: red, yellow, blue on black/white/warm paper. Type: geometric (Jost, League Spartan, Josefin Sans, Montserrat) in short declarative headlines.
- Imagery/motion: architecture, film stills, diagrams; mechanical rotations and translations, no decorative easing.
- Fits: didactic, constructive, cultural feeling. Avoid: luxury or care; a confetti of primaries without a system.
- Live: none verified.
### 3. Modernism / Minimalism
- Rules: reduce to the necessary, no ornament, open space, restricted color; one idea per screen, low density.
- Palette: neutrals + 1 accent. Type: neutral sans or neo-grotesque (Inter, Manrope, DM Sans).
- Imagery/motion: isolated product in a void; short fades.
- Fits: calm, restrained, premium feeling. Avoid: dense or comparative content; the generic white SaaS.
- Live: apple.com/macbook-pro.
### 4. Editorial / magazine
- Rules: alternate multi-column reading pages with full-bleed spreads; pull quotes, caption rails; headline/deck/body/caption hierarchy; measure 60-75 characters, line height 1.6-1.75; hairline rules, radius 0.
- Palette: paper and ink + 1 accent taken from the photo. Type: display serif with character (Playfair Display, Newsreader, DM Serif Display, Cormorant) + a disciplined sans.
- Imagery/motion: art-directed photo with credits; scroll-bound clip reveals, crossfades.
- Fits: reflective, curated, story-led feeling. Avoid: transactional tools; density without focus.
- Live: kinfolk.com, pudding.cool.
### 5. Web brutalism
- Rules: legible on any screen, only links/buttons are clickable, underlined links, back works, decoration with purpose. CSS: border 1-2px, radius 0, no shadows or transitions, body >=16px, dark ink on a light ground.
- Palette: black/white + default link blue. Type: system, monospace or default grotesque; uppercase titles.
- Imagery/motion: raw documentary; none. Two branches: "brut" (raw, useful) and "fou" (breaks conventions, usability second).
- Fits: raw, honest, countercultural feeling. Avoid: mass checkout, photographic work; past peak.
- Live: brutalist-web.design, storyofbrutalism.com, brutalistwebsites.com.
### 6. Neo-brutalism
- Rules: border 2-4px black, hard offset shadow 4-8px with no blur (`4px 4px 0 #000`), radius 0-4px, flat fills, visible irregular grid, oversized controls. Hover raises the shadow; press translates onto it.
- Palette: black + off-white + 1-3 saturated accents (yellow, coral, blue, green, lavender), saturation under ~80%, no gradients. Type: heavy or stretched grotesque (Syne, Archivo Black, Space Grotesk) + Space Mono/DM Sans.
- Imagery/motion: flat outlined illustration, pseudo-3D, browser windows; hard cuts, stamps, tilts.
- Fits: playful, young, irreverent feeling. Avoid: serious, regulated or luxurious feeling; chaotic hierarchy; already a SaaS dialect. Bordered cards with a hard shadow and a 6-8 px radius in a landing read as SaaS, whatever the palette.
- Live: gumroad.com, issue01.patternbrutal.ist, budapestpark.hu.
### 7. Art Deco
- Rules: axial symmetry, stepped forms, sunbursts, chevrons, fans, thin-rule frames; never all motifs together; radius 0-4px.
- Palette: black/midnight/emerald + ivory + controlled gold/brass. Type: uppercase geometric display with wide tracking (Limelight, Poiret One, Cinzel, Italiana, Josefin Sans) + discreet serif/sans.
- Imagery/motion: architecture, theatrical portraits, hard light; radial reveals, stepped masks, brief metallic glints.
- Fits: ceremonial, glamorous, festive feeling. Avoid: utilitarian software; kitsch, ornament overload.
- Live: none verified.
### 8. Art Nouveau
- Rules: asymmetric whiplash line, flora, organic decorative frames; avoid parallels and symmetry.
- Palette: ochres, muted greens, gold, cream. Type: ornamental display (Cinzel Decorative, IM Fell, Cormorant) + serif.
- Imagery/motion: Mucha-style linear illustration (own SVG); stroke that draws itself (stroke-dashoffset).
- Fits: delicate, romantic, natural feeling. Avoid: technical or corporate feeling; ornament over the text.
- Live: none verified.
### 9. Memphis
- Rules: asymmetric modules scattered over a clean field, a reliable content grid, generous margins, terrazzo/squiggle/dot patterns; radius 0.75-1.5rem.
- Palette: primaries and pastels + black (turquoise+gold, violet+yellow). Type: Bungee, Fredoka, Righteous, Rubik Mono One + Poppins.
- Imagery/motion: shapes instead of photos, cutouts; independent bounce/rotation, then still.
- Fits: cheerful, energetic, creative feeling. Avoid: serious or regulated feeling; confusion with Corporate Memphis.
- Live: none verified.
### 10. Postmodern / Maximalism
- Rules: "less is a bore", complexity and contradiction, ironic historical references, polychromy; curated density, clear navigation, one dominant color.
- Palette: one dominant color + loud companions. Type: expressive mix in titles + legible body.
- Imagery/motion: layers, repetition; interactive hover/scroll; compress and lazy-load.
- Fits: exuberant, expressive, loud feeling. Avoid: long tasks, unplanned accessibility; incoherent color, literal Y2K copies.
- Live: cameronsworld.net (nostalgic archive).
### 11. Y2K
- Rules: chrome, glossy orbs, translucency, soft gradients, floating shapes; modern spacing and hierarchy; chrome = gradient clipped to the letters with a highlight band.
- Palette: lime, orange, pink, cyan, electric blue + white/chrome. Type: techno or rounded legible (Orbitron, Unbounded, Sora) + a clean sans; small bitmap (Pixelify Sans).
- Imagery/motion: 3D renders, translucent plastics; moving gradients, floating shapes.
- Fits: nostalgic, glossy, youthful feeling. Avoid: serious or regulated feeling; pastiche, chrome accessibility.
- Live: none verified.
### 12. Retro / Vintage 50s-70s
- Rules: 50s-60s mid-century (modular shapes, relaxed asymmetry, humanist illustration); 70s (concentric circles, arcs, sunburst, rainbow stripes, round badges).
- Palette: 70s burnt orange, mustard, avocado, cream, brown; MCM mustard, olive, teal, walnut. Type: Josefin Sans, Libre Franklin, Fira Sans, Bitter + display (Shrikhand, Bagel Fat One, Limelight).
- Imagery/motion: paper grain, simple silhouettes; sliding panels, gently rotating motifs.
- Fits: warm, nostalgic, convivial feeling. Avoid: technical or corporate feeling; bubble kerning at small sizes.
- Live: none verified.
### 13. Psychedelic
- Rules: saturated vibrating colors, deformed letters playing positive/negative, horror vacui, symmetry and spirals.
- Palette: full spectrum, clashing contrasts. Type: Shrikhand, Spicy Rice, Chicle, Molle only in large headlines; clean body.
- Imagery/motion: kaleidoscopic patterns (SVG/CSS); slow undulation (SVG filter), never over reading text.
- Fits: dreamlike, ecstatic feeling. Avoid: long reading; contrast and visual vibration.
- Live: none verified.
### 14. Organic / Biophilic
- Rules: no right angles, asymmetric blobs, material-texture backgrounds, botany; slow rhythm.
- Palette: earth, greens, clay, cream; subtle grain. Type: warm serif or humanist (Fraunces, Lora, Karla).
- Imagery/motion: natural photos, botanical illustration, blob SVG (Haikei); slow growth, soft parallax.
- Fits: calm, natural, caring feeling. Avoid: dense technical content; the "eco green" cliche.
- Live: none verified.
### 15. Luxury / quiet luxury
- Rules: wide margins, few widely spaced modules, detail unfolding slowly, progressive disclosure, radius 0-0.25rem, hairline borders; the route to product or booking stays visible.
- Palette: ivory, stone, taupe + ink/brown/navy; minimal metallic. Type: refined serif or neo-grotesque (Cormorant Garamond, Bodoni Moda, Instrument Serif) + Manrope; careful tracking.
- Imagery/motion: material macros, interiors, directional light; slow fades (>=300ms), no bounce or loops.
- Fits: ceremonial, exclusive, unhurried feeling. Avoid: offers and promos; hiding the booking route, slow loads.
- Live: ritzcarlton.com, ippodo-tea.co.jp.
### 16. Scandinavian
- Rules: airy modular layout, calm asymmetry, generous margins, thin dividers, radius 0.25-1rem; one accent used on links and buttons only.
- Palette: near-white, light gray, dark gray, a natural-material tone, one soft accent. Type: humanist (Karla, Figtree, Manrope, Source Sans 3) + optional serif (Lora).
- Imagery/motion: daylight interiors, useful objects; short fades and slides.
- Fits: calm, light, practical feeling. Avoid: loud entertainment; generic beige.
- Live: hay.com, muuto.com.
### 17. Japanese (ma, wabi-sabi)
- Rules: ma = active interval, asymmetry, one thing at a time, thresholds between sections, fine borders; wabi-sabi = imperfection, texture, patina. Commercial Japanese web is dense (Rakuten, Yahoo!, Kakaku): copy only the ma pole for hospitality and craft.
- Palette: rice paper, ink, indigo, cedar, vermilion. Type: Noto Serif/Sans JP, Zen Kaku Gothic New, Zen Old Mincho, Shippori Mincho; `writing-mode: vertical-rl` with care; subset JP fonts (7,000-10,000+ glyphs).
- Imagery/motion: architecture, gardens, craft, one subject; slow, with pauses, finite.
- Fits: contemplative, crafted, quiet feeling. Avoid: dense catalogs, urgency and offers.
- Live: ippodo-tea.co.jp; kakaku.com as the dense pole.
### 18. Bento grid
- Rules: columns reduce with the width down to 1 on phone; one consistent gap and one radius; a few boxes; one large hero cell + small support; overflow hidden for media; bottom scrim for text over images.
- Palette/type: from the host style (dark tech, light). Imagery/motion: subtle hover, reordering grid.
- Fits: heterogeneous feature summaries. Avoid: very different priorities, long reading, all-equal cells ("a card grid with a fashionable name"), keyboard focus in `dense`.
- Live: raycast.com, apple.com/macbook-pro (chapter cards).
### 19. Glassmorphism / Liquid Glass
- Rules: translucent layer with `backdrop-filter: blur(8-16px)`, 1px more opaque border, colorful gradient behind, only on structural layers (nav, modals, floating cards). Text 4.5:1, UI 3:1; blur under 20px; `@supports` + opaque fallback; `prefers-reduced-transparency`.
- Palette: vibrant backgrounds + glass opposite in value to the background. Type/motion: from the host style.
- Fits: light, layered, futuristic feeling. Avoid: body text, forms, tables, glass over glass; low-end GPU, contrast.
- Live: apple.com/os, raycast.com.
### 20. Neumorphism (ANTI-PATTERN as a system)
- Rules: same color as the background, double light/dark shadow, low-contrast pastels. Inaccessible; in decline since 2021.
- Use only as an accent on one widget (a single control) with an outline or state color; never as the page system.
- Fits: home dashboards, single controls. Avoid: everything else.
- Live: none verified.
### 21. Flat / Material
- Rules: 2D forms, solid color, clean icons; "Flat 2.0": subtle shadows/highlights and signifiers (underlined blue links, raised buttons). No decorative long shadows. Flat without signifiers is 22% slower (NN/g 2017).
- Material 3: tonal elevation, Roboto/Google Sans.
- Fits: apps, systems. Avoid: impact landings (no signature).
- Live: figma.com.
### 22. Skeuomorphism
- Rules: materials and hardware with shadows, bevel and light; useful as a familiarity bridge; costs cognitive load and space. Current forms: luminous eco-skeuo, wood, handwriting.
- Fits: tactile, playful, familiar feeling. Avoid: dense flows.
- Live: none verified.
### 23. Dark tech / cinematic (Linear style)
- Rules: dark site, diffuse gradients behind the product, glowing animated artifacts; background near-black, not #000; off-white text stepped by opacity; 1 accent; subtle SVG grain.
- Type: one grotesque (Space Grotesk, Inter, Sora) + mono for data. Imagery/motion: slow wipes, object rotation, no decorative loops.
- Fits: technical, cinematic, launch feeling. Avoid: gentle or caring feeling; overuse (squint test: could it be any dark SaaS?).
- Live: raycast.com, arc.net, vercel.com.
### 24. Anti-design
- Rules: asymmetry, misaligned or multiline text, loud color, overlap, retro/glitch. Only with purpose: art, editorial, one-off campaigns; start with a landing or a banner.
- Risk: outside entertainment and designer audiences it backfires; hard to scale; accessibility.
- Fits: rebellious, artistic feeling. Avoid: corporate or regulated feeling, transactions.
- Live: wrongwrong.net, toiletpapermagazine.org.
### 25. Collage / cutout
- Rules: one clear focal cutout, widely varied scale, stable reading anchors under the overlaps, a palette reduced to the photos' colors, one wash or paper tone layer to unify.
- Type: at most 2 contrasting displays + 1 reading face (Archivo Black, Cormorant Garamond, Syne, Permanent Marker). Imagery/motion: PNG cutouts with torn edge, crumpled paper, tape (CC0); "pasted" entrances, torn masks, minimal parallax.
- Fits: raw, collected, cultural feeling. Avoid: technical product; essential text over noise.
- Live: sitabellan.com (2000s cutout/GIF).
### 26. Kinetic typography
- Rules: moving text on a stable stage; one whole legible phrase per beat; stagger 30-50 ms/character (fluid) or >=100 ms (dramatic); 2-3 elements per page; animate only transform/opacity; complete static state for reduced motion; no flashes over 3 Hz.
- Type: subset variable fonts (Anybody, Roboto Flex, Recursive, Unbounded); GSAP SplitText (correct aria) or IntersectionObserver.
- Fits: rhythmic, announcing feeling. Avoid: reading content, slow phones.
- Live: activetheory.net, resn.co.nz.
### 27. Handmade / illustrative
- Rules: variable-weight lines, open shapes, visible strokes, hand lettering, textures, off-center layouts; start with one campaign; human copy and an honest product.
- Palette: warm, riso (2-3 inks). Technique: linocut, risograph, watercolor, gouache; own scans on paper.
- Fits: brands that want warmth against AI polish. Avoid: safety or precision critical products ("warmth that hides attributes destroys trust").
- Live: none verified (hermes.com answered 403).
### 28. Corporate Memphis (ANTI-PATTERN)
- Rules: none to follow. The pattern is flat figures with long arms, blue/purple skin, flat color background. The cheap default of big tech and fintech: false closeness, in decline since 2023.
- Never use it as a generic solution. If illustration is needed: an own system with stroke, texture or a real photo. Exception: SaaS onboarding/explainers with own illustration, one concept per scene.
- Fits: nothing generic; only SaaS onboarding explainers with own illustration. Avoid: everything else.
- Live: none cited.
### Other styles with enough evidence (no live example verified)
- Constructivism: diagonals, photomontage, red/black. Sports brutalism: condensed type (Barlow Condensed, Oswald), giant numbers. Dopamine/Claymorphism: inflated pastels, large radii. Mesh/Aurora: multipoint gradients. Terminal/CLI: mono, prompts. Retro computing: CRT, bitmap, scanlines. Punk/zine: photocopy, ransom-note.
