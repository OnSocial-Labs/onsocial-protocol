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

.PHONY: check-substreams
check-substreams: check-substreams-sql
	@$(call log_success,Substreams checks passed)