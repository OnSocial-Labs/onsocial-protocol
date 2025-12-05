// --- Imports ---
use near_sdk::AccountId;
use std::str;

use crate::errors::*;
use crate::invalid_input;
use crate::state::SocialPlatform;

// --- Thread-local ---
// Removed thread_local cache - now using per-transaction cache

// --- Structs ---

/// Represents a normalized path for account data, with parts.
#[derive(Clone)]
pub struct Path {
    full_path: String,
    parts: Vec<String>,
}

// --- Impl ---

impl Path {
    /// Constructs a new Path, validating and normalizing input.
    /// This is the single source of truth for path validation.
    pub fn new(
        account_id: &AccountId,
        path: &str,
        platform: &SocialPlatform,
    ) -> Result<Self, SocialError> {
        // Basic path validation
        if path.is_empty() || path.len() > platform.config.max_key_length as usize {
            return Err(invalid_input!(ERR_INVALID_PATH_LENGTH));
        }

        // Prevent path traversal attacks
        if path.contains("..") || path.contains("\\") {
            return Err(invalid_input!(ERR_INVALID_PATH_FORMAT));
        }

        // Character whitelist validation - allow only safe characters
        for &byte in path.as_bytes() {
            match byte {
                b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'_' | b'.' | b'-' | b'/' => {}
                _ => return Err(invalid_input!(ERR_INVALID_PATH_FORMAT)),
            }
        }

        // Optimized path construction: avoid unnecessary allocations
        let full_path = if path.starts_with("groups/") ||
            (path.starts_with(account_id.as_str()) && path.as_bytes().get(account_id.len()) == Some(&b'/')) {
            path.to_string()
        } else {
            format!("{}/{}", account_id, path)
        };

        // Split path into parts for metadata/tags
        let parts: Vec<String> = full_path.split('/').map(|s| s.to_string()).collect();

        // Check path depth limit (gas-light safety check)
        if parts.len() > platform.config.max_path_depth as usize {
            return Err(invalid_input!(ERR_INVALID_PATH_DEPTH));
        }

        Ok(Self {
            full_path,
            parts,
        })
    }

    pub fn full_path(&self) -> &str {
        &self.full_path
    }

    pub fn parts(&self) -> &[String] {
        &self.parts
    }
}

// --- Public API ---

// --- Utilities ---
