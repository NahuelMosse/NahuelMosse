// What the dealt hero blueprint says about its headline (alignment and case), and whether the built h1 keeps it.
// A build that drops the blueprint lands on the model's default first screen (wordmark and pill, left headline,
// paragraph, full-width button), the same on every page whatever was dealt.

// Only the sentences whose subject is the headline: «The headline is one centred line…», not «The tall photograph
// follows the title on the left margin».
// «The sentence» is the headline only at a display size; at 17px it is the supporting line under it.
const SUBJECT = /^(?:\S+\s+){0,3}?(?:headline|title|statement)\b/i;
const SENTENCE = /^(?:\S+\s+){0,3}?sentence\b/i;
const DISPLAY = /\bat (?:clamp\(|\d+(?:\.\d+)?vw\b|(?:[4-9]\d|\d{3})px\b)/i;
const headlineSentences = (text) => String(text || '').split(/(?<=\.)\s+/).filter((s) => SUBJECT.test(s) || (SENTENCE.test(s) && DISPLAY.test(s)));

const CENTRED = /(?<!vertically\s)\b(?:cent(?:red|ered)|dead centre)\b/i;
const LEFT = /\bleft[- ]aligned\b|\bflush (?:left|to the (?:\d+px )?(?:left )?margin)\b|\b(?:top|bottom)-left\b|\bon the left\b|\bleft margin\b/i;
const RIGHT = /\bright[- ]aligned\b|\bflush right\b/i;
const FULL = /\bedge[- ]to[- ]edge\b|\bpushed to the edges\b|\b(?:runs|spans|fills) the (?:full|whole) width\b/i;
const CAPS = /\b(?:capitals|uppercase|all caps)\b/i;
const NOT_CAPS = /\blower[- ]?case\b|\bsentence case\b/i;
const WORD = { center: 'centred', left: 'left-aligned', right: 'right-aligned', full: 'edge to edge' };

/** The headline's alignment and case named by one blueprint text, or null for what it does not say. */
export function headlineSays(text) {
  const s = headlineSentences(text).join(' ');
  if (!s) return { align: null, caps: null };
  // Edge to edge outranks a centring: a line that fills the measure is centred by construction.
  const said = FULL.test(s) ? ['full'] : [CENTRED.test(s) && 'center', LEFT.test(s) && 'left', RIGHT.test(s) && 'right'].filter(Boolean);
  return { align: said.length === 1 ? said[0] : null, caps: NOT_CAPS.test(s) ? false : CAPS.test(s) ? true : null };
}

/** Expectations for desktop (the blueprint) and phone (its `mobile`, falling back to the blueprint). */
export function heroExpectation(hero) {
  if (!hero) return null;
  const desk = headlineSays(hero.blueprint);
  const phone = headlineSays(hero.mobile);
  return { id: hero.id, desktop: desk, phone: { align: phone.align ?? desk.align, caps: phone.caps ?? desk.caps } };
}

/** Findings for one width: `h1` as the probe measures it ({ align, caps }), `exp` from heroExpectation. */
export function heroDealtFindings(h1, exp, width, { app = false } = {}) {
  if (!h1 || !exp || app) return [];
  const want = width <= 500 ? exp.phone : exp.desktop;
  const off = [];
  const fullIsCentred = h1.align === 'full' && want.align === 'center';
  if (want.align && WORD[h1.align] && h1.align !== want.align && !fullIsCentred) off.push(`the headline is ${WORD[h1.align]}, the blueprint sets it ${WORD[want.align]}`);
  if (want.caps === true && h1.caps === false) off.push('the blueprint sets the headline in capitals, the page in mixed case');
  if (want.caps === false && h1.caps === true) off.push('the page sets the headline in capitals, the blueprint does not');
  if (!off.length) return [];
  return [{ level: 'FAIL', id: 'hero-not-dealt', width, message: `The dealt hero is \`${exp.id}\`, but ${off.join('; ')}.`, fix: 'Build the hero exactly as its blueprint describes it (SKILL.md, build order step 2): geometry, alignment, scale and case. To keep this layout instead, deal again (`draw.mjs --redraw hero`) or record it with `--allow hero-not-dealt` and the reason.' }];
}
