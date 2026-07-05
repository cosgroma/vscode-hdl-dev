SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

TB ?= timer_tb
STOP_TIME ?= 500us
WAVE_FORMAT ?= ghw
WAVEFORM ?= timer-wave
SCHEMATIC ?= timer-core

.PHONY: help
help:
	@printf "Fixture targets: list-tbs, test, docs-waveforms, docs-schematics\n"

.PHONY: list-tbs
list-tbs:
	@printf "timer_tb\n"

.PHONY: test
test:
	@mkdir -p build/waves logs
	@printf "fixture run TB=%s STOP_TIME=%s WAVE_FORMAT=%s\n" "$(TB)" "$(STOP_TIME)" "$(WAVE_FORMAT)" | tee "logs/$(TB).log"
	@printf "fixture wave dump for %s\n" "$(TB)" > "build/waves/$(TB).$(WAVE_FORMAT)"

.PHONY: docs-waveforms
docs-waveforms:
	@mkdir -p docs/waveforms/generated
	@printf '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80"><text x="12" y="44">%s fixture waveform</text></svg>\n' "$(WAVEFORM)" > "docs/waveforms/generated/$(WAVEFORM).svg"

.PHONY: docs-schematics
docs-schematics:
	@mkdir -p docs/schematics/generated "build/schematics/$(SCHEMATIC)"
	@printf '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80"><text x="12" y="44">%s fixture schematic</text></svg>\n' "$(SCHEMATIC)" > "docs/schematics/generated/$(SCHEMATIC).svg"
	@printf '{"fixture":true,"schematic":"%s"}\n' "$(SCHEMATIC)" > "build/schematics/$(SCHEMATIC)/$(SCHEMATIC).json"
