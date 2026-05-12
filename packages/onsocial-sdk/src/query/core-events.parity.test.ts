// ---------------------------------------------------------------------------
// Parity test — SSoT for core-onsocial contract events.
//
// Reads `contracts/core-onsocial/src/**/*.rs` and asserts:
//   1. Every CORE_EVENT_TYPE declared in `core-events.ts` corresponds to a
//      `pub const EVENT_TYPE_*` declaration in `constants.rs`.
//   2. Every (eventType, operation) pair in CORE_CONTRACT_EVENTS is actually
//      emitted somewhere in the contract source via
//      `EventBuilder::new(EVENT_TYPE_*, "<op>", ...)`.
//
// Operations not surfaced by the SDK are intentionally NOT enumerated here —
// add them only when a query starts filtering on them.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CORE_EVENT_TYPES,
  CORE_CONTRACT_EVENTS,
  CORE_RUST_TYPE_TO_EVENT_TYPE,
} from './core-events.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_SRC = resolve(HERE, '../../../../contracts/core-onsocial/src');
const CONSTANTS_FILE = join(CORE_SRC, 'constants.rs');

function walkRustFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walkRustFiles(p));
    else if (entry.endsWith('.rs')) out.push(p);
  }
  return out;
}

function readAllSources(): string {
  if (!existsSync(CORE_SRC)) return '';
  return walkRustFiles(CORE_SRC)
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n\n');
}

function scanEmissions(src: string): Set<string> {
  // Normalize whitespace so multi-line `EventBuilder::new(\n  EVENT_TYPE_X,\n  "op",`
  // becomes single-line and matches the same regex.
  const flat = src.replace(/\s+/g, ' ');
  const out = new Set<string>();
  // Allow the constant to be path-qualified (e.g. `crate::constants::EVENT_TYPE_DATA_UPDATE`).
  const re =
    /EventBuilder::new\(\s*(?:[\w:]+::)?(EVENT_TYPE_[A-Z_]+)\s*,\s*"([a-z0-9_]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat)) !== null) {
    const eventType = CORE_RUST_TYPE_TO_EVENT_TYPE[m[1]];
    if (eventType) out.add(`${eventType}::${m[2]}`);
  }
  return out;
}

describe('core SDK ↔ contract event parity', () => {
  it('core contract source dir exists', () => {
    expect(existsSync(CORE_SRC)).toBe(true);
  });

  it('CORE_EVENT_TYPES match `pub const EVENT_TYPE_*` declarations', () => {
    const constants = readFileSync(CONSTANTS_FILE, 'utf8');
    const declared = new Set<string>();
    const re =
      /pub\s+const\s+(EVENT_TYPE_[A-Z_]+)\s*:\s*&str\s*=\s*"([A-Z_]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(constants)) !== null) declared.add(m[2]);

    for (const ev of Object.values(CORE_EVENT_TYPES)) {
      if (!declared.has(ev)) {
        throw new Error(
          `SDK declares event_type '${ev}' but it is not declared in constants.rs.\nDeclared: ${[...declared].sort().join(', ')}`
        );
      }
      expect(declared.has(ev)).toBe(true);
    }
  });

  const src = readAllSources();
  const emitted = scanEmissions(src);

  it('contract source emits at least one EventBuilder pair', () => {
    expect(emitted.size).toBeGreaterThan(0);
  });

  for (const [eventType, ops] of Object.entries(CORE_CONTRACT_EVENTS) as Array<
    [string, readonly string[]]
  >) {
    for (const op of ops) {
      it(`SDK declares ${eventType}::${op} → contract emits it`, () => {
        const key = `${eventType}::${op}`;
        if (!emitted.has(key)) {
          const sample = [...emitted]
            .filter((k) => k.startsWith(eventType + '::'))
            .sort();
          throw new Error(
            `SDK declares ${key} but core contract source does not emit it.\nOperations actually emitted under ${eventType}:\n  ${sample.join('\n  ')}`
          );
        }
        expect(emitted.has(key)).toBe(true);
      });
    }
  }

  // Reverse-parity at the event_type axis: if the contract emits any
  // operation under an event_type the SDK doesn't declare, fail. We do NOT
  // enforce reverse parity at the operation axis — new operations may land
  // ahead of the SDK adding query support.
  it('SDK declares every contract-emitted event_type (reverse parity)', () => {
    const declared = new Set<string>(Object.values(CORE_EVENT_TYPES));
    const emittedTypes = new Set<string>();
    for (const key of emitted) emittedTypes.add(key.split('::')[0]);
    const missing = [...emittedTypes].filter((t) => !declared.has(t)).sort();
    if (missing.length > 0) {
      throw new Error(
        `Contract emits event_types not declared in SDK SSoT CORE_EVENT_TYPES:\n  ${missing.join('\n  ')}\n\nAdd them to packages/onsocial-sdk/src/query/core-events.ts.`
      );
    }
    expect(missing.length).toBe(0);
  });
});
