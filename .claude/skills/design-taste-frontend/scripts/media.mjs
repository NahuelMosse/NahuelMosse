#!/usr/bin/env node
// tasteskill / media: what is connected to make pictures, and the delivery of a picture or a clip to the page.
//
// Generating is done with whatever the person connected (an image or video tool of the session, an MCP server,
// a local ComfyUI, an API they named); this script never calls a paid service. It answers the two mechanical
// parts around generation that agents get wrong by hand: what is available, and turning an approved still or
// clip into what a page serves.
//
//   node media.mjs detect [--json]
//        local ComfyUI, API keys present in the environment (names only), the Codex CLI and ffmpeg. The tools of
//        the session itself (an image tool, an MCP server) are not visible to a script: look at your tool list.
//   node media.mjs still <image> [--out assets] [--name <base>] [--ratio 4:5] [--widths 640,1024,1600,2400]
//        AVIF and WebP per width (never wider than the source), centre-cropped to --ratio, the weight of each and
//        the <img>/<picture> markup with width and height. Run it once per crop for art direction on the phone.
//   node media.mjs loop <clip> [--out assets] [--name <base>] [--fade 1.5] [--start 0] [--length <s>] [--height 1080]
//        a seamless loop: the end crossfades into the start (--fade 0 when the clip already loops), no audio,
//        H.264 MP4 plus AV1, each under 2500 KB (the quality steps down until it fits), and a WebP poster of the
//        loop's first frame.
//
// Needs ffmpeg and ffprobe on the PATH. Zero dependencies. Node 18+.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

const VIDEO_KB = 2500;
const STILL_1600_KB = 200;
const KEYS = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'FAL_KEY', 'REPLICATE_API_TOKEN', 'BFL_API_KEY',
  'LUMAAI_API_KEY', 'STABILITY_API_KEY', 'IDEOGRAM_API_KEY', 'RECRAFT_API_TOKEN'];

const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i < 0 ? dflt : argv[i + 1]; };
const has = (name) => argv.includes(`--${name}`);
const die = (msg) => { console.error(msg); process.exit(2); };
const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const kb = (file) => Math.round(statSync(file).size / 1024);
const onPath = (cmd) => run(process.platform === 'win32' ? 'where' : 'which', [cmd]).status === 0;

function ffmpeg(args) {
  const r = run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
  if (r.status !== 0) die(`ffmpeg failed: ${(r.stderr || r.error?.message || '').trim().split('\n').slice(-3).join(' ')}`);
}

function probe(file) {
  const r = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file]);
  if (r.status !== 0) die(`ffprobe could not read ${file}`);
  const j = JSON.parse(r.stdout);
  return { width: j.streams[0].width, height: j.streams[0].height, duration: Number(j.format?.duration) || 0 };
}

function target() {
  const src = argv[1];
  if (!src || src.startsWith('--')) die(`usage: node media.mjs ${argv[0]} <file> [options]`);
  if (!existsSync(src)) die(`not found: ${src}`);
  if (!onPath('ffmpeg') || !onPath('ffprobe')) die('ffmpeg and ffprobe are needed on the PATH');
  const out = resolve(flag('out', 'assets'));
  mkdirSync(out, { recursive: true });
  return { src, out, name: flag('name', basename(src, extname(src))) };
}

