# OnSocial SDK — Cheatsheet

One-page lookup for "where do I find X?". For full type info, hover any
method in your IDE or see [README](../README.md).

## Setup

```ts
import { OnSocial, Session } from '@onsocial/sdk';

const os = new OnSocial({
  network: 'mainnet',
  jwt: userJwt,
  session: await Session.fromStorage(), // for gasless writes
  // defaultBroadcast: 'gateway' | { kind: 'relayer', url } | { kind: 'wallet', signer }
});
```

Every write below honors `defaultBroadcast`. Override per-call with
`os.withBroadcast(target).<module>.<method>(…)`.

## Profiles

| Want to… | Call |
| --- | --- |
| Update my profile | `os.profiles.update({ name, bio, avatar, banner, … })` |
| Read one profile (materialised) | `os.profiles.get(accountId)` |
| Read many profiles | `os.profiles.getMany([...accountIds])` |
| Resolve avatar to CDN URL | `os.profiles.avatarUrl(profile)` |
| Read raw profile rows (with block metadata) | `os.query.profiles.get(accountId)` |

## Posts, replies, quotes

| Want to… | Call |
| --- | --- |
| Create a post | `os.posts.create({ text, media?, tags? })` |
| Reply to a post | `os.posts.reply(parent, { text })` |
| Quote a post | `os.posts.quote(ref, { text })` |
| Post in a group feed | `os.posts.groupPost(groupId, { text })` |
| Reply in a group | `os.posts.groupReply(groupId, parent, { text })` |
| Quote in a group | `os.posts.groupQuote(groupId, ref, { text })` |
| Read recent posts by author | `os.query.feed.recent({ author })` |
| Read account's home feed | `os.query.feed.fromAccounts({ accountId })` |
| Read a thread | `os.query.threads.get({ author, postId })` |

## Reactions

| Want to… | Call |
| --- | --- |
| React | `os.reactions.add(post, { type: 'like' })` |
| Unreact | `os.reactions.remove(post, 'like')` |
| Toggle | `os.reactions.toggle(post, 'like')` |
| Counts per kind | `os.reactions.summary(post)` |

## Saves (bookmarks)

| Want to… | Call |
| --- | --- |
| Save | `os.saves.add(post)` |
| Unsave | `os.saves.remove(post)` |
| Toggle | `os.saves.toggle(post)` |
| Has-saved? | `os.saves.has(post, { viewer })` |
| List my saves | `os.saves.list({ accountId, limit })` |

## Endorsements

| Want to… | Call |
| --- | --- |
| Endorse | `os.endorsements.add(target, { topic, note })` |
| Unendorse | `os.endorsements.remove(target, { topic })` |
| Toggle | `os.endorsements.toggle(target, { topic })` |
| Read one | `os.endorsements.get(target, { issuer?, topic? })` |
| Counts (indexed) | `os.endorsements.counts(accountId)` |
| List given (paginated) | `os.endorsements.listGiven(accountId, { limit, offset })` |
| List received (paginated) | `os.endorsements.listReceived(accountId, { limit, offset })` |
| Viewer's endorsements to target | `os.endorsements.listFromViewerToTarget(viewer, target)` |
| Filtered list + total (search) | `os.query.endorsements.receivedFilteredPage` / `.givenFilteredPage` |
| Batch: who endorsed viewer | `os.query.endorsements.issuersAmong(viewer, issuerIds)` |

## Attestations

| Want to… | Call |
| --- | --- |
| Attest a claim | `os.attestations.add(claimId, { subject, type, value, signature? })` |
| Revoke | `os.attestations.revoke(subject, type, claimId)` |
| Read one | `os.attestations.get(subject, type, claimId, { issuer })` |

## Standings ("stand with")

| Want to… | Call |
| --- | --- |
| Stand with | `os.standings.add(target)` |
| Remove | `os.standings.remove(target)` |
| Toggle | `os.standings.toggle(target, { viewer })` |
| Has-standing? | `os.standings.has(viewer, target)` |
| Inbound / outbound counts | `os.standings.counts(accountId)` |
| Mutual count (indexed) | `os.standings.mutualCount(accountId)` |
| List incoming (paginated) | `os.standings.listIncomingDetailed(accountId, { limit, offset })` |
| List outgoing (paginated) | `os.standings.listOutgoingDetailed(accountId, { limit, offset })` |
| Mutual list (paginated) | `os.standings.mutualList(accountId, { limit, offset })` |
| Viewer stands with target? | `os.standings.viewerStandsWith(viewer, target)` |
| Filtered list + total (search) | `os.query.standings.incomingFilteredPage` / `.outgoingFilteredPage` |
| Discover page + viewer context | `os.query.profiles.discoverPage({ limit, offset, viewerAccountId })` |

> Scaled graph recipes: [SOCIAL_GRAPH.md](./SOCIAL_GRAPH.md)

## Groups & governance

| Want to… | Call |
| --- | --- |
| Create | `os.groups.create(id, { owner, memberDriven, isPrivate })` |
| Join / leave | `os.groups.join(id)` / `os.groups.leave(id)` |
| Member-driven action (proposal/vote) | `os.groups.execute(id, { type, … })` |
| Is member? | `os.groups.isMember(id, accountId)` |
| Read group feed | `os.query.groups.feed({ groupId })` |
| Read group conversation | `os.query.groups.conversation({ groupId, threadKey })` |

