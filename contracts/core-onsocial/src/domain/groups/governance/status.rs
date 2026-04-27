use crate::SocialError;
use crate::invalid_input;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ProposalStatus {
    Active,
    Executed,
    /// Vote passed but action could not be applied (e.g., user blacklisted after proposal created)
    ExecutedSkipped,
    Rejected,
    Cancelled,
    /// Voting period elapsed without reaching quorum or inevitable defeat. Bond is released.
    Expired,
}

impl ProposalStatus {
    pub(super) const fn as_str(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Executed => "executed",
            Self::ExecutedSkipped => "executed_skipped",
            Self::Rejected => "rejected",
            Self::Cancelled => "cancelled",
            Self::Expired => "expired",
        }
    }

    pub(super) fn parse(s: &str) -> Option<Self> {
        match s {
            "active" => Some(Self::Active),
            "executed" => Some(Self::Executed),
            "executed_skipped" => Some(Self::ExecutedSkipped),
            "rejected" => Some(Self::Rejected),
            "cancelled" => Some(Self::Cancelled),
            "expired" => Some(Self::Expired),
            _ => None,
        }
    }

    pub(super) fn from_json_status(status: Option<&str>) -> Result<Self, SocialError> {
        let status = status.ok_or_else(|| invalid_input!("Proposal missing status"))?;
        Self::parse(status).ok_or_else(|| invalid_input!("Invalid proposal status"))
    }
}
