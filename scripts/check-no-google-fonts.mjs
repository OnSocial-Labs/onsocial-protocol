#!/usr/bin/env node
/**
 * Fails if any package imports next/font/google.
 * Those imports download from fonts.googleapis.com during `next build`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['packages'];
const hits = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name.startsWith('.next')
    ) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name)) continue;
    const text = readFileSync(path, 'utf8');
    if (
      /from\s+['"]@?next\/font\/google['"]/.test(text) ||
      /require\(\s*['"]@?next\/font\/google['"]\s*\)/.test(text)
    ) {
      hits.push(path);
    }
  }
}

for (const root of roots) walk(root);

if (hits.length > 0) {
  console.error(
    'next/font/google is imported. Use next/font/local and a vendored woff2.'
  );
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}

console.log('No next/font/google imports.');
