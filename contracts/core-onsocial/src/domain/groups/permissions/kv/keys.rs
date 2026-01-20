pub(crate) fn build_permission_key(owner_or_group_id: &str, grantee: &str, path: &str) -> String {
    // Account-scoped keys; do not use for group paths.
    if path.contains('/') {
        let subpath = path
            .strip_prefix(&format!("{}/", owner_or_group_id))
            .unwrap_or(path);
        format!("{}/permissions/{}/{}", owner_or_group_id, grantee, subpath)
    } else {
        format!("{}/permissions/{}", owner_or_group_id, grantee)
    }
}

#[inline]
pub(crate) fn build_group_permission_key(
    group_id: &str,
    grantee: &str,
    path: &str,
    nonce: u64,
) -> String {
    assert!(nonce > 0, "group permission nonce must be > 0");

    // Supports `groups/{id}/...` and `{user}/groups/{id}/...`.
    let needle = format!("groups/{}/", group_id);
    let subpath = path
        .find(&needle)
        .map(|idx| &path[(idx + needle.len())..])
        .unwrap_or("");

    if subpath.is_empty() {
        format!("groups/{}/permissions/{}/n{}", group_id, grantee, nonce)
    } else {
        format!(
            "groups/{}/permissions/{}/n{}/{}",
            group_id, grantee, nonce, subpath
        )
    }
}
