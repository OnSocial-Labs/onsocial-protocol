use crate::invalid_input;
use crate::SocialError;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ProposalStatus {
    Active,
    Executed,
    Rejected,
    Cancelled,
}

impl ProposalStatus {
    pub(super) const fn as_str(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Executed => "executed",
            Self::Rejected => "rejected",
            Self::Cancelled => "cancelled",
        }
    }

    pub(super) fn parse(s: &str) -> Option<Self> {
        match s {
            "active" => Some(Self::Active),
            "executed" => Some(Self::Executed),
            "rejected" => Some(Self::Rejected),
            "cancelled" => Some(Self::Cancelled),
            _ => None,
        }
    }

    pub(super) fn from_json_status(status: Option<&str>) -> Result<Self, SocialError> {
        let status = status.ok_or_else(|| invalid_input!("Proposal missing status"))?;
        Self::parse(status).ok_or_else(|| invalid_input!("Invalid proposal status"))
    }
}
