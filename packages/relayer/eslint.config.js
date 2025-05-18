import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import ts from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    ignores: ['dist/**/*'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: parser,
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
      },
    },
    plugins: {
      prettier,
      '@typescript-eslint': ts,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...prettier.configs.recommended.rules,
      ...ts.configs.recommended.rules,
      'prettier/prettier': 'error',
    },
  },
];
