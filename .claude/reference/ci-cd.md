# CI/CD and deployment: rules a card can meet and a reviewer can check

**When it is read:** when the card adds or changes a pipeline, a deploy, a release, a feature
flag, a test gate or a branch protection; and in the first card of a repo, which sets the pipeline up.
**How:** only the sections the card touches, with `Read` and a line range of the heading; never whole.
`card.md` names the rule IDs that apply, and the `builder` receives those IDs and their ranges.
**Providers and tools are options, not obligations:** the examples are GitHub Actions (GHA) and generic;
GitLab CI, Azure Pipelines, Jenkins and Bitbucket Pipelines have equivalents, named where the mechanism
differs; the templates per provider are options in `stacks/`. **[NV] marks guidance not verified**: a
hypothesis, never the only evidence of a `meets`. Out of scope and cited, not repeated: the security of CI
(pins by SHA, token permissions, OIDC, image scanning) in `reference/security.md` SEC-SC-*; infrastructure
and cost in `reference/infrastructure.md` (module infra); load tests in `reference/performance.md`; schema migrations in
`reference/database.md` (module data) DB-MIG-*. The kit works at the level of the card and the pipeline at the level of the
repo: almost all of this is new for it. How each rule is checked: `J` judgment with written evidence, `C` a
command that exits 0 or not, `T` a test or an automated job that fails if the rule breaks. The `rg`
examples assume workflows under `.github/workflows/` or a `.gitlab-ci.yml`. Source numbers `Bn` are in
Sources. None of the example commands was run.

**One source of truth for the verification commands.** The repo's verification commands live once, as
manifest scripts or Makefile/justfile targets with a `verify:` prefix (for example `verify:suite`,
`verify:lint`, `verify:contract`). The plan's `## Verification` lines invoke them and the pipeline invokes
them too (criterion O23); what is the card's own (`mutate <file>`) does not go to the pipeline. `required.mjs`
asks for a `verify:*` command of the plan that no pipeline file invokes, unless `- CI: unchanged — <why>`.

**What runs at which stage.** Commit stage (types, unit tests, linters and the analyzers K2, K3, T11, S3, P12, W8, V3 over
the diff, secrets S9, licenses S12, cycles D3; 10 minutes or less); acceptance (the scenario suite, attacks S1 and S2,
axe, contract W9, migrations against the real engine); pre-release (full load O22, DAST S17, image and IaC
scanning); post-deploy (smoke, health O18, automatic rollback if it fails). Mutation (T3) stays local, per card.

## Rules that are criteria

| Rule | Criterion |
|---|---|
| CI-02, DPL-02 | O1 |
| CI-03, CI-06, DPL-10 | O23 |
| CI-08 | O25 |
| CI-18, CI-AI-03 | O26 |
| CI-19 | T8 |
| CI-23, CI-24 | O27 |
| CI-25 | V7 |
| CI-26 | T11 |
| CD-01, CD-02, DPL-01 | O24 |
| CD-04 | O28 |
| CD-05, DPL-05 | O9 |
| CD-06, CD-07, DPL-03 | O29 |
| CD-10, CD-11, DPL-11 | O30 |
| DPL-04 | P4 |
| DPL-07 | O18 |
| DPL-08 | P7 |
| DPL-12 | D8 |
| CI-AI-01, CI-AI-02, CI-AI-04 | A9 |
| CI-AI-06 | S9 |
| CI-AI-07 | O8 |
| CI-AI-08, CI-AI-09 | A1 |

The rules outside this table are judgment or guidance, with no criterion of their own.

**The anti-cheating rule (criterion A9).** The agent never disables a test, adds `continue-on-error`, or skips
hooks so that the pipeline passes. It is verified by grep over the added lines of the diff: `.skip(`, `.only(`,
`xit(`, `xdescribe(`, `@Disabled`, `@Ignore`, `pytest.mark.skip`, `[Fact(Skip`, `continue-on-error: true`,
`allow_failure: true`, `|| true` in CI files, `--no-verify`, `HUSKY=0`, `SKIP=` of pre-commit, a new `retries:` or
`--retries`. The mechanism is `required.mjs` (a missing item with the file and the line) and `guard-shell.mjs`
(it blocks `git commit --no-verify` and `git push --no-verify`). A legitimate skip exists only with an
`AMB-NN` that names it.

## 1. Principles (CI)

**CI-01** — Integrate to trunk at least once a day: branches of hours, not days; three or fewer active branches; no code freezes. · How C · criterion none · Check: remote branches with commits outside `main` and a last commit older than 24 h: generic `git for-each-ref refs/remotes/origin --format='%(committerdate:unix) %(refname:short)' | awk -v t=$(($(date +%s)-86400)) '$1<t'` crossed with `git branch -r --no-merged origin/main` is empty (or justified); GHA a scheduled job that runs the same and opens a notice · Source B5, B6, B8.

