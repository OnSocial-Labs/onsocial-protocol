// ---------------------------------------------------------------------------
// Parity test — Scarces compose call sites must use SCARCES_VERBS constants,
// never raw string literals.
//
// Catches the regression class where a developer adds a new compose call but
// passes the verb as a string literal, bypassing the SSoT in `verbs.ts`.
// Such a call won't appear in `SCARCES_VERBS`, so the existing
// `verbs.parity.test.ts` (which checks gateway routes ↔ SCARCES_VERBS) can't
// detect it. This test closes that loophole.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCARCES_MODULES_DIR = HERE; // .../src/modules/scarces

const FILES = readdirSync(SCARCES_MODULES_DIR)
  .filter((f) => f.endsWith('.ts'))
  .filter(
    (f) =>
      !f.endsWith('.test.ts') &&
      !f.endsWith('.parity.test.ts') &&
      f !== 'index.ts' &&
      f !== 'verbs.ts'
  )
  .map((f) => join(SCARCES_MODULES_DIR, f))
  .filter((p) => statSync(p).isFile());

// Match: composeAndSign( … <newline> http, <newline> session, <newline> '<verb>'
// or composeFormAndSign( … same shape. The verb literal appears as the 3rd
// positional argument across all current call sites.
const COMPOSE_BLOCK_RE =
  /compose(?:Form)?AndSign(?:<[^>]*>)?\s*\(\s*[^,]+,\s*[^,]+,\s*('[a-z0-9-]+'|"[a-z0-9-]+")\s*,/g;

describe('scarces compose call sites use SCARCES_VERBS constants (no raw strings)', () => {
  for (const file of FILES) {
    const rel = file.slice(file.indexOf('/modules/scarces/') + 1);
    it(`${rel} has no raw-string verb arguments`, () => {
      const src = readFileSync(file, 'utf8');
      const offenders: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = COMPOSE_BLOCK_RE.exec(src)) !== null) {
        offenders.push(m[1]);
      }
      if (offenders.length > 0) {
        throw new Error(
          `${rel} passes raw string verb(s) to composeAndSign / composeFormAndSign:\n  ${offenders.join('\n  ')}\n` +
            `Replace with SCARCES_VERBS.<NAME> from ./verbs.ts.`
        );
      }
      expect(offenders).toEqual([]);
    });
  }
});
