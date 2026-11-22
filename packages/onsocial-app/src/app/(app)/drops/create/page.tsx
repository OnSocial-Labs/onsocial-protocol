import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CreateDropPanel } from '@/features/scarces/create-drop-panel';

export const metadata: Metadata = {
  title: 'New drop • OnSocial',
  description: 'Create a supply-capped collection drop on OnSocial.',
};

export default function CreateDropPage() {
  // loading.tsx is the shell. A second fallback here is another
  // .drop-create-form that stays in the streamed document beside the form.
  // The boundary stays so useSearchParams does not bail the page.
  return (
    <Suspense fallback={null}>
      <CreateDropPanel />
    </Suspense>
  );
}
