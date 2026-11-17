import { CreatePageLoadingScreen } from '@/components/create/create-page-loading-screen';
import { GUILD_CREATE_TITLE } from '@/features/guilds/guild-create-voice';

export default function CreateGuildLoading() {
  return (
    <CreatePageLoadingScreen
      title={GUILD_CREATE_TITLE}
      formClassName="guild-create-form"
      loadingLabel="Loading create guild…"
    />
  );
}
