import nextConfig from 'eslint-config-next/core-web-vitals';

const config = [
  {
    ignores: ['.next/**', 'out/**', 'node_modules/**'],
  },
  ...nextConfig.map((entry) =>
    entry.name === 'next/typescript'
      ? {
          ...entry,
          rules: {
            ...entry.rules,
            '@typescript-eslint/no-unused-vars': [
              'warn',
              { argsIgnorePattern: '^_' },
            ],
          },
        }
      : entry
  ),
  {
    rules: {
      'no-unused-vars': 'off',
      'react/no-unescaped-entities': 'off',
      '@next/next/no-img-element': 'off',
    },
  },
];

export default config;
