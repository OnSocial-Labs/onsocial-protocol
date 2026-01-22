/**
 * STORAGE_UPDATE event handler
 * Processes storage deposits, withdrawals, and pool operations
 */

import { near, JSONValue, BigInt, TypedMap } from "@graphprotocol/graph-ts";
import { StorageUpdate, SharedStorageAllocation } from "../../generated/schema";
import { getString, getStringOrNull, getInt, getBigInt } from "../utils";
import { ensureAccount, ensureGroup, ensureStoragePool } from "../entities";

export function handleStorageUpdate(
  obj: TypedMap<string, JSONValue>,
  receipt: near.ReceiptWithOutcome,
  logIndex: i32
): void {
  const receiptId = receipt.receipt.id.toHexString();
  const timestamp = receipt.block.header.timestampNanosec;

  const id = receiptId + "-" + logIndex.toString() + "-storage";
  const entity = new StorageUpdate(id);

  entity.blockHeight = BigInt.fromU64(receipt.block.header.height);
  entity.blockTimestamp = BigInt.fromU64(timestamp);
  entity.receiptId = receiptId;

  const operation = getString(obj, "operation", "unknown");
  const author = getString(obj, "author", "");

  entity.operation = operation;
  entity.author = author;
  entity.partitionId = getInt(obj, "partition_id");

  entity.amount = getBigInt(obj, "amount");
  entity.previousBalance = getBigInt(obj, "previous_balance");
  entity.newBalance = getBigInt(obj, "new_balance");

  entity.poolId = getStringOrNull(obj, "pool_id");
  entity.poolKey = getStringOrNull(obj, "pool_key");
  entity.previousPoolBalance = getBigInt(obj, "previous_pool_balance");
  entity.newPoolBalance = getBigInt(obj, "new_pool_balance");

  entity.groupId = getStringOrNull(obj, "group_id");
  entity.bytes = getBigInt(obj, "bytes");
  entity.remainingAllowance = getBigInt(obj, "remaining_allowance");

  entity.poolAccount = getStringOrNull(obj, "pool_account");
  entity.reason = getStringOrNull(obj, "reason");
  entity.authType = getStringOrNull(obj, "auth_type");
  entity.actorId = getStringOrNull(obj, "actor_id");
  entity.payerId = getStringOrNull(obj, "payer_id");
  entity.targetId = getStringOrNull(obj, "target_id");
  entity.availableBalance = getBigInt(obj, "available_balance");
  entity.donor = getStringOrNull(obj, "donor");

  // Payer for group sponsor spend
  entity.payer = getStringOrNull(obj, "payer");

  // Shared storage fields
  entity.maxBytes = getBigInt(obj, "max_bytes");
  entity.newSharedBytes = getBigInt(obj, "new_shared_bytes");
  entity.newUsedBytes = getBigInt(obj, "new_used_bytes");
  entity.poolAvailableBytes = getBigInt(obj, "pool_available_bytes");
  entity.usedBytes = getBigInt(obj, "used_bytes");

  const account = ensureAccount(author, timestamp);
  entity.account = account.id;
  account.lastActiveAt = BigInt.fromU64(timestamp);
  account.storageUpdateCount = account.storageUpdateCount + 1;

  if (operation == "storage_deposit" || operation == "storage_withdraw") {
    const newBal = entity.newBalance;
    if (newBal) {
      account.storageBalance = newBal;
    }
  }
  account.save();

  let poolKey = entity.poolKey;
  if (!poolKey) {
    poolKey = entity.poolId;
  }
  if (poolKey) {
    const pool = ensureStoragePool(poolKey, timestamp);
    entity.storagePool = pool.id;

    if (poolKey.startsWith("group-")) {
      pool.poolType = "group";
      pool.groupId = entity.groupId;
    } else if (poolKey == "platform.pool") {
      pool.poolType = "platform";
    } else if (operation.indexOf("shared") >= 0) {
      pool.poolType = "shared";
    }

    const newPoolBal = entity.newPoolBalance;
    if (newPoolBal) {
      pool.balance = newPoolBal;
    }

    // Update shared pool tracking
    const newSharedBytes = entity.newSharedBytes;
    const newUsedBytes = entity.newUsedBytes;
    if (newSharedBytes) {
      pool.sharedBytes = newSharedBytes;
    }
    if (newUsedBytes) {
      pool.usedBytes = newUsedBytes;
    }

    pool.lastUpdatedAt = BigInt.fromU64(timestamp);
    pool.save();
  }

  // Handle share_storage and return_storage for SharedStorageAllocation tracking
  if (operation == "share_storage") {
    const targetId = entity.targetId;
    const poolId = entity.poolId;
    const maxBytes = entity.maxBytes;
    if (targetId && poolId && maxBytes) {
      const allocationId = poolId + "-" + targetId;
      let allocation = SharedStorageAllocation.load(allocationId);
      if (!allocation) {
        allocation = new SharedStorageAllocation(allocationId);
        allocation.poolId = poolId;
        allocation.targetId = targetId;
        allocation.usedBytes = BigInt.zero();
        allocation.allocatedAt = BigInt.fromU64(timestamp);
      }
      allocation.maxBytes = maxBytes;
      allocation.isActive = true;
      allocation.returnedAt = null;
      allocation.save();
    }
  } else if (operation == "return_storage") {
    const targetId = author;
    const poolId = entity.poolId;
    if (poolId) {
      const allocationId = poolId + "-" + targetId;
      const allocation = SharedStorageAllocation.load(allocationId);
      if (allocation) {
        allocation.isActive = false;
        allocation.returnedAt = BigInt.fromU64(timestamp);
        allocation.save();
      }
    }
  }

  const gid = entity.groupId;
  const npb = entity.newPoolBalance;
  if (gid && npb) {
    const group = ensureGroup(gid, author, timestamp);
    group.poolBalance = npb;
    group.lastActivityAt = BigInt.fromU64(timestamp);
    group.save();
  }

  entity.save();
}
