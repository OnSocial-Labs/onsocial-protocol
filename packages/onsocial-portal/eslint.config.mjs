import nextConfig from 'eslint-config-next/core-web-vitals';

const config = [
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
      // Allow setState in effects for data-fetching patterns (fetch → setState)
      'react-hooks/set-state-in-effect': 'warn',
      // Local SVG icons don't benefit from next/image optimization
      '@next/next/no-img-element': 'off',
    },
  },
];

export default config;
