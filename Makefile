SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
DEPS_SCRIPT := $(ROOT_DIR)/scripts/deps.sh

HDL_DEV_GHDL_TAG ?= v6.0.0
HDL_DEV_GHDL_BASE ?= $(ROOT_DIR)/.cache/hdl-dev-ghdl
HDL_DEV_GHDL_BOOTSTRAP_MODE ?= binary
GHDL_TOOLCHAIN_ROOT ?= $(HDL_DEV_GHDL_BASE)/installs/$(HDL_DEV_GHDL_TAG)
PYTHON ?= python3
MKDOCS ?= mkdocs
DOCS_SITE_DIR ?= site

export HDL_DEV_GHDL_TAG
export HDL_DEV_GHDL_BASE
export HDL_DEV_GHDL_BOOTSTRAP_MODE
export GHDL_TOOLCHAIN_ROOT
export PATH := $(GHDL_TOOLCHAIN_ROOT)/bin:$(PATH)

AWK ?= awk

define print_help_comments
$(AWK) 'BEGIN { \
	FS = ":.*##@[[:space:]]*"; \
	use_color = (ENVIRON["NO_COLOR"] == "" && ENVIRON["TERM"] != "dumb"); \
	section_color = use_color ? "\033[1;36m" : ""; \
	target_color = use_color ? "\033[1;34m" : ""; \
	reset_color = use_color ? "\033[0m" : ""; \
} \
/^##@[[:space:]]*/ { \
	text = $$0; \
	sub(/^##@[[:space:]]*/, "", text); \
	if (text != "") \
		printf "\n%s%s:%s\n", section_color, text, reset_color; \
	next; \
} \
/^[A-Za-z0-9][A-Za-z0-9_.-]*:.*##@/ { \
	printf "  %s%-34s%s %s\n", target_color, $$1, reset_color, $$2; \
}' $(MAKEFILE_LIST)
endef

.PHONY: help
help: ##@ Show available targets.
	@$(print_help_comments)

##@ Dependencies
.PHONY: deps-list
deps-list: ##@ List dependency profiles.
	"$(DEPS_SCRIPT)" list

.PHONY: deps-check-ghdl
deps-check-ghdl: ##@ Check local GHDL and ghwdump.
	"$(DEPS_SCRIPT)" check ghdl

.PHONY: deps-install-ghdl
deps-install-ghdl: ##@ Install local GHDL and ghwdump when missing.
	"$(DEPS_SCRIPT)" install ghdl --yes

.PHONY: deps-bootstrap-ghdl
deps-bootstrap-ghdl: ##@ Bootstrap the local GHDL toolchain.
	"$(DEPS_SCRIPT)" bootstrap ghdl-local \
		--base-dir "$(HDL_DEV_GHDL_BASE)" \
		--install-root "$(GHDL_TOOLCHAIN_ROOT)" \
		--tag "$(HDL_DEV_GHDL_TAG)" \
		--mode "$(HDL_DEV_GHDL_BOOTSTRAP_MODE)"

.PHONY: deps-check-docs-assets
deps-check-docs-assets: ##@ Check waveform/schematic renderer tools.
	"$(DEPS_SCRIPT)" check docs-assets

.PHONY: deps-install-docs-assets
deps-install-docs-assets: ##@ Install waveform/schematic renderer tools.
	"$(DEPS_SCRIPT)" install docs-assets --yes

##@ Extension
.PHONY: npm-install
npm-install: ##@ Install npm dependencies.
	npm ci

.PHONY: lint
lint: ##@ Run eslint.
	npm run lint

.PHONY: compile
compile: ##@ Compile TypeScript.
	npm run compile

.PHONY: test
test: ##@ Run VS Code extension tests.
	npm test

.PHONY: ci
ci: npm-install lint compile test ##@ Run the local extension CI sequence.

.PHONY: doctor-smoke
doctor-smoke: deps-install-ghdl lint compile test ##@ Run extension tests with local GHDL available.

##@ Docs
.PHONY: docs-install
docs-install: ##@ Install MkDocs dependencies.
	"$(PYTHON)" -m pip install -r requirements-docs.txt

.PHONY: docs-build
docs-build: ##@ Build the MkDocs site.
	"$(MKDOCS)" build --strict --site-dir "$(DOCS_SITE_DIR)"

##@ Agent Harness
.PHONY: agent-harness-check
agent-harness-check: ##@ Validate agent harness docs, links, fixtures, and nav.
	node scripts/validate-agent-harness.mjs
