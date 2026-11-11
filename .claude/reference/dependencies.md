# Dependencies, licenses and versioning: rules a card can meet and a reviewer can check

**When it is read:** when the card adds or updates a dependency, a font, an icon or an
image, copies code from somewhere, publishes a version or changes a public API; and in the first card
of a repo, which sets the policy. **How:** only the sections the card touches, with `Read` and a line
range of the heading; never whole. `card.md` names the rule IDs that apply, and the `builder`
receives those IDs and their ranges. **Tools are options, not obligations.** **[NV] marks guidance not
verified**: a hypothesis, never the only evidence of a `meets`. What the kit already asks and is not
repeated: that the dependency exists in the registry, with a reasonable age, downloads and repo, and is
needed (S10); no known vulnerabilities and a lockfile (S11). How each rule is checked: `J` judgment with
written evidence, `C` a command that exits 0 or not, `T` an automated test. Source numbers `Bn` are in
Sources. None of the example commands was run.

## Rules that are criteria

| Rule | Criterion |
|---|---|
| DEP-01, DEP-02 | S10 |
| DEP-03 | S18 |
| DEP-04, VER-11 | S23 |
| DEP-05 | S11 |
| DEP-06 | K5 |
| DEP-07 | D15 |
| DEP-08 | C3 |
| LIC-01, LIC-02, LIC-03, LIC-04, LIC-05, LIC-06, LIC-09, LIC-10, LIC-11, LIC-13 | S12 |
| LIC-07, LIC-08 | S19 |
| VER-01, VER-02, VER-03, VER-09, VER-10 | O16 |
| VER-04 | V3 |
| VER-07 | W8 |

The rules outside this table are judgment or guidance, with no criterion of their own.

## 1. Isolation and necessity (DEP, a)

The non-trivial libraries (ORM, HTTP client, payments, mail, PDF, queues) are used behind an own
adapter module in infrastructure; domain and application do not import them (criterion D15). Exceptions:
the standard library, the web framework in the interface layer, and pure utilities declared in
`system-design.md`. The adapter is a module with domain names; an interface type only if there is a test
fake or a second implementation (`rules/architecture.md`, `reference/architecture.md` ARQ-07).

**DEP-01** — Before adding a dependency, the plan writes what would replace it (standard library, existing code, 50 own lines) and why that is not enough; those that bring more than a handful of transitive ones justify it by number. This is for small utilities: persistence (ORM or query builder with migrations), dependency injection, validation, authentication, dates, the HTTP client and queues use the stack's library (`stacks/<stack>.md`, «Default libraries by category»), and hand-rolling one needs an `ASM`. · How C+J · criterion S10 · Check: count the new packages in the lockfile of the diff; node-ts `git diff origin/main -- package-lock.json | rg -c '^\+\s+"node_modules/'` gives a number that goes to the plan, `npm ls <pkg> --all` shows the tree; generic `pip-compile` and a `requirements.txt` diff, `go mod graph | wc -l` before and after. S10 asks “is needed” and D7 reuse before writing; the transitive count was not asked · Source B36, B39.

**DEP-02** — Project health is measured, not guessed: a commit or release in the last 12 months, more than one maintainer, and a Scorecard at or above the repo's threshold; if it does not reach it, it goes to review. · How C · criterion S10 · Check: Scorecard per repo of each new direct dependency; the threshold (for example 5/10) is the repo's decision, not the source's; node-ts `scorecard --repo=github.com/<org>/<pkg> --format=json | jq .score`, or deps.dev's API, which shows the Scorecard per package [endpoint NV] · Source B36, B37.

**DEP-07** — A central dependency is used behind its own narrow interface, to replace or isolate it without touching the domain. · How J+C · criterion D15 · Check: the imports of the dependency are confined to an adapter module; node-ts an ESLint `no-restricted-imports` rule that allows `import ... from 'stripe'` only in `src/adapters/payments/`; generic an architecture test (ArchUnit, import-linter) with the same restriction [NV] · Source B39.

