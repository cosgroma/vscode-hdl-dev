#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"

TAG="${HDL_DEV_GHDL_TAG:-v6.0.0}"
BASE_DIR="${HDL_DEV_GHDL_BASE:-${REPO_ROOT}/.cache/hdl-dev-ghdl}"
BACKEND="${HDL_DEV_GHDL_BACKEND:-mcode}"
MODE="${HDL_DEV_GHDL_BOOTSTRAP_MODE:-binary}"
INSTALL_ROOT="${GHDL_TOOLCHAIN_ROOT:-${HDL_DEV_GHDL_ROOT:-}}"
ASSET_URL="${HDL_DEV_GHDL_ASSET_URL:-}"

print_usage() {
  cat <<'EOF'
Usage:
  scripts/deps.sh bootstrap ghdl-local [options]

Options:
  --base-dir <path>      Cache/install base. Default: .cache/hdl-dev-ghdl
  --install-root <path>  Exact GHDL install root.
  --tag <tag>            GHDL release tag. Default: v6.0.0
  --backend <backend>    GHDL backend asset. Default: mcode
  --mode <mode>          binary or auto. Default: binary
  --asset-url <url>      Explicit tarball URL.
  --help                 Show this message.

This bootstrapper intentionally installs the official GHDL release tarball into
this repository's cache layout. It does not check out or invoke GEnCor.
EOF
}

info() {
  printf '[info] %s\n' "$*"
}

ok() {
  printf '[ok] %s\n' "$*"
}

warn() {
  printf '[warn] %s\n' "$*"
}

die() {
  printf '[error] %s\n' "$*" >&2
  exit 2
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

parse_args() {
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --base-dir)
        [[ "$#" -ge 2 ]] || die "--base-dir requires a value"
        BASE_DIR="$2"
        shift 2
        ;;
      --install-root)
        [[ "$#" -ge 2 ]] || die "--install-root requires a value"
        INSTALL_ROOT="$2"
        shift 2
        ;;
      --tag)
        [[ "$#" -ge 2 ]] || die "--tag requires a value"
        TAG="$2"
        shift 2
        ;;
      --backend)
        [[ "$#" -ge 2 ]] || die "--backend requires a value"
        BACKEND="$2"
        shift 2
        ;;
      --mode)
        [[ "$#" -ge 2 ]] || die "--mode requires a value"
        MODE="$2"
        shift 2
        ;;
      --asset-url)
        [[ "$#" -ge 2 ]] || die "--asset-url requires a value"
        ASSET_URL="$2"
        shift 2
        ;;
      --help|-h)
        print_usage
        exit 0
        ;;
      *)
        die "Unknown bootstrap option: $1"
        ;;
    esac
  done
}

canonical_path() {
  local path="$1"
  local parent
  parent="$(dirname -- "$path")"
  mkdir -p "$parent"
  printf '%s/%s\n' "$(cd -- "$parent" && pwd -P)" "$(basename -- "$path")"
}

validate_mode_and_platform() {
  case "$MODE" in
    binary|auto)
      ;;
    source)
      die "Source-mode GHDL bootstrap is not implemented in this repo yet; use --mode binary"
      ;;
    *)
      die "Unsupported GHDL bootstrap mode: $MODE"
      ;;
  esac

  if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
    die "Binary GHDL bootstrap currently supports Linux x86_64 only"
  fi
}

resolve_asset_url_from_github() {
  local selected=""
  if ! have_cmd python3; then
    return 1
  fi

  selected="$(
    GHDL_RELEASE_TAG="$TAG" GHDL_RELEASE_BACKEND="$BACKEND" python3 <<'PY'
import json
import os
import sys
import urllib.request

tag = os.environ["GHDL_RELEASE_TAG"]
backend = os.environ["GHDL_RELEASE_BACKEND"]
api_url = f"https://api.github.com/repos/ghdl/ghdl/releases/tags/{tag}"
request = urllib.request.Request(api_url, headers={"User-Agent": "vscode-hdl-dev-deps"})

try:
    with urllib.request.urlopen(request, timeout=30) as response:
        release = json.load(response)
except Exception as exc:
    print(f"failed to query {api_url}: {exc}", file=sys.stderr)
    sys.exit(1)

matches = []
for asset in release.get("assets", []):
    name = asset.get("name", "")
    url = asset.get("browser_download_url", "")
    if (
        name.endswith(".tar.gz")
        and f"ghdl-{backend}-" in name
        and "ubuntu24.04-x86_64" in name
        and url
    ):
        matches.append(url)

if not matches:
    print(f"no matching {backend} ubuntu24.04 x86_64 tarball for {tag}", file=sys.stderr)
    sys.exit(1)

print(matches[0])
PY
  )" || return 1

  printf '%s\n' "$selected"
}

