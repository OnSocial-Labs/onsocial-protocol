import { StorageClient } from '../src/index.js';

console.log('Testing StorageClient via onsocial-backend...\n');

const storage = new StorageClient();

async function test() {
  try {
    // Test 1: Upload JSON
    console.log('1. Uploading test JSON...');
    const testData = { test: true, timestamp: Date.now(), message: 'Hello from OnSocial SDK!' };
    const uploadResult = await storage.uploadJSON(testData);
    console.log(`   ✅ Uploaded! CID: ${uploadResult.cid}`);
    console.log(`   URL: ${storage.getUrl(uploadResult.cid)}`);

    // Wait for IPFS propagation
    console.log('\n2. Waiting for IPFS propagation...');
    await new Promise(r => setTimeout(r, 2000));
    console.log('   ✅ Done');

    // Test 2: Download it back
    console.log('\n3. Downloading content back...');
    const downloaded = await storage.downloadJSON<typeof testData>(uploadResult.cid);
    console.log(`   ✅ Downloaded:`, downloaded);

    // Test 3: Verify content
    console.log('\n4. Verifying content...');
    if (downloaded.timestamp === testData.timestamp) {
      console.log('   ✅ Content matches!');
    } else {
      throw new Error('Content mismatch');
    }

    console.log('\n✅ StorageClient is working via onsocial-backend!');
  } catch (err) {
    console.error('\n❌ Error:', err);
    process.exit(1);
  }
}

test();
