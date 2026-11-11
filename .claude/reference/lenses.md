# Questions by lens

Read by `/card` before `## Specs` closes, for the lenses of `risk.json` (or the ones the card will have), and by the plan `judge` at high. A question the card does not answer becomes `<ID>-AMB-NN` when there is someone to ask, or `<ID>-ASM-NN` in the reading cheapest to undo, with its planned test. One line per question, with a short real example.

## interpretation

- Does the product add text, routes or behavior the card does not ask for (a «welcome» line, a `/health`)? Each one is `OUT`.
- Does each `S#` say the same as the sentence it quotes, no less and no more («at least 3» is not «more than 3»)?
- Is there a sentence of `L1` that no `S#` covers (a second paragraph, a comment of Jira)?
- Does a quantifier («each», «all», «any») name its members, and does each member have a test?
- Which reading works with any answer to the open question, and is that the one assumed?
- What does the card leave to the default of a library (sort order, time zone, rounding), and is it written down?
- What does «empty» mean here: missing, `null`, `""` or only spaces?
- What does a public function do with a missing argument, `null` or `{}` (`total(null)`), and does a test say it?
- Is the input normalized before it is compared or stored: NFC against NFD (`José`), a leading zero (`011 4555`), U+0000?
- What will the person type that the card's examples do not (the surname first, two spaces, a pasted line break)?
- Where is a computed amount rounded: once at the end, never per line (`3 × 0.335`)?
- A scenario with «first», «or» or «any» has a case per branch: which is the second test?

## contract

The questions every HTTP card leaves open (content type, byte limit, ids, query integers, text fields, case, search, order, request id,
405, `//path`, percent-encoding, 431, 500, extra keys, client success) have their default in `reference/http-defaults.md` (profile backend): assumed from there as an `ASM` with its test, not deliberated.

