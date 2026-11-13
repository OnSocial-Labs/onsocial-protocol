## 1. best-in-class call

Every boost, commit and increase, is sponsored. There is no one-a-day limit. The relayer still pays the fee for one `ft_transfer_call` on the SOCIAL token, and only when the parsed `receiver_id` is the boost contract.

The abuse guard replaces the old per-account daily gas budget. There was no older quota store in the relayer. Gateway `rate-limiter-flexible` counts HTTP requests, not sponsored gas, so it is the wrong store. The same in-memory counter now tracks two things: how many sponsored boosts an account has taken this clock hour, and how much prepaid gas the whole relayer has accepted this UTC day.

Six per hour is the default (`RELAYER_BOOST_SPONSOR_HOURLY_LIMIT`). A person commits once, increases a few times, and may retry a confirm. Six covers that sitting. A seventh falls through to the wallet. The fleet cap is 1 NEAR per UTC day (`RELAYER_BOOST_SPONSOR_DAILY_SPEND_YOCTO`), priced at `RELAYER_BOOST_SPONSOR_GAS_PRICE_YOCTO` (default `100000000` yoctoNEAR per gas). One lock prepays about 0.008 NEAR at 80 TGas, so 1 NEAR is about 125 sponsored boosts for everyone, and it is a hard stop if many accounts are scripted. The mainnet signer was about 3 NEAR when the runbook was written, so 1 NEAR a day is a real bound until that balance is raised. Both numbers are config, not scattered constants.

When either limit is hit, the sheet does not say so. It uses the wallet confirm it already had. Success stays the amount plus “SOCIAL committed.” A chain-wait failure uses “Could not commit SOCIAL.” A thrown wallet error uses the same catch as Collect and Renew.

The core session key still cannot sign the token call. The first boost adds a token key with `ft_transfer_call` only, after the welcome drip when the account is empty. Later boosts are quiet. Collect, unlock, renew, and extend stay wallet calls.

This follow-up should stay near 500 changed lines against the previous head. The quota rewrite, the allow-list string in each deploy file, and this brief are most of that. `Resources/mainnet-golive.md` is included because its locked allow-list sentence would otherwise contradict the code. Anything past that is the same string in the workflow defaults so the next mainnet deploy does not keep the old rewards-only list.

## 2. alignment map

Surface audit of `portfolio-boost-sheet.tsx`. The sheet is one `GlassSheet` in the support family (`profile-support-sheet-panel`, `profile-support-sheet-body`). Neighbours, unchanged by sponsorship:

- Header: `SheetChromeHeader`, eyebrow Boost, title “Lock SOCIAL” or the locked amount, close “Close boost”, backdrop “Close boost”, `LeaderboardChartAction` (“Open influence leaderboard”).
- Body: collect block (“Ready to collect”, live amount, `/sec`, celebration chip), mode chips Collect / Increase / Renew / Extend (or Unlock / Renew / Extend when the lock is done), period chips, `BoostAmountField` (“Amount in SOCIAL”, Max, available balance), summary rows Influence / Share / Bonus / Unlocks / Collected, `BoostNetworkPulse` (Boosters, Locked, Pool, Rate).
- Footer: `CommerceSheetFooter`. Labels stay Connect, Commit, Increase, Collect, Renew, Extend, Unlock + collect. Pending labels stay Committing…, Collecting…, Renewing…, Extending…, Releasing…. Dots stay on the button. No second toast and no new control.

Toast and copy, the sheet’s own pattern in `runBoostTransaction`:

- Success and chain-wait failure go through `trackTransaction` with `txToastSuccess` / `txToastError` from `transaction-toast-copy.ts`. Commit success is `boostCommitted` (“{amount} SOCIAL committed.”). Commit failure copy is `commitBoostFailed` (“Could not commit SOCIAL.”). Collect, renew, extend, and release keep their existing lines.
- A thrown wallet error uses `cause.message`, or `failureMessage` when the throw is not an Error. That is the same catch for Commit, Increase, Collect, Renew, Extend, and Unlock. A sponsorship limit does not get its own sentence. `txToastSession` is the connect/session sheet (`app-access-sheet.tsx`). The boost sheet does not mount it. The app has no pending toast. The button owns the wait.
- Glossary row for the commit failure line is in `docs/glossary.md`. “Today’s free boost is used up.” is removed.

Sponsored flows already in the repo, and what this uses from each:

- Rewards: `execute_rewards` in `handlers.rs` is a private relayer method with a fixed action shape. Boost sponsorship is the delegate allow-list plus `validate_delegate_actions`, not a second execute endpoint and not a user toast.
- Welcome drip: `execute_transfer` caps a transfer at 0.025 NEAR. `fundAppSessionIfNeeded` in `welcome-near.ts` calls `/api/onboarding/welcome-near` before an empty account adds a key. The copy module says the gift has no line of its own. The boost key grant calls that same helper and does not add a drip toast.
- Session sponsor: `app-session-sponsor.ts` chooses the key allowance. `bootstrapSession` / `restoreSession` add the function-call key. App access toasts live in `txToastSession` and `txToastError.allowAppAccessFailed` on the access sheet. The boost token key is that same grant, scoped to `ft_transfer_call`, and the boost sheet keeps its own success and failure lines.

