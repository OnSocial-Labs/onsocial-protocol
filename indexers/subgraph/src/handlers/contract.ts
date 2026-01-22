/**
 * CONTRACT_UPDATE event handler
 * Processes contract configuration and admin changes
 */

import { near, JSONValue, BigInt, TypedMap } from "@graphprotocol/graph-ts";
import { ContractUpdate } from "../../generated/schema";
import { jsonToString, getString, getStringOrNull, getInt, getBigInt } from "../utils";

export function handleContractUpdate(
  obj: TypedMap<string, JSONValue>,
  receipt: near.ReceiptWithOutcome,
  logIndex: i32
): void {
  const receiptId = receipt.receipt.id.toHexString();
  const timestamp = receipt.block.header.timestampNanosec;

  const id = receiptId + "-" + logIndex.toString() + "-contract";
  const entity = new ContractUpdate(id);

  entity.blockHeight = BigInt.fromU64(receipt.block.header.height);
  entity.blockTimestamp = BigInt.fromU64(timestamp);
  entity.receiptId = receiptId;

  entity.operation = getString(obj, "operation", "unknown");
  entity.author = getString(obj, "author", "");
  entity.partitionId = getInt(obj, "partition_id");

  entity.field = getStringOrNull(obj, "field");
  entity.oldValue = getStringOrNull(obj, "old_value");
  entity.newValue = getStringOrNull(obj, "new_value");

  entity.path = getStringOrNull(obj, "path");
  entity.targetId = getStringOrNull(obj, "target_id");

  entity.authType = getStringOrNull(obj, "auth_type");
  entity.actorId = getStringOrNull(obj, "actor_id");
  entity.payerId = getStringOrNull(obj, "payer_id");

  entity.publicKey = getStringOrNull(obj, "public_key");
  entity.nonce = getBigInt(obj, "nonce");

  const newConfigField = obj.get("new_config");
  if (newConfigField && !newConfigField.isNull()) {
    entity.newConfig = jsonToString(newConfigField);
  }

  const oldConfigField = obj.get("old_config");
  if (oldConfigField && !oldConfigField.isNull()) {
    entity.oldConfig = jsonToString(oldConfigField);
  }

  // Manager changes
  entity.oldManager = getStringOrNull(obj, "old_manager");
  entity.newManager = getStringOrNull(obj, "new_manager");
  entity.executor = getStringOrNull(obj, "executor");

  // Status change
  entity.previousStatus = getStringOrNull(obj, "previous");
  entity.newStatus = getStringOrNull(obj, "new");

  entity.save();
}
