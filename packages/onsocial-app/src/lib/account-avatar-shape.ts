import {
  profileAvatarShapeForFace,
  type ProfileAvatarShape,
  type ProfileKind,
} from '@onsocial/sdk';
import { isDaoStandingTarget } from '@/lib/dao-standing-account';

/** Person circle, org squircle, DAO square — explicit kind wins over DAO heuristic. */
export function accountAvatarShape(
  accountId: string,
  kind?: ProfileKind | null,
  isDao?: boolean | null
): ProfileAvatarShape {
  return profileAvatarShapeForFace(
    kind,
    isDaoStandingTarget(accountId, isDao)
  );
}
