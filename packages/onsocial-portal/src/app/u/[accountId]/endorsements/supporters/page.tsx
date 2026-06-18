import EndorsementSupportersPage from '@/features/profile/endorsement-supporters-page';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{
    endorsementId?: string;
    issuer?: string;
    target?: string;
    topic?: string;
    q?: string;
  }>;
}) {
  const { accountId } = await params;
  const query = await searchParams;

  return (
    <EndorsementSupportersPage
      accountId={accountId}
      endorsementId={query.endorsementId}
      issuer={query.issuer}
      target={query.target}
      topic={query.topic}
      q={query.q}
    />
  );
}
