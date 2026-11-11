// Dragging and sorting, the way dnd-kit and Animate UI do it, in plain DOM. A pointer lifts an item out of
// its list by its handle: the item takes `position: fixed` where it was and follows the pointer, a
// placeholder of its real size holds the gap, the neighbours slide to make room with FLIP on the list
// spring, and on release the item drops into the gap on the drag spring. A box that scrolls under the item
// scrolls when the pointer is near its edge. The keyboard does the same without a pointer: Space grabs,
// the arrows move, Space drops, Escape gives the item back, and every step goes to an `aria-live` region.
// What moves is told by one event on the root, `reorder`, with `{ item, from, to }` (each a `{ list,
// index }`), fired only when the place changed. The look of a lifted item is the stylesheet's
// (`[data-dragging]`, `[data-grabbed]`, `.drag-placeholder`); the numbers are tokens (`--spring-drag`,
// `--drag-lift`, `--drag-tilt`, `--drag-edge`, `--drag-speed`, `--drag-idle`, `--drag-threshold`).
import { reduced, css, ms, follower, springOf, flip, messages } from './core.js';

const number = (name, fallback) => parseFloat(css(name)) || fallback;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

// Where an element sits in the layout without the transform a running FLIP puts on it.
const layoutRect = (el) => {
  const r = el.getBoundingClientRect();
  const m = new DOMMatrix(getComputedStyle(el).transform);
  return { left: r.left - m.m41, top: r.top - m.m42, width: r.width, height: r.height };
};

// The boxes that can scroll under a dragged item, innermost first, and the page last.
const scrollersOf = (el) => {
  const out = [];
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) out.push(n);
  }
  out.push(document.scrollingElement);
  return out;
};

