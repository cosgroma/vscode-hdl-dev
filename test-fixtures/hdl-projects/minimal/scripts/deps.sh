#!/usr/bin/env bash
set -euo pipefail

command_name="${1:-}"
profile="${2:-}"

case "$command_name" in
	list)
		printf "ghdl\n"
		printf "docs-assets\n"
		;;
	check)
		case "$profile" in
			ghdl)
				printf "[ok] fixture ghdl dependencies available\n"
				printf "[ok] fixture ghwdump supports -H hierarchy output\n"
				;;
			docs-assets)
				printf "[ok] fixture docs asset dependencies available\n"
				;;
			*)
				printf "[error] unsupported fixture dependency profile: %s\n" "$profile" >&2
				exit 2
				;;
		esac
		;;
	*)
		printf "usage: %s list | check <ghdl|docs-assets>\n" "$0" >&2
		exit 2
		;;
esac
