#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
GHDL_BOOTSTRAP_IMPL="${SCRIPT_DIR}/bootstrap_ghdl_local_impl.sh"

PROFILE="all"
CHECK_ONLY=0
ASSUME_YES=0
VERBOSE=0

HDL_DEV_GHDL_TAG="${HDL_DEV_GHDL_TAG:-v6.0.0}"
HDL_DEV_GHDL_BASE="${HDL_DEV_GHDL_BASE:-${REPO_ROOT}/.cache/hdl-dev-ghdl}"
HDL_DEV_GHDL_BOOTSTRAP_MODE="${HDL_DEV_GHDL_BOOTSTRAP_MODE:-binary}"

print_usage() {
  cat <<'EOF'
Usage:
  scripts/deps.sh check [profile] [options]
  scripts/deps.sh install [profile] [options]

Profiles:
  ghdl           Local GHDL and ghwdump toolchain.
  docs-assets    Waveform and schematic documentation renderers.
  all            GHDL plus documentation asset tooling.

Options:
  --profile <name>  Dependency profile to evaluate.
  --check-only      Report status only. Do not install anything.
  --yes             Skip install confirmation prompts.
  --verbose         Print extra detail when tools are present.
  --help            Show this message.
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

tool_exists() {
  local tool="$1"
  if [[ "$tool" == */* ]]; then
    [[ -x "$tool" ]]
  else
    have_cmd "$tool"
  fi
}

parse_args() {
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --profile)
        [[ "$#" -ge 2 ]] || die "--profile requires a value"
        PROFILE="$2"
        shift 2
        ;;
      --check-only)
        CHECK_ONLY=1
        shift
        ;;
      --yes|-y)
        ASSUME_YES=1
        shift
        ;;
      --verbose)
        VERBOSE=1
        shift
        ;;
      --help|-h)
        print_usage
        exit 0
        ;;
      *)
        die "Unknown dependency option: $1"
        ;;
    esac
  done
}

candidate_ghdl_roots() {
  local seen=":"
  local candidate
  for candidate in \
    "${GHDL_TOOLCHAIN_ROOT:-}" \
    "${HDL_DEV_GHDL_ROOT:-}" \
    "${HDL_DEV_GHDL_BASE}/installs/${HDL_DEV_GHDL_TAG}" \
    "${REPO_ROOT}/.cache/hdl-dev-ghdl/installs/${HDL_DEV_GHDL_TAG}" \
    "${HOME}/.cache/hdl-dev-ghdl/installs/${HDL_DEV_GHDL_TAG}" \
    "${HOME}/ghdl-bootstrap/installs/${HDL_DEV_GHDL_TAG}"; do
    [[ -n "$candidate" ]] || continue
    case "$seen" in
      *:"$candidate":*)
        continue
        ;;
    esac
    seen="${seen}${candidate}:"
    printf '%s\n' "$candidate"
  done
}

select_ghdl_root() {
  local candidate

  if [[ -n "${GHDL_TOOLCHAIN_ROOT:-}" ]]; then
    printf '%s\n' "$GHDL_TOOLCHAIN_ROOT"
    return 0
  fi

  if [[ -n "${HDL_DEV_GHDL_ROOT:-}" ]]; then
    printf '%s\n' "$HDL_DEV_GHDL_ROOT"
    return 0
  fi

  while IFS= read -r candidate; do
    if [[ -x "$candidate/bin/ghdl" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done < <(candidate_ghdl_roots)

  return 1
}

resolve_ghdl_tools() {
  local root="${1:-}"
  local ghdl_bin="${GHDL:-}"
  local ghwdump_bin="${GHWDUMP:-}"

  if [[ -z "$ghdl_bin" ]]; then
    if [[ -n "$root" ]]; then
      ghdl_bin="$root/bin/ghdl"
    else
      ghdl_bin="ghdl"
    fi
  fi

  if [[ -z "$ghwdump_bin" ]]; then
    if [[ -n "$root" ]]; then
      ghwdump_bin="$root/bin/ghwdump"
    else
      ghwdump_bin="ghwdump"
    fi
  fi

  printf '%s\n%s\n' "$ghdl_bin" "$ghwdump_bin"
}

check_ghdl() {
  local root="" tools ghdl_bin ghwdump_bin version_output ghwdump_help missing=0

  if root="$(select_ghdl_root)"; then
    info "GHDL toolchain root: $root"
  else
    info "GHDL toolchain root: PATH"
  fi

  tools="$(resolve_ghdl_tools "$root")"
  ghdl_bin="$(sed -n '1p' <<< "$tools")"
  ghwdump_bin="$(sed -n '2p' <<< "$tools")"

  if ! tool_exists "$ghdl_bin"; then
    warn "Missing ghdl: $ghdl_bin"
    missing=1
  elif version_output="$("$ghdl_bin" --version 2>&1)"; then
    ok "ghdl: $(sed -n '1p' <<< "$version_output")"
    if [[ "$VERBOSE" -eq 1 ]]; then
      info "ghdl path: $ghdl_bin"
    fi
  else
    warn "ghdl failed to run: $ghdl_bin"
    missing=1
  fi

  if ! tool_exists "$ghwdump_bin"; then
    warn "Missing ghwdump: $ghwdump_bin"
    missing=1
  elif ghwdump_help="$("$ghwdump_bin" -h 2>&1)"; then
    ok "ghwdump: $ghwdump_bin"
    if grep -Eq '^[[:space:]]*-H[[:space:]]' <<< "$ghwdump_help"; then
      ok "ghwdump supports -H hierarchy output"
    else
      warn "ghwdump does not advertise -H hierarchy output"
      missing=1
    fi
  else
    warn "ghwdump failed to run: $ghwdump_bin"
    missing=1
  fi

  return "$missing"
}

install_ghdl() {
  local install_root

  if check_ghdl; then
    return 0
  fi

  if [[ "$CHECK_ONLY" -eq 1 ]]; then
    return 1
  fi

  install_root="${GHDL_TOOLCHAIN_ROOT:-${HDL_DEV_GHDL_ROOT:-${HDL_DEV_GHDL_BASE}/installs/${HDL_DEV_GHDL_TAG}}}"
  info "Bootstrapping local GHDL into $install_root"
  "$GHDL_BOOTSTRAP_IMPL" \
    --base-dir "$HDL_DEV_GHDL_BASE" \
    --install-root "$install_root" \
    --tag "$HDL_DEV_GHDL_TAG" \
    --mode "$HDL_DEV_GHDL_BOOTSTRAP_MODE"

  export GHDL_TOOLCHAIN_ROOT="$install_root"
  check_ghdl
}

check_command() {
  local tool="$1"
  local label="$2"

  if tool_exists "$tool"; then
    ok "$label: $tool"
    return 0
  fi

  warn "Missing $label: $tool"
  return 1
}

node_major_ok() {
  local major
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  [[ -n "$major" && "$major" -ge 20 ]]
}

npm_major_ok() {
  local major
  major="$(npm --version 2>/dev/null | awk -F. 'NR == 1 { print $1 }')"
  [[ -n "$major" && "$major" -ge 9 ]]
}

check_docs_assets() {
  local missing=0

  check_command yosys Yosys || missing=1
  check_command node Node.js || missing=1
  if have_cmd node && ! node_major_ok; then
    warn "Node.js 20 or newer is recommended for documentation asset tooling"
    missing=1
  fi

  check_command npm npm || missing=1
  if have_cmd npm && ! npm_major_ok; then
    warn "npm 9 or newer is recommended for documentation asset tooling"
    missing=1
  fi

  check_command netlistsvg netlistsvg || missing=1
  return "$missing"
}

confirm_install() {
  local response
  if [[ "$ASSUME_YES" -eq 1 ]]; then
    return 0
  fi

  printf 'Install missing docs asset dependencies with apt and npm? [y/N] '
  read -r response
  [[ "$response" == "y" || "$response" == "Y" || "$response" == "yes" || "$response" == "YES" ]]
}

sudo_prefix() {
  if [[ "$(id -u)" -eq 0 ]]; then
    printf ''
  elif have_cmd sudo; then
    printf 'sudo '
  else
    die "sudo is required for system package installation"
  fi
}

install_docs_assets() {
  local sudo_cmd

  if check_docs_assets; then
    return 0
  fi

  if [[ "$CHECK_ONLY" -eq 1 ]]; then
    return 1
  fi

  have_cmd apt-get || die "Automatic docs-assets installation currently supports apt-get hosts only"
  confirm_install || die "Installation cancelled"
  sudo_cmd="$(sudo_prefix)"

  info "Installing docs asset dependencies"
  ${sudo_cmd}apt-get update
  ${sudo_cmd}apt-get install -y yosys nodejs npm
  ${sudo_cmd}npm install -g netlistsvg
  check_docs_assets
}

run_profile() {
  local failed=0

  case "$PROFILE" in
    ghdl)
      install_ghdl
      ;;
    docs-assets)
      install_docs_assets
      ;;
    all)
      install_ghdl || failed=1
      install_docs_assets || failed=1
      return "$failed"
      ;;
    *)
      die "Unknown dependency profile: $PROFILE"
      ;;
  esac
}

main() {
  parse_args "$@"
  run_profile
}

main "$@"
