// What the hooks read from a transcript: where it is and the `usage` of its last assistant message.
// context-cap.mjs measures the context with it; guard-shell.mjs reads which prompt cache the author writes.
import { closeSync, existsSync, fstatSync, openSync, readSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const TAIL_BYTES = 512 * 1024;

// The subagent's transcript is `agent_transcript_path` when the input has it, else the one next to the session
// transcript: `<session>/subagents/agent-<agent_id>.jsonl`. The main thread has no `agent_id`: null.
export const transcriptOf = (input) => {
  if (input.agent_transcript_path) return input.agent_transcript_path;
  const main = input.transcript_path;
  if (!main || !input.agent_id || !/^[\w.-]+$/.test(String(input.agent_id))) return null;
  if (/[\\/]subagents[\\/]agent-[\w.-]+\.jsonl$/.test(main)) return main;
  return join(dirname(main), basename(main, '.jsonl'), 'subagents', `agent-${input.agent_id}.jsonl`);
};

// The `usage` of the last assistant message that has one, or null. A compact boundary met first is null: the usage
// before it measures the context that was compacted, not the one in use.
export const lastUsage = (file) => {
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    const lines = buffer.toString('utf8').split('\n');
    if (size > length) lines.shift();
    for (const line of lines.reverse()) {
      if (line.includes('"compact_boundary"')) {
        try { if (JSON.parse(line).subtype === 'compact_boundary') return null; } catch { /* a half-written line */ }
      }
      if (!line.includes('"usage"')) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      const usage = entry.type === 'assistant' ? entry.message?.usage : null;
      if (usage) return usage;
    }
    return null;
  } finally { closeSync(fd); }
};

// The lines of a JSONL file, read 1 MB at a time: a long session's transcript passes V8's longest string (~512 MB), so it
// is never read whole.
export function* linesOf(file) {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(1 << 20);
    let rest = Buffer.alloc(0);
    for (let n; (n = readSync(fd, buf, 0, buf.length, null)) > 0;) {
      const chunk = rest.length ? Buffer.concat([rest, buf.subarray(0, n)]) : buf.subarray(0, n);
      let start = 0;
      for (let i; (i = chunk.indexOf(10, start)) !== -1; start = i + 1) yield chunk.toString('utf8', start, i);
      rest = Buffer.from(chunk.subarray(start));
    }
    if (rest.length) yield rest.toString('utf8');
  } finally { closeSync(fd); }
}

// The turns a subagent has used: its assistant messages with a distinct `message.id` (one turn is split in several lines).
export const countTurns = (file) => {
  const ids = new Set();
  for (const line of linesOf(file)) {
    if (!line.includes('"assistant"')) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'assistant') ids.add(entry.message?.id ?? `line-${ids.size}`);
    } catch { /* a half-written last line */ }
  }
  return ids.size;
};

// A command that is only `git add`, `git commit` and `git status`, perhaps after a `cd`: heredocs and quoted
// strings (a commit message) are taken out before it is split.
const GIT_ONLY = /^git(?:\s+-C\s+\S+)?\s+(?:add|commit|status)\b/;
export const onlyCommit = (command) => {
  const bare = command.replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\s*\1\b/g, '').replace(/"[^"]*"|'[^']*'/g, '""');
  const segments = bare.split(/&&|;|\||\n/).map((s) => s.trim()).filter(Boolean);
  return segments.some((s) => GIT_ONLY.test(s)) && segments.every((s) => GIT_ONLY.test(s) || /^cd\s+\S+$/.test(s));
};

// The user's last message in the session: a typed prompt or one sent while the agent worked; tool results,
// reminders, background-task notices (stored as user messages that start with `<`), the summary a compaction writes
// as a user message and subagents are not theirs.
const userEntryOf = (line) => {
  const none = { text: '', at: null };
  if (!line.includes('"user"') && !line.includes('queued_command')) return none;
  let e;
  try { e = JSON.parse(line); } catch { return none; }
  const text = userTextIn(e);
  return text ? { text, at: e.timestamp ? Date.parse(e.timestamp) : null } : none;
};
const userTextIn = (e) => {
  const own = e.type === 'user' && !e.isMeta && !e.isSidechain && !e.isCompactSummary && !e.isVisibleInTranscriptOnly;
  if (own && typeof e.message?.content === 'string') return e.message.content.startsWith('<') ? '' : e.message.content;
  if (own && Array.isArray(e.message?.content) && e.message.content.length && e.message.content.every((c) => c.type === 'text')) {
    return e.message.content.map((c) => c.text).filter((t) => !t.startsWith('<')).join('\n');
  }
  if (e.type === 'attachment' && e.attachment?.type === 'queued_command' && e.attachment.origin?.kind === 'human') return String(e.attachment.prompt ?? '');
  return '';
};
// Read from the end in blocks: a long session's transcript passes the largest string Node can hold.
const TAIL_BLOCK = 1 << 22;
export const lastUserText = (path) => lastUser(path).text;
// The person's last message read as an order for a hook call: it holds for ORDER_TTL_MS after it was given, and never for a
// subagent's call (`agent_id`), whose transcript is the parent's, so that message was about something else.
export const ORDER_TTL_MS = 30 * 60_000;
export const currentOrder = (input, now = Date.now()) => {
  if (input?.agent_id) return '';
  const { text, at } = lastUser(String(input?.transcript_path ?? ''));
  return at !== null && now - at > ORDER_TTL_MS ? '' : text;
};
// The last message the person typed, with its time (`at`, in ms; null when the line has none).
export const lastUser = (path) => {
  if (!path || !existsSync(path)) return { text: '', at: null };
  const fd = openSync(path, 'r');
  try {
    let end = fstatSync(fd).size;
    let rest = Buffer.alloc(0);
    while (end > 0) {
      const start = Math.max(0, end - TAIL_BLOCK);
      const chunk = Buffer.alloc(end - start);
      readSync(fd, chunk, 0, chunk.length, start);
      const buf = Buffer.concat([chunk, rest]);
      end = start;
      // Bytes before the first newline may be the tail of a line that starts in an earlier block.
      const cut = start === 0 ? -1 : buf.indexOf(10);
      if (start > 0 && cut === -1) { rest = buf; continue; }
      rest = cut === -1 ? Buffer.alloc(0) : buf.subarray(0, cut);
      const lines = buf.subarray(cut + 1).toString('utf8').split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const entry = userEntryOf(lines[i]);
        if (entry.text) return entry;
      }
    }
    return { text: '', at: null };
  } finally { closeSync(fd); }
};

// The context the last assistant message with usage was sent with.
export const contextTokens = (file) => {
  const usage = lastUsage(file);
  return usage ? (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) : null;
};
