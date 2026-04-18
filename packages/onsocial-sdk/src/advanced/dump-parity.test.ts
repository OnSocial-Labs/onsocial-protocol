// Emits a stable JSON fixture consumed by the Rust round-trip test in
// `contracts/core-onsocial`. Running the SDK test suite keeps the fixture in
// sync — the Rust test (`tests/sdk_parity_test.rs`) deserializes every entry
// into `protocol::Request` and asserts the action variant matches.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { getCoreParityCases } from './core-parity.fixtures.js';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(
  here,
  '../../../../contracts/core-onsocial/tests/fixtures/sdk-parity.json',
);

describe('SDK ↔ contract parity fixture export', () => {
  it('writes deterministic JSON for the Rust round-trip test', () => {
    const cases = getCoreParityCases('testnet').map((c) => ({
      name: c.name,
      expected_action_type: c.expectedAction.type,
      request: {
        target_account: c.targetAccount,
        action: c.expectedAction,
      },
    }));

    const payload = {
      schema: 'onsocial.sdk.parity/v1',
      generated_by: 'packages/onsocial-sdk/src/advanced/dump-parity.test.ts',
      network: 'testnet',
      cases,
    };

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  });
});
