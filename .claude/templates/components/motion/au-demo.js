// What every demo page of the Animate UI group shares: the light / dark selector, which sets `data-theme`
// on the root, and `?theme=dark` to open a page already dark.
const root = document.documentElement;
const asked = new URLSearchParams(location.search).get('theme');
if (asked === 'dark' || asked === 'light') root.setAttribute('data-theme', asked);

for (const select of document.querySelectorAll('[data-demo-theme]')) {
  select.value = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  select.addEventListener('change', () => root.setAttribute('data-theme', select.value));
}
