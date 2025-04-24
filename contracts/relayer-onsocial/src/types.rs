use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::{AccountId, Gas, NearToken, PublicKey};
use near_sdk::json_types::U128;
use serde::{Serialize, Deserialize};
use near_sdk_macros::NearSchema;

#[derive(Clone, Eq, PartialEq, BorshSerialize, BorshDeserialize, Serialize, Deserialize, NearSchema)]
#[abi(borsh, json)]
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
        token: String,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
    },
    BridgeTransfer {
        token: String,
        amount: U128,
        destination_chain: String,
        recipient: String,
    },
}

impl Action {
    pub fn type_name(&self) -> &str {
        match self {
            Action::ChainSignatureRequest { .. } => "ChainSignatureRequest",
            Action::FunctionCall { .. } => "FunctionCall",
            Action::Transfer { .. } => "Transfer",
            Action::AddKey { .. } => "AddKey",
            Action::FtTransfer { .. } => "FtTransfer",
            Action::BridgeTransfer { .. } => "BridgeTransfer",
        }
    }
}

#[derive(Clone, Eq, PartialEq, BorshSerialize, BorshDeserialize, Serialize, Deserialize, NearSchema)]
#[abi(borsh, json)]
pub struct DelegateAction {
    pub sender_id: AccountId,
    pub receiver_id: AccountId,
    pub actions: Vec<Action>,
    pub nonce: u64,
    pub max_block_height: u64,
}

#[derive(Clone, Eq, PartialEq, BorshSerialize, BorshDeserialize, Serialize, Deserialize, NearSchema)]
#[abi(borsh, json)]
pub enum SignatureScheme {
    Ed25519,
}

#[derive(Clone, Eq, PartialEq, BorshSerialize, BorshDeserialize, Serialize, Deserialize, NearSchema)]
#[abi(borsh, json)]
pub struct SignedDelegateAction {
    pub delegate_action: DelegateAction,
    pub signature: Vec<u8>,
    pub public_key: PublicKey,
    pub session_nonce: u64,
    pub scheme: SignatureScheme,
    pub fee_action: Option<Action>,
    pub multi_signatures: Option<Vec<Vec<u8>>>, // Added for multi-sig support
}
