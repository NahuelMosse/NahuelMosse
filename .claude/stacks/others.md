# Profiles for other stacks — untested

The standard tools of each ecosystem for the `## Gate` lines and the criteria that change with the stack. **None of these
profiles has run yet on a real card**: the first card of a repo on that stack confirms each
command, adjusts it, and **moves the profile to its own file**, like `node-ts.md`. Until then,
every command here is a starting point, not a verified check.

**What does not change with the stack:** the attacks (S1, S2, S7) and the accessibility criteria (I1 to I9) test the
running app over HTTP and through a browser, so **Playwright and axe work the same for a backend in any
language** as long as the interface is web.

| Criterion · Gate line | .NET | Java | Python |
|---|---|---|---|
| `suite:` · C3 | `dotnet test` with the build on `TreatWarningsAsErrors` | `mvn verify` / `gradle check` | `pytest` + the type checker |
| K1 types | `<Nullable>enable</Nullable>` and warnings as errors | compiler warnings as errors; **NullAway** if possible | **mypy `--strict`** or **pyright** in strict mode |
| T3 · `mutate <file>:` | **Stryker.NET** — `dotnet stryker` | **PIT** — `pitest-maven` | **mutmut** or **cosmic-ray** |
| K1 suppressions | `!` that forgives nulls, `#pragma warning disable`, `catch { }` | `@SuppressWarnings`, empty `catch` | `# type: ignore`, `# noqa`, `except: pass` |
| K5 | `.csproj` packages that no target uses | declared plugins with no phase that runs them | `pyproject.toml` tools with no command that invokes them |
| D2 · D11 · D15 | **ArchUnitNET** or **NetArchTest**: layers, public index, table owner, package allow-list | **ArchUnit** with the same rules | **import-linter** with `forbidden` contracts |
| K4 | **jscpd** —supports C#— | **PMD CPD** | **jscpd** or **pylint** `duplicate-code` |
| D3 | ArchUnitNET slices `BeFreeOfCycles` | ArchUnit `slices().matching(..).should().beFreeOfCycles()` | `pylint --disable=all --enable=cyclic-import` or `pydeps --show-cycles` |
| E6 · E12 · E13 | CA1031 (general catch) and CA2200 (a rethrow that loses the stack) | PMD `AvoidCatchingGenericException`, `PreserveStackTrace`, `EmptyCatchBlock` | ruff `BLE001`, `B904` and the `TRY` rules |
| D1 · D4 · D6 · K6 | the informative detectors of `reference/code-patterns.md`, adapted to the language | the same | the same |
| T2 | the D18 command of `reference/testing.md` over the tests folder | the same | the same |
| I26 · T7 | the test run again with `TZ=America/St_Johns` and `LANG=tr_TR.UTF-8` (`DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=0`) | `-Duser.timezone=America/St_Johns -Duser.language=tr` | `TZ=America/St_Johns LANG=tr_TR.UTF-8 pytest` |
| I31 | a script comparing the keys of each catalog (`.resx`) with the source one | the same over `messages_*.properties` | `pybabel extract` and `msgfmt --check` over each `.po` |
| I27 | a literal-string detector over the diff. Informative | the same | the same |
| O15 | the front-end detectors of `reference/performance.md` section 5.15 with `rg --pcre2` over the front files; only if the repo has a front end. Informative | the same | the same |
| P5 · P16 | the upgrade from main with data (`once.mjs migrate-upgrade -- <script>`; the script and the recipe are in `stacks/node-ts.md`): EF Core `dotnet ef database update` from the base worktree, the seed, then from the branch; untested | Flyway `flyway migrate` from the base worktree, the seed, `flyway migrate` from the branch, then `flyway validate`; Liquibase `liquibase update` the same way; untested | Alembic `alembic upgrade head` from the base worktree, the seed, `alembic upgrade head` from the branch, and one head; Django `python manage.py migrate` the same way plus `makemigrations --check --dry-run`; untested |
| P5 · P16 (Prisma, Knex, Atlas, Rails, golang-migrate) | as in `stacks/node-ts.md`: the tool does not depend on the language | the same | the same |
| O1 | clean clone, `dotnet restore`, `dotnet run` | clean clone, `mvn package`, startup | clean clone, fresh environment, `pip install`, startup |
| S10 · S11 | **CycloneDX** for .NET · `dotnet list package --vulnerable` | **CycloneDX Maven** · **OWASP Dependency-Check** | **cyclonedx-py** · **pip-audit** |
| S9 | **gitleaks** | **gitleaks** | **gitleaks** |
| K2 · K3 | **SonarAnalyzer.CSharp** as a Roslyn analyzer, warnings as errors | **PMD** + **SpotBugs**; or SonarQube if there is a server | **ruff** with the complexity rules · **pylint** |
| S3 | **Semgrep** | **Semgrep** | **Semgrep** · **bandit** |
| T11 | **coverlet** | **JaCoCo** | **coverage.py** |
| S18 | `dotnet list package --outdated` | `mvn versions:display-dependency-updates` | `pip list --outdated` |
| S12 | **nuget-license** | **license-maven-plugin** with `failOnBlacklist`, or the Gradle dependency-license-report | **pip-licenses** `--allow-only` |
| S17 | **OWASP ZAP** in baseline mode | **OWASP ZAP** in baseline mode | **OWASP ZAP** in baseline mode |
| P4 · P12 | **migration-lint** (`.claude/skills/migrations-safe`, module data) over the EF Core migrations, or `dotnet ef migrations script \| node <lint> - --runner efcore` | **migration-lint** `--history` over the Flyway or Liquibase SQL | `alembic upgrade --sql <rev> \| node <lint> - --runner alembic`; Django: `python manage.py sqlmigrate <app> <n> \| node <lint> - --runner django` |
| W8 | the generated spec (Swashbuckle or NSwag) against the committed one, plus the linters of `stacks/node-ts.md` | springdoc `/v3/api-docs` against the committed spec, plus the same linters | FastAPI `app.openapi()` against the committed spec, plus the same linters |
| W9 | **Schemathesis** | **Schemathesis** | **Schemathesis** |
| S19 | `nuget-license -o` | `license:add-third-party` | `pip-licenses --with-license-file --with-notice-file` |
| V3 | **git-cliff** or **commitizen** `check` | the same | the same |
| P8 · P9 · P10 · P11 | EF Core `DbCommandInterceptor` to count queries; Testcontainers | Hibernate `Statistics.getPrepareStatementCount()`; Testcontainers | Django `assertNumQueries` or SQLAlchemy `event.listen(engine, "before_cursor_execute")`; Testcontainers |
| O16 · O18 | the health endpoint or `--version` | the health endpoint or `--version` | the health endpoint or `--version` |
| P2 · O5 · O6 · O17 · O19 | **Serilog** in JSON and OpenTelemetry .NET; health with `MapHealthChecks` | **Logback** with logstash-encoder, Micrometer and the OpenTelemetry agent; Spring Actuator `/actuator/health/liveness` and `/readiness` | **structlog** or python-json-logger and OpenTelemetry Python; the framework's health endpoint |
| O22 | **NBomber** | **Gatling** | **Locust** |
| W1 · W7 · W10 | the docs build as in `stacks/node-ts.md`; for Python sites `mkdocs build --strict` or Zensical [NV]; the render of each diagram (`mmdc`, `d2`, `likec4 build`, Kroki, `structurizr export`) does not depend on the language: untested on this machine, flags [NV] | the same | the same |
| O23 · O25 · O27 · O28 · S23 · S24 · O21 · O15 · P7 · O18 · O29 | as in `stacks/node-ts.md`: they do not depend on the language | the same | the same |
| K1 closed enumerations | an `enum` or a closed type as the dictionary key | `EnumMap` | `Literal[...]` or `Enum` as key, with the type checker |

