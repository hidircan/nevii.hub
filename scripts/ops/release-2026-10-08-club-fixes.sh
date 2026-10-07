#!/usr/bin/env bash
# 2026-10-08 — Kulüp düzeltmeleri: CANLI yedek + doğrulama + eklemeli migration(lar).
# Owner makinesinde, PR merge edilmeden ÖNCE çalıştırılır (migration KODDAN ÖNCE). Sır dosyaya/ekrana YAZILMAZ.
# 2026-10-07 betiği "yalnız 20261007120000 bekliyor olmalı" dediği için bu PR ile birlikte onun yerine bunu kullanın:
# bekleyen migration'lar YALNIZ aşağıdaki ikisi (sırayla, biri ya da ikisi) olabilir; başka bir şey bekliyorsa durur.
#
# Kullanım (session pooler 5432 adresi — transaction pooler 6543'te migrate asılı kalır):
#   export DATABASE_URL="$(cat ~/NeviiHub-Secrets/<canlı-session-pooler-url-dosyası>)"
#   bash scripts/ops/release-2026-10-08-club-fixes.sh
#
# Mevcut satırlar DEĞİŞMEZ (yalnız ADD COLUMN nullable/DEFAULT, CREATE TABLE). Geri alma: dosya sonundaki not.
set -euo pipefail

EXPECTED_REF="wsbucznpujcfzhitzrbl"
ALLOWED=("20261007120000_club_applications" "20261008090000_club_total_lessons_fee_months")
BACKUP_DIR="${BACKUP_DIR:-$HOME/NeviiHub-Backups}"

: "${DATABASE_URL:?DATABASE_URL tanımlı değil (canlı session pooler adresi, port 5432).}"
host_port="$(node -e 'const u=new URL(process.env.DATABASE_URL);console.log(u.username+"@"+u.hostname+":"+u.port)')"
case "$host_port" in
  *"$EXPECTED_REF"*":5432") echo "[hedef] canlı DB, session pooler: $(echo "$host_port" | sed 's/^[^@]*@//')";;
  *) echo "[DUR] DATABASE_URL canlı ($EXPECTED_REF) session pooler 5432 değil: $(echo "$host_port" | sed 's/^[^@]*@//')"; exit 1;;
esac

cd "$(git rev-parse --show-toplevel)"
for m in "${ALLOWED[@]}"; do
  test -f "prisma/migrations/$m/migration.sql" || { echo "[DUR] $m dosyası yok — doğru commit'te misiniz?"; exit 1; }
done

echo "[1/6] Migration durumu"
status="$(npx prisma migrate status 2>&1 || true)"
pending="$(echo "$status" | grep -E '^[0-9]{14}_' || true)"
if [ -z "$pending" ]; then echo "Bekleyen migration yok — yapılacak bir şey yok."; exit 0; fi
expected_tail="$(printf '%s\n' "${ALLOWED[@]}" | tail -n "$(echo "$pending" | wc -l)")"
if [ "$pending" != "$expected_tail" ]; then
  echo "$status"
  echo "[DUR] Bekleyen migration'lar yalnız şu sırayla olabilir: ${ALLOWED[*]}. Bulunan: $pending"
  exit 1
fi
echo "      bekleyen: $(echo "$pending" | tr '\n' ' ')"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$BACKUP_DIR/prod-$stamp-pre-club-fixes.dump"
echo "[2/6] Yedek alınıyor: $dump"
pg_dump --format=custom --no-owner --no-privileges --schema=public --file "$dump" "$DATABASE_URL"

echo "[3/6] Yedek doğrulanıyor"
list="$(pg_restore --list "$dump")"
for t in Club ClubMembership Payment Student Lesson _prisma_migrations; do
  echo "$list" | grep -q "TABLE DATA public $t " || { echo "[DUR] yedekte $t verisi yok"; exit 1; }
done

count_sql='SELECT (SELECT count(*) FROM "Club") AS club, (SELECT count(*) FROM "ClubMembership") AS membership,
  (SELECT count(*) FROM "Payment") AS payment, (SELECT count(*) FROM "Student") AS student, (SELECT count(*) FROM "Lesson") AS lesson;'
before="$(psql "$DATABASE_URL" -At -c "$count_sql")"
echo "[4/6] Önce (club|membership|payment|student|lesson): $before"

echo "[5/6] Migration uygulanıyor"
npx prisma migrate deploy

echo "[6/6] Sonra doğrulama"
after="$(psql "$DATABASE_URL" -At -c "$count_sql")"
echo "      Sonra: $after"
[ "$before" = "$after" ] || { echo "[UYARI] satır sayıları değişti (eşzamanlı kullanıcı yazımı olabilir) — kontrol edin."; }
psql "$DATABASE_URL" -At -c 'SELECT count(*) FROM "ClubApplication";' >/dev/null
psql "$DATABASE_URL" -At -c 'SELECT count("feeMonths"), count("totalLessons") FROM "Club";' >/dev/null
npx prisma migrate status
echo "TAMAM — yedek: $dump. Şimdi PR merge edilebilir (migration kapısı artık geçer)."
# Geri alma (yalnız gerekirse, owner kararıyla):
#   ALTER TABLE "Club" DROP COLUMN "feeMonths", DROP COLUMN "totalLessons";
#   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261008090000_club_total_lessons_fee_months';
#   (2026-10-07 migration'ının geri alması: scripts/ops/release-2026-10-07-club-applications.sh sonu)
