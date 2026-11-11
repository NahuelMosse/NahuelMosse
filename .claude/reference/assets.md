# Assets: imagery that belongs to the page

In a blind comparison of three versions of one landing, the one with integrated resources won: nothing drawn with basic shapes
(objects drawn that way look amateur), one photographic genre, full-bleed image with type over or across it, clean cutouts. `python .claude/tools/asset-audit.py --help` measures rule 3 (sharpness and warmth of the set).

## Rules

Each rule has its check; the `designer` runs them before the last capture round.

1. **Nothing drawn with primitives to show objects or icons.** Geometry only as a system (grid, type, data).
   *Check:* no decorative element combines `border-radius: 50%` with `radial-gradient` or an `inset` shadow; no SVG of circles and paths standing for an object.
2. **One icon set per screen, from Iconify** (`https://api.iconify.design/<set>/<icon>.svg`): Lucide, Phosphor or Tabler.
   *Check:* the SVGs share one `stroke-width` and one grid; one set prefix in the sources.
3. **One photographic genre per page** (all editorial, all product on seamless, all architectural daylight).
   *Check:* the contact sheet of the page's images reads as one shoot; the (R-B) warmth of the images varies by 10 or less.
4. **Hard edge on photos, with the photo's background as the page's background.** A mask fade only for atmosphere (a glow, a haze).
   *Check:* 20 px sampled at the image border match the container `background-color` (deltaE under 3); `mask-image` on a photo is `none`.
5. **Full-bleed image, or touching the type, in at least two sections.**
   *Check:* two `section` elements where an `img` or `video` spans the viewport width or overlaps a text box.
6. **System proportions and one radius for the whole set**, set in CSS (`aspect-ratio` + `object-fit: cover`; 3:2, 4:5, 16:9).
   *Check:* the histogram of rendered `width/height` has a ratio over 40 %; `border-radius` of every media is one value.
7. **One direction of light and shadow.** The shadow of a cutout falls opposite the light of the photos; no CSS `box-shadow` on an image.
   *Check:* `box-shadow` on media is `none`; compare the shadow side against the brightest side of the nearest photo.
8. **Cutouts without halos, or the whole photo.** Cut with any tool.
   *Check:* look at the cutout over the page background at 200 %; no light or dark fringe on the edge.
9. **Hero video, if the hero is video: loop with no visible seam, under 2.5 MB, in MP4 and AV1, with poster and a pause control.**
    Real footage beats parallax of generated stills. Never resample by dropping or duplicating frames (keep the source rate). A short
    loop is fine when its seam is searched for (4-8 s); otherwise 8 s or more, crossfaded. A montage of 2-4 s clips cut at one rate
    works too, its restart being one more cut. Cut and encode with ffmpeg. A still is allowed as hero when the concept is illustrated (see Theme illustration).
    *Check:* `muted loop playsinline poster` on the `video`, a visible pause button, both files at 2500 KB or less; `design-round` measures the loop (seam, length) and fails a hero video under 4 s, one under 8 s without a clean seam, or a single shot that jumps.
10. **Each image in AVIF and WebP per width**, made with ffmpeg or the build's image pipeline.
    *Check:* `<picture>` with `srcset` at 640, 1024, 1600 and 2400; the 1600 px file is 200 KB or less.

## Never, and what goes instead

| Never | Instead |
|---|---|
| Objects or icons drawn with CSS or SVG shapes | a cutout photo with its shadow, a public-domain engraving, an Iconify icon |
| Mixed icon sets, uneven strokes | one Iconify set, one `stroke-width` |
| Emojis as icons | an icon of the set, or a word |
| Raw stock photos | one photographic genre and a system ratio (`aspect-ratio` + `object-fit`) |
| A photo faded into the background with a gradient mask | a hard edge, or a photo whose background is the page's |
| A fixed grain layer over the whole page | none; grain is an option for dark or scene pages, baked into each image with one seed and size, never required |
| Generic gradients (violet to blue) | a flat palette color; a gradient only as a scrim |
| 3D modeled in code | a render with light and materials, a photo or a video |

