import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appCiPlaywrightPathsChanged,
  prePushGateChanged,
  shouldRunAppPlaywright,
} from './pre-push-check.mjs';

describe('appCiPlaywrightPathsChanged', () => {
  it('matches OnSocial App CI path filters', () => {
    assert.equal(
      appCiPlaywrightPathsChanged([
        'packages/onsocial-app/src/app/globals.css',
      ]),
      true
    );
    assert.equal(
      appCiPlaywrightPathsChanged(['packages/onsocial-ui/src/cn.ts']),
      true
    );
    assert.equal(
      appCiPlaywrightPathsChanged(['packages/onsocial-sdk/src/index.ts']),
      true
    );
    assert.equal(
      appCiPlaywrightPathsChanged(['packages/onsocial-text-card/src/index.ts']),
      true
    );
    assert.equal(
      appCiPlaywrightPathsChanged(['packages/onsocial-rpc/src/index.ts']),
      true
    );
    assert.equal(appCiPlaywrightPathsChanged(['pnpm-lock.yaml']), true);
    assert.equal(
      appCiPlaywrightPathsChanged(['.github/workflows/onsocial-app-ci.yml']),
      true
    );
    assert.equal(
      appCiPlaywrightPathsChanged(['Resources/mainnet-golive.md']),
      false
    );
    assert.equal(
      appCiPlaywrightPathsChanged(['scripts/pre-push-check.mjs']),
      false
    );
  });
});

describe('prePushGateChanged', () => {
  it('only watches the gate script and its tests', () => {
    assert.equal(prePushGateChanged(['scripts/pre-push-check.mjs']), true);
    assert.equal(
      prePushGateChanged(['scripts/pre-push-check.test.mjs']),
      true
    );
    assert.equal(prePushGateChanged(['scripts/check-deps.js']), false);
  });
});

describe('shouldRunAppPlaywright', () => {
  it('stays off for laptop husky', () => {
    assert.equal(shouldRunAppPlaywright({}), false);
    assert.equal(shouldRunAppPlaywright({ HUSKY: '1' }), false);
  });

  it('runs on cloud agents and PRE_PUSH_E2E=1', () => {
    assert.equal(shouldRunAppPlaywright({ CURSOR_AGENT: '1' }), true);
    assert.equal(shouldRunAppPlaywright({ PRE_PUSH_E2E: '1' }), true);
  });

  it('lets PRE_PUSH_E2E=0 skip even in cloud', () => {
    assert.equal(
      shouldRunAppPlaywright({ CURSOR_AGENT: '1', PRE_PUSH_E2E: '0' }),
      false
    );
  });
});
