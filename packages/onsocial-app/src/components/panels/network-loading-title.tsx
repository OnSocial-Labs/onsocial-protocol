'use client';

import { usePathname } from 'next/navigation';
import { UserIcon } from '@onsocial/ui';
import { getStandingOpeningFace } from '@/components/panels/network-standing-handoff';
import { accountIdFromPath } from '@/lib/overlay-routes';

/** Full-stage center face. The loading shell uses the same size so it does not jump. */
const LOADING_CENTER_SIZE = 84;

export function networkMapTitle(displayName: string, isSelf: boolean): string {
  if (isSelf) return 'Your network';
  return `${displayName}'s network`;
}

/** The name standing already showed, so the map does not open as "Network". */
export function NetworkLoadingTitle() {
  const pathname = usePathname() ?? '';
  const accountId = accountIdFromPath(pathname);
  const face = accountId ? getStandingOpeningFace(accountId) : null;
  const name = face?.displayName.trim() ?? '';

  if (!name) {
    return (
      <h1 className="os-app-screen-title">
        <span className="sr-only">Network</span>
        <span
          className="standing-row-shimmer standing-row-shimmer-line network-loading-title"
          aria-hidden
        />
      </h1>
    );
  }

  return (
    <h1 className="os-app-screen-title">
      {networkMapTitle(name, face?.subjectIsViewer === true)}
    </h1>
  );
}

/** The account already on screen, held in the map center until nodes grow in. */
export function NetworkLoadingCenter() {
  const pathname = usePathname() ?? '';
  const accountId = accountIdFromPath(pathname);
  const face = accountId ? getStandingOpeningFace(accountId) : null;
  if (!face) return null;

  const size = LOADING_CENTER_SIZE;
  return (
    <div
      className="network-orbit-center"
      style={{
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
      }}
      aria-hidden="true"
    >
      <span className="network-orbit-center-avatar">
        {face.avatarUrl ? (
          <img
            src={face.avatarUrl}
            alt=""
            width={size}
            height={size}
            draggable={false}
          />
        ) : (
          <span
            className="network-orbit-center-fallback-icon"
            style={{ width: size * 0.38, height: size * 0.38 }}
            aria-hidden
          >
            <UserIcon className="network-orbit-center-fallback-glyph" />
          </span>
        )}
      </span>
    </div>
  );
}
