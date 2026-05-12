// ---------------------------------------------------------------------------
// Parity test — SSoT for Scarces contract events.
//
// Reads `contracts/scarces-onsocial/src/events/*.rs` directly and asserts
// every (eventType, operation) pair declared in `contract-events.ts` is
// actually emitted via `EventBuilder::new(<TYPE>, "<op>", ...)` in the Rust
// source. This catches drift introduced by:
//   • Renamed contract operations
//   • Removed event families
//   • SDK constants that diverge from on-chain emissions
//
// We do NOT enforce the reverse direction (every contract-emitted op must be
// in the SDK SSoT) — new contract emissions are surfaced via SSoT additions
// by adding them to the SSoT in a separate PR, not gated here.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCARCES_CONTRACT_EVENTS,
  SCARCES_EVENT_TYPES,
} from './scarces-events.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVENTS_DIR = resolve(
  HERE,
  '../../../../contracts/scarces-onsocial/src/events'
);

// Maps the Rust constant identifier (1st arg to EventBuilder::new) to the
// emitted `eventType` string. These constants live in the contract source
// (e.g. `pub const SCARCE: &str = "SCARCE_UPDATE"`).
const RUST_TYPE_TO_EVENT_TYPE: Record<string, string> = {
  SCARCE: 'SCARCE_UPDATE',
  COLLECTION: 'COLLECTION_UPDATE',
  LAZY_LISTING: 'LAZY_LISTING_UPDATE',
  OFFER: 'OFFER_UPDATE',
  APP_POOL: 'APP_POOL_UPDATE',
  STORAGE: 'STORAGE_UPDATE',
  CONTRACT: 'CONTRACT_UPDATE',
};

function scanEmissions(): Set<string> {
  const out = new Set<string>();
  if (!existsSync(EVENTS_DIR)) {
    throw new Error(`Scarces events dir not found: ${EVENTS_DIR}`);
  }
  const files = readdirSync(EVENTS_DIR).filter((f) => f.endsWith('.rs'));
  // EventBuilder::new( <FAMILY> , "<op>"
  const re = /EventBuilder::new\(\s*([A-Z_]+)\s*,\s*"([a-z0-9_]+)"/g;
  for (const f of files) {
    const src = readFileSync(join(EVENTS_DIR, f), 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const family = m[1];
      const op = m[2];
      const eventType = RUST_TYPE_TO_EVENT_TYPE[family];
      if (eventType) out.add(`${eventType}::${op}`);
    }
  }
  return out;
}

describe('scarces SDK ↔ contract event parity', () => {
  const emitted = scanEmissions();

  it('contract emits at least one event for each known family', () => {
    // Sanity: the regex is matching SOMETHING per family.
    const families = new Set<string>();
    for (const key of emitted) families.add(key.split('::')[0]);
    for (const family of Object.values(RUST_TYPE_TO_EVENT_TYPE)) {
      expect(families.has(family)).toBe(true);
    }
  });

  for (const [eventType, ops] of Object.entries(SCARCES_CONTRACT_EVENTS)) {
    for (const op of ops) {
      it(`SDK declares ${eventType}::${op} → contract emits it`, () => {
        const key = `${eventType}::${op}`;
        if (!emitted.has(key)) {
          const sample = [...emitted]
            .filter((k) => k.startsWith(eventType + '::'))
            .sort();
          throw new Error(
            `SDK declares ${key} but contract source does not emit it.\n` +
              `Operations actually emitted under ${eventType}:\n  ${sample.join(
                '\n  '
              )}`
          );
        }
        expect(emitted.has(key)).toBe(true);
      });
    }
  }

  // Reverse-parity at the event_type axis (not operation): if the contract
  // emits any operation under an event_type the SDK doesn't declare, fail.
  // We intentionally do NOT enforce reverse parity at the operation axis —
  // adding new operations is allowed without an immediate SDK change.
  it('SDK declares every contract-emitted event_type (reverse parity)', () => {
    const declared = new Set<string>(Object.values(SCARCES_EVENT_TYPES));
    const emittedTypes = new Set<string>();
    for (const key of emitted) emittedTypes.add(key.split('::')[0]);
    const missing = [...emittedTypes].filter((t) => !declared.has(t)).sort();
    if (missing.length > 0) {
      throw new Error(
        `Contract emits event_types not declared in SDK SSoT SCARCES_EVENT_TYPES:\n  ${missing.join('\n  ')}\n\nAdd them to packages/onsocial-sdk/src/query/scarces-events.ts.`
      );
    }
    expect(missing.length).toBe(0);
  });
});
