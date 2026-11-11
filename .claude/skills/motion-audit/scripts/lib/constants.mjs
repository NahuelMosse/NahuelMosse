// Named thresholds and timings shared by the analysis and the browser driver.
export const FRAME_MS = 1000 / 60;
export const LONG_FRAME_MS = 50;
// A frame with no application script behind it counts above LONG_FRAME_MS, or above this multiple of the
// longest frame a blank page shows on the same machine (a slow VM has long frames with nothing to do).
export const FRAME_NOISE_FACTOR = 2;
// Where a machine shows frames over LONG_FRAME_MS with nothing to do, its noise comes in bursts a short
// calibration can miss: a frame without application work counts only above this many ms at least.
export const NOISY_UNATTRIBUTED_MS = 250;
// A frame whose page scripts add up to less than this is judged as one without application work: the
// rest of it belongs to the machine.
export const PAGE_SCRIPT_MIN_MS = 25;
// Frames without a script behind them in this many controls of one audit are the machine's, whatever its calibration.
export const ENV_NOISE_MIN_ELEMENTS = 3;
// A motion of at least SPARSE_MIN_MOTION_MS sampled at fewer than SPARSE_DENSITY samples per 60 Hz
// frame is measured again (at most SPARSE_RETRIES times), keeping the densest recording.
export const SPARSE_MIN_MOTION_MS = 100;
export const SPARSE_DENSITY = 0.7;
export const SPARSE_RETRIES = 3;
// A hover left mid-way is recorded again (at most this many times) while an animation restart was seen
// but the value could not be followed because the frames were sparse.
export const INTERRUPT_RETRIES = 3;
export const CALIBRATION_CYCLES = 6;
export const IDLE_NOISE_MS = 1000;
export const MIN_PLAYWRIGHT = [1, 59];
export const SCHEMA_VERSION = 1;

export const DEFAULT_MAX_ELEMENTS = 40;
export const VIEWPORT = { width: 1280, height: 900 };
export const NAV_TIMEOUT_MS = 45000;
export const WAIT_FOR_TIMEOUT_MS = 15000;
// The first load of a URL waits this long for hydration and for client-side redirects; later loads
// of the same URL (probes reload the page) wait RELOAD_WAIT_MS.
export const HYDRATION_WAIT_MS = 800;
export const RELOAD_WAIT_MS = 250;
// Controls that show up later than this after a load are not "late": the audit waits this long
// before it counts the controls again, and a larger count means the first count was incomplete.
export const RECOUNT_AFTER_MS = 3000;

// A gesture lasts until the page is still: no running CSS or WAAPI animation on the element or its
// subtree, and no change of position, size, opacity, transform or colour for SETTLE_QUIET_MS, but at
// least SETTLE_MIN_MS (a transition starts on the next frame) and at most SETTLE_MAX_MS.
export const SETTLE_MIN_MS = 50;
export const SETTLE_QUIET_MS = 80;
export const SETTLE_MAX_MS = 2000;
export const INTERRUPT_MIN_MOTION_MS = 80;
export const INTERRUPT_LEAD_MS = 80;
export const CLICK_LEAD_MS = 120;
// After a real press is released, clicks stay cancelled this long: a library may dispatch its own click up to ~80 ms later.
export const PRESS_GUARD_MS = 150;
export const CLICK_RECORD_MS = 1500;
// A click recording whose only jump candidate fell in a frame too long to judge is recorded again, at most this many times.
export const CLICK_RESOLVE_RETRIES = 2;
export const CLICK_INTERRUPT_MS = 160;
export const SCROLL_STEP_PX = 160;
export const SCROLL_STEP_MS = 90;
export const SCROLL_TAIL_MS = 600;

// Toggle probing.
export const MAX_TOGGLES = 8;
export const TOGGLE_MIN_MOTION_MS = 80;
export const TOGGLE_SETTLE_MIN_MS = 100;
export const TOGGLE_QUIET_MS = 150;
export const TOGGLE_SHARES = [0.3, 0.55];