## 2. Updates and what the pipeline runs (DEP, b)

An update bot is configured with a written policy: Renovate (`renovate.json`) or Dependabot
(`.github/dependabot.yml` plus an auto-merge workflow) as options; patch and minor grouped with automerge
if the suite passes; majors in a card of their own; at most one major behind; the lockfile versioned
(S11). Criterion S18.

**DEP-03** — An update bot is configured with a written policy: a minimum wait after publication (at least 3 days; 14 if there is automerge of third parties), grouped, automerge only of patch and dev with green tests, majors by hand, and security updates without a wait. · How C · criterion S18 · Check: the config file exists and contains the keys; node-ts `renovate.json` with `"extends": ["config:best-practices"]` and `"minimumReleaseAge": "14 days"` in `packageRules` with `automerge`, and in `.npmrc` `min-release-age` / `before` so the package manager waits too; generic `.github/dependabot.yml` with `cooldown: { default-days: 7, semver-major-days: 30 }` and `groups` by `update-types` · Source B37b, B38, B37, B39.

**DEP-04** — Everything the pipeline runs is pinned by hash: GitHub Actions by full SHA, images by digest, development tools by exact version. · How C · criterion S23 · Check: no `uses:` with a tag and no image without `@sha256:`: ``rg -n -P 'uses: [^@]+@(?![0-9a-f]{40})' .github/workflows/`` returns 0; `rg -n '^FROM [^@]+$' Dockerfile*` returns 0. S11 (lockfile) covers the app's dependencies, not the pipeline · Source B37b, B37, B39.

**DEP-05** — Third-party install scripts do not run by default; the necessary ones are enabled by name. · How C · criterion S11 · Check: installation in CI with scripts disabled and an explicit list of the allowed ones; node-ts `npm ci --ignore-scripts` and then `npm rebuild <pkg>` only for those that need it [NV flags]; in pnpm `onlyBuiltDependencies` [NV]; generic `pip install --only-binary=:all:` when possible [NV] · Source B36.

**DEP-06** — Unused dependencies are removed, and the development ones do not reach the production artifact. · How C · criterion K5 · Check: node-ts `npx knip --dependencies` returns 0 findings [NV flags]; the artifact is built with `npm ci --omit=dev` and a test checks that `vitest`/`typescript` are not in the container's `node_modules`; generic `deptry .` in Python, `go mod tidy && git diff --exit-code go.mod` [NV deptry]. K5 (dead code) does not look at manifests · Source B39, B36.

**DEP-08** — An update is read before merging it: changelog or release notes, a license change, new transitive dependencies, and the own tests run with the new version. · How C+J · criterion C3 · Check: the bot's PR passes the whole suite and the license check (LIC-02); the reviewer writes the risk down on majors; node-ts the CI job of the Renovate PR runs `npm test` and the license check · Source B39.

## 3. Licenses (LIC, c)

**The default list** (the repo overrides it in `docs/technical/dependencies.md`; enabling a blocked
license is an `AMB`). It is a conservative starting point, **not legal advice**: the final approval belongs
to whoever holds the legal responsibility. It applies to fonts, icons, images and copied fragments too;
ports carry the license of their origin.

