#!/usr/bin/env node
// Stop: does not let the turn end if the last message promises to continue when something finishes.
// Measured three times: the run sent the validations to the background, wrote “I'll continue when
// they finish”, and there was no “when they finish” — the process ended and took them along. The
// rule was in prose and was not enough; this enforces it.
// The patterns cover English and Spanish: the last message is written in the language of the repo's
// team, not of the kit.
// Contract: exit 0 lets it end; exit 2 prevents it and Claude reads stderr.
// It is the only hook that lets things through on its own error: without being able to read the turn
// it does not know whether it already blocked once, and blocking the close blindly jams the session forever.
import { closeSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { delegateToRepo } from '../tools/card.mjs';
import { linesOf as streamLines } from '../tools/transcript.mjs';

let input;
let raw;
try { raw = readFileSync(0, 'utf8'); input = JSON.parse(raw); } catch { process.exit(0); }
await delegateToRepo(import.meta.url, raw, input);

// If it was already blocked once and still wants to end, it is let through: blocking in a loop is worse.
if (input.stop_hook_active) process.exit(0);

// The end of the transcript first. Past it, the transcript is streamed a line at a time and only the lines that can
// matter are parsed: a long session's passes 600 MB, more than V8's longest string, and a whole read threw.
const TAIL_BYTES = 1024 * 1024;
const tailOf = (path) => {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    const lines = buffer.toString('utf8').trim().split('\n');
    if (length < size) lines.shift();
    return { lines, whole: length === size };
  } finally { closeSync(fd); }
};
const textOf = (line) => {
  if (!line.includes('"assistant"') || !line.includes('"text"')) return '';
  let j;
  try { j = JSON.parse(line); } catch { return ''; }
  if (j.message?.role !== 'assistant' || !Array.isArray(j.message.content)) return '';
  return j.message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
};
const lastTextOf = (path) => {
  const tail = tailOf(path);
  let text = '';
  for (let i = tail.lines.length - 1; i >= 0 && !text; i--) text = textOf(tail.lines[i]);
  if (text || tail.whole) return text;
  for (const line of streamLines(path)) text = textOf(line) || text;
  return text;
};

// A subagent's last message is its report: the caller reads nothing else of it. The main thread's
// wording does not fit it; what is enforced is that the report is whole and not a pointer to an
// earlier message. Measured: subagents ended with “the previous message is the result” and the
// caller received that line.
if (input.agent_id) {
  let report = typeof input.last_assistant_message === 'string' ? input.last_assistant_message : null;
  if (report === null) {
    try { report = lastTextOf(input.agent_transcript_path ?? input.transcript_path); } catch { process.exit(0); }
  }
  const text = report.trim();
  const POINTER = /\b(previous|prior|earlier|above|last) (message|report|response|reply)\b|\b(mensaje|reporte|respuesta) anterior\b/i;
  if (text.length < 200 || (text.length < 600 && POINTER.test(text))) {
    process.stderr.write(
      'Your last message is your report and the only thing the caller reads: return it whole — result, ' +
      'evidence, what is pending — not a reference to an earlier message.\n'
    );
    process.exit(2);
  }
  process.exit(0);
}

let last = typeof input.last_assistant_message === 'string' ? input.last_assistant_message : '';
if (!last) { try { last = lastTextOf(input.transcript_path); } catch { process.exit(0); } }

// In an interactive session (no SDD_UNATTENDED=1) the main thread may end its turn with work running when this turn armed
// what wakes it: a `Monitor`, or a command or agent launched with `run_in_background`, whose end is notified. The person
// can talk meanwhile. Unattended, nothing wakes it: the rule below holds.
// Armed in an earlier turn and not yet ended wakes it all the same: a background task whose end notice (`<tool-use-id>` with a
// `<status>`) is not in the transcript is still running. Measured: the hook fired on every turn of a session that watched a
// suite armed two turns before. One streamed pass answers both.
const wakesThisTurn = (path) => {
  const armed = new Set(), ended = new Set();
  let armedSinceUser = false;
  for (const line of streamLines(path)) {
    if (line.includes('task-notification')) for (const m of line.matchAll(/<tool-use-id>([^<]+)<\/tool-use-id>(?=[\s\S]*?<status>)/g)) ended.add(m[1]);
    const typed = line.includes('"user"') && line.includes('"content":"');
    const arms = line.includes('"tool_use"') && (line.includes('"Monitor"') || line.includes('"run_in_background":true'));
    if (!typed && !arms) continue;
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    const content = j.message?.content;
    // A background task's notice is stored as a user message, but it is not one: the turn it opens keeps what was armed before.
    if (j.type === 'user' && !j.isMeta && typeof content === 'string' && !content.startsWith('<task-notification>')) armedSinceUser = false;
    if (j.message?.role !== 'assistant' || !Array.isArray(content)) continue;
    for (const b of content) if (b.type === 'tool_use' && (b.name === 'Monitor' || b.input?.run_in_background === true)) { armed.add(b.id); armedSinceUser = true; }
  }
  return armedSinceUser || [...armed].some((id) => !ended.has(id));
};