async function detect() {
  const found = [];
  try {
    const res = await fetch('http://127.0.0.1:8188/system_stats', { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const s = await res.json();
      const dev = s.devices?.[0];
      found.push({ kind: 'local', name: 'ComfyUI', detail: `${s.system?.comfyui_version || ''} ${dev ? `${dev.name}, ${Math.round((dev.vram_total || 0) / 2 ** 30)} GB VRAM` : ''}`.trim() });
    }
  } catch { /* not running */ }
  for (const k of KEYS) if (process.env[k]) found.push({ kind: 'api key', name: k, detail: 'present; it costs money: use it only when the card or the person names this generator' });
  if (onPath('codex')) found.push({ kind: 'cli', name: 'codex', detail: 'Codex CLI; its image tool runs on the person\'s own plan' });
  const tools = { ffmpeg: onPath('ffmpeg') };
  if (has('json')) { console.log(JSON.stringify({ found, tools }, null, 2)); return; }
  for (const f of found) console.log(`${f.kind.padEnd(8)} ${f.name}  ${f.detail}`);
  if (!found.length) console.log('no generator found by the script: nothing local, no key, no Codex CLI');
  console.log(`ffmpeg   ${tools.ffmpeg ? 'yes' : 'missing: still and loop cannot run'}`);
  console.log('Not visible from here: the image or video tools of this session and its MCP servers. Check your tool list.');
}

function still() {
  const { src, out, name } = target();
  const { width, height } = probe(src);
  const ratio = flag('ratio');
  let crop = '';
  let w = width, h = height;
  if (ratio) {
    const [a, b] = ratio.split(':').map(Number);
    if (!a || !b) die('--ratio is W:H, e.g. 4:5');
    w = Math.min(width, Math.floor(height * a / b)); h = Math.min(height, Math.floor(width * b / a));
    w -= w % 2; h -= h % 2;
    crop = `crop=${w}:${h},`;
  }
  const asked = (flag('widths', '640,1024,1600,2400')).split(',').map(Number).filter(Boolean);
  const widths = [...new Set(asked.map((x) => Math.min(x, w)))].sort((x, y) => x - y);
  const rows = [];
  for (const W of widths) {
    const H = Math.round(W * h / w / 2) * 2;
    const vf = `${crop}scale=${W}:${H}:flags=lanczos`;
    const base = join(out, `${name}-${W}`);
    ffmpeg(['-i', src, '-vf', `${vf},format=yuv420p`, '-frames:v', '1', '-c:v', 'libaom-av1', '-still-picture', '1', '-crf', '32', '-cpu-used', '6', `${base}.avif`]);
    ffmpeg(['-i', src, '-vf', vf, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '80', `${base}.webp`]);
    rows.push({ W, H, avif: kb(`${base}.avif`), webp: kb(`${base}.webp`) });
  }
  for (const r of rows) console.log(`${String(r.W).padStart(5)} × ${r.H}   avif ${r.avif} KB   webp ${r.webp} KB`);
  const big = rows.find((r) => r.W === 1600);
  if (big && Math.min(big.avif, big.webp) > STILL_1600_KB) console.log(`WARN the 1600 px file is over ${STILL_1600_KB} KB: a calmer crop, less noise or grain, or a lower quality`);
  if (w < Math.max(...asked)) console.log(`WARN the source gives ${w} px of width: generate or upscale larger for the widest slot; ffmpeg does not add detail`);
  const last = rows[rows.length - 1];
  const set = (ext) => rows.map((r) => `${name}-${r.W}.${ext} ${r.W}w`).join(', ');
  console.log(`\n<picture>\n  <source type="image/avif" srcset="${set('avif')}" sizes="100vw">\n  <source type="image/webp" srcset="${set('webp')}" sizes="100vw">\n  <img src="${name}-${last.W}.webp" width="${last.W}" height="${last.H}" alt="…" decoding="async">\n</picture>`);
  console.log('sizes: what the slot really spans. The first-screen image: fetchpriority="high", never loading="lazy"; the rest loading="lazy".');
}

function loop() {
  const { src, out, name } = target();
  const info = probe(src);
  const fade = Number(flag('fade', '1.5'));
  const start = Number(flag('start', '0'));
  const length = Number(flag('length', String(Math.max(0, info.duration - start))));
  if (fade && length < fade * 3) die(`the clip gives ${length.toFixed(1)} s: a ${fade} s crossfade needs at least ${fade * 3} s`);
  const height = Math.min(Number(flag('height', '1080')), info.height);
  const scale = `scale=-2:${height - height % 2}:flags=lanczos,format=yuv420p`;
  const graph = fade
    ? `[0:v]trim=${fade}:${length},setpts=PTS-STARTPTS[main];[0:v]trim=0:${fade},setpts=PTS-STARTPTS[head];[main][head]xfade=transition=fade:duration=${fade}:offset=${(length - 2 * fade).toFixed(3)},${scale}[v]`
    : `[0:v]trim=0:${length},setpts=PTS-STARTPTS,${scale}[v]`;
  const input = ['-ss', String(start), '-t', String(length), '-i', src, '-filter_complex', graph, '-map', '[v]', '-an'];
  const encode = (file, codec, crf) => {
    const c = codec === 'h264' ? ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-movflags', '+faststart']
      : ['-c:v', 'libsvtav1', '-preset', '6', '-crf', String(crf), '-movflags', '+faststart'];
    ffmpeg([...input, ...c, file]);
    return kb(file);
  };
  const results = [];
  for (const [codec, file, crfs] of [['h264', join(out, `${name}.mp4`), [26, 30, 34]], ['av1', join(out, `${name}-av1.mp4`), [38, 44, 50]]]) {
    let size = 0, crf = 0;
    for (crf of crfs) { size = encode(file, codec, crf); if (size <= VIDEO_KB) break; }
    results.push({ codec, file, size, crf });
  }
  const poster = join(out, `${name}-poster.webp`);
  ffmpeg(['-i', join(out, `${name}.mp4`), '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', poster]);
  const made = probe(join(out, `${name}.mp4`));
  for (const r of results) console.log(`${r.codec.padEnd(5)} ${basename(r.file)}  ${r.size} KB  crf ${r.crf}${r.size > VIDEO_KB ? `  FAIL over ${VIDEO_KB} KB: shorter, smaller or calmer` : ''}`);
  console.log(`poster ${basename(poster)}  ${kb(poster)} KB   loop ${made.duration.toFixed(2)} s at ${made.width} × ${made.height}`);
  console.log(`\n<video autoplay muted loop playsinline preload="metadata" poster="${name}-poster.webp" width="${made.width}" height="${made.height}" aria-hidden="true">\n  <source src="${name}-av1.mp4" type='video/mp4; codecs="av01.0.08M.08"'>\n  <source src="${name}.mp4" type="video/mp4">\n</video>`);
  console.log('Add the visible pause control; under prefers-reduced-motion show the poster and do not play.');
  if (results.some((r) => r.size > VIDEO_KB)) process.exitCode = 1;
}

const cmd = argv[0];
if (cmd === 'detect') await detect();
else if (cmd === 'still') still();
else if (cmd === 'loop') loop();
else die('usage: node media.mjs detect | still <image> | loop <clip>   (see the header of this file)');
