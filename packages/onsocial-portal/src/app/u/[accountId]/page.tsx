import ProfilePage from '@/features/profile/profile-page';

export default async function Page({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  return <ProfilePage accountId={accountId} />;
}
