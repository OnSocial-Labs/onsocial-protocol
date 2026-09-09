import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CreateDropPanel } from '@/features/scarces/create-drop-panel';

export const metadata: Metadata = {
  title: 'New drop • OnSocial',
  description: 'Create a supply-capped collection drop on OnSocial.',
};

export default function CreateDropPage() {
  return (
    <Suspense fallback={null}>
      <CreateDropPanel />
    </Suspense>
  );
}
