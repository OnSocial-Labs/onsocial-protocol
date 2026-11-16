import { CreatePageLoadingScreen } from '@/components/create/create-page-loading-screen';
import { DAO_CREATE_TITLE } from '@/features/protocol/dao-create-voice';

export default function CreateDaoLoading() {
  return (
    <CreatePageLoadingScreen
      title={DAO_CREATE_TITLE}
      formClassName="dao-create-form"
      loadingLabel="Loading create DAO…"
    />
  );
}
