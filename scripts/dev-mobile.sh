#!/usr/bin/env bash
# NEVII HUB — kanonik mobil (Expo) uygulamasını başlatır. Sadece kanonik depo kökünden çalışır.
set -euo pipefail

CANONICAL_REPO_ROOT="/Users/hidircanyagiz/Projects/notaplan"
MOBILE_DIR="$CANONICAL_REPO_ROOT/apps/mobile"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

if [ "$SCRIPT_DIR" != "$CANONICAL_REPO_ROOT" ]; then
  echo "HATA: Bu script yalnızca kanonik depodan çalıştırılabilir." >&2
  echo "  Beklenen : $CANONICAL_REPO_ROOT" >&2
  echo "  Bulunan  : $SCRIPT_DIR" >&2
  echo "Bir geçici worktree'deki mobil kodu asla kanonik kabul etmeyin." >&2
  exit 1
fi

if [ ! -d "$MOBILE_DIR" ]; then
  echo "HATA: $MOBILE_DIR bulunamadı." >&2
  exit 1
fi

cd "$CANONICAL_REPO_ROOT"
BRANCH="$(git branch --show-current 2>/dev/null || echo '(detached HEAD)')"
COMMIT="$(git log -1 --format='%h — %s' 2>/dev/null || echo '?')"

echo "================================================================"
echo " NEVII HUB — CANONICAL MOBILE APP"
echo "================================================================"
echo "Klasör    : $MOBILE_DIR"
echo "Branch    : $BRANCH"
echo "Commit    : $COMMIT"
echo "Komut     : npx expo start (apps/mobile içinden)"
echo
echo "Bağlantı modu:"
echo "  LAN (varsayılan)  : telefon ve bilgisayar aynı Wi-Fi'de olmalı."
echo "  Tunnel            : farklı ağlardaysa 'npx expo start --tunnel' kullanın"
echo "                       (daha yavaştır, sadece LAN çalışmazsa tercih edin)."
echo "================================================================"

cd "$MOBILE_DIR"
exec npx expo start