// Tracer.
export const TRACE_SUBTREE_CAP = 60;
export const TRACE_PAGE_CAP = 800;
export const TRACE_MOUNT_CAP = 400;
export const TRACE_MIN_SIZE_PX = 4;

// Findings policy.
export const BANDS = { hover: [80, 300], press: [50, 200], focus: [0, 250] };
export const INCONSISTENT_RATIO = 1.5;
export const INCONSISTENT_MIN_GAP_MS = 60;
export const OVERSHOOT_SPRING_PCT = 3;
export const EASE_IN_MIN_MS = 60;

// Jump detection. A position step is a jump only when the sampling is fine enough to bound the
// instantaneous velocity (or an Animation object says the animation restarted).
export const FINE_SAMPLING_MS = 1.5 * FRAME_MS;
export const JUMP_MAX_DT_MS = 2.5 * FRAME_MS;
// A step is a jump only if it was judged in an interval no longer than this, by frame time and by the time its value was read,
// with both neighbouring intervals as short: a step inside a longer interval, or beside one, can only leave the motion
// unresolved. Within the limit a settled motion is judged on its own velocities, which are bounded whatever the interval (the
// mean slope of a smooth curve over an interval never exceeds its steepest slope), so a machine that renders 30 fps with
// stalls up to this long still gets its teleports found.
export const SERIES_JUMP_MAX_DT_MS = 6 * FRAME_MS;

// An interval of a settled motion is a jump when it is a local speed peak (at least twice as fast as
// both neighbours) and this many times faster than the average speed of the whole motion.
export const SERIES_PEAK_SLOPE = 5;
// ...and at least this many times faster than each neighbouring interval (an ease-in speeds up by less, even sampled coarsely).
export const SERIES_NEIGHBOUR_RATIO = 3;
export const JUMP_PEAK_SLOPE = 6;
export const JUMP_MIN_SHARE = 0.15;
export const RESTART_MIN_SHARE = 0.1;
export const RESTART_WINDOW = 3;
export const SMALL_MIN_SHARE = 0.2;
export const SMALL_STEP_EPS_FACTOR = 2;
export const RESTART_EVENT_SLACK_MS = 3 * FRAME_MS;
// A node removed and a same-kind node mounted in the same parent within this many frames are one re-mounted component.
export const REMOUNT_GAP_FRAMES = 4;
// A step next to a long frame is that frame, not a jump (the animation clock ran ahead while the thread was blocked).
export const LONG_FRAME_STEP_SLACK_MS = 2 * FRAME_MS;
export const JUMP_MIN_STEP = { left: 24, top: 24, width: 24, height: 24, tx: 24, ty: 24, opacity: 0.4, sx: 0.3, sy: 0.3 };

// Confirmation of flaky findings: re-measured, kept when most runs agree.
export const CONFIRM_RUNS = 3;
export const CONFIRM_MAJORITY = 2;

// Reduced motion.
export const REDUCED_SCALE_DELTA = 0.06;
export const REDUCED_TRANSLATE_PX = 4;
export const REDUCED_LOOP_SPINNER_PX = 64;

export const HIT_TEST_POINTS = [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]];
export const CLIP_MARGIN_PX = 6;
// Screenshots differ visibly when enough PIXEL_BLOCK_PX squares change, in their average colour, by more than
// the tolerance. Averaging squares ignores anti-aliasing (a different text rasterisation keeps the mean colour).
export const PIXEL_BLOCK_PX = 8;
export const PIXEL_CHANNEL_TOLERANCE = 24;
export const PIXEL_MIN_BLOCKS = 2;
export const CONTACT_SHEET_STEP_MS = 40;

