/* eslint-disable */
// Cleanup script: finds Active proposals authored by ACCOUNT_ID whose voting
// period has elapsed and calls expire_proposal on each to release the locked
// 0.05 NEAR storage bond per proposal.
//
// Usage:  pnpm tsx tests/integration/_cleanup-stuck-proposals.mts
import { getClient, ACCOUNT_ID } from './helpers.js';

const os = await getClient();

// 1. Collect all proposals created by ACCOUNT_ID.
const created: any[] = [];
let offset = 0;
while (true) {
  const r = await os.query.graphql<{ groupUpdates: any[] }>({
    query: `query Q($a: String!, $o: Int!) {
      groupUpdates(
        where: { operation: { _eq: "proposal_created" }, author: { _eq: $a } }
        orderBy: { blockHeight: DESC }
        limit: 200
        offset: $o
      ) { proposalId groupId blockHeight blockTimestamp }
    }`,
    variables: { a: ACCOUNT_ID, o: offset },
  });
  const rows = r.data?.groupUpdates ?? [];
  created.push(...rows);
  if (rows.length < 200) break;
  offset += 200;
  if (offset > 5000) break;
}

// 2. Identify ones already finalized (any proposal_status_updated event).
const finalized = new Set<string>();
const ids = created.map((r) => r.proposalId);
for (let i = 0; i < ids.length; i += 100) {
  const chunk = ids.slice(i, i + 100);
  const r = await os.query.graphql<{ groupUpdates: any[] }>({
    query: `query Q($ids: [String!]!) {
      groupUpdates(
        where: { operation: { _eq: "proposal_status_updated" }, proposalId: { _in: $ids } }
        limit: 500
      ) { proposalId status }
    }`,
    variables: { ids: chunk },
  });
  for (const row of r.data?.groupUpdates ?? []) finalized.add(row.proposalId);
}
const stuck = created.filter((r) => !finalized.has(r.proposalId));

console.log(`Found ${stuck.length} stuck Active proposals for ${ACCOUNT_ID}`);
if (stuck.length === 0) process.exit(0);

// 3. Expire each one. expire_proposal is permissionless and requires no deposit.
let success = 0;
let failure = 0;
for (const p of stuck) {
  try {
    const res = await os.groups.expireProposal(p.groupId, p.proposalId);
    const txHash = (res as any)?.txHash || (res as any)?.transaction_hash || 'unknown';
    console.log(`  ✓ ${p.groupId}/${p.proposalId} → ${txHash}`);
    success++;
  } catch (err: any) {
    console.error(
      `  ✗ ${p.groupId}/${p.proposalId} → ${err?.message || err}`
    );
    failure++;
  }
}

console.log('');
console.log(`Done. success=${success} failure=${failure}`);
process.exit(failure > 0 ? 1 : 0);
