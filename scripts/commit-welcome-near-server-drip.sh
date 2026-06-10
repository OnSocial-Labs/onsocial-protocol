#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm --filter onsocial-backend test
pnpm --filter @onsocial/portal type-check

git add \
  packages/onsocial-backend/src/services/welcome-near.ts \
  packages/onsocial-backend/src/routes/welcome-near.ts \
  packages/onsocial-portal/src/lib/welcome-near.ts \
  packages/onsocial-portal/src/lib/wallet-timeout.ts \
  packages/onsocial-portal/src/app/api/onboarding/welcome-near/route.ts \
  packages/onsocial-portal/src/hooks/use-profile.ts \
  packages/onsocial-portal/src/components/profile-modal.tsx \
  packages/onsocial-portal/src/components/wallet-button.tsx

git add -u packages/onsocial-portal/src/app/api/onboarding/welcome-near/challenge/route.ts

git commit -m "$(cat <<'EOF'
Remove welcome NEAR wallet signature and drip server-side for connected accounts.

EOF
)"

git push origin main
git log -1 --oneline
