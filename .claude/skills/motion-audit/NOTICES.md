# Notices

No third-party text or code is included. `skills/motion-audit/scripts` is original code (a motion audit and frame tracer).

Ideas that also appear in published work, credited here:

- Easing by gesture (strong ease-out for responses, never ease-in on UI), sub-300 ms UI durations, `scale(0.97)` press
  feedback, gating hover motion behind `(hover: hover) and (pointer: fine)`, reduced motion as "gentler, not zero":
  Emil Kowalski, *animations.dev* and `emilkowalski/skills` (`review-animations`, MIT).
- Interruptible motion that starts from the presentation value: Apple, *Designing Fluid Interfaces* (WWDC 2018), as
  summarised in `emilkowalski/skills` (`apple-design`, MIT).
- Grading animations by render-pipeline cost (compositor vs. paint vs. layout) and measuring at runtime in a headless
  browser: Motion's MotionScore (https://motion.dev/docs/motionscore) and the `motion` skill
  (https://github.com/motiondivision/ai-kit, MIT).
- Layout thrash, compositor-only properties and scroll-linked motion rules: `fixing-motion-performance`
  (https://github.com/ibelick/ui-skills).
- Long Animation Frames as the jank signal: the W3C Long Animation Frames API
  (https://developer.chrome.com/docs/web-platform/long-animation-frames).
