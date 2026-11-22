# App loading-state contract

The primary data-backed page inventory lives in
[`src/lib/app-loading-matrix.ts`](../src/lib/app-loading-matrix.ts). When
adding or changing page content, update the production layout and its loading
implementation together.

## State contract

| State                      | Required presentation                                              |
| -------------------------- | ------------------------------------------------------------------ |
| Cold, no painted data      | Structural skeleton                                                |
| Refreshing painted data    | Keep rows and show refresh state                                   |
| Loading more               | Footer `PulsingDots` / `OsLoadMore` (never mid-list skeleton rows) |
| Empty                      | In-flow state card                                                 |
| Error with painted rows    | Fixed overlay / whisper                                            |
| Error without painted rows | In-flow error state                                                |

Skeletons should share the final page shell and row geometry. Do not add
placeholder `min-height` to intermittent chrome; use a skeleton only when it
represents real cold-load content.

## Route streaming

| Kind | Presentation |
| ---- | ------------ |
| Known SSR (portfolio face, create with server params, seeded home) | Stream the real shell — no route `loading.tsx`, no page Suspense full-shell twin |
| True cold (catalog / collection / thread) | One leaf `loading.tsx` matching the destination |
| Parent + mixed children (`/drops` + `/drops/create`) | No parent full-page `loading.tsx`; index cold in-panel |

Never stack page Suspense with the same full-page shell as `loading.tsx`. Prefer
RSC `searchParams` → props over `useSearchParams` when that would force a
whole-page boundary. Soft-nav cover is `OsRouteSettle` only.

## Page-change checklist

1. Update the real layout.
2. Update the cold skeleton and route `loading.tsx` only when the page is
   true-cold; omit route loading for known SSR pages.
3. Preserve painted rows during refresh and use footer `PulsingDots` / `OsLoadMore` for pagination (never mid-list skeleton rows).
4. Update the matrix row and implementation references.
5. Add or update the contract test.
6. Add delayed-data Playwright coverage for cold, refresh, append, empty, and
   error states when the page is user-visible and data-backed.
7. Check mobile and desktop list anchors for layout shift.

The contract test validates state mapping, matrix completeness, and referenced
implementation files. It does not replace visual or delayed-network tests.
