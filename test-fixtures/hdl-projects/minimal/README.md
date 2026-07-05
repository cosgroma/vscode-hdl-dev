# Minimal HDL Fixture

This fixture is a small HDL project shape for tests, manual reproduction, and
agent evidence. It intentionally uses local Make targets and a fixture
dependency script so HDL Dev can exercise project discovery, testbench
discovery, spec generation, and artifact navigation without external HDL tools.

Useful commands from this directory:

```bash
make list-tbs
make test TB=timer_tb STOP_TIME=20us WAVE_FORMAT=ghw
make docs-waveforms WAVEFORM=timer-wave
make docs-waveforms WAVEFORM=timer-wave NO_RUN=1
make docs-schematics SCHEMATIC=timer-core
scripts/deps.sh check ghdl
scripts/deps.sh check docs-assets
```

The generated files are lightweight text/SVG placeholders. They are not
simulation-accurate artifacts.
