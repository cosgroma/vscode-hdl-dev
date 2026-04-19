# HDL Dev

HDL Dev is a VS Code extension for coordinating HDL project workflows from
inside the editor. The project is currently an early TypeScript extension with
passive HDL project discovery, dependency-check commands, testbench discovery,
testbench run support, documentation, CI, and GitHub Pages infrastructure in
place.

The design direction is to keep HDL project scripts as the source of truth and
wrap them with native VS Code surfaces: commands, Output channels, the Testing
API, tree views, status items, and focused artifact previews.

## Features

Current shipped extension behavior covers the v0.1 Project Discovery and
Dependency Doctor milestone plus the v0.2 native testbench discovery and run
implementation slices.

Feature status:

- [x] TypeScript VS Code extension scaffold
- [x] npm-based lint, compile, and extension test workflow
- [x] repo-owned dependency front door at `scripts/deps.sh`
- [x] local GHDL bootstrap/cache support with paired `ghdl` and `ghwdump`
- [x] Make targets for dependency checks and docs builds
- [x] GitHub Actions CI for extension lint, compile, and tests
- [x] GitHub Actions Doctor smoke workflow with cached GHDL
- [x] git-flow branch model with branch-direction policy checks
- [x] MkDocs documentation site deployed to GitHub Pages
- [x] HDL project discovery
- [x] Dependency Doctor commands and Output channel
- [x] dependency status bar item
- [x] VS Code Testing API testbench discovery
- [x] VS Code Testing API testbench run support
- [ ] waveform spec tree and SVG generation commands
- [ ] schematic spec tree and SVG generation commands
- [ ] generated artifact explorer
- [ ] waveform and schematic JSON schemas
- [ ] `ghwdump -H` signal picker for waveform specs
- [ ] interactive preview surfaces for generated SVGs
- [ ] packetized-I/O debug session helpers

Shipped command names use the `HDL Dev` prefix:

- `HDL Dev: Check GHDL Dependencies`
- `HDL Dev: Check Documentation Asset Dependencies`

Shipped Testing API surface:

- `HDL Dev Testbenches` test controller
- `Run Testbench` run profile

Planned command names:

- `HDL Dev: Generate Waveform SVG`
- `HDL Dev: Generate Schematic SVG`
- `HDL Dev: Open Latest Artifact`

## Requirements

Extension development requires:

- Node.js 22
- npm
- VS Code compatible with extension engine `^1.116.0`

The dependency and HDL tooling scripts are intended for Linux development and CI
first. The local GHDL bootstrap currently downloads the official Linux x86_64
GHDL release tarball.

Useful setup commands:

```bash
npm ci
make deps-install-ghdl
make deps-check-ghdl
```

Documentation builds require Python and MkDocs, isolated to docs tooling:

```bash
make docs-install
make docs-build
```

The public documentation site is published at:

```text
https://cosgroma.github.io/vscode-hdl-dev/
```

## Extension Settings

HDL Dev contributes these settings:

- `hdlDev.projectRoots`: optional explicit project roots
- `hdlDev.depsScript`: optional path to `scripts/deps.sh`
- `hdlDev.makeExecutable`: make executable path, defaulting to `make`
- `hdlDev.defaultStopTime`: default `STOP_TIME` for GHDL testbench runs
- `hdlDev.defaultWaveFormat`: default `WAVE_FORMAT` for GHDL testbench runs
- `hdlDev.toolchainRoot`: optional `GHDL_TOOLCHAIN_ROOT`

## Repository Workflow

This repository uses git-flow:

- `main` is the production branch
- `develop` is the default branch and integration branch
- feature work uses `feature/*`
- release stabilization uses `release/*`
- production fixes use `hotfix/*`

Start feature work with:

```bash
git flow feature start <name>
```

Finish feature work into `develop` with:

```bash
git flow feature finish <name>
```

GitHub Actions enforce pull request direction:

- `main` accepts `release/*` and `hotfix/*`
- `develop` accepts `feature/*`, `bugfix/*`, `release/*`, `hotfix/*`, and
  `support/*`

## Development

Common local commands:

```bash
npm run lint
npm run compile
npm test
make docs-build
make deps-check-ghdl
```

The Doctor smoke workflow uses the repo-owned dependency scripts rather than
checking out GEnCor. GEnCor remains the reference pattern for dependency
management, GHDL testbench execution, waveform SVG generation, and schematic SVG
generation.

## Known Issues

- The local GHDL bootstrap path is Linux x86_64 only.
- Dependency Doctor uses coarse pass/fail process status and human-readable
  shell output; JSON output is planned for more reliable extension integration.
- Dependency Doctor commands are blocked until the workspace is trusted.
- Testbench result status is currently based on Make process exit status.
- Spec trees, artifact navigation, previews, schemas, and packetized-I/O debug
  helpers are planned but not implemented yet.
- Waveform and schematic generation are documented as design targets but are not
  implemented in the extension yet.

## Release Notes

### 0.0.1

Initial scaffold and project infrastructure:

- TypeScript VS Code extension baseline
- repo-owned dependency scripts and Make targets
- passive HDL project discovery
- Dependency Doctor commands, Output channel, and status item
- VS Code Testing API discovery and Make-backed testbench runs
- cached GHDL Doctor smoke workflow
- git-flow branch model
- MkDocs GitHub Pages deployment

## Documentation

Design notes live under `docs/` and are published through MkDocs:

- [VS Code Workbench References](docs/references/vscode-workbench-surfaces.md)
- [GEnCor Integration Notes](docs/integrations/gencor.md)
- [v0.1 Project Discovery And Dependency Doctor](docs/workflows/v0.1-project-discovery-and-doctor.md)
- [v0.2 Native Testbench Runner](docs/workflows/v0.2-testbench-discovery.md)
- [Project Discovery](docs/design/project-discovery.md)
- [Initial Extension Design](docs/design/initial-extension-design.md)
- [MVP Roadmap](docs/design/mvp-roadmap.md)
- [CI GHDL Cache Strategy](docs/design/ci-ghdl-cache.md)
- [Git Flow](docs/design/git-flow.md)
- [GitHub Pages](docs/design/pages.md)

## Following Extension Guidelines

Implementation should follow the VS Code extension guidelines:

- prefer native VS Code APIs before webviews
- respect workspace trust for dependency installation and command execution
- keep long-running process output visible and inspectable
- serialize shared-build-directory simulation flows
- keep repo-local HDL scripts as the source of truth

Reference:

- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
