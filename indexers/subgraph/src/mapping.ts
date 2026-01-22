/**
 * =============================================================================
 * OnSocial Core Contract Subgraph Mapping
 * Complete handler for all NEP-297 events emitted by core-onsocial contract
 * =============================================================================
 */

import {
  near,
  json,
  JSONValue,
  JSONValueKind,
  BigInt,
  log,
  TypedMap,
} from "@graphprotocol/graph-ts";

// Helper to safely convert any JSONValue to a string representation
function jsonToString(value: JSONValue): string {
  if (value.kind == JSONValueKind.STRING) {
    return value.toString();
  } else if (value.kind == JSONValueKind.NUMBER) {
    return value.toBigInt().toString();
  } else if (value.kind == JSONValueKind.BOOL) {
    return value.toBool() ? "true" : "false";
  } else if (value.kind == JSONValueKind.NULL) {
    return "null";
  } else if (value.kind == JSONValueKind.ARRAY) {
    let arr = value.toArray();
    let parts: string[] = [];
    for (let i = 0; i < arr.length; i++) {
      parts.push(jsonToString(arr[i]));
    }
    return "[" + parts.join(",") + "]";
  } else if (value.kind == JSONValueKind.OBJECT) {
    let obj = value.toObject();
    let entries = obj.entries;
    let parts: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      let key = entries[i].key;
      let val = jsonToString(entries[i].value);
      parts.push('"' + key + '":' + val);
    }
    return "{" + parts.join(",") + "}";
  }
  return "";
}

import {
  DataUpdate,
  StorageUpdate,
  GroupUpdate,
  ContractUpdate,
  PermissionUpdate,
  Account,
  Group,
  StoragePool,
  Proposal,
  Permission,
  GroupMember,
  SharedStorageAllocation,
} from "../generated/schema";

// =============================================================================
// MAIN RECEIPT HANDLER
// =============================================================================

export function handleReceipt(receipt: near.ReceiptWithOutcome): void {
  const outcome = receipt.outcome;
  const logs = outcome.logs;

  for (let i = 0; i < logs.length; i++) {
    const logStr = logs[i];

    if (!logStr.startsWith("EVENT_JSON:")) {
      continue;
    }

    const jsonStr = logStr.substring(11);
    const jsonResult = json.try_fromString(jsonStr);

    if (!jsonResult.isOk) {
      log.warning("[OnSocial] Failed to parse EVENT_JSON: {}", [jsonStr.substring(0, 100)]);
      continue;
    }

    const eventWrapper = jsonResult.value.toObject();
    const standard = eventWrapper.get("standard");
    if (!standard || standard.toString() != "onsocial") {
      continue;
    }

    const eventType = eventWrapper.get("event");
    if (!eventType) {
      continue;
    }
    const typeStr = eventType.toString();

    const dataField = eventWrapper.get("data");
    if (!dataField || dataField.kind != JSONValueKind.ARRAY) {
      continue;
    }
    const dataArray = dataField.toArray();
    if (dataArray.length == 0) {
      continue;
    }

    const eventData = dataArray[0].toObject();

    if (typeStr == "DATA_UPDATE") {
      handleDataUpdate(eventData, receipt, i);
    } else if (typeStr == "STORAGE_UPDATE") {
      handleStorageUpdate(eventData, receipt, i);
    } else if (typeStr == "GROUP_UPDATE") {
      handleGroupUpdate(eventData, receipt, i);
    } else if (typeStr == "CONTRACT_UPDATE") {
      handleContractUpdate(eventData, receipt, i);
    } else if (typeStr == "PERMISSION_UPDATE") {
      handlePermissionUpdate(eventData, receipt, i);
    }
  }
}

// =============================================================================
// DATA_UPDATE HANDLER
// =============================================================================

