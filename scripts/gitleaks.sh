#!/usr/bin/env bash
#
# Secret-Scan mit gitleaks – lokal und in der CI identisch.
#
#   scripts/gitleaks.sh            Arbeitsverzeichnis und Git-Historie prüfen
#   scripts/gitleaks.sh staged     nur vorgemerkte Änderungen prüfen (pre-commit)
#   scripts/gitleaks.sh selftest   prüfen, dass der Scanner überhaupt anschlägt
#
# Ist gitleaks nicht installiert, wird die passende Version einmalig nach
# .cache/gitleaks heruntergeladen. Der Scanner endet mit Code 1, sobald etwas
# gefunden wird – so bricht jeder Fund den Build.

set -euo pipefail

GITLEAKS_VERSION="${GITLEAKS_VERSION:-8.28.0}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="$ROOT/.cache"
MODE="${1:-all}"

find_gitleaks() {
  if command -v gitleaks >/dev/null 2>&1; then
    command -v gitleaks
    return
  fi
  if [ -x "$CACHE/gitleaks" ]; then
    echo "$CACHE/gitleaks"
    return
  fi

  local arch os
  case "$(uname -m)" in
    x86_64|amd64) arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) echo "Nicht unterstützte Architektur: $(uname -m)" >&2; exit 1 ;;
  esac
  case "$(uname -s)" in
    Linux) os="linux" ;;
    Darwin) os="darwin" ;;
    *) echo "Nicht unterstütztes System: $(uname -s)" >&2; exit 1 ;;
  esac

  local url="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_${os}_${arch}.tar.gz"
  echo "Lade gitleaks ${GITLEAKS_VERSION} …" >&2
  mkdir -p "$CACHE"
  curl -sSfL "$url" -o "$CACHE/gitleaks.tar.gz"
  tar -xzf "$CACHE/gitleaks.tar.gz" -C "$CACHE" gitleaks
  rm -f "$CACHE/gitleaks.tar.gz"
  chmod +x "$CACHE/gitleaks"
  echo "$CACHE/gitleaks"
}

BIN="$(find_gitleaks)"
mkdir -p "$CACHE"
OPTS=(--config "$ROOT/.gitleaks.toml" --redact --no-banner --exit-code 1)

case "$MODE" in
  staged)
    echo "gitleaks: prüfe vorgemerkte Änderungen …"
    "$BIN" git --staged "$ROOT" "${OPTS[@]}"
    ;;
  history)
    echo "gitleaks: prüfe die Git-Historie …"
    "$BIN" git "$ROOT" "${OPTS[@]}"
    ;;
  selftest)
    # Ein Scanner, der nichts findet, ist keine Absicherung. Deshalb wird hier
    # bewusst ein Testgeheimnis erzeugt (außerhalb des Repos, zur Laufzeit,
    # damit es nie im Verlauf landet) und ein Treffer erwartet.
    probe="$(mktemp -d)"
    trap 'rm -rf "$probe"' EXIT
    printf 'token = "ghp_%s"\n' "$(openssl rand -hex 18)" > "$probe/probe.txt"
    if "$BIN" dir "$probe" "${OPTS[@]}" >/dev/null 2>&1; then
      echo "FEHLER: gitleaks hat ein absichtlich platziertes Geheimnis nicht gefunden." >&2
      exit 1
    fi
    echo "gitleaks: Selbsttest bestanden – Funde brechen den Build."
    ;;
  *)
    echo "gitleaks: prüfe Arbeitsverzeichnis …"
    "$BIN" dir "$ROOT" "${OPTS[@]}" \
      --report-format json --report-path "$CACHE/gitleaks-report-dir.json"
    echo "gitleaks: prüfe Git-Historie …"
    "$BIN" git "$ROOT" "${OPTS[@]}" \
      --report-format json --report-path "$CACHE/gitleaks-report-git.json"
    ;;
esac

echo "gitleaks: keine Geheimnisse gefunden."
