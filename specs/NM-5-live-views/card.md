# NM-5 · the views chip live

status: proposed
cap: 30 min
sources: the requester's message in the session (text, no Jira card); NahuelMosse/profile-widgets PW-8, which serves the views chip at lab.nawi.dev/api/profile/views.svg, counting each view with komarev.com and never cached
not_read: none

## Specs

- S1 · "es que hay cosas que si se actualizan cada 30 mins estan bien, pero las visitas se deberian actualizar todo el tiempo"
- NM-5-ASM-01 · the fourth chip of the links row is the live views widget of the lab, which is komarev's counter itself; the invisible komarev pixel goes, or each view would count twice; the daily drawing of the chip in scripts/live.mjs and its kept count (data/views.json, assets/live/views.*.svg) go with it · S1

## Look

- ref: the README as it renders today; the chip keeps its drawing (PW-8 draws it byte for byte as scripts/live.mjs did) · NM-5-ASM-01
- behavior: load · unchanged
- tokens: unchanged
- copy: unchanged

## Log

- L1 · es que hay cosas que si se actualizan cada 30 mins estan bien, pero las visitas se deberian actualizar todo el tiempo
