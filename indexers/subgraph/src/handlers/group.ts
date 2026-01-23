/**
 * GROUP_UPDATE event handler
 * Processes group membership, proposals, voting, and configuration changes
 */

import { near, JSONValue, JSONValueKind, BigInt, TypedMap } from "@graphprotocol/graph-ts";
import { GroupUpdate, Proposal, GroupMember } from "../../generated/schema";
import { jsonToString, getString, getStringOrNull, getInt, getBigInt, getBool, extractGroupIdFromPath } from "../utils";
import { ensureAccount, ensureGroup, ensureGroupMember } from "../entities";

export function handleGroupUpdate(
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
  entity.participationQuorum = getInt(obj, "participation_quorum_bps");
  entity.majorityThreshold = getInt(obj, "majority_threshold_bps");
  entity.effectiveVotingPeriod = getBigInt(obj, "effective_voting_period");
  entity.effectiveParticipationQuorum = getInt(obj, "effective_participation_quorum_bps");
  entity.effectiveMajorityThreshold = getInt(obj, "effective_majority_threshold_bps");

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

    if (operation == "add_member" || operation == "join_request_approved") {
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
    } else if (operation == "member_invited") {
      // Member invited via governance proposal - increment count and create member
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
    } else if (operation == "group_updated") {
      // Governance-executed group config update - isPrivate may change
      const isPrivateField = obj.get("is_private");
      if (isPrivateField && !isPrivateField.isNull()) {
        group.isPrivate = isPrivateField.toBool();
      }
    } else if (operation == "permission_changed") {
      // Member permission level changed via governance
      const mid = entity.memberId;
      if (mid) {
        const memberId = groupId + "-" + mid;
        const member = GroupMember.load(memberId);
        if (member) {
          const lvl = entity.level;
          if (lvl != 0) {
            member.level = lvl;
          }
          member.lastActiveAt = BigInt.fromU64(timestamp);
          member.save();
        }
      }
    } else if (operation == "group_pool_created") {
      // Pool created - balance tracking handled by group_pool_deposit
      group.hasPool = true;
    } else if (operation == "group_sponsor_quota_set" || operation == "group_sponsor_default_set") {
      // Sponsor config changed - track that group has sponsorship configured
      const enabled = getBool(obj, "enabled");
      if (enabled) {
        group.hasSponsorConfig = true;
      }
    }
    // Note: stats_updated, member_nonce_updated, path_permission_granted,
    // path_permission_revoked, custom_proposal_executed are tracked in the
    // immutable GroupUpdate entity but don't require aggregate updates

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
          if (s == "executed") {
            proposal.executedAt = entity.updatedAt ? entity.updatedAt : BigInt.fromU64(timestamp);
          }
        }
        proposal.yesVotes = entity.finalYesVotes;
        proposal.noVotes = entity.finalNoVotes;
        proposal.totalVotes = entity.finalTotalVotes;
        proposal.updatedAt = BigInt.fromU64(timestamp);
        proposal.save();
      }
    }
  }

  entity.save();
}
