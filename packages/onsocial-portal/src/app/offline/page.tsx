import Link from 'next/link';

export default function OfflinePage() {
  return (
    <section className="flex min-h-[100svh] items-center justify-center px-6 py-24">
      <div className="w-full max-w-xl rounded-[2rem] border border-border/45 bg-background/80 p-8 text-center shadow-[0_28px_90px_-42px_rgba(15,23,42,0.55)] backdrop-blur-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Offline
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          OnSocial Portal is temporarily offline.
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">
          The app shell is installed, but this page needs a network connection
          to load fresh protocol data. Reconnect and try again.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border/45 bg-background/70 px-5 text-sm font-medium text-foreground transition-colors hover:border-border/70 hover:bg-background/84"
          >
            Return Home
          </Link>
        </div>
      </div>
    </section>
  );
}