## Readability limits

Configured in the repo's linter and run by the `lint:` line; over a limit needs an inline reason.

| Limit | .NET | Java | Python | Dart |
|---|---|---|---|---|
| ~250 lines per file, ~40 per function | CA1505 (maintainability index), CA1502 | PMD `NcssCount`, Checkstyle `FileLength` and `MethodLength` | pylint `too-many-lines`, `too-many-statements`; ruff `PLR0915` | `dart_code_metrics` (`source-lines-of-code`) or the repo's analyzer |
| complexity 10, depth 3, params 4 | CA1502 (threshold 10), CA1506 | PMD `CyclomaticComplexity`, `ExcessiveParameterList` | ruff `C901` (max-complexity 10), `PLR0913` (max-args 4), `PLR1702` | `cyclomatic-complexity`, `maximum-nesting-level`, `number-of-parameters` |

| readable code (names, flags, branches, literals, dead code) | CA1707, CA1716 | Checkstyle `MagicNumber`, `AvoidInlineConditionals` | ruff `select` adds `C90, PLR, RET, N, ERA, FBT` with `[tool.ruff.lint.mccabe] max-complexity = 10` and `[tool.ruff.lint.pylint] max-args = 4, max-statements = 40, max-branches = 10` | `analysis_options.yaml` `linter: rules:` `directives_ordering`, `avoid_positional_boolean_parameters`, `prefer_const_constructors`, `avoid_print` |
| formatter (the `fmt:` line) | `dotnet format --verify-no-changes` | `./gradlew spotlessCheck` | `ruff format --check .` | `dart format --output=none --set-exit-if-changed .` |

