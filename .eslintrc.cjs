module.exports = {
  extends: ['@exodus/eslint-config/typescript'],
  rules: {
    '@typescript-eslint/no-unnecessary-condition': 'off',
    'unicorn/consistent-function-scoping': 'off',
  },
  overrides: [
    {
      files: ['**/__tests__/**/*.{ts,js}', '*.{spec,test}.{ts,js}'],
      rules: {
        'unicorn/no-empty-file': 'off',
      },
    },
  ],
}
