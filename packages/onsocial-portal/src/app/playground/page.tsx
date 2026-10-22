import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PlaygroundClient } from './playground-client';

export const metadata: Metadata = {
  title: 'Examples — OnSocial SDK',
  description:
    'SDK example calls you can copy. Run them from your app, on an account you choose.',
};

export default function PlaygroundPage() {
  return (
    <Suspense>
      <PlaygroundClient />
    </Suspense>
  );
}
