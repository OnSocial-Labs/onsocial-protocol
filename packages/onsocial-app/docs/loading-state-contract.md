# App loading-state contract

The page inventory lives in
[`src/lib/app-loading-matrix.ts`](../src/lib/app-loading-matrix.ts). When
adding or changing page content, update the production layout and its loading
implementation together.

## State contract

| State | Required presentation |
|---|---|
| Cold, no painted data | Structural skeleton |
| Refreshing painted data | Keep rows and show refresh state |
| Loading more | Append skeleton rows |
| Empty | In-flow state card |
| Error with painted rows | Fixed overlay / whisper |
| Error without painted rows | In-flow error state |

Skeletons should share the final page shell and row geometry. Do not add
placeholder `min-height` to intermittent chrome; use a skeleton only when it
represents real cold-load content.

## Page-change checklist

1. Update the real layout.
2. Update the cold skeleton and route `loading.tsx`, if present.
3. Preserve painted rows during refresh and append skeleton rows for pagination.
4. Update the matrix row and implementation references.
5. Add or update the contract test.
6. Add delayed-data Playwright coverage for cold, refresh, append, empty, and
   error states when the page is user-visible and data-backed.
7. Check mobile and desktop list anchors for layout shift.

The contract test validates state mapping, matrix completeness, and referenced
implementation files. It does not replace visual or delayed-network tests.
