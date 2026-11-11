// Number ticker, ported from Magic UI (registry/magicui/number-ticker.tsx). A figure counts from
// `startValue` (0) to `value` with the original's spring (damping 60, stiffness 100) played 5.5 times faster, once, when it first comes
// into view, after `delay` seconds; `direction: "down"` goes from the value to the start. The text is
// formatted every frame with tabular digits and a letter spacing of 0.05 em. `decimalPlaces` fixes the
// fraction digits. The page locale formats it (`data-locale`), `currency` writes it as money and
// `format(value)` replaces both. The original takes about 7 s to settle on a figure of six digits; a dashboard cannot wait
// that long, so the figure arrives in under 1.5 s: it jumps to the exact value as soon as it is within half a unit of
// its last digit, and a deadline of 1.5 s closes whatever is left. A screen reader gets the final figure once; reduced motion fades it in.
import { follower, format, reduced } from '../core.js';
import { define, gate, node, numberOf } from './mu-shared.js';

const SPEED = 5.5;
const SPRING = { stiffness: 100 * SPEED ** 2, damping: 60 * SPEED, mass: 1 };
const SETTLE_MS = 1500;

export const mount = define('number-ticker', (el, opts) => {
  const startValue = numberOf(opts, el, 'startValue', 0);
  const delay = numberOf(opts, el, 'delay', 0);
  const decimals = numberOf(opts, el, 'decimalPlaces', 0);
  const direction = opts.direction ?? el.dataset.direction ?? 'up';
  if (direction !== 'up' && direction !== 'down') throw new RangeError(`number-ticker: unknown direction "${direction}"`);
  let value = numberOf(opts, el, 'value', NaN);
  if (!Number.isFinite(value)) throw new RangeError('number-ticker: value is not a number');
  const currency = opts.currency ?? el.dataset.currency;
  const write = opts.format ?? ((v) => (currency
    ? format.currency(v, currency, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }, el)
    : format.number(v, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }, el)));
  const text = (v) => write(Number(v.toFixed(decimals)));

  const previous = el.innerHTML;
  el.classList.add('mu-ticker');
  const spoken = node('span', 'mu-ticker__spoken');
  const digits = node('span', 'mu-ticker__digits', { decorative: true });
  el.replaceChildren(spoken, digits);
  const from = () => (direction === 'down' ? value : startValue);
  const to = () => (direction === 'down' ? startValue : value);
  const set = (v) => { digits.textContent = text(v); };
  spoken.textContent = text(to());
  set(from());

  const f = follower(SPRING, ([v]) => set(v), 0.5 * 10 ** -decimals);
  let timer = 0;
  let deadline = 0;
  let begun = false;
  const begin = () => {
    begun = true;
    if (reduced()) { set(to()); digits.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' }); return; }
    f.to([from()], true);
    timer = setTimeout(() => { f.to([to()]); deadline = setTimeout(() => { f.to([to()], true); }, SETTLE_MS); }, delay * 1000);
  };
  const watcher = gate(el, (on) => { if (on && !begun) { begin(); watcher.destroy(); } });

  return {
    // Retarget the figure: it springs from where it is to the new value.
    update(next) {
      if (!Number.isFinite(next)) throw new RangeError('number-ticker: value is not a number');
      value = next;
      spoken.textContent = text(to());
      if (!begun) { set(from()); return; }
      if (reduced()) { set(to()); return; }
      f.to([to()]);
      clearTimeout(deadline);
      deadline = setTimeout(() => f.to([to()], true), SETTLE_MS);
    },
    get text() { return digits.textContent; },
    destroy() {
      clearTimeout(timer);
      clearTimeout(deadline);
      f.stop();
      watcher.destroy();
      el.innerHTML = previous;
      el.classList.remove('mu-ticker');
    },
  };
});