## Sources without a key

| Source | Where | License and credit |
|---|---|---|
| Wikimedia Commons | `commons.wikimedia.org/w/api.php` (`generator=search`, `prop=imageinfo`, `iiprop=url\|extmetadata`; send a `User-Agent` with contact) | per file: `extmetadata.LicenseShortName`; CC BY and CC BY-SA require credit and the license; public domain does not |
| Openverse | `api.openverse.org/v1/images/?q=<q>&license=cc0,pdm` (unstable: retry) | per image (`license`, `attribution` in the JSON); prefer `cc0,pdm` |
| Poly Haven | `api.polyhaven.com/assets`, `/files/<id>` | CC0, no credit needed |
| ambientCG | `ambientcg.com/api/v2/full_json` | CC0, no credit needed |
| Iconify | `api.iconify.design/<set>/<icon>.svg` | per set: Lucide ISC, Phosphor MIT, Tabler MIT; credit in `CREDITS.md` |
| Fontshare | `api.fontshare.com/v2/css?f[]=<family>@400,700` | ITF Free Font License, free for commercial use |

**SVG generators (Haikei, no account, SVG export, commercial use per its FAQ):** only for section dividers (wave, step, peak) and organic textures in the page palette; never as a stand-in for an object (rule 1) and never with its default violet-blue gradient. The SVG goes in the repo, its color set to a palette token, and `CREDITS.md` gets a line (`haikei.app`, generator, FAQ as the license).

Pexels footage (Pexels license, no credit required) is the source of real hero video: with `PEXELS_API_KEY` (a free account) through its API, otherwise from the file link of the clip's page; a link that does not answer is skipped, not guessed. Not used: Unsplash (its API terms ask for non-automated use).

## Credits

Every asset has a line in `specs/<card>/CREDITS.md`: file, source URL, author, license, and whether credit is required. What may ship at all (NC/ND licences, fonts from a CDN, third-party logos) is `legal.md` §2.

## Generated stills

How to generate (what may be used, the written look, the shot list, the prompt, the set, the rejection pass, delivery, footage): the skill's `references/generation.md`, read before the first prompt.
**Generator:** a tool of the session, an MCP server or a local model directly; an API key or an external CLI only when `## Look` (`generator: <name>`) or the person names it. The kit never contracts a service or falls back to a paid API by itself.
A generated photographic still may carry section photos; as the hero only when it holds full screen beside a real photograph of the same kind of subject, side by side at 1440 and 390, and only when it is a very good picture that makes sense as the first look of this business, not of any in its category (otherwise a real photograph). A hero video is real footage or a clip made from an approved still that passes rule 9; never parallax of generated stills, which lost to real footage in a blind test.
Never generated: the client's own product, room, people or interface, a logo, a chart, an icon.

## Theme illustration

An illustrated concept uses one generated style and one edge treatment. When the concept of the page is an illustrated world, the hero and the section images are illustrations generated to the theme, not stock photos and not objects drawn with shapes. A stylized illustration does not need to pass for a photograph.
- **One style for the whole set:** the line of `design/art-direction.md`, word for word in every prompt, one aspect-ratio system (`aspect-ratio` + `object-fit: cover` in CSS). *Check:* the contact sheet of the images reads as one hand.
- **Its own edge:** one edge treatment for all of them (an irregular crop, a hand-cut mask, a hard edge), chosen in `## Direction` and applied by the same file or mask. *Check:* the borders of the set share one treatment; no CSS `box-shadow` on them.
- **Palette from the image:** the page tokens (background, ink, accent) are sampled from the hero (a PIL `quantize` to 6 colors, then the OKLCH ladder of `color.md`). *Check:* the `palette:` rows of `design-round` pass and the accent is a color of the image.
- Each piece passes the rejection pass of `generation.md` §7 and is credited in `CREDITS.md` as `generated, <generator and model>, design/prompts/<slot>.md`.