default_asset_url() {
  local version="${TAG#v}"
  printf 'https://github.com/ghdl/ghdl/releases/download/%s/ghdl-%s-%s-ubuntu24.04-x86_64.tar.gz\n' \
    "$TAG" "$BACKEND" "$version"
}

asset_filename() {
  local url="$1"
  local name="${url##*/}"
  printf '%s\n' "${name%%\?*}"
}

guard_install_root() {
  local path="$1"
  case "$path" in
    ""|"/"|"/bin"|"/usr"|"/usr/bin"|"/usr/local"|"$HOME"|"$REPO_ROOT")
      die "Refusing to replace unsafe install root: $path"
      ;;
  esac
}

download_asset() {
  local url="$1"
  local archive="$2"

  if [[ -s "$archive" ]]; then
    ok "Using cached GHDL archive: $archive"
    return 0
  fi

  have_cmd curl || die "curl is required to download GHDL"
  info "Downloading GHDL from $url"
  curl --fail --location --retry 3 --retry-delay 2 --output "$archive" "$url"
}

extract_archive_source_root() {
  local archive="$1"
  local extract_tmp="$2"
  local candidate source_root=""

  tar -xzf "$archive" -C "$extract_tmp"

  if [[ -x "$extract_tmp/bin/ghdl" ]]; then
    printf '%s\n' "$extract_tmp"
    return 0
  fi

  while IFS= read -r candidate; do
    local root
    root="$(dirname -- "$(dirname -- "$candidate")")"
    if [[ -x "$root/bin/ghdl" ]]; then
      source_root="$root"
      break
    fi
  done < <(find "$extract_tmp" -maxdepth 4 -path '*/bin/ghdl' -print)

  [[ -n "$source_root" ]] || die "Downloaded archive did not contain bin/ghdl"
  printf '%s\n' "$source_root"
}

install_from_source_root() {
  local source_root="$1"
  local install_root="$2"
  local install_tmp="${install_root}.tmp.$$"

  guard_install_root "$install_root"
  rm -rf "$install_tmp"
  mkdir -p "$(dirname -- "$install_root")"
  mkdir -p "$install_tmp"
  cp -a "$source_root"/. "$install_tmp"/

  [[ -x "$install_tmp/bin/ghdl" ]] || die "Install staging area is missing bin/ghdl"
  [[ -x "$install_tmp/bin/ghwdump" ]] || die "Install staging area is missing bin/ghwdump"

  {
    printf 'tag=%s\n' "$TAG"
    printf 'backend=%s\n' "$BACKEND"
    printf 'mode=%s\n' "$MODE"
    printf 'asset_url=%s\n' "$ASSET_URL"
  } > "$install_tmp/HDL_DEV_TOOLCHAIN"

  rm -rf "$install_root"
  mv "$install_tmp" "$install_root"
}

verify_install() {
  local install_root="$1"
  local version_line

  version_line="$("$install_root/bin/ghdl" --version 2>&1 | sed -n '1p')"
  ok "Installed $version_line"

  if "$install_root/bin/ghwdump" -h 2>&1 | grep -Eq '^[[:space:]]*-H[[:space:]]'; then
    ok "ghwdump supports -H hierarchy output"
  else
    die "Installed ghwdump does not advertise -H support"
  fi
}

main() {
  parse_args "$@"
  validate_mode_and_platform

  BASE_DIR="$(canonical_path "$BASE_DIR")"
  if [[ -z "$INSTALL_ROOT" ]]; then
    INSTALL_ROOT="${BASE_DIR}/installs/${TAG}"
  fi
  INSTALL_ROOT="$(canonical_path "$INSTALL_ROOT")"

  if [[ -x "$INSTALL_ROOT/bin/ghdl" && -x "$INSTALL_ROOT/bin/ghwdump" ]]; then
    ok "GHDL already installed at $INSTALL_ROOT"
    verify_install "$INSTALL_ROOT"
    return 0
  fi

  mkdir -p "$BASE_DIR/downloads" "$BASE_DIR/extract"

  if [[ -z "$ASSET_URL" ]]; then
    ASSET_URL="$(resolve_asset_url_from_github)" || {
      ASSET_URL="$(default_asset_url)"
      warn "Falling back to expected release asset URL: $ASSET_URL"
    }
  fi

  local archive extract_tmp source_root archive_name
  archive_name="$(asset_filename "$ASSET_URL")"
  archive="$BASE_DIR/downloads/$archive_name"
  extract_tmp="$(mktemp -d "$BASE_DIR/extract/${TAG}.XXXXXX")"

  download_asset "$ASSET_URL" "$archive"
  source_root="$(extract_archive_source_root "$archive" "$extract_tmp")"
  install_from_source_root "$source_root" "$INSTALL_ROOT"
  rm -rf "$extract_tmp"
  verify_install "$INSTALL_ROOT"
  ok "GHDL_TOOLCHAIN_ROOT=$INSTALL_ROOT"
}

main "$@"
