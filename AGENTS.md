# Agent guide

`.cursor/rules/` is the source of truth. This file only points there. Do not add product rules here.

**Always on** (`alwaysApply: true`): `cloud-quality-gates.mdc`, `implement-clean.mdc`, `mainnet-golive.mdc`, `pre-push-checks.mdc`, `wsl-shell.mdc`.

**Scoped** (globs, not always on): `app-button-toast-contract.mdc`, `app-chrome-spacing.mdc`, `app-empty-copy.mdc` (globs only), `app-gesture-opens-surface.mdc`, `app-indexer-first-paint.mdc`, `app-loading-contract.mdc`, `app-mage-icons.mdc`, `app-portfolio-face.mdc`, `app-ux-contract.mdc`, `hug-drawer-actions.mdc`, `portal-transaction-toast.mdc`.
