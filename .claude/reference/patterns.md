# Patterns: when to use what

Knowing how a modal looks does not answer *when* a modal is used. Patterns make the product
**behave** consistently, not only look consistent: “things behave as I expect them to behave in
this product” is what makes Linear feel like Linear. Each project's design line lists the patterns
it uses; these are the defaults.

## Confirming an action

| The action is | Pattern |
|---|---|
| Reversible | No dialog: do it, and a toast with **Undo** |
| Destructive | A confirmation dialog that names what is lost: “Delete invoice #427-012?” with the destructive button named by its verb |
| Very destructive (an account, a project with data) | Typed confirmation: write the name to enable the button |

## Waiting

| The answer takes | Pattern |
|---|---|
| Under 150 ms | Nothing |
| 150 ms – 1 s | Skeleton with the real shape, or subtle progress in the control that started it; delay and minimum stay per `ui-patterns.md` UX-CARGA-1 |
| Over 1 s | Explicit: what is happening; over 10 s, how much is left and how to cancel |
| Safe and reversible | Optimistic: show the result at once, confirm in the background, roll back visibly if it fails |

## Editing

| What is edited | Pattern |
|---|---|
| A simple value | Inline: click or Enter, Enter or blur saves, Escape cancels, `Saving… → Saved` |
| A complex object | Side panel (drawer) beside the list, without losing it |
| A new workflow | Its own page |
| A dangerous setting | A dialog that says the consequence |

## Feedback after acting

- Success that the screen already shows (the row changed) needs no toast; success that is not
  visible gets one.
- An error stays where it happened —next to the field, in the row— and says what to do; a toast
  only for what has no place. Errors do not leave on their own.
- A long operation in the background notifies when it ends, wherever the user is.

## Empty, error and first use

- **Empty**: what is missing, when it appears, and the action that creates the first one —its label
  mirrors the title—.
- **No results**: different from empty: says the filter excluded everything and offers to clear it.
- **No permission**: says who can grant it; the control is not rendered when it cannot be used.
- **Error loading**: what failed without jargon, and Retry.

## Navigation and continuity

- What opens from something comes from it: row → detail panel, button → popover, card → panel.
- Tabs and segmented controls: one indicator that slides; the content changes in place.
- Lists: J/K or arrows move the selection; Enter opens; Escape returns.
- A command menu (⌘K) when the product has many actions; it opens at once.
- Going back restores where the user was: scroll, selection, filters.

## A record with many fields

- The decision first: the key facts in a header that stays, the exceptions under it, each linked to its section.
- Groups by decision, a nav to them that stays and marks the current one; context in a narrow column.
- One disclosure level inside a section; what is rarely read (documents, history) loads when opened.
- On a phone: two or three facts in the header, columns stacked, the decision at the thumb (`record.html`).

## Filtering and searching

- Results update as the user types (debounced ~150 ms) and the count changes with them.
- The active filters are visible and removable one by one; clearing all is one action.
- Charts and figures update with the filter (Mercury Insights), they do not reload the page.

## Destructive and bulk actions

- Selecting several rows shows a bar with the actions for all of them and the count.
- Deleting many: one toast with Undo for all, not one per row.
