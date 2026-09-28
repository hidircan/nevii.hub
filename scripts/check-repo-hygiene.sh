#!/bin/sh
# check-repo-hygiene.sh — uygulama dışı içerik + büyük ikili dosya bekçisi.
#
# NE YAPAR:
#   1. HATA: reklam-paketi/, pazarlama/, marketing/, ads/, assets-temp/ gibi
#      uygulama dışı dizinler worktree'de VARSA veya git'te izleniyorsa durur.
#   2. HATA: taranan dosyalardan 1 MB'tan büyük olan varsa durur (mevcut ağaçta
#      1 MB üstü izlenen dosya YOK; en büyükler ~977 KB ikon PNG'ler).
#   3. UYARI: medya uzantılı dosyaları listeler (mp4/mp3/png/...) — uyarmak için,
#      durdurmaz. Meşru istisnalar (public/ ikonları) uyarıda görünür, geçer.
#
# KULLANIM:
#   bash scripts/check-repo-hygiene.sh --staged   # pre-commit: yalnız staged dosyalar
#   bash scripts/check-repo-hygiene.sh --tree     # CI: izlenen tüm dosyalar
# Kurulum: npm run hooks:install  (core.hooksPath -> scripts/git-hooks)
set -eu

MODE="${1:---staged}"
MAX_BYTES=1048576
FORBIDDEN_DIRS="reklam-paketi pazarlama marketing ads assets-temp"
MEDIA_EXT="mp4|mov|mkv|avi|webm|m4v|mp3|wav|m4a|ogg|flac|png|jpg|jpeg|gif|webp|svg|ico|bmp|tiff|tif|psd|ai"

errors=0
warns=0

say() { printf '%s\n' "$*"; }
err() { say "HYGIENE-ERROR: $*"; errors=$((errors + 1)); }
warn() { say "HYGIENE-WARN: $*"; warns=$((warns + 1)); }

# --- 1. yasak dizinler (worktree + git izleme) ---
for d in $FORBIDDEN_DIRS; do
  if [ -e "$d" ]; then
    err "uygulama dışı dizin worktree'de: $d/ — repo dışına taşı (örn. ~/Desktop/) ve .gitignore'a ekle."
  fi
  if git ls-files --error-unmatch "$d" >/dev/null 2>&1 || [ -n "$(git ls-files "$d" 2>/dev/null)" ]; then
    err "uygulama dışı dizin git'te İZLENİYOR: $d/ — izlemeyi kaldır, geçmişe girdiyse owner onayı al."
  fi
done

# --- taranacak dosya listesi ---
list_files() {
  if [ "$MODE" = "--tree" ]; then
    git ls-files -z
  else
    git diff --cached --name-only -z --diff-filter=ACMR
  fi
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
list_files > "$tmp/files" 2>/dev/null || true

count=0
large_list=""
media_list=""
while IFS= read -r -d '' f; do
  [ -n "$f" ] || continue
  [ -f "$f" ] || continue
  count=$((count + 1))
  size="$(wc -c < "$f" | tr -d ' ')"
  case "$size" in ''|*[!0-9]*) continue;; esac
  if [ "$size" -gt "$MAX_BYTES" ]; then
    large_list="${large_list}${size} ${f}\n"
  fi
  case "$f" in
    *.mp4|*.mov|*.mkv|*.avi|*.webm|*.m4v|*.mp3|*.wav|*.m4a|*.ogg|*.flac|*.png|*.PNG|*.jpg|*.JPG|*.jpeg|*.gif|*.webp|*.svg|*.ico|*.bmp|*.tiff|*.tif|*.psd|*.ai)
      media_list="${media_list}${size} ${f}\n"
      ;;
  esac
done < "$tmp/files"

if [ -n "$large_list" ]; then
  # shellcheck disable=SC2059
  printf "$large_list" | sort -rn > "$tmp/large"
  while IFS= read -r line; do
    [ -n "$line" ] && err "1 MB üstü dosya ($line bayt) — ikili/medya repo'ya eklenmez."
  done < "$tmp/large"
fi
if [ -n "$media_list" ]; then
  # shellcheck disable=SC2059
  printf "$media_list" | sort -rn > "$tmp/media"
  while IFS= read -r line; do
    [ -n "$line" ] && warn "medya dosyası: $line bayt — gerçekten repo'da olmalı mı?"
  done < "$tmp/media"
fi

say "hygiene: $count dosya tarandı (mod=$MODE), $errors hata, $warns uyarı."
if [ "$errors" -gt 0 ]; then
  say "hygiene: BAŞARISIZ — yukarıdaki HATA satırlarını düzelt (atlamak için: git commit --no-verify)."
  exit 1
fi
exit 0
