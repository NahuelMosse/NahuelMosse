# Design references by type of screen

The `ref:` of `## Look` comes from, in this order: the card (Figma, a capture), the repo's design system, this gallery.
Never pick «the simplest» or «the cheapest to undo»: the look is not an ambiguity of behavior, it is a direction of level.
It is declared as an `ASM` all the same, with the reference of that level. The designer captures it into `specs/<card>/ref/`.
A screen that marketing or a campaign asks for (a landing, a newsletter or launch sign-up, a promo) takes its reference from
«Landing or marketing» and from the section of its genre, not from the product forms: it has to sell, not only work.

**A landing declares its genre.** `## Look` carries `ref-genre: <genre>` (free text; the sections below are `drink-food`, `cosmetics`, `local-service`, `saas`, `app`; a document takes «Report or long document») and a
`ref:` from the nearest genre's section: the same-genre reference is mandatory, it gives the structure and the conventions people expect. The level
is set by the **first** `ref:`, the one of award level, of the genre or lateral; a store of the genre is not the ceiling. One or two
`### Lateral` references of other genres give the trait of excellence. Every URL below answered with a real page when it was fetched; a
reference that later answers a bot wall or an error is retried once (fresh context, longer wait) and, if it still fails, replaced by the next one of its section: the substitute is of the same product genre. The retry is recorded in `rondas.md`.

## Form or sign-up

- https://buttondown.com · a single column, one clear action, calm type and a tinted background, never the default button.
- https://cal.com/signup · short fields with visible focus, one primary button, social sign-in below.
- https://resend.com/signup · dark surface, tight spacing, labels and errors in the same scale.
- https://tally.so · forms that read as a document: large type, little chrome.

### Lateral

- https://learningmusic.ableton.com · no sign-up: the first action gives a result you hear; the account comes after.

## Login

- https://linear.app/login · one card, one decision per screen, the brand in a single accent.
- https://vercel.com/login · monochrome with a strong button hierarchy; the alternatives are quiet.
- https://github.com/login · plain and dense, errors in context, the secondary links below the form.
- https://ui.shadcn.com/examples/authentication · two-column composition with a testimonial.

### Lateral

- https://learningmusic.ableton.com · no login: the first action gives a result at once; asking for the account comes after.

## Dashboard or metrics

A product screen names `ref-kind: product` in `## Look`: its references are real product UI, never a login or a marketing page. `bot-wall.mjs` checks it when `app.mjs probe` opens a reference: it answers `login-wall`, `marketing` or `not-product` and the capture stops with `could not run: <url> is a login wall / marketing page (<why>)`. A login, a homepage or a docs page is never the reference of a dashboard; use a public demo or a public page of the product itself.

- https://plausible.io/plausible.io · the live demo: KPIs in a row with dividers, one chart, two plain tables with a bar behind the value, one accent.
- https://play.grafana.org/d/cd426304-be2c-4211-b1e5-fdf30c56af39/system-overview · a monitoring board at full width: time controls, flat titled panels, series with their legend.
- https://ui.shadcn.com/view/new-york-v4/dashboard-01 · the full-screen dashboard: sidebar, KPIs, area chart and a table with column headers.
- https://shadcn-admin.netlify.app · an admin panel: one level of card, amounts aligned to the right.

### Lateral

- https://pudding.cool/2026/10/kevin-bacon · one question per card, a year slider and arrow keys to move through time.
- https://ciechanow.ski/moon/ · one phenomenon, three controls, an immediate answer.

## Operational tool (machine, agents, status)

Same `ref-kind: product`. The question is a state ("is it free or busy"), so the verdict is one line of text with its number, and the list under it is rows with a hairline.

- https://github.com/microsoft/vscode/actions · a list of runs as rows with a hairline: about 12 per screen, status as an icon, no card per row.
- https://london3.my-netdata.io · machine resources (open the dashboard anonymously): CPU, RAM, disk and network at once, dense.
- https://status.openstatus.dev · a status page: one line of verdict, one 45-day bar per service, uptime in tabular mono.
- https://www.vercel-status.com · a status page: hairlines between rows, color only for state.

### Lateral

- https://ciechanow.ski/moon/ · one phenomenon, three controls, an immediate answer.

## List or table

- https://attio.com · dense rows, inline-editable cells, a toolbar of filters and views.
- https://folk.app · contact rows with avatar and tags, a light surface.
- https://twenty.com · open source (https://github.com/twentyhq/twenty): the table with grouping and a side panel.
- https://linear.app/features · keyboard-first list, status icons, hover actions.

### Lateral

- https://letterboxd.com/films/popular/ · switchable density (Small/Large) and filters as stacked text links, not modals.
- https://www.are.na · the scope of the search (yours, your network, all) as a first-class control.

## Detail