Rule names to confirm on first use. Paradigm: .NET and Java are OO (one class per file, helpers in a class or module of their own, named for the concept); Python and Dart: a module is a set of functions or one class, never both.

## Default libraries by category

Solved problems use a library (`rules/architecture.md`). **The repo's existing choice always wins**; this is the default for a new repo or an uncovered category. Features are folders (`Features/<Feature>/`, `app/<feature>/`, `modules/<feature>/`) with the layers inside as folders (`presentation/`, `domain/`, `data/`; `rules/architecture.md`, «Structure»).

| Category | .NET | Java | Python |
|---|---|---|---|
| Persistence and migrations | **EF Core** with `dotnet ef migrations`; **Dapper** only where SQL is the point | **Spring Data JPA** (Hibernate) with **Flyway** or **Liquibase**; **jOOQ** for visible SQL | **SQLAlchemy** 2.x with **Alembic**; Django: its ORM and `migrate` |
| Dependency injection | the built-in `Microsoft.Extensions.DependencyInjection`, one `Add<Feature>()` extension per feature | Spring's DI (constructor injection); Quarkus or Micronaut CDI | FastAPI `Depends`; **dependency-injector** only when the app wires many services; Django: no container needed |
| Validation | **FluentValidation** or data annotations | Jakarta Bean Validation (Hibernate Validator) | **pydantic** v2 |
| Authentication | ASP.NET Core Identity or JWT bearer middleware | Spring Security | **FastAPI Users**, **Authlib**, **PyJWT**; Django: `django.contrib.auth` |
| Dates | `DateTimeOffset`, **NodaTime** when zones matter | `java.time` | `datetime` with `zoneinfo`; **pendulum** or **arrow** if the repo has them |
| HTTP client | `IHttpClientFactory` with **Polly** | Spring `RestClient`/`WebClient` | **httpx** |
| Queues and jobs | **Hangfire** or **MassTransit** | Spring AMQP / Kafka; **Quartz** | **Celery**, **Dramatiq** or **arq** |

**Flutter and Dart** (profile `flutter`): persistence **drift** (migrations included) or **isar**/**sqflite** if the repo has it; DI **get_it** (with **injectable**) or **riverpod** providers; validation with **formz** or plain value objects; HTTP **dio** or `http`; dates `intl`; state **riverpod** or **bloc**.
