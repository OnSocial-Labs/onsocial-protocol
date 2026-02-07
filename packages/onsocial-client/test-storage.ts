// Quick test script for StorageClient with local backend
// Run: npx tsx test-storage.ts

import { StorageClient } from './src/storage';

// Use production backend or local
const endpoint = process.env.LOCAL 
  ? 'http://localhost:4000/storage'
  : 'https://api.onsocial.id/storage';

const storage = new StorageClient({ endpoint });

async function test() {
  console.log(`Testing StorageClient with ${endpoint}...\n`);

  // Test 1: Upload JSON
  console.log('1. Upload JSON:');
  try {
    const json = { test: true, timestamp: Date.now() };
    const result = await storage.uploadJSON(json);
    console.log('   ✅ CID:', result.cid);
    console.log('   URL:', storage.getUrl(result.cid));
  } catch (e) {
    console.log('   ❌ Error:', (e as Error).message);
  }

  // Test 2: Upload text as blob
  console.log('\n2. Upload text blob:');
  try {
    const blob = new Blob(['Hello from OnSocial!'], { type: 'text/plain' });
    const result = await storage.upload(blob);
    console.log('   ✅ CID:', result.cid);
    console.log('   URL:', storage.getUrl(result.cid));
  } catch (e) {
    console.log('   ❌ Error:', (e as Error).message);
  }

  // Test 3: Get URL helper
  console.log('\n3. URL helper:');
  const testCid = 'bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4';
  console.log('   getUrl:', storage.getUrl(testCid));

  console.log('\n✅ All tests complete!');
}

test().catch(console.error);
