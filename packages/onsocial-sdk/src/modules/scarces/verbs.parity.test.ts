// ---------------------------------------------------------------------------
// Parity test — Scarces compose verbs vs gateway routes.
//
// Reads `packages/onsocial-gateway/src/routes/compose/*.ts` and asserts every
// verb in `verbs.ts` (`SCARCES_VERBS`) corresponds to a registered
// `POST /compose/prepare/<verb>` route. Catches the class of bug where the
// SDK calls a verb the gateway does not expose (e.g. the historical
// `purchase-lazy-listing` vs `purchase-lazy-list` mismatch).
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCARCES_VERBS } from './verbs.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPOSE_DIR = resolve(
  HERE,
  '../../../../onsocial-gateway/src/routes/compose'
);

function scanRoutes(): Set<string> {
  const out = new Set<string>();
  if (!existsSync(COMPOSE_DIR)) {
    throw new Error(`Gateway compose dir not found: ${COMPOSE_DIR}`);
  }
  const files = readdirSync(COMPOSE_DIR).filter((f) => f.endsWith('.ts'));
  // Match both `router.post('/prepare/<verb>', …)` and the multipart variant
  // `'/prepare/<verb>'` used as the first arg to upload.fields(...).
  const re = /['"]\/prepare\/([a-z0-9-]+)['"]/g;
  for (const f of files) {
    const src = readFileSync(join(COMPOSE_DIR, f), 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) out.add(m[1]);
  }
  return out;
}

describe('scarces SDK verbs ↔ gateway compose routes parity', () => {
  const routes = scanRoutes();

  it('gateway exposes a non-empty route set', () => {
    expect(routes.size).toBeGreaterThan(0);
  });

  for (const [name, verb] of Object.entries(SCARCES_VERBS)) {
    it(`SCARCES_VERBS.${name} → POST /compose/prepare/${verb}`, () => {
      if (!routes.has(verb)) {
        const candidates = [...routes]
          .filter((r) => r.includes(verb.split('-')[0]))
          .sort();
        throw new Error(
          `SDK declares verb "${verb}" (SCARCES_VERBS.${name}) but gateway has no /compose/prepare/${verb} route.\n` +
            `Candidate gateway routes containing "${verb.split('-')[0]}":\n  ${candidates.join('\n  ')}`
        );
      }
      expect(routes.has(verb)).toBe(true);
    });
  }
});
