#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum AddMemberAuth {
    Normal,
    BypassPermissions,
    AlreadyAuthorized,
}
