# =============================================================================
# VARIABLES AND CONFIGURATION
# =============================================================================
# OnSocial Protocol - Variables and Configuration
# Centralized configuration for the entire build system

# Load environment variables based on NETWORK
ifeq ($(NETWORK),mainnet)
	-include .env.mainnet
else ifeq ($(NETWORK),testnet)
	-include .env.testnet
else
	-include .env
endif

# Core Configuration
NETWORK         ?= sandbox
AUTH_ACCOUNT    ?= test.near
FT_ACCOUNT      ?= test.near
RELAYER_ACCOUNT ?= test.near
NEAR_NODE_URL   ?= http://localhost:3030
NEAR_SANDBOX_PORT := 3030
VERBOSE         ?= 0
DRY_RUN         ?= 0

# Deployment security settings
KEY_FILE        ?= 
KEYS_DIR        ?= ./configs/keys

# Docker image names
JS_DOCKER_IMAGE := nodejs-builder
RS_DOCKER_IMAGE := relayer-builder
CONTRACTS_DOCKER_IMAGE := contracts-builder

# External Docker images (for version consistency and easy updates)
EXTERNAL_RUST_IMAGE := rust:1.86
EXTERNAL_NODE_IMAGE := node:slim
EXTERNAL_REDIS_IMAGE := redis:latest

# Project directories
CODE_DIR        := $(shell pwd)

# Contract/package lists - read from JSON config file with fallback
VALID_CONTRACTS := $(shell jq -r '.[].name' configs/contracts.json 2>/dev/null | tr '\n' ' ' | sed 's/ $$//' || echo "ft-wrapper-onsocial social-onsocial marketplace-onsocial staking-onsocial")
JS_PACKAGES     := onsocial-js onsocial-auth onsocial-app onsocial-backend
RS_PACKAGES     := relayer

# Cache and performance settings
CACHE_DIR := .make-cache
DOCKER_CACHE_DIR := $(CACHE_DIR)/docker
MAKEFLAGS += --no-print-directory

# =============================================================================
# EMOJI AND COLOR VARIABLES
# =============================================================================
# Centralized emoji and color constants for consistent output formatting

# Color variables for consistent terminal output
SUCCESS := ✅ \033[0;32m
ERROR := ❌ \033[0;31m
WARNING := ⚠️  \033[0;33m
INFO := ℹ️  \033[0;34m
RESET := \033[0m

# Emoji constants for consistent visual feedback
BUILD := 🔨
DOCKER := 🐳
PACKAGE := 📦
CLEAN := 🧹
LIGHTNING := ⚡
SEARCH := 🔍
TOOLS := 🔧
LIGHTBULB := 💡
ROCKET := 🚀
SPARKLES := ✨
CONSTRUCTION := 🏗️
FOLDER := 📁
CHART := 📊
FILE := 📄
