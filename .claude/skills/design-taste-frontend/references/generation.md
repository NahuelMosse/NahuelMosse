# Generating pictures and footage

Read this before the first prompt, whenever a picture or a clip of the page will come out of a model. Generating is
optional: with nothing connected the page uses the order of `imagery.md` §2 and says what it lacked. When a generator
is there, it is used like a studio uses a shoot: a written look, a shot list, a test frame, a set that reads as one
hand, a strict rejection pass and a technical delivery. What makes generated pictures look generated is rarely the
model; it is skipping one of those steps.

## Contents

1. What is connected
2. Generate, or not
3. The look, written before the first prompt
4. The shot list
5. Writing the prompt
6. A set that reads as one hand
7. What reads as generated, and the rejection pass
8. Repair
9. Delivery to the page
10. Footage
11. People, brands, licences and credit
12. Design comps: the direction as a picture before the code

## 1. What is connected

`node <skill>/scripts/media.mjs detect` lists what a script can see: a local ComfyUI, the API keys in the environment
(names only), the Codex CLI and ffmpeg. The tools of the session (an image or video tool, an MCP server) are in your
own tool list.

| What | When it may be used |
|---|---|
| A tool of this session, an MCP server, a local model (ComfyUI) | directly |
| An API key in the environment, an external CLI (Codex) | only when the card's `## Look` (`generator: <name>`) or the person names it: it spends their money or their plan |
| The person's logged-in session of a chat product in the browser (ChatGPT, Gemini) | only when the person names it; the report says the run used their account and that the product's terms apply |
| Nothing | no generation; `imagery.md` §2, and the report says which pictures a generator would have made |

The kit never signs up for a service, never asks for a key in the chat and never falls back to a paid API by itself.
A key is read from the environment or the tool's own settings and never printed; to know whether it is there, test
that the variable is set.

**A job that stalls.** A picture takes one to three minutes. When a request fails, find out whether it was sent: one
that never left is sent again once; one whose fate is unknown (a timeout after sending, a page that lost track) is not
sent again on the strength of the error text, because a second send can spend twice. Resume once when the cause is
gone; if it fails again, stop and report what was sent, what came back and where it is. Pictures that came back are
not pictures that passed: §7 and §12 decide.

**Using the tool.**
- **Its own listing, not memory.** Before the first request, read from the tool its models and their parameters
  (ratios, sizes, durations, limits). Model names and limits go stale in weeks. Match a tool by its server, not by a
  name another server also uses.
- **The cost, before a batch.** If the tool gives an estimate or a balance, read it first. The report says what the
  run spent of the person's plan.
- **A refusal.**
  - A rejected option is retried once without it, and the report names the option dropped.
  - A harmless prompt flagged by moderation is retried once, described plainly without mood words.
  - Two failures change the model or the structure of the prompt.
  - A slot is never filled with stock in silence. The report says what was not generated, which other route exists
    (another tool, a key) and what it needs.
- **The files.**
  - The tool may save in its own folder or a cache. Each kept file is copied into the project.
  - Scratch goes to `design/scratch/`, ignored by git, and is deleted at the end.
  - A file is never overwritten: a revision is `<slot>-v2` beside it.
  - Rejected takes stay out of the served folder; their reason goes in the slot's prompt file.
  - A batch can come back as one grid sheet: check what came back before wiring the slots.

## 2. Generate, or not