**CI-02** — Everything needed to build, test and deploy lives in the repo: code, tests, schema and migrations, pipeline configuration, runtime and tool versions, deploy scripts. · How C · criterion O1 · Check: a clean clone builds and passes the tests with no manual step: `git clone . /tmp/c && cd /tmp/c && <frozen install> && <build> && <test>`. O1 (node-ts S6) covers starting, not the build or the pipeline · Source B6, B5, B9.

**CI-03** — The pipeline is code: a versioned file in the repo, reviewed like the rest; the provider's UI keeps only secrets, per-environment variables and protections. · How C+J · criterion O23 · Check: the file exists and CODEOWNERS covers the pipeline directory: `ls .github/workflows/*.yml .gitlab-ci.yml azure-pipelines.yml Jenkinsfile bitbucket-pipelines.yml 2>/dev/null`; `rg -n "^\.github/|^\.gitlab-ci" .github/CODEOWNERS CODEOWNERS`. “Classic” Jenkins jobs configured by UI break this rule · Source B6, B9.

**CI-04** — Every push to trunk and every PR triggers the full pipeline of its type, with no manual step. · How C · criterion none · Check: GHA `on: { push: { branches: [main] }, pull_request: {} }`; `rg -n "^on:|pull_request|push:" .github/workflows`. A `paths-ignore` in the workflow that gives the required checks leaves PRs with no check (see CI-24) · Source B6, B5.

**CI-05** — A red trunk is the team's priority: if it is not fixed in minutes, the commit that broke it is reverted; nobody integrates on top of a broken build. · How J · criterion none · Check: the time `main` is red (CD-11); revert as the first action: `git revert <sha>` in a PR of its own, with the pipeline green before retrying the change · Source B2, B5, B6, B10.

**CI-06** — What CI runs can be run locally with the same command: each job calls a script of the repo (`npm run ci:lint`, `make test`), not long logic inline in YAML; the same `verify:*` commands as the plan's Verification. · How C+J · criterion O23 · Check: no `run:` of more than about 5 lines with logic; each pipeline script exists in `package.json`/`Makefile`; GHA `run: npm run ci:test` instead of twenty lines of shell; validate syntax locally with `actionlint` [NV]; GitLab `glab ci lint` [NV]; local GHA execution with `act` [NV], with limits. node-ts C5 detects devDependencies no script uses · Source B5, B6.

## 2. Stages and order

**CI-07** — Order by cost and probability of failing —format/lint → typecheck → unit → build → integration → e2e—, and the expensive starts only if the cheap one passed. · How C · criterion none · Check: the expensive jobs declare a dependency on the cheap ones; GHA `e2e: { needs: [build, unit] }`; GitLab `needs:`; Azure `dependsOn`; Jenkins sequential stages with `parallel` inside · Source B7, B14.

**CI-08** — The commit stage (what blocks the merge of a PR) lasts 10 minutes or less; measure p50 and p90, not one case. · How C · criterion O25 · Check: GHA `gh run list --workflow ci.yml --branch main --limit 50 --json createdAt,updatedAt,conclusion` and compute percentiles; GitLab CI/CD analytics or the pipelines API. The kit measures the card's times, not the pipeline's · Source B5, B6, B2, B10.

**CI-09** — On the PR only fast, deterministic tests run; the slow or non-hermetic (e2e against real services, load, full matrices) goes after the merge, on release or nightly, with an owner who looks at the red. · How J · criterion none · Check: the stage table (the reference pipeline above) says where each suite runs · Source B10.

**CI-10** — Every job has an explicit timeout, adjusted to its real duration (about 2–3× the p90). · How C · criterion none · Check: GHA `timeout-minutes:` per job (the default is 360 min [NV]); `rg -L "timeout-minutes" .github/workflows/*.yml` lists the jobs without one · Source GitLab `timeout`.

**CI-11** — A PR with a new push cancels its old run; a deploy in progress is never cancelled. · How C · criterion none · Check: GHA on PRs `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`; on deploy `concurrency: { group: deploy-prod, cancel-in-progress: false }`; GitLab `interruptible: true` only in jobs that do not deploy; `rg -n -A2 "concurrency" .github/workflows` and the deploy workflows have no `cancel-in-progress: true` · Source B13, B14.

## 3. Speed

**CI-12** — Cache dependencies with a key equal to the lockfile's hash; the pipeline has to pass just the same with an empty cache. · How C+T · criterion none · Check: the key includes the lockfile; a weekly job (or a run with the cache disabled) passes; GHA `actions/setup-node` with `cache: npm`, or `actions/cache` with `key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}`; GitLab `cache: key: files: [package-lock.json]`. Forbidden to cache: test results, the `dist/` of one commit reused in another without a SHA key, `node_modules` with a fixed key, any secret · Source B13, B21, B14.

