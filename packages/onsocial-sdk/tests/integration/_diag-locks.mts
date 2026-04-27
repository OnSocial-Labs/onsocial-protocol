/* eslint-disable */
import { getClient, ACCOUNT_ID } from './helpers.js';

const os = await getClient();

const createdRows: any[] = [];
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
  createdRows.push(...rows);
  if (rows.length < 200) break;
  offset += 200;
  if (offset > 5000) break;
}
console.log('total proposals created by', ACCOUNT_ID, ':', createdRows.length);

const ids = createdRows.map((r) => r.proposalId);
const finalized = new Set<string>();
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
const stuck = createdRows.filter((r) => !finalized.has(r.proposalId));

console.log('finalized:', finalized.size, '/ stuck Active:', stuck.length);
console.log('expected locked NEAR:', (stuck.length * 0.05).toFixed(3));
console.log('actual locked NEAR: 1.100');
console.log('---all stuck---');
for (const s of stuck) {
  console.log(' ', s.proposalId, 'group=', s.groupId, 'block=', s.blockHeight);
}

