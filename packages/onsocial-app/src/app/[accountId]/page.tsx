import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { normalizeAccountRoute } from '@/lib/account-route';
import { fetchPublicPageData, getActiveNearNetwork } from '@/lib/page-data';

type AccountPageProps = {
  params: Promise<{
    accountId: string;
  }>;
};

function fallbackLabel(accountId: string): string {
  return accountId.replace(/\.testnet$|\.near$/, '');
}

function displayName(accountId: string, profileName?: string): string {
  const name = profileName?.trim();
  return name || fallbackLabel(accountId);
}

function initials(label: string): string {
  return label
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function normalizeLink(url: string): string | null {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmedUrl)
    ? trimmedUrl
    : `https://${trimmedUrl}`;

  try {
    const parsedUrl = new URL(candidate);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: AccountPageProps): Promise<Metadata> {
  const { accountId: routeSegment } = await params;
  const accountId = normalizeAccountRoute(routeSegment);

  if (!accountId) {
    return { title: 'OnSocial' };
  }

  const data = await fetchPublicPageData(accountId);
  const titleLabel = displayName(accountId, data?.profile.name);
  const description =
    data?.config.tagline?.trim() ||
    data?.profile.bio?.trim() ||
    `Public page for ${accountId}.`;

  return {
    title: `${titleLabel} • OnSocial`,
    description,
    openGraph: {
      title: `${titleLabel} • OnSocial`,
      description,
      siteName: 'OnSocial',
      type: 'profile',
    },
  };
}

export default async function AccountPage({ params }: AccountPageProps) {
  const { accountId: routeSegment } = await params;
  const accountId = normalizeAccountRoute(routeSegment);

  if (!accountId) {
    notFound();
  }

  const data = await fetchPublicPageData(accountId);

  if (!data) {
    notFound();
  }

  const titleLabel = displayName(accountId, data.profile.name);
  const tagline = data.config.tagline?.trim() || data.profile.bio?.trim();
  const avatarUrl = normalizeLink(data.profile.avatar ?? '');
  const isActivated = data.activated ?? false;
  const nearNetwork = getActiveNearNetwork();

  return (
    <main className="gate">
      <section className="profile-card animate-rise-in">
        {avatarUrl ? (
          <img
            alt={titleLabel}
            className="profile-avatar"
            height={96}
            src={avatarUrl}
            width={96}
          />
        ) : (
          <div className="profile-avatar profile-avatar-fallback">
            {initials(titleLabel)}
          </div>
        )}

        <h1 className="profile-name">{titleLabel}</h1>
        <p className="profile-handle">@{accountId}</p>

        {tagline ? <p className="profile-tagline">{tagline}</p> : null}

        <div className="profile-status">
          <span className="profile-dot" data-active={isActivated} />
          <span>{isActivated ? 'Active' : 'Dormant'}</span>
          <span className="profile-sep" />
          <span>{nearNetwork}</span>
        </div>
      </section>
    </main>
  );
}
