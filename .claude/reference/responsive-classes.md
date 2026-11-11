# Responsive classes: each width is designed as native

Mobile first, and every class native: never a desktop shrunk, never a phone stretched. The class depends on the window width, not on the device.
`design-round.mjs` measures the ones marked `[round]`; the rest are read in the captures.

## The classes (Material 3 window size classes)
| Class | Width | Navigation | Layout | Controls | Margins |
|---|---|---|---|---|---|
| compact | < 600 | bottom bar with 3-5 destinations, or a menu with a visible label | 1 panel; list-detail shows list or detail with Back; 1-column feed | touch, 44x44 px or more | 16 px |
| medium | 600-839 | collapsed rail (3-7) or a centered bar | 1 panel in list-detail; multi-column feed | touch first; hover is an extra | 24 px |
| expanded | 840-1199 | rail or sidebar visible, no hamburger | list-detail with 2 panels side by side | touch or pointer: targets stay large | 24 px |
| large, extra-large | >= 1200 | sidebar or expanded rail visible, no hamburger | several panels; what mobile hides in overflow is shown | pointer, click 24 px or more, controls of 28-32 px | 24 px |

Round widths: 390, 768, 1024 and 1440.

## Rules, each with its check
1. **The base CSS is the phone.** Desktop enters with `@media (min-width: …)`. A sheet dominated by `max-width` is a shrunk desktop. [round] media queries: `max-width` outnumbering `min-width` says «desktop-first».
2. **Touch targets in compact: 44x44 px or more, 8 px apart** (HIG, M3; WCAG 2.5.5 is AAA). [round] interactive elements under 44x44 at the mobile width, listed.
3. **Click targets in desktop: 24x24 px or more** (WCAG 2.5.8, AA); controls of 28-32 px are native. All controls at 48 or more is a stretched mobile. [round] at >= 1200 a control of 24 or less fails, and a median button height of 48 or more fails.
4. **Nothing appears only with hover.** What hover reveals is also reached by tap and by focus (`:focus-within`, `:focus-visible`); hover effects go in `@media (hover: hover)`. [round] `:hover` rules that change `display`, `visibility` or `opacity` of a descendant with no focus twin.
5. **Inputs of 16 px or more** so iOS does not zoom, with the right `type`, `inputmode` and `autocomplete`. [round] inputs, selects and textareas under 16 px.
6. **No horizontal scroll** at 320, 360 and 390 px. [round] `scrollWidth > clientWidth` of the document at 320 and 390.
7. **Primary CTA in compact: in the first viewport at 390, reachable by thumb** (`reference/cta.md`). Below the fold it is repeated after each objection. The lower half of the screen is a recommendation, never a failure: the center of the screen is what is touched most. A fixed bar at the bottom only on a product or order page, with the selection inside (flavor, quantity, price), or on a sales landing that has a product or flavor selection; discouraged on any other home or landing. [round] the first primary button or link must fall inside the first viewport.
8. **Priority in the first screen:** the first thing seen on a phone is what the person came to do.
9. **Mobile components where they belong:** sheets (not popovers) in compact, popovers or panels from 840; horizontal scroll with snap; large controls. Nothing critical glued to the bottom edge on desktop.
10. **Safe areas:** `env(safe-area-inset-*)` on fixed bars.
11. **Fixed layers cover 20 % of the mobile viewport at most.** [round] share of the viewport covered by fixed or sticky elements.
12. **Navigation by class.** [round] compact: bottom bar or labeled menu, not a bare hamburger; expanded and up: no hamburger.
13. **Same functions at every width.** Only how many are in view changes: whatever exists at 1440 exists at 390, visible or in a menu.
14. **Desktop is reachable by keyboard:** everything with Tab, visible focus, standard shortcuts (Esc closes, Enter submits, `/` or Ctrl+K searches). Right click and tooltips repeat visible actions, never the only path.
15. **Reading width:** running text under about 75 characters per line on wide screens; extra space goes to panels, not to longer lines.
16. **Desktop is composed, not a stretched phone.** From 1200 the hero content (text and media of the first viewport) spans half the width or more, and at least two sections have another number of columns than at 390 (three sections or more measured). [round] `desktop hero span` and `desktop composition: sections recomposed from 390`, from `measureLayout` at each width.

## Forms, navigation, tables
- **Forms.** Compact: one column, label above the field, no label inside the field, the keyboard set by `type` and `inputmode`, no data split across fields. Desktop: one main column, short pairs on a line (city and zip), Tab in order, Enter submits.
- **Navigation.** Compact: bottom bar of 3-5, or a menu labeled «Menu»; the location is a clear title or breadcrumb. Wide: sidebar, full menus, shortcuts.
- **Tables.** Compact: only the columns understood without zoom, a fixed header, a fixed first column and a hint when it scrolls sideways, or cards when nothing is compared; never document overflow. Desktop: the whole table, sortable, row hover as a help and never the only access to actions.