Relayer shape check and the abuse guard: `packages/onsocial-relayer/src/boost_sponsor.rs`. Config and wiring: `config.rs`, `state.rs`, `handlers.rs`. Comments: `relayer.toml`, `README.md`.

Allow-list strings, testnet and mainnet: `deployment/docker-compose.yml`, `deployment/docker-compose.relayer.yml`, `deployment/.env.production.example`, `deployment/.env.relayer.mainnet.example`, `deployment/deploy-production.sh`, `deployment/deploy-relayer-host.sh`, `scripts/generate-env.sh`, `scripts/sync-production-env.sh`, `.github/workflows/release-mainnet.yml`, `.github/workflows/promote-mainnet.yml`, `.github/workflows/deploy-mainnet-relayers-private.yml`. Runbook sentence: `Resources/mainnet-golive.md`. `scripts/check-mainnet-contracts.mjs` is unchanged. The chain snapshot did not change.

SDK: `packages/onsocial-sdk/src/modules/boost.ts` `commitLock`. The limit error carries the code `BOOST_SPONSOR_LIMIT` only. The toast sentence stays in the app copy module. Gateway still only forwards `POST /relay/delegate`.

App: `packages/onsocial-app/src/lib/boost-sponsor.ts` and the commit branch in `portfolio-boost-sheet.tsx`. A limit, an outage, or a missing key continues into the wallet `signAndSendTransaction` already in `runBoostTransaction`.

## 3. near idioms

The outer transaction is still one `Action::Delegate` paid by the relayer. The inner receipt’s predecessor is the user, so `ft_transfer_call` spends their SOCIAL.

Sponsored shape, all of it or nothing:

- Inner receiver is the SOCIAL token for that network (`token.onsocial.testnet` or `token.onsocial.near`).
- Exactly one inner action.
- Method is `ft_transfer_call`. `ft_transfer` and every other method are rejected.
- Attached deposit is exactly 1 yoctoNEAR.
- Args are parsed as a JSON object. `receiver_id` must be an account id equal to the boost contract.

The hourly count is sponsored boosts, not gas units. The fleet cap charges prepaid gas times the configured gas price. Equal to either limit is allowed. A failed submit releases both. A broadcast that later reverts does not, because the relayer already paid.

The 1 yocto confirmation is still the user’s. The relayer pays the fee. Copy never calls that fee gas.

## 4. side effects

`token.onsocial.near` is on the mainnet allow-list next to `rewards.onsocial.near`. The same receiver, method, and deposit checks apply. `boost.onsocial.near` still has no wasm. A sponsored call aimed at it is accepted by the relayer and fails on chain, and the fleet cap is what bounds that gas. App, portal, and gateway stay on testnet. This does not turn mainnet social on. A running relayer keeps its current env until the next deploy uses the new default.

`ft_transfer_call` is still not a global method. Core, scarces, and rewards cannot call it.

The counters are process-local. Two replicas can each allow 6 boosts an hour and 1 NEAR a day. There is no Redis client in the relayer crate.

`RELAYER_API_KEY` still fails open when unset (`packages/onsocial-relayer/src/middleware.rs`). This patch does not touch that middleware.

Collect, unlock, renew, and extend are unchanged. A limit, a relayer outage, or no token key falls through to the wallet with no extra sentence. Cancelling the one-time key prompt stops the tap. The mock signer records the wallet `ft_transfer_call`.

No sheet layout change. Phone targets in the brief are iPhone, Samsung, and Pixel, across Chrome, Safari, and Brave. Playwright covers the commit on a 390×844 phone. The other widths and browsers share that DOM and were not run as separate binaries.

## 5. shipped

Commit and Increase sponsor when the account is under 6 sponsored boosts this hour and the relayer is under 1 NEAR of prepaid boost gas this UTC day. Otherwise the same button asks the wallet to confirm, with no extra sentence. Chain-wait failure stays “Could not commit SOCIAL.” The line “Today’s free boost is used up.” is gone. The limit does not fork the sheet’s error catch.

The refusal code is `BOOST_SPONSOR_LIMIT`. The old per-account 0.01 NEAR daily budget and `BOOST_SPONSOR_DAILY_CAP` are gone.

This follow-up is 27 files, +303/−206, against the previous head, inside the 500-line band above. `cargo test -p onsocial-relayer --lib` is 55 passed. `cargo clippy -p onsocial-relayer --all-targets -- -D warnings` is clean. SDK boost tests 10 passed, gateway relay tests 10 passed, app sponsor tests 5 passed.
