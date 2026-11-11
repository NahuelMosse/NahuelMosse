// The background subagents of this machine that have not finished, by agent type. wait.mjs reads the same
// `agent-<id>.meta.json` files (`"finished": true` when an agent is done); required.mjs uses this to tell a
// report that is late from one that is missing. Claude home: `$KIT_CLAUDE_HOME`, else `$CLAUDE_CONFIG_DIR`, else `~/.claude`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// An unfinished agent silent for this long died: it will not report.
const STALE_MS = 60 * 60 * 1000;

// An agent that never finished and wrote nothing for STALE_MS is dead. The meta is written at launch and at the end only;
// the transcript next to it (`agent-<id>.jsonl`) grows on every turn, so the newer of the two is its last sign of life.
export const STALE_MINUTES = STALE_MS / 60000;
const touched = (file) => { try { return statSync(file).mtimeMs; } catch { return 0; } };
export const agentDead = (metaFile) => {
  try {
    if (JSON.parse(readFileSync(metaFile, 'utf8')).finished === true) return false;
    return Date.now() - Math.max(touched(metaFile), touched(metaFile.replace(/\.meta\.json$/, '.jsonl'))) >= STALE_MS;
  } catch { return false; }
};

export const runningAgents =(home = process.env.KIT_CLAUDE_HOME || process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')) => {
  const running = [];
  const projects = join(home, 'projects');
  const list = (dir) => { try { return readdirSync(dir); } catch { return []; } };
  for (const project of list(projects))
    for (const session of list(join(projects, project))) {
      const dir = join(projects, project, session, 'subagents');
      for (const name of list(dir).filter((n) => /^agent-.+\.meta\.json$/.test(n))) {
        try {
          const file = join(dir, name);
          const meta = JSON.parse(readFileSync(file, 'utf8'));
          if (meta.finished !== true && Date.now() - statSync(file).mtimeMs < STALE_MS)
            running.push({ id: name.slice(6, -10), type: meta.agentType, description: meta.description ?? '' });
        } catch { /* an unreadable meta is not a running agent */ }
      }
    }
  return running;
};
