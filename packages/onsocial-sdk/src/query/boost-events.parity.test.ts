// ---------------------------------------------------------------------------
// Parity test — SSoT for boost contract events.
//
// Recursively scans every `*.rs` file under `contracts/boost-onsocial/src/`
// and asserts every event_type declared in `boost-events.ts` is actually
// emitted via `self.emit_event("<EVENT_NAME>", ...)` in the Rust source.
// Also performs reverse-parity: fails CI if the contract emits an event the
// SDK doesn't declare.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOST_EVENT_TYPES } from './boost-events.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT_SRC_DIR = resolve(
  HERE,
  '../../../../contracts/boost-onsocial/src'
);

function collectRustFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...collectRustFiles(full));
    else if (
      s.isFile() &&
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
  // Match `emit_event("EVENT_NAME"` and `.emit_event("EVENT_NAME"`.
  const re = /\bemit_event\(\s*"([A-Z_]+)"/g;
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) out.add(m[1]);
  }
  return out;
}

describe('boost SDK ↔ contract event parity', () => {
  it('contract source directory exists', () => {
    expect(existsSync(CONTRACT_SRC_DIR)).toBe(true);
  });

  const files = collectRustFiles(CONTRACT_SRC_DIR);
  const emitted = scanEmissions(files);

  it('contract source emits at least one event', () => {
    expect(emitted.size).toBeGreaterThan(0);
  });

  for (const eventType of Object.values(BOOST_EVENT_TYPES)) {
    it(`SDK declares ${eventType} → contract emits it`, () => {
      if (!emitted.has(eventType)) {
        const sample = [...emitted].sort();
        throw new Error(
          `SDK declares event '${eventType}' but contract source does not emit it.\nEvents actually emitted:\n  ${sample.join('\n  ')}`
        );
      }
      expect(emitted.has(eventType)).toBe(true);
    });
  }

  it('SDK declares every contract-emitted event (reverse parity)', () => {
    const declared = new Set<string>(Object.values(BOOST_EVENT_TYPES));
    const missing = [...emitted].filter((e) => !declared.has(e)).sort();
    if (missing.length > 0) {
      throw new Error(
        `Contract emits events not declared in SDK SSoT BOOST_EVENT_TYPES:\n  ${missing.join('\n  ')}\n\nAdd them to packages/onsocial-sdk/src/query/boost-events.ts.`
      );
    }
    expect(missing.length).toBe(0);
  });
});