- Is a `+` in the query a space or a plus (`?q=a+b`)?
- What happens in a partial case, one valid field and one invalid (`{"name":"Ana","age":-1}`)?
- Are bytes that decoding would repair silently refused instead (invalid UTF-8 turned into `�`)?
- Which statuses does the contract (openapi) document that the app returns: 400, 404, 408, 413, 415, 431, 500?
- What does a repeated or duplicate value answer, 409 or 200 with the existing one (`POST` of the same email twice)?
- Which headers does every response carry (`content-type`, `cache-control`, the card's own), errors included?
- What is the order of the fields of a response when the card does not say (`name, email`)?
- Do the 4xx errors carry the same `error` shape as the 500 body of `http-defaults.md`?
- Does an existing client keep working: which route, field or status of main changes?
- Is each route a resource the client understands (`/orders/42` with its lines, totals and status), or a table exposed as is (`/order_lines?order_id=42`, foreign keys, internal columns)?

## integrity

- What happens to the data already there when migrating (nulls against a new unique index)? Does the unique index live with several earlier rows in null, and does the test seed two or more?
- Is the migration atomic: several statements inside one transaction?
- Does a record survive a restart of the app on the same database?
- What do two simultaneous writes do (the same email at the same time)?
- What does a write that fails halfway leave behind (a row with no children)?
- Does the upgrade run from the last state of main with seeded data, not only from an empty database?
- Which type and length does each column take, and does the code validate the same limit?
- What is deleted, and what does it take with it (cascade, orphans, a trail)?
- What is stamped with a clock (created, updated) and in which zone?
- Does a retry of the same request leave one record or two?

## visual

A card that edits a code file with markup in it and does not change the screen declares `no-visual: <why>` in `## Gate`; a view file in `## Tasks` (`.css`, `.html`, `.jsx`, `.tsx`, `.vue`, `.svelte`) voids it.

- Does Enter submit from each control of the form, not only from the last one, and from each type (text, `select`, checkbox) in a real browser?
- Where does focus go after an error and after a submit, and is it never left on `body` in any step?
- Is the focus ring visible on the invalid field and on the status message that takes focus?
- Does the sending indicator stay visible, with contrast, while the request is held?
- Does a `select` placeholder read as a placeholder, not in the color of a chosen value?
- Does what enters also leave with a transition, and does reduced motion leave no transform behind?
- Do the gaps between blocks come from the spacing tokens (`design/line.md` from mvp; at poc the card's `tokens:`), not loose values?
- Does a long text with no spaces overflow at 320 px (`aaaaaaaaaaaaaaaaaaaaaaaa`)?
- Is a disabled control still legible, with contrast and a visible reason?
- Does each state that can appear (loading, empty, error, sending, and the notice of a server error) have its `probe`?
- Does the test of an `ASM` about style or level name the values it measures (font, colors, radius)?
- Does the text the person typed show as text when it is echoed back (`<b>x</b>` visible as is)?
- Do hover, focus and press answer on every actionable element, and does a motion line exist for them?
- What does the screen show at 320, 768 and 1280 px, and does anything scroll sideways?
- Does a transient state stay on screen long enough to be measured (route held)?
- Is the `ref:` a product of level, and does each `behavior:` say when it happens and how often?

## overdesign

Always read by the plan `judge` at high, whatever the lenses of `risk.json`. The plan wins by being the simplest structure that works (`rules/architecture.md`).

- Does each file of `## Tasks` sit in its slice's layer folder (`presentation/`, `domain/`, `data/`), and does an `application/` file orchestrate more than one thing, or does it only forward to the repository?
- Is a use case, service or controller method only forwarding to the repository with the same arguments (`findById(id) { return this.repo.findById(id) }`)?
- Does an interface, abstract class or `I<Name>` file have a second implementation or a test fake in the plan, or only one class behind it?
- Is there a factory, strategy, adapter, builder, bus or mediator whose second variant or second consumer its `why-layer:` names?
- Is a container, registry or service locator planned where the framework's DI or constructor parameters would do?
- Is there a config key, option or flag for a value the card fixes and nobody will change?
- Does the plan create a folder for one wrapper file under 20 lines, or a module with layer folders it does not fill?
- Could each new file be deleted by calling the code from the file above it, and would the tests still say the same?

## security

- Is the person's text inserted as text, never as HTML (`<img onerror=…>`)?
- Is a huge body with another content-type cut without reading it all?
- Does an internal error leave the process alive?
- Who may call each route, and what does the call without credentials answer, 401 or 403?
- Does a value of the request reach a header, a path or a command without being checked (`../`, `\r\n`)?
- Does a log line or an error echo personal data or a secret?
- Is the host or origin checked when the card names one (`Host`, CORS)?
- Does anything sensitive travel in the query string?
- Which limit stops a loop of requests (size, count, time), and what does it answer?
- Does the static server serve only the public folder (`/.git/config`, `/.env`, `/package.json`, `/specs/`, `/design/` give 404)?
- Does the page set a tracking cookie or call a tracker before consent, and does a form of personal data link the privacy page (`legal.md` LEG-07, LEG-08)?
- Does the card copy code, fonts or pictures from others, and does each carry its licence or credit beside it (`legal.md` §1–2)?

A security finding names its attack in one sentence: who sends what, and what they get. Without that sentence there is no finding. Before raising one, check whether a library the Tasks already name handles it: ORM parameters, the framework's escaping, the auth middleware. These are not findings:
- A value from an environment variable, a CLI flag, a config file or a constant of the card. Only what a request or the person brings is untrusted.
- An id from 128 random bits (UUID v4) that "could be guessed". Missing the ownership check on that id is still a finding.
- A request value that fills part of a path on a fixed host. It is SSRF only when it chooses the host, the scheme or the port.
- `../` in a value that never reaches the file system.
- A screen that does not check permissions. The server decides; its route is what gets asked.
- XSS in React, Vue, Svelte or Angular outside `dangerouslySetInnerHTML`, `v-html`, `{@html}`, `innerHTML` or `bypassSecurityTrust*`.
- A log line with a URL, an id or a status code. Only secrets, tokens, passwords and personal data count.
- Hardening with no attack: a header the card does not name, an audit log, a library version with no CVE that the card's code reaches.