function handleDataUpdate(
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

// =============================================================================
// STORAGE_UPDATE HANDLER
// =============================================================================

function handleStorageUpdate(
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

// =============================================================================
// GROUP_UPDATE HANDLER
// =============================================================================

function handleGroupUpdate(
  obj: TypedMap<string, JSONValue>,
  receipt: near.ReceiptWithOutcome,
  logIndex: i32
): void {
  const receiptId = receipt.receipt.id.toHexString();
  const timestamp = receipt.block.header.timestampNanosec;

  const id = receiptId + "-" + logIndex.toString() + "-group";
  const entity = new GroupUpdate(id);

  entity.blockHeight = BigInt.fromU64(receipt.block.header.height);
  entity.blockTimestamp = BigInt.fromU64(timestamp);
  entity.receiptId = receiptId;

  const operation = getString(obj, "operation", "unknown");
  const author = getString(obj, "author", "");
  
  // Get path first - we may need it to extract groupId
  const path = getStringOrNull(obj, "path");
  entity.path = path;
  
  // Try to get groupId directly, or extract from path
  let groupId = getStringOrNull(obj, "group_id");
  if (!groupId && path) {
    groupId = extractGroupIdFromPath(path);
  }

  entity.operation = operation;
  entity.author = author;
  entity.partitionId = getInt(obj, "partition_id");
  entity.groupId = groupId;

  entity.memberId = getStringOrNull(obj, "target_id");
  entity.memberNonce = getBigInt(obj, "member_nonce");
  entity.memberNoncePath = getStringOrNull(obj, "member_nonce_path");
  entity.role = getStringOrNull(obj, "role");
  entity.level = getInt(obj, "level");

  const valueField = obj.get("value");
  if (valueField && !valueField.isNull()) {
    entity.value = jsonToString(valueField);
  }

  entity.poolKey = getStringOrNull(obj, "pool_key");
  entity.amount = getBigInt(obj, "amount");
  entity.previousPoolBalance = getBigInt(obj, "previous_pool_balance");
  entity.newPoolBalance = getBigInt(obj, "new_pool_balance");

  entity.quotaBytes = getBigInt(obj, "quota_bytes");
  entity.quotaUsed = getBigInt(obj, "quota_used");
  entity.dailyLimit = getBigInt(obj, "daily_limit");
  entity.previouslyEnabled = getBool(obj, "previously_enabled");

  entity.proposalId = getStringOrNull(obj, "proposal_id");
  entity.proposalType = getStringOrNull(obj, "proposal_type");
  entity.status = getStringOrNull(obj, "status");
  entity.sequenceNumber = getBigInt(obj, "sequence_number");
  entity.description = getStringOrNull(obj, "description");
  entity.autoVote = getBool(obj, "auto_vote");
  entity.createdAt = getBigInt(obj, "created_at");
  entity.lockedMemberCount = getInt(obj, "locked_member_count");
  entity.lockedDeposit = getBigInt(obj, "locked_deposit");
  entity.expiresAt = getBigInt(obj, "expires_at");
  entity.tallyPath = getStringOrNull(obj, "tally_path");
  entity.counterPath = getStringOrNull(obj, "counter_path");

  entity.voter = getStringOrNull(obj, "voter");
  entity.approve = getBool(obj, "approve");
  entity.totalVotes = getInt(obj, "total_votes");
  entity.yesVotes = getInt(obj, "yes_votes");
  entity.noVotes = getInt(obj, "no_votes");
  entity.shouldExecute = getBool(obj, "should_execute");
  entity.shouldReject = getBool(obj, "should_reject");
  entity.votedAt = getBigInt(obj, "voted_at");

  entity.votingPeriod = getBigInt(obj, "voting_period");
  entity.participationQuorum = getInt(obj, "participation_quorum");
  entity.majorityThreshold = getInt(obj, "majority_threshold");
  entity.effectiveVotingPeriod = getBigInt(obj, "effective_voting_period");
  entity.effectiveParticipationQuorum = getInt(obj, "effective_participation_quorum");
  entity.effectiveMajorityThreshold = getInt(obj, "effective_majority_threshold");

  entity.previousOwner = getStringOrNull(obj, "previous_owner");
  entity.newOwner = getStringOrNull(obj, "new_owner");
  entity.transferredAt = getBigInt(obj, "transferred_at");
  entity.triggeredBy = getStringOrNull(obj, "triggered_by");

  const requestDataField = obj.get("request_data");
  if (requestDataField && !requestDataField.isNull()) {
    entity.requestData = jsonToString(requestDataField);
  }

  entity.permissionPath = getStringOrNull(obj, "permission_path");
  entity.permissionLevel = getInt(obj, "permission_level");
  entity.via = getStringOrNull(obj, "via");

  entity.isPrivate = getBool(obj, "is_private");
  entity.changedAt = getBigInt(obj, "changed_at");

  const blacklistDataField = obj.get("blacklist_data");
  if (blacklistDataField && !blacklistDataField.isNull()) {
    entity.blacklistData = jsonToString(blacklistDataField);
  }

  const structuredDataField = obj.get("structured_data");
  if (structuredDataField && !structuredDataField.isNull()) {
    entity.structuredData = jsonToString(structuredDataField);
  }

  const customDataField = obj.get("custom_data");
  if (customDataField && !customDataField.isNull()) {
    entity.customData = jsonToString(customDataField);
  }

  // Governance context
  entity.fromGovernance = getBool(obj, "from_governance");
  entity.proposalTarget = getStringOrNull(obj, "target");

  // Sponsor config fields
  entity.sponsorEnabled = getBool(obj, "enabled");
  entity.dailyRefillBytes = getBigInt(obj, "daily_refill_bytes");
  entity.allowanceMaxBytes = getBigInt(obj, "allowance_max_bytes");

  // Group update fields
  entity.updateType = getStringOrNull(obj, "update_type");
  const changesField = obj.get("changes");
  if (changesField && !changesField.isNull()) {
    entity.changes = jsonToString(changesField);
  }
  entity.message = getStringOrNull(obj, "message");

  // Participation/approval bps
  entity.participationBps = getInt(obj, "participation_bps");
  entity.approvalBps = getInt(obj, "approval_bps");

  entity.finalTotalVotes = getInt(obj, "final_total_votes");
  entity.finalYesVotes = getInt(obj, "final_yes_votes");
  entity.finalNoVotes = getInt(obj, "final_no_votes");
  entity.unlockedDeposit = getBigInt(obj, "unlocked_deposit");
  entity.updatedAt = getBigInt(obj, "updated_at");
  entity.executedAt = getBigInt(obj, "executed_at");

  const writesField = obj.get("writes");
  if (writesField && !writesField.isNull()) {
    entity.writes = jsonToString(writesField);
  }

  const defaultPermissionsField = obj.get("default_permissions");
  if (defaultPermissionsField && !defaultPermissionsField.isNull()) {
    entity.defaultPermissions = jsonToString(defaultPermissionsField);
  }

  // Update Group aggregate
  if (groupId) {
    const group = ensureGroup(groupId, author, timestamp);
    entity.group = group.id;

    group.lastActivityAt = BigInt.fromU64(timestamp);
    group.updateCount = group.updateCount + 1;

    if (operation == "add_member" || operation == "member_invited" || operation == "join_request_approved") {
      group.memberCount = group.memberCount + 1;
      const mid = entity.memberId;
      if (mid) {
        const member = ensureGroupMember(groupId, mid, timestamp);
        member.isActive = true;
        member.isBlacklisted = false;
        member.lastActiveAt = BigInt.fromU64(timestamp);
        const mn = entity.memberNonce;
        if (mn) {
          member.nonce = mn;
        }
        const lvl = entity.level;
        if (lvl != 0) {
          member.level = lvl;
        }
        member.save();
      }
    } else if (operation == "remove_member") {
      if (group.memberCount > 0) {
        group.memberCount = group.memberCount - 1;
      }
      const mid = entity.memberId;
      if (mid) {
        const memberId = groupId + "-" + mid;
        const member = GroupMember.load(memberId);
        if (member) {
          member.isActive = false;
          member.leftAt = BigInt.fromU64(timestamp);
          member.save();
        }
      }
    } else if (operation == "add_to_blacklist") {
      if (group.memberCount > 0) {
        group.memberCount = group.memberCount - 1;
      }
      const mid = entity.memberId;
      if (mid) {
        const memberId = groupId + "-" + mid;
        const member = GroupMember.load(memberId);
        if (member) {
          member.isActive = false;
          member.isBlacklisted = true;
          member.leftAt = BigInt.fromU64(timestamp);
          member.save();
        }
      }
    } else if (operation == "remove_from_blacklist") {
      const mid = entity.memberId;
      if (mid) {
        const memberId = groupId + "-" + mid;
        const member = GroupMember.load(memberId);
        if (member) {
          member.isBlacklisted = false;
          member.save();
        }
      }
    } else if (operation == "transfer_ownership") {
      const no = entity.newOwner;
      if (no) {
        let prevOwners = group.previousOwners;
        if (!prevOwners) {
          prevOwners = [];
        }
        const currOwner = group.owner;
        if (currOwner) {
          prevOwners.push(currOwner);
        }
        group.previousOwners = prevOwners;
        group.owner = no;
      }
    } else if (operation == "create_group") {
      // Parse is_private from the config in value field
      const valueField = obj.get("value");
      if (valueField && !valueField.isNull() && valueField.kind == JSONValueKind.OBJECT) {
        const configObj = valueField.toObject();
        const isPrivateField = configObj.get("is_private");
        if (isPrivateField && !isPrivateField.isNull()) {
          group.isPrivate = isPrivateField.toBool();
        }
        const ownerField = configObj.get("owner");
        if (ownerField && !ownerField.isNull()) {
          group.owner = jsonToString(ownerField);
        }
      }
    } else if (operation == "privacy_changed") {
      const isPrivateField = obj.get("is_private");
      if (isPrivateField && !isPrivateField.isNull()) {
        group.isPrivate = isPrivateField.toBool();
      }
    } else if (operation == "proposal_created") {
      group.proposalCount = group.proposalCount + 1;
      group.activeProposalCount = group.activeProposalCount + 1;
    } else if (operation == "proposal_status_updated") {
      const status = entity.status;
      if (status == "executed" || status == "rejected" || status == "expired") {
        if (group.activeProposalCount > 0) {
          group.activeProposalCount = group.activeProposalCount - 1;
        }
      }
    } else if (operation == "group_pool_deposit") {
      const npb = entity.newPoolBalance;
      if (npb) {
        group.poolBalance = npb;
      }
    } else if (operation == "join_request_submitted") {
      group.pendingJoinRequestCount = group.pendingJoinRequestCount + 1;
    } else if (operation == "join_request_approved" || operation == "join_request_rejected" || operation == "join_request_cancelled") {
      if (group.pendingJoinRequestCount > 0) {
        group.pendingJoinRequestCount = group.pendingJoinRequestCount - 1;
      }
    } else if (operation == "voting_config_changed") {
      const effectiveVotingPeriod = getBigInt(obj, "effective_voting_period");
      const effectiveParticipationQuorum = getInt(obj, "effective_participation_quorum_bps");
      const effectiveMajorityThreshold = getInt(obj, "effective_majority_threshold_bps");
      if (effectiveVotingPeriod) {
        group.votingPeriod = effectiveVotingPeriod;
      }
      if (effectiveParticipationQuorum != 0) {
        group.participationQuorumBps = effectiveParticipationQuorum;
      }
      if (effectiveMajorityThreshold != 0) {
        group.majorityThresholdBps = effectiveMajorityThreshold;
      }
      group.votingConfigUpdatedAt = BigInt.fromU64(timestamp);
    }

    group.save();
  }

  // Update Proposal aggregate
  const pid = entity.proposalId;
  if (groupId && pid) {
    const proposalEntityId = groupId + "-" + pid;
    entity.proposal = proposalEntityId;

    if (operation == "proposal_created") {
      const proposal = new Proposal(proposalEntityId);
      proposal.groupId = groupId;
      proposal.proposalId = pid;
      proposal.sequenceNumber = entity.sequenceNumber;
      const pt = entity.proposalType;
      if (pt) {
        proposal.proposalType = pt;
      } else {
        proposal.proposalType = "unknown";
      }
      proposal.description = entity.description;
      proposal.proposer = author;
      proposal.status = "active";
      proposal.yesVotes = entity.yesVotes;
      proposal.noVotes = entity.noVotes;
      proposal.totalVotes = entity.totalVotes;
      proposal.lockedMemberCount = entity.lockedMemberCount;
      proposal.votingPeriod = entity.votingPeriod;
      proposal.participationQuorum = entity.participationQuorum;
      proposal.majorityThreshold = entity.majorityThreshold;
      proposal.lockedDeposit = entity.lockedDeposit;
      const ca = entity.createdAt;
      if (ca) {
        proposal.createdAt = ca;
      } else {
        proposal.createdAt = BigInt.fromU64(timestamp);
      }
      proposal.expiresAt = entity.expiresAt;
      proposal.updatedAt = BigInt.fromU64(timestamp);
      proposal.customData = entity.customData;
      proposal.group = groupId;
      proposal.save();
    } else if (operation == "vote_cast") {
      const proposal = Proposal.load(proposalEntityId);
      if (proposal) {
        proposal.yesVotes = entity.yesVotes;
        proposal.noVotes = entity.noVotes;
        proposal.totalVotes = entity.totalVotes;
        proposal.updatedAt = BigInt.fromU64(timestamp);
        proposal.save();
      }
    } else if (operation == "proposal_status_updated") {
      const proposal = Proposal.load(proposalEntityId);
      if (proposal) {
        const s = entity.status;
        if (s) {
          proposal.status = s;
        }
        proposal.yesVotes = entity.finalYesVotes;
        proposal.noVotes = entity.finalNoVotes;
        proposal.totalVotes = entity.finalTotalVotes;
        const ea = entity.executedAt;
        if (ea) {
          proposal.executedAt = ea;
        }
        proposal.updatedAt = BigInt.fromU64(timestamp);
        proposal.save();
      }
    }
  }

  entity.save();
}

// =============================================================================
// CONTRACT_UPDATE HANDLER
// =============================================================================

function handleContractUpdate(
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

// =============================================================================
// PERMISSION_UPDATE HANDLER
// =============================================================================

function handlePermissionUpdate(
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

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getString(obj: TypedMap<string, JSONValue>, key: string, defaultValue: string): string {
  const field = obj.get(key);
  if (field && !field.isNull()) {
    return jsonToString(field);
  }
  return defaultValue;
}

function getStringOrNull(obj: TypedMap<string, JSONValue>, key: string): string | null {
  const field = obj.get(key);
  if (field && !field.isNull()) {
    return jsonToString(field);
  }
  return null;
}

function getInt(obj: TypedMap<string, JSONValue>, key: string): i32 {
  const field = obj.get(key);
  if (field && !field.isNull() && field.kind == JSONValueKind.NUMBER) {
    return field.toI64() as i32;
  }
  return 0;
}

function getBigInt(obj: TypedMap<string, JSONValue>, key: string): BigInt | null {
  const field = obj.get(key);
  if (field && !field.isNull()) {
    if (field.kind == JSONValueKind.NUMBER) {
      return BigInt.fromString(field.toBigInt().toString());
    } else if (field.kind == JSONValueKind.STRING) {
      const str = field.toString();
      if (str.length > 0) {
        return BigInt.fromString(str);
      }
    }
  }
  return null;
}

function getBool(obj: TypedMap<string, JSONValue>, key: string): boolean {
  const field = obj.get(key);
  if (field && !field.isNull() && field.kind == JSONValueKind.BOOL) {
    return field.toBool();
  }
  return false;
}

function extractGroupIdFromPath(path: string): string | null {
  const parts = path.split("/");
  if (parts.length >= 2 && parts[0] == "groups") {
    return parts[1];
  }
  if (parts.length >= 3 && parts[1] == "groups") {
    return parts[2];
  }
  return null;
}

// =============================================================================
// AGGREGATE ENTITY HELPERS
// =============================================================================

function ensureAccount(accountId: string, timestamp: u64): Account {
  let account = Account.load(accountId);
  if (!account) {
    account = new Account(accountId);
    account.storageBalance = BigInt.zero();
    account.firstSeenAt = BigInt.fromU64(timestamp);
    account.lastActiveAt = BigInt.fromU64(timestamp);
    account.dataUpdateCount = 0;
    account.storageUpdateCount = 0;
    account.permissionUpdateCount = 0;
    account.save();
  }
  return account;
}

function ensureGroup(groupId: string, owner: string, timestamp: u64): Group {
  let group = Group.load(groupId);
  if (!group) {
    group = new Group(groupId);
    group.owner = owner;
    group.previousOwners = [];
    group.createdAt = BigInt.fromU64(timestamp);
    group.lastActivityAt = BigInt.fromU64(timestamp);
    group.memberCount = 0;
    group.updateCount = 0;
    group.proposalCount = 0;
    group.activeProposalCount = 0;
    group.pendingJoinRequestCount = 0;
    group.isPrivate = false;
    group.poolBalance = BigInt.zero();
    // Voting config fields left as default (null) until voting_config_changed event
    group.save();
  }
  return group;
}

function ensureStoragePool(poolKey: string, timestamp: u64): StoragePool {
  let pool = StoragePool.load(poolKey);
  if (!pool) {
    pool = new StoragePool(poolKey);
    pool.poolType = "user";
    pool.balance = BigInt.zero();
    pool.createdAt = BigInt.fromU64(timestamp);
    pool.lastUpdatedAt = BigInt.fromU64(timestamp);
    pool.save();
  }
  return pool;
}

function ensureGroupMember(groupId: string, memberId: string, timestamp: u64): GroupMember {
  const id = groupId + "-" + memberId;
  let member = GroupMember.load(id);
  if (!member) {
    member = new GroupMember(id);
    member.groupId = groupId;
    member.memberId = memberId;
    member.level = 0;
    member.nonce = BigInt.fromI32(1);
    member.isActive = true;
    member.isBlacklisted = false;
    member.joinedAt = BigInt.fromU64(timestamp);
    member.lastActiveAt = BigInt.fromU64(timestamp);
    member.group = groupId;
    member.save();
  }
  return member;
}

function updatePermissionAggregate(
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

  let permId = "";
  if (publicKey) {
    permId = granter + "-key-" + publicKey + "-" + path;
  } else if (grantee) {
    permId = granter + "-" + grantee + "-" + path;
  }

  if (permId == "") {
    return;
  }

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
  } else if (operation == "revoke" || operation == "revoke_key") {
    const perm = Permission.load(permId);
    if (perm) {
      perm.isActive = false;
      perm.revokedAt = BigInt.fromU64(timestamp);
      perm.save();
    }
  }
}
