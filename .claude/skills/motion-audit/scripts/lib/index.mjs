// Public API of the package: `import { audit } from 'motion-audit'`.
export { audit, exitCode } from './audit.mjs';
export { KINDS, kindNames } from './kinds.mjs';
export { analyzeSeries, analyzeRecording, easingKind } from './series.mjs';
export { interruptionJumps } from './continuity.mjs';
export { judgeElement, inconsistencies } from './judge.mjs';
export { compareReports, readReport } from './compare.mjs';
export { fingerprint, loadConfig, validateConfig } from './config.mjs';
export { reducedMoves, reducedResidue, transformState } from './reduced.mjs';
