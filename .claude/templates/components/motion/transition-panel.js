// Transition panel (Motion Primitives): steps that slide past each other. The step that arrives comes
// in from the side it is ahead in, with a spring; the one that leaves slides out the other way and
// fades, taken out of the flow so it does not push the new one; the card's height follows the step
// that stays. A step interrupted mid-way hands over from where it is.
//
// The height is the final one from the first frame: the card's surface scales to it, what sits under the
// steps moves to its place and the steps are shown through a clip that follows the height, all with
// transform and clip-path.
//
// Markup: a root `[data-motion="transition-panel"]` with `[data-tp="viewport"]` holding the
// `[data-tp="step"]` panels (optional `data-title`), and buttons `[data-tp="prev"]` and
// `[data-tp="next"]` (its `data-last-label` is the text on the last step).
// mount(root, { index, stepLabel(i, n, title), surface, follow, onChange }) -> { go(i), index, destroy }.
// `surface` is the element whose ::before is the card's surface (the root by default); a dialog that
// draws its own passes itself. `follow` lists what else sits around the panel and moves with the height
// (the head of that dialog). Emits `transition-panel:change` { index } and, on Next in the last step,
// `transition-panel:done`.
import { reduced } from '../core.js';
import { springCurve } from './mp-morph.js';
import { flipClip, flipMove, flipSurface, rectOf, surfaceRect, visibleRect } from './flip-size.js';

const SPRING = springCurve({ stiffness: 300, damping: 30, mass: 1 });
const FADE = 200;
const handles = new WeakMap();

export function mount(root, opts = {}) {
  if (handles.has(root)) return handles.get(root);
  const viewport = root.querySelector('[data-tp="viewport"]');
  const steps = [...viewport.querySelectorAll(':scope > [data-tp="step"]')];
  const prev = root.querySelector('[data-tp="prev"]');
  const next = root.querySelector('[data-tp="next"]');
  const nextLabel = next?.textContent.trim();
  const lastLabel = next?.dataset.lastLabel;
  const stepLabel = opts.stepLabel ?? ((i, n, title) => `Step ${i} of ${n}${title ? `: ${title}` : ''}`);
  const surfaceHost = opts.surface ?? root;
  const status = Object.assign(document.createElement('div'), { className: 'tpanel__status' });
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  root.append(status);
  // What comes after the steps in their container (the footer) rides the height down or up.
  const below = [...viewport.parentElement.children].slice([...viewport.parentElement.children].indexOf(viewport) + 1).filter((n) => n !== status);
  const around = opts.follow ?? [];
  let index = Math.min(steps.length - 1, Math.max(0, opts.index ?? 0));
  let sizeAnims = [];
  const stopSize = () => { for (const a of sizeAnims) a.cancel(); sizeAnims = []; };

  steps.forEach((step, i) => {
    step.setAttribute('role', 'group');
    step.setAttribute('aria-label', stepLabel(i + 1, steps.length, step.dataset.title));
    park(step, i !== index);
  });

  function park(step, away) {
    step.hidden = away;
    step.toggleAttribute('inert', away);
    step.classList.remove('tpanel__leaving');
    step.removeAttribute('aria-hidden');
  }
  // Where a step is right now, whatever animation is running on it.
  const nowOf = (step) => {
    const cs = getComputedStyle(step);
    return { x: new DOMMatrix(cs.transform).m41, o: Number(cs.opacity) };
  };
  const settleStyle = (step) => { for (const a of step.getAnimations()) a.cancel(); };

  // `hold` keeps the end frame until the step is parked, so a leaving step never flashes back.
  const slide = (step, from, to, fromOpacity, toOpacity, hold = false) => {
    const fill = hold ? 'forwards' : 'none';
    if (reduced()) return [step.animate([{ opacity: fromOpacity }, { opacity: toOpacity }], { duration: 120, easing: 'ease-out', fill })];
    return [
      step.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], { duration: SPRING.duration, easing: SPRING.easing, fill }),
      step.animate([{ opacity: fromOpacity }, { opacity: toOpacity }], { duration: FADE, easing: 'ease-out', fill }),
    ];
  };

  function go(to) {
    to = Math.min(steps.length - 1, Math.max(0, to));
    if (to === index) return;
    const dir = to > index ? 1 : -1;
    const leaving = steps[index];
    const arriving = steps[to];
    index = to;
    const width = viewport.offsetWidth;
    const was = { surface: surfaceRect(surfaceHost), view: visibleRect(viewport), below: below.map(rectOf), around: around.map(rectOf) };
    stopSize();

    const out = nowOf(leaving);
    settleStyle(leaving);
    leaving.classList.add('tpanel__leaving');
    leaving.setAttribute('aria-hidden', 'true');
    leaving.setAttribute('inert', '');
    const exits = slide(leaving, out.x, -dir * width, out.o, 0, true);
    Promise.all(exits.map((a) => a.finished)).then(() => { if (leaving.classList.contains('tpanel__leaving')) { settleStyle(leaving); park(leaving, true); } }, () => {});

    const wasLeaving = arriving.classList.contains('tpanel__leaving');
    const entering = wasLeaving ? nowOf(arriving) : { x: dir * width, o: 0 };
    settleStyle(arriving);
    park(arriving, false);
    const enters = slide(arriving, entering.x, 0, entering.o, 1);
    enters[0].finished.catch(() => {});

    if (!reduced()) {
      const timing = { duration: SPRING.duration, easing: SPRING.easing };
      sizeAnims = [
        flipSurface(surfaceHost, was.surface, timing),
        flipClip(viewport, was.view, undefined, timing),
        ...below.map((n, i) => flipMove(n, was.below[i], timing)),
        ...around.map((n, i) => flipMove(n, was.around[i], timing)),
      ].filter(Boolean);
    }
    sync();
    status.textContent = stepLabel(index + 1, steps.length, arriving.dataset.title);
    opts.onChange?.(index);
    root.dispatchEvent(new CustomEvent('transition-panel:change', { detail: { index }, bubbles: true }));
  }

  function sync() {
    if (prev) prev.hidden = index === 0;
    if (next && lastLabel) next.textContent = index === steps.length - 1 ? lastLabel : nextLabel;
    root.dataset.index = String(index);
  }
  sync();

  const onPrev = () => go(index - 1);
  const onNext = () => {
    if (index === steps.length - 1) root.dispatchEvent(new CustomEvent('transition-panel:done', { bubbles: true }));
    else go(index + 1);
  };
  const lifetime = new AbortController();
  prev?.addEventListener('click', onPrev, { signal: lifetime.signal });
  next?.addEventListener('click', onNext, { signal: lifetime.signal });

  const handle = {
    go,
    get index() { return index; },
    destroy() {
      handles.delete(root);
      lifetime.abort();
      stopSize();
      for (const step of steps) { settleStyle(step); step.hidden = false; step.removeAttribute('inert'); step.removeAttribute('aria-hidden'); step.removeAttribute('role'); step.removeAttribute('aria-label'); step.classList.remove('tpanel__leaving'); }
      status.remove();
      delete root.dataset.index;
    },
  };
  handles.set(root, handle);
  return handle;
}

// Imported without a call to mount(), it mounts every marked root once the importing module has run.
if (typeof document !== 'undefined') queueMicrotask(() => { for (const el of document.querySelectorAll('[data-motion="transition-panel"]')) mount(el); });
