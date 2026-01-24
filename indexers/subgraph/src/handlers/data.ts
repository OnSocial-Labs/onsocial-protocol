/**
 * DATA_UPDATE event handler
 * Processes data writes to user and group storage paths
 */

import { near, JSONValue, JSONValueKind, BigInt, TypedMap } from "@graphprotocol/graph-ts";
import { DataUpdate } from "../../generated/schema";
import { jsonToString, getStringOrNull, getInt, getBool } from "../utils";
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

  const operationField = obj.get("operation");
  if (!operationField || operationField.isNull()) {
    return;
  }
  const operation = operationField.toString();

  const authorField = obj.get("author");
  if (!authorField || authorField.isNull()) {
    return;
  }
  const author = authorField.toString();
  if (author.length == 0) {
    return;
  }

  const id = receiptId + "-" + logIndex.toString() + "-data";
  const entity = new DataUpdate(id);

  entity.blockHeight = BigInt.fromU64(receipt.block.header.height);
  entity.blockTimestamp = BigInt.fromU64(timestamp);
  entity.receiptId = receiptId;

  entity.operation = operation;
  entity.author = author;
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
    accountId = author;  // For direct group paths, use author as account
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

  // Extract targetAccount from graph/* paths
  // Path format: {accountId}/graph/{type}/{targetAccount}
  // SDK interprets what different graph types mean (follow, block, mute, etc.)
  if (!isGroupContent && pathParts.length >= 4 && pathParts[1] == "graph") {
    entity.targetAccount = pathParts[3];
  }

  // Extract reference fields from value JSON (if present)
  // Protocol-level conventions: value.parent (hierarchy), value.ref (lateral), value.refs (multiple)
  if (valueField && !valueField.isNull() && valueField.kind == JSONValueKind.OBJECT) {
    const valueObj = valueField.toObject();
    
    // Extract parent reference (hierarchical: reply, subtask, comment)
    const parentField = valueObj.get("parent");
    if (parentField && !parentField.isNull() && parentField.kind == JSONValueKind.STRING) {
      const parent = parentField.toString();
      entity.parentPath = parent;
      const parentParts = parent.split("/");
      if (parentParts.length > 0) {
        entity.parentAuthor = parentParts[0];
      }
    }
    
    // Extract parentType (relationship kind: "reply", "subtask", "comment", etc.)
    const parentTypeField = valueObj.get("parentType");
    if (parentTypeField && !parentTypeField.isNull() && parentTypeField.kind == JSONValueKind.STRING) {
      entity.parentType = parentTypeField.toString();
    }
    
    // Extract ref reference (lateral: quote, cite, embed)
    const refField = valueObj.get("ref");
    if (refField && !refField.isNull() && refField.kind == JSONValueKind.STRING) {
      const ref = refField.toString();
      entity.refPath = ref;
      const refParts = ref.split("/");
      if (refParts.length > 0) {
        entity.refAuthor = refParts[0];
      }
    }
    
    // Extract refType (relationship kind: "quote", "cite", "embed", etc.)
    const refTypeField = valueObj.get("refType");
    if (refTypeField && !refTypeField.isNull() && refTypeField.kind == JSONValueKind.STRING) {
      entity.refType = refTypeField.toString();
    }
    
    // Extract refs array (multiple lateral references)
    const refsField = valueObj.get("refs");
    if (refsField && !refsField.isNull() && refsField.kind == JSONValueKind.ARRAY) {
      const refsArray = refsField.toArray();
      const refPaths: string[] = [];
      const refAuthors: string[] = [];
      
      for (let i = 0; i < refsArray.length; i++) {
        const refItem = refsArray[i];
        if (refItem && !refItem.isNull() && refItem.kind == JSONValueKind.STRING) {
          const refPath = refItem.toString();
          refPaths.push(refPath);
          const parts = refPath.split("/");
          if (parts.length > 0) {
            refAuthors.push(parts[0]);
          }
        }
      }
      
      if (refPaths.length > 0) {
        entity.refs = refPaths;
        entity.refAuthors = refAuthors;
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
