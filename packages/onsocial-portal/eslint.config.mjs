import nextConfig from 'eslint-config-next/core-web-vitals';

const config = [
  {
    ignores: ['.next/**', '.next-*/**', 'out/**', 'node_modules/**'],
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
      // Allow setState in effects for data-fetching patterns (fetch → setState)
      'react-hooks/set-state-in-effect': 'warn',
      // useDropdown returns { isOpen, toggle, containerRef } — consumers pass
      // containerRef to ref= props and read isOpen during render, which is safe.
      'react-hooks/refs': 'warn',
      // Local SVG icons don't benefit from next/image optimization
      '@next/next/no-img-element': 'off',
    },
  },
];

export default config;