export const dragSort = (root, { lists = () => [root], item: itemSelector, handle: handleSelector, zone = (list) => list, label = (list) => list.getAttribute('aria-label') ?? '' }) => {
  const status = Object.assign(document.createElement('div'), { className: 'visually-hidden' });
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('data-sortable-status', '');
  root.after(status);
  const itemsOf = (list) => [...list.children].filter((n) => n.matches(itemSelector));
  const everyItem = () => lists().flatMap(itemsOf);
  const nameOf = (item) => item.dataset.name ?? item.textContent.trim().replace(/\s+/g, ' ');
  const where = (item) => { const list = item.parentElement; const own = itemsOf(list); return { list, index: own.indexOf(item), total: own.length }; };
  const emit = (item, from) => {
    const to = where(item);
    if (from.list !== to.list || from.index !== to.index) root.dispatchEvent(new CustomEvent('reorder', { detail: { item, from: { list: from.list, index: from.index }, to: { list: to.list, index: to.index } } }));
    return to;
  };
  const slide = (change, extra = []) => flip([...everyItem(), ...extra], change, ms('--motion-list', 320), css('--spring-list'));
  let active = null;

  // ── The pointer ──
  const drag = (item, grip, down) => {
    const from = where(item);
    const origin = { list: from.list, next: item.nextElementSibling };
    const start = { x: down.clientX, y: down.clientY };
    const edge = number('--drag-edge', 56);
    const speed = number('--drag-speed', 18);
    const lean = number('--drag-tilt', 2);
    const raised = number('--drag-lift', 1.02);
    const idle = ms('--drag-idle', 70);
    const spring = springOf('--spring-drag', '420 28 1');
    let rect = null;
    let placeholder = null;
    let saved = null;
    let scrollers = [];
    let target = from.list;
    let px = start.x;
    let py = start.y;
    let lastX = start.x;
    let lastAt = 0;
    let lastMove = 0;
    let vx = 0;
    let raf = 0;
    let dropTo = null;
    let posDone = false;
    let liftDone = false;
    let lifted = false;

    const land = () => {
      const focused = document.activeElement === item;
      placeholder.replaceWith(item);
      if (saved === null) item.removeAttribute('style'); else item.setAttribute('style', saved);
      item.removeAttribute('data-dragging');
      item.removeAttribute('data-dropping');
      for (const l of lists()) zone(l).removeAttribute('data-over');
      document.documentElement.removeAttribute('data-drag-active');
      document.removeEventListener('keydown', onKey, true);
      active = null;
      if (focused) item.focus({ preventScroll: true });
      const to = emit(item, from);
      status.textContent = messages.dropped(nameOf(item), to.index + 1, to.list !== from.list ? label(to.list) : undefined);
    };
    const settle = () => { if (dropTo && posDone && liftDone) land(); };
    const move = follower(spring, ([x, y]) => {
      item.style.translate = `${x}px ${y}px`;
      if (dropTo && x === dropTo[0] && y === dropTo[1]) { posDone = true; settle(); }
    }, 0.2);
    const tilt = follower(spring, ([deg, scale]) => {
      item.style.rotate = `${deg}deg`;
      item.style.scale = String(scale);
      if (dropTo && deg === 0 && scale === 1) { liftDone = true; settle(); }
    }, 0.002);

    const liftOff = () => {
      lifted = true;
      rect = item.getBoundingClientRect();
      saved = item.getAttribute('style');
      placeholder = document.createElement(item.tagName);
      placeholder.className = 'drag-placeholder';
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.style.height = `${rect.height}px`;
      item.before(placeholder);
      item.setAttribute('data-dragging', '');
      Object.assign(item.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      // A transformed ancestor would make `fixed` mean "inside me": the item is put back where it was.
      const at = item.getBoundingClientRect();
      item.style.left = `${rect.left + (rect.left - at.left)}px`;
      item.style.top = `${rect.top + (rect.top - at.top)}px`;
      document.documentElement.setAttribute('data-drag-active', '');
      document.addEventListener('keydown', onKey, true);
      scrollers = scrollersOf(item);
      move.to([0, 0], true);
      if (!reduced()) { tilt.to([0, 1], true); tilt.to([0, raised]); }
      lastAt = performance.now();
      lastMove = lastAt;
      raf = requestAnimationFrame(frame);
    };

    // The box under the pointer that has room to scroll in the direction of the nearest edge scrolls that way,
    // faster the closer to the edge (and the farther past it).
    const autoscroll = () => {
      const pace = (dist) => Math.round(speed * clamp((edge - dist) / edge, 0, 1));
      for (const s of scrollers) {
        const page = s === document.scrollingElement;
        const r = page ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight } : s.getBoundingClientRect();
        if (px >= r.left - edge && px <= r.right + edge) {
          if (py < r.top + edge && s.scrollTop > 0) s.scrollTop -= pace(py - r.top);
          else if (py > r.bottom - edge && s.scrollTop + s.clientHeight < s.scrollHeight - 1) s.scrollTop += pace(r.bottom - py);
        }
        if (py >= r.top - edge && py <= r.bottom + edge) {
          if (px < r.left + edge && s.scrollLeft > 0) s.scrollLeft -= pace(px - r.left);
          else if (px > r.right - edge && s.scrollLeft + s.clientWidth < s.scrollWidth - 1) s.scrollLeft += pace(r.right - px);
        }
      }
    };

    // The list under the pointer, and where in it the item's center falls: the placeholder goes before the first
    // neighbour whose middle is below that center.
    const retarget = () => {
      const all = lists();
      const hit = all.length === 1 ? all[0] : all.find((l) => inside(zone(l).getBoundingClientRect(), px, py));
      if (hit) target = hit;
      if (all.length > 1) for (const l of all) zone(l).toggleAttribute('data-over', l === target);
      const center = rect.top + rect.height / 2 + (py - start.y);
      const peers = itemsOf(target).filter((n) => n !== item);
      const before = peers.find((n) => { const r = layoutRect(n); return center < r.top + r.height / 2; }) ?? null;
      let next = placeholder.nextElementSibling;
      while (next && (next === item || !next.matches(itemSelector))) next = next.nextElementSibling;
      if (placeholder.parentElement === target && next === before) return;
      slide(() => { if (before) before.before(placeholder); else target.append(placeholder); }, [placeholder]);
    };

    const frame = () => {
      raf = 0;
      if (dropTo) return;
      autoscroll();
      retarget();
      if (!reduced()) tilt.to([performance.now() - lastMove > idle ? 0 : clamp(vx * 2, -lean, lean), raised]);
      raf = requestAnimationFrame(frame);
    };

    const onMove = (e) => {
      if (e.pointerId !== down.pointerId || dropTo) return;
      px = e.clientX;
      py = e.clientY;
      if (!lifted) {
        if (Math.hypot(px - start.x, py - start.y) < number('--drag-threshold', 4)) return;
        liftOff();
        lastX = px;
      }
      const now = performance.now();
      vx = vx * 0.7 + ((px - lastX) / Math.max(1, now - lastAt)) * 0.3;
      lastX = px;
      lastAt = now;
      lastMove = now;
      move.to([px - start.x, py - start.y], true);
    };

    // Released: the item goes to the placeholder, which is where it will be. Cancelled (Escape, the pointer
    // taken away): the placeholder goes back to where the item began and the item follows it.
    const release = (cancelled) => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onCancel);
      grip.removeEventListener('lostpointercapture', onUp);
      if (!lifted) { active = null; return; }
      if (dropTo) return;
      cancelAnimationFrame(raf);
      if (cancelled) slide(() => { if (origin.next) origin.next.before(placeholder); else origin.list.append(placeholder); }, [placeholder]);
      const slot = layoutRect(placeholder);
      dropTo = [slot.left - rect.left, slot.top - rect.top];
      item.setAttribute('data-dropping', '');
      move.to(dropTo, reduced());
      tilt.to([0, 1], reduced());
    };
    const onUp = () => release(false);
    const onCancel = () => release(true);
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); release(true); } }

    try { grip.setPointerCapture(down.pointerId); } catch { /* the pointer is already gone */ }
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onCancel);
    grip.addEventListener('lostpointercapture', onUp);
  };

  root.addEventListener('pointerdown', (e) => {
    if (active || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const grip = e.target.closest?.(handleSelector);
    const item = grip?.closest(itemSelector);
    if (!item || !root.contains(item) || item.hasAttribute('data-grabbed')) return;
    e.preventDefault();
    active = item;
    drag(item, grip, e);
  });
  root.addEventListener('dragstart', (e) => e.preventDefault());

  // ── The keyboard ──
  const grabbedFrom = new WeakMap();
  const settleFocus = (item) => { item.focus({ preventScroll: true }); item.scrollIntoView({ block: 'nearest', inline: 'nearest' }); };
  const stepItem = (item, axis, dir) => {
    const here = where(item);
    const all = lists();
    let list = here.list;
    let index = here.index;
    if (axis === 'y') {
      const next = clamp(index + dir, 0, here.total - 1);
      if (next === index) return;
      index = next;
    } else {
      const at = all.indexOf(list) + dir;
      if (at < 0 || at >= all.length) return;
      list = all[at];
      index = Math.min(index, itemsOf(list).length);
    }
    slide(() => { const next = itemsOf(list).filter((n) => n !== item)[index] ?? null; if (next) next.before(item); else list.append(item); });
    settleFocus(item);
    const to = where(item);
    status.textContent = messages.moved(nameOf(item), to.index + 1, to.total, to.list !== here.list ? label(to.list) : undefined);
  };
  root.addEventListener('keydown', (e) => {
    const item = e.target;
    if (!item.matches?.(itemSelector) || !root.contains(item)) return;
    const grabbed = item.hasAttribute('data-grabbed');
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!grabbed) {
        grabbedFrom.set(item, { ...where(item), next: item.nextElementSibling });
        item.setAttribute('data-grabbed', '');
        item.setAttribute('aria-grabbed', 'true');
        status.textContent = messages.grabbed(nameOf(item));
        return;
      }
      const from = grabbedFrom.get(item);
      item.removeAttribute('data-grabbed');
      item.setAttribute('aria-grabbed', 'false');
      const to = emit(item, from);
      status.textContent = messages.dropped(nameOf(item), to.index + 1, to.list !== from.list ? label(to.list) : undefined);
      return;
    }
    if (!grabbed) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      const from = grabbedFrom.get(item);
      item.removeAttribute('data-grabbed');
      item.setAttribute('aria-grabbed', 'false');
      slide(() => { if (from.next && from.next.parentElement === from.list) from.next.before(item); else from.list.append(item); });
      settleFocus(item);
      status.textContent = messages.dragCancelled(nameOf(item));
      return;
    }
    const move = { ArrowUp: ['y', -1], ArrowDown: ['y', 1], ArrowLeft: ['x', -1], ArrowRight: ['x', 1] }[e.key];
    if (!move) return;
    e.preventDefault();
    stepItem(item, ...move);
  });
  return { status };
};
