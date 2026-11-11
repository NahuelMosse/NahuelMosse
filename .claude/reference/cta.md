# The primary CTA: findable, then crafted

The primary call to action is the most worked piece of a landing, not the biggest. It is found by isolation and it seduces through what
happens after the tap. Evidence: findability and size are measured studies; the gesture and the idle life are taste, to be judged blind. Measured on the 39 commercial sites of
49 Awwwards winners, 2025-2026 (the CTA is reliable at 390 in 23); none of these variables correlates with the jury score.

## Findable (strong evidence)

- **Isolated by position or by treatment** (`*`: 2 of 23 winners have a treatment no other control shares; the rest stand out by position, type or an accent pill): a place of its own, or no other control with the same fill, radius and border; a fill is at least 3:1 against its surroundings.
- **In the first viewport at 390** (844 tall); on a landing or sales page, repeated after each objection, at most every 3 screens. A phone thumb reaches it; the lower half is a recommendation, never a failure. A product screen follows `modern-interface.md`.
- **Size:** at least 48 px tall at 390 (56 desirable), 44 px is the floor of any touch target.
- **Label with a verb:** verb plus object («Book a demo», «Order the box»). Never «Ver más» or «Click here». Data on the button (a price, a choice) only where the choice is there; it is never required: 0 of 23 winners carry a datum.

## The gesture after the tap (taste, no conversion study)

The gesture is derived from the product's own action: what the product does when chosen, or the control turning into the next step without navigating.
Reference timings:
- Press: the value of `modern-interface.md`, never from scale 0.
- If the gesture has a rebound or an object that flies to its destination: rebound 0.6-0.7 s, flight 0.7 s along an arc; confirmation within 700 ms.
- Frames at 0, 150, 400 and 900 ms show the sequence; the selection, where there is one, changes label and color of the control in 400 ms or less.
- A tap and a keyboard (Enter, Space) reach the same result; `prefers-reduced-motion` keeps the flow without movement.

## Idle, sound, haptics

- At most one idle animation: 4 px or less, period 3 s or more, off under `prefers-reduced-motion`. Check: infinite `getAnimations()`, at most 1.
- Sound only after a gesture (never autoplay), synthesized, with a visible toggle; never the only channel.
- Haptics (`navigator.vibrate(15-30)`) as progressive enhancement where it exists; nothing depends on it.

## Sticky bar

A fixed bar only with the selection inside (variant, quantity, price): on a product or order page, and on a sales landing that has a product or variant selection. Elsewhere it adds nothing and is discouraged:
on a landing with nothing to select the CTA lives in the hero and repeats down the page.
