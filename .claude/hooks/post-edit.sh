#!/usr/bin/env bash
# Hook PostToolUse: corre despues de cada edicion de archivo.
#
# Un hook es deterministico: no depende del criterio del agente. Esto asegura
# que el formato y los errores obvios se detecten siempre, sin gastar tokens
# en pedirselo.

set -uo pipefail
ARCHIVO="${CLAUDE_TOOL_FILE_PATH:-}"
[ -n "$ARCHIVO" ] || exit 0
[ -f "$ARCHIVO" ] || exit 0

case "$ARCHIVO" in
  *.py)
    command -v ruff >/dev/null 2>&1 || exit 0
    ruff format "$ARCHIVO" >/dev/null 2>&1
    # Solo reporta; no bloquea
    ruff check "$ARCHIVO" 2>&1 | head -20
    ;;
  *.ts|*.tsx)
    command -v npx >/dev/null 2>&1 || exit 0
    npx --no-install prettier --write "$ARCHIVO" >/dev/null 2>&1
    ;;
esac
exit 0