| Group | SPDX identifiers | Why |
|---|---|---|
| **Allowed** | `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `0BSD`, `Unlicense`, `CC0-1.0`, `Zlib`; `OFL-1.1` for fonts | Permissive: they ask only for a notice (Apache-2.0 also the NOTICE and marking changes); ASF category A and Blue Oak Silver/Bronze. They enter `THIRD_PARTY_NOTICES.md` |
| **Review** (a written exception per package and version) | `MPL-2.0`, `LGPL-*`, `EPL-*`; also `GPL-*` only in code that runs on the server and is not distributed, `CC-BY-SA-4.0`, `UNKNOWN`, no license, a declared license different from the found one | Weak copyleft (per file or per library) compatible with proprietary code under conditions; ASF category B |
| **Blocked** | `GPL-*` in anything distributed (the browser bundle included), `AGPL-*`, `SSPL-1.0`, `BUSL-1.1`, `CC-BY-NC-*`, no license, unknown | AGPL: use over the network obliges to offer the source; GPL: the distributed combined work must be GPL; SSPL/BUSL/Commons Clause are not open source (not OSI); NC restricts commercial use |

The distribution context changes the obligations and is declared in the policy: `saas`, `browser-bundle`,
`binary`, `container-delivered`, `on-prem`. Each exception has a row in the repo's license page: package,
version, license, why it is accepted, who approved it, date.

**LIC-01** — The repo has a written, machine-readable license policy: allowed, to review and blocked, by SPDX identifier, with the justification of each group and the product's distribution context. · How C · criterion S12 · Check: the file exists and the LIC-02 check reads it; node-ts `.licensee.json` (or `licenses.policy.json`) at the root plus a page with the justification; generic the same JSON consumed by ScanCode/ORT or an own script [NV]. It completes S12, which used to say “list undefined” · Source B40, B43, B45.

**LIC-02** — A CI check compares the license of each production dependency, the transitive ones included, against the policy, on every PR that touches the lockfile; a result outside the allowed list breaks the build. · How C · criterion S12 · Check: exits non-zero on a license not allowed; node-ts `npx licensee --production --errors-only` with `.licensee.json`, or `npx @lizenz/checker --onlyAllow 'MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause;0BSD;Unlicense;CC0-1.0;Zlib'` (the successor of `license-checker-rseidelsohn`, deprecated in 6.0.0 [V]; inherited flags [NV]); generic `pip-licenses --fail-on 'GPL;AGPL'` [NV], `cargo deny check licenses` [NV], ScanCode for what is vendored · Source B53, B39, B36.

**LIC-03** — A dependency with no declared license, with `UNKNOWN`, with its own text, or with a discrepancy between the declared license and the one found in the files goes to manual review; it is never approved by default. · How C · criterion S12 · Check: the check treats `UNKNOWN`, `UNLICENSED`, `SEE LICENSE IN`, `LicenseRef-*` as a failure; node-ts `npx licensee --production --errors-only` fails for those unless they are in the exceptions; for discrepancies `curl -s https://api.clearlydefined.io/definitions/npm/npmjs/-/<pkg>/<ver> | jq '.licensed.declared, .licensed.facets.core.discovered.expressions'`; generic the same endpoint with `pypi/pypi/-/...`, `maven/mavencentral/...` · Source B40, B52, B36.

**LIC-04** — The obligations depend on how the product is delivered, and that is declared in the policy: server only (SaaS), JavaScript sent to the browser, binary or installable app, container or installer delivered to the customer. · How J · criterion S12 · Check: the policy has a `distribution:` field and the reviewer contrasts it with the deployment; GPL: using a modified version without distributing it does not oblige publishing it; AGPL does oblige over the network [V]; that the JS served to the browser counts as distribution is the usual legal reading [NV] · Source B48, B44.

**LIC-05** — Strong copyleft: AGPL blocked by default in any product with users over the network; GPL blocked in everything distributed (the browser bundle included) and under review in code that only runs on the server. · How C · criterion S12 · Check: the policy plus LIC-02; node-ts `.licensee.json` without `GPL-*` or `AGPL-*` in `spdx`; the development ones (not packaged) are excluded with `--production`; generic the ecosystem's tool with `GPL-2.0-only`, `GPL-3.0-*`, `AGPL-3.0-*` in the failure list · Source B48, B42, B45.

**LIC-06** — Weak copyleft and compatibilities, under review with the rule written: MPL-2.0 allows combining with proprietary code if the modified MPL files are published; LGPL demands allowing the library to be replaced (in practice, dynamic linking) when distributing [NV: LGPL text not opened]; Apache-2.0 is not compatible with GPLv2 and does go into GPLv3. · How J · criterion S12 · Check: each approval stays in the policy as an exception with package, version, reason and date; node-ts in `.licensee.json` `"packages": { "<pkg>": "<=x.y.z" }` with the ADR or entry that justifies it · Source B50, B49, B45.

