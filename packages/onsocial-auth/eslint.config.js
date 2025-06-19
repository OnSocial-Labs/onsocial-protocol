// eslint.config.js for onsocial-auth (ESLint v9+)
import js from '@eslint/js';

export default [
  js(),
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
