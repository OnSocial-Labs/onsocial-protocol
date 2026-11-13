## 1. best-in-class call

The second AddKey is inherent to the 749 design, and that design cannot succeed on chain.

A NEAR function-call key has one receiver. App access is a key for `core.onsocial.testnet` and `execute`. A sponsored boost signed a delegate whose inner receiver is `token.onsocial.testnet` and whose method is `ft_transfer_call`, with a deposit of 1 yocto. `greenghost.onsocial.testnet` added that token key in `7ZvhgZWg9nDo6Ni7GvReeYWaA9ZRNAhNgocTBP7XxucB` at 20:33:19 UTC, then the relayer submitted four delegates (`7jTpSajp…`, `DiFfQfhG…`, `9LVr4343…`, `eKnR9uQ3Gy8bS3B1pCTY8q2GeVnSSpnF8tPsFFtmt3G`). Each `EXPERIMENTAL_tx_status` is `Failure` / `ActionError` / `DelegateActionAccessKeyError::DepositWithFunctionCall`. The protocol rejects any action with a deposit signed by a function-call key. `ft_transfer_call` requires 1 yocto. An FC key on the token cannot sign it. The 749 tests signed the delegate in process and never applied that chain rule.

After a `reverted` attempt the sheet set “Could not commit SOCIAL.” and returned. It did not fall through to the wallet transfer. Commit was broken for everyone on testnet: AddKey, then that toast.

This hotfix deletes that path. Commit and Increase send the same wallet `ft_transfer_call` they sent before 749. No token session key is created.

A later gasless design, not built here, has two real options.

The wallet signs the delegate with its full-access key, and the relayer only submits it. `@hot-labs/near-connect` 0.11.4 exposes `NearWalletBase.signDelegateActions`. Injected, sandboxed, and parent-frame wallets forward that call. The feature flag is per manifest, loaded from `https://raw.githubusercontent.com/hot-dao/near-selector/refs/heads/main/repository/manifest.json` (fetched 2026-11-13). These manifests set `signDelegateActions: true`: HOT Wallet (Android, iOS, Chrome, Firefox, Telegram), Meteor (web, Chrome, Android, iOS), Intear, Ledger, NEAR Mobile (Android, iOS), and near-cli. MyNearWallet, OKX, Nightly, Hana, Unity, WalletConnect, and Trezu do not. The in-package `NearWalletsPopup` debug manifest also sets the flag. That is not a production wallet. The Android report fits HOT, Meteor, or NEAR Mobile, which do advertise the method. The sheet today only calls `signAndSendTransaction`.

The other option is a contract method that locks without a 1 yocto deposit. Boost lock today is only `ft_on_transfer` after `ft_transfer_call`. There is no zero-deposit lock. That would be a new contract method. It is not in this change.

A function-call key with several method names still has one receiver. It cannot replace the full-access signature.

## 2. alignment map

Removed from the client:

- `packages/onsocial-app/src/lib/boost-sponsor.ts` and its test. That was the token `AddKey`.
- `os.boost.commitLock`, `relaySignedFunctionCall`, and `BoostSponsorLimitError`.
- The `sponsor` branch in `portfolio-boost-sheet.tsx` `runBoostTransaction`, including the `reverted` return that skipped the wallet.

Commit again matches Collect, Renew, Extend, and Unlock: `wallet.signAndSendTransaction`, then `trackTransaction` with `txToastSuccess.boostCommitted` and `txToastError.commitBoostFailed`.

Kept:

- Relayer allow-list and `validate_delegate_actions` in `packages/onsocial-relayer/src/boost_sponsor.rs`. Nothing in the app posts that delegate now.
- The guard on `Session.signDelegate`: a session without `canAttachDeposit` cannot sign a deposit. The new test is `rejects an ft_transfer_call delegate signed by a function-call key` in `session.test.ts`.

## 3. near idioms

`DelegateActionAccessKeyError::DepositWithFunctionCall` is the runtime rule. A function-call key may sign a 0-deposit call. It may not sign `ft_transfer_call`, because NEP-141 requires 1 yocto. The relayer paying the fee does not change the signer’s key class. A full-access key may sign the deposit. The relayer can still pay the outer transaction if that signature is a delegate and not a broadcast.

## 4. side effects

The relayer validator stays. It is unused by the app after this hotfix. It should stay until a full-access delegate is actually sent: it is the check that the transfer is one `ft_transfer_call` to the boost contract. Removing it now does not fix commit, and it would drop that check for a later gasless path. Do not treat it as live product behavior.

`token.onsocial.testnet` remains on the deployed testnet allow-list. That was not the failure.

People who already approved the token `AddKey` still have that key on the account. This change does not delete it.

`RELAYER_API_KEY` still fails open when empty. This note does not change that.

No layout change.

## 5. shipped

Commit and Increase are wallet transactions again. The app does not create a token session key. A function-call session that tries to sign `ft_transfer_call` with a deposit is rejected in `Session.signDelegate` before a nonce is spent.

`Session.signDelegate` rejects the 1 yocto `ft_transfer_call` and leaves the nonce at 1. SDK session, boost, and session-bridge tests: 51 passed.