**LIC-07** — The attribution travels with the artifact: a `THIRD_PARTY_NOTICES.md` generated by command in the build with name, version, license, copyright and license text of each packaged dependency, plus the content of the Apache-2.0 `NOTICE` files; in apps with an interface, reachable from an “About / Licenses” screen. Regenerated together with the SBOM of G3 (item Q11). · How T · criterion S19 · Check: a test over the artifact: the file exists and each production package of the lockfile appears with its license text; Apache packages with a `NOTICE` have it included; node-ts `npx generate-license-file --input package.json --output THIRD_PARTY_NOTICES.md` [NV flags] and `git diff --exit-code THIRD_PARTY_NOTICES.md`, a test that runs `npm ls --omit=dev --all --json` and checks each name in the file; generic `cargo about generate` [NV], `pip-licenses --with-license-file --format=plain-vertical` [NV]. MIT: the notice “in all copies or substantial portions”; BSD-3: the binary reproduces it in the documentation; Apache §4: copy of the license, notices, NOTICE · Source B46, B44, B47.

**LIC-08** — The own `NOTICE` contains only what is legally required and what the `NOTICE` files of packaged Apache-2.0 dependencies require; the MIT/BSD texts go in `THIRD_PARTY_NOTICES.md`, not in `NOTICE`. · How J+C · criterion S19 · Check: a short `NOTICE` with no MIT/BSD text blocks: `rg -n 'Permission is hereby granted|Redistribution and use in source and binary forms' NOTICE` returns 0 · Source B44.

**LIC-09** — OFL fonts can be packaged with the app; the `OFL.txt` goes next to the font files, they are not sold alone, and a modified font (a subset included [NV]) does not use the *Reserved Font Name* without permission. · How C · criterion S12 · Check: every directory with `.woff2/.ttf/.otf` has its license file; node-ts `for d in $(fd -e woff2 -e ttf -e otf -x dirname | sort -u); do ls $d | rg -qi 'ofl|license' || echo "no license: $d"; done`; if the font comes from `@fontsource/*` its license is already in the package and enters through LIC-07 · Source B47.

**LIC-10** — Source-available licenses are not open source: SSPL, BUSL, Commons Clause, “non-commercial” licenses (CC-BY-NC) and any license outside the OSI list are blocked unless there is a written agreement. · How C · criterion S12 · Check: LIC-02 with an allow-list: what is not allowed fails by itself; the blocked ones are enumerated so that the person knows why · Source B41, B45.

**LIC-11** — The license is checked again on every update, not only on adding: a package can change its license between versions. · How C · criterion S12 · Check: LIC-02 runs on every PR that touches the lockfile, the bot's included; node-ts `on: pull_request: paths: ['package-lock.json']` in the check's workflow. Concrete relicensing examples [NV] · Source B39.

**LIC-12** — The repo declares its own license without ambiguity: a `LICENSE` file, an SPDX identifier in the manifest and, if published as open source, a license per file according to REUSE. · How C · criterion none · Check: node-ts `jq -e '.license' package.json` (or `"private": true` if proprietary) and `test -f LICENSE`; if OSS, `reuse lint` [NV]; generic `pyproject.toml` with an SPDX `license = "..."` · Source B51, B40, B20.

**LIC-13** — What is not a package has a registered license too: code copied from the internet, icons, images, datasets and snippets generated from licensed sources; each with origin and license in the repo. · How C+J · criterion S12 · Check: vendored files or third-party assets with an SPDX header or a `.license` next to them; node-ts `REUSE.toml` with `[[annotations]] path = "public/icons/**"` and its `SPDX-License-Identifier`; the license of Stack Overflow content (CC BY-SA) [NV]. The kit's component set carries `templates/components/NOTICES.md` (module ui) · Source B51, B42.

