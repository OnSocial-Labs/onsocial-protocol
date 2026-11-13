## 1. best-in-class call

The second AddKey is inherent to this design. A NEAR function-call key has one `receiverId` and a list of method names for that receiver only. The app session key is created for `core.onsocial.testnet` and method `execute` (`app-social-session.ts`, store `onsocial.app.session.`). The boost sponsor looks up a different key, contract `token`, store `onsocial.app.boost-sponsor.`, and `ensureBoostSponsorSession` calls `bootstrapSession` when that token key is missing. `planToWalletTransactions` puts an `AddKey` on the user account whose `receiverId` is `token.onsocial.testnet` and whose only method is `ft_transfer_call`. The core key cannot sign that delegate. The protocol checks the signing key’s receiver against the delegate’s inner receiver. A “multi-method” key can name several methods on one contract. It cannot name core and the token.

Removing the second prompt means not using a second function-call key.

- Keep the wallet `ft_transfer_call` the sheet already sends. One confirm, the person pays the fee. That is the fallback already in `runBoostTransaction`. It is not gasless.
- Sign the delegate with the wallet’s existing full-access key and let the relayer broadcast it. No new key. The sheet’s wallet surface is `signAndSendTransaction` / `signAndSendTransactions`. Those send. This repo does not have a sign-only delegate on that wallet. Do not assume one.
- Do not route the transfer through `core.execute`. The token would see core as the sender, not the person.

The toast “Could not commit SOCIAL.” is not evidence of a particular chain error. That sentence is `txToastError.commitBoostFailed`. `sponsorBoostLock` returning `reverted` sets it and returns before the wallet transfer, and it drops the `RelayExecutionError` message. `trackTransaction` uses the same sentence when a sent transaction does not confirm. A thrown `Error` from the wallet uses `cause.message` instead, so a raw wallet rejection is a worse fit for this exact text.

Do not pick a chain cause yet. The next change, if one is written, is a log line with a stable code and the relayer or chain message. Not a second-key redesign, and not a guessed allow-list or drip fix.

## 2. alignment map

Second key:

- App access: `packages/onsocial-app/src/lib/app-social-session.ts`. Contract `core`, method `execute`, prefix `onsocial.app.session.`.
- Boost key: `packages/onsocial-app/src/lib/boost-sponsor.ts` `ensureBoostSponsorSession`. Contract `token`, method `ft_transfer_call`, prefix `onsocial.app.boost-sponsor.`. Allowance `1000000000000000000000` (0.001 NEAR).
- Wallet transaction: `packages/onsocial-sdk/src/advanced/bootstrap.ts` `planToWalletTransactions`. Non-core grant is one `AddKey` and no `execute_admin`.
- Sheet: `packages/onsocial-app/src/features/boost/portfolio-boost-sheet.tsx` `handleCommit` passes `sponsor`, then `runBoostTransaction`.

Toast:

- Reverted sponsor: `setTxResult({ type: 'error', msg: input.failureMessage })` and return. Commit’s `failureMessage` is `txToastError.commitBoostFailed`.
- Shared catch, used only when the sponsor attempt throws out or the later wallet call throws: `cause.message`, or `failureMessage` when the throw is not an `Error`.
- Chain wait: `trackTransaction` with the same `failureMessage`.

Sponsored neighbours, not this failure:

- Welcome drip: `fundAppSessionIfNeeded` in `welcome-near.ts`, called before the token `AddKey` only when liquid NEAR is under `WELCOME_NEAR_THRESHOLD_YOCTO` (0.013 NEAR). The copy module says the gift has no line of its own. No account id was available, so the drip was not checked for this person.
- Session sponsor: `app-session-sponsor.ts` and the access sheet. Different key, different toast.
- Rewards relayer: `execute_rewards` is a private shaped call. Boost uses `/relay/delegate` → `/execute_delegate`.

## 3. near idioms

`AccessKeyPermission::FunctionCall` is one receiver plus method names. The delegate inner receiver for a boost lock is `token.onsocial.testnet`. The predecessor of `ft_transfer_call` must be the token holder. A core-scoped key fails that check on chain even if the relayer allow-list would accept the receiver.

The attached deposit is 1 yoctoNEAR. The relayer pays the fee. The 0.001 NEAR allowance on the new key is locked on the account at `AddKey`, on top of the access-key record. Whether the runtime also bills that allowance for prepaid gas was not re-checked against a live receipt. Do not treat it as the cause.

## 4. side effects

Deploy Testnet run [43496811496](https://github.com/OnSocial-Labs/onsocial-protocol/actions/runs/43496811496) is the merge `93589f89`, and it was green. It recreated `relayer-0` and `relayer-1`.

`GET https://testnet.onsocial.id/relay/health` at 2026-11-13 20:35 UTC returned both replicas. Each listed `allowed_contracts` as `core.onsocial.testnet`, `scarces.onsocial.testnet`, `rewards.onsocial.testnet`, `token.onsocial.testnet`. Uptimes were about 1935s and 1947s, which matches the 20:03 UTC recreate. `requests` was 1 on one replica and 3 on the other. Health does not increment that counter. Some execute calls landed after boot. They cannot be tied to this person. Container logs were not reachable from here. SSH to the host was not available.

A missing `token.onsocial.testnet` allow-list is ruled out for this deploy. The chain reason for the toast is not.

`RELAYER_API_KEY` still fails open when empty. This note does not change that.

No code change in this brief. No second-key removal. No guessed patch.

## 5. shipped

Findings only.

The second AddKey is the token function-call key. It is a separate grant from app access because a function-call key has one receiver. That part is confirmed from the code, not from logs.

The toast text is the existing commit failure line. The reverted sponsor path sets it and discards the underlying message. That hiding is confirmed. The reason the relay or the chain rejected the commit is not. The live allow-list includes the token, so that particular guess is out.

Next patch, when one is written: log a stable code plus the relayer or chain message before the sheet replaces it with “Could not commit SOCIAL.” Do not redesign the key until that message exists.
