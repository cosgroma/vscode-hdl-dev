# CI GHDL Cache Strategy

GitHub-hosted runners start from a fresh VM or container for each job. To avoid
redownloading or rebuilding GHDL every time we run Doctor smoke tests, the
`Doctor GHDL Smoke` workflow restores a GitHub Actions cache containing:

- `.cache/gencor-ghdl`
- the GEnCor `.cache/ghdl-tools` package cache

The workflow is manual-only for now because it depends on checking out a GEnCor
source repository and may hit public package/download services on a cache miss.

## Workflow

File:

```text
.github/workflows/doctor-ghdl-smoke.yml
```

Manual inputs:

- `gencor_repository`: GitHub repository containing the GEnCor tree.
- `gencor_ref`: Git ref to check out.
- `gencor_path`: Path to the GEnCor engine inside the checked-out repository.
- `ghdl_tag`: GHDL release tag.
- `gnat_tag`: GNAT-FSF release tag, used by source-mode bootstrap.
- `bootstrap_mode`: `binary`, `auto`, or `source`.

The default bootstrap mode is `binary` because it is better suited to CI than a
source build. Cache keys include:

- runner OS
- runner architecture
- GHDL tag
- GNAT tag
- bootstrap mode
- a hash of `scripts/deps.sh` and `scripts/lib/deps/*.sh`

## Validation

After restoring or creating the cache, the workflow runs:

```bash
./scripts/deps.sh install ghdl --yes
./scripts/deps.sh check ghdl
ghdl --version
ghwdump -h | grep -E '^[[:space:]]*-H[[:space:]]'
```

That keeps the cache honest. A stale or partial cache should fail before the
extension tests run.

## Caveats

- GitHub cache entries can be evicted.
- Existing cache entries are immutable; changing the key creates a new cache.
- Do not cache secrets or credentials.
- The default `gencor_repository` assumes a GitHub repository named
  `cosgroma/sergeant`; adjust the manual workflow input if the source lives
  somewhere else.
- If GHDL bootstrap time or cache churn becomes a problem, the next step is a
  prebuilt GHCR image with GHDL, `ghwdump`, Yosys, and `netlistsvg` installed.
