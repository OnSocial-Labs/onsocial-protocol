// Member Management Test Modules
// Organized by functionality for better maintainability

// Core functionality tests (moved from existing member_test.rs)
pub mod blacklist;
pub mod core_operations; // Basic add/remove/leave operations
pub mod join_requests; // Join request workflows, approvals, rejections
pub mod permissions; // Permission granting, path-specific permissions // Blacklist/unblacklist operations

// New test categories for comprehensive coverage
pub mod data_lifecycle; // Member data persistence, updates, metadata management
pub mod edge_cases; // Storage, concurrency, error recovery
pub mod performance; // Large-scale operations, gas limits
pub mod security; // Permission escalation, security boundaries
pub mod self_join_permissions;
pub mod storage_flows; // Storage payment attribution - WHO pays for WHAT // Self-join permission restrictions for public groups
