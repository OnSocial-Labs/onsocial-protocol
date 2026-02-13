//! Signer abstraction: local `InMemory` or GCP KMS.
//!
//! Since `near_crypto::Signer` is a closed enum, each variant
//! implements `sign_transaction()` directly.

use near_crypto::PublicKey;
use near_primitives::hash::CryptoHash;
use near_primitives::transaction::{Action, SignedTransaction, Transaction, TransactionV0};
use near_primitives::types::{AccountId, Nonce};

/// Signing backend for the relayer.
pub enum RelayerSigner {
    Local {
        signer: near_crypto::Signer,
    },

    /// Private key never leaves HSM (~20-50ms per sign).
    #[cfg(feature = "gcp")]
    Kms {
        key_ref: crate::kms::KmsKeyRef,
        client: std::sync::Arc<crate::kms::KmsClient>,
    },
}

impl RelayerSigner {
    pub fn public_key(&self) -> PublicKey {
        match self {
            Self::Local { signer } => signer.public_key(),
            #[cfg(feature = "gcp")]
            Self::Kms { key_ref, .. } => key_ref.public_key.clone(),
        }
    }

    pub fn account_id(&self) -> AccountId {
        match self {
            Self::Local { signer } => signer.get_account_id().clone(),
            #[cfg(feature = "gcp")]
            Self::Kms { key_ref, .. } => key_ref.account_id.clone(),
        }
    }

    /// Sign a NEAR transaction. Local: synchronous (~1μs). KMS: async HTTPS (~20-50ms).
    pub async fn sign_transaction(
        &self,
        nonce: Nonce,
        receiver_id: &AccountId,
        block_hash: CryptoHash,
        actions: Vec<Action>,
    ) -> Result<SignedTransaction, crate::Error> {
        match self {
            Self::Local { signer } => {
                let signed_tx = Transaction::V0(TransactionV0 {
                    signer_id: signer.get_account_id().clone(),
                    public_key: signer.public_key(),
                    nonce,
                    receiver_id: receiver_id.clone(),
                    block_hash,
                    actions,
                })
                .sign(signer);
                Ok(signed_tx)
            }

            #[cfg(feature = "gcp")]
            Self::Kms { key_ref, client } => {
                client
                    .sign_transaction(key_ref, nonce, receiver_id, block_hash, actions)
                    .await
            }
        }
    }

    /// Access inner `near_crypto::Signer` (Local only). Used for key persistence.
    pub fn as_local_signer(&self) -> Option<&near_crypto::Signer> {
        match self {
            Self::Local { signer } => Some(signer),
            #[cfg(feature = "gcp")]
            Self::Kms { .. } => None,
        }
    }
}

impl std::fmt::Debug for RelayerSigner {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Local { signer } => {
                write!(f, "RelayerSigner::Local({})", signer.public_key())
            }
            #[cfg(feature = "gcp")]
            Self::Kms { key_ref, .. } => {
                write!(f, "RelayerSigner::Kms({})", key_ref.public_key)
            }
        }
    }
}