- https://attio.com · a record: header with the key facts, tabs, a timeline on the side.
- https://linear.app/features · an issue: properties in a column, activity below, nothing decorative.
- https://stripe.com/billing · a customer: summary on top, the lists below it by weight.

### Lateral

- https://www.rijksmuseum.nl/en/collection/SK-C-5 · the record as a provenance register (where, when, who) with a download.
- https://ciechanow.ski/moon/ · the explanation carries its own controls.

## Dense record (a loan, an account, a case)

Same `ref-kind: product`, and the card carries `## Information`. What the record systems of large products do, from their own docs:

- **A header of key facts that stays.** Salesforce's highlights panel shows the first 7 fields of the compact layout; the Dynamics 365 header holds up to 4 and stays visible on scroll; Fiori's object page has a dynamic header of key facts that collapses to its title. The fields of D1 go there (`ia-check` fails a long record whose key facts scroll away).
- **The state and the next step right under it**: Salesforce's Path and the Dynamics business process flow sit below the header.
- **A wide main column and a narrow one of context**: Polaris 2/3 + 1/3, Jira's details panel, Stripe's detail page. The narrow one holds what is read, not what is worked on.
- **Sections by decision, reached from a bar that stays**: Fiori's anchor bar, Dynamics tabs and sections. Secondary tabs do not load until opened; related lists show only the important ones.
- **Rows and space by steps**: Carbon's row heights 24 · 32 · 40 · 48 · 64 px with a 16 px cell padding; Atlassian's scale on 8 px, 12–24 inside a group and 32–80 between groups. Narrow screens stack the columns, never squeeze them.

Captures (public pages that answered as product UI at 1440 px):

- https://stockanalysis.com/stocks/aapl/ · a dense record: the price and its change as the headline, 18 key stats in two label-value columns with the values right-aligned beside the chart, the rest in tabs.
- https://github.com/microsoft/vscode/issues/250000 · the case: the conversation as the main column, the properties (assignees, labels, milestone) in a narrow right column.
- https://dashboard.tremor.so/overview · KPIs with their delta over a table, one spacing scale.

### Lateral

- https://github.com/microsoft/vscode/actions · the state of each item as one icon per row, so a long list reads at a glance.

## Report or long document

A document read top to bottom, on screen and printed to PDF (a report, a study, a case). Its look is reading: a text face for pages
(`draw.mjs --sector report` deals only faces with `longRead` in its type library), a column of 60–75 characters, numbered figures with
a caption and a source, a contents list, and `@page` rules for the print. No stock photographs: its pictures are its charts, tables and diagrams.

- https://www.gov.uk/government/publications/the-uk-government-resilience-framework/the-uk-government-resilience-framework-html · a long HTML publication: a numbered contents list, numbered sections, one plain reading column.
- https://www.bankofengland.co.uk/monetary-policy-report/2024/november-2024 · a periodic report: key messages first, then sections each carried by a chart and an explanatory box.
- https://ourworldindata.org/life-expectancy · a data report: an introduction, then key insights that each pair one chart with its notes, endnotes and how to cite it.
- https://distill.pub/2020/circuits/zoom-in/ · a research article: one column, figures that break wider than it, footnotes and citations kept to the margin.

### Lateral

- https://edwardtufte.github.io/tufte-css/ · sidenotes and margin figures beside the text, the print book's layout on the web.
- https://practicaltypography.com · the rules of a page of reading: line length, leading, point size, headings.

## Settings

- https://github.com/settings/profile · a left menu of sections, one block per setting, a save per block.
- https://vercel.com · project settings: a card per topic, the dangerous one apart and in red.
- https://ui.shadcn.com/blocks · settings blocks to start from.

## Landing or marketing

- https://linear.app · a precise hero, product captures as the proof, motion on scroll.
- https://vercel.com · grid and contrast, strong type, one line of promise.
- https://www.raycast.com · depth with gradients and glass, keyboard visuals.
- https://www.getlayers.ai · the templates to see the composition of a SaaS landing.
- https://awwwards.com/websites/sites_of_the_day/ · the site of the day, for the level of motion and composition.
- https://godly.website · a curated catalog of top-level pages.
- https://unseen.co · a studio site: page transitions and WebGL, the pace of each change of view.
- https://illoca.unseen.co · a product page from the same studio: how imagery and motion carry the story.
- https://a24.raviklaassens.com · editorial with scroll: type and image entering in sequence.
- https://www.raviklaassens.com · the portfolio of the same author: hover states and transitions between sections.
- https://tympanus.net/codrops/ · demos with code, WebGL over the DOM: effects to read and measure.
- https://gsap.com/showcase/ · the GSAP showcase, for the level of scroll choreography.

### Lateral

