#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CHECK_IMPL="${SCRIPT_DIR}/lib/deps/check_impl.sh"
GHDL_BOOTSTRAP_IMPL="${SCRIPT_DIR}/lib/deps/bootstrap_ghdl_local_impl.sh"

die() {
  printf '[error] %s\n' "$*" >&2
  exit 2
}

print_usage() {
  cat <<'EOF'
Usage:
  scripts/deps.sh <command> [profile] [options]

Commands:
  check [profile]       Audit dependencies only.
  install [profile]     Check and install open-source dependencies.
  setup [profile]       Alias for install.
  bootstrap ghdl-local  Bootstrap a local GHDL toolchain.
  list                  List dependency profiles.
  help                  Show this message.

Profiles:
  ghdl           Local GHDL and ghwdump toolchain.
  docs-assets    Waveform and schematic documentation renderers.
  all            GHDL plus documentation asset tooling.
  dev, open      Aliases for all.

Examples:
  ./scripts/deps.sh check ghdl
  ./scripts/deps.sh install ghdl --yes
  ./scripts/deps.sh check docs-assets
  ./scripts/deps.sh bootstrap ghdl-local --tag v6.0.0 --mode binary

Environment:
  HDL_DEV_GHDL_TAG
                   GHDL release tag to install/check. Default: v6.0.0
  HDL_DEV_GHDL_BASE
                   Repo-local cache/install base. Default: .cache/hdl-dev-ghdl
  HDL_DEV_GHDL_ROOT
                   Explicit local GHDL root.
  GHDL_TOOLCHAIN_ROOT
                   Explicit local GHDL root. Takes precedence over
                   HDL_DEV_GHDL_ROOT.
  HDL_DEV_GHDL_BOOTSTRAP_MODE
                   Bootstrap mode for install ghdl. Default: binary
  HDL_DEV_GHDL_BACKEND
                   GHDL binary backend to download. Default: mcode
EOF
}

deps_default_profile() {
  printf 'all\n'
}

deps_normalize_profile() {
  case "${1:-}" in
    ""|all|dev|open)
      printf 'all\n'
      ;;
    ghdl|docs-assets)
      printf '%s\n' "$1"
      ;;
    *)
      return 1
      ;;
  esac
}

deps_list_profiles() {
  cat <<'EOF'
ghdl
docs-assets
all
dev
open
EOF
}

run_check_profile() {
  local profile="$1"
  shift
  exec "$CHECK_IMPL" --profile "$profile" --check-only "$@"
}

run_install_profile() {
  local profile="$1"
  shift
  exec "$CHECK_IMPL" --profile "$profile" "$@"
}

run_bootstrap_profile() {
  local profile="${1:-}"
  if [[ "$#" -gt 0 ]]; then
    shift
  fi

  case "$profile" in
    ghdl-local|ghdl)
      exec "$GHDL_BOOTSTRAP_IMPL" "$@"
      ;;
    ""|help|--help|-h)
      "$GHDL_BOOTSTRAP_IMPL" --help
      ;;
    *)
      die "Unknown bootstrap profile: $profile"
      ;;
  esac
}

main() {
  local command="${1:-help}"
  if [[ "$#" -gt 0 ]]; then
    shift
  fi

  case "$command" in
    check)
      case "${1:-}" in
        help|--help|-h)
          print_usage
          return 0
          ;;
      esac

      local requested_profile profile
      if [[ "$#" -gt 0 && "${1:-}" != --* ]]; then
        requested_profile="$1"
        shift
      else
        requested_profile="$(deps_default_profile)"
      fi
      profile="$(deps_normalize_profile "$requested_profile")" || die "Unknown dependency profile: $requested_profile"
      run_check_profile "$profile" "$@"
      ;;
    install|setup)
      case "${1:-}" in
        help|--help|-h)
          print_usage
          return 0
          ;;
      esac

      local requested_profile profile
      if [[ "$#" -gt 0 && "${1:-}" != --* ]]; then
        requested_profile="$1"
        shift
      else
        requested_profile="$(deps_default_profile)"
      fi
      profile="$(deps_normalize_profile "$requested_profile")" || die "Unknown dependency profile: $requested_profile"
      run_install_profile "$profile" "$@"
      ;;
    bootstrap)
      run_bootstrap_profile "$@"
      ;;
    list|profiles)
      deps_list_profiles
      ;;
    help|--help|-h)
      print_usage
      ;;
    *)
      die "Unknown dependency command: $command"
      ;;
  esac
}

main "$@"
