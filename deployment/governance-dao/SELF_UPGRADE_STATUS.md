# DAO self-upgrade status

Protocol Sputnik DAOs only (not rewards/token). Patch: [`patches/upgrade-self-blob.patch`](patches/upgrade-self-blob.patch) on Sputnik `2b0f34a` → versions `2.3.1-onsocial.1` then proof `2.3.1-onsocial.2`.

## Protocol DAO set

| Account | Network | Code | UpgradeSelf proven | FullAccess key |
|---|---|---|---|---|
| `treasury.onsocial.testnet` | testnet | `2.3.1-onsocial.2` | yes | still present |
| `governance.onsocial.testnet` | testnet | `2.3.1-onsocial.2` | yes | still present |
| `treasury.onsocial.near` | mainnet | `2.3.1-onsocial.2` | yes | still present |
| `governance.onsocial.near` | mainnet | `2.3.1-onsocial.2` | yes | still present |

That is the full protocol DAO set. Factory community DAOs are out of scope. Scratch `dao-self-*.onsocial.testnet` were disposable proofs only.

## Mainnet governance proof

| Step | Tx / id |
|---|---|
| FA redeploy `.1` | `CL8oTTnqHhCsQEUnKzvGFZUEkascRwSKf4z1h4t2K98S` |
| store_blob proof | `C7kBTt5BErv9N3AvqaVqpVqWmKHkwQwJHRhRKHHVfKUD` |
| UpgradeSelf proposal | id `2`, add `8XSQLimGSBVqZge71xC1wbAJv4ymre5EYWRfB5qh2BbW` |
| UpgradeSelf vote | `HLUY2VA7m9KQUzabRdUE7mKoTf4ZbT7VhsdCo1XDnYFz` → `2.3.1-onsocial.2` |

## Left (deferred)

- Key deletion on every account
- NEAR reviewer sign-off before any mainnet key deletion
