'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/layout/page-shell';
import { SurfacePanel } from '@/components/ui/surface-panel';

export default function TokenRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/transparency');
  }, [router]);

  return (
    <PageShell>
      <SurfacePanel radius="xl" tone="soft" className="py-10 text-center">
        <p className="text-lg font-semibold tracking-[-0.02em] text-foreground">
          Token details moved to transparency
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Redirecting now. If nothing happens, open{' '}
          <Link
            href="/transparency"
            className="text-foreground underline underline-offset-4"
          >
            Transparency
          </Link>
          .
        </p>
      </SurfacePanel>
    </PageShell>
  );
}
