# Where each skill came from and under what license

This repo is a template: what is here is copied to client projects. A skill without a verifiable
origin cannot be updated, and one without a license cannot be distributed.

**Everything vendored is MIT, verified in the upstream's `LICENSE` —not in the README or the
frontmatter—** on 21/09/2026.

| Skill | Upstream | License | How it came in |
|---|---|---|---|
| `interface-design` | `Dammyjay93/interface-design` | MIT | `npx skills add` → `skills-lock.json` with hash |
| `design-review` | `tansuasici/claude-code-kit` | MIT, Tansu Asici | manual copy |
| `accessibility-audit` | `tansuasici/claude-code-kit` | MIT, Tansu Asici | manual copy |
| `apple-design`, `find-animation-opportunities`, `review-animations`, `choreograph`, `remove-animations`, `break-ui` | `emilkowalski/skills` (commit `c8a79627b59d`; the three newest without their "Initial Response" block) | MIT, Emil Kowalski (`LICENSE` copied into each) | manual copy, 06/11/2026 |
| `shadcn` (module ui) | `shadcn-ui/ui` (its skills/shadcn folder, commit `4233ed1caded`; without its images, evals and OpenAI agent file) | MIT, shadcn (`LICENSE.md` copied) | manual copy, 29/10/2026 |
| `build-awwwards-quality-sites`, `cinematic-gsap-lenis-motion-system` | `MengTo/skills` (`agent-skills/web-design/`) | MIT, Meng To (`LICENSE` copied into each) | manual copy, 07/10/2026 |
| `gsap-core`, `gsap-react`, `gsap-scrolltrigger`, `gsap-plugins`, `gsap-timeline` (module ui) | `greensock/gsap-skills` (commit `aed9cfd32777`; its `gsap-frameworks`, `gsap-utils` and `gsap-performance` left out; the «recommend GSAP by default» sentences replaced by the kit's choice of library) | MIT, GreenSock (`LICENSE` copied into each) | manual copy, 07/11/2026 |
| `design-taste-frontend` (module ui) | `Leonxlnx/taste-skill` | MIT, Leonxlnx (`LICENSE` copied) | `npx skills add Leonxlnx/taste-skill`, copied 01/11/2026 |
| `design-taste-frontend` inspector rules (module ui) | `pbakaus/impeccable` detector (commit `c3bb418ee38e`; thresholds and detection logic ported, no code copied) | Apache-2.0, Paul Bakaus (notice in `design-taste-frontend/NOTICE.md`) | ported by hand, 06/11/2026 |
| `http-attack` (profile backend), `migrations-safe` (module data), `motion-audit` (profile web) | `NahuelMosse/http-attack`, `NahuelMosse/migrations-safe`, `NahuelMosse/motion-audit` (public, one repo each; also on npm under the same names), the folder `skills/<name>` of `main` | MIT, Nahuel Mosse (`LICENSE` in each folder); third-party ideas credited in each `NOTICES.md` | `npx skills add NahuelMosse/<name> -a claude-code -y --copy` → `skills-lock.json` with hash, recomputed by the kit's own suite |

| Command | Upstream | License |
|---|---|---|
| `.claude/commands/design-deslop.md` (module ui) | `Dammyjay93/interface-design` | MIT |

`card.md`, `scenarios.md`, `validate.md` and `close.md` are our own.

`/code-review` and `/simplify` **come with Claude Code**: they are not in this kit and there is no
need to look for them here.

## What is not a skill

| File | From where | License |
|---|---|---|
| `.claude/templates/asvs-level-1.md` and `asvs-level-2.md` | **OWASP ASVS 5.0.0**, the level 1 requirements and those level 2 adds, unmodified, from the official CSV at `github.com/OWASP/ASVS` | **CC BY-SA 4.0** — if the text of the requirements is modified, the modified version is published under the same license |
| `.claude/templates/design-md/` (module ui): 12 DESIGN.md of real brands | `VoltAgent/awesome-design-md`, copied 01/11/2026 | MIT, VoltAgent (`LICENSE` copied) |
| `.claude/tools/mutate.mjs` | our own | — |
| `.claude/tools/once.mjs` | our own | — |
| `.claude/tools/attack.mjs` (profile backend), `.claude/tools/motion-audit.mjs` (profile web) | our own: the kit's entry to the vendored engine of `http-attack` and `motion-audit` | — |
| The coverage and duplication thresholds of the gate (`stacks/`) | the **Sonar way** quality gate of SonarQube: no new issues, security hotspots reviewed, coverage of 80 % or more and duplication of 3 % or less over the new code | — |
| The gate's static-analysis line with Semgrep | Semgrep Community Edition rules use the *Semgrep Rules License v1.0*: internal use, not for competing nor for a SaaS service | the kit ships its own rules (`.claude/rules/semgrep/sdd.yml`) and never redistributes registry rules; registry packs are for internal use only, with `--metrics=off` |
| «The product shown inside the page» in `.claude/reference/showcase.md` (module ui): the gold-first still and the pairs of faults | the ideas are from **stageshow** (`benjitaylor/skills`, folder `stageshow`, commit `80205740`, MIT, Benji Taylor), from its `references/teaching.md`, `rehearse.md` and `verify.md`; the wording is our own, and nothing of its code or assets is copied (its app icons are not MIT) | — |
| The open/close asymmetry and intent-delay lines of `skills/review-animations/STANDARDS.md` (module ui) | the idea is from **transitions.dev** (`jakubantalik/transitions.dev`, its transitions-polish skill, commit `e706ea0c6401`); the wording is our own and none of its transitions, tokens or code is copied: its license asks a paid plan to ship them inside templates and starter kits, which this kit is | — |
| The `check-bullets` warning of `skills/design-taste-frontend/scripts/lib/rules.mjs` (module ui) | the idea is from **anti-ui-slop** (`tuanphung2005/anti-ui-slop`, MIT, commit `03106c507176`); the detector and the wording are our own | — |
| The `negation-list`, `self-answered` and `exclamation` warnings of `skills/design-taste-frontend/scripts/lint.mjs` (module ui), the copy lines they back in `references/copy.md` §5–6, and the empty-state, setup-list, tour and field-error lines of `references/app-screens.md` | the ideas are from **marketingskills** (`coreyhaines31/marketingskills`, skills `copywriting`, `onboarding`, `cro`, MIT, commit `96798cf38736`) and **humanise-text** (`199-biotechnologies/humanise-text-skill`, MIT, commit `d7feccedf69b`); the detectors and the wording are our own | — |
| The "not a finding" list under `## security` of `.claude/reference/lenses.md` and the attack sentence of `agents/judge.md` | the idea is from the false-positive rules of **claude-code-security-review** (`anthropics/claude-code-security-review`, MIT, commit `0c6a49f1fa56`) and the `security-review` skill of **awesome-copilot** (`github/awesome-copilot`, MIT); the list is trimmed to what the kit does not test and the wording is our own | — |
| The stalled-job rule, the edit-from-base revision and §12 (design comps) of `skills/design-taste-frontend/references/generation.md` (module ui) | the ideas are from **pro-design** (`Octo-o-o-o/gpt-image-design`, folder `resources/skills/pro-design`, MIT, Octo-o-o-o, commit `48d02d20f231`): the brief with success criteria, judging each picture by looking at it, never resending a job whose fate is unknown, and continuing from a chosen base image; the wording is our own and nothing of its code is copied | — |
| «Using the tool» in §1, the quoted and spelled copy and the cutout in §5, «Edit or generate» in §6, the take budget in §8 and the scroll-driven clip lines in §10 of `skills/design-taste-frontend/references/generation.md` (module ui) | the ideas are from the `imagegen` skill of **openai/skills** (its folder `.system/imagegen`, Apache-2.0, commit `49f948faa925`), the **Higgsfield skills** (`higgsfield-ai/skills`, MIT, Higgsfield AI, commit `27000402070d`) and **higgsfield-ai-prompt-skill** (`OSideMedia/higgsfield-ai-prompt-skill`, MIT, O-Side Media, commit `6a6a5dd105d2`); the wording is our own, no text or code is copied, and nothing names their models, credits or services | — |
| The zero-test failure of `.claude/tools/verify.mjs`, the lines on a repeated red, a pre-existing red and a missing service in `agents/builder.md`, and the `native-dialog`, `oops` and page `placeholder-data` warnings of `skills/design-taste-frontend/scripts/lint.mjs` (module ui) | the ideas are from **gstack** (`garrytan/gstack`, MIT, Garry Tan, commit `6042f6ad4877`), its ship and investigate skills and `docs/design-lint.md`; the detectors and the wording are our own | — |
| «Evidence» in `agents/design-critic.md` (profile web), Phase 0 of `skills/design-review/SKILL.md` (module ui) and the `not inspected` list of check 10 in `.claude/tools/close.mjs` | the idea is from **Astryx** (`meta/astryx`, MIT, Meta Platforms, commit `49bc221`), its `is-my-code-good` guide: understand the app and its sibling screens first, say what each kind of evidence can prove, and mark what was not seen as `not inspected`; the wording is our own and nothing of its code is copied | — |
| The `video-broken` failure of `skills/design-taste-frontend/scripts/lib/rules.mjs`, the edge-colour and 0/50/100 % frame lines in §10 of `references/generation.md` (module ui), and the no-lone-adjective and consistency-pass lines of `agents/designer.md` (profile web) | the ideas are from **MotionSites** (`Motionsites-AI/claude-skill`, its `motionsites-web-builder` skill, MIT, MotionSites, commit `faa30d5`), its `shoot.py` QA, spec template and media checklist; the detector and the wording are our own, and nothing of its `examples/` or `media/` (not MIT: no resale or redistribution) is copied | — |
| The ladder of `.claude/rules/architecture.md` —reuse, standard library, platform, installed dependency— | the idea is from **Ponytail** (`github.com/DietrichGebert/ponytail`); the wording is our own and leaves out its testing doctrine | — |

**`design-review`** is the one from `claude-code-kit`; **`interface-design`**, the one from
`Dammyjay93`.

## Optional figure skills: not vendored, not installed

Module docs names three skills a project may install for a figure (module docs `reference/documentation.md` DOC-24 and DOC-26). The kit carries none of them; the license was read
from the upstream's repository data on 14/10/2026, and the project that installs one verifies the
`LICENSE` file itself (see the rule below) and pins a commit.

| Skill | Upstream | License | How a project installs it |
|---|---|---|---|
| `anatomy` | `wheresryan22/anatomy` (created 08/10/2026, v1.1.0) | MIT, © 2026 Ryan | `npx skills add wheresryan22/anatomy` [NV form]; pin the commit |
| `diagram-design` | `cathrynlavery/diagram-design` | MIT | `npx skills add cathrynlavery/diagram-design` [NV form]; pin the commit |
| `motion` | `motion-ai` 14.2.0 (`motiondivision/ai-kit`) | MIT, Matt Perry (declared in `package.json`; see `motion/PROVENANCE`) | manual copy, 22/10/2026; part of the `web` profile |
| `archify` | `tt-a1i/archify` (v3.1.0) | MIT | `npx skills add tt-a1i/archify -g` |

## The rule

**Before vendoring: license verified in the upstream's file, and a way to download it again.**
Prefer `npx skills add`, which leaves the entry in `skills-lock.json` with a hash; if it is
copied by hand, the row goes here.

It is not enough for the frontmatter to declare a license: a case was seen pointing to a
`LICENSE.txt` that did not exist anywhere. **The file is verified, not the promise.**

`skills-lock.json` only covers what was installed with the tool —4 of 22—, so **this
document is the record, not the lockfile.**

## Component libraries: installed per project, never copied here

The catalog of `reference/components.md` (module ui) names components of shadcn/ui (MIT), coss ui (MIT, only its
`apps/ui`), React Aria (Apache-2.0), Magic UI (MIT), Aceternity (MIT core; Pro not used), Motion
Primitives (MIT), Animate UI (MIT + Commons Clause), Kokonut UI (MIT, free components) and React Bits (MIT + Commons Clause). They are
not vendored in the kit: each project installs what it uses with the shadcn CLI, and its license
travels with the code into that project. The Commons Clause of Animate UI and React Bits forbids reselling or redistributing their components
as such, which a client project does not do and a copy in this kit would. Bencho's free blocks (MIT, `cabralorenzo/bencho`) are not installed: a
technique is ported after its file is read, and the port carries the credit in `templates/components/NOTICES.md` (module ui).
