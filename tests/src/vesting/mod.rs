// =============================================================================
// Vesting-OnSocial Integration Tests
// =============================================================================
// Modular integration test suite for the vesting-onsocial contract.
// Each sub-module covers a focused behavior slice.
//
// Run all:   make test-integration-contract-vesting-onsocial
// Run one:   make test-integration-contract-vesting-onsocial TEST=vesting::test_claim
// Verbose:   make test-integration-contract-vesting-onsocial VERBOSE=1

pub mod helpers;

#[cfg(test)]
pub mod test_claim;
#[cfg(test)]
pub mod test_views;