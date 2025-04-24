use near_sdk::{AccountId, PublicKey, Gas, NearToken};
use near_sdk::json_types::U128;
use near_sdk::serde::{Serialize, Deserialize};
use near_sdk::borsh::{self, BorshSerialize, BorshDeserialize};
use near_sdk_macros::NearSchema;

#[derive(NearSchema, Serialize, Deserialize, Clone, BorshSerialize, BorshDeserialize)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub enum Action {
    ChainSignatureRequest {
        target_chain: String,
        derivation_path: String,
        payload: Vec<u8>,
    },
    FunctionCall {
        method_name: String,
        args: Vec<u8>,
        gas: Gas,
        deposit: NearToken,
    },
    Transfer {
        deposit: NearToken,
    },
    AddKey {
        public_key: PublicKey,
        allowance: Option<NearToken>,
        receiver_id: AccountId,
        method_names: Vec<String>,
    },
    FtTransfer {
        token: AccountId,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
    },
    BridgeTransfer {
        token: AccountId,
        amount: U128,
        destination_chain: String,
        recipient: String,
    },
}

#[derive(NearSchema, Serialize, Deserialize, Clone, BorshSerialize, BorshDeserialize)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct FtTransferArgs {
    pub token: AccountId,
    pub receiver_id: AccountId,
    pub amount: U128,
    pub memo: Option<String>,
}

#[derive(NearSchema, Serialize, Deserialize, Clone, BorshSerialize, BorshDeserialize)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct RequestChainSignatureArgs {
    pub token: AccountId,
    pub target_chain: String,
    pub derivation_path: String,
    pub payload: Vec<u8>,
}

#[derive(NearSchema, Serialize, Deserialize, Clone, BorshSerialize, BorshDeserialize)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct BridgeTransferArgs {
    pub token: AccountId,
    pub amount: U128,
    pub destination_chain: String,
    pub recipient: String,
}

#[derive(NearSchema, Serialize, Deserialize, Clone, BorshSerialize, BorshDeserialize)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct FinalizeTransferArgs {
    pub token: AccountId,
    pub recipient: AccountId,
    pub amount: U128,
    pub source_chain: String,
    pub is_native: bool,
    pub signature: Vec<u8>,
    pub message_payload: Vec<u8>,
}

#[derive(NearSchema, Serialize, Deserialize, Clone, BorshSerialize, BorshDeserialize)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct StorageBalance {
    pub total: U128,
    pub available: U128,
}

#[derive(NearSchema, Serialize, Deserialize, Clone, BorshSerialize, BorshDeserialize)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct StorageBalanceBounds {
    pub min: U128,
    pub max: Option<U128>,
}