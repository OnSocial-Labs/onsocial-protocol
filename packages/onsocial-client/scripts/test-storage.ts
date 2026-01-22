import { StorageClient } from '../src/index.js';

// Load API key from environment
const apiKey = process.env.LIGHTHOUSE_API_KEY;

if (!apiKey) {
  console.error('❌ LIGHTHOUSE_API_KEY not set in environment');
  console.log('   Set it in .env or export LIGHTHOUSE_API_KEY=xxx');
  process.exit(1);
}

console.log('Testing StorageClient against Lighthouse...\n');

const storage = new StorageClient({ apiKey });

async function test() {
  try {
    // Test 1: Check balance
    console.log('1. Checking storage balance...');
    const balance = await storage.getBalance();
    console.log(`   ✅ Balance: ${balance.used} / ${balance.limit} bytes used`);

    // Test 2: Upload text
    console.log('\n2. Uploading test text...');
    const testData = JSON.stringify({
      test: true,
      timestamp: Date.now(),
      message: 'Hello from OnSocial SDK!',
    });
    const uploadResult = await storage.uploadJSON({ test: true, timestamp: Date.now() });
    console.log(`   ✅ Uploaded! CID: ${uploadResult.cid}`);
    console.log(`   URL: ${storage.getUrl(uploadResult.cid)}`);

    // Test 3: Download it back
    console.log('\n3. Downloading content back...');
    const downloaded = await storage.downloadJSON(uploadResult.cid);
    console.log(`   ✅ Downloaded:`, downloaded);

    // Test 4: Get file info
    console.log('\n4. Getting file info...');
    const info = await storage.getFileInfo(uploadResult.cid);
    console.log(`   ✅ File info:`, info);

    console.log('\n✅ StorageClient is working with Lighthouse!');
  } catch (err) {
    console.error('\n❌ Error:', err);
  }
}

test();
