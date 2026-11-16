import { CreatePageLoadingScreen } from '@/components/create/create-page-loading-screen';

export default function CreateHubLoading() {
  return (
    <CreatePageLoadingScreen
      title="Open a hub"
      formClassName="hub-create-form"
      loadingLabel="Loading open a hub…"
    />
  );
}
