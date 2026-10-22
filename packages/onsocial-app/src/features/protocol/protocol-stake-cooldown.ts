import { viewNearContractState } from '@/lib/app-near-rpc';

/**
 * Sputnik staking `STATE`: owner, token, pause bytes, 16 reserved bytes,
 * then `unstake_period` as a little-endian u64 (nanoseconds).
 */
export function decodeStakingUnstakePeriodNs(bytes: Uint8Array): string | null {
  try {
    let offset = 0;
    offset = readBorshString(bytes, offset).offset;
    offset = readBorshString(bytes, offset).offset;
    offset = readBorshBytes(bytes, offset).offset;
    offset += 16;
    return readU64LE(bytes, offset).toString();
  } catch {
    return null;
  }
}

export async function getStakingCooldownDurationNs(
  stakingContractId: string
): Promise<string | null> {
  const id = stakingContractId.trim();
  if (!id) return null;
  try {
    const state = await viewNearContractState(id, 'STATE');
    const entry = state.find((item) => decodeBase64Ascii(item.key) === 'STATE');
    if (!entry) return null;
    return decodeStakingUnstakePeriodNs(decodeBase64Bytes(entry.value));
  } catch {
    return null;
  }
}

function decodeBase64Ascii(value: string): string {
  return atob(value);
}

function decodeBase64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) {
    throw new Error('borsh u32 out of range');
  }
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  ).getUint32(offset, true);
}

function readBorshString(
  bytes: Uint8Array,
  offset: number
): { value: string; offset: number } {
  const length = readU32LE(bytes, offset);
  const start = offset + 4;
  const end = start + length;
  if (end > bytes.length) throw new Error('borsh string out of range');
  return {
    value: new TextDecoder().decode(bytes.slice(start, end)),
    offset: end,
  };
}

function readBorshBytes(
  bytes: Uint8Array,
  offset: number
): { value: Uint8Array; offset: number } {
  const length = readU32LE(bytes, offset);
  const start = offset + 4;
  const end = start + length;
  if (end > bytes.length) throw new Error('borsh bytes out of range');
  return {
    value: bytes.slice(start, end),
    offset: end,
  };
}

function readU64LE(bytes: Uint8Array, offset: number): bigint {
  if (offset + 8 > bytes.length) {
    throw new Error('borsh u64 out of range');
  }
  let value = 0n;
  for (let index = 0; index < 8; index += 1) {
    value += BigInt(bytes[offset + index] ?? 0) << BigInt(index * 8);
  }
  return value;
}
