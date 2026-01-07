use near_primitives::action::delegate::SignedDelegateAction;
use near_primitives::borsh::BorshDeserialize;

#[derive(Debug, Clone, serde::Deserialize)]
pub struct RelayInputArgs {
    pub signed_delegate_action: SignedDelegateActionAsBase64,
}

#[derive(Debug, Clone)]
pub struct SignedDelegateActionAsBase64 {
    inner: SignedDelegateAction,
}

impl std::str::FromStr for SignedDelegateActionAsBase64 {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self {
            inner: SignedDelegateAction::try_from_slice(
                &near_primitives::serialize::from_base64(s)
                .map_err(|err| format!("parsing of signed delegate action failed due to base64 sequence being invalid: {}", err))?,
            )
            .map_err(|err| format!("delegate action could not be deserialized from borsh: {}", err))?,
        })
    }
}

impl From<SignedDelegateActionAsBase64> for SignedDelegateAction {
    fn from(inner: SignedDelegateActionAsBase64) -> Self {
        inner.inner
    }
}

impl From<SignedDelegateAction> for SignedDelegateActionAsBase64 {
    fn from(inner: SignedDelegateAction) -> Self {
        Self { inner }
    }
}

impl<'de> serde::Deserialize<'de> for SignedDelegateActionAsBase64 {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let signed_delegate_action_as_base64 =
            <String as serde::Deserialize>::deserialize(deserializer)?;
        signed_delegate_action_as_base64
            .parse()
            .map_err(serde::de::Error::custom)
    }
}
