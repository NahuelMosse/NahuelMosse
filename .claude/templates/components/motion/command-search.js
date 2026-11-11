// Command search, ported from Watermelon UI (animated-components/command-search, MIT, Copyright (c) 2025-present Watermelon Contributors).
// A small "Buscar..." field that opens into a command palette: the field grows into a panel with a search row, a list of
// results grouped by section and a dimmed, blurred page behind. Typing filters by title, ArrowUp/ArrowDown walk the
// results (wrapping), Enter runs the one highlighted, Escape closes. The original opens with the bare "F" key.
// Port notes. The shared-element morph (`layoutId`) becomes a FLIP: the panel starts at the field's rectangle and grows to
// its own on a 150 ms ease-out. The input is a real combobox (`role="combobox"`, `aria-activedescendant`, a `listbox` of
// `option`s grouped with `role="group"`), a live region says how many results there are, the match is accent- and
// case-insensitive, and the shortcut (`data-shortcut`, "k" by default) needs Ctrl or Cmd so that typing the letter in a
// page never opens it. Focus returns to the field on close. Reduced motion opens without the growth.
//
//   <div data-motion="command-search"></div>
//   mount(el, { items: [{ id, title, section, icon, shortcut, action }], placeholder, shortcut })
//     →  { open(), close(), isOpen, destroy }
import { fold, reduced, scope } from '../core.js';
import { define, node } from './mu-shared.js';

const SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';

export const mount = define('command-search', (el, opts) => {
  const items = opts.items ?? [];
  const life = scope();
  const placeholder = opts.placeholder ?? 'Buscar...';
  const key = (opts.shortcut ?? el.dataset.shortcut ?? 'k').toLowerCase();
  const uid = Math.random().toString(36).slice(2, 7);
  let isOpen = false;
  let active = 0;
  let shown = [];

  const trigger = node('button', 'mu-command-search__trigger', { html: `${SEARCH}<span class="mu-command-search__label"></span><kbd class="mu-command-search__kbd"></kbd>` });
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.querySelector('.mu-command-search__label').textContent = placeholder;
  trigger.querySelector('kbd').textContent = `${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'} ${key.toUpperCase()}`;
  const layer = node('div', 'mu-command-search__layer');
  layer.hidden = true;
  const scrim = node('div', 'mu-command-search__scrim', { decorative: true });
  const panel = node('div', 'mu-command-search__panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Buscador de comandos');
  const row = node('div', 'mu-command-search__row', { html: SEARCH });
  const input = node('input', 'mu-command-search__input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', `mu-cs-list-${uid}`);
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-label', placeholder.replace(/\.+$/, ''));
  input.autocomplete = 'off';
  const esc = node('kbd', 'mu-command-search__kbd');
  esc.textContent = 'Esc';
  row.append(input, esc);
  const list = node('div', 'mu-command-search__list');
  list.id = `mu-cs-list-${uid}`;
  list.setAttribute('role', 'listbox');
  const live = node('div', 'mu-command-search__live');
  live.setAttribute('role', 'status');
  panel.append(row, list, live);
  layer.append(scrim, panel);
  el.classList.add('mu-command-search');
  el.append(trigger);
  document.body.append(layer);

  const render = () => {
    const q = fold(input.value.trim());
    shown = items.filter((i) => fold(i.title).includes(q));
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.replaceChildren();
    if (!shown.length) {
      const empty = node('div', 'mu-command-search__empty');
      empty.textContent = `No hay resultados para “${input.value}”`;
      list.append(empty);
    }
    const sections = [...new Set(shown.map((i) => i.section ?? ''))];
    for (const name of sections) {
      const group = node('div', 'mu-command-search__group');
      group.setAttribute('role', 'group');
      if (name) {
        const h = node('div', 'mu-command-search__section');
        h.id = `mu-cs-${uid}-${sections.indexOf(name)}`;
        h.textContent = name;
        group.setAttribute('aria-labelledby', h.id);
        group.append(h);
      }
      for (const item of shown.filter((i) => (i.section ?? '') === name)) {
        const at = shown.indexOf(item);
        const opt = node('div', 'mu-command-search__option');
        opt.id = `mu-cs-${uid}-o${at}`;
        opt.setAttribute('role', 'option');
        const ico = node('span', 'mu-command-search__icon', { decorative: true, html: typeof item.icon === 'string' ? item.icon : '' });
        const t = node('span', 'mu-command-search__title');
        t.textContent = item.title;
        opt.append(ico, t);
        if (item.shortcut) { const k = node('kbd', 'mu-command-search__kbd'); k.textContent = item.shortcut; opt.append(k); }
        opt.addEventListener('pointermove', () => { if (active !== at) { active = at; mark(); } });
        opt.addEventListener('click', () => run(item));
        group.append(opt);
      }
      list.append(group);
    }
    mark();
    live.textContent = shown.length ? `${shown.length} resultado${shown.length === 1 ? '' : 's'}` : 'Sin resultados';
  };
  const mark = () => {
    list.querySelectorAll('[role="option"]').forEach((o, i) => {
      o.setAttribute('aria-selected', String(i === active));
      if (i === active) { input.setAttribute('aria-activedescendant', o.id); o.scrollIntoView({ block: 'nearest' }); }
    });
    if (!shown.length) input.removeAttribute('aria-activedescendant');
  };
  const run = (item) => { close(); item.action?.(item); el.dispatchEvent(new CustomEvent('select', { detail: { id: item.id } })); };
  function open() {
    if (isOpen) return;
    isOpen = true;
    input.value = '';
    active = 0;
    render();
    const from = trigger.getBoundingClientRect();
    layer.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    if (!reduced()) {
      const to = panel.getBoundingClientRect();
      panel.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${Math.min(1, from.height / to.height)})`, opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 150, easing: 'ease-out' });
      scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
    }
    input.focus();
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    layer.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
  }

  trigger.addEventListener('click', open, { signal: life.signal });
  scrim.addEventListener('click', close, { signal: life.signal });
  input.addEventListener('input', () => { active = 0; render(); }, { signal: life.signal });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (shown.length) { active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; mark(); }
    } else if (e.key === 'Home' || e.key === 'End') {
      if (shown.length && !input.value) { e.preventDefault(); active = e.key === 'Home' ? 0 : shown.length - 1; mark(); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (shown[active]) run(shown[active]);
    } else if (e.key === 'Tab') e.preventDefault();
  }, { signal: life.signal });
  layer.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }, { signal: life.signal });
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === key && (e.ctrlKey || e.metaKey) && !e.altKey) { e.preventDefault(); if (isOpen) close(); else open(); }
  }, { signal: life.signal });

  return {
    open,
    close,
    get isOpen() { return isOpen; },
    destroy() {
      life.destroy();
      layer.remove();
      trigger.remove();
      el.classList.remove('mu-command-search');
    },
  };
});
