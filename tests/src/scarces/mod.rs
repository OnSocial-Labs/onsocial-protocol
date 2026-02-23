// =============================================================================
// Scarces-OnSocial Integration Tests
// =============================================================================
// Modular integration test suite for the scarces-onsocial NFT contract.
// Each sub-module covers a specific business domain.
//
// Run all:   make test-integration-contract-scarces-onsocial
// Run one:   make test-integration-contract-scarces-onsocial TEST=test_name
// Verbose:   make test-integration-contract-scarces-onsocial VERBOSE=1

pub mod helpers;

#[cfg(test)]
pub mod test_deploy_and_admin;
#[cfg(test)]
pub mod test_storage;
#[cfg(test)]
pub mod test_quick_mint;
#[cfg(test)]
pub mod test_collections;
#[cfg(test)]
pub mod test_native_sales;
#[cfg(test)]
pub mod test_auctions;
#[cfg(test)]
pub mod test_offers;
#[cfg(test)]
pub mod test_lazy_listings;

pub mod test_refunds;

pub mod test_revocation;

pub mod test_app_pools;
