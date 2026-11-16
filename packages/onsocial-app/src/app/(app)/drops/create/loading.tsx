import { CreatePageLoadingScreen } from '@/components/create/create-page-loading-screen';
import { dropCreateScreenTitle } from '@/features/scarces/drop-create-layout';

export default function CreateDropLoading() {
  return (
    <CreatePageLoadingScreen
      title={dropCreateScreenTitle(false)}
      formClassName="drop-create-form"
      loadingLabel="Loading new drop…"
    />
  );
}
