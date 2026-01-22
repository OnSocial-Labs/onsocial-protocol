/**
 * PERMISSION_UPDATE event handler
 * Processes permission grants, revokes, and key operations
 */

import { near, JSONValue, BigInt, TypedMap } from "@graphprotocol/graph-ts";
import { PermissionUpdate } from "../../generated/schema";
import { jsonToString, getString, getStringOrNull, getInt, getBigInt, getBool, extractGroupIdFromPath } from "../utils";
import { ensureAccount, updatePermissionAggregate } from "../entities";

export function handlePermissionUpdate(
  obj: TypedMap<string, JSONValue>,
  receipt: near.ReceiptWithOutcome,
  logIndex: i32
): void {
  const receiptId = receipt.receipt.id.toHexString();
  const timestamp = receipt.block.header.timestampNanosec;

  const id = receiptId + "-" + logIndex.toString() + "-permission";
  const entity = new PermissionUpdate(id);

  entity.blockHeight = BigInt.fromU64(receipt.block.header.height);
  entity.blockTimestamp = BigInt.fromU64(timestamp);
  entity.receiptId = receiptId;

  const operation = getString(obj, "operation", "unknown");
  const author = getString(obj, "author", "");

  entity.operation = operation;
  entity.author = author;
  entity.partitionId = getInt(obj, "partition_id");

  entity.grantee = getStringOrNull(obj, "target_id");
  entity.publicKey = getStringOrNull(obj, "public_key");

  const path = getStringOrNull(obj, "path");
  entity.path = path;
  entity.level = getInt(obj, "level");

  const levelField = obj.get("level");
  if (levelField && !levelField.isNull()) {
    entity.permission = jsonToString(levelField);
  }

  entity.expiresAt = getBigInt(obj, "expires_at");

  if (path) {
    entity.groupId = extractGroupIdFromPath(path);
  }
  entity.permissionNonce = getBigInt(obj, "permission_nonce");

  entity.deleted = getBool(obj, "deleted");

  entity.save();

  // Update Permission aggregate
  updatePermissionAggregate(entity, author, timestamp);

  const account = ensureAccount(author, timestamp);
  account.lastActiveAt = BigInt.fromU64(timestamp);
  account.permissionUpdateCount = account.permissionUpdateCount + 1;
  account.save();
}
