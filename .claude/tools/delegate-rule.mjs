// Who writes production code during a card, as one rule for every way a file gets written: delegate-code.mjs asks it
// for Edit and Write, guard-shell.mjs for each production file a shell line writes (shell-writes.mjs).
// - A `builder` or a `grunt` does, in its own context, from card.md.
// - The main thread does only when `risk.json` says `size: small` and a commit already holds the card's tests
//   (`@<ID>-S<n>`): RED comes before the code. On a `large` card, or before that commit, it launches the `builder`.
// - A `designer` writes only the files `## Tasks` marks `(presentation)`; at poc, any.
// - Any other subagent (a scout, a runner, an oracle) writes it without the card in front of it: refused.
// A subagent's hook input has `agent_id` and `agent_type`; the main thread's has neither.
import * as card from './card.mjs';

// The reason `input` may not write `path`, or null when it may.
export const productionVerdict = async (input, path) => {
  if (input.agent_id && ['builder', 'grunt'].includes(input.agent_type)) return null;
  if (!path) return null;
  const root = card.rootOf(path);
  if (!root || !card.isProductionPath(root, path)) return null;
  const cardDir = card.currentCard(root);
  if (!cardDir) return null;
  if (input.agent_id && input.agent_type === 'designer') {
    // A poc is all facade and has no `## Tasks`: the designer writes any of its files (require-bar keeps logic out).
    let poc = false;
    try { poc = (await import('./kit.mjs')).isPoc(root); } catch { poc = false; }
    if (poc) return null;
    const { readCard, rolesOf } = await import('./card-doc.mjs');
    const { roleFor } = await import('./gate-checks.mjs');
    const roles = rolesOf(readCard(cardDir) ?? '');
    if (roleFor(roles, path.replaceAll('\\', '/')) === 'presentation') return null;
    const allowed = [...roles].filter(([, role]) => role === 'presentation').map(([file]) => file);
    return `The \`designer\` writes only the files \`## Tasks\` marks \`(presentation)\`: ${allowed.length ? allowed.join(', ') : 'none is marked yet'}. Not rules, data or tests. Tokens and new styles go inside a presentation file already listed; a change that needs another file goes to the Log as \`OUT · <what>\`.`;
  }
  if (card.actsAsMain(input)) {
    const risk = (await import('./card-doc.mjs')).riskOf(cardDir);
    // At poc the main thread writes the whole facade, whatever the size: there is no builder and no RED.
    let poc = false;
    try { poc = (await import('./kit.mjs')).isPoc(root); } catch { poc = false; }
    if (poc) return null;
    if (risk?.size === 'small' && card.redCommitted(root, cardDir)) return null;
    // Past the card's time cap no builder starts (time-cap): the main thread finishes what is left, after the RED, or nobody can.
    const cap = card.cardCap(cardDir);
    const elapsed = card.minutesSinceSnapshot(root, cardDir);
    if (cap !== null && elapsed !== null && elapsed >= cap && card.redCommitted(root, cardDir)) return null;
    const why = !risk ? 'there is no risk.json yet: `node .claude/tools/risk.mjs specs/<card>` classifies the card'
      : risk.size === 'small' ? 'the card is small, and no commit holds its tests yet (`@<ID>-S<n>`): write them, run them red and commit them first'
        : 'the card is large';
    return `The main thread does not write production code here: ${why}. A large card goes to the \`builder\` with card.md, its task IDs and the gate command.`;
  }
  return 'Only the `builder` and the `grunt` write production code during a card; not another subagent. Launch the `builder` with the path of card.md, its task IDs and the gate command.';
};