- **Generate** the brand world: an illustrated concept, atmosphere, places and objects that are not the client's own,
  a scene that shows the person using the product (with the product's real interface composited in, §5).
- **Never generate** what must be true: the client's product, their room, their dish, their team, a screenshot of
  software, a logo, a chart, an icon, a diagram. Those are the real thing, code (SVG, HTML) or an Iconify icon.
- **A photographic hero** is generated only when it holds full screen next to a real photograph of the same kind of
  subject, compared side by side at 1440 and 390 (`.claude/reference/brand.md`). An illustrated hero needs no
  such comparison: it does not pretend to be a photograph.
- **The hero is the first look**, generated or not: a very good picture that makes sense as an opening for this
  business. It says at a glance what this one is (its trade, its place, its way of doing it, from the card and the
  client's material), holds one clear subject, leaves the room the headline needs, and still reads cropped at 390.
  A frame that could open any page of its category, or a beautiful one that does none of that, goes to a section or
  out; when no frame does it, the hero is a real photograph of the business or committed type.
- One medium per page: all photographs, or all of one illustration line. A generated illustration beside a stock
  photograph is two worlds.

## 3. The look, written before the first prompt

Write `design/art-direction.md` before generating anything; every prompt is derived from it, and a regenerated image
months later follows it. It is short and concrete, in this order:

1. **The line in one sentence:** medium, technique and mood ("a screen-printed noir comic: three flat inks on rough
   paper, shapes carved out of solid black by one hard light").
2. **Colour:** the page's own tokens with their hex and the share of the frame each takes; one accent per frame at
   most, carrying meaning. No colour outside the page palette.
3. **Mark or material:** how edges, shadows and texture are made (brush contour, closed black shadows, paper tooth;
   or for photography the film stock, grain size, highlight roll-off).
4. **Light:** one motivated source per frame, named, and where its shadow falls. The light that is visible in the
   frame (a lamp, a window, a screen) is the light on the subject.
5. **Camera:** the shots the set uses, different per frame (extreme close-up of hands, top-down, low angle, over the
   shoulder, silhouette, wide with the subject small), and the lens per shot for photography.
6. **Where detail goes:** hands, face, the object of the act; the rest reduced to shape. Uniform detail everywhere
   is the first thing that reads as generated.
7. **Room for the page:** where type sits in each ratio, as a share of the frame, made by the picture itself (a
   shadow, a wall, the sky), not by a box pasted on.
8. **The subject's identity**, if one person or object recurs: the reference images that carry it.

## 4. The shot list

One row per slot of the page, from the section blueprints, before generating:

| Slot | Ratios | What sits over or beside it | The one act or idea | Shot | Accent |
|---|---|---|---|---|---|

- Each slot names every ratio it is served in (16:9 for wide, 4:5 or 9:16 for the phone) and is **generated at each
  ratio**, not cropped from one: a crop of a 16:9 into 4:5 loses the composition.
- Vary the coverage: a list where every frame is the same mid shot of the same person facing the camera reads as a
  template.
- A product scene draws the device flat and front-on with its screen filled with key green `#00FF00`, edge to edge,
  nothing over it; the page puts the real interface in that rectangle. The interface is never generated.

## 5. Writing the prompt

About 200 words, concrete and sensory, in this order; past that the model drops parts:

1. **Purpose and format:** what it is for and its ratio ("a 16:9 website plate; the page sets the title over the
   left 35%").
2. **Subject:** who or what, by a short handle when a reference carries the identity ("the man in image 1").
3. **Setting:** place, time, weather; only props that belong there.
4. **Camera:** position, distance, angle, framing, lens and depth of field.
5. **Light:** key, fill, practicals, direction, shadow falloff, each with a source.
6. **Look:** the line of `art-direction.md`, word for word, the same sentence in every prompt of the set.
7. **Composition guard:** where the subject sits and what stays clear, as shares of the frame.

- **Say what you want.** Most current models have no negative prompt and read "no X" as a mention of X: "tack
  sharp", "empty sky over the top 30%", "matte skin with pores".
- **No words in the picture** unless the exact copy was given; type is set by the page. Labels, screens and signs
  are drawn blank or as shapes that do not imitate text. Given copy goes in quotes, with its typeface and place, and
  an unusual word is also spelled letter by letter.
- **A cutout** (an object on a transparent ground): ask for alpha when the model and its format (PNG, WebP) give
  it. Otherwise generate on a flat key colour far from the object's own, and key it out. Check the edge at 2× for
  halos and fringing; any text on the object stays.
- **Per family:**
  - Natural-language models (gpt-image, Imagen, Flux, Gemini): prose; "a photograph of…" switches Imagen to
    photography; Flux takes colours as hex; references are named by their index ("image 1").
  - Tag models (SDXL in ComfyUI): comma tags, weights, and a negative prompt that does work ("smooth skin,
    airbrushed, extra fingers, text, watermark"); generate near 1 megapixel (1024 × 1024, 1344 × 768) and upscale.
  - Video models: §10.
- **Size:** sides in multiples of 16; generate the widest the model does well (gpt-image 2560 × 1440, Flux about
  2 MP) and upscale with the generator's own upscaler or a local one (Real-ESRGAN) for the 2400 px slot. ffmpeg
  resamples; it does not add detail.

## 6. A set that reads as one hand

- **Anchor first.** Generate the frame that holds the most of the look and approve it before anything else. Every
  later frame passes the anchor as a style reference and the recurring subject's references. The anchor sets the
  look; it is the hero only if it also works as one (§2).
- **A test frame before the batch:** one frame that holds every element of the set (the subject, the accent, the
  light, the medium). If it fails, fix `art-direction.md`, then generate the rest.
- **Lock, then change one thing.** A revision states what stays (face, pose, framing, lens, light) and changes one
  element; the fragile constraint is repeated at the end of the prompt. When the generator has an edit mode (an image
  plus an instruction), the revision sends the approved frame as its base ("keep the layout, change only the sky")
  instead of describing the frame again from text; a generator without one regenerates, and the report says so. The
  base frame is kept: the revision is a new file beside it.
- **Edit or generate.**
  - If parts of a picture must stay, it is an edit. If the pictures only guide the style, it is a generation with
    references.
  - Each picture sent is named by index and role ("image 1: the frame to edit; image 2: style reference").
  - A tool that edits only pictures in the conversation needs the file shown to it first.
  - A mask is a hint: check, by eye or by diff, that nothing outside it changed.
- **Record each approved frame** in `design/prompts/<slot>.md`: the generator and model, the full prompt, the
  references, the seed when there is one, the date. A frame nobody can regenerate is a dead end.
- **Look at the set together:** a contact sheet of every frame at the same size. One frame that is lighter, warmer,
  busier or in another hand is regenerated; `python .claude/tools/asset-audit.py` measures sharpness and warmth.

## 7. What reads as generated, and the rejection pass

Generate three or four variants per slot and reject before choosing. A frame is rejected for any of these:

| Tell | What is done instead |
|---|---|
| A photograph with a texture filter laid evenly over it: the same halftone or hatching on the face, the wall and the floor | a medium that decides: detail and texture where the eye goes, the rest flat shape |
| An idealized face: a model's jaw, a smoulder at the camera, poreless skin | an ordinary face doing the act, half in shadow, with pores and asymmetry |
| The recurring person changes face, age or build between frames | the same reference images in every prompt; reject the frame that drifts |
| Hands: extra, fused or sausage fingers, a hand larger than the head | hands in a pose the model does well, partly out of frame, or regenerated |
| A visible lamp or window that is not what lights the subject | one source, and the shadows fall from it |
| A rectangle of flat colour or black pasted on for the type, with a straight seam | the room for type made by the picture's own shadow, wall or sky |
| Pseudo-text: letters, or bars imitating a label or a screen | a blank surface, or the real copy set by the page |
| The same pose, expression and distance in every frame | the shot list's variety |
| Symmetry and a centred subject without reason | an asymmetric frame |
| Bloom, HDR, rim light and neon without a source, glossy everything, marble and floating objects | the light of `art-direction.md` and matte materials |
| Grain or blur added to hide a defect | regenerate or repair |

Then look at it where it goes: a capture of the page at 390 and 1440 with the frame at its real crop and the copy
over it. A frame that looks good alone and fights the type is rejected. Never approve a frame because it is
impressive.

## 8. Repair

1. Name the defect and the row of §7 it breaks.
2. Deterministic or generative? A crop, a reposition, a recolour to the palette, an extended dark area, a cleaned
   edge are done with an editor or ffmpeg; a wrong hand or a face that drifted is regenerated.
3. Prefer the small deterministic fix. Regenerate only the failing frame, with its prompt file, and keep what passed.
4. Check it again at its real crop.
5. Each slot has a budget of takes, written before the first one with what counts as good enough.
   - The same flaw in two takes means rewriting the prompt.
   - A different flaw each time means generating again.
   - When the budget is spent, stop and report the options.

## 9. Delivery to the page

`node <skill>/scripts/media.mjs still <image> --name <slot> [--ratio 4:5]` writes AVIF and WebP at 640, 1024, 1600
and 2400 (never wider than the source) and prints the `<picture>` with width and height; run it once per ratio and
join them with `media` on the `<source>` for the phone crop. Then:

- The 1600 px file is 200 KB or less (`assets.md` rule 10); a busy generated texture is the usual reason it is not.
- The first-screen image is `fetchpriority="high"` and never `loading="lazy"`; the rest are lazy.
- `alt` says what the picture shows for the page's argument; decoration takes `alt=""`.
- The hard edge and system ratios of `assets.md` apply to generated pictures as to any other.

## 10. Footage

- **Start from an approved still** (image-to-video), so the clip inherits the look and identity. The prompt
  describes only motion: what moves, how fast, and one camera move ("slow push in", "static camera"). Several moves
  in one shot read as generated.
- **What works on a page:** one slow action or ambient motion (smoke, water, light crossing a wall, a hand at work),
  5 to 8 seconds, no cuts, no faces turning to camera, no text.
- **The loop:** a model with a last-frame input gets the first frame as last frame; otherwise
  `node <skill>/scripts/media.mjs loop <clip> --name <slot>` crossfades the end into the start (1.5 s by default),
  drops audio, writes H.264 and AV1 each under 2500 KB and a WebP poster, and prints the `<video>`. `design-round`
  measures the seam and the length (`assets.md` rule 9).
- **A clip the scroll drives:**
  - One continuous move, with locked exposure.
  - A background quiet enough for the copy.
  - An end state that differs from the start, and no text.
  - When the page must not open on that still, the still goes as a style reference, not as the first frame.
- **A clip that sits on the page without a frame** (no card, no rounded box) ends in the page's own background: the
  prompt names that colour for the edges, and the section's background is set to the colour sampled from the clip's
  edge, so no seam shows where the footage meets the page.
- **Check frames at 0, 50 and 100 %** of the clip before it ships: the zone where the copy sits stays empty and quiet
  in all three, and the subject never crosses under the headline.
- **Before paying for a clip**, one picture of six panels of the single move pins the look and the camera.
- **A take off the palette** is generated once more; then the better take is graded toward the palette with ffmpeg.
- **Never** parallax of generated stills as a hero: it lost to real footage in a blind test.
- A pause control is visible, and under `prefers-reduced-motion` the poster shows and nothing plays.

## 11. People, brands, licences and credit

- No real person is generated except the one the page is about, from their own photographs and with their consent;
  no likeness of anyone else, no third-party logo or brand.
- A local model's licence is read before commercial use: some open weights (the FLUX [dev] family) are licensed
  for non-commercial use, with their own terms for the outputs.
- A realistic person who did not do what the picture shows is disclosed as generated where the law asks it (the EU
  AI Act's transparency duty).
- `CREDITS.md` gets a line per file: `generated, <generator and model>, design/prompts/<slot>.md`.

## 12. Design comps: the direction as a picture before the code

Optional, and only with a generator that draws legible layouts (gpt-image, Imagen, a chat product's image tool). With
the direction chosen in step 3 of the skill and before building, a comp shows the first screen as a finished picture,
so the composition is judged where it is cheap to change. The comp is a reference for the build, like a `ref/`
capture: the page is built in HTML and CSS, the comp never ships, and the words and pictures inside it are not used.

- **The brief, written before the first request.** It names, in this order:
  1. The goal, and the success criterion the comp is judged by ("the first screen at 1440 shows the headline, the
     action and the hero picture at once; the action is the most designed piece").
  2. The ratio and size of each comp: 16:9 at 1440, and 9:19.5 at 390 for the phone, each generated, not cropped.
  3. The exact copy that must appear: the headline, the supporting line and the action, word for word.
  4. The direction's palette with hex, its typefaces by name, and its composition from the sheet.
  5. What must differ between comps when there is more than one (the composition, never only the colour).
- **How many.** One comp per direction in play, at most three. More pictures do not choose better: they spend the
  person's plan.
- **Judging is looking.** Open each picture and check every criterion of the brief against it: the copy is legible
  and exact, the ratio is right, the direction is the one asked for. A judgement made from the generator's text reply
  never passes a visual criterion. Reject a comp for any tell of §7 and of `tells.md`: a model's taste is not a
  reference.
- **Keep the record.** Each comp is saved in `design/comps/<direction>-<ratio>.png` and its prompt in
  `design/prompts/comp-<direction>.md`. The chosen one and why go in a line of the notes; a rejected one keeps its
  reason.
- **A demo the generator writes** (HTML or a component next to the picture) is read like third-party code: it is not
  pasted into the project, it says which libraries and links it pulls, and the build follows the kit's rules, not
  the demo.
- **Then build to the comp**, and judge the build against it in the capture rounds as against a `ref/`. A build that
  matches a weak comp is still a weak page: the rounds compare against the references of level as well.
