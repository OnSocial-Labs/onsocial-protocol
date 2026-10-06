import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FamilyGuideClient } from '@/app/sdk/[family]/family-guide-client';
import { SDK_METHOD_GUIDES, getSdkMethodGuide } from '@/data/sdk-method-guides';

// Every method family is known at build time; unknown slugs 404 at the router
// with the root not-found page (segment not-found is bypassed for unmatched
// static params).
export const dynamicParams = false;

type FamilyPageProps = {
  params: Promise<{ family: string }>;
};

export function generateStaticParams() {
  return SDK_METHOD_GUIDES.map((guide) => ({ family: guide.slug }));
}

export async function generateMetadata({
  params,
}: FamilyPageProps): Promise<Metadata> {
  const { family } = await params;
  const guide = getSdkMethodGuide(family);
  if (!guide) {
    return { title: 'SDK — OnSocial' };
  }
  return {
    title: `${guide.title} — OnSocial SDK`,
    description: guide.summary,
    openGraph: {
      title: `${guide.title} — OnSocial SDK`,
      description: guide.summary,
      type: 'article',
    },
  };
}

export default async function SdkMethodFamilyPage({ params }: FamilyPageProps) {
  const { family } = await params;
  const guide = getSdkMethodGuide(family);
  if (!guide) notFound();

  return <FamilyGuideClient guide={guide} />;
}
