#!/usr/bin/env bash
# NEVII HUB — kanonik web sunucusunu başlatır. Sadece kanonik depo kökünden çalışır.
set -euo pipefail

CANONICAL_REPO_ROOT="/Users/hidircanyagiz/Projects/notaplan"
CANONICAL_BRANCH="main"
PORT=3000

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

if [ "$SCRIPT_DIR" != "$CANONICAL_REPO_ROOT" ]; then
  echo "HATA: Bu script yalnızca kanonik depodan çalıştırılabilir." >&2
  echo "  Beklenen : $CANONICAL_REPO_ROOT" >&2
  echo "  Bulunan  : $SCRIPT_DIR" >&2
  echo "Bu bir geçici worktree veya farklı bir klasör olabilir — 'latest' olarak kabul etmeyin." >&2
  exit 1
fi

cd "$CANONICAL_REPO_ROOT"

BRANCH="$(git branch --show-current 2>/dev/null || echo '(detached HEAD)')"
COMMIT="$(git log -1 --format='%h — %s' 2>/dev/null || echo '?')"

echo "================================================================"
echo " NEVII HUB — CANONICAL WEB SERVER"
echo "================================================================"
echo "Klasör  : $CANONICAL_REPO_ROOT"
echo "Branch  : $BRANCH"
echo "Commit  : $COMMIT"
echo "URL     : http://localhost:${PORT}/panel"
if [ "$BRANCH" != "$CANONICAL_BRANCH" ]; then
  echo "UYARI   : kanonik branch '$CANONICAL_BRANCH' değil — çalıştığınız kod 'latest' olmayabilir."
fi
echo "================================================================"

EXISTING_PID="$(lsof -ti tcp:${PORT} 2>/dev/null || true)"
if [ -n "$EXISTING_PID" ]; then
  echo
  echo "Port ${PORT} zaten kullanımda:"
  ps -o pid,command -p "$EXISTING_PID" 2>/dev/null | tail -n +2 || true
  echo
  ORIG_CWD="$(lsof -p "$EXISTING_PID" 2>/dev/null | awk '$4=="cwd"{print $NF}' | head -1 || true)"
  if [ -n "$ORIG_CWD" ]; then
    echo "O sürecin çalışma dizini: $ORIG_CWD"
  fi
  echo
  echo "Bu script başka bir portu sessizce seçmez. Ya o süreci kasıtlı olarak durdurun:"
  echo "  kill $EXISTING_PID"
  echo "ya da DEVELOPMENT_WORKFLOW.md içindeki 'Port 3000 dolu' kurtarma adımını izleyin."
  exit 1
fi

exec npm run dev
