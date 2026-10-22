# =============================================================================
# CHAIN INDEX TARGETS
# =============================================================================
# Schema, decoder, and golden-fixture checks for indexers/chain-index.
# The check-substreams-* names still run the same checks.

.PHONY: check-indexer-sql check-substreams-sql
check-indexer-sql check-substreams-sql:
	@$(call log_start,Validating indexer SQL)
	@bash indexers/chain-index/scripts/validate_sql.sh
	@$(call log_success,Indexer SQL validation passed)

.PHONY: check-indexer-rust check-substreams-rust
check-indexer-rust check-substreams-rust:
	@$(call log_start,Running indexer Rust tests)
	@cd indexers/chain-index && cargo test
	@$(call log_success,Indexer Rust tests passed)

.PHONY: check-indexer-events check-substreams-events
check-indexer-events check-substreams-events:
	@$(call log_start,Validating indexer event manifest)
	@python3 indexers/chain-index/scripts/check_event_manifest.py
	@$(call log_success,Indexer event manifest validation passed)

.PHONY: check-indexer-schema check-substreams-schema
check-indexer-schema check-substreams-schema:
	@$(call log_start,Validating indexer schema parity)
	@python3 indexers/chain-index/scripts/check_db_schema_parity.py
	@$(call log_success,Indexer schema parity validation passed)

.PHONY: check-indexer check-substreams
check-indexer check-substreams: check-indexer-events check-indexer-schema check-indexer-rust check-indexer-sql
	@$(call log_success,Indexer checks passed)
