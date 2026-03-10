// =============================================================================
// Rewards-OnSocial Integration Tests
// =============================================================================
// Modular integration test suite for the rewards-onsocial contract.
// Each sub-module covers a specific business domain.
//
// Run all:   make test-integration-contract-rewards-onsocial
// Run one:   make test-integration-contract-rewards-onsocial TEST=test_name
// Verbose:   make test-integration-contract-rewards-onsocial VERBOSE=1

pub mod helpers;

#[cfg(test)]
pub mod test_claim;
#[cfg(test)]
pub mod test_claim_callback;
#[cfg(test)]
pub mod test_credit_reward;
#[cfg(test)]
pub mod test_daily_cap;
#[cfg(test)]
pub mod test_deploy_and_admin;
#[cfg(test)]
pub mod test_pool_deposit;
#[cfg(test)]
pub mod test_views;
