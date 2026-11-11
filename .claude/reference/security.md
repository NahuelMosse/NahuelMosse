# Security and secrets handling: rules a card can meet and a reviewer can check

**When it is read:** when the card adds or changes a route, an integration, an upload, a
role, a secret, a personal datum, a dependency, a Dockerfile or a pipeline; and when a security
incident has to be written up. **How:** only the sections the card touches, with `Read` and a line
range of the heading; never whole. `card.md` names the rule IDs that apply, and the `builder`
receives those IDs and their ranges. **Products are options, not obligations:** when a rule leans on one (GitHub, AWS, Azure, GCP,
Vault) it is named as one of the options and the rule is written over the capability. **[NV] marks
guidance not verified**: a hypothesis, never the only evidence of a `meets`.

**What this reference does not repeat.** The kit already covers S1–S17, D10, E8, the ASVS 5.0 matrix at
levels 1 and 2 per card (`templates/asvs-level-1.md`, `templates/asvs-level-2.md`, module security-l2), Semgrep (S3), ZAP
baseline (S17), secret search over code and history (S9) and SBOM plus `npm audit` (S10, S11).
Where a rule touches one of those it says what it adds. Three ASVS requirements that are level 3 enter
as kit criteria, not as an L3 obligation: V13.3.4 (secrets that expire and rotate as documented, in
SEC-SECR-06), V14.2.7 (retention classification and automatic deletion, in SEC-DAT-05) and V15.2.4
(dependency confusion, in SEC-SC-10). The templates that go with the rules live in
`templates/system-design.md` (threat model, secrets inventory, personal data inventory) and
`templates/runbook.md` (module infra; rotation and revocation, security incident response). How each rule is checked:
`J` judgment with written evidence, `C` a command that exits 0 or not, `T` an automated test, `A` an
attack or probe against the running app. The `node-ts` examples assume code under `src/`, workflows under
`.github/workflows/` and a `Dockerfile` at the root; the `generic` ones hold for any stack. None of the
commands was run: they are syntax to validate on first use, and several `-P` regexes need `rg` with PCRE2.
Source numbers `Bn` are in Sources.

**Data-protection norm:** the one the product falls under, named in `system-design.md` (GDPR, Ley 25.326 in Argentina, LGPD…). What a site must show for it (privacy page, cookies before consent, consumer buttons, email) is `legal.md`.
The Argentine references below are one example.

## Rules that are criteria

| Rule | Criterion |
|---|---|
| SEC-TM-01, SEC-TM-02, SEC-TM-03, SEC-TM-04 | S21 |
| SEC-SECR-01, SEC-SECR-02, SEC-SECR-04, SEC-SECR-05, SEC-SECR-06, SEC-SECR-07, SEC-SECR-08, SEC-SECR-09, SEC-SECR-12 | S22 |
| SEC-SECR-03, SEC-SECR-11, SEC-AI-01 | S9 |
| SEC-SECR-10, SEC-AI-10 | P2 |
| SEC-AUTH-02, SEC-AUTH-03, SEC-AI-09 | S13 |
| SEC-AUTH-04, SEC-RT-02, SEC-RT-03, SEC-RT-04, SEC-AI-02 | S24 |
| SEC-AUTH-06 | S1 |
| SEC-AUTH-07 | D10 |
| SEC-AZ-01, SEC-AZ-02, SEC-AZ-03, SEC-AZ-04, SEC-AZ-05, SEC-AI-05 | S5 |
| SEC-DAT-02, SEC-DAT-03, SEC-DAT-09 | P15 |
| SEC-DAT-04, SEC-DAT-07 | P1 |
| SEC-DAT-05, SEC-DAT-06 | P7 |
| SEC-SC-01, SEC-SC-02, SEC-SC-03, SEC-SC-05, SEC-SC-06, SEC-SC-07 | S23 |
| SEC-SC-04 | O27 |
| SEC-SC-08, SEC-SC-09 | S11 |
| SEC-SC-10, SEC-AI-08 | S10 |
| SEC-RT-01 | S7 |
| SEC-RT-06 | O2 |
| SEC-RT-07 | E6 |
| SEC-IR-01 | S14 |
| SEC-IR-03, SEC-IR-04 | W5 |
| SEC-IR-05 | S16 |
| SEC-AI-06, SEC-AI-11, SEC-LLM-01 | S3 |
| SEC-LLM-02, SEC-LLM-03, SEC-LLM-04, SEC-LLM-05, SEC-LLM-06 | A8 |

The rules outside this table are judgment or guidance, with no criterion of their own.

## 1. Threat modeling (TM)

**SEC-TM-01** — Make a lightweight threat model in the first card of a repo, and update it when the card adds a component, a data store, an external integration, a role, or an exposed surface (public route, webhook, upload, queue). · How J+C · criterion S21 · Check: the card's plan says whether it touched the surface and, if it did, the diff includes `system-design.md`; generic `git diff --name-only main... | rg -q "system-design.md" || echo "no model"`; triggers by diff: `git diff main... --name-only | rg "routes?/|webhook|upload|migrations/|Dockerfile|\.github/workflows/"`. S15 asks for the ASVS matrix, a list of controls; it does not ask what can go wrong in this design · Source B17, B18, B3, B19 [NV task ID].

**SEC-TM-02** — Write it on one page, in `system-design.md`, with the four questions: what we build (flow diagram with trust boundaries), what can go wrong (STRIDE for every flow that crosses a boundary), what we do (mitigate / eliminate / transfer / accept, with an owner), and whether it was enough (how each mitigation is tested). · How J · criterion S21 · Check: the reviewer checks that each `mitigate` threat names the test or command that verifies it, and each `accept` has an owner and a reason; `rg -c "^\| T-" system-design.md` is above 0 · Source B17, B18.

**SEC-TM-03** — Each mitigated threat has a verifiable requirement that enters the card as a scenario or as a row of the ASVS matrix. · How C · criterion S21 · Check: the `T-NN` IDs of the model appear in tests or in the matrix: `for t in $(rg -o "T-[0-9]+" system-design.md | sort -u); do rg -q "$t" specs/ || echo "$t unverified"; done` · Source B17.