**CI-13** — Committed lockfile and frozen installation: the build fails if the lockfile does not match the manifest. · How C · criterion none · Check: `npm ci` / `pnpm install --frozen-lockfile` / `yarn install --immutable` / `pip install --require-hashes` / `dotnet restore --locked-mode`; ``rg -n -P "npm install\b|pnpm install(?!.*frozen)|yarn install(?!.*immutable)" .github/workflows`` is empty. node-ts S6 uses `npm ci` · Source B21.

**CI-14** — Parallelize what is independent: jobs separated by type of check, suites split into shards, and matrices only with the combinations that are really supported. · How C · criterion none · Check: the total duration is about the critical path, not the sum of jobs; GHA `strategy: { matrix: { shard: [1,2,3,4] } }` plus `npx playwright test --shard=${{ matrix.shard }}/4`; the version matrix comes from the declared support policy, not “all of them just in case” · Source B7, B13, B14.

**CI-15** — The build is done once and passes between jobs as an artifact with a short retention; later jobs do not rebuild. · How C · criterion none · Check: only one job runs the build and the others download the artifact; GHA `actions/upload-artifact` with `retention-days: 7` → `actions/download-artifact`; GitLab `artifacts: { paths: [dist/], expire_in: 1 week }`. Goes with CD-01 · Source B2, B14.

**CI-16** — In a monorepo, the PR runs only what is affected —based on the last green commit of `main`— and `main` or a nightly job runs everything. · How C+T · criterion none · Check: the dependency graph is declared; the periodic full build detects what the graph does not see; generic `nx affected -t lint test build --base=$LAST_GREEN --head=$SHA`; GitLab `rules: - changes: [packages/api/**]`; in a polyrepo, trigger the consumer repos when a shared library changes. Risk: an undeclared dependency (a file read by path, a shared config) leaves an affected project out · Source B19, B14.

**CI-17** — What repeats between repos or workflows goes to a reusable workflow or template, referenced by an immutable version. · How C · criterion none · Check: GHA `uses: org/ci/.github/workflows/node.yml@<sha>`; GitLab `include: project/ref`; Azure templates; Jenkins shared libraries. Pinning as a security control: SEC-SC-01 · Source B13.

## 4. Reliability

**CI-18** — A flaky test is detected, put in quarantine with an owner, an issue and an expiry date, and leaves quarantine fixed or deleted; it is never silently retried. · How C+T · criterion O26 · Check: every marked test has metadata and an expiry; a job fails if one expired; the report distinguishes *flaky* from *passed*; GHA/generic (Playwright) `retries: process.env.CI ? 1 : 0` **and** a step that fails if the report has `flaky > 0` in new tests, or publishes the list; a quarantine mark with metadata `test.fixme('… @quarantine owner:@ana issue:#123 until:2026-11-01')` and `rg -n "@quarantine" tests | rg -v "owner:.*issue:.*until:"` is empty. The kit's T7 (order and parallel), T8 (ten runs) and the node-ts “stable” (three runs before freezing); inside a card a flaky is “could not run: unstable” · Source B5, B10, B14, B18, B20.

**CI-19** — A new test is stabilized before entering the gate: N repeated runs, in random order and in parallel. · How T · criterion T8 · Check: GHA `npx playwright test --grep @new --repeat-each=10`; Jest `--randomize`; pytest `-p randomly` plus `pytest-repeat` [NV plugin names] · Source B10, B18.

**CI-20** — Hermetic and reproducible build: runtime, package manager, base image and tools pinned; no network during the build except the registry; the same commit gives the same artifact. · How C · criterion none · Check: build twice and compare the hash; generic `.nvmrc`/`.tool-versions`, `"packageManager": "pnpm@9.x.y"` in `package.json`, `FROM node:22.11-bookworm@sha256:…`, `SOURCE_DATE_EPOCH=$(git log -1 --format=%ct)`, then `sha256sum dist.tgz` of two clean builds is equal; GHA `actions/setup-node` with `node-version-file: .nvmrc`, a runner by version (`ubuntu-24.04`), not `ubuntu-latest`, which changes image without notice [NV pace of change]; ``rg -n "node-version:\s*['\"]?(lts|latest|\*)|-latest\b|:latest\b" .github/workflows Dockerfile*`` is empty or justified · Source B9, B17, B21.

