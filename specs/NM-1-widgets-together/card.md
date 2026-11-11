# NM-1 · the widgets look good together in the README

status: proposed
cap: 120 min
sources: the requester's message in the session (text, no Jira card)
not_read: none (no attachments or links)

## Specs

- S1 · "los widgets los podes pasar por el kit en modo poc"
- S2 · "para que se vean bien todos juntos en el readme"
- NM-1-ASM-01 · "together" is the README as GitHub renders it, at the profile's width (about 1012 px) and on a phone (390 px), in GitHub's dark and light themes: the widgets read as one family (same frame, margins, title band, type sizes and baseline grid), line up in their rows, and no card looks emptier or louder than its row · S2
- NM-1-ASM-02 · the drawings change in scripts/live.mjs and scripts/build_plates.py of this repository; profile-widgets regenerates its golden files from the new live.mjs afterwards, in its own card · S1
- NM-1-ASM-03 · the content stays: the same widgets, chapters and links; only size, layout, spacing and type change · S2

## Look

- ref: the profile README as it renders today on github.com/NahuelMosse, captured at 1012 and 390 px in dark and light (the starting point), and the noir red direction recorded in the profile-readme-taste memory: graphic SVGs, no text-only blocks · NM-1-ASM-01
- behavior: load · nothing new moves; the existing SVG entrances stay as they are
- behavior: view · each row of cards shares heights and inner margins, so the eye scans them as one strip
- tokens: mood noir, editorial · genre developer profile · the palette and type of scripts/build_art.py THEMES and Courier Prime · spacing 4 8 12 16 24 32 · one frame style and one title band for every card
- copy: unchanged (NM-1-ASM-03)

## Log

- L1 · los widgets los podes pasar por el kit en modo poc para que se vean bien todos juntos en el readme porfa
