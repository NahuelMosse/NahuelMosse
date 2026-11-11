# Motion measured on the reference products

A calibration of five marketing sites, not universal product values. `motion-audit.mjs --measure` over their public pages, 06/10/2026, Chromium at 1280 × 900, the first
30 interactive elements of each page. What a public page shows is the marketing site, not the
product behind the login: these numbers calibrate hover, press and focus; the overlays (menus,
dialogs, toasts) come from the documented systems (Carbon, Atlassian, NN/g) and from the vendored
`review-animations` standards.

| Product | Respond to hover | Respond to press | Durations | Curves | What changes |
|---|---|---|---|---|---|
| Linear (linear.app) | 13 / 30 | 22 / 30 | 100–160 ms, median 100 | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` (ease-out quad) | background, color, border; one control presses to `scale(0.97)` |
| Attio (attio.com) | 25 / 30 | 16 / 30 | 200–400 ms, median 300 | `cubic-bezier(0.2, 0, 0, 1)` ×16, `cubic-bezier(0, 0, 0, 1)` ×5 | background, border, color |
| Mercury (mercury.com) | 29 / 30 | 21 / 30 | 300 ms | `cubic-bezier(0, 0, 0.2, 1)` | color, border, underline; background on buttons |
| Mercury Insights | 30 / 30 | 20 / 30 | 300 ms | `cubic-bezier(0, 0, 0.2, 1)` | the same |
| Stripe Checkout (stripe.com/payments/checkout) | 8 / 30 | 4 / 30 | 300 ms | `cubic-bezier(0.25, 1, 0.5, 1)` (ease-out quart) | color, border, outline, opacity |

Raycast, the Stripe home, Vercel, Framer and Lando Norris did not finish loading within the
measurement's 240 s per page —heavy pages, WebGL—: not measured. Section entrances could not be
attributed reliably on these pages (0–4 of 7–25 sections detected); they are not used as a number.

## What the numbers say

- **Every curve is an ease-out.** Not one `ease-in`, not one `linear` on an interaction, in five
  products. This confirms the kit's rule: enter and exit both start fast.
- **Hover changes color, background and border — not position.** No product lifts cards or scales
  on hover. Movement is reserved for press (Linear, `scale(0.97)`). *But color alone reads flat*: in
  a blind comparison against the team's references, the first gap of the best version was “no
  hover gives depth”. Surfaces that open or select take a shadow step and a brighter border; the
  marks of a chart, their highlight and value.
- **The product feels faster than the marketing.** Linear —the one built to feel instant— sits at
  100–160 ms; the marketing pages of Attio, Mercury and Stripe at 300 ms. For product screens the
  kit takes Linear's range: hover 120 ms, press 70 ms with a 160 ms release.
- **Nearly everything responds.** Mercury answers on 29–30 of 30 elements; the gaps on Linear and
  Stripe are mostly text links that only underline on focus.

## How it calibrates the tokens

| Token | Value | From |
|---|---|---|
| `--motion-hover` | 120 ms `ease` on color, background, border | Linear 100–160 ms; no transform on hover anywhere |
| `--motion-press` / `--motion-release` | 70 ms / 160 ms ease-out, `scale(0.97)` | Linear's press; release slower so it does not snap |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | the family all five use, at the strong end (Stripe's quart, Emil's standard) |
| `--motion-popover-*`, `--motion-dialog-*`, `--motion-toast` | 160 / 100, 240 / 160, 220 ms | Carbon, Atlassian, NN/g and `review-animations` (not measurable on public pages) |

Measure again with `node .claude/tools/motion-audit.mjs <url> --measure --max 30 --out <dir>` from
a repo with Playwright; the report is `<dir>/report.json`.
