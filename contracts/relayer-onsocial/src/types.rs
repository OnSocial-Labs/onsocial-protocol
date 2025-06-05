//! Types module: Declares core data structures for the relayer contract.
//!
//! - Defines DelegateAction and SignedDelegateAction for transaction sponsorship.
//! - Supports all NEAR actions (FunctionCall, Transfer, AddKey, CreateAccount, Stake).
//! - Provides AccessKey struct and Action enum with type_name helper.
//! - Utilizes NEAR SDK traits for serialization and deserialization.

use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::{AccountId, Gas, PublicKey};
use near_sdk_macros::NearSchema;
use serde::{Deserialize, Serialize};

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, NearSchema)]
#[serde(crate = "near_sdk::serde")]
pub struct DelegateAction {
    pub nonce: u64,
    pub max_block_height: u64,
    pub sender_id: AccountId,
    pub actions: Vec<Action>,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, NearSchema)]
#[serde(crate = "near_sdk::serde")]
pub struct SignedDelegateAction {
    pub delegate_action: DelegateAction,
    pub public_key: PublicKey,
    pub signature: Vec<u8>,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, NearSchema)]
#[serde(crate = "near_sdk::serde")]
#[serde(tag = "type")]
pub enum Action {
    FunctionCall {
        receiver_id: AccountId,
        method_name: String,
        args: Vec<u8>,
        deposit: U128,
        gas: Gas,
    },
    Transfer {
        receiver_id: AccountId,
        deposit: U128,
        gas: Gas,
    },
    AddKey {
        receiver_id: AccountId,
        public_key: PublicKey,
        access_key: AccessKey,
        gas: Gas,
    },
    CreateAccount {
        receiver_id: AccountId,
        deposit: U128,
        gas: Gas,
    },
    Stake {
        receiver_id: AccountId,
        stake: U128,
        public_key: PublicKey,
        gas: Gas,
    },
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, NearSchema)]
#[serde(crate = "near_sdk::serde")]
pub struct AccessKey {
    pub allowance: Option<U128>,
    pub method_names: Vec<String>,
}

impl Action {
    pub fn type_name(&self) -> &'static str {
        match self {
            Action::FunctionCall { .. } => "FunctionCall",
            Action::Transfer { .. } => "Transfer",
            Action::AddKey { .. } => "AddKey",
            Action::CreateAccount { .. } => "CreateAccount",
            Action::Stake { .. } => "Stake",
        }
    }
}
