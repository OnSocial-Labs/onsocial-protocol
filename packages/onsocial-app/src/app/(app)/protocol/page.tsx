import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { resolveProtocolEntryRedirect } from '@/features/protocol/protocol-entry-redirect';

export const metadata: Metadata = {
  title: 'Protocol • OnSocial',
  description:
    'OnSocial governance and treasury — open the Governance portfolio.',
};

type ProtocolPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(
  value: string | string[] | undefined
): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function ProtocolPage({
  searchParams,
}: ProtocolPageProps) {
  const resolved = (await searchParams) ?? {};
  const href = resolveProtocolEntryRedirect({
    get(name) {
      return firstParam(resolved[name]);
    },
  });
  redirect(href);
}
