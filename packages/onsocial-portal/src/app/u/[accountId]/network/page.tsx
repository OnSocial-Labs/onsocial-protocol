import NetworkPage from '@/features/profile/network-page';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { accountId } = await params;
  const query = await searchParams;

  return (
    <NetworkPage accountId={accountId} filter={query.filter} q={query.q} />
  );
}
