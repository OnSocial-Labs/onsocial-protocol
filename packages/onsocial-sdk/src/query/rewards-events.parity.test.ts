// ---------------------------------------------------------------------------
// Parity test — SSoT for rewards contract events.
//
// Recursively scans every `*.rs` file under `contracts/rewards-onsocial/src/`
// and asserts every event_type declared in `rewards-events.ts` is actually
// emitted via `emit("<EVENT_NAME>", ...)` in the Rust source.
//
// Why a recursive scan? Some events are emitted from `admin.rs`/handler files,
// not `events.rs` itself. A narrower scope would silently miss new events
// added in those files (this exact bug was caught for APP_REGISTERED /
// APP_UPDATED / APP_DEACTIVATED in May 2026).
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REWARDS_EVENT_TYPES } from './rewards-events.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT_SRC_DIR = resolve(
  HERE,
  '../../../../contracts/rewards-onsocial/src'
);

function collectRustFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...collectRustFiles(full));
    else if (s.isFile() && full.endsWith('.rs')) out.push(full);
  }
  return out;
}

function scanEmissions(files: string[]): Set<string> {
  const out = new Set<string>();
  // Match `emit("EVENT_NAME"`  — first arg of the local emit() helper.
  const re = /\bemit\(\s*"([A-Z_]+)"/g;
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) out.add(m[1]);
  }
  return out;
}

describe('rewards SDK ↔ contract event parity', () => {
  it('contract source directory exists', () => {
    expect(existsSync(CONTRACT_SRC_DIR)).toBe(true);
  });

  const files = collectRustFiles(CONTRACT_SRC_DIR);
  const emitted = scanEmissions(files);

  it('contract source emits at least one event', () => {
    expect(emitted.size).toBeGreaterThan(0);
  });

  for (const eventType of Object.values(REWARDS_EVENT_TYPES)) {
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

  // Reverse parity: catch contract-emitted events not declared in the SDK.
  // Soft warning rather than failure — keeps CI green while surfacing drift.
  it('SDK declares every contract-emitted event (reverse parity)', () => {
    const declared = new Set<string>(Object.values(REWARDS_EVENT_TYPES));
    const missing = [...emitted].filter((e) => !declared.has(e)).sort();
    if (missing.length > 0) {
      throw new Error(
        `Contract emits events not declared in SDK SSoT REWARDS_EVENT_TYPES:\n  ${missing.join('\n  ')}\n\nAdd them to packages/onsocial-sdk/src/query/rewards-events.ts.`
      );
    }
    expect(missing.length).toBe(0);
  });
});
