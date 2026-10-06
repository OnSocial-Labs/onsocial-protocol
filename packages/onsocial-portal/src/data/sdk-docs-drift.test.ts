import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OnSocial } from '@onsocial/sdk';

/**
 * Guards against SDK docs drift: every `os.*` path referenced in the portal
 * SDK docs must resolve on a real `OnSocial` instance, so a rename or
 * removal in @onsocial/sdk fails portal tests before stale docs ship.
 */
const DOCS_FILES = [
  'src/data/sdk-method-guides.ts',
  'src/data/sdk-hub-content.ts',
  'src/app/sdk/sdk-hub-client.tsx',
  'src/app/sdk/[family]/family-guide-client.tsx',
];

// Paths the docs mention precisely because they do NOT exist. Asserting
// absence keeps notes like "there is no os.social.delete" true.
const KNOWN_ABSENT = new Set(['os.social.delete']);

const TOKEN_RE =
  /\bos(?:\.[A-Za-z_$][\w$]*)+(?:\/(?:[A-Za-z_$][\w$]*|\.\.\.))*/g;

function expandToken(raw: string): string[] {
  let token = raw;
  if (token.endsWith('.*')) token = token.slice(0, -2);
  const segments = token.split('.');
  const last = segments[segments.length - 1];
  const alternatives = last
    .split('/')
    .filter((alt) => alt.length > 0 && alt !== '...');
  const base = segments.slice(0, -1).join('.');
  return alternatives.map((alt) => (base ? `${base}.${alt}` : alt));
}

function resolvePath(root: unknown, dottedPath: string): boolean {
  let current: unknown = root;
  for (const segment of dottedPath.split('.')) {
    if (
      current === null ||
      (typeof current !== 'object' && typeof current !== 'function')
    ) {
      return false;
    }
    const record = current as Record<string, unknown>;
    if (!(segment in record)) return false;
    current = record[segment];
  }
  return current !== undefined && current !== null;
}

function collectTokens(): Map<string, Set<string>> {
  const byFile = new Map<string, Set<string>>();
  for (const file of DOCS_FILES) {
    const text = readFileSync(path.resolve(process.cwd(), file), 'utf8');
    const tokens = new Set<string>();
    for (const match of text.matchAll(TOKEN_RE)) {
      for (const expanded of expandToken(match[0])) {
        tokens.add(expanded);
      }
    }
    byFile.set(file, tokens);
  }
  return byFile;
}

describe('SDK docs drift guard', () => {
  const os = new OnSocial();
  const byFile = collectTokens();

  it('every documented os.* path resolves on the SDK client', () => {
    const missing: string[] = [];
    for (const [file, tokens] of byFile) {
      for (const token of tokens) {
        if (KNOWN_ABSENT.has(token)) continue;
        if (!resolvePath(os, token.slice('os.'.length))) {
          missing.push(`${token} (${file})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('paths documented as absent stay absent', () => {
    for (const token of KNOWN_ABSENT) {
      expect(
        resolvePath(os, token.slice('os.'.length)),
        `${token} now exists - update the docs note that claims it does not`
      ).toBe(false);
    }
  });

  it('docs reference a meaningful number of SDK paths', () => {
    const total = [...byFile.values()].reduce((n, set) => n + set.size, 0);
    expect(total).toBeGreaterThan(50);
  });
});
