import type { Metadata } from 'next';
import { CreateDropPanel } from '@/features/scarces/create-drop-panel';
import { DROP_CREATE_SERIES_PARAM, MARKET_APP_PARAM } from '@/lib/app-routes';

export const metadata: Metadata = {
  title: 'New drop • OnSocial',
  description: 'Create a supply-capped collection drop on OnSocial.',
};

type CreateDropPageProps = {
  searchParams?: Promise<{
    [MARKET_APP_PARAM]?: string | string[];
    [DROP_CREATE_SERIES_PARAM]?: string | string[];
    template?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

export default async function CreateDropPage({
  searchParams,
}: CreateDropPageProps) {
  const params = await searchParams;
  return (
    <CreateDropPanel
      app={firstParam(params?.[MARKET_APP_PARAM])}
      series={firstParam(params?.[DROP_CREATE_SERIES_PARAM])}
      template={firstParam(params?.template)}
    />
  );
}
