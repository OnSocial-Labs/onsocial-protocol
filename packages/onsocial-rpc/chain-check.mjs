import assert from 'node:assert/strict';
import {
  createNearRpc,
  resolveConfiguredNearRpcProviders,
} from './dist/index.js';

function hosts(endpoints) {
  return endpoints.map((endpoint) => {
    const url = new URL(endpoint.url);
    return url.port && url.port !== '80' && url.port !== '443'
      ? `${url.hostname}:${url.port}`
      : url.hostname;
  });
}

const nodeChain = resolveConfiguredNearRpcProviders('testnet', {
  primaryUrl: 'http://172.18.0.1:3030',
  lavaApiKey: 'lava-test',
  fastnearApiKey: 'fn-test',
});
assert.deepEqual(hosts(nodeChain), [
  '172.18.0.1:3030',
  'rpc.testnet.fastnear.com',
  'g.w.lavanet.xyz',
  'test.rpc.fastnear.com',
  'rpc.testnet.near.org',
]);
assert.equal(nodeChain[1].authorization, 'Bearer fn-test');
assert.equal(nodeChain[0].authorization, undefined);
assert.equal(nodeChain[2].authorization, undefined);
assert.ok(nodeChain[2].url.endsWith('/lava-test'));

const keyedFirst = resolveConfiguredNearRpcProviders('testnet', {
  lavaApiKey: 'lava-test',
  fastnearApiKey: 'fn-test',
});
assert.deepEqual(hosts(keyedFirst), [
  'rpc.testnet.fastnear.com',
  'g.w.lavanet.xyz',
  'test.rpc.fastnear.com',
  'rpc.testnet.near.org',
]);
assert.equal(keyedFirst[0].authorization, 'Bearer fn-test');

const browser = resolveConfiguredNearRpcProviders('testnet', {
  publicOnly: true,
  primaryUrl: 'http://172.18.0.1:3030',
  lavaApiKey: 'lava-test',
  fastnearApiKey: 'fn-test',
});
assert.deepEqual(hosts(browser), [
  'test.rpc.fastnear.com',
  'rpc.testnet.near.org',
]);
assert.ok(browser.every((endpoint) => endpoint.authorization == null));

const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  calls.push({
    url: String(url),
    auth: init?.headers?.Authorization,
  });
  if (String(url).includes('172.18.0.1')) {
    throw new Error('node down');
  }
  if (String(url).includes('rpc.testnet.fastnear.com')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: '2.0',
        id: 'onsocial',
        result: { ok: true },
      }),
    };
  }
  throw new Error('unexpected provider');
};

const rpc = createNearRpc({
  network: 'testnet',
  primaryUrl: nodeChain[0].url,
  endpoints: nodeChain,
  maxRetries: 0,
  circuitBreakerThreshold: 5,
  baseDelayMs: 0,
});

try {
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await rpc.call('status', null);
    assert.equal(result.result.ok, true);
    assert.equal(rpc.getActiveUrl(), 'http://172.18.0.1:3030');
  }
  await rpc.call('status', null);
  assert.equal(rpc.getActiveUrl(), 'https://rpc.testnet.fastnear.com');
  const before = calls.length;
  await rpc.call('status', null);
  assert.equal(calls.length, before + 1);
  assert.match(calls.at(-1).url, /rpc\.testnet\.fastnear\.com/);
  assert.equal(calls.at(-1).auth, 'Bearer fn-test');
  assert.ok(calls.every((call) => !call.url.includes('lavanet')));
} finally {
  globalThis.fetch = originalFetch;
}

console.log('chain-check ok');
