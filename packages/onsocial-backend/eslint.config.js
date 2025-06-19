// eslint.config.js for onsocial-backend (ESLint v9+)
import js from '@eslint/js';

export default [
  js(),
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
