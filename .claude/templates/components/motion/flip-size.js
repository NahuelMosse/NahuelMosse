// A box that changes size without animating layout. The layout is already final when these run; what the
// person sees travels from where each thing was to where it is, with transform, clip-path and
// border-radius, which never ask the page for a new layout while they run.
//
// Order at every call site: measure what is on screen (`rectOf`, `surfaceRect`, `visibleRect`), cancel
// the animations still running, change the DOM, then call the flips with what was measured.
//
// A box's surface (its background, radius and shadow) is the `::before` of the box, anchored at its
// top-left: `flipSurface` scales it from the old box to the new one and corrects its corners, so the
// radius is the box's all along. What the box holds is never scaled: it moves with `flipMove` and is
// shown through a clip that `flipClip` grows or withdraws.
const STEPS = 16;
const lerp = (a, b, p) => a + (b - a) * p;

export const rectOf = (el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

// Where the surface of `host` is painted right now, whatever animation is running on it.
export const surfaceRect = (host) => {
  const r = rectOf(host);
  const m = new DOMMatrix(getComputedStyle(host, '::before').transform);
  return { left: r.left + m.e, top: r.top + m.f, width: r.width * m.a, height: r.height * m.d };
};

// The part of `el` that is shown right now: its box, moved by its transform and cut by its clip-path.
export const visibleRect = (el) => {
  const r = rectOf(el);
  const inset = /^inset\(([^)]*?)(?: round [^)]*)?\)$/.exec(getComputedStyle(el).clipPath);
  if (!inset) return r;
  const [top, right = top, bottom = top, left = right] = inset[1].trim().split(/\s+/).map(parseFloat);
  return { left: r.left + left, top: r.top + top, width: r.width - left - right, height: r.height - top - bottom };
};

// The surface of `host` goes from the box `from` to the one it has now.
export const flipSurface = (host, from, timing) => {
  const to = rectOf(host);
  const radius = parseFloat(getComputedStyle(host, '::before').borderTopLeftRadius) || 0;
  const sx0 = Math.max(from.width, 0.5) / Math.max(to.width, 0.5);
  const sy0 = Math.max(from.height, 0.5) / Math.max(to.height, 0.5);
  const keyframes = Array.from({ length: STEPS + 1 }, (_, i) => {
    const p = i / STEPS;
    const sx = lerp(sx0, 1, p);
    const sy = lerp(sy0, 1, p);
    return { offset: p, transform: `translate(${lerp(from.left - to.left, 0, p)}px, ${lerp(from.top - to.top, 0, p)}px) scale(${sx}, ${sy})`, borderRadius: `${radius / sx}px / ${radius / sy}px` };
  });
  return host.animate(keyframes, { ...timing, pseudoElement: '::before' });
};

// `el` comes from where it was to where it is.
export const flipMove = (el, from, timing) => {
  const to = rectOf(el);
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  if (!dx && !dy) return null;
  return el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], timing);
};

// `el` is at its final place and shows the box `from` of itself, which becomes the box `to` (the one it has
// now, unless the content is withdrawn). The clip is anchored at its top-left, as a box that grows is.
export const flipClip = (el, from, to, timing, round = '0px') => {
  const at = rectOf(el);
  const shown = to ?? at;
  const cut = (box) => `inset(0px ${at.width - box.width}px ${at.height - box.height}px 0px round ${round})`;
  return el.animate([
    { transform: `translate(${from.left - at.left}px, ${from.top - at.top}px)`, clipPath: cut(from) },
    { transform: `translate(${shown.left - at.left}px, ${shown.top - at.top}px)`, clipPath: cut(shown) },
  ], timing);
};
