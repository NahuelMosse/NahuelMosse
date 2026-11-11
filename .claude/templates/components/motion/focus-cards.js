// Focus cards, ported from Aceternity UI (ui/focus-cards). A grid of cards: over one, a 50 % black layer
// rises over it with its title at the bottom (opacity, 300 ms), and every other card blurs (8 px) and
// shrinks to 0.98 (300 ms ease-out). Children of the element marked `data-card` are the cards; each holds
// its picture and a `.ac-focus__cap` caption. Keyboard focus does what the pointer does. Reduced motion
// swaps the blur and the shrink for a 120 ms dimming of the others.
import { define, listeners } from './ac-shared.js';

export const mount = define('focus-cards', (el) => {
  const cards = [...el.querySelectorAll('[data-card]')];
  if (!cards.length) throw new RangeError('focus-cards: needs children with data-card');
  const on = listeners();
  const added = [];
  el.classList.add('ac-focus');

  let current = null;
  const set = (card) => {
    current = card;
    el.toggleAttribute('data-focused', card !== null);
    for (const c of cards) {
      if (c === card) { c.dataset.state = 'active'; continue; }
      if (card) c.dataset.state = 'dim';
      else delete c.dataset.state;
    }
  };

  for (const c of cards) {
    if (!c.matches('a[href], button, [tabindex]')) { c.setAttribute('tabindex', '0'); added.push([c, 'tabindex']); }
    on(c, 'pointerenter', (e) => { if (e.pointerType !== 'touch') set(c); });
    on(c, 'pointerleave', (e) => { if (e.pointerType !== 'touch' && current === c) set(null); });
    on(c, 'focus', () => set(c));
    on(c, 'blur', () => { if (current === c) set(null); });
  }
  on(document, 'pointerdown', (e) => { if (current && !el.contains(e.target)) set(null); });

  return {
    destroy() {
      on.off();
      for (const c of cards) delete c.dataset.state;
      for (const [c, attr] of added) c.removeAttribute(attr);
      el.removeAttribute('data-focused');
      el.classList.remove('ac-focus');
    },
  };
});
