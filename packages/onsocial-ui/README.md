# @onsocial/ui

Shared OnSocial UI primitives and CSS used by Portal and App (sheets, surfaces, profile chrome, pulsing dots, launchers, …).

## Usage

```typescript
import { cn /* … */ } from '@onsocial/ui';
```

CSS side-effects (import as needed):

```typescript
import '@onsocial/ui/protocol.css';
import '@onsocial/ui/glass-sheet.css';
import '@onsocial/ui/pulsing-dots.css';
```

See `package.json` `exports` for the full CSS map.

## Scripts

```bash
pnpm --filter @onsocial/ui build
pnpm --filter @onsocial/ui check
```