## Pages

| Want to… | Call |
| --- | --- |
| Create a page | `os.pages.create({ slug, title, … })` |
| Add an item | `os.pages.addItem(slug, item)` |
| Remove an item | `os.pages.removeItem(slug, itemId)` |
| Show / hide | `os.pages.setVisibility(slug, true)` |
| Update settings | `os.pages.setConfig(slug, config)` |

## Permissions

| Want to… | Call |
| --- | --- |
| Grant | `os.permissions.grant(grantee, scope, level)` |
| Revoke | `os.permissions.revoke(grantee, scope)` |
| Read level | `os.permissions.get(grantor, grantee, scope)` |
| Group admin? | `os.permissions.hasGroupAdmin(groupId, account)` |

> Admin permission writes (`set_permission`, `set_key_permission`) require a
> `wallet` broadcast target — they hit `execute_admin` which the contract
> gates with FullAccess.

## Scarces (NFTs)

| Want to… | Call |
| --- | --- |
| Mint | `os.scarces.tokens.mint({ title, image, copies?, royalty? })` |
| Transfer / burn | `os.scarces.tokens.transfer(...)` / `.burn(...)` |
| Renew / redeem / revoke | `os.scarces.tokens.renew(...)` / `.redeem(...)` / `.revoke(...)` |
| Create collection (drop) | `os.scarces.collections.create({ collectionId, totalSupply, … })` |
| Mint from collection | `os.scarces.collections.mintFromCollection(...)` |
| Buy from collection | `os.scarces.collections.purchaseFromCollection(...)` |
| List on market | `os.scarces.market.list(tokenRef, priceNear)` |
| Auction | `os.scarces.auctions.list(...)` / `.placeBid(...)` / `.settle(...)` |
| Make / accept offer | `os.scarces.offers.make(...)` / `.accept(...)` |
| Lazy listing (deferred mint) | `os.scarces.lazy.create(...)` / `.purchase(...)` |
| App pool / moderation | `os.scarces.apps.register(...)` / `.fundPool(...)` / `.addModerator(...)` |
| Read scarces feeds | `os.query.scarces.*` |

## Storage

| Want to… | Call |
| --- | --- |
| Read storage balance | `os.storageAccount.balance(accountId?)` |
| Withdraw available | `os.storageAccount.withdraw(amount?)` |
| Tip storage to another account | `os.storageAccount.tip(target, amount)` |
| Sponsor an account | `os.storageAccount.sponsor(target, { maxBytes })` |
| Fund platform / group / shared pool | `os.storageAccount.fundPlatform(...)` / `.fundGroupPool(...)` / `.fundSharedPool(...)` |
| Read platform allowance | `os.storageAccount.platformAllowance(account)` |

## Boost / Rewards / Token

| Want to… | Call |
| --- | --- |
| Buy boost credits | `os.boost.purchase(amount)` |
| Boost a post | `os.boost.boost(post, credits)` |
| Read booster state | `os.boost.state(account)` |
| Claim partner rewards | `os.rewards.claim(...)` |
| Transfer ON token | `os.token.transfer(target, amount)` |
| Token balance | `os.token.balance(account)` |

## Chain reads

| Want to… | Call |
| --- | --- |
| Contract status / version | `os.chain.getContractStatus()` / `.getVersion()` |
| Governance config (limits) | `os.chain.getGovernanceConfig()` |
| Contract info bundle | `os.chain.getContractInfo()` |
| WNEAR account | `os.chain.getWnearAccount()` |

## Indexer (raw rows, GraphQL)

`os.query.*` exposes typed Hasura wrappers. Use these when you need block
metadata, pagination cursors, or fields not surfaced by the high-level
modules.

```ts
const { items, nextCursor } = await os.query.feed.recent({
  author: 'alice.near',
  limit: 20,
});
```

Sub-namespaces: `feed`, `threads`, `profiles` (`search`, `discoverPage`,
`statsForAccounts`), `groups`, `reactions`, `saves`, `endorsements`, `attestations`,
`standings` (paginated + filtered helpers), `scarces`, `boost`, `rewards`,
`token`, `permissions`, `governance`, `storage`, `pages`, `events`.

Drop to raw GraphQL: `os.query.graphql({ query, variables })`.

## Low-level escape hatches

| Want to… | Call |
| --- | --- |
| Write arbitrary KV path | `os.social.set(path, value)` or `os.social.set({ p1: v1, p2: v2 })` |
| Read arbitrary KV path | `os.social.getOne(path, accountId?)` |
| List keys by prefix | `os.social.listKeys({ prefix })` |
| Direct contract call | `os.raw.<contract>.<method>(...)` |
| Pure builder (no relay) | `import { buildPostSetData, … } from '@onsocial/sdk/advanced'` |

## Errors to expect

| Error | When |
| --- | --- |
| `SessionRequiredError` | Write called without session and broadcast ≠ `'wallet'` |
| `NeedsWalletConfirmationError` | Admin path that requires FullAccess key |
| `RelayExecutionError` | Relayed tx reverted on chain |
| `InsufficientStorageBalanceError` | Account lacks storage to write |
| `SignerRequiredError` | Deposit-funded write called without signer |
