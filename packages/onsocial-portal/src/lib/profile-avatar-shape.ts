import {
  profileAvatarShapeForFace,
  type ProfileAvatarShape,
  type ProfileKind,
} from '@onsocial/sdk';

const DAO_ACCOUNT_SUFFIXES = [
  '.sputnik-dao.near',
  '.sputnikv2.near',
  '.sputnik-dao.testnet',
  '.sputnikv2.testnet',
] as const;

export function isHeuristicDaoAccountId(
  accountId: string | null | undefined
): boolean {
  const id = accountId?.trim().toLowerCase() ?? '';
  if (!id) return false;
  return DAO_ACCOUNT_SUFFIXES.some((suffix) => id.endsWith(suffix));
}

/** Person circle, org squircle, DAO square — explicit kind wins. */
export function portalAccountAvatarShape(
  accountId: string,
  kind?: ProfileKind | null
): ProfileAvatarShape {
  return profileAvatarShapeForFace(kind, isHeuristicDaoAccountId(accountId));
}

export function portalAvatarRadiusClass(shape: ProfileAvatarShape): string {
  if (shape === 'squircle') return 'rounded-[28%]';
  if (shape === 'square') return 'rounded-[18%]';
  return 'rounded-full';
}
