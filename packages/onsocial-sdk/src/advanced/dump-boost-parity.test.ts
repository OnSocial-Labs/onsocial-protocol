// Emits the boost msg parity fixture consumed by
// `contracts/boost-onsocial/src/sdk_parity_test.rs`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { getBoostMsgParityCases } from './boost-parity.fixtures.js';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(
  here,
  '../../../../contracts/boost-onsocial/tests/fixtures/sdk-parity.json'
);

describe('SDK ↔ boost msg parity fixture export', () => {
  it('writes deterministic JSON for the Rust msg-parser test', () => {
    const cases = getBoostMsgParityCases().map((c) => ({
      name: c.name,
      expected_action: c.expectedAction,
      ...(c.expectedMonths !== undefined
        ? { expected_months: c.expectedMonths }
        : {}),
      msg: c.msg,
    }));

    const payload = {
      schema: 'onsocial.sdk.boost-msg-parity/v1',
      generated_by:
        'packages/onsocial-sdk/src/advanced/dump-boost-parity.test.ts',
      contract: 'boost-onsocial',
      cases,
    };

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  });
});
