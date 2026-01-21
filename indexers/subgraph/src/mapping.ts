import { near, json, JSONValue, BigInt, log } from "@graphprotocol/graph-ts";
import {
  DataUpdate,
  StorageUpdate,
  GroupUpdate,
  ContractUpdate,
  Account,
} from "../generated/schema";

/**
 * Main receipt handler - processes all OnSocial contract events
 */
export function handleReceipt(receipt: near.ReceiptWithOutcome): void {
  const outcome = receipt.outcome;

  for (let i = 0; i < outcome.logs.length; i++) {
    const logStr = outcome.logs[i];

    // OnSocial events format: EVENT_JSON:{"type":"...", ...}
    if (logStr.startsWith("EVENT_JSON:")) {
      const jsonStr = logStr.substring(11);
      const jsonResult = json.try_fromString(jsonStr);

      if (jsonResult.isOk) {
        const event = jsonResult.value;
        const eventObj = event.toObject();
        const eventType = eventObj.get("type");

        if (eventType) {
          const typeStr = eventType.toString();

          if (typeStr == "DATA_UPDATE") {
            handleDataUpdate(event, receipt, i);
          } else if (typeStr == "STORAGE_UPDATE") {
            handleStorageUpdate(event, receipt, i);
          } else if (typeStr == "GROUP_UPDATE") {
            handleGroupUpdate(event, receipt, i);
          } else if (typeStr == "CONTRACT_UPDATE") {
            handleContractUpdate(event, receipt, i);
          }
        }
      } else {
        log.warning("Failed to parse JSON: {}", [jsonStr]);
      }
    }
  }
}

function handleDataUpdate(
  event: JSONValue,
  receipt: near.ReceiptWithOutcome,
  logIndex: i32
): void {
  const obj = event.toObject();
  const receiptId = receipt.receipt.id.toHexString();

  const pathField = obj.get("path");
  if (!pathField) return;
  const path = pathField.toString();

  const id = receiptId + "-" + logIndex.toString() + "-data";
  const entity = new DataUpdate(id);

  entity.blockHeight = BigInt.fromU64(receipt.block.header.height);
  entity.blockTimestamp = BigInt.fromU64(receipt.block.header.timestampNanosec);
  entity.receiptId = receiptId;

  const operationField = obj.get("operation");
  entity.operation = operationField ? operationField.toString() : "unknown";

  const authorField = obj.get("author");
  entity.author = authorField ? authorField.toString() : "";

  const partitionIdField = obj.get("partition_id");
  if (partitionIdField && !partitionIdField.isNull()) {
    entity.partitionId = partitionIdField.toI64() as i32;
  }

  entity.path = path;

  const valueField = obj.get("value");
  if (valueField && !valueField.isNull()) {
    entity.value = valueField.toString();
  }

  // Extract account from path (e.g., "alice.near/profile/name" -> "alice.near")
  const pathParts = path.split("/");
  const accountId = pathParts[0];
  entity.accountId = accountId;

  if (pathParts.length > 1) {
    entity.dataType = pathParts[1];
  }
  if (pathParts.length > 2) {
    entity.dataId = pathParts[2];
  }

  // Link to account
  const account = getOrCreateAccount(
    accountId,
    receipt.block.header.timestampNanosec
  );
  entity.account = account.id;

  entity.save();

  // Update account stats
  account.lastActiveAt = BigInt.fromU64(receipt.block.header.timestampNanosec);
  account.dataUpdateCount = account.dataUpdateCount + 1;
  account.save();
}

