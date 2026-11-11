# ADR-NNNN: <decision in one line>

Saved as `docs/adr/NNNN-<slug>.md`. One decision per record. The record says what was decided and why; the
current state of the system is in `docs/technical/system-design.md`, the numbers in
`docs/technical/infra-cost.md`. A decision that is replaced is not edited: its status changes to
`superseded by ADR-NNNN` and the new record links back. The first card of a repo writes the ADR of the stack
and the hosting; every card that adds infrastructure writes one for the component (criterion D14).

## Status

`proposed` | `accepted` | `superseded by ADR-NNNN` · date · who decided

## Problem and requirement

What forces the decision: the requirement it answers (card ID, scenario), the volume and the constraints
that matter (team, budget, deadline, compliance). Two or three sentences.

## Alternatives

Two or more. One of them is the boring one or the one already present in the repo (DB-ENG-01, DB-ENG-02):
a new component has to beat it, not only to exist.

### Alternative A — <name>

| Axis | Answer |
|---|---|
| Meets the requirement | yes / partly / no — which scenarios, with the evidence |
| Deployment ease | one command or several; managed or self-hosted |
| Monthly infra cost | today and at 10x, linking the row in `docs/technical/infra-cost.md` |
| Cost to operate | patches, backups, monitoring, who does it |
| Corrective maintenance cost | the team knows it; it is reproduced and debugged locally; community and support |
| Lock-in and exit | what it takes to leave: data format, API, time |

### Alternative B — <name>

Same six axes.

## Decision and why

The alternative chosen and the axes that decided it. What is accepted as a cost. What would make the team
revisit it (a number, a date, an event).
