module.exports = {
  extends: ['@exodus/eslint-config/typescript'],
  rules: {
    '@typescript-eslint/no-unnecessary-condition': 'off',
    'unicorn/consistent-function-scoping': 'off',
  },
  overrides: [
    {
      files: ['**/*.?([cm])js'],
      parser: 'espree',
    },
    {
      files: ['**/__test__/**/*.?([cm])[jt]s?(x)', '*.{spec,test}.?([cm])[jt]s?(x)'],
      rules: {
        // Subpath exports support is missing: https://github.com/import-js/eslint-plugin-import/issues/1810
        '@exodus/import/no-unresolved': [2, { ignore: ['@exodus/test/\\w+'] }],
        'unicorn/no-empty-file': 'off',
      },
    },
    {
      files: ['**/*.?([cm])[jt]s?(x)'],
      rules: {
        'unicorn/no-empty-file': 'off',
        'unicorn/no-process-exit': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
}
