/**
 * DATA_UPDATE event handler
 * Processes data writes to user and group storage paths
 */

import { near, JSONValue, BigInt, TypedMap } from "@graphprotocol/graph-ts";
import { DataUpdate } from "../../generated/schema";
import { jsonToString, getString, getStringOrNull, getInt, getBool } from "../utils";
import { ensureAccount, ensureGroup } from "../entities";

export function handleDataUpdate(
  obj: TypedMap<string, JSONValue>,
  receipt: near.ReceiptWithOutcome,
  logIndex: i32
): void {
  const receiptId = receipt.receipt.id.toHexString();
  const timestamp = receipt.block.header.timestampNanosec;

  const pathField = obj.get("path");
  if (!pathField || pathField.isNull()) {
    return;
  }
  const path = pathField.toString();

  const id = receiptId + "-" + logIndex.toString() + "-data";
  const entity = new DataUpdate(id);

  entity.blockHeight = BigInt.fromU64(receipt.block.header.height);
  entity.blockTimestamp = BigInt.fromU64(timestamp);
  entity.receiptId = receiptId;

  entity.operation = getString(obj, "operation", "unknown");
  entity.author = getString(obj, "author", "");
  entity.partitionId = getInt(obj, "partition_id");

  entity.path = path;

  // Serialize value field properly (handles objects, arrays, primitives)
  const valueField = obj.get("value");
  if (valueField && !valueField.isNull()) {
    entity.value = jsonToString(valueField);
  }

  // Use contract's auto-injected fields (from EventBuilder.with_path())
  // These are authoritative - contract already parsed the path
  const groupId = getStringOrNull(obj, "group_id");
  const groupPath = getStringOrNull(obj, "group_path");
  const isGroupContent = getBool(obj, "is_group_content");

  // Derive accountId from path (first segment)
  const pathParts = path.split("/");
  let accountId = pathParts[0];
  if (pathParts.length >= 2 && pathParts[0] == "groups") {
    accountId = "groups";  // Special case for direct group paths
  }

  entity.accountId = accountId;
  entity.groupId = groupId;
  entity.groupPath = groupPath;
  entity.isGroupContent = isGroupContent;

  // Use contract's derived fields for type/id (from EventBuilder.with_path())
  entity.derivedId = getStringOrNull(obj, "id");
  entity.derivedType = getStringOrNull(obj, "type");

  // Also derive dataType/dataId from path for querying (fallback)
  if (!isGroupContent && pathParts.length > 1) {
    entity.dataType = pathParts[1];
    if (pathParts.length > 2) {
      entity.dataId = pathParts[2];
    }
  } else if (isGroupContent && groupPath) {
    const gpParts = groupPath.split("/");
    if (gpParts.length > 0) {
      entity.dataType = gpParts[0];
      if (gpParts.length > 1) {
        entity.dataId = gpParts[1];
      }
    }
  }

  const writesField = obj.get("writes");
  if (writesField && !writesField.isNull()) {
    entity.writes = jsonToString(writesField);
  }

  const account = ensureAccount(accountId, timestamp);
  entity.account = account.id;
  account.lastActiveAt = BigInt.fromU64(timestamp);
  account.dataUpdateCount = account.dataUpdateCount + 1;
  account.save();

  if (groupId) {
    const group = ensureGroup(groupId, entity.author, timestamp);
    entity.group = group.id;
    group.lastActivityAt = BigInt.fromU64(timestamp);
    group.updateCount = group.updateCount + 1;
    group.save();
  }

  entity.save();
}
