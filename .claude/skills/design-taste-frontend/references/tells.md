# Tells — the dated registry

A tell is a device that makes a page read as generated. Tells are not bad design in themselves; most
began as good ideas on good sites. They became tells by being produced by default, everywhere, without
a reason. That is why this registry is dated, and why it never names a replacement font, colour or
component: every published "use this instead" list has become the next wave of tells within months.
Replacements here are procedures (draw from the library, derive from the subject), not products.

`scripts/inspect.mjs` and `scripts/lint.mjs` detect most entries. Status: **banned** means the
inspector fails the page; **warned** means it flags it and you need a reason.

## Contents

1. First wave (2023–2024)
2. Second wave (2025)
3. Third wave (2025–2026): the "fix" that became the look
4. Gallery fashion, banned as house style
5. Structural tells
6. Copy tells
7. Motion tells
8. Why removal is not enough

## 1. First wave (2023–2024)

| Tell | Status | Do instead |
| --- | --- | --- |
| Violet / indigo gradients on hero, buttons and glows | banned | The dealt palette; flat colour |
| Gradient-filled headline text | banned | Solid ink |
| Glass panels: backdrop blur, translucent cards | warned (2 or more) | Opaque surfaces one tone step from the ground |
| Glowing or gradient "Get started" button | banned | Flat button named for its action |
| Soft grey drop shadow under every card | banned | Tone step, or no box |
| Three identical feature cards, each with an icon in a rounded square | banned | The dealt section blueprint |
| Emoji as icons or bullets | banned | Words, or a real picture |
| Centred headline, subtitle, two buttons, screenshot below | no rule; the draw avoids it | The dealt hero |
| The same typeface on every generated page | warned (lint: default-font) | The dealt type system |

## 2. Second wave (2025)

| Tell | Status | Do instead |
| --- | --- | --- |
| Eyebrow / kicker: tiny tracked uppercase label above every heading | banned | Fold it into the heading, or delete |
| Pill badge above the hero headline ("New", "Beta", "Introducing") | banned | Say it in the supporting sentence |
| One word of the headline in italic serif, colour or underline | warned | One face, one colour |
| Bento grid of rounded tiles as the feature section | warned as card rows | A composed section; tiles only in the dense-tiles direction, filled, strict sizes |
| Near-black ground with one neon accent and a glow | banned via shadow, gradient | A dealt dark palette, no glow |
| Floating rounded pill navigation with blur | warned | A plain bar |
| Fake dashboard hero built from grey bars and donut charts | no rule; see imagery.md §7 | A real interface fragment, or no image |
| Screenshots dressed in a window bar of three dots, floating with a coloured glow | warned (`fake-chrome`, 2 or more) | The screenshot cropped to what it proves, on the page's ground, with a caption |
| A row of stack or keyword tags under every project ("Node.js · Playwright · …") | banned via mono, micro-label | Name the one tool that matters in the sentence |
| Decorative status dot ("Available for work", pulsing "live") | lint: bounce | Remove |
| A check mark before every item of a feature or plan list | warned (`check-bullets`, 2 lists or more) | Plain bullets or none; checks only in a comparison table where some cells lack one |
| Fade-and-rise on every section | no rule; see motion.md | One signature move |

## 3. Third wave (2025–2026): the "fix" that became the look

The remedy published for the first two waves was "warm it up and make it editorial". Models adopted
the remedy wholesale and it is now the most recognisable generated look of all.

| Tell | Status | Do instead |
| --- | --- | --- |
| Yellow-cream ground + terracotta / rust / clay accent | banned together; terracotta banned alone; cream warned | The dealt palette. Warmth from a low-chroma stone, a deep ink, a photograph, or a full warm field |
| High-contrast or soft serif display as the shortcut to "premium" | no rule | The dealt type system, whatever class it is |
| Oversized italic serif headline | no rule | As dealt |
| Broadsheet cosplay: hairline rules everywhere, zero radius, dense columns | banned via hairline | Structure from space and tone |
| "Field notes", "Quietly trusted by", "On our desks": performative labels | lint: copy | Plain section names |

## 4. Gallery fashion, banned as house style

These are common on award sites right now. In the study they appear *more* often on the top-scored
sites than on the weak ones (panel observations: monospace labels 44% against 24%, index numbering 38%
against 21%; measured thin rules 61% against 52%). They are banned here regardless, by the owner's
decision: they are the first things a generator copies from the gallery, they carry no information,
and a page built without them has to find real structure.

