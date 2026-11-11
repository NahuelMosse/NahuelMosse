# SEO: a public page that can be found, understood and shown well

A page earns traffic from search and from links shared in chats when four things hold: a crawler can reach it, the server's HTML
already says what it is, the result it produces (title, snippet, preview card, rich result) is written on purpose, and it loads
without jumping. This file is how that is built (Google Search Central, web.dev, schema.org, the Open Graph protocol), as values and
as an order of work. `inspect.mjs` measures what has a number on the rendered page.

**Which pages.** Public pages: a landing, a product or pricing page, a blog post, a docs page, a public profile. A screen behind a
login is the opposite case: it says `noindex` and nothing else is asked of it (`inspect.mjs --app` skips the head checks). A page
decides which it is before it is built.

## The order of work

1. **Intent**: the query a person types to land here, in their words (not the company's), and what they want to do after. One
   page answers one intent; two pages for one intent compete with each other.
2. **URL**: short, readable, lowercase, words joined by `-`, in the page's language, stable (`/prices`, not `/page?id=42`). A URL
   that changes is a 301 from the old one, never a 404.
3. **Content first, in the server's HTML**: the `h1`, the main text and the links render on the server (SSR or static). Content that
   only appears after JavaScript is indexed late or not at all, and never by most AI crawlers and link previews.
4. **Head**: title, description, canonical, lang, viewport, Open Graph, the Twitter card, the JSON-LD (below).
5. **Structure**: one `h1` that says the intent; `h2` per question the page answers; landmarks (`header`, `main`, `nav`, `footer`).
6. **Links**: in and out, with text that names the destination.
7. **Media**: alt, dimensions, sizes, modern formats, the hero not lazy.
8. **Speed and stability**: the web vitals at "good".
9. **Site files**: robots.txt, the sitemap, the 404, the redirects.
10. **Measure**: `inspect.mjs` on the running page; then Search Console and the Rich Results Test once deployed.

## Title and description

- **Title** (`<title>`): unique per page, the intent first and the brand last (`Dental cleaning in Palermo · Sonría`), about
  50–60 characters (the inspector warns past 65): Google cuts by width (about 600 px), and rewrites titles that are empty, repeated across pages, stuffed with
  keywords or far from the `h1`. Keep the title and the `h1` saying the same thing.
- **Meta description**: a sentence that tells what the page has and why to click, about 120–160 characters (the inspector warns
  under 50 or over 170), unique per page. It does not
  rank; it is the ad of the result, and Google uses it when it matches the query better than any text of the page.
- These ranges are rules of thumb from what search shows, not limits Google publishes (it publishes none).

## Indexing

- **Canonical**: one `<link rel="canonical">` per page, absolute, to the URL that should rank (itself, unless it is a duplicate).
  Parameters, sorting and tracking (`?utm_`, `?sort=`) point to the clean URL.
- **noindex** (`<meta name="robots" content="noindex">` or the `X-Robots-Tag` header) for what must not appear: screens behind a
  login, search results of the site, thank-you pages, staging. A staging environment is `noindex` and behind auth; production never
  inherits it (the most common SEO outage is a `noindex` that shipped).
- **robots.txt** controls crawling, not indexing: a blocked URL can still appear (without a snippet). Never `Disallow: /` in
  production; never block the CSS and JS a page needs to render. It lists the sitemap: `Sitemap: https://…/sitemap.xml`.
- **Sitemap**: the canonical, indexable URLs only, with a real `lastmod`; generated, not hand-written.
- **Status codes**: 200 for a page, 301 for a moved one, 404 or 410 for a gone one (a "not found" page that answers 200 is a soft
  404), 503 with `Retry-After` for maintenance.

## Structure and content

- One `h1` that states the page's topic in the words of the intent; headings in order, one level at a time.
- Answer the question in the first screen and the first paragraph; then the depth. A page an AI answer engine can quote is the
  same page a person skims: short sections under question-like headings, a definition in one sentence, facts with their numbers.
- **E-E-A-T**: who wrote it and why they know (an author with a page), when it was updated, the sources linked. Trust is the
  heaviest of the four.
- Original content: a page that repeats what ranks already adds nothing to rank for.

## Links

- **Real anchors**: `<a href="/ruta">`, never a `div` with an `onClick` or `href="#"`/`javascript:`; crawlers follow `href` only.
- **Link text names the destination** («See the prices», not «Read more» or «Here»). A card whose whole surface is a
  link takes its name from its title.
- Every important page is reachable in a few clicks from the home and from related pages; a page no one links to is an orphan.
- Outbound links that are paid or user-written carry `rel="sponsored"` or `rel="ugc"`.

## Images and media

- `alt` on every image: what it shows when it carries information, `alt=""` when it is decoration. No keywords stuffed.
- `width` and `height` (or `aspect-ratio`) on every image, so nothing jumps when it loads.
- `srcset`/`sizes`, AVIF or WebP; the hero eager with `fetchpriority="high"`, everything below the fold `loading="lazy"`.
- Descriptive file names (`waiting-room-palermo.avif`, not `IMG_0042.jpg`).

## Shared links: Open Graph and the Twitter card

A link pasted in WhatsApp, LinkedIn, Slack or X becomes a card built from these tags. Without them it is a bare URL.

- `og:title`, `og:description`, `og:url` (the canonical) and `og:image` (absolute, 1200×630, under about 5 MB, text in the safe
  center), plus `og:type` and `og:site_name`.
- `twitter:card` = `summary_large_image` (the other tags fall back to Open Graph).

## Structured data

- JSON-LD in a `<script type="application/ld+json">`, describing what is visible on the page and nothing else: `Organization` (with
  `logo` and `sameAs`) on the home, `WebSite`, `BreadcrumbList`, `Article` (author, dates), `Product`/`Offer`, `FAQPage`,
  `LocalBusiness`, `Event`, `JobPosting`, according to the page.
- Valid in the Rich Results Test; a type the page does not show is spam for Google.

## Speed and stability (web vitals)

Google's "good", at the 75th percentile of real visits: **LCP ≤ 2.5 s**, **INP ≤ 200 ms**, **CLS ≤ 0.1**. They are a light ranking
signal and a heavy conversion one. In the lab (`inspect.mjs`) LCP and CLS are one load on a fast machine: a pass there is
necessary, not sufficient; the field value is in Search Console and CrUX.

- LCP: the hero image or heading in the server HTML, preloaded, not lazy, served sized; fonts with `font-display: swap` and
  preloaded.
- CLS: dimensions on media, reserved space for ads, embeds and banners, no content inserted above what is read.
- INP: little JavaScript on the main thread at interaction; split long tasks.

## Languages and regions

- `lang` on `<html>` with the page's language (`es-AR`).
- With versions in several languages: one URL per language, `hreflang` alternates on each one, absolute, including itself and an
  `x-default`; each version canonical to itself.

## Mobile and accessibility

- `<meta name="viewport" content="width=device-width, initial-scale=1">`; Google indexes the mobile version.
- What helps a screen reader helps a crawler: landmarks, headings in order, alt, named links, text as text (not in images).

## What not to do

Keyword stuffing, text hidden for crawlers, doorway pages per city, content generated at scale without value, buying links, cloaking
(showing crawlers something else), infinite scroll with no paginated URLs, interstitials that cover the content on mobile.

## What the inspector checks

On a page (not with `--app`), at every width it opens:

| Rule | Level | Fires when |
| --- | --- | --- |
| `seo-head` | FAIL | No `<title>` or a default one (`Document`, `Vite App` …), no meta description, no `lang`, no viewport |
| `seo-snippet` | WARN | Title over 65 characters; description under 50 or over 170 |
| `seo-share` | WARN | Not exactly one absolute canonical; a missing `og:title`, `og:type`, `og:image` or `og:url`; no `twitter:card`; JSON-LD that does not parse or has no `@type` |
| `noindex` | WARN | `robots` says `noindex` |
| `img-alt` | FAIL | An `<img>` with no `alt` attribute (`alt=""` is a valid answer for decoration) |
| `image-size` | WARN | A visible img, video or iframe with no `width` and `height` and no CSS `aspect-ratio` |
| `lazy-hero` | FAIL | A first-screen picture with `loading="lazy"` |
| `link-text` | WARN | A link whose whole name is a generic word («read more», «here», «leer más», «acá» …) |
| `layout-shift` | WARN over 0.1, FAIL over 0.25 | The layout shifts summed while the page loads (CLS) |
| `slow-paint` | WARN over 2.5 s | The largest paint (LCP), only from a local server: over the network it measures the distance. It never fails: a lab number moves with the machine's load |

What it cannot see: the raw server response (whether the text is in the HTML before JavaScript), robots.txt and the sitemap,
hreflang, INP (it needs real interaction), the intent, the quality of the answer, E-E-A-T and the links from other sites. Those are
the author's work, with this file. A value that needs the final domain (canonical, `og:url`, `og:image`) is written with the domain
the brief gives; when there is none yet, say so in the report.

## Sources

Google Search Central (SEO Starter Guide; title links; snippets and meta descriptions; canonicalization; robots meta and
X-Robots-Tag; robots.txt; sitemaps; JavaScript SEO basics; structured data guidelines; helpful content and E-E-A-T; spam
policies; mobile-first indexing; localized versions and hreflang) · web.dev Core Web Vitals (LCP, INP, CLS thresholds) · schema.org
· The Open Graph protocol · X cards documentation · WCAG 2.2 (2.4.4 link purpose, 1.1.1 non-text content, 3.1.1 language of page) ·
existing agent skills surveyed for their scope: AgriciDaniel/claude-seo (technical, schema, GEO/AI search, hreflang, images),
rampstackco seo-technical (crawlability, indexability, page experience, structured data).