**CI-21** — Integration tests run against ephemeral dependencies created by the job (the real engine's container), never against a shared environment. · How C · criterion none · Check: GHA `services: { postgres: { image: postgres:16.4, … } }`; GitLab `services:`; generic Testcontainers; see DB-MIG-10 · Source B10, B6.

**CI-22** — Each PR that changes something visible or deployable may have an ephemeral preview environment, with synthetic data, destroyed when the PR closes. · How C · criterion none · Check: the PR-close workflow deletes the environment; no preview outlives its PR; GHA `on: pull_request: types: [closed]` → a destroy job; GitLab `environment: { name: review/$CI_COMMIT_REF_SLUG, on_stop: stop_review, auto_stop_in: 1 week }` [NV exact syntax] · Source B6.

## 5. Gates

**CI-23** — Protected trunk: a mandatory PR, required checks, an up-to-date branch or a merge queue, no force push or deletion, and no bypass for administrators (the branch protection checklist below). · How C · criterion O27 · Check: GHA `gh api repos/{owner}/{repo}/branches/main/protection` or `gh api repos/{owner}/{repo}/rulesets`; GitLab `glab api projects/:id/protected_branches`. V7 asks that a person approves before merging, as prose · Source B13, B14.

**CI-24** — The required check is a single aggregator job that depends on all the others and fails if one failed or was cancelled; jobs that can be skipped by `paths` or `if` are not required, because **a required check that ends *skipped* or *neutral* counts as approved** (GitHub). · How C+T · criterion O27 · Check: GHA `ci-ok: { if: always(), needs: [lint, typecheck, unit, build, e2e], runs-on: ubuntu-24.04, steps: [ { run: '[[ "${{ contains(needs.*.result, ''failure'') || contains(needs.*.result, ''cancelled'') }}" == "false" ]]' } ] }` and `ci-ok` is the only required check · Source B13.

**CI-25** — Mandatory code review: one approval from someone other than the last pusher, stale approvals dismissed and CODEOWNERS over pipeline, infrastructure and config; the review cannot make daily integration impossible. · How C+J · criterion V7 · Check: GHA `required_approving_review_count ≥ 1`, `dismiss_stale_reviews`, `require_last_push_approval`, `require_code_owner_reviews` in the API's answer · Source B9, B13, B6 (the friction of pre-integration review; Ship / Show / Ask), B5.

**CI-26** — Coverage and mutation over the new lines are a gate; global coverage is information (a trend), not a gate. · How C · criterion T11 · Check: generic `diff-cover coverage.xml --compare-branch origin/main --fail-under 80` [NV]; Sonar with `sonar.qualitygate.wait=true`; mutation over what changed (Stryker `--mutate` with the diff's files, node-ts T1). The kit's T11 (80 % of new lines) and T3 (mutation over the new lines) · Source the kit (Sonar way).

**CI-27** — Manual approval only where it adds information that automation lacks —a regulatory requirement, an irreversible step, a business window—, never between stages that can be automated. · How J · criterion none · Check: every manual approval of the pipeline has written why it exists; GHA `environment: production` with *required reviewers* and the justification in the pipeline README; GitLab `when: manual` plus protected environments · Source B7, B5.

## 6. Delivery (CD)

**CD-01** — Build once, deploy many: the same artifact, identified by digest or hash, goes through every environment; what changes between environments is injected configuration. · How C · criterion O24 · Check: the digest deployed in production equals the one tested in staging; GHA the deploy job receives `image@sha256:…` as the build's output and no deploy job runs `docker build` or `npm run build`: `rg -n "docker build|npm run build" .github/workflows/deploy*.yml` is empty. O2 covers half of the rule · Source B2, B16, B5.

**CD-02** — Each release is immutable and has a unique ID (SHA, semver or both); release = artifact + config, and what was deployed, where and when is recorded. · How C · criterion O24 · Check: immutable tags in the registry; a queryable deployment history (GHA `environment:` deployments, `gh api repos/{o}/{r}/deployments`; GitLab environments and deployments; generic a releases table) · Source B16.

**CD-03** — Promote through environments (for instance staging → production) with the same deploy script, parameterized by environment; production has no procedure of its own. · How J+C · criterion none · Check: a single deploy workflow/template with `environment` as a parameter. O8 forbids changing how it is deployed without the card asking · Source B6, B1.

**CD-04** — Database migrations are a pipeline step, before the app's deploy, and backward compatible with the version in production (expand → migrate → contract in different releases). · How T · criterion O28 · Check: the pipeline runs the migration against a copy/ephemeral database and the tests of the previous version keep passing with the new schema; see DB-MIG-02 · Source DB-MIG-*.

**CD-05** — Decouple deploy from release with feature flags: incomplete code reaches production off; each release toggle has an owner and an expiry, and a test fails if it expired; the tests run with the production config and with all new flags off. · How C+T · criterion O9 · Check: generic a flag registry with `owner` and `expires`; a test that walks the registry and fails if `expires < today` (the “time bomb” of B15). O9 asks that the feature can be turned off or reverted without losing data · Source B15, B6, B8.

**CD-06** — Rollback is redeploying the previous artifact with the same pipeline, in one step, and is tested; the data changes that would prevent it are made with expand/contract. · How T+C · criterion O29 · Check: a periodic rehearsal: deploying N-1 in staging passes the smoke; GHA a `workflow_dispatch` with an input `version` that reuses the deploy job · Source B16, B6, B10.

**CD-07** — After every deploy a smoke runs against the deployed environment (health, served version, a critical route); if it fails, the pipeline fails and triggers the rollback. · How T · criterion O29 · Check: generic `curl -fsS https://$HOST/health && curl -fsS https://$HOST/version | grep -q "$SHA"` · Source B10.

**CD-08** — Deploys to the same environment are serialized and not cancelled halfway. · How C · criterion none · Check: `concurrency: { group: deploy-${{ inputs.env }}, cancel-in-progress: false }`; GitLab `resource_group: production` · Source B13.

**CD-09** — If there are release branches, they are cut just in time from trunk, the fix enters trunk first and is cherry-picked, and the branch is deleted after the release. · How C · criterion none · Check: every commit of `release/*` exists in `main` (`git cherry -v origin/release/x origin/main` with no unexplained `+`) · Source B8, B9.

## 7. Metrics

**CD-10** — Measure the five current DORA metrics from the pipeline's and the incident record's data, not by survey: change lead time, deployment frequency, **failed deployment recovery time** (it replaces the generic MTTR) and change fail rate, and **deployment rework rate** (introduced in the 2024 report, according to DORA's official history; several secondary sources attribute it to 2025: that is their error). · How C · criterion O30 · Check: the source is commits (the start of the lead time), deployments (frequency and the end of the lead time), incidents linked to a deploy (CFR, recovery, rework). Definitions [V]: lead time from the commit in version control to deployed in production; failed deployment recovery time, recovery from a deploy that demands immediate intervention; change fail rate, the proportion of deploys that demand immediate intervention (rollback or hotfix); rework rate, the proportion of unplanned deploys triggered by a production incident. The page publishes no numeric thresholds of clusters. Reliability is not part of the model since 2024 · Source B4.

**CD-11** — Measure the pipeline's health: p50/p90 duration of the commit stage, the time `main` is red and its repair time, the success rate, the flaky rate (runs with a successful retry / runs) and the size of the quarantine. · How C · criterion O30 · Check: a weekly report from the provider's API; thresholds: commit stage 10 min or less (CI-08), flaky under 1 % (B10), quarantine with nothing expired (CI-18) · Source B5, B14, B10.

## 8. Cost

**CD-12** — Optimize minutes in order (cancellation, affected-only, cache, fail fast) before eliminating checks; choose self-hosted runners only with a total-cost calculation. · How J · criterion none · Check: the calculation: minutes/month × price per OS against hardware + maintenance + the self-hosted runner's security (isolation, fork PRs: SEC-*). Linux is about 10× cheaper than macOS per minute (hosted runner pricing, B22: Linux 2 cores US$0.006, Windows US$0.010, macOS US$0.062 per minute); prefer Linux unless the job demands otherwise. It agrees with the kit's rule that no check is removed to save money · Source B22, B14.

## 9. Typical errors of an AI agent with CI (CI-AI)

**CI-AI-01** — Do not disable, skip, delete or weaken a test so that the pipeline passes. · How C · criterion A9 · Check: in the diff ``git diff origin/main... -- '*test*' '*spec*' | rg -n "^\+.*(\.skip\(|\.only\(|xit\(|xdescribe|test\.fixme|@Disabled|@Ignore|pytest\.mark\.skip|t\.Skip\()"`` is empty; no test deleted without the code it tested. T2 is the mechanism (`guard.mjs`) · Source B5.

**CI-AI-02** — Do not hide a failure in the pipeline: no `continue-on-error: true`, `|| true`, `set +e`, `exit 0` on error paths, `allow_failure: true` nor `if: always()` on a step that decides. · How C · criterion A9 · Check: `rg -n "continue-on-error:\s*true|\|\|\s*true|set \+e|allow_failure:\s*true" .github/workflows .gitlab-ci.yml` is empty or has a comment saying why that step is informational · Source B13, B14.

**CI-AI-03** — Do not add blind retries: neither `retry` of steps or jobs, nor `retries` of the test runner without a flaky report; a retry exists only with CI-18. · How C · criterion O26 · Check: `rg -n "retries:|retry:|max_attempts|--retries|nick-fields/retry" .github/workflows .gitlab-ci.yml playwright.config.* jest.config.*`; GitLab `retry:` only for `when: [runner_system_failure, stuck_or_timeout_failure]` [NV exact list], not for `script_failure` · Source B18, B20, B10.

**CI-AI-04** — Do not use `--no-verify` nor skip hooks; and what the hook runs also runs in CI, so skipping it locally skips nothing. · How C · criterion A9 · Check: CI runs the same scripts as the pre-commit (`npm run lint`, `npm run typecheck`); `guard-shell.mjs` blocks `git commit --no-verify` and `git push --no-verify` · Source B6.

**CI-AI-05** — Do not fix a red by touching the cache, the cache key or the matrix: if it fails with an empty cache the bug is in the code or the cache; it is never solved by hiding it. · How T · criterion none · Check: CI-12: the pipeline passes with an empty cache · Source B13, B14.

**CI-AI-06** — No secrets in logs: do not print environment variables (`env`, `printenv`, `set -x` with secrets), do not wrap secrets in JSON, and if one leaks, delete the log and rotate it. · How C · criterion S9 · Check: `rg -n "printenv|^\s*env\s*$|set -x|echo .*\$\{\{\s*secrets\." .github/workflows` is empty; `gitleaks` over the repo. The rest of pipeline security: SEC-*. G4 is the kit's grep of secrets · Source B13.

**CI-AI-07** — Do not change the pipeline, the protections or the required checks so that your change gets in; if the pipeline is wrong, that goes in a PR of its own with review. · How C+J · criterion O8 · Check: a card's diff that touches `.github/workflows/` or `.gitlab-ci.yml` without the card asking for it is rejected; CODEOWNERS over those files (CI-25) · Source B9.

**CI-AI-08** — Do not write a workflow nobody ran: validate the syntax locally, run each script it calls, and declare “could not run” what only runs at the provider. · How C · criterion A1 · Check: `actionlint` [NV] / `glab ci lint` [NV]; the scripts of CI-06 run locally with exit 0. The three states of the kit (passed · failed · could not run) · Source B5.

**CI-AI-09** — Do not declare green a pipeline you did not see finish: the state is read from the run (`gh run watch`, `gh pr checks`), not inferred from the push. · How C · criterion A1 · Check: `gh pr checks <n> --watch` with exit 0, or `glab ci status`. V6: the comment to the client comes only from the output of the validations · Source the kit.

## 10. Deployment planning (DPL)

**DPL-01** — A single immutable artifact (OCI image, package) is built once per commit and promoted between environments; nothing is recompiled per environment. · How C · criterion O24 · Check: the digest deployed in staging equals production's (`docker inspect --format '{{.Id}}'` or the SHA the PaaS shows); node-ts `npm ci` (not `npm install`) with a lockfile in the build, the image tagged with the commit's SHA · Source B16, B9, B1.

**DPL-02** — Dev, staging and production use the same types and versions of services and the same deploy process; the differences in size are declared (the environments table of the Infrastructure section of `system-design.md`). · How J · criterion O1 · Check: the environments table · Source B5.

**DPL-03** — Deploying and going back are one command each, documented and tested: the rollback is exercised at least once before depending on it. · How T+J · criterion O29 · Check: a record of a real or rehearsed rollback (version N → N-1 → N) with the time measured; `fly releases` plus `fly deploy --image <previous>`; Kubernetes `kubectl rollout undo`; a PaaS's “redeploy” of the previous deploy [NV exact commands]. O9 covers “without losing data”, not the rehearsal · Source B23, B24, B4.

**DPL-04** — Schema changes separated from the app's deploy and backward compatible (expand/contract), so that the app's rollback does not need the database's. · How C · criterion P4 · Check: `squawk` over migrations; a test of the app's version N-1 against schema N; see DB-MIG-02 in `reference/database.md` (module data) · Source B23, B24.

**DPL-05** — What is new and risky goes out behind a feature flag with an owner and an expiry date; a test fails when the flag expires. · How T · criterion O9 · Check: a test reads the flag registry and fails if `expires < today`; node-ts `flags.ts` with `{ name, owner, expires: '2026-12-01' }` and `test('no flag past its expiry', …)` · Source B15.

**DPL-06** — If the traffic justifies it, release as a canary or blue-green with advance criteria written in SLIs (error rate, p95/p99 latency) comparing canary against control and against the SLO; one canary at a time. · How J · criterion none · Check: the release plan says: initial percentage, minimum duration, metrics, thresholds and who/what reverts. A small team with no traffic to compare: blue-green or a direct deploy with a rehearsed rollback (DPL-03) is proportionate · Source B21, B24, B23.

**DPL-07** — Separate health checks: *liveness* (the process answers) and *readiness* (it can serve: critical dependencies reachable); the orchestrator or the PaaS uses them so as not to route traffic to an instance that is not ready. · How T · criterion O18 · Check: `GET /health` is 200 without touching dependencies; `GET /ready` is 503 with the database down (a test with the database stopped); O4 (clean shutdown) is the counterpart; startup was not covered · Source B26, B5.

**DPL-08** — Backups with RPO and RTO written, derived from the requirement, and a restore tested with the time measured; replication is not backup. · How T · criterion P7 · Check: a restore job or rehearsal with a validation query and a duration at most the RTO; see DB-OPS-05 · Source B27.

**DPL-09** — Choose the cheapest DR strategy that meets the RTO/RPO (backup & restore → pilot light → warm standby → multi-site) and write why not the previous one. · How J · criterion none · Check: one line in the Reliability part of the Infrastructure section · Source B27.

**DPL-10** — Deployment is automatic from CI after the tests pass; nobody deploys to production from their machine. · How C · criterion O23 · Check: a CI workflow with the deploy step; production credentials only in CI · Source B9, B20.

**DPL-11** — Measure the five DORA metrics of the service (even by hand per month) and use *failed deployment recovery time* instead of a generic MTTR. · How J · criterion O30 · Check: a monthly table in the operations README or the board · Source B4.

**DPL-12** — Every external dependency has a timeout, a retry with a growing wait only if idempotent, and a behavior on failure (circuit breaker, degradation or a controlled error). · How T · criterion D8 · Check: a test with the dependency that does not answer: the request ends before the declared timeout with a controlled error; the matrix per dependency is in `system-design.md`. D8, E8, E9 · Source B26, B22.

**DPL-13** — Small and frequent changes: one card = one reversible deploy; if a card needs several steps (expand, migrate, contract), each step is deployable alone. · How J · criterion none · Check: the plan numbers the deploys. R7 (every hunk corresponds to the card) is partial · Source B20, B9.

## The flaky test policy

1. **Definition.** A flaky test is one that gives different results with the same code. It is detected by: a retry that passes (the report marks it `flaky`, never `passed`), repeated runs, or failures on `main` that do not reproduce.
2. **Retries.** At most 1, only in CI, and only if the report publishes the list of flaky tests. A new test with a successful retry **does not enter**: it is stabilized first (CI-19).
3. **Quarantine.** Whoever detects it opens the issue and marks the test in the same PR: `@quarantine owner:<person or team> issue:<link> until:<date, 14 days or less>`. The test keeps running in a non-blocking job to gather evidence; it is not deleted.
4. **Owner.** The owner of the code under test, not whoever detected it. Without an owner there is no quarantine: it is fixed or the change that introduced it is reverted.
5. **Term.** On expiry, a job on `main` fails. Options: fixed (it leaves quarantine with 10 green runs, as the kit's T8), deleted with a replacement that covers the same behavior, or extended **once**, with the reason written in the issue.
6. **Cap.** If the quarantine exceeds 1 % of the tests or `main`'s flaky rate exceeds 1 % (B10), the owning team's feature work stops until it is lowered.
7. **Cause.** The cause of each fix is recorded (order, time, network, concurrency, shared data, environment). A flaky can also be a real bug of the product: it is investigated before blaming the test [NV: the 17 % figure the kit cites in T8].
8. **Metric.** Weekly flaky rate, quarantine size and expired ones: in the CD-11 report.

## The branch protection checklist (trunk)

- A PR is mandatory for every change to `main`; direct push disabled.
- A single required check, `ci-ok`, the aggregator of all the jobs (CI-24).
- Branch up to date with the base before the merge (strict mode) or a merge queue / merge train.
- At least 1 approval; approvals dismissed with new commits; an approval from someone other than the last pusher.
- CODEOWNERS mandatory for `.github/`, `.gitlab-ci.yml`, infrastructure, migrations and config.
- Conversations resolved before the merge.
- Linear history (squash or rebase), if the team uses it to revert whole commits.
- Force push and deletion disabled.
- No bypass for administrators or apps (or an audited bypass, for emergencies only).
- A successful staging deploy required before the merge, if the flow uses it.
- Commit signatures and tag/release rules: SEC-SC-*.
- Verification by command: `gh api repos/{o}/{r}/branches/main/protection` and `gh api repos/{o}/{r}/rulesets` saved as evidence; GitLab `glab api projects/:id/protected_branches`.

## Sources

- B1 — Jez Humble and David Farley, *Continuous Delivery*, Addison-Wesley, 2010 [NV chapter content] — https://martinfowler.com/books/continuousDelivery.html
- B2 — continuousdelivery.com, “Principles” and “Patterns” — https://continuousdelivery.com/principles/ · https://continuousdelivery.com/implementing/patterns/
- B3 — Forsgren, Humble, Kim, *Accelerate*, 2018 [NV the original metrics and capabilities] — https://itrevolution.com/product/accelerate/
- B4 — DORA, “DORA's software delivery metrics” and “A history of DORA's software delivery metrics” — https://dora.dev/guides/dora-metrics/ · https://dora.dev/insights/dora-metrics-history/
- B5 — DORA capabilities: “Continuous integration”, “Trunk-based development”, “Test automation” — https://dora.dev/capabilities/continuous-integration/ · https://dora.dev/capabilities/trunk-based-development/ · https://dora.dev/capabilities/test-automation/
- B6 — Martin Fowler, “Continuous Integration”, revised 2024 — https://martinfowler.com/articles/continuousIntegration.html
- B7 — Martin Fowler, “Deployment Pipeline”, 2013 — https://martinfowler.com/bliki/DeploymentPipeline.html
- B8 — Paul Hammant et al., trunkbaseddevelopment.com — https://trunkbaseddevelopment.com/
- B9 — Google SRE Book, ch. 8 “Release Engineering” — https://sre.google/sre-book/release-engineering/
- B10 — *Software Engineering at Google*, ch. 11, 14 and 23 — https://abseil.io/resources/swe-book/html/ch11.html · https://abseil.io/resources/swe-book/html/ch14.html · https://abseil.io/resources/swe-book/html/ch23.html
- B11 — Kim, Humble, Debois, Willis, Forsgren, *The DevOps Handbook*, 2nd ed., 2021 [NV content] — https://itrevolution.com/product/the-devops-handbook-second-edition/
- B12 — David Farley, *Modern Software Engineering*, 2021 [NV chapter detail] — https://www.informit.com/store/modern-software-engineering-doing-what-works-to-build-9780137314911
- B13 — GitHub Actions documentation and protected branches — https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching · https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- B14 — GitLab CI documentation: pipeline efficiency, merge trains, unit test reports, unhealthy tests — https://docs.gitlab.com/ci/pipelines/pipeline_efficiency/ · https://docs.gitlab.com/ci/pipelines/merge_trains/ · https://docs.gitlab.com/development/testing_guide/unhealthy_tests/
- B15 — Pete Hodgson, “Feature Toggles (aka Feature Flags)”, 2017 — https://martinfowler.com/articles/feature-toggles.html
- B16 — The Twelve-Factor App, factor V “Build, release, run” — https://12factor.net/build-release-run
- B17 — Reproducible Builds, “Definitions” — https://reproducible-builds.org/docs/definition/
- B18 — John Micco, “Flaky Tests at Google and How We Mitigate Them”, 2016 [NV body] — https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html
- B19 — Nx, “Run only tasks affected by a PR” — https://nx.dev/docs/features/ci-features/affected
- B20 — Playwright, “Retries” — https://playwright.dev/docs/test-retries
- B21 — `actions/setup-node`, README — https://github.com/actions/setup-node
- B22 — GitHub, “Actions runner pricing” — https://docs.github.com/en/billing/reference/actions-runner-pricing
- B23 — Martin Fowler, “BlueGreenDeployment” — https://martinfowler.com/bliki/BlueGreenDeployment.html
- B24 — Danilo Sato, “CanaryRelease”, 2014 — https://martinfowler.com/bliki/CanaryRelease.html
- B26 — Michael Nygard, *Release It!*, 2nd ed. (index; content [NV]) — https://pragprog.com/titles/mnee2/release-it-second-edition/
- B27 — AWS, “Disaster Recovery of Workloads on AWS” — https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html

## Not verified

- The inner content of *Continuous Delivery*, *Accelerate*, *The DevOps Handbook* and *Modern Software Engineering*: records were verified; what is practical of Humble and Farley was verified in continuousdelivery.com. The four original metrics and 24 capabilities of *Accelerate*, the finding on external approvals, and the Three Ways with the andon cord: [NV].
- The 2025 DORA report: the title was verified; the seven archetypes and the replacement of the performance levels only in secondary sources. The date of rework rate (2024) comes from DORA's official history and contradicts several secondary sources that say 2025.
- The body of “Flaky Tests at Google” (2016) did not open; the 84 % comes from the search excerpt, the 1.5 % and the 16 % from secondary sources.
- GitLab's quarantine policy (metadata, terms): it asked for authentication.
- Syntax not opened: `actionlint`, `act`, `glab ci lint`, `diff-cover`, pytest plugins, GitLab's `auto_stop_in`/`on_stop`, GitLab's `retry:` conditions, Turborepo/Bazel affected, the 360 min default of `timeout-minutes`, the pace of change of `ubuntu-latest`.
- GitHub's included minutes per plan and the current state of the self-hosted runner charge (postponed in December 2025, no later news found).
- None of the example commands was run: they are syntax to validate on first use.
