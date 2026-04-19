# CI GHDL Cache Strategy

GitHub-hosted runners start from a fresh VM or container for each job. To avoid
redownloading GHDL every time we run Doctor smoke tests, the `Doctor GHDL Smoke`
workflow restores a GitHub Actions cache containing this repo's local dependency
root:

- `.cache/hdl-dev-ghdl`

The workflow is manual-only for now because a cache miss still needs internet
access to download the official GHDL release tarball. Both workflows also cache
`.vscode-test` so extension test runs do not need to redownload the VS Code test
binary on every run.

## Workflow

File:

```text
.github/workflows/doctor-ghdl-smoke.yml
```

Manual inputs:

- `ghdl_tag`: GHDL release tag.
- `bootstrap_mode`: `binary` or `auto`.

The default bootstrap mode is `binary` because it is better suited to CI than a
source build. Cache keys include:

- runner OS
- runner architecture
- GHDL tag
- bootstrap mode
- a hash of `Makefile`, `scripts/deps.sh`, and `scripts/lib/deps/*.sh`

## Local Entry Points

The extension repo owns the dependency and Make targets used by CI:

```bash
make deps-install-ghdl
make deps-check-ghdl
./scripts/deps.sh install ghdl --yes
./scripts/deps.sh check ghdl
./scripts/deps.sh bootstrap ghdl-local --tag v6.0.0 --mode binary
```

The default toolchain layout is:

```text
.cache/hdl-dev-ghdl/
  downloads/
  extract/
  installs/<ghdl-tag>/
```

`GHDL_TOOLCHAIN_ROOT` points at `installs/<ghdl-tag>` and the workflow adds its
`bin` directory to `PATH` before running the Doctor smoke checks.

## Validation

After restoring or creating the cache, the workflow runs:

```bash
make deps-install-ghdl
make deps-check-ghdl
ghdl --version
ghwdump -h | grep -E '^[[:space:]]*-H[[:space:]]'
```

That keeps the cache honest. A stale or partial cache should fail before the
extension tests run.

## Caveats

- GitHub cache entries can be evicted.
- Existing cache entries are immutable; changing the key creates a new cache.
- Do not cache secrets or credentials.
- Linux extension tests run under `xvfb-run` on GitHub-hosted runners because
  VS Code requires a display server.
- The workflow does not check out GEnCor. GEnCor remains the reference pattern,
  while this repo owns its Doctor dependency bootstrap.
- If GHDL bootstrap time or cache churn becomes a problem, the next step is a
  prebuilt GHCR image with GHDL, `ghwdump`, Yosys, and `netlistsvg` installed.
