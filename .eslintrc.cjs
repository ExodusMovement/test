module.exports = {
  extends: ['@exodus/eslint-config/typescript'],
  rules: {
    '@typescript-eslint/no-unnecessary-condition': 'off',
    'unicorn/consistent-function-scoping': 'off',
  },
  overrides: [
    {
      files: ['**/__test__/**/*.?([cm])[jt]s?(x)', '*.{spec,test}.?([cm])[jt]s?(x)'],
      rules: {
        'unicorn/no-empty-file': 'off',
      },
    },
    {
      files: ['**/*.?([cm])[jt]s?(x)'],
      rules: {
        'unicorn/no-empty-file': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
}
