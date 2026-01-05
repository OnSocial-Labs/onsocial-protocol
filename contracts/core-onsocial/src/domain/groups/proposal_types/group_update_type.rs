#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum GroupUpdateType {
    Permissions,
    Metadata,
    RemoveMember,
    Ban,
    Unban,
    TransferOwnership,
}

impl GroupUpdateType {
    pub(super) const fn as_str(self) -> &'static str {
        match self {
            Self::Permissions => "permissions",
            Self::Metadata => "metadata",
            Self::RemoveMember => "remove_member",
            Self::Ban => "ban",
            Self::Unban => "unban",
            Self::TransferOwnership => "transfer_ownership",
        }
    }

    pub(super) fn parse(s: &str) -> Option<Self> {
        match s {
            "permissions" => Some(Self::Permissions),
            "metadata" => Some(Self::Metadata),
            "remove_member" => Some(Self::RemoveMember),
            "ban" => Some(Self::Ban),
            "unban" => Some(Self::Unban),
            "transfer_ownership" => Some(Self::TransferOwnership),
            _ => None,
        }
    }
}
