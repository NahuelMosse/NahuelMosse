// The theme switch of the demo pages: the root's `data-theme` is the only thing it touches.
export const themeSwitch = (root = document) => {
  const buttons = [...root.querySelectorAll('[data-ac-theme]')];
  const set = (theme) => {
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.acTheme === theme));
  };
  for (const b of buttons) b.addEventListener('click', () => set(b.dataset.acTheme));
  set(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
};

// The hue of an avatar or a tile: one per person or client, the same every time.
export const hueOf = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
export const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
