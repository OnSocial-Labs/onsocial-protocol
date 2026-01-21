// scripts/test-lighthouse.ts
// Quick test script for Lighthouse storage
// Run with: pnpm exec tsx scripts/test-lighthouse.ts

// tsx auto-loads .env, no dotenv needed
const LIGHTHOUSE_API_KEY = process.env.LIGHTHOUSE_API_KEY;

if (!LIGHTHOUSE_API_KEY) {
  console.error('❌ LIGHTHOUSE_API_KEY not found in .env');
  process.exit(1);
}

async function testLighthouse() {
  console.log('🔦 Testing Lighthouse Storage...\n');

  // 1. Test balance/usage
  console.log('1️⃣ Checking account balance...');
  const balanceRes = await fetch(
    'https://api.lighthouse.storage/api/user/user_data_usage',
    {
      headers: { Authorization: `Bearer ${LIGHTHOUSE_API_KEY}` },
    }
  );

  if (!balanceRes.ok) {
    console.error('❌ Failed to get balance:', balanceRes.status);
    process.exit(1);
  }

  const balance = (await balanceRes.json()) as { dataLimit: number; dataUsed: number };
  console.log(`   ✅ Data Limit: ${(balance.dataLimit / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`   ✅ Data Used:  ${(balance.dataUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   ✅ Remaining:  ${((balance.dataLimit - balance.dataUsed) / 1024 / 1024 / 1024).toFixed(2)} GB\n`);

  // 2. Test upload
  console.log('2️⃣ Uploading test file...');
  const testContent = JSON.stringify({
    test: true,
    timestamp: new Date().toISOString(),
    message: 'Hello from OnSocial!',
  });

  const formData = new FormData();
  formData.set('file', new Blob([testContent], { type: 'application/json' }), 'test.json');

  const uploadRes = await fetch(
    'https://node.lighthouse.storage/api/v0/add?cid-version=1',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${LIGHTHOUSE_API_KEY}` },
      body: formData,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    console.error('❌ Upload failed:', err);
    console.log('   (This might be a network/firewall issue - try from CI or a different network)\n');
  } else {
    const upload = (await uploadRes.json()) as { Name: string; Hash: string; Size: string };
    console.log(`   ✅ Uploaded: ${upload.Name}`);
    console.log(`   ✅ CID: ${upload.Hash}`);
    console.log(`   ✅ Size: ${upload.Size} bytes`);
    console.log(`   ✅ Gateway URL: https://gateway.lighthouse.storage/ipfs/${upload.Hash}\n`);

    // 3. Test download
    console.log('3️⃣ Downloading via gateway...');
    const downloadRes = await fetch(`https://gateway.lighthouse.storage/ipfs/${upload.Hash}`);
    if (downloadRes.ok) {
      const downloaded = await downloadRes.text();
      console.log(`   ✅ Downloaded content: ${downloaded}\n`);
    } else {
      console.log('   ⚠️ Download failed (content may still be propagating)\n');
    }
  }

  console.log('✨ Lighthouse test complete!');
}

testLighthouse().catch(console.error);
