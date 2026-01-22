import { GraphClient, NETWORKS } from '../src/index.js';

console.log('Testing GraphClient against deployed subgraph...\n');
console.log('Subgraph URL:', NETWORKS.testnet.graphUrl);

const graph = new GraphClient({ network: 'testnet' });

async function test() {
  try {
    // Test 1: Get recent activity
    console.log('\n1. Getting recent activity...');
    const activity = await graph.getRecentActivity(5);
    console.log(`   Found ${activity.length} recent updates`);
    if (activity.length > 0) {
      console.log('   Latest:', JSON.stringify(activity[0], null, 2));
    }

    // Test 2: Get data for deployer account
    console.log('\n2. Getting data for test-deployer.testnet...');
    const updates = await graph.getDataUpdates('test-deployer.testnet', { first: 5 });
    console.log(`   Found ${updates.length} updates`);

    // Test 3: Get account info
    console.log('\n3. Getting account info...');
    const account = await graph.getAccount('test-deployer.testnet');
    console.log('   Account:', account);

    console.log('\n✅ GraphClient is working with subgraph!');
  } catch (err) {
    console.error('\n❌ Error:', err);
  }
}

test();
