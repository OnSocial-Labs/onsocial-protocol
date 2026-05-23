"""Minimal NEP-366 SignedDelegateAction encoder for test-core (Python).

Mirrors packages/onsocial-sdk/src/advanced/nep366.ts. Uses pynacl for ed25519
and hand-rolled borsh — no near-api-py dependency.
"""

from __future__ import annotations

import base64
import hashlib
import struct
from typing import Iterable

import base58
import nacl.signing


# ---------------------------------------------------------------------------
# Borsh primitives
# ---------------------------------------------------------------------------
def _u8(n: int) -> bytes:
    return struct.pack("<B", n & 0xFF)


def _u32(n: int) -> bytes:
    return struct.pack("<I", n & 0xFFFFFFFF)


def _u64(n: int) -> bytes:
    if n < 0:
        raise ValueError("u64 cannot be negative")
    return struct.pack("<Q", n)


def _u128(n: int) -> bytes:
    if n < 0:
        raise ValueError("u128 cannot be negative")
    lo = n & 0xFFFFFFFFFFFFFFFF
    hi = n >> 64
    return struct.pack("<QQ", lo, hi)


def _string(s: str) -> bytes:
    b = s.encode()
    return _u32(len(b)) + b


def _bytes(b: bytes) -> bytes:
    return _u32(len(b)) + b


# ---------------------------------------------------------------------------
# Public-key handling
# ---------------------------------------------------------------------------
def parse_ed25519_public_key(key: str) -> bytes:
    if ":" not in key:
        raise ValueError(f"public key missing curve prefix: {key}")
    curve, b58 = key.split(":", 1)
    if curve != "ed25519":
        raise ValueError(f"only ed25519 supported (got {curve})")
    raw = base58.b58decode(b58)
    if len(raw) != 32:
        raise ValueError(f"ed25519 key must be 32 bytes (got {len(raw)})")
    return raw


def _encode_ed25519_pubkey(raw32: bytes) -> bytes:
    return _u8(0x00) + raw32


# ---------------------------------------------------------------------------
# Action encoding (only FunctionCall is needed for test-core)
# ---------------------------------------------------------------------------
def encode_function_call(
    method_name: str,
    args_json: str,
    gas: int,
    deposit: int,
) -> bytes:
    return (
        _u8(2)  # FunctionCall variant
        + _string(method_name)
        + _bytes(args_json.encode())
        + _u64(gas)
        + _u128(deposit)
    )


def _encode_actions(actions: Iterable[bytes]) -> bytes:
    actions = list(actions)
    return _u32(len(actions)) + b"".join(actions)


# ---------------------------------------------------------------------------
# DelegateAction + SignedDelegateAction
# ---------------------------------------------------------------------------
def _encode_delegate_action(
    sender_id: str,
    receiver_id: str,
    actions: Iterable[bytes],
    nonce: int,
    max_block_height: int,
    public_key_raw32: bytes,
) -> bytes:
    return (
        _string(sender_id)
        + _string(receiver_id)
        + _encode_actions(actions)
        + _u64(nonce)
        + _u64(max_block_height)
        + _encode_ed25519_pubkey(public_key_raw32)
    )


_NEP_366_DISCRIMINANT = (1 << 30) + 366


def build_signed_delegate(
    sender_id: str,
    receiver_id: str,
    actions: Iterable[bytes],
    nonce: int,
    max_block_height: int,
    signing_key: nacl.signing.SigningKey,
    public_key_str: str,
) -> str:
    pub_raw = parse_ed25519_public_key(public_key_str)
    delegate_bytes = _encode_delegate_action(
        sender_id=sender_id,
        receiver_id=receiver_id,
        actions=actions,
        nonce=nonce,
        max_block_height=max_block_height,
        public_key_raw32=pub_raw,
    )

    signable = _u32(_NEP_366_DISCRIMINANT) + delegate_bytes
    digest = hashlib.sha256(signable).digest()
    signature = signing_key.sign(digest).signature
    if len(signature) != 64:
        raise RuntimeError(f"signature must be 64 bytes (got {len(signature)})")

    signed = delegate_bytes + _u8(0x00) + signature  # 0 = ED25519 signature variant
    return base64.b64encode(signed).decode()
