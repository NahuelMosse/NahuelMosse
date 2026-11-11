// Bento grid, ported from Magic UI (registry/magicui/bento-grid.tsx). A three-column grid of 22 rem rows and
// 16 px gaps whose cells are cards: a background that lives on top (a list, a diagram, a chart, a marquee),
// and under it an icon, a name and a description. On hover, or when focus is inside, the text rises 40 px,
// the icon shrinks to 75 % and a link slides up from the foot of the card, all in 300 ms, and a veil of
// 3 % tints the card. Below the wide layout, or without a hovering pointer, the link is always there.
// Cells come from the markup (`.mu-bento__card`, see bento-grid.html) or from `opts.cells`:
// [{ name, description, href, cta, icon (an SVG string), span (1 to 3), background (a node, an HTML string
// or a function that receives the slot and may return a handle with `destroy`) }].
import { escapeHtml } from '../core.js';
import { define, node } from './mu-shared.js';

const ARROW = '<svg class="mu-bento__arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';

const build = (cell, handles) => {
  const span = cell.span ?? 3;
  if (![1, 2, 3].includes(span)) throw new RangeError(`bento-grid: span has to be 1, 2 or 3, not ${span}`);
  if (!cell.name) throw new RangeError('bento-grid: every cell needs a name');
  const card = node('article', 'mu-bento__card');
  card.dataset.span = span;
  const slot = node('div', 'mu-bento__bg');
  const bg = cell.background;
  if (typeof bg === 'function') { const handle = bg(slot); if (handle?.destroy) handles.push(handle); }
  else if (typeof bg === 'string') slot.innerHTML = bg;
  else if (bg) slot.append(bg);
  const content = node('div', 'mu-bento__content');
  const text = node('div', 'mu-bento__text');
  text.innerHTML = `${cell.icon ? `<span class="mu-bento__icon" aria-hidden="true">${cell.icon}</span>` : ''}<h3 class="mu-bento__name">${escapeHtml(cell.name)}</h3>${cell.description ? `<p class="mu-bento__description">${escapeHtml(cell.description)}</p>` : ''}`;
  content.append(text);
  if (cell.href && cell.cta) {
    const cta = node('div', 'mu-bento__cta');
    cta.innerHTML = `<a class="mu-bento__link" href="${escapeHtml(cell.href)}">${escapeHtml(cell.cta)}${ARROW}</a>`;
    content.append(cta);
  }
  card.append(slot, content, node('div', 'mu-bento__veil', { decorative: true }));
  return card;
};

export const mount = define('bento-grid', (el, opts) => {
  const previous = [...el.childNodes];
  const handles = [];
  el.classList.add('mu-bento');
  if (opts.cells) el.replaceChildren(...opts.cells.map((cell) => build(cell, handles)));
  return {
    get cells() { return [...el.querySelectorAll(':scope > .mu-bento__card')]; },
    destroy() {
      for (const h of handles) h.destroy();
      el.classList.remove('mu-bento');
      if (opts.cells) el.replaceChildren(...previous);
    },
  };
});
