# @onsocial/text-card

Pure SVG text-card generator + theme catalog. Gateway uses it for canonical renders; clients use it for live preview.

## Quick start

```bash
pnpm --filter @onsocial/text-card build
pnpm --filter @onsocial/text-card preview   # local preview script
pnpm --filter @onsocial/text-card test
pnpm --filter @onsocial/text-card check
```

```typescript
import { /* generator + themes */ } from '@onsocial/text-card';
```

No runtime dependencies. See `src/` for themes and generator API.
