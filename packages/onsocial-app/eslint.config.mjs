import nextConfig from 'eslint-config-next/core-web-vitals';

const config = [
  {
    ignores: [
      '.next/**',
      '.next-e2e/**',
      '.next-testnet/**',
      '.next-mainnet/**',
      'out/**',
      'node_modules/**',
    ],
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
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next/font/google',
              message:
                'Vendor the woff2 and use next/font/local. Google font fetches fail the production build when fonts.googleapis.com is unreachable.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
