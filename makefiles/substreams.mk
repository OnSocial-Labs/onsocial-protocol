# =============================================================================
# SUBSTREAMS TARGETS
# =============================================================================
# OnSocial Protocol - Substreams schema validation helpers
#
# Note: This file should only be included from the main Makefile.
# Variables and functions are provided by variables.mk and docker.mk.

.PHONY: check-substreams-sql
check-substreams-sql:
	@$(call log_start,Validating Substreams SQL)
	@bash indexers/substreams/scripts/validate_sql.sh
	@$(call log_success,Substreams SQL validation passed)

.PHONY: check-substreams-rust
check-substreams-rust:
	@$(call log_start,Running Substreams Rust tests)
	@cd indexers/substreams && cargo test
	@$(call log_success,Substreams Rust tests passed)

.PHONY: check-substreams-events
check-substreams-events:
	@$(call log_start,Validating Substreams event manifest)
	@python3 indexers/substreams/scripts/check_event_manifest.py
	@$(call log_success,Substreams event manifest validation passed)

.PHONY: check-substreams-schema
check-substreams-schema:
	@$(call log_start,Validating Substreams DB schema parity)
	@python3 indexers/substreams/scripts/check_db_schema_parity.py
	@$(call log_success,Substreams DB schema parity validation passed)

.PHONY: check-substreams
check-substreams: check-substreams-events check-substreams-schema check-substreams-rust check-substreams-sql
	@$(call log_success,Substreams checks passed)