| Tell | Status | Do instead |
| --- | --- | --- |
| Monospace micro-labels, mono as a "technical" voice, mono captions | banned | The text face; tabular figures for data |
| Index numbering: 01 / 02 / 03, (001), "Step 02", numbered section markers | banned | Order by position, scale, or the words; `<ol>` when it is truly a list |
| Thin rules: hairline dividers, ruled grids, 1px outlined boxes and tiles | banned (boxes: 3 or more) | Space, tone steps, filled shapes, a thick bar if a bar is the idea |
| Design-tool chrome as ornament: crosshairs, crop marks, selection handles, dashed guides, rulers | banned via hairline, dashed | Remove |
| Agency micro-meta: local time, coordinates, weather, version stamps, "©2026 — Scroll", middle-dot strings | lint: copy; micro-label | Remove |
| Tiny uppercase letter-spaced captions scattered around the viewport | banned (3 or more) | Sentence case at readable size, placed with the content it describes |

Tiny tracked capitals are the one item in this group the data condemns as well: 16% of top sites
against 57% of weak ones.

## 5. Structural tells

| Tell | Status | Do instead |
| --- | --- | --- |
| Headline as a full sentence at display size, three or four lines | banned (over two lines) | A title of about five words; the rest goes below |
| Stock section order: hero, logos, features, testimonial, pricing, CTA | no rule; see copy.md §1 | The order of the argument |
| Every section the same layout family | critique.md pass 9 | Different composition per section, from the sheet |
| Display size spent on every section title (PROJECTS, EXPERIENCE, CONTACT at hero size) | warned (`display-every-section`, 3 or more) | One loud moment; the other titles one clear step down |
| The concept worn as labels: a "dossier" or "terminal" theme spelled out on every element ("Case file", "Subject", "Exhibit") | banned via eyebrow, micro-label | Carry the idea in the pictures and the composition; label only what informs |
| Every item built on the same anatomy and choreography (number, label, title, one line, tags, links, floating mockups), each pinned as its own scene | warned via many-scenes | Vary the treatment by what each item has to show; the strongest gets the room |
| Everything centred | warned over 72% | Left-anchored, one centred moment |
| One medium border radius (12–16px) on everything | none | Square or fully round, chosen once |
| Nine nearly equal font sizes | warned over 9 | Five sizes, far apart |
| Invented social proof: logos, quotes, star rows, "10,000+ teams" | copy.md §5 | Real proof, or none |
| Text or a CSS box where a picture belongs | critique.md cap | A real picture, or a design that needs none |
| A coloured stripe down one side of a rounded card or callout | banned (`side-tab`) | The box's fill one step from the page, a heading, or no box |
| A card with a border or shadow drawn inside another card | warned (`nested-cards`) | One level of box; space, a type step or a tone change inside it |
| Heading levels that skip a step (h2 then h4) | warned (`skipped-heading`) | Tag by outline, size by CSS |
| A working file named in visible text (`CREDITS.md`, `assets.json`), outside `code`/`pre` | warned (`internal-file-shown`) | The page's own words: a credits line with the photographer and licence |

## 5b. Craft floor

Measured the way the impeccable detector measures them (same thresholds), for any page or app screen:

| Tell | Status | Do instead |
| --- | --- | --- |
| Running text under 1.3 line-height | warned (`tight-leading`) | 1.4–1.7 for paragraphs; only display type goes tight |
| Running text letter-spaced past 0.05em | warned (`wide-tracking`) | The face's own spacing; tracking only on short uppercase labels |
| Eighty characters or more in uppercase | warned (`all-caps-body`) | Sentence case |
| Letters pressed together: below -0.07em, or -0.09em at 40px and up | warned (`crushed-tracking`) | Display type to about -0.04em |
| Text up to 32px against the inside edge of its box: under max(8px, 0.5× font) beside it, max(4px, 0.3× font) above or below | warned (`cramped-padding`) | 16–32px in cards |
| Neutral grey text on a saturated ground | warned (`grey-on-colour`) | White, the full ink, or a tint of the ground's hue |
| Half or more of the headings with as much space above as below (three or more measured) | warned (`heading-rhythm`) | About twice the space above as below: the heading belongs to what follows |
| One gap holding 80% or more of the page's stacks (ten or more) | warned (`monotonous-spacing`) | Three levels from one 4px scale: inside a group, between groups, between sections |
| Two text sizes of 16px or more under 1.08× apart, each with 40 characters or more | warned (`near-sizes`) | Merge them; each step of the scale at least 1.125× the next |
| The largest h1–h3 under 1.25× the body | warned (`flat-hierarchy`) | Headings that step up by a clear ratio |
| A heading of four words or more ending on a line under 20% of its widest | warned (`heading-orphan`) | `text-wrap: balance` on headings, `pretty` on paragraphs |
| On a phone, a control under 24×24px with another within 24px (WCAG 2.5.8); a button or field under 44px tall | failed / warned (`touch-target`) | 44px for what is pressed often, 24px with clear space at the least |
| Text cut by its box under the reader's spacing (line-height 1.5, letter 0.12em, word 0.16em, paragraph 2em; WCAG 1.4.12) | warned (`text-spacing`) | Boxes that grow with their text: `min-height`, no `overflow: hidden` on text |
| Text justified in a column of 45 characters or fewer (width / 0.5× font size), without `hyphens: auto`, over two lines or more | warned (`justified-text`) | Left-aligned; justify only a wide column with hyphens |
| An h1 of 72px or more with 40 characters or more that takes 28% of the viewport height or 25% of its area | warned (`oversized-h1`) | A shorter headline, or a size that leaves room for what follows |
| Repeating-gradient stripes, or two or more hairline gradients tiled by a pixel cell, as a background | warned (`stripe-grid-bg`) | A plain surface or a real texture; grids belong to canvases and maps |
| A row that scrolls sideways resting with a card against its edge and no page gutter (gap under 8px) | warned (`edge-flush-cards`) | `padding-inline` and `scroll-padding-inline` on the scroller; the next card peeks |
| A menu, listbox, tooltip or popover positioned outside a box with `overflow: hidden` that cuts it by more than 2px | warned (`clipped-overflow`) | Let the box overflow, or render the layer outside it (`popover`, a portal) |
| "Accessibility theater", "compliance theater" and the other dismissive "<abstract noun> theater" phrases | warned (`theater-slop-phrase`, lint) | Say what is done and why it matters |
| Three or more aphoristic constructions ("Not a X. A Y.", "Z. No W.", "Z. Just W.") in the page text | warned (`aphoristic-cadence`, lint) | Plain sentences that each carry a fact |
| Three negations chained by commas ("No setup, no contracts, no surprises"; "sin X, sin Y, sin Z") | warned (`negation-list`, lint) | What it does, with the fact |
| Two or more questions of one to three words answered at once ("The result? 3× faster.") | warned (`self-answered`, lint) | The fact as a sentence |
| Three or more exclamation marks in a file's text (`!` after a letter or digit, or `¡`) | warned (`exclamation`, lint) | None |
| A browser `alert()`, `window.confirm()` or `window.prompt()` | warned (`native-dialog`, lint) | A message beside what it is about, or a dialog in the site's style |
| An error line that opens with "Oops", "Whoops", "Uh-oh" or "¡Ups" | warned (`oops`, lint) | What failed and what to do next |
| John or Jane Doe, Acme, "Firstname Lastname" or "123 Main St" on a page (in app screens it fails, with `example.com`) | warned (`placeholder-data`, lint) | A real name, client or address, or none |

Measure over 88 characters (`measure`) and body text within 12–16px of the screen edge (`edge-text`) are measured as impeccable's `line-length` and `body-text-viewport-edge`; a box shadow at rest (`shadow`) covers its `hard-offset-shadow`.

Findability (head, images, links, layout shift, largest paint) has its own rules and thresholds in `seo.md`.

## 6. Copy tells

Flagged by `lint.mjs`: the genre's verbs and adjectives (unlock, supercharge, seamless, elevate,
effortless, cutting-edge, all-in-one …); the correction ("not just X, it's Y"); tricolon headlines;
"Get started" and "Learn more" as labels; more than a handful of em dashes; lorem ipsum. See
`copy.md` §6. Not flagged, read for it: the positioning word repeated in every item's sentence (each
project "built with AI agents"); say it once, where it is proven, and let the other items say what they did.

## 7. Motion tells

Identical fade-up on every block; a dozen staggered hero entrances; hover lift on every card; bounce
easing; infinite loops that mean nothing; reveals that fail and leave a blank band. See `motion.md` §9.

## 8. Why removal is not enough

A page with every tell removed and nothing put in their place is an empty page with good manners, and
that is a tell too (the "avoidance aesthetic": anyone could guess it from the category plus the list of
things to avoid). The tells were filling a gap where an idea should have been. The order of work in
`SKILL.md` exists to fill that gap first: the idea from the subject, the dealt composition, real
pictures or committed type, and only then the checks.
