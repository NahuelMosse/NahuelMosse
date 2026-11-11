// Chrome of the isolated demos: the light/dark switch (`?theme=dark` opens in dark) and the helpers
// the demos share. Not part of any component.
const root = document.documentElement;
const buttons = [...document.querySelectorAll('[data-theme-set]')];

export const setTheme = (theme) => {
  if (theme === 'dark') root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
  for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.themeSet === (theme === 'dark' ? 'dark' : 'light')));
};
for (const b of buttons) b.addEventListener('click', () => setTheme(b.dataset.themeSet));
setTheme(new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light');

export const svg = (paths) => `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true">${paths}</svg>`;
export const ICON = {
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
  user: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c.4-2.6 2.5-4 5-4s4.6 1.4 5 4"/>',
  arrowLeft: '<path d="M13 8H3M7 4L3 8l4 4"/>',
  receipt: '<path d="M3.5 2.5h9v11l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1zM6 6h4M6 9h4"/>',
  users: '<circle cx="6" cy="5.5" r="2.5"/><path d="M1.5 13c.3-2.4 2.2-3.8 4.5-3.8s4.2 1.4 4.5 3.8M10.5 3.2a2.4 2.4 0 0 1 0 4.6M12 9.5c1.3.5 2.2 1.6 2.5 3.5"/>',
  send: '<path d="M14 2L7 9M14 2l-4.5 12-2.5-5.5L1.5 6z"/>',
  mail: '<path d="M2.5 4h11v8h-11zM2.5 4.5l5.5 4 5.5-4"/>',
  download: '<path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10"/>',
  tag: '<path d="M2.5 2.5H8l5.5 5.5L8 13.5 2.5 8zM5.5 5.5v.01"/>',
  ban: '<circle cx="8" cy="8" r="5.5"/><path d="M4.2 4.2l7.6 7.6"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  pencil: '<path d="M10.5 3l2.5 2.5L6 12.5l-3 .5.5-3z"/>',
  sliders: '<path d="M2 4.5h6M11 4.5h3M2 11.5h3M8 11.5h6"/><circle cx="9.5" cy="4.5" r="1.5"/><circle cx="6.5" cy="11.5" r="1.5"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>',
  calendar: '<path d="M3 4.5h10v8.5H3zM3 7.5h10M5.5 2.5v3M10.5 2.5v3"/>',
};
