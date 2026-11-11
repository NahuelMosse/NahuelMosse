# Profile: web

Screens in the browser. The base method does not name a browser; this profile brings the instruments.

## What it brings
- Modules: `ui` (and `i18n` when its signal appears).
- Tools: `probe`, `app.mjs probe`, `asset-audit.py` (the measure of the set: sharpness, warmth), `motion-audit`, `motion-curves`, `overflow`, axe.
- Agents: `designer`, `design-critic`.
- References and rules: `design-refs.md`, `assets.md`, `responsive-classes.md`, `design.md`, `interface.md`, `showcase.md`, `motion-benchmark.md`, `modern-interface.md`, `ui-patterns.md`, `components.md`, `component-techniques.md`, `accessibility.md`.
- Stacks: `react-shadcn`, `node-ts`.
- Extras: the `motion` skill and the `motion` MCP server (`https://mcp.motion.dev`), written to the repo's `.mcp.json`.

## Gate lines it uses
`probe <state>:`, `enter-each`, `type-markup`, `motion:`, overflow. The `visual` lens needs it.

## How to turn it on
- `node .claude/tools/install.mjs --profiles web` at install (without the flag, signals suggest it).
- `node .claude/tools/kit.mjs profile on web --reason "..."` afterwards; `profile off web --reason "..."` removes it.
- With it off, a `visual` card lists `lensesOff` in `risk.json` and the close puts it under `## Could not run`.
