#!/usr/bin/env node
/**
 * One-shot migration: arbitrary text-[Npx] → portal typography tokens.
 * Safe to re-run — skips patterns already migrated.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = join(import.meta.dirname, '../src');

const REPLACEMENTS = [
  // Eyebrow composites (most specific first)
  [
    /text-\[10px\]\s+font-medium\s+uppercase\s+tracking-\[0\.18em\]/g,
    'portal-eyebrow-wide',
  ],
  [
    /text-\[10px\]\s+font-medium\s+uppercase\s+tracking-\[0\.16em\]/g,
    'portal-eyebrow-wide',
  ],
  [
    /text-\[10px\]\s+font-medium\s+uppercase\s+tracking-\[0\.14em\]/g,
    'portal-eyebrow',
  ],
  [
    /text-\[10px\]\s+font-medium\s+uppercase\s+tracking-\[0\.12em\]/g,
    'portal-eyebrow',
  ],
  [/text-\[10px\]\s+uppercase\s+tracking-\[0\.18em\]/g, 'portal-eyebrow-wide'],
  [/text-\[10px\]\s+uppercase\s+tracking-\[0\.16em\]/g, 'portal-eyebrow-wide'],
  [/text-\[10px\]\s+uppercase\s+tracking-\[0\.14em\]/g, 'portal-eyebrow'],
  [/text-\[10px\]\s+uppercase\s+tracking-\[0\.12em\]/g, 'portal-eyebrow'],
  [
    /text-\[11px\]\s+font-medium\s+uppercase\s+tracking-\[0\.18em\]/g,
    'portal-eyebrow-wide',
  ],
  [
    /text-\[11px\]\s+font-medium\s+uppercase\s+tracking-\[0\.14em\]/g,
    'portal-eyebrow',
  ],
  [/text-\[11px\]\s+uppercase\s+tracking-\[0\.18em\]/g, 'portal-eyebrow-wide'],
  [/text-\[11px\]\s+uppercase\s+tracking-\[0\.14em\]/g, 'portal-eyebrow'],
  [/text-\[11px\]\s+uppercase\s+tracking-\[0\.16em\]/g, 'portal-eyebrow-wide'],
  // Redundant responsive bumps (token already scales at md)
  [/\s+md:text-\[11px\]/g, ''],
  [/\s+md:text-\[12px\]/g, ''],
  [/\s+md:text-\[13px\]/g, ''],
  [/\s+sm:text-\[10px\]/g, ''],
  // Composite responsive pairs → single token
  [/text-\[13px\]\s+md:text-sm/g, 'portal-type-body'],
  [
    /text-\[13px\]\s+font-semibold\s+md:text-sm/g,
    'portal-type-body font-semibold',
  ],
  [/text-sm\s+md:text-\[15px\]/g, 'portal-type-lead'],
  [/text-sm\s+md:text-base/g, 'portal-type-lead'],
  // Simple pixel sizes
  [/text-\[8px\]/g, 'portal-type-micro'],
  [/text-\[9px\]/g, 'portal-type-micro'],
  [/text-\[10px\]/g, 'portal-type-caption'],
  [/text-\[11px\]/g, 'portal-type-label'],
  [/text-\[12px\]/g, 'portal-type-body-sm'],
  [/text-\[13px\]/g, 'portal-type-body'],
  [/text-\[14px\]/g, 'portal-type-lead'],
  [/text-\[15px\]/g, 'portal-type-lead'],
  [/text-\[21px\]/g, 'portal-type-display'],
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(path, files);
    } else if (['.ts', '.tsx'].includes(extname(name))) {
      files.push(path);
    }
  }
  return files;
}

let totalFiles = 0;
let totalReplacements = 0;

for (const file of walk(ROOT)) {
  if (file.endsWith('portal-typography.ts')) continue;

  const original = readFileSync(file, 'utf8');
  let next = original;
  let fileReplacements = 0;

  for (const [pattern, replacement] of REPLACEMENTS) {
    const matches = next.match(pattern);
    if (matches) {
      fileReplacements += matches.length;
      next = next.replace(pattern, replacement);
    }
  }

  if (next !== original) {
    writeFileSync(file, next, 'utf8');
    totalFiles += 1;
    totalReplacements += fileReplacements;
    console.log(
      `updated ${file.replace(ROOT + '/', '')} (${fileReplacements} replacements)`
    );
  }
}

console.log(
  `\nDone: ${totalReplacements} replacements across ${totalFiles} files.`
);