export const VISIBLE_PROPS = ['transform', 'translate', 'scale', 'rotate', 'opacity', 'background-color', 'background-image', 'color', 'box-shadow', 'border-color', 'outline-style', 'outline-width', 'outline-color', 'text-decoration-color', 'filter', 'width', 'height', 'padding-top', 'padding-left', 'margin-top', 'margin-left', 'top', 'left', 'letter-spacing', 'font-weight'];
export const LAYOUT_PROPS = /^(width|height|top|left|right|bottom|inset|margin|padding|max-height|max-width|min-height|min-width|font-size|font-weight|letter-spacing|border-width|line-height|gap)/;
export const INTERACTIVE = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=menuitem], [role=checkbox], [role=link], [tabindex]:not([tabindex="-1"])';
export const TOGGLE = '[aria-expanded], [aria-controls], [aria-pressed], summary, [data-toggle]';
// Controls that --interact never presses or toggles: they submit, destroy, leave, drag or resize.
// Also denied in denyReason: any submit or reset control owned by a form (inside it or through form=),
// links (and anything inside one) whose href is not a same-document fragment, and buttons with no accessible name.
export const DENY_SELECTOR = '[type=submit], [type=image], [type=reset], [draggable=true], [role=slider], [role=separator], [role=scrollbar], input[type=range], input[type=file]';
const DENY_WORDS = [
  // English
  'delete', 'remove', 'destroy', 'discard', 'logout', 'log out', 'sign out', 'signout', 'unsubscribe', 'pay', 'buy', 'purchase', 'checkout', 'submit', 'send', 'confirm', 'archive', 'publish', 'deploy', 'reset', 'place order', 'subscribe', 'revoke', 'block',
  // Spanish
  'eliminar', 'elimina', 'borrar', 'borra', 'quitar', 'descartar', 'salir', 'cerrar sesión', 'cerrar sesion', 'desconectar', 'darse de baja', 'pagar', 'paga', 'comprar', 'compra', 'enviar', 'envía', 'envia', 'confirmar', 'confirma', 'publicar', 'publica', 'archivar', 'restablecer', 'realizar pedido', 'suscribir', 'revocar', 'bloquear',
  // Portuguese
  'excluir', 'apagar', 'sair', 'encerrar sessão', 'encerrar sessao',
  // French
  'supprimer', 'effacer', 'déconnexion', 'deconnexion', 'se déconnecter', 'payer', 'acheter', 'envoyer', 'confirmer', 'publier', 'valider',
  // German
  'löschen', 'entfernen', 'abmelden', 'ausloggen', 'bezahlen', 'kaufen', 'senden', 'absenden', 'bestätigen', 'veröffentlichen',
  // Italian
  'cancella', 'rimuovi', 'esci', 'paga', 'acquista', 'invia', 'conferma', 'pubblica',
];
export const DENY_TEXT = new RegExp(`(?<!\\p{L})(?:${DENY_WORDS.join('|')})(?!\\p{L})`, 'iu');
// Controls that must have an accessible name to be pressed: an unnamed one may be a trash can.
export const NAMED_CONTROL = 'button, summary, [role=button]';
export const LOGIN_PATH = /\/(log-?in|sign-?in|sign_in|auth|sso|session\/new)(\/|$|\?)/i;
// A motion sampled fewer times than this is never examined for jumps (findJumps needs a start, a settle and room between).
export const SIGHTING_MIN_SAMPLES = 5;

// Frames at 60 Hz: a recording whose intervals have a median up to DENSE_MEDIAN_MS and none over DENSE_MAX_MS is dense. A step in
// it that is slower than a jump is settled, and a row that says "too sparse" about it would be wrong. Product and tests share
// these two numbers.
export const DENSE_MEDIAN_MS = 20;
export const DENSE_MAX_MS = 34;
// A declared transition shorter than this cannot hold SIGHTING_MIN_SAMPLES frames at 60 Hz: its measured curve is not judged.
export const MEASURE_MIN_MS = 120;
