// The single registry of finding kinds. SKILL.md's table is checked against it by the tests.
// source: 'frames' = measured from the per-frame trace, 'pixels' = screenshot or computed-style
// comparison, 'css' = read from declared CSS, 'events' = Animation objects and DOM events.
export const LEVELS = ['off', 'info', 'warning', 'error'];

export const KINDS = {
  'no-feedback': { level: 'error', source: 'pixels', user: 'Hover changes nothing on a button: the UI feels dead (links: warning; inputs: not reported)' },
  'no-press-feedback': { level: 'warning', source: 'pixels', user: 'Press changes nothing on a button (links and inputs: not reported)' },
  'no-focus-feedback': { level: 'error', source: 'pixels', user: 'Keyboard focus is invisible' },
  'hover-only-control': { level: 'warning', source: 'pixels', user: 'A control revealed only by pointer hover stays invisible when it gets keyboard focus' },
  snaps: { level: 'warning', source: 'css', user: 'Feedback exists but jumps: the changed properties have no transition' },
  'layout-animated': { level: 'error', source: 'frames', user: 'Width, height, top, margin, padding or font animate: neighbours shift and layout runs every frame' },
  'long-frame': { level: 'error', source: 'frames', user: 'A frame over 50 ms during hover, a click transition or scroll (warning on a dev build)' },
  'ease-in': { level: 'error', source: 'css', user: 'The response starts slow: declared curve or measured trajectory' },
  duration: { level: 'warning', source: 'css', user: 'Declared duration outside the band for the gesture (hover 80-300, press 50-200, focus up to 250 ms)' },
  linear: { level: 'warning', source: 'css', user: 'A transform or opacity transition declared linear: mechanical' },
  'transition-all': { level: 'warning', source: 'css', user: '`transition: all` animates whatever changes, layout included' },
  'inconsistent-duration': { level: 'warning', source: 'css', user: 'Same kind of control and gesture with declared durations 1.5x and 60 ms apart' },
  jump: { level: 'error', source: 'frames', user: 'A frame moves several times faster than a smooth curve allows: a teleporting animation' },
  'interrupt-jump': { level: 'error', source: 'events', user: 'Leaving hover mid-way, or clicking again mid-transition, jumps instead of reversing' },
  'not-interruptible': { level: 'error', source: 'events', user: 'A toggle clicked back part-way through its motion restarts from the other end (needs --interact)' },
  'ungated-hover': { level: 'warning', source: 'css', user: '`:hover` moves things outside `@media (hover: hover)`: it sticks after a tap on touch screens' },
  'reduced-motion-moves': { level: 'error', source: 'css', user: 'With prefers-reduced-motion a press still translates, rotates or scales by more than 6 %' },
  'reduced-motion-residue': { level: 'error', source: 'css', user: 'With prefers-reduced-motion a transform stays after release' },
  'reduced-motion-loop': { level: 'error', source: 'events', user: 'An infinite moving animation keeps running under reduced motion (small rotate-only spinners excepted)' },
  'reduced-motion-hidden': { level: 'error', source: 'pixels', user: 'Content waits for an entrance that reduced motion skipped: it stays at opacity 0' },
  'reduced-motion-missing': { level: 'warning', source: 'css', user: 'Things move and no readable stylesheet has a reduced-motion rule (info when some sheets are unreadable)' },
  'no-entrance': { level: 'info', source: 'events', user: 'A section below the fold appears without an entrance (opt-in with --entrances; never fails the run)' },
  inconclusive: { level: 'warning', source: 'frames', user: 'The frames were too sparse to confirm or rule out a finding (its `check`): rerun on a quieter machine, without --cpu; never fails the run' },
  'click-target': { level: 'error', source: 'pixels', user: 'The --click selector matches nothing visible' },
};

export const kindNames = () => Object.keys(KINDS);