- https://oryzo.ai · a humble object told as an engineering product: a serious spec sheet and a demo you handle inside the page.
- https://www.graza.co · a selector that is the product itself: choosing changes pack, color and copy together.

## Landing: DTC drink or food

Inner pages to capture: the product page and the collection or flavor page.

- https://en.manayerbamate.com · a drink of award level: a 3D slider of the flavors as the variant selector instead of a grid.
- https://liquiddeath.com · a single light block over footage, a brand voice that never breaks.
- https://drinkolipop.com · a store: flavor as the system, each product carries its own color pair; structure, not level.
- https://brightland.co · half photo, half calm text; a gift-set grid that stays editorial.
- https://flybyjing.com · a dense plane of small same-weight pieces: the dense exception, with one point of entry.

### Lateral

- https://oryzo.ai · a humble object told as an engineering product: a serious spec sheet and a demo handled inside the page.
- https://www.graza.co · a flavor selector on the product page that changes pack, color and copy together.

## Landing: cosmetics or personal care

Inner pages to capture: a product page and the routine or collection page.

- https://www.glossier.com · soft photography in one palette, product on a tinted plane, short and warm copy.
- https://www.rhodeskin.com · one object per frame at scale, generous air, a quiet precise grid.
- https://summerfridays.com · a pastel system with a type voice and the product in use.
- https://www.byredo.com · editorial luxury: full-bleed image, sparse type, almost no chrome.
- https://tatcha.com · heritage told through a ritual, a rich photo grade, a clear route to buy.

### Lateral

- https://a24.raviklaassens.com · editorial with scroll: type and image entering in sequence.

## Landing: local service

Inner pages to capture: the booking or quote flow and a provider or category page.

- https://www.taskrabbit.com · the first screen is the booking action; trust and categories right below.
- https://www.rover.com · real people and pets, search first, proof in numbers.
- https://wag.co · a warm photographic set with a short path to book.
- https://www.getjobber.com · a service-business site: proof with figures and product shots next to the promise.

### Lateral

- https://learningmusic.ableton.com · the first action gives a result at once; asking for data comes after.

## Landing: SaaS or tech product

Inner pages to capture: pricing and a feature or changelog page.

- https://linear.app · a precise hero, product captures as the proof, motion on scroll.
- https://www.raycast.com · depth with gradients and glass, keyboard visuals.
- https://stripe.com · gradient identity, live product fragments and numbers as proof.
- https://resend.com · a dark surface, tight spacing, code as the product image.
- https://attio.com · a dense product UI shown at scale with a calm editorial frame.

### Lateral

- https://oryzo.ai · a spec sheet and a handled demo give an object the weight of a product.
- https://manus.im · the input is the hero: a headline over a large prompt field and task chips.

## Landing: app

Inner pages to capture: a feature page and the download or sign-up step.

- https://www.strava.com · community and data as proof, the phone in use in full-bleed frames.
- https://flighty.com · one tight idea (the live flight) told with the product at scale and a crafted store badge.
- https://finchcare.com · a character carries the brand and the screens; the tone is the product.
- https://monzo.com · a coral accent owned by the brand, plain copy, the card and the app as the visuals.
- https://www.headspace.com · illustration as the brand, calm pacing, a clear first action.

### Lateral

- https://chromedino.com · a state turned into a playable first step.

## Checkout

- https://stripe.com/payments/checkout · order summary beside one payment form, trust marks, errors per field.
- https://www.mercury.com · calm finance: wide spacing, a restrained palette.
- https://clerk.com/components · the sign-in and account components, for the steps before paying.

## Empty state

- https://emptystat.es · a catalog of empty states: illustration, one line, one action.
- https://linear.app · an empty list explains what goes there and offers the first step.
- https://www.notion.com · a blank page that teaches by example.

### Lateral

- https://chromedino.com · the offline state turned into a playable first step.

## More to compare

- https://mobbin.com · real flows of the apps, by screen.
- https://refero.design · screenshots by pattern.
- https://pageflows.com · whole user flows on video.
- https://typeform.com/templates · one question per screen, with a transition between them.

## By section of a page

A screen's whole reference gives the level; a gallery of one kind of section gives the piece the reference lacks. The designer captures the
entry it takes into `ref/` like any other, and the screen builds it with its own copy, colors and the set's components, never as a copy of the entry.

- https://unsection.com · whole sections sorted by type: hero, pricing, FAQ, footer.
- https://navbar.gallery · navigation bars of real sites.
- https://cta.gallery · calls to action, the piece of a landing that sells and the most designed one.
- https://footer.design · footers that close a page with intent.
- https://bentogrids.com · grids that show several things at once without a list.
- https://404s.design · error pages that hand back a way out.
- https://60fps.design · the micro-interactions of well-made apps, mobile and web: what each component's motion answers to.
