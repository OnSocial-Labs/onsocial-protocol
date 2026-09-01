import type { Metadata } from 'next';
import {
  getGuildBlueprint,
  GUILD_PRODUCT_COPY,
  parseGuildProposalParam,
  parseGuildSheetParam,
} from '@/features/guilds/guilds-data';
import { LiveGuildPanel } from '@/features/guilds/live-guild-panel';
import { loadGuildPageData } from '@/lib/load-guild-page';

type GuildPageProps = {
  params: Promise<{
    groupId: string;
  }>;
  searchParams?: Promise<{
    sheet?: string | string[];
    proposal?: string | string[];
  }>;
};

export async function generateMetadata({
  params,
}: GuildPageProps): Promise<Metadata> {
  const { groupId } = await params;
  const id = decodeURIComponent(groupId);
  const initial = await loadGuildPageData(id);
  if (initial) {
    return {
      title: `${initial.config.name} • ${GUILD_PRODUCT_COPY.title} • OnSocial`,
      ...(initial.config.description
        ? { description: initial.config.description }
        : { description: GUILD_PRODUCT_COPY.subtitle }),
    };
  }
  const guild = getGuildBlueprint(id);
  return {
    title: `${guild.name} • ${GUILD_PRODUCT_COPY.title} • OnSocial`,
    description: guild.summary,
  };
}

export default async function GuildPage({
  params,
  searchParams,
}: GuildPageProps) {
  const { groupId } = await params;
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const sheetRaw = Array.isArray(resolvedSearch?.sheet)
    ? resolvedSearch.sheet[0]
    : resolvedSearch?.sheet;
  const proposalRaw = Array.isArray(resolvedSearch?.proposal)
    ? resolvedSearch.proposal[0]
    : resolvedSearch?.proposal;
  const id = decodeURIComponent(groupId);
  const initial = await loadGuildPageData(id);
  const initialProposalId = parseGuildProposalParam(proposalRaw);
  return (
    <LiveGuildPanel
      groupId={id}
      initial={initial}
      initialSheet={
        parseGuildSheetParam(sheetRaw) ??
        (initialProposalId ? 'proposals' : null)
      }
      initialProposalId={initialProposalId}
    />
  );
}
