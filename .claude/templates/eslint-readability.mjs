// Readability limits of the kit, as an ESLint flat-config fragment: spread it into the repo's `eslint.config.mjs`
// (`...readability`). The gate's `lint:` line runs it. Going over a limit needs an inline `eslint-disable-next-line <rule> -- <reason>`.
export const readability = [{
  files: ['**/*.{js,mjs,cjs,ts,tsx}'],
  ignores: ['**/*.{test,spec}.*', '**/test/**', '**/tests/**', '**/e2e/**'],
  rules: {
    'max-lines': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
    'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
    complexity: ['error', 10],
    'max-depth': ['error', 3],
    'max-params': ['error', 4],
    'max-classes-per-file': ['error', 1],
    // Fast by construction (rules/speed.md): independent awaits run together, not one per iteration.
    'no-await-in-loop': 'error',
    // Readable code (rules/architecture.md): the main path is not nested, a rule's literal has a name.
    'no-nested-ternary': 'error',
    'no-else-return': ['error', { allowElseIf: false }],
    'no-lonely-if': 'error',
    curly: ['error', 'all'],
    'no-magic-numbers': ['error', { ignore: [-1, 0, 1, 2], ignoreArrayIndexes: true, ignoreDefaultValues: true, enforceConst: true }],
  },
}];
