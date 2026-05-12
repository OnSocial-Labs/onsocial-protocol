// ---------------------------------------------------------------------------
// Parity test — SSoT for token (NEP-141) contract events.
//
// Reads `contracts/token-onsocial/src/lib.rs` and asserts the contract still
// emits each NEP-141 helper struct (`FtMint`, `FtBurn`, `FtTransfer`) backing
// every event_type declared in `token-events.ts`.
//
// This guards against:
//   • The contract dropping `near_contract_standards` in favour of a custom
//     emitter that doesn't produce a matching standard log.
//   • SDK constants drifting from the actual emitted standard.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOKEN_EVENT_TYPES,
  TOKEN_RUST_EVENT_HELPERS,
  type TokenEventType,
} from './token-events.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT_SRC = resolve(
  HERE,
  '../../../../contracts/token-onsocial/src/lib.rs'
);

describe('token SDK ↔ contract event parity', () => {
  it('contract source file exists', () => {
    expect(existsSync(CONTRACT_SRC)).toBe(true);
  });

  const src = existsSync(CONTRACT_SRC)
    ? readFileSync(CONTRACT_SRC, 'utf8')
    : '';

  for (const eventType of Object.values(TOKEN_EVENT_TYPES)) {
    const helper = TOKEN_RUST_EVENT_HELPERS[eventType as TokenEventType];
    it(`SDK declares ${eventType} → contract source uses ${helper} or delegates to NEP-141 method`, () => {
      // Either the contract directly emits the standard struct:
      //   FtMint { ... }.emit()  /  FtBurn { ... }.emit()
      // or it delegates the action to the NEP-141 method (which emits via
      // `near_contract_standards` internally), e.g. `fn ft_transfer(...)`.
      const directEmit = new RegExp(
        `\\b${helper}\\s*\\{[\\s\\S]*?\\.emit\\(\\)`
      );
      const delegateImpl = new RegExp(`\\bfn\\s+${eventType}\\s*\\(`);
      if (!directEmit.test(src) && !delegateImpl.test(src)) {
        throw new Error(
          `SDK declares event '${eventType}' but contract source ${CONTRACT_SRC} neither emits ${helper}{...}.emit() nor implements fn ${eventType}(...).`
        );
      }
      expect(directEmit.test(src) || delegateImpl.test(src)).toBe(true);
    });
  }
});
