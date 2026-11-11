---
paths: ["apps/**","src/**","packages/**","lib/**"]
---

# Architecture

With that frontmatter these rules are loaded only when one of those files is touched; without it,
they are paid for in every session. Adjust them to the repo's real structure — **and in the first
card of a new repo that is part of the work**, because it is the card that invents the structure.

The path globs must match the repo's real layout; check in the first card that this rule loads.
**A rule activated by path does not warn you when it is not activated**: there is no error, simply
nothing happens. For that reason the critical content does not live only here: the
dependency-direction obligation is also in the gate and in the plan judge (high risk only).
**What rests on a single door is lost when that door does not open.**

## Simplest structure that works

**This section wins over every other one when it comes to abstractions.** The kit's first duty is to avoid overengineering:
an interface, a pattern or a class exists only where today's code needs it. The *folders* are another matter: every feature is
a slice with its layers as folders (see «Structure»), because a feature that reads by layer at a glance is the readable one,
and a folder costs nothing to keep.

- **A CRUD feature** is one slice with the layers it has: `presentation/` (route or screen), `domain/` (the entity and its
  rules), `data/` (the repository on the stack's ORM). No use-case class that only forwards to the repository.
- **`application/`** appears for a use case that orchestrates more than one thing (two repositories, a payment and an email).
- **Dependency injection** is the framework's DI or plain constructor parameters. A container (awilix, tsyringe) only when the
  app wires many services and the framework has none; never a hand-rolled container or service locator.
- **No** interface with a single implementation (unless a test needs the fake), generic repository, event bus with one consumer,
  factory, strategy or adapter without a second variant, or config for a value that never changes.
- Extracting duplicated logic (see «Duplicated logic») is not abstraction; a **new pattern** is, and it is justified or removed.

The gate checks it: `overdesign` fails a pass-through method, an interface or abstract class with one implementation, a folder with one
tiny file outside the layer folders that the card added, and reports the ones already in the repo; empty layer folders of a slice are
expected and never flagged;
`plan.mjs` asks `why-layer:` for a factory, strategy, adapter, bus or `I<Name>` interface file. A finding the card keeps on
purpose (the port a use case depends on so it does not import the repository) goes in the Log as
`declared · overdesign · <file> · <the rule that asks for it>`: it stays a note and the close lists it for a person.

## The five that matter

They are the ones that cost the most and that no generic linter catches.

1. **A request-handling file does not talk to persistence.** Whoever receives the request validates it,
   delegates to a use case and responds; the files that handle requests import no persistence
   client, ORM or table model (the stack's file patterns are in `.claude/stacks/<stack>.md`).
2. **The domain carries no appearance — but it does carry the name.** A color, an icon, a column
   width or a date format inside the rules layer means that **a new screen with another palette
   can no longer use that domain**.

   **The cut is at “how it looks”, not at “what it is called”.** That an entity knows its own
   business name is vocabulary and saves a parallel label map that has to be kept up to date. A
   principle that charges more maintainability than the design it wins is badly applied.

   The exception is **translated** text: if there is more than one language, the label is
   presentation and goes out, because there the map exists anyway.
3. **The domain does not import infrastructure.** Nothing under `**/domain/**` imports an external
   SDK, the ORM, HTTP, a queue or the file system. If a business rule needs a piece of data from
   outside, it receives it as a parameter.
4. **Modules do not import each other in a circle.** If `clients` imports `requests` and
   `requests` imports `clients`, there is a third thing neither of them saw. Take it out to a
   shared module or invert the dependency.
5. **A service does one thing.** If to explain what it does you use “and” more than twice, they are
   two services. It is not a line rule: it is about reasons to change it.

## Structure: vertical slices, clean-architecture layers inside

Both halves weigh the same. The code is cut by **functionality first**: each feature is a vertical slice, a folder
`src/modules/<feature>/` (or the stack's equivalent: a Nest module, a .NET project or namespace per feature, a Python package,
a Flutter `lib/features/<feature>/`) that holds everything the feature needs, from the screen or route to the table. A
developer reads one folder to understand one feature, and a large project grows by adding slices, not by thickening shared
layers. **Inside each slice, the clean-architecture layers are folders from its first file:**

| Folder | Holds | Role in `## Tasks` |
|---|---|---|
| `presentation/` | routes, controllers, request schemas; in a front end the screens, widgets and their state | `(presentation)` |
| `domain/` | entities, value objects and the rules, pure: no I/O, no framework | `(rule)` |
| `application/` | use cases that orchestrate, only when one does | `(rule)` |
| `data/` | repositories on the ORM, API clients, DTOs and their mapping | `(data)` |

Each folder exists when it holds something; the slice's public index (`index.ts`, `<feature>.dart`) stays at its root. Imports
point inward: `domain/` imports neither `presentation/` nor `data/`, and `data/` does not import `presentation/`.
`presentation/` may call `data/` directly while there is one implementation; the interface in `domain/` is born with the
second one or the test fake. A repo that already names a layer otherwise keeps its name. At the top there is only a small `shared/` kernel (config, logging, the base error types, a few pure
utilities, UI primitives) and the composition root.

```
src/modules/                                   lib/features/                       (Flutter)
  customers/                                     bookings/
    presentation/  customers.routes.ts             presentation/  bookings_page.dart  booking_tile.dart
    domain/        customer.ts                     domain/        booking.dart  booking_window.dart
    data/          customers.repository.ts         data/          bookings_repository.dart  booking_dto.dart
    index.ts                                       bookings.dart
src/shared/                                    lib/shared/
```

**A top-level folder by layer or by kind** (`domain/`, `data/`, `screens/`, `widgets/`, `services/`, `models/`, `providers/`)
**that spans features is a failure**: adding a feature touches distant folders, nothing says which screens, rules and tables
belong together, and the module boundaries below cannot be asserted. `plan.mjs` refuses a new `## Tasks` file placed there or
outside its layer folder, and the gate's `layers` check refuses a created file outside its layer folder and an import that
points outward.

**A slice grows one step at a time, each only on its signal**: layer folders → a folder per use case (past ~5) → named
sub-slices, one level → a workspace package (own build, owner or publication). Two slices that import each other both ways
are one. In the front end, `features/<feature>/` the same way; a full-stack feature keeps its name in every root and shares
only the contract. Trees, names, tests and what `shared/` may hold: `.claude/reference/structure.md`.

## APIs: REST over resources, not over tables

An API is REST, and REST exposes **resources**, not the database. A resource is what the client works with
(an order with its lines, totals and status; a customer with its open requests), and it may join several
tables, compute fields or hide others; that assembly happens behind the route, in the slice.

- The response is the resource's own shape, written in the slice (a schema or a mapper at the edge). An
  ORM entity, a table row or its internal columns (foreign keys, audit fields, soft-delete flags) never go
  out as is, and a request body never maps straight onto a table.
- Routes are nouns of the domain (`/orders/{id}`, `/orders/{id}/cancel` for an action that is not an
  edit), not one CRUD per table. A table with no meaning for the client gets no route.
- The resource shape is the contract (OpenAPI where the repo has it): changing the database does not
  change it, and changing it is a versioned decision.
- Simplest first still holds: when the resource and the table really coincide, the mapping is one small
  schema, not a layer.
- **REST by default; GraphQL when the case asks for it** (several clients that need different shapes of the
  same data, deep nested reads a screen would otherwise stitch from many calls), decided in the card or
  `system-design.md`, or the repo's existing choice. The same rule holds: the schema describes resources,
  not tables; resolvers assemble them behind (batched, no N+1), with depth and cost limits.

## Readable files

- **One file, one responsibility.** A file exports one concept (a use case, an entity, a repository adapter, a controller, a
  component). Validation, persistence, formatting and HTTP in one file is a failure; the layers are separate files.
- **One paradigm per file and per layer**, chosen per stack in `.claude/stacks/<stack>.md`: in an OO stack (Nest, .NET, Spring)
  use cases, services, repositories and controllers are classes, one per file, and pure helpers live in their own module file,
  never as loose functions next to a class; in a functional stack (Express, plain TS, React) a file is a set of related functions
  or one class, never both. A class file holds the class and at most its private types. The gate's `shape` check flags a file with
  a class and a top-level function, more than one class, or a name like `utils`, `helpers` or `manager`.
- **Readability limits** (file, function, complexity, nesting, parameters) are enforced by the stack's linter in the `lint:`
  line; the values and the config are in `.claude/stacks/<stack>.md`, "Readability limits". Going over needs an inline reason.

## Readable code

- **A name says what the thing is in the domain**, not how it is stored: `reservationEnd`, not `d2` or `tmp`. A boolean is a
  question (`isActive`, `hasStarted`). No abbreviation a newcomer has to look up.
- **A function does one thing at one level**: it reads as a list of steps whose names tell the story. A comment that separates
  two phases means two functions.
- **No boolean flag parameters** (`notify(true)`): two functions, or a named option. More than four parameters: one object.
- **Early return for the edge cases**, so the main path is not indented. No nested ternaries.
- **A literal that carries a rule has a name** (`MAX_HOURS = 4`, `EXCLUSION_VIOLATION = "23P01"`); `0`, `1` and `""` are exempt.
  The same literal or SQL fragment three times is one name.
- **A comment says why** (a constraint, a decision, a trap), never what the next line does. Dead code and code commented out
  are deleted: git keeps them.
- **Types at the boundaries, errors by name**: every exported function is typed; a failure is a named error, never a silent
  `None`, `false` or empty `catch`. A test title reads as the behavior (`rejects a booking in the past`).
- **Formatting is the formatter's** (the `fmt:` line of the gate), never a matter of taste.

## Dependency direction

Inside each slice, between its layer folders:

```
presentation (routes, screens) → application (use cases) → domain (entities, rules)
data (ORM, HTTP clients, DTOs) → domain
```

The arrows point inward and **never the other way round**. The domain knows nobody. Between modules the
only door is the public index (next section).

## Module boundaries

You import another module's public index, never its inside:
`import { X } from '../clients'` yes; `import { X } from '../clients/data/client.model'` no.
The index lists what is public by name, never `export *`; a slice that became a package exposes it in `exports`.

- **Direction:** the composition root (`app`, routes) → slices → `shared/`. `shared/` imports no slice and holds no
  domain; a slice's piece moves there at its third use across slices. Front-end features do not import each other;
  the routes compose them.
- The gate's `boundaries` check holds this on the card's files: `shared/` importing a slice, a reach inside another
  slice, `export *` in an index, a grab-bag folder (`common/`, `core/`, `utils/`). `kit-boundary: <reason>` declares one.

- **Each module owns its tables**; nobody else reads or writes them.
- **Cross effects** go through the other module's interface or through an event. In the front end, through
  props, events or a public API: never a `querySelector` inside another component, nor its internal state.
- **A non-trivial library** (ORM, HTTP client, payments, mail, PDF, queues) is used behind an adapter
  module in `data/` (or beside the repository when the module has no layers), with names from the domain; domain and application do not import it. The
  exceptions are the standard library, the web framework in `presentation/` and the pure utilities
  declared in `system-design.md`. *Behind an adapter* is where the library lives, not a reason to
  replace it with hand-written code: see the next section.

## Solved problems use the stack's library

Persistence, dependency injection, validation, authentication, dates, the HTTP client, queues and
migrations are solved problems. Each uses the stack's standard library, named per category in
`.claude/stacks/<stack>.md`; **the repo's existing choice always wins**, and a new repo takes the
profile's default.

- **Persistence:** a migration tool and one data-access layer in the module's `data/`; the domain keeps its own entities. A
  builder that keeps SQL visible is allowed; a home-made mapper or ad hoc SQL strings scattered around are not.
- **Dependency injection:** the framework's DI (Nest, ASP.NET, Spring, FastAPI `Depends`) or plain constructor
  parameters; a container (awilix, tsyringe, dependency-injector, get_it) only when the app wires many services and
  the framework has none, in the composition root. Not a hand-rolled container, registry, service locator or
  module-level singleton.
- **Validation:** a schema library (zod, valibot, pydantic, FluentValidation) at the edge.

Hand-rolling one of these is allowed only with an `<ID>-ASM-NN` that says why (no library fits, a
constraint of the repo) and a test tied to it; without it the plan names the library.

The rules with their sources and checks are in `.claude/reference/architecture.md`; when a pattern
is in doubt, `.claude/reference/code-patterns.md`.

## Before writing a new piece, in this order

1. **Does it already exist in the repo?** It is reused. Two implementations of the same thing is
   the copied rule that later diverges. *Search before writing, not after:* `Grep` the module and
   `shared/` by what the piece does (intent words: `format`, `price`, `validate`), by the names
   and signatures it would have, and for a snippet of the logic itself. The result goes in the card:
   `reuses: <file> <symbol>` or `new: <why nothing fits>` under the task, which `plan.mjs` checks.
   A piece that is close but not equal is extended or parameterised, not copied with a change.
2. **Does the standard library of the stack bring it?** Tokens, URL parsing and formatting are in it (in Node:
   `node:crypto`, `URL`, `Intl`; others in `.claude/stacks/<stack>.md`). Writing it by hand is maintaining what others already maintain.
3. **Does the platform do it?** `required` and `type="email"` before a JavaScript validation;
   `<details>` before an accordion; a uniqueness constraint in the database before a check in the
   code. **The native comes with accessibility and with edge cases you will not remember to
   write.**
4. **Is it one of the solved problems above** (persistence, DI, validation, auth, dates, HTTP client,
   queues)? The stack's library, even if it is a new dependency: it is the product's foundation, not
   one function. Otherwise, **does a dependency that is already there cover it?** Adding a new one for a
   small utility (one function) is adding a tree; this step is for those, not for the categories above.
5. Only then, **the minimum that works.**

*The ladder is Ponytail's, validated by others —10% less cost with the same success rate over 80
paired tasks— and **it does not apply to what this method explicitly asks for**: edge validation,
error handling, security, accessibility and the tests of the gate are not “extra” code, they
are the product. Ponytail itself excludes them; it is clarified here because an agent that
receives “write the minimum” and “write these tests” picks one of the two if nobody tells it
which one rules.*

## What not to do in the name of architecture

These weigh as much as the ones above, because the mistake of overdesigning is more expensive to
undo than that of underdesigning.

- **Do not create an interface to satisfy DIP.** An interface with a single implementation and no
  second consumer in sight is indirection, not decoupling. The adapter that isolates a library is a
  **module** with names from the domain; an interface type only if a test needs a fake of it (the
  exception of D6) or there is a second implementation.
- **Do not add an event bus for a single consumer.** An event only when the emitter must not know the
  receiver.
- **Do not make a generic repository** if a domain repository expresses the intent better.
  `findByTaxId()` says something; `findOne(criteria)` does not.
- **Do not introduce an abstraction until you have a concrete reason.** Two uses are not a pattern
  *of design*: no interface, base class, generic repository or configuration layer for them. That is
  not permission to copy logic (next section).
- **Do not turn a CRUD into hexagonal.** If the card is a CRUD, deliver a CRUD.
- **Do not add an interface, pattern or use case the card does not need today.** «Simplest structure that works» decides; the
  layer folders of a slice are its shape, not an addition.

## Duplicated logic is not a premature abstraction

Two different things. An **abstraction** is a new shape (interface, hierarchy, framework) that guesses
how the code will vary; waiting for evidence is right. **Duplicated logic** is the same rule written
twice, and it is already evidence: the two copies diverge, and one bug is fixed in one of them.
It is extracted as a plain function, with the names of the domain, no new layers:

- **Second use inside a module:** extract it there (its own file, named for the concept).
- **Second use in another module:** the module that owns the concept exports it through its public
  index and the other imports it; nothing is copied. **Third use across modules:** it moves to
  `shared/`, the small kernel, because it no longer belongs to any one of them.
- **Same shape, different rule** (two validators that look alike but change for different reasons)
  is not duplication: leave both, and say it in the Log as `declared · K4 · <file> · <why the two must differ>`.

`verify.mjs` runs K4 (`jscpd`, 5 lines or 50 tokens) in every grade: a clone with a side in lines the
card wrote fails the gate; one already in the repo is only reported. It finds exact copies; a copy
with renamed variables passes it, which is why the search before writing matters more than the check.

## How it is reviewed

`/code-review` for the diff: bugs and cleanup in a single pass.

**And the dependency direction is asserted with a test, not eyeballed.** A review in the PR holds
as long as somebody remembers; the arrow gets inverted in the rushed commit of a Tuesday and then
there is nobody to notice it. The test is ten lines and needs no dependency: it reads the imports
of each layer and fails if they point outward.

```
modules/<x>/domain/**          imports nothing from outside its own domain/ (and shared/)
modules/<x>/application/**     does not import from data/ or presentation/
modules/<x>/presentation/**    does not import from data/ (while there is one implementation it may; see Structure)
modules/<x>/**                 imports another module only through modules/<y>/index
```

The test runs the arrows per module (`**/domain/**` inside each `modules/<x>/`), so a new module
is covered without editing it, and it fails any production file under a top-level `domain/`,
`application/` or `data/` folder outside `modules/<x>/` and `shared/`.

*A property that only holds because someone remembers it is already a lost property; the only
difference is when you find out.*

The same test also asserts that a module is imported only through its public index, that each table is
touched only by its owner module (the “table → owner module” of `docs/technical/system-design.md`) and
that domain and application import no library outside the declared allow-list; cycles are C10.

In a large repo the tool is `dependency-cruiser` with a `.dependency-cruiser.js` that encodes
these same arrows, running in the default command. In a small one, the hand-written test is
enough. What is not enough is the review.

## The compiler at its maximum strictness

The stack's type checker, **in its strictest mode** —which one it is and how it is configured is
in `.claude/stacks/<stack>.md`—. What the strict mode catches and the normal one does not is not
always the same: access to a list or a map treated as if the element were always there, and a null
that propagates. The answer to that lie is usually a suppression that covers it up instead of
handling it.

The same from the other side: **a `!`, an `as any` or a `@ts-ignore` is the compiler warning and
somebody covering its mouth.** They are removed; the one that survives carries a line saying why.