**SEC-TM-04** — Do not make the model once and for all nor delegate it to one person: it is reviewed in the card that changes the surface, not in an annual workshop. · How J · criterion S21 · Check: `git log --format=%ad -1 -- system-design.md` is more recent than the last surface change · Source B17 (the Manifesto: *Hero Threat Modeler*, continuous refinement).

## 2. Secrets: lifecycle (SECR)

**SEC-SECR-01** — Keep an inventory of secrets: each with purpose, consumer, owner, where it lives per environment, privileges, creation date, rotation frequency and last rotation. No values. · How C+J · criterion S22 · Check: every sensitive variable used in the code is in the inventory; node-ts `rg -o "process\.env\.([A-Z0-9_]+)" -r '$1' src/ | sort -u > /tmp/used; rg -o "^\| ([A-Z0-9_]+) \|" -r '$1' docs/technical/system-design.md | sort -u > /tmp/inv; comm -23 /tmp/used /tmp/inv` is empty; generic the same with `os.environ`, `Environment.GetEnvironmentVariable`, `System.getenv`. S9 detects written secrets; nothing demanded knowing which ones exist · Source B4, B11, B31.

**SEC-SECR-02** — Outside the local machine, each environment reads its secrets from a secrets manager (Vault/OpenBao, AWS Secrets Manager, Azure Key Vault, GCP Secret Manager, Doppler, 1Password, Infisical, or the orchestrator's one encrypted at rest), with a separate store or space per environment; production and development never share a secret. · How C+J · criterion S22 · Check: no production secret appears in config files of the repo nor in CI variables of a non-production environment; generic `rg -n -i "(prod|production).*(key|secret|password|token)\s*[:=]" --glob "!*.example" .` is empty; review the secret names per environment in the manager's console · Source B1 (V13.3.1), B4, B31.

**SEC-SECR-03** — No secret in the repo, the history, the image or the bundle: not in `ARG`/`ENV` of the Dockerfile, intermediate layers, source maps or the frontend's `NEXT_PUBLIC_`/`VITE_` variables. · How C · criterion S9 · Check: node-ts `npm run build && gitleaks dir dist/` and `rg -n "(NEXT_PUBLIC|VITE|REACT_APP)_[A-Z_]*(SECRET|KEY|TOKEN|PASSWORD)" .` are empty; generic `docker build -t app:scan . && trivy image --scanners secret app:scan`; `rg -n "^(ARG|ENV) .*(SECRET|TOKEN|PASSWORD|KEY)" Dockerfile` is empty (use `RUN --mount=type=secret`). G4 looks at code and history; this adds the **image and the built artifact** · Source B1, B11, B15.

**SEC-SECR-04** — `.env` only on the local machine, ignored by git, with a versioned `.env.example` that lists every key with fictitious values. · How C · criterion S22 · Check: `git check-ignore -q .env && test -f .env.example && ! git ls-files --error-unmatch .env 2>/dev/null`; same keys: `diff <(rg -o "^[A-Z0-9_]+" .env.example | sort) <(rg -o "^[A-Z0-9_]+" .env | sort)`; node-ts also: the app fails at startup if a required variable is missing (config schema validation with a test) · Source B28, B4.

**SEC-SECR-05** — Hand the secrets to the app the way the manager recommends: read through an API/SDK or a read-only mounted volume; if environment variables are used, they are never printed (debug endpoints, `/env`, error dumps, `printenv` in CI). · How J+C · criterion S22 · Check: node-ts ``rg -n -P "JSON\.stringify\(process\.env|console\.(log|error)\(.*process\.env" src/`` is empty; generic `rg -n "printenv|set -x" .github/workflows/` reviewed. The sources disagree: 12-Factor recommends env, GCP and the Kubernetes guidance discourage it for secrets; the intersection is taken: env is fine if it is not dumped · Source B31, B15, B28.

**SEC-SECR-06** — Rotate each secret with a frequency written in the inventory according to its risk, automated when the manager allows it, and with two valid credentials during the change so service is not cut. Users' passwords do not rotate by calendar (SEC-AUTH-02). · How C+J · criterion S22 · Check: a script compares `last rotation + frequency` with today for every row of the inventory and exits non-zero if one is due; AWS `aws secretsmanager describe-secret --secret-id X --query '[RotationEnabled,LastRotatedDate]'` [NV syntax]; Azure near-expiry alerts through Event Grid. There is no universal number: 60–90 days is Azure's example, not a standard · Source B4, B1 (V13.3.4, level 3), B11, B31.

**SEC-SECR-07** — Prefer credentials that do not need rotating: workload identities and OIDC (CI to the cloud, app to the database) before long-lived keys; dynamic credentials with a TTL when the manager supports them. · How C · criterion S22 · Check: `rg -n "AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AZURE_CLIENT_SECRET|GOOGLE_APPLICATION_CREDENTIALS|credentials_json" .github/workflows/` is empty; the deploy job has `id-token: write` and the provider's official action with a role, not keys · Source B22, B31, B29, B4.

**SEC-SECR-08** — Each secret gives the least privilege its consumer needs: one per service and per purpose (never the admin credential in the app), with read permission per secret and not per whole vault. · How J+C · criterion S22 · Check: review the IAM policy of each secret; `rg -n "(root|admin|sa|postgres):[^@]*@" .env.example src/` is empty · Source B1 (V13.3.2), B4, B31, B11, B9.

**SEC-SECR-09** — On a leak, run the procedure in this order: revoke → issue a replacement → deploy → verify the old one fails → clean the place of the leak → review the secret's use in the exposed window → record. Revoke everything exposed in the same operation; deleting the commit or restarting the app revokes nothing. · How J+T · criterion S22 · Check: a drill rotating a staging secret following the rotation section of `templates/runbook.md` (module infra), measuring the time; revocation check: call the service with the old value and expect 401/403. Evidence: the Trivy/trivy-action incident of March 2026 (GHSA-69fq-xp46-6x23 / CVE-2026-33634) came from a **non-atomic** credential rotation after an earlier incident [V, advisory summary] · Source B4, B11, B38.

**SEC-SECR-10** — No secrets in logs, error messages, traces, spans or URLs: redaction in the logger by field name and by pattern, and a test that proves it. · How T+C · criterion P2 · Check: node-ts a test that logs an object with `password`, `authorization`, `token`, `cookie`, `apiKey` and asserts the output has `[REDACTED]` (the logger's `redact` option); `rg -n "console\.(log|error)\(.*(req\.headers|token|password|secret)" src/` is empty; `rg -n "[?&](token|api_key|apikey|password)=" src/` is empty; generic: run the suite at `debug` level and `gitleaks dir ./logs` is empty. S14 says “no personal data”; this adds **secrets and tokens** and demands a test · Source B4, B12, B13, B7.

**SEC-SECR-11** — Detect secrets before the commit (a pre-commit hook) and in CI; do not wait for the review. · How C · criterion S9 · Check: generic `.pre-commit-config.yaml` with the gitleaks repo pinned to a tag and `pre-commit install`; CI `gitleaks git --log-opts="origin/main..HEAD"`; node-ts the same, or a husky hook calling `gitleaks git --staged` [NV flag in v8.19+]. G4 runs at the close; this moves it to the commit, where the damage is avoided. gitleaks is in security-patches-only mode and its author moves to Betterleaks [V]: evaluate a second detector (B4 suggests more than one); Betterleaks and trufflehog are the options in `stacks/` · Source B4, B16, B39.

**SEC-SECR-12** — Turn on the forge's push protection (in GitHub: push protection at repository or organization level, with delegated bypass) and treat each bypass as an incident to review. · How C · criterion S22 · Check: `gh api repos/{owner}/{repo} --jq '.security_and_analysis.secret_scanning_push_protection.status'` is `enabled` [NV exact field path]; GitLab and Bitbucket have equivalents [NV]. The user-level protection covers only public repos; in a private repo it has to be turned on · Source B22.

## 3. Authentication and session (AUTH)

**SEC-AUTH-01** — Require MFA for privileged accounts and offer it to all; at login (API and mobile too), to change password or email, to disable MFA and to raise privileges. Prefer passkeys/WebAuthn or TOTP; SMS only if there is no other option and never with PII or financial data. · How T+J · criterion none · Check: a test: an admin without a second factor does not reach admin routes; changing the email without re-authenticating gives 401/403 · Source B6, B5.

**SEC-AUTH-02** — Passwords per NIST 800-63B-4: at least 15 (8 if part of MFA), accept at least 64, no composition rules, no periodic rotation, a check against a compromised list, no hints or security questions, no truncation. · How T · criterion S13 · Check: node-ts registration tests: `"a".repeat(14)` rejected without MFA, 64 characters accepted, `password123456789` rejected by the blocklist, no response asks for upper case or symbols · Source B20, B5.

**SEC-AUTH-03** — Hash with Argon2id (m≥19 MiB, t≥2, p=1); scrypt (N=2^17, r=8) if there is no Argon2; bcrypt (cost ≥10, the 72-byte limit rejected explicitly) only in legacy; PBKDF2-SHA256 600,000 iterations if FIPS is required. · How C+T · criterion S13 · Check: node-ts ``rg -n -i "createHash\(['\"](md5|sha1|sha256)['\"]\).*(password|pass)" src/`` is empty; a test reads the stored hash and checks the prefix `$argon2id$v=19$m=19456,t=2,p=1` or higher · Source B8.

**SEC-AUTH-04** — Limit attempts per account (not only per IP) with a threshold, a window and a lock or an exponential delay, without the lock serving to deny service; the ceiling of consecutive failures comes from the threat model. · How T · criterion S24 · Check: node-ts a test makes N+1 failed logins to the same account from different client addresses, with a counter per account that does not rely on `X-Forwarded-For`, and expects 429 or a delay; the legitimate user can recover through the forgot flow · Source B5, B20.

**SEC-AUTH-05** — Login, signup and recovery answer the same —same message, same code, similar time— whether the account exists or not. · How T · criterion none · Check: a test compares body and status of “user does not exist” against “wrong password”; measure that the non-existent path also runs the hash · Source B5.

**SEC-AUTH-06** — A `__Host-` session cookie with `Secure; HttpOnly; SameSite=Lax|Strict; Path=/`, no `Domain`; a new ID after login and after a privilege change; inactivity and absolute expiry enforced on the server; logout invalidates on the server. · How T · criterion S1 · Check: node-ts an e2e test: the login's `Set-Cookie` matches `/^__Host-[^=]+=.*;\s*Secure.*HttpOnly.*SameSite=(Lax|Strict)/i`; the ID changes before/after login; after logout, reusing the old cookie gives 401; generic `curl -si -X POST .../login -d … | rg -i "^set-cookie"`. S1 attacks CSRF; this fixes attributes and lifecycle · Source B7.

**SEC-AUTH-07** — No session or access tokens in `localStorage`/`sessionStorage`. · How C · criterion D10 · Check: node-ts `rg -n -i "(localStorage|sessionStorage)\.setItem\(.*(token|jwt|session|auth)" src/` is empty · Source B7, B1 (V14.3.3).

**SEC-AUTH-08** — JWT: always verify with `verify` and a fixed list of algorithms; validate `iss`, `aud`, `exp` (and `nbf`); do not take the key from the header; an HMAC secret of at least 256 bits generated with a CSPRNG; a short access-token life and revocation by `jti`/session or a rotating refresh; nothing sensitive in the claims. · How C+T · criterion none · Check: node-ts `rg -n "jwt\.decode\(|jwtDecode\(" src/ --glob "!**/*.test.*"` is empty outside the UI; `rg -n "jwt\.verify\([^)]*\)" src/ | rg -v "algorithms"` is empty; a test with an `alg:none` token, one signed with another key, an expired one and one with a foreign `aud`: all four give 401. ASVS V9 is in the matrix; this makes it command plus test · Source B9, B13, B39.

**SEC-AUTH-09** — Re-authenticate before sensitive actions (changing password, email, MFA, billing data, exporting personal data). · How T · criterion none · Check: a test: the action with a valid session but without the current password is rejected · Source B5, B6.

## 4. Authorization (AZ)

**SEC-AZ-01** — Deny by default: every route requires authentication and an explicit policy; the public ones are in a named allow-list. · How T+C · criterion S5 · Check: node-ts a test enumerates the routes registered in the router and calls each without credentials: only those of the allow-list answer other than 401/403; generic the same with the framework's route listing (`rails routes`, `php artisan route:list`, OpenAPI). S5 asks for a check on every route “in prose”; this makes it a test that walks all of them · Source B10, B2 (A01).

**SEC-AZ-02** — Check the permission over the object on every access by ID (IDOR): the query filters by owner/tenant, not only by ID; an unguessable ID does not replace the check. · How T · criterion S5 · Check: node-ts a test with two users: A creates a resource; B does GET/PUT/DELETE with A's ID and gets 403/404 on the three. S5 already asks “tested with another user”; this adds the **three verbs** and the list (B does not see A in `GET /resources`) · Source B10.

**SEC-AZ-03** — Multi-tenant: the tenant comes from the session, never from the body/query; all data access goes through a layer that injects the tenant filter (or Row-Level Security in the database). · How C+T · criterion S5 · Check: node-ts `rg -n "(req\.(body|query|params)\.(tenantId|orgId|companyId))" src/` is empty; a cross-tenant test as SEC-AZ-02; generic (PG) `SELECT relname FROM pg_class WHERE relrowsecurity = false AND relname IN (<tables with tenant_id>);` is empty if RLS was chosen · Source B10 (ABAC/ReBAC) [NV RLS as a mechanism this session].

**SEC-AZ-04** — Authorization decisions live in one place (middleware/policy) and fail closed: an exception in the check is a 403, not a pass. · How T · criterion S5 · Check: a test forces an error in the permissions provider (a mock that throws) and expects 403/500 with no data. A10:2025 has no criterion of its own · Source B10, B2 (A10).

**SEC-AZ-05** — Mass assignment: the server accepts only the allowed fields; `role`, `isAdmin`, `ownerId`, `tenantId`, `price` never come from the client. · How T+C · criterion S5 · Check: node-ts `rg -n "\.(create|update|save)\(\s*req\.body\s*\)" src/` is empty; a test sends `{"role":"admin"}` and checks it did not change · Source B10, B13 [NV the name “mass assignment” this session].

## 5. Data (DAT)

**SEC-DAT-01** — TLS on all transit, internal too (app↔database, app↔queue, service↔service): TLS 1.3 by default, 1.2 accepted, 1.0/1.1 off; HSTS on what is public; certificate verified in the client. · How C · criterion none · Check: generic `testssl.sh https://host` or `nmap --script ssl-enum-ciphers -p 443 host` [NV tools]; `curl -sI https://host | rg -i strict-transport-security`; node-ts the database connection string with verification (`sslmode=verify-full` in PG). S7 covers CSP/nosniff, not HSTS or the TLS version · Source B14, B13, B1 (V12).

**SEC-DAT-02** — Encryption at rest of disks, databases, buckets and backups, with keys in a KMS separate from the data; the most sensitive fields (document, health, bank account) with application/column-level encryption and envelope encryption. · How C+J · criterion P15 · Check: generic IaC `checkov -d infra/ --framework terraform` (storage/database encryption checks) [command V, check IDs NV]; the provider's console: encryption on and a managed key · Source B11, B33, B34 (art. 34: encrypted data exempt notifying the data subjects).

**SEC-DAT-03** — Keep an inventory of personal data: which field, of whom, category (identifying / sensitive, by the applicable norm: e.g. GDPR art. 9, Ley 25.326 art. 2), purpose, legal basis or consent, where it lives (tables, logs, backups, third parties, analytics), retention and how it is deleted. · How C+J · criterion P15 · Check: every new column/field with PII in the diff appears in the inventory; node-ts `git diff main... -- migrations/ prisma/ | rg -i "^\+.*(email|phone|telefono|dni|cuit|cuil|address|direccion|birth|nacimiento|salud|health)"` and each match is in the personal data inventory of `system-design.md` · Source B32 (arts. 2, 4, 5, 21), B34 (art. 5), B1 (V14.1.1).

**SEC-DAT-04** — Minimize: do not ask for nor store what the card's purpose does not need; if a derivative is enough (age instead of birth date, last 4 digits), store the derivative. · How J · criterion P1 · Check: the plan justifies each new personal field with the phrase of the requirement that asks for it. D10 looks at what travels to the client; this looks at what is collected and stored · Source B32 (art. 4), B34 (art. 5(1)(c)), B11.

**SEC-DAT-05** — Define the retention of each personal datum and automate the deletion or anonymization on expiry, including logs, analytics replicas and backups (by backup expiry). · How T+C · criterion P7 · Check: a test of the purge job with one expired record and one current; the logs retention policy is in the platform config · Source B32 (art. 4 inc. 7), B34 (art. 5(1)(e)), B1 (V14.2.7, level 3).

**SEC-DAT-06** — Encrypted backups, with access separate from production's, restored as a test periodically; a backup with PII inherits its retention. · How C · criterion P7 · Check: a restore job in staging with a validation query (see DB-OPS-05 in `reference/database.md`, module data) · Source B33, B11.

**SEC-DAT-07** — The data subject's rights have an implemented and tested path: access/export, rectification and erasure within the term of the applicable norm (examples: GDPR 1 month; Argentina, Ley 25.326: 10 calendar days for access, 5 business days for rectification and erasure), including derived tables and the third parties the datum was ceded to. · How T · criterion P1 · Check: node-ts a test creates a user with data in every table of the inventory, runs the erasure and checks that none keeps identifiable PII · Source B32 (arts. 14, 16), B34 (art. 12(3)).

**SEC-DAT-08** — No real personal data in development, tests or fixtures; synthetic or anonymized data. · How C · criterion none · Check: generic `rg -n -P "<id pattern taken from the inventory's fields>|@(gmail|hotmail|yahoo)\.com" fixtures/ seeds/` and review each match · Source B33 (annex I, “development environment”, content in an image [NV]), B4.

**SEC-DAT-09** — International transfers and third parties (analytics, LLM providers, support): recorded in the inventory and allowed by the applicable norm. · How J · criterion P15 · Check: review of the inventory's last column · Source B32 (art. 12), B1 (V14.2.3).

## 6. Supply chain and CI/CD (SC)

**SEC-SC-01** — Pin third-party CI steps by immutable id and each base image by digest; update them with a dependency bot (on GitHub Actions: a full commit SHA, with the tag as a comment). · How C · criterion S23 · Check: generic ``rg -n -P "uses:\s*[^@]+@(?![0-9a-f]{40}\b)" .github/workflows/ | rg -v "uses:\s*\./"`` is empty; `rg -n "^FROM\s+[^@\s]+(\s|$)" Dockerfile*` is empty (every `FROM image@sha256:…`). Evidence: in March 2025 (tj-actions/changed-files, CVE-2025-30066) and March 2026 (Trivy/trivy-action, CVE-2026-33634) **tags** were moved to malicious commits that exfiltrated runner secrets [V via search]. S11 pins dependencies by lockfile, not actions or images · Source B22, B24, B38.

**SEC-SC-02** — `GITHUB_TOKEN` (or the CI's equivalent) read-only at workflow level; write permissions only in the job that needs them. · How C · criterion S23 · Check: every file in `.github/workflows/` has a top-level `permissions:`: `for f in .github/workflows/*.y*ml; do rg -q "^permissions:" "$f" || echo "$f"; done` is empty; `rg -n "permissions:\s*write-all" .github/` is empty · Source B22, B24, B16 (CICD-SEC-5).

**SEC-SC-03** — No dangerous workflows: no `${{ github.event.* }}` interpolated in `run:` (pass it through `env:`), no checkout of the PR in `pull_request_target`/`workflow_run`, no self-hosted runners in public repos. · How C · criterion S23 · Check: generic `rg -n 'run:.*\$\{\{\s*github\.event\.' .github/workflows/` is empty; `rg -l "pull_request_target" .github/workflows/ | xargs -r rg -n "ref:\s*\$\{\{\s*github\.event\.pull_request"` is empty; an integral alternative: `scorecard --repo=github.com/org/repo --checks=Dangerous-Workflow,Token-Permissions,Pinned-Dependencies` [check names V, CLI syntax NV] · Source B22, B24, B16 (CICD-SEC-4).

**SEC-SC-04** — Protected branches: merge to the main branch only through a PR with review and required checks that cannot be skipped, admins included. · How C · criterion O27 · Check: generic `gh api repos/{o}/{r}/branches/main/protection` answers 200 with `required_pull_request_reviews` and `enforce_admins.enabled=true` [NV exact shape] · Source B16, B24.

**SEC-SC-05** — Sign what you publish (images, packages, binaries) and generate provenance on a hosted build platform (SLSA Build L2+); the deploy verifies signature and provenance before running. · How C · criterion S23 · Check: generic `cosign sign $IMAGE@$DIGEST` in CI with OIDC; `cosign verify $IMAGE --certificate-identity-regexp '^https://github.com/org/repo/' --certificate-oidc-issuer https://token.actions.githubusercontent.com` [NV flags]; node-ts if it publishes to npm: trusted publishing with OIDC and “disallow tokens”; `npm audit signatures` [NV command] · Source B23, B25, B26, B16, B24.

**SEC-SC-06** — A minimal base image (distroless, `-slim`, `scratch` or equivalent), with no shell or package manager at runtime when possible, scanned in CI with a cut by severity. · How C · criterion S23 · Check: generic `trivy image --severity HIGH,CRITICAL --exit-code 1 app:ci` or `grype app:ci --fail-on high` [NV flags]; multi-stage: `rg -c "^FROM" Dockerfile` is 2 or more. G3 audits the language's dependencies, not the image's OS packages · Source B15.

**SEC-SC-07** — Scan infrastructure as code (Terraform, Kubernetes, Helm, Dockerfile, workflows) in CI and block high findings. · How C · criterion S23 · Check: generic `checkov -d . --framework terraform,kubernetes,dockerfile,github_actions --compact` or `trivy config --severity HIGH,CRITICAL --exit-code 1 .` [NV Trivy flags]; KICS as a third option [NV]; tfsec was absorbed by `trivy config` [V, secondary] · Source B16, B39.

**SEC-SC-08** — The SBOM is generated **from the deployed artifact** (the image), not only from the manifest, attached to the release and rescanned when new CVEs come out. · How C · criterion S11 · Check: generic `trivy image --format cyclonedx --output sbom.cdx.json app:ci` [NV flag]; scheduled rescan `grype sbom:./sbom.cdx.json`. G3 does `npm sbom` of the npm tree; this adds the image's OS and continuous rescanning · Source B15, B1 (V15.1.2), B24.

**SEC-SC-09** — A written term to remediate vulnerabilities by severity, and nothing in production past that term. · How C · criterion S11 · Check: node-ts `npm audit --omit=dev --audit-level=high` in a scheduled CI run (not only in the card) · Source B1 (V15.1.1, V15.2.1), B19 [NV ID].

**SEC-SC-10** — Prevent dependency confusion: own namespaces reserved in the public registry and the registry fixed per namespace (on npm, an `.npmrc` per scope). · How C · criterion S10 · Check: node-ts `rg -n "^@myorg:registry=" .npmrc`; `npm view @myorg/<internal-package>` in the public registry gives 404 or is ours · Source B1 (V15.2.4, level 3).

## 7. Runtime hardening (RT)

**SEC-RT-01** — Headers: HSTS, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` with what is not used turned off, `frame-ancestors 'none'` (or `X-Frame-Options: DENY`), `Cross-Origin-Opener-Policy: same-origin` only where no OAuth popup or cross-window flow needs `window.opener` (it breaks them); no `X-Powered-By` and no version in `Server`. · How T · criterion S7 · Check: node-ts a test does `GET /` and asserts each header and the absence of `x-powered-by` (`app.disable('x-powered-by')` or helmet); generic `curl -sI https://host | rg -i "strict-transport|referrer-policy|permissions-policy|frame-ancestors|x-powered-by|^server:"`. S7 asks for CSP, nosniff and no-store; the rest is missing. ZAP baseline (S17) flags some as an alert, not as a test · Source B13, B1 (V13.4.6, level 3).

**SEC-RT-02** — CORS closed by default: no `Access-Control-Allow-Origin: *` on authenticated routes, never reflect the received `Origin`, never `*` with credentials; an exact list of origins per environment. · How C+T · criterion S24 · Check: node-ts `rg -n "cors\(\s*\)|origin:\s*(true|['\"]\*['\"])" src/` is empty; a test: `Origin: https://evil.example` to an authenticated route gets no `Access-Control-Allow-Origin`. S1 rejects the cross request; this looks at the CORS policy that would enable it. `cors()` with no options is `origin: "*"` [V] · Source B13, B39.

**SEC-RT-03** — Rate limiting per client/account on login, signup, recovery, expensive endpoints and webhooks; 429 with `Retry-After`; limits on body size and on pagination. · How T · criterion S24 · Check: node-ts a test fires N+1 requests and expects 429. S2 rejects the huge body; this adds the frequency · Source B13, B1 (V15.1.3, V15.2.2), B35 (LLM10).

**SEC-RT-04** — Container without root, with a read-only root filesystem, no extra capabilities, no privilege escalation and CPU/memory limits. · How C · criterion S24 · Check: generic Docker `rg -q "^USER\s+(?!root|0\b)" -P Dockerfile`; `docker inspect app --format '{{.Config.User}} {{.HostConfig.ReadonlyRootfs}} {{.HostConfig.CapDrop}} {{.HostConfig.SecurityOpt}}'` gives a non-empty user, `true`, `[ALL]`, `no-new-privileges`; K8s `checkov -d k8s/ --framework kubernetes` or `trivy config k8s/`; a manifest with `runAsNonRoot: true`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `resources.limits` · Source B15, B27 [NV controls].

**SEC-RT-05** — Minimal network surface: only the app's port exposed; database, cache and queues on a private network; NetworkPolicy deny-all by default in K8s; development ports bound to `127.0.0.1`; admin, metrics, docs and debug endpoints out of the Internet. · How C+T · criterion none · Check: generic `rg -n "ports:\s*$" -A3 docker-compose*.yml | rg -v "127\.0\.0\.1"` reviewed; `rg -n "/var/run/docker.sock" .` is empty; a test that `GET /metrics`, `/docs`, `/debug` from outside give 404/401 · Source B15, B13, B1 (V13.4.2, V13.4.5).

**SEC-RT-06** — Separate environments: different accounts/projects, credentials, databases and domains for dev, staging and production; nothing from production reachable from dev; debug mode off in production. · How C+J · criterion O2 · Check: node-ts a startup test with `NODE_ENV=production` checks that stack traces do not come out in the error response · Source B4, B3, B1 (V13.4.2).

**SEC-RT-07** — On an exception the system fails closed and answers generically: no stack trace, no SQL, no internal paths; the detail goes to the log with a correlation id. · How T · criterion E6 · Check: node-ts a test provokes an internal error and asserts `status 500`, a body with no `at `/`Error:`/`SELECT`, and the log has the same `requestId` · Source B2 (A10), B13, B10.

## 8. Security incident response (IR)

**SEC-IR-01** — Detection: the security events of B12 (authn/authz failures, lockouts, privilege changes, access to sensitive data, key use, push protection bypass) are emitted with structured fields and have threshold alerts linked to the system's observability. · How T+J · criterion S14 · Check: node-ts a test provokes a 403 and checks a `security.authz.denied` event with `userId`, `resource`, `requestId` and no PII; the alert rule exists in the platform config. S14 asks to log; A09:2025 adds alerting · Source B12, B2 (A09), B16 (CICD-SEC-10), B31.

**SEC-IR-02** — Logs resistant to tampering and injection: no CR/LF from the user, shipping over an encrypted channel, append-only storage, a retention of at least 90 days queryable for CI/CD. · How C+T · criterion none · Check: node-ts a test sends a header with `\r\n` and checks the log has one line per event (JSON logger) · Source B12, B4.

**SEC-IR-03** — Have a written runbook with roles, contacts and the phases detect → contain → eradicate → recover → postmortem, linked from the operations README. · How C+J · criterion W5 · Check: generic `test -f docs/technical/runbook.md && rg -q "security incident" -i docs/technical/runbook.md` · Source B21, B3, B11.

**SEC-IR-04** — Legal notification decided before the incident: who assesses whether there is personal data; GDPR: authority within 72 h and data subjects if the risk is high; Argentina: the law does not require it, but the AAIP recommends notifying it and informing the data subjects [NV in the primary source]; every breach is documented even if not notified. · How J · criterion W5 · Check: the runbook has the section and the contacts (DPO/legal) filled in · Source B34 (arts. 33–34), B33 [NV primary source].

**SEC-IR-05** — A blameless postmortem with timeline, root cause, what detected and what did not, and actions with an owner; each technical action returns as a card with a regression test, and the pattern is searched in the rest of the code. · How J+C · criterion S16 · Check: the postmortem and its actions in the repo. S16 searches the pattern in the card; this demands it after an incident too · Source B19 [NV ID], B17.

## 9. Typical errors in AI-generated code (AI)

Each rule is a cheap command the agent runs over its own diff. The frequency figures are from B36 and B37 (Veracode: XSS 86 % and log injection 88 % of the failures of 80 tasks, in the vendor's release, confirmed against the source; 45 % of the tasks had a vulnerability).

**SEC-AI-01** — No hardcoded secrets, nor “test” ones with a real shape, nor as a default of `process.env.X || "…"`. · How C · criterion S9 · Check: node-ts ``rg -n "process\.env\.[A-Z_]+\s*(\|\||\?\?)\s*['\"][^'\"]{8,}['\"]" src/`` is empty; `gitleaks dir src/`. A fallback with a real value is a pattern G4's regex does not see if it lacks the word `secret` · Source B4, B37.

**SEC-AI-02** — No open CORS (`cors()`, `origin: '*'`, `origin: true` with credentials). · How C · criterion S24 · Check: as SEC-RT-02 · Source B13, B39.

**SEC-AI-03** — No decoded JWT instead of verified, no missing `algorithms`, no weak secret (`"secret"`, `"changeme"`). · How C · criterion none · Check: node-ts SEC-AUTH-08 plus `rg -n -i "jwt\.sign\([^,]+,\s*['\"](secret|changeme|test|dev)" src/` is empty · Source B9, B39.

**SEC-AI-04** — Do not turn TLS verification off. · How C · criterion none · Check: node-ts `rg -n "rejectUnauthorized:\s*false|NODE_TLS_REJECT_UNAUTHORIZED|strictSSL:\s*false" .` is empty; generic `rg -n "verify\s*=\s*False|InsecureSkipVerify:\s*true|--insecure|-k\s|ServerCertificateValidationCallback" .` is empty. the kit's Semgrep rule `sdd-sec-ai-04-tls-off` (`.claude/rules/semgrep/sdd.yml`) detects it, including `NODE_TLS_REJECT_UNAUTHORIZED = '0'` · Source B14.

**SEC-AI-05** — No new endpoints without authz: SEC-AZ-01 applied to the diff: every route added in the diff has an auth middleware or is in the allow-list. · How C · criterion S5 · Check: ``git diff main... -U0 -- src/ | rg "^\+.*\.(get|post|put|patch|delete)\("`` and each line is reviewed against the allow-list · Source B10.

**SEC-AI-06** — No `eval`, `new Function`, `vm.runIn*`, `child_process.exec` with interpolation, nor `setTimeout("string")`. · How C · criterion S3 · Check: node-ts ``rg -n "\beval\(|new Function\(|vm\.runIn|exec\(`[^`]*\$\{|setTimeout\(\s*['\"]" src/`` is empty; generic `rg -n -P "\beval\(|\bexec\(|pickle\.loads|yaml\.load\((?!.*Loader=SafeLoader)" src/`. the kit's Semgrep rules `sdd-sec-ai-06-eval` and `sdd-sec-ai-06-exec-interp` (`.claude/rules/semgrep/sdd.yml`) cover `eval`, `new Function`, `vm.run*`, `setTimeout("string")` and `exec` with interpolation; registry packs miss most of these · Source B2 (A05).

**SEC-AI-07** — No insecure deserialization: no `node-serialize`, `serialize-javascript` to parse, `pickle`, `BinaryFormatter`, `ObjectInputStream` over external data; JSON with schema validation. · How C · criterion none · Check: `rg -n "node-serialize|unserialize\(|pickle\.loads|BinaryFormatter|ObjectInputStream|yaml\.load\(" src/` is empty · Source B1 (V1.5.2).

**SEC-AI-08** — No hallucinated packages nor ones with a name close to a real one. · How C · criterion S10 · Check: covered by S10/G3 (exists in the registry, age, downloads, repo); adds dependency confusion (SEC-SC-10) and checking that the name is not a conflation of two real ones (38 % of the cases according to CSA [V secondary]) · Source B36.

**SEC-AI-09** — No `Math.random()` for tokens, session IDs, verification codes or nonces. · How C · criterion S13 · Check: node-ts `rg -n "Math\.random\(\)" src/ | rg -i "token|code|otp|nonce|secret|id"` is empty · Source B11.

**SEC-AI-10** — No `console.log(req.body)`/`console.log(err)` that dumps passwords or tokens. · How C · criterion P2 · Check: as SEC-SECR-10 · Source B4, B12.

**SEC-AI-11** — No `fetch(req.query.url)` nor another user URL without an allow-list (SSRF). A user value that only fills a path segment on a fixed host is not SSRF; one that chooses the host, the scheme or the port is. · How C · criterion S3 · Check: node-ts `rg -n "(fetch|axios\.(get|post)|got)\(\s*req\.(query|body|params)" src/` is empty · Source B1 (V1.3.6).

## 10. If the app uses an LLM (LLM)

Only when the product calls a model. Single source: B35 [names V]; the content of each risk is [NV] (only the list was verified).

**SEC-LLM-01** — The model's output is untrusted input: it is escaped when shown and never executed nor passed to SQL, a shell or `eval` without validation (LLM05). · How T · criterion S3 · Check: a test makes the mocked model return `<script>` or `'; DROP` and checks the escaping · Source B35.

**SEC-LLM-02** — The tools the model can invoke have least privilege and irreversible actions ask for human confirmation (LLM06). · How J+T · criterion A8 · Check: review plus a test that the irreversible action needs confirmation · Source B35.

**SEC-LLM-03** — No secret nor authorization rule lives in the system prompt; authz is applied in the code that runs the tool (LLM07, LLM01). · How C · criterion A8 · Check: `rg -n -i "(api[_-]?key|password|token)" prompts/` is empty · Source B35.

**SEC-LLM-04** — Personal data sent to the model's provider: minimized, in the inventory (SEC-DAT-09) and out of the prompt logs (LLM02). · How J · criterion A8 · Check: review · Source B35.

**SEC-LLM-05** — A limit of tokens, requests and cost per user (LLM10). · How T · criterion A8 · Check: a test: 429 when exceeded · Source B35.

**SEC-LLM-06** — In RAG, the retriever filters by the user's permissions before giving the content to the model (LLM08). · How T · criterion A8 · Check: a test with two users · Source B35.

## Sources

- B1 — OWASP ASVS 5.0.0, May 2025 — https://github.com/OWASP/ASVS · https://owasp.org/www-project-application-security-verification-standard/
- B2 — OWASP Top 10:2025 — https://top10.owasp.org/2025
- B3 — OWASP SAMM 2.0 — https://owaspsamm.org/model/
- B4 — OWASP Secrets Management Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- B5 — OWASP Authentication Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- B6 — OWASP Multifactor Authentication Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
- B7 — OWASP Session Management Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- B8 — OWASP Password Storage Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- B9 — OWASP JSON Web Token Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html
- B10 — OWASP Authorization Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- B11 — OWASP Cryptographic Storage and Key Management Cheat Sheets — https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html · https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html
- B12 — OWASP Logging Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- B13 — OWASP REST Security and HTTP Headers Cheat Sheets — https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html · https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
- B14 — OWASP Transport Layer Security Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html
- B15 — OWASP Docker Security and Kubernetes Security Cheat Sheets — https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html · https://cheatsheetseries.owasp.org/cheatsheets/Kubernetes_Security_Cheat_Sheet.html
- B16 — OWASP CI/CD Security Cheat Sheet and Top 10 CI/CD Security Risks — https://cheatsheetseries.owasp.org/cheatsheets/CI_CD_Security_Cheat_Sheet.html · https://owasp.org/www-project-top-10-ci-cd-security-risks/
- B17 — OWASP Threat Modeling Cheat Sheet and the Threat Modeling Manifesto — https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html · https://www.threatmodelingmanifesto.org/
- B18 — Adam Shostack, *Threat Modeling: Designing for Security*, Wiley, 2014 [NV book content]; the Four Question Frame — https://shostack.org/books/threat-modeling-book · https://github.com/adamshostack/4QuestionFrame
- B19 — NIST SP 800-218 SSDF v1.1, 2022; draft Rev. 1 (SSDF 1.2), December 2025 — https://csrc.nist.gov/pubs/sp/800/218/final · https://csrc.nist.gov/pubs/sp/800/218/r1/ipd
- B20 — NIST SP 800-63B-4, July 2025 — https://pages.nist.gov/800-63-4/sp800-63b.html · https://csrc.nist.gov/pubs/sp/800/63/b/4/final
- B21 — NIST SP 800-61 Rev. 3, April 2025 — https://csrc.nist.gov/pubs/sp/800/61/r3/final
- B22 — GitHub Docs: Secure use reference (Actions), OpenID Connect, Push protection — https://docs.github.com/en/actions/reference/security/secure-use · https://docs.github.com/en/actions/reference/security/oidc · https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection
- B23 — SLSA v1.2 — https://slsa.dev/spec/v1.2/ · https://slsa.dev/spec/v1.1/levels
- B24 — OpenSSF Scorecard checks — https://github.com/ossf/scorecard/blob/main/docs/checks.md
- B25 — Sigstore / cosign — https://docs.sigstore.dev/cosign/signing/signing_with_containers/
- B26 — npm trusted publishing — https://docs.npmjs.com/trusted-publishers
- B27 — CIS Docker Benchmark 1.9.0 and CIS Kubernetes Benchmark 2.1.0 — https://www.cisecurity.org/benchmark/docker · https://www.cisecurity.org/benchmark/kubernetes
- B28 — The Twelve-Factor App, III “Config” — https://12factor.net/config
- B29 — HashiCorp Vault, Database secrets engine — https://developer.hashicorp.com/vault/docs/secrets/databases
- B30 — AWS Secrets Manager, rotation — https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html
- B31 — Azure Key Vault, “Secure your secrets”; GCP Secret Manager, “Best practices” — https://learn.microsoft.com/en-us/azure/key-vault/secrets/secure-secrets · https://docs.cloud.google.com/secret-manager/docs/best-practices
- B32 — Ley 25.326 de Protección de Datos Personales (Argentina) — https://servicios.infoleg.gob.ar/infolegInternet/anexos/60000-64999/64790/texact.htm
- B33 — AAIP, Resolución 47/2018 — https://www.argentina.gob.ar/normativa/nacional/resolución-47-2018-312662/texto
- B34 — GDPR (Regulation (EU) 2016/679), arts. 5, 12, 33, 34 — https://gdpr-info.eu/art-5-gdpr/ · https://gdpr-info.eu/art-12-gdpr/ · https://gdpr-info.eu/art-33-gdpr/ · https://gdpr-info.eu/art-34-gdpr/
- B35 — OWASP Top 10 for LLM Applications 2025 — https://genai.owasp.org/llm-top-10/
- B36 — Spracklen et al., “We Have a Package for You!”, USENIX Security 2025 — https://arxiv.org/html/2406.10279v3
- B37 — Veracode, *2025 GenAI Code Security Report*, 30 July 2025 — https://www.veracode.com/resources/genai-code-security-report/
- B38 — Supply chain incidents in Actions: tj-actions/changed-files (CVE-2025-30066, March 2025) and Trivy/trivy-action (GHSA-69fq-xp46-6x23 / CVE-2026-33634, 19 March 2026) — https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23
- B39 — Tools: gitleaks, Trivy, Grype, Checkov, expressjs/cors, node-jsonwebtoken — https://github.com/gitleaks/gitleaks · https://trivy.dev/latest/docs/ · https://github.com/anchore/grype · https://www.checkov.io/2.Basics/CLI%20Command%20Reference.html · https://github.com/expressjs/cors · https://github.com/auth0/node-jsonwebtoken

## Not verified

- Books: the content of *Threat Modeling* (Shostack, 2014); only the record, the announced 2nd edition (February 2027) and the Four Question Frame were verified. The origin of STRIDE (Kohnfelder and Garg).
- NIST: the SSDF task IDs (PO/PS/PW/RV.n), since the PDF was not opened; whether SSDF 1.2 (Rev. 1) is already final; the detail of SP 800-61r3's recommendations.
- CIS Benchmarks: only the versions (Docker 1.9.0, Kubernetes 2.1.0); the controls, and the tools `docker-bench-security` and `kube-bench`.
- Cloud: AWS KMS and the rotation strategies of Secrets Manager (single/alternating user, allowed frequencies); the syntax of `aws`/`gcloud`/`az` cited.
- Argentina: the text of the annexes of AAIP Res. 47/2018 (they are in images); the recommendation to notify the AAIP and Res. 332/2020 come from law-firm studies, not from the norm; the state of bill 3661-D-2022 and of any comprehensive reform of Ley 25.326. Breach notification in Argentina stays [NV].
- SLSA: the levels of the v1.2 Source track.
- Tools: Trivy's `--exit-code`/`--severity`/`--format` flags, Grype's `--fail-on`, cosign keyless verification, the Scorecard CLI, `gitleaks git --staged`, KICS, zizmor, actionlint, pinact, osv-scanner, testssl.sh, `npm audit signatures`, the `gh api` paths for push protection and branch protection; Semgrep rule names.
- Incidents: the Trivy advisory was read through search summaries, not its full text.
- AI figures: the sample size of Spracklen et al. (576,000 vs 2.23 M according to the secondary source) and the 38/13/51 % distribution of hallucination types.
- None of the example commands was run.
