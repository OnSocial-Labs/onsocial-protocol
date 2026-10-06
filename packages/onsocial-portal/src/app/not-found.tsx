import Link from 'next/link';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { SurfacePanel } from '@/components/ui/surface-panel';

export default function NotFound() {
  return (
    <PageShell className="max-w-2xl">
      <SurfacePanel radius="xl" tone="soft" className="py-12 text-center">
        <p className="portal-eyebrow-wide portal-blue-text">404</p>
        <h1 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-foreground md:text-3xl">
          Page not found
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          The page you are looking for moved or never existed. The protocol
          surfaces are one hop away.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/">Home</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/sdk">SDK docs</Link>
          </Button>
        </div>
      </SurfacePanel>
    </PageShell>
  );
}