function handleStorageUpdate(
  event: JSONValue,
  receipt: near.ReceiptWithOutcome,
  logIndex: i32
): void {
  const obj = event.toObject();
  const receiptId = receipt.receipt.id.toHexString();

  const authorField = obj.get("author");
  const author = authorField ? authorField.toString() : "";

  const operationField = obj.get("operation");
  const operation = operationField ? operationField.toString() : "unknown";

  const id = receiptId + "-" + logIndex.toString() + "-storage";
  const entity = new StorageUpdate(id);

  entity.blockHeight = BigInt.fromU64(receipt.block.header.height);
  entity.blockTimestamp = BigInt.fromU64(receipt.block.header.timestampNanosec);
  entity.receiptId = receiptId;
  entity.operation = operation;
  entity.author = author;

  const partitionIdField = obj.get("partition_id");
  if (partitionIdField && !partitionIdField.isNull()) {
    entity.partitionId = partitionIdField.toI64() as i32;
  }

  const amountField = obj.get("amount");
  if (amountField && !amountField.isNull()) {
    entity.amount = BigInt.fromString(amountField.toString());
  }

  const prevBalanceField = obj.get("previous_balance");
  if (prevBalanceField && !prevBalanceField.isNull()) {
    entity.previousBalance = BigInt.fromString(prevBalanceField.toString());
  }

  const newBalanceField = obj.get("new_balance");
  if (newBalanceField && !newBalanceField.isNull()) {
    entity.newBalance = BigInt.fromString(newBalanceField.toString());
  }

  // Link to account
  const account = getOrCreateAccount(
    author,
    receipt.block.header.timestampNanosec
  );
  entity.account = account.id;

  entity.save();

  // Update account balance
  if (entity.newBalance) {
    account.storageBalance = entity.newBalance!;
  }
  account.lastActiveAt = BigInt.fromU64(receipt.block.header.timestampNanosec);
  account.storageUpdateCount = account.storageUpdateCount + 1;
  account.save();
}

function handleGroupUpdate(
  event: JSONValue,
  receipt: near.ReceiptWithOutcome,
  logIndex: i32
): void {
  const obj = event.toObject();
  const receiptId = receipt.receipt.id.toHexString();

  const operationField = obj.get("operation");
  const operation = operationField ? operationField.toString() : "unknown";

  const groupIdField = obj.get("group_id");
  const groupId = groupIdField ? groupIdField.toString() : "";

  const id = receiptId + "-" + logIndex.toString() + "-group";
  const entity = new GroupUpdate(id);

  entity.blockHeight = BigInt.fromU64(receipt.block.header.height);
  entity.blockTimestamp = BigInt.fromU64(receipt.block.header.timestampNanosec);
  entity.receiptId = receiptId;
  entity.operation = operation;

  const authorField = obj.get("author");
  entity.author = authorField ? authorField.toString() : "";

  const partitionIdField = obj.get("partition_id");
  if (partitionIdField && !partitionIdField.isNull()) {
    entity.partitionId = partitionIdField.toI64() as i32;
  }

  entity.groupId = groupId;

  const memberIdField = obj.get("member_id");
  if (memberIdField && !memberIdField.isNull()) {
    entity.memberId = memberIdField.toString();
  }

  const roleField = obj.get("role");
  if (roleField && !roleField.isNull()) {
    entity.role = roleField.toString();
  }

  entity.save();
}

function handleContractUpdate(
  event: JSONValue,
  receipt: near.ReceiptWithOutcome,
  logIndex: i32
): void {
  const obj = event.toObject();
  const receiptId = receipt.receipt.id.toHexString();

  const operationField = obj.get("operation");
  const operation = operationField ? operationField.toString() : "unknown";

  const id = receiptId + "-" + logIndex.toString() + "-contract";
  const entity = new ContractUpdate(id);

  entity.blockHeight = BigInt.fromU64(receipt.block.header.height);
  entity.blockTimestamp = BigInt.fromU64(receipt.block.header.timestampNanosec);
  entity.receiptId = receiptId;
  entity.operation = operation;

  const authorField = obj.get("author");
  entity.author = authorField ? authorField.toString() : "";

  const partitionIdField = obj.get("partition_id");
  if (partitionIdField && !partitionIdField.isNull()) {
    entity.partitionId = partitionIdField.toI64() as i32;
  }

  const fieldField = obj.get("field");
  if (fieldField && !fieldField.isNull()) {
    entity.field = fieldField.toString();
  }

  const oldValueField = obj.get("old_value");
  if (oldValueField && !oldValueField.isNull()) {
    entity.oldValue = oldValueField.toString();
  }

  const newValueField = obj.get("new_value");
  if (newValueField && !newValueField.isNull()) {
    entity.newValue = newValueField.toString();
  }

  entity.save();
}

function getOrCreateAccount(accountId: string, timestamp: u64): Account {
  let account = Account.load(accountId);

  if (!account) {
    account = new Account(accountId);
    account.storageBalance = BigInt.zero();
    account.firstSeenAt = BigInt.fromU64(timestamp);
    account.lastActiveAt = BigInt.fromU64(timestamp);
    account.dataUpdateCount = 0;
    account.storageUpdateCount = 0;
    account.save();
  }

  return account;
}
