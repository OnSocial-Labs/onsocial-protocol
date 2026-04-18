// Emits the scarces parity fixture consumed by
// `contracts/scarces-onsocial/src/tests/unit/sdk_parity_test.rs`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { getScarcesParityCases } from './scarces-parity.fixtures.js';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(
  here,
  '../../../../contracts/scarces-onsocial/tests/fixtures/sdk-parity.json',
);

describe('SDK ↔ scarces parity fixture export', () => {
  it('writes deterministic JSON for the Rust round-trip test', () => {
    const cases = getScarcesParityCases('testnet').map((c) => ({
      name: c.name,
      expected_action_type: c.expectedAction.type,
      request: {
        target_account: c.targetAccount,
        action: c.expectedAction,
      },
    }));

    const payload = {
      schema: 'onsocial.sdk.parity/v1',
      generated_by:
        'packages/onsocial-sdk/src/advanced/dump-scarces-parity.test.ts',
      network: 'testnet',
      contract: 'scarces-onsocial',
      cases,
    };

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  });
});
