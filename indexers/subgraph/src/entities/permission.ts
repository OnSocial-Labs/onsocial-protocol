/**
 * Permission Entity Helpers
 */

import { BigInt } from "@graphprotocol/graph-ts";
import { Permission, PermissionUpdate } from "../../generated/schema";

/**
 * Update Permission aggregate entity based on PermissionUpdate event
 * Handles grant, revoke, grant_key, revoke_key, set_permission operations
 */
export function updatePermissionAggregate(
  event: PermissionUpdate,
  granter: string,
  timestamp: u64
): void {
  const operation = event.operation;
  const grantee = event.grantee;
  const publicKey = event.publicKey;
  let path = "";
  const eventPath = event.path;
  if (eventPath) {
    path = eventPath;
  }

  // Build permission ID
  let permId = "";
  if (publicKey) {
    permId = granter + "-key-" + publicKey + "-" + path;
  } else if (grantee) {
    permId = granter + "-" + grantee + "-" + path;
  }

  if (permId == "") {
    return;
  }

  // Handle grant operations
  if (operation == "grant" || operation == "grant_key" || operation == "set_permission") {
    let perm = Permission.load(permId);
    if (!perm) {
      perm = new Permission(permId);
      perm.granter = granter;
      perm.grantee = grantee;
      perm.publicKey = publicKey;
      perm.path = path;
      perm.grantedAt = BigInt.fromU64(timestamp);
    }

    perm.level = event.level;
    perm.groupId = event.groupId;
    perm.permissionNonce = event.permissionNonce;
    perm.expiresAt = event.expiresAt;
    perm.isExpired = false;
    perm.isActive = true;
    perm.revokedAt = null;
    perm.save();
  }
  // Handle revoke operations
  else if (operation == "revoke" || operation == "revoke_key") {
    const perm = Permission.load(permId);
    if (perm) {
      perm.isActive = false;
      perm.revokedAt = BigInt.fromU64(timestamp);
      perm.save();
    }
  }
}