## 4. Notices (d)

`THIRD_PARTY_NOTICES.md` is generated by command (name, version, license and attribution when the
license demands it: Apache's NOTICE, BSD), regenerated together with the SBOM of G3, never edited by
hand; criterion S19 (regenerating leaves `git diff --exit-code THIRD_PARTY_NOTICES.md` at 0).
The shape of the file: a summary table (`<name>@<version>  <SPDX>  <repository URL>`), then per package
the license, origin, copyright lines and full license text, the `NOTICE` of Apache packages under its
own heading, and a font section (family, version, “SIL Open Font License 1.1”, copyright, Reserved Font
Name if it applies, the full OFL text). LIC-07 and LIC-08 are its rules.

## 5. Versioning and releases (VER, e)

SemVer; a single version in the manifest; a git tag per release; the changelog and release notes
generated from Conventional Commits (types in English like the tags; the body in the repo's language;
compatible with `hooks/commit-why.mjs`, which only demands the body); the version exposed by the app
(`/health`, footer or `--version`); the API versioned with a deprecation policy (the `Deprecation` header
is RFC 9745 and `Sunset` is RFC 8594) linked to W8. Criteria V3 and O16. Release tools,
as options: release-please, semantic-release, changesets, git-cliff.

**VER-01** — The version scheme is a written decision: SemVer for what has a public API others consume (libraries, APIs, SDKs); CalVer, or SemVer, for applications with a calendar cycle; with CalVer, the deprecation policy is by time. · How J · criterion O16 · Check: an ADR with the scheme and what counts as the public API; node-ts library → SemVer in `package.json`, web app → `2026.10.1` (`YYYY.M.MICRO`) or SemVer · Source B54, B55.

**VER-02** — The number is decided by evidence, not by intuition: a detected breaking change (API-04) forces a major; `feat` a minor; `fix` a patch; in `0.y.z` the instability is declared. · How C · criterion O16 · Check: the bump computed by the tool (VER-05) is compared with the result of `oasdiff breaking` / `api-extractor`; if there is a breaking change and the bump is not a major, it fails; node-ts `NEXT=$(npx git-cliff --bumped-version)` and if `oasdiff breaking` reports and `NEXT` does not change the major, exit 1 · Source B54, B56.

**VER-03** — A published release is immutable: a tag is not moved, a number is not republished; an error is fixed with a new number. · How C · criterion O16 · Check: tags protected on the host; CI compares the tag's SHA with the one recorded in the release; node-ts a protection rule for `v*` tags (the registry rejecting a repeated version [NV]); generic `git ls-remote --tags origin v1.2.3` equals the published artifact's SHA · Source B54, B59.

**VER-04** — The commits that feed the release follow Conventional Commits, with `!` or `BREAKING CHANGE:` on every breaking change, or the repo's convention; a linter demands it in CI. · How C · criterion V3 · Check: a message linter over the PR's range (or over the title if squashing); node-ts `npx commitlint --from origin/main --to HEAD` with `@commitlint/config-conventional` [NV]; generic the same commitlint through Docker, or `cog check` (cocogitto) [NV]. V3 asked for messages that say what and why, with no format · Source B56.

**VER-05** — A single tool computes version and changelog, chosen by the flow and written in an ADR: a reviewable release PR (release-please), fully automatic publication (semantic-release), intent declared per PR in monorepos (changesets), or only changelog and bump (git-cliff). · How J · criterion none · Check: the ADR names the tool and who approves the publication; node-ts a monorepo with published packages → changesets, a deployed service → release-please (merging the release PR is the human approval); release-please keeps a release PR and does not publish to registries, semantic-release does everything in CI including publishing, git-cliff computes `--bump` and `--bumped-version` · Source B58.

**VER-06** — The changelog is for humans: `Unreleased` on top, version and ISO date per entry, sections Added / Changed / Deprecated / Removed / Fixed / Security, deprecations and breaks explicit with their migration; the tool proposes, a person edits; never a dump of the git log. In the kit the changelog is generated when publishing, never by hand in a card. · How C+J · criterion none · Check: a structure verifiable by grep; node-ts a test parses `CHANGELOG.md` and demands `## [Unreleased]`, headings `## [x.y.z] - YYYY-MM-DD` and only the six sections; generic `rg -n '^### ' CHANGELOG.md | rg -v '(Added|Changed|Deprecated|Removed|Fixed|Security)$'` returns 0 · Source B57, B26.

**VER-07** — Nothing is removed without having been deprecated in at least one earlier minor (or, with CalVer, during the declared term), with a notice in the changelog and, in HTTP APIs, with the headers of API-09. · How C · criterion W8 · Check: every `Removed` entry of a version has an earlier `Deprecated` one with the same name; node-ts a script over `CHANGELOG.md` that crosses the two sections; in code `/** @deprecated since 2.3.0, use X */` (TSDoc) and the ESLint rule `@typescript-eslint/no-deprecated` in internal consumers [NV rule name] · Source B54, B57, B55.

**VER-08** — Trunk-based: short branches to an always releasable trunk; if there are release branches, they are cut late, nobody develops on them, each fix enters the trunk first with its test and is brought with a cherry-pick, and the branch is deleted after tagging. · How C · criterion none · Check: commits of the release branch that are not cherry-picks from the trunk raise an alert: `git cherry-pick -x`; `git log release/2.3 --no-merges --format=%B origin/main.. | rg -c 'cherry picked from commit'` equals the number of commits of the branch · Source B59.

**VER-09** — The app knows which version it is and says it: version, commit SHA and build date are injected in the build (not written by hand) and exposed at an endpoint, in the startup log, in telemetry as `service.version` and, if there is an interface, on an “About” screen. · How T · criterion O16 · Check: a smoke test: `GET /version` returns the SHA of `HEAD` and the manifest's version; node-ts `define: { __APP_VERSION__: JSON.stringify(pkg.version), __GIT_SHA__: JSON.stringify(process.env.GIT_SHA) }` in the bundler and `app.get('/version', () => ({ version: __APP_VERSION__, commit: __GIT_SHA__, builtAt: __BUILT_AT__ }))`; generic `-ldflags "-X main.version=$VERSION"` in Go [NV], `LABEL org.opencontainers.image.version` and `.revision` in the image [NV OCI keys]. Item R7 compares the version the app answers with the manifest's · Source B60.

**VER-10** — A single source of truth for the number: the tag, the manifest, the changelog and what the app exposes coincide. · How T · criterion O16 · Check: in the release job `git describe --tags --exact-match` equals `v$(jq -r .version package.json)` equals the first version of the changelog equals the artifact's `/version`; node-ts `test "v$(node -p "require('./package.json').version")" = "$(git describe --tags --exact-match)"`; generic the same with `pyproject.toml`, `Cargo.toml`, `pom.xml` · Source B54, B58.

**VER-11** — The artifact of a version is built in CI from the tag, and the release is signed or carries verifiable provenance. · How C · criterion S23 · Check: the published artifact has a signature or an attestation; nobody publishes from their machine; node-ts `npm publish --provenance` from GitHub Actions [NV]; generic `cosign sign` over the image, an SLSA attestation [NV] · Source B37, B54.

## Sources

- B20 — OpenAPI 3.1.0 (`license.identifier` SPDX) — https://spec.openapis.org/oas/v3.1.0.html
- B26 — Stripe, “APIs as infrastructure: future-proofing Stripe with versioning” — https://stripe.com/blog/api-versioning
- B36 — OpenSSF, “Concise Guide for Evaluating Open Source Software” — https://best.openssf.org/Concise-Guide-for-Evaluating-Open-Source-Software
- B37 — OpenSSF Scorecard — https://github.com/ossf/scorecard
- B37b — Renovate: “Upgrade best practices”, “Minimum release age”, security presets — https://docs.renovatebot.com/upgrade-best-practices/ · https://docs.renovatebot.com/key-concepts/minimum-release-age/ · https://docs.renovatebot.com/presets-security/
- B38 — Dependabot options reference — https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference
- B39 — Russ Cox, “Our Software Dependency Problem”, 2019 — https://research.swtch.com/deps
- B40 — SPDX License List — https://spdx.org/licenses/
- B41 — OSI approved licenses — https://opensource.org/licenses
- B42 — choosealicense.com, appendix — https://choosealicense.com/appendix/
- B43 — Blue Oak Council, permissive license list — https://blueoakcouncil.org/list
- B44 — Apache License 2.0 §4 and ASF “Assembling LICENSE and NOTICE” — https://www.apache.org/licenses/LICENSE-2.0 · https://infra.apache.org/licensing-howto.html
- B45 — ASF, “Third-party license policy” (categories A/B/X) — https://www.apache.org/legal/resolved.html
- B46 — MIT and BSD-3-Clause texts (OSI) — https://opensource.org/license/mit · https://opensource.org/license/bsd-3-clause
- B47 — SIL Open Font License 1.1 — https://openfontlicense.org/open-font-license-official-text/
- B48 — GNU, “Frequently Asked Questions about the GNU Licenses” [NV AGPL §13 text and the compatibility list] — https://www.gnu.org/licenses/gpl-faq.html
- B49 — ASF, “GPL compatibility” — https://www.apache.org/licenses/GPL-compatibility.html
- B50 — Mozilla, MPL 2.0 FAQ — https://www.mozilla.org/en-US/MPL/2.0/FAQ/
- B51 — REUSE 3.3 (FSFE) — https://reuse.software/spec-3.3/
- B52 — ClearlyDefined — https://docs.clearlydefined.io/docs/get-involved/using-data
- B53 — License tools (options): licensee, `@lizenz/checker` (successor of license-checker-rseidelsohn), generate-license-file — https://github.com/jslicense/licensee.js · https://github.com/RSeidelsohn/license-checker-rseidelsohn · https://generate-license-file.js.org/docs/intro/getting-started
- B54 — Semantic Versioning 2.0.0 — https://semver.org/
- B55 — CalVer — https://calver.org/
- B56 — Conventional Commits 1.0.0 — https://www.conventionalcommits.org/en/v1.0.0/
- B57 — Keep a Changelog 1.1.0 — https://keepachangelog.com/en/1.1.0/
- B58 — Release tools: release-please, semantic-release, changesets, git-cliff — https://github.com/googleapis/release-please · https://semantic-release.gitbook.io/semantic-release · https://github.com/changesets/changesets · https://git-cliff.org/docs/usage/bump-version
- B59 — trunkbaseddevelopment.com and “Branch for release” — https://trunkbaseddevelopment.com/ · https://trunkbaseddevelopment.com/branch-for-release/
- B60 — OpenTelemetry semantic conventions, `service` resource — https://opentelemetry.io/docs/specs/semconv/resource/service/

## Not verified

- GNU: AGPL §13 and the compatibility list returned HTTP 429 three times; the GPL/AGPL conclusions come from the GNU FAQ, and Apache ↔ GPL from the ASF page. The LGPL replacement requirement and the browser-served JS being distribution are **interpretations not verified**: consult whoever holds the legal responsibility.
- Tools: flags marked [NV] (`--fail-severity`, `--fail-on`, `reuse lint`, `commitlint`, `knip`, `generate-license-file`, `npm publish --provenance`, `api-extractor`).
- FOSSA, TLDRLegal, ScanCode and ORT: named as a reference, not opened.
- Exposing the version outside OpenTelemetry (VER-09): no primary source opened this session.
- Concrete examples of relicensing (LIC-11) and what happens without a license (choosealicense page not opened).
- None of the example commands was run.
