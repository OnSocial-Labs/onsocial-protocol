use near_sdk::json_types::U128;
use near_sdk::near;
use near_sdk::AccountId;

use super::AllowlistEntry;
use super::TransferItem;
use onsocial_auth::Auth;

#[near(serializers = [json])]
#[serde(tag = "type", rename_all = "snake_case")]
#[derive(Clone)]
pub enum Action {
    QuickMint {
        metadata: crate::TokenMetadata,
        #[serde(flatten)]
        options: crate::ScarceOptions,
    },
    TransferScarce {
        receiver_id: AccountId,
        token_id: String,
        memo: Option<String>,
    },
    BatchTransfer {
        transfers: Vec<TransferItem>,
    },
    ApproveScarce {
        token_id: String,
        account_id: AccountId,
        msg: Option<String>,
    },
    RevokeScarce {
        token_id: String,
        account_id: AccountId,
    },
    RevokeAllScarce {
        token_id: String,
    },
    BurnScarce {
        token_id: String,
        #[serde(default)]
        collection_id: Option<String>,
    },
    RenewToken {
        token_id: String,
        collection_id: String,
        new_expires_at: u64,
    },
    RevokeToken {
        token_id: String,
        collection_id: String,
        memo: Option<String>,
    },
    RedeemToken {
        token_id: String,
        collection_id: String,
    },
    ClaimRefund {
        token_id: String,
        collection_id: String,
    },

    CreateCollection {
        #[serde(flatten)]
        params: crate::CollectionConfig,
    },
    UpdateCollectionPrice {
        collection_id: String,
        new_price_near: U128,
    },
    UpdateCollectionTiming {
        collection_id: String,
        start_time: Option<u64>,
        end_time: Option<u64>,
    },
    MintFromCollection {
        collection_id: String,
        quantity: u32,
        receiver_id: Option<AccountId>,
    },
    AirdropFromCollection {
        collection_id: String,
        receivers: Vec<AccountId>,
    },
    DeleteCollection {
        collection_id: String,
    },
    PauseCollection {
        collection_id: String,
    },
    ResumeCollection {
        collection_id: String,
    },
    SetAllowlist {
        collection_id: String,
        entries: Vec<AllowlistEntry>,
    },
    RemoveFromAllowlist {
        collection_id: String,
        accounts: Vec<AccountId>,
    },
    SetCollectionMetadata {
        collection_id: String,
        metadata: Option<String>,
    },
    SetCollectionAppMetadata {
        app_id: AccountId,
        collection_id: String,
        metadata: Option<String>,
    },
    WithdrawUnclaimedRefunds {
        collection_id: String,
    },

    ListNativeScarce {
        token_id: String,
        price: U128,
        expires_at: Option<u64>,
    },
    DelistNativeScarce {
        token_id: String,
    },
    ListNativeScarceAuction {
        token_id: String,
        #[serde(flatten)]
        params: crate::AuctionListing,
    },
    SettleAuction {
        token_id: String,
    },
    CancelAuction {
        token_id: String,
    },
    DelistScarce {
        scarce_contract_id: AccountId,
        token_id: String,
    },
    UpdatePrice {
        scarce_contract_id: AccountId,
        token_id: String,
        price: U128,
    },

    AcceptOffer {
        token_id: String,
        buyer_id: AccountId,
    },
    CancelOffer {
        token_id: String,
    },
    AcceptCollectionOffer {
        collection_id: String,
        token_id: String,
        buyer_id: AccountId,
    },
    CancelCollectionOffer {
        collection_id: String,
    },

    CreateLazyListing {
        #[serde(flatten)]
        params: crate::LazyListing,
    },
    CancelLazyListing {
        listing_id: String,
    },
    UpdateLazyListingPrice {
        listing_id: String,
        new_price: U128,
    },
    UpdateLazyListingExpiry {
        listing_id: String,
        new_expires_at: Option<u64>,
    },

    PurchaseFromCollection {
        collection_id: String,
        quantity: u32,
        max_price_per_token: U128,
    },
    PurchaseLazyListing {
        listing_id: String,
    },
    PurchaseNativeScarce {
        token_id: String,
    },
    PlaceBid {
        token_id: String,
        amount: U128,
    },
    MakeOffer {
        token_id: String,
        amount: U128,
        expires_at: Option<u64>,
    },
    MakeCollectionOffer {
        collection_id: String,
        amount: U128,
        expires_at: Option<u64>,
    },
    CancelCollection {
        collection_id: String,
        refund_per_token: U128,
        refund_deadline_ns: Option<u64>,
    },
    FundAppPool {
        app_id: AccountId,
    },
    StorageDeposit {
        account_id: Option<AccountId>,
    },
    RegisterApp {
        app_id: AccountId,
        #[serde(flatten)]
        params: crate::AppConfig,
    },

    SetSpendingCap {
        cap: Option<U128>,
    },
    StorageWithdraw,
    WithdrawAppPool {
        app_id: AccountId,
        amount: U128,
    },
    WithdrawPlatformStorage {
        amount: U128,
    },

    SetAppConfig {
        app_id: AccountId,
        #[serde(flatten)]
        params: crate::AppConfig,
    },
    TransferAppOwnership {
        app_id: AccountId,
        new_owner: AccountId,
    },
    AddModerator {
        app_id: AccountId,
        account_id: AccountId,
    },
    RemoveModerator {
        app_id: AccountId,
        account_id: AccountId,
    },
    BanCollection {
        app_id: AccountId,
        collection_id: String,
        reason: Option<String>,
    },
    UnbanCollection {
        app_id: AccountId,
        collection_id: String,
    },
}

impl Action {
    /// Security boundary for Direct auth: require 1 yoctoNEAR unless the action already enforces payment semantics.
    /// New variants default to requiring confirmation unless explicitly exempted here.
    pub fn requires_confirmation(&self) -> bool {
        !matches!(
            self,
            Self::PurchaseFromCollection { .. }
            | Self::PurchaseLazyListing { .. }
            | Self::PurchaseNativeScarce { .. }
            | Self::PlaceBid { .. }
            | Self::MakeOffer { .. }
            | Self::MakeCollectionOffer { .. }
            | Self::CancelCollection { .. }
            | Self::FundAppPool { .. }
            | Self::StorageDeposit { .. }
            | Self::RegisterApp { .. }
            | Self::QuickMint { .. }
            | Self::CreateCollection { .. }
            | Self::MintFromCollection { .. }
            | Self::AirdropFromCollection { .. }
            | Self::ListNativeScarce { .. }
            | Self::ListNativeScarceAuction { .. }
            | Self::CreateLazyListing { .. }
            | Self::SettleAuction { .. }
        )
    }

    /// Relayer funding rule: only purchase/bid/offer actions may draw from prepaid balance with zero attached deposit.
    pub fn uses_prepaid_balance(&self) -> bool {
        matches!(
            self,
            Self::PurchaseFromCollection { .. }
            | Self::PurchaseLazyListing { .. }
            | Self::PurchaseNativeScarce { .. }
            | Self::PlaceBid { .. }
            | Self::MakeOffer { .. }
            | Self::MakeCollectionOffer { .. }
        )
    }
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct Request {
    pub target_account: Option<AccountId>,
    pub action: Action,
    pub auth: Option<Auth>,
    pub options: Option<Options>,
}

#[near(serializers = [json])]
#[derive(Default, Clone)]
pub struct Options {
    #[serde(default)]
    pub refund_unused_deposit: bool,
}
