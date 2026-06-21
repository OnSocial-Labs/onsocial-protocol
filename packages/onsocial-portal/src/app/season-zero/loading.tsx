import { SeasonPageLoadingShell } from '@/features/season/season-page-loading-shell';

export default function Loading() {
  return (
    <SeasonPageLoadingShell registryPhase="archived" participantHint={2} />
  );
}
