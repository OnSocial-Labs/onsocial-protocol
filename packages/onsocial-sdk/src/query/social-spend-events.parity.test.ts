// ---------------------------------------------------------------------------
// Parity test - SSoT for social-spend contract events.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOCIAL_SPEND_EVENT_TYPES } from './social-spend-events.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT_SRC_DIR = resolve(
  HERE,
  '../../../../contracts/social-spend-onsocial/src'
);

function collectRustFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) out.push(...collectRustFiles(full));
    else if (
      stats.isFile() &&
      full.endsWith('.rs') &&
      !entry.endsWith('_tests.rs') &&
      entry !== 'tests.rs'
    ) {
      out.push(full);
    }
  }
  return out;
}

function scanEmissions(files: string[]): Set<string> {
  const out = new Set<string>();
  const re = /\bemit\(\s*"([A-Z][A-Z0-9_]+)"/g;
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    let match: RegExpExecArray | null;
    while ((match = re.exec(src)) !== null) out.add(match[1]);
  }
  return out;
}

describe('social-spend SDK contract event parity', () => {
  it('contract source directory exists', () => {
    expect(existsSync(CONTRACT_SRC_DIR)).toBe(true);
  });

  const files = collectRustFiles(CONTRACT_SRC_DIR);
  const emitted = scanEmissions(files);

  it('contract source emits at least one event', () => {
    expect(emitted.size).toBeGreaterThan(0);
  });

  for (const eventType of Object.values(SOCIAL_SPEND_EVENT_TYPES)) {
    it(`SDK declares ${eventType} and contract emits it`, () => {
      if (!emitted.has(eventType)) {
        const sample = [...emitted].sort();
        throw new Error(
          `SDK declares event '${eventType}' but contract source does not emit it.\nEvents actually emitted:\n  ${sample.join('\n  ')}`
        );
      }
      expect(emitted.has(eventType)).toBe(true);
    });
  }

  it('SDK declares every contract-emitted event', () => {
    const declared = new Set<string>(Object.values(SOCIAL_SPEND_EVENT_TYPES));
    const missing = [...emitted].filter((event) => !declared.has(event)).sort();
    if (missing.length > 0) {
      throw new Error(
        `Contract emits events not declared in SOCIAL_SPEND_EVENT_TYPES:\n  ${missing.join('\n  ')}`
      );
    }
    expect(missing.length).toBe(0);
  });
});
