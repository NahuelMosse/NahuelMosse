<!-- Rendered by scripts/sync_portfolio.mjs from this template and data/. Edit those, not README.md. Every image but the project previews (one animated WebP each, faded to transparent at the edges) comes in a dark and a light variant for the reader's GitHub theme. The live widgets are drawn on each request at lab.nawi.dev/api/profile (NahuelMosse/profile-widgets); the views chip in assets/live/ is redrawn daily by .github/workflows/profile.yml; the ones in assets/static/ by scripts/build_art.py and build_plates.py; the previews in assets/previews/ by scripts/build_previews.py. -->
{{banner}}

<p align="center">
{{links}}
</p>

<picture><source media="(prefers-color-scheme: dark)" srcset="assets/static/header-projects.dark.svg"><img src="assets/static/header-projects.light.svg" alt="01 · Projects" width="100%"></picture>

{{repo_cards}}

{{tool_cards}}

<picture><source media="(prefers-color-scheme: dark)" srcset="assets/static/header-npm.dark.svg"><img src="assets/static/header-npm.light.svg" alt="02 · npm" width="100%"></picture>

{{npm}}

<picture><source media="(prefers-color-scheme: dark)" srcset="assets/static/header-contributions.dark.svg"><img src="assets/static/header-contributions.light.svg" alt="03 · Contributions" width="100%"></picture>

{{contributions}}
