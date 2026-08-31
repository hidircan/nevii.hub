#!/usr/bin/env bash
# NEVII HUB — konum/durum teşhis aracı. Sadece okuma yapar, hiçbir şeyi değiştirmez.
set -euo pipefail

CANONICAL_REPO_ROOT="/Users/hidircanyagiz/Projects/notaplan"
CANONICAL_BRANCH="main"

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
CURRENT_DIR="$(pwd -P)"

echo "================================================================"
echo " NEVII HUB — where-am-i"
echo "================================================================"
echo "Klasör       : $CURRENT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Git deposu   : DEĞİL (bu bir git çalışma ağacı değil)"
  exit 0
fi

BRANCH="$(git branch --show-current 2>/dev/null || echo '(detached HEAD)')"
COMMIT="$(git log -1 --format='%h' 2>/dev/null || echo '?')"
COMMIT_SUMMARY="$(git log -1 --format='%ad | %s' --date=short 2>/dev/null || echo '?')"
DIRTY_COUNT="$(git status --short 2>/dev/null | wc -l | tr -d ' ')"

echo "Branch       : $BRANCH"
echo "Commit       : $COMMIT"
echo "Son commit   : $COMMIT_SUMMARY"
if [ "$DIRTY_COUNT" -eq 0 ]; then
  echo "Durum        : temiz (commit edilmemiş değişiklik yok)"
else
  echo "Durum        : KİRLİ — $DIRTY_COUNT dosyada commit edilmemiş değişiklik var"
fi

echo
GIT_COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null || echo '?')"
GIT_DIR="$(git rev-parse --git-dir 2>/dev/null || echo '?')"

if [ "$CURRENT_DIR" = "$CANONICAL_REPO_ROOT" ] && [ "$BRANCH" = "$CANONICAL_BRANCH" ]; then
  echo "Sınıf        : CANONICAL — bu, kanonik Nevii Hub deposu ve kanonik branch."
elif [ "$CURRENT_DIR" = "$CANONICAL_REPO_ROOT" ]; then
  echo "Sınıf        : CANONICAL KLASÖR, farklı branch ($BRANCH) — main'e geçmeyi düşünün."
elif [[ "$GIT_DIR" == *"/.git/worktrees/"* ]]; then
  echo "Sınıf        : GEÇİCİ WORKTREE — bu klasör kanonik değildir, 'latest' olarak görülmemeli."
  echo "               Kanonik depo : $CANONICAL_REPO_ROOT (branch: $CANONICAL_BRANCH)"
else
  echo "Sınıf        : BİLİNMİYOR — kanonik depoyla ilişkisi belirsiz, elle incele."
fi

echo
echo "Web (Next.js)   : $(test -f package.json -a \( -f next.config.js -o -f next.config.ts -o -f next.config.mjs \) && echo 'mevcut (npm run dev)' || echo 'bulunamadı')"
echo "Mobile (Expo)   : $(test -d apps/mobile && echo 'mevcut (apps/mobile)' || echo 'bulunamadı')"

echo
PORT_PID="$(lsof -ti tcp:3000 2>/dev/null || true)"
if [ -n "$PORT_PID" ]; then
  echo "Port 3000       : DOLU — PID $PORT_PID"
  ps -o pid,command -p "$PORT_PID" 2>/dev/null | tail -n +2 || true
else
  echo "Port 3000       : boş"
fi
echo "================================================================"
