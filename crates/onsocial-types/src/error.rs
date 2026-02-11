/// Protocol-independent authentication error.
#[derive(Debug, Clone)]
pub enum AuthError {
    InvalidInput(String),
    Unauthorized(String, String),
    SignatureInvalid,
    NonceStale,
    PayloadExpired,
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidInput(msg) => write!(f, "invalid input: {msg}"),
            Self::Unauthorized(op, acc) => write!(f, "Unauthorized: {op} by {acc}"),
            Self::SignatureInvalid => write!(f, "invalid ed25519 signature"),
            Self::NonceStale => write!(f, "nonce too low"),
            Self::PayloadExpired => write!(f, "signed payload expired"),
        }
    }
}

impl std::error::Error for AuthError {}
