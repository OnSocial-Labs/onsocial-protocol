import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CreatePageLoadingScreen } from '@/components/create/create-page-loading-screen';
import { CreateDropPanel } from '@/features/scarces/create-drop-panel';
import { dropCreateScreenTitle } from '@/features/scarces/drop-create-layout';

export const metadata: Metadata = {
  title: 'New drop • OnSocial',
  description: 'Create a supply-capped collection drop on OnSocial.',
};

export default function CreateDropPage() {
  // Static hard load reveals this boundary after loading.tsx. Null was a
  // blank body until hydration. Same shell as loading.tsx, one screen.
  return (
    <Suspense
      fallback={
        <CreatePageLoadingScreen
          title={dropCreateScreenTitle(false)}
          formClassName="drop-create-form"
          loadingLabel="Loading new drop…"
        />
      }
    >
      <CreateDropPanel />
    </Suspense>
  );
}
