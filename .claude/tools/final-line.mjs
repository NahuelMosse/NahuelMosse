// The fixed last line of every kit tool that is waited on through a log: `<tool>: exit <N> in <X> min`.
// `wait.mjs` ends on it whatever `--until` says. Measured: 150 waits on a log hit their ceiling because the regex
// the caller guessed (`exit`, `mutants`, `Nothing`) was never written, though the tool had finished minutes before.
// `endsWithLine(tool)` registers it for every way the process can end —process.exit, exitCode, a throw—; a kill
// by signal writes nothing, and that is also what a wait has to learn from the ceiling.
import { writeSync } from 'node:fs';

// As the very last line, the caller's own `<tool>: exit <N>` (`; echo "gh: exit $?"`) counts too, without the minutes.
export const FINAL_LINE = /^\S+: exit (-?\d+)(?: in \d+(?:\.\d+)? min)?$/;

// The tools that write the line (those that call `endsWithLine`).
const TOOLS = 'verify|mutate|attack|repeat|probe|pairs|showreel|release|flutter-gate';
const TOOL_LINE = new RegExp(`^(?:${TOOLS}): exit (-?\\d+) in \\d+(?:\\.\\d+)? min$`);

// The fixed line of a log, or null. The LAST occurrence anywhere counts, not only the last line of the log: callers
// append their own text after the tool (`; echo "exit=$?" >> log`) and the line would be second to last. Measured:
// three waits ran to their 570 s ceiling on a verify that had ended in 0.3 min. Lines of a tool that is not one of
// ours (`once: exit 0`, printed by a command another tool ran) count only as the very last line.
// A log reused with `>>` can carry the line of an older run: it is indistinguishable from the line of a tool that
// ended before the wait began, which is the usual case and must end the wait. Rewrite logs with `>`.
export const finalLineOf = (text) => {
  const lines = String(text).trimEnd().split('\n').map((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = (i === lines.length - 1 ? FINAL_LINE : TOOL_LINE).exec(lines[i]);
    if (m) return { line: lines[i], exit: Number(m[1]) };
  }
  return null;
};

export const endsWithLine = (tool) => {
  const start = Date.now();
  process.on('exit', (code) => {
    try { writeSync(1, `${tool}: exit ${code} in ${((Date.now() - start) / 60000).toFixed(1)} min\n`); } catch { /* a closed pipe */ }
  });
};
