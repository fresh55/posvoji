#!/usr/bin/env bash
# Sourced by scheduled-crawl.sh under Git for Windows.
configure_crawl_runtime() {
  command -v cygpath >/dev/null || { printf 'The crawl task needs Git for Windows.\n' >&2; return 1; }
  local profile="${USERPROFILE:-${HOME:-}}"
  if [[ -z "$profile" ]]; then
    printf 'The crawl task needs USERPROFILE or HOME.\n' >&2
    return 1
  fi
  local system_root="${SystemRoot:-${SYSTEMROOT:-}}"
  local program_files="${ProgramFiles:-${PROGRAMFILES:-}}"
  if [[ -z "$system_root" || -z "$program_files" ]]; then
    printf 'The crawl task needs the Windows SystemRoot and ProgramFiles environment.\n' >&2
    return 1
  fi

  export USERPROFILE="$(cygpath -w "$profile")"
  export HOME="$(cygpath -u "${HOME:-$profile}")"
  export APPDATA="${APPDATA:-${USERPROFILE}\\AppData\\Roaming}"
  export LOCALAPPDATA="${LOCALAPPDATA:-${USERPROFILE}\\AppData\\Local}"
  local temp_dir="${TMPDIR:-${TMP:-${TEMP:-${LOCALAPPDATA}\\Temp}}}"
  export TMPDIR="$(cygpath -u "$temp_dir")"
  export TMP="$(cygpath -w "$temp_dir")"
  export TEMP="$TMP"

  # Explicit overrides support user-installed Node and standalone pnpm. Keep
  # the inherited PATH as a fallback; Git paths belong to this Bash installation.
  local node_dir="$(cygpath -u "${POSVOJI_NODE_DIR:-${program_files}\\nodejs}")"
  local pnpm_dir="$(cygpath -u "${PNPM_HOME:-${APPDATA}\\npm}")"
  local windows_dir="$(cygpath -u "$system_root")"
  export PATH="${node_dir}:${pnpm_dir}:/mingw64/bin:/usr/bin:/bin:${PATH:-}:${windows_dir}/System32:${windows_dir}/System32/Wbem"
  POWERSHELL="${windows_dir}/System32/WindowsPowerShell/v1.0/powershell.exe"
}