// What is quoted is not a promise: it is talking about one. Measured: the hook blocked a message
// that described what the hook blocks, quoting the phrase.
// The way to bring something down is searched for in the original: it usually goes in backticks.
const original = last;
last = last.replace(/«[^»\n]*»|"[^"\n]*"|“[^”\n]*”|`[^`\n]*`/g, '');

const PROMISE = new RegExp(
  '\\b(sigo|contin[uú]o|vuelvo|reporto|te aviso|retomo)\\b[^.\\n]{0,40}\\bcuando\\b[^.\\n]{0,30}\\b(termin|acab|est[eé] list|vuelv|llegu)' +
  '|\\b(continue|resume|report|come back|get back|let you know|pick (?:this|it) up)\\b[^.\\n]{0,40}\\bwhen\\b[^.\\n]{0,30}\\b(finish|complet|done|ready|return|back|arriv)', 'i');
const ALIVE = new RegExp(
  '\\b(sigue|siguen|queda|quedan|est[aá]|est[aá]n)(?=\\s)[^.\\n]{0,25}\\b(corriendo|en curso|en cola|en (el )?(fondo|background|segundo plano))' +
  '|\\b(is|are|stays?|remains?|keeps?|still)(?=\\s)[^.\\n]{0,25}\\b(running|in progress|queued|in (the )?background)', 'i');
// “Waiting for the run…” at the end of the turn is the same: the turn goes and the wait goes with it.
// Measured: a run with nobody watching closed with “Waiting for the red run…” and the session died there.
const WAITING = /(^|[.\n]\s*)(sigo |quedo |I keep |I'm still |I am still |still |I'm |I am )?(esperando|waiting|awaiting)\b/i;
// “What runs when X finishes” is also a promise, even if it does not say “I'll continue”.
const DEFERRED = /\bcuando (termine|terminen|acabe|acaben)\b|\bwhen (it|they|\S+) (finish|finishes|complete|completes|is done|are done)\b/i;
// Leaving something alive is valid if it says how to bring it down; promising to come back, never.
const DECLARED = /\b(pid\s*\d+|TaskStop|se baja con|kill\s+\d+|stop (it|them) with)/i;

// “Nothing is left running” is the opposite of a pending promise: the negated phrase is discarded.
// “They keep running on every card” describes how something works, not a process that stayed alive.
const asserted = (re) => [...last.matchAll(new RegExp(re.source, 'gi'))].some((m) => {
  const before = last.slice(Math.max(0, m.index - 12), m.index);
  const after = last.slice(m.index + m[0].length, m.index + m[0].length + 20);
  return !/\b(no|nada|ya no|nothing|no longer)\s*$/i.test(before) && !/\bnada\b|\bnothing\b|\bnot\b|n't\b/i.test(m[0]) &&
    !/^\s*(en cada|por cada|por card|siempre|igual|on every|on each|in every|in each|per card|always)\b/i.test(after);
});
const alive = asserted(ALIVE);
const pending = asserted(PROMISE) || asserted(WAITING) || (alive && DEFERRED.test(last)) || (alive && !DECLARED.test(original));

if (pending && process.env.SDD_UNATTENDED !== '1') {
  try { if (wakesThisTurn(input.transcript_path)) process.exit(0); } catch { /* the rule below decides */ }
}
if (pending) {
  process.stderr.write(
    'You are about to end by promising to continue when something finishes. There will be no “when it ' +
    'finishes”: the turn ends here and whatever was left running goes with it. If the close depends ' +
    "on that result, watch it with a `Monitor` (`node .claude/tools/wait.mjs <log> --until '<regex>' [--fail '<regex>'] --monitor --max 1790`, " +
    '`timeout_ms: 1800000`) or launch it with `run_in_background`, and end the turn: its events wake you. Unattended ' +
    '(SDD_UNATTENDED=1) nothing wakes you: wait for it in the foreground or dispatch it to a subagent that waits for it, ' +
    'and report with the real output. If it does not depend, say what was left running, its PID and ' +
    'how to bring it down. A subagent launched in the foreground, such as a builder, has already returned: ' +
    'its report is in the conversation, so there is nothing to wait for or to poll. One that came back as running in the background ' +
    'is awaited with `node .claude/tools/wait.mjs --agent <agentId> [--max 570]` or its notification, never by looking for the file it will write.\n'
  );
  process.exit(2);
}
process.exit(0);
