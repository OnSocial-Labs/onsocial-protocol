import EndorsementsPage from '@/features/profile/endorsements-page';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{
    mode?: string;
    topic?: string;
    issuer?: string;
    target?: string;
  }>;
}) {
  const { accountId } = await params;
  const query = await searchParams;

  return (
    <EndorsementsPage
      accountId={accountId}
      mode={query.mode}
      topic={query.topic}
      issuer={query.issuer}
      target={query.target}
    />
  );
}
