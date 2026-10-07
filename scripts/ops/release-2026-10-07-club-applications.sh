#!/usr/bin/env bash
# 2026-10-07 — Grup dersi başvuru portalı: CANLI yedek + doğrulama + eklemeli migration.
# Owner makinesinde çalıştırılır (canlı DB kimliği yalnız orada). Sır dosyaya/ekrana YAZILMAZ.
#
# Kullanım (session pooler 5432 adresi — transaction pooler 6543'te migrate asılı kalır):
#   export DATABASE_URL="$(cat ~/NeviiHub-Secrets/<canlı-session-pooler-url-dosyası>)"
#   bash scripts/ops/release-2026-10-07-club-applications.sh
#
# Yaptığı: hedefi doğrular (canlı ref + 5432) → pg_dump -Fc yedek → yedeği pg_restore --list ile doğrular →
# satır sayılarını kaydeder → migrate status (YALNIZ bu migration bekliyor olmalı) → migrate deploy → aynı
# satır sayılarını yeniden ölçer, yeni kolon/tabloyu ve "tüm kulüpler başvuruya kapalı"yı doğrular.
# Mevcut satırlar DEĞİŞMEZ (yalnız ADD COLUMN ... DEFAULT / CREATE TABLE). Geri alma: dosya sonundaki not.
set -euo pipefail

EXPECTED_REF="wsbucznpujcfzhitzrbl"
MIGRATION="20261007120000_club_applications"
BACKUP_DIR="${BACKUP_DIR:-$HOME/NeviiHub-Backups}"

: "${DATABASE_URL:?DATABASE_URL tanımlı değil (canlı session pooler adresi, port 5432).}"
host_port="$(node -e 'const u=new URL(process.env.DATABASE_URL);console.log(u.username+"@"+u.hostname+":"+u.port)')"
case "$host_port" in
  *"$EXPECTED_REF"*":5432") echo "[hedef] canlı DB, session pooler: $(echo "$host_port" | sed 's/^[^@]*@//')";;
  *) echo "[DUR] DATABASE_URL canlı ($EXPECTED_REF) session pooler 5432 değil: $(echo "$host_port" | sed 's/^[^@]*@//')"; exit 1;;
esac

cd "$(git rev-parse --show-toplevel)"
test -f "prisma/migrations/$MIGRATION/migration.sql" || { echo "[DUR] migration dosyası yok — doğru commit'te misiniz?"; exit 1; }

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$BACKUP_DIR/prod-$stamp-pre-club-applications.dump"
echo "[1/6] Yedek alınıyor: $dump"
pg_dump --format=custom --no-owner --no-privileges --schema=public --file "$dump" "$DATABASE_URL"

echo "[2/6] Yedek doğrulanıyor"
list="$(pg_restore --list "$dump")"
for t in Club ClubMembership Payment Student Lesson _prisma_migrations; do
  echo "$list" | grep -q "TABLE DATA public $t " || { echo "[DUR] yedekte $t verisi yok"; exit 1; }
done
echo "      yedek boyutu: $(du -h "$dump" | cut -f1) — tablolar tamam"

count_sql='SELECT (SELECT count(*) FROM "Club") AS club, (SELECT count(*) FROM "ClubMembership") AS membership,
  (SELECT count(*) FROM "Payment") AS payment, (SELECT count(*) FROM "Student") AS student, (SELECT count(*) FROM "Lesson") AS lesson;'
before="$(psql "$DATABASE_URL" -At -c "$count_sql")"
echo "[3/6] Önce (club|membership|payment|student|lesson): $before"

echo "[4/6] Migration durumu"
status="$(npx prisma migrate status 2>&1 || true)"
pending="$(echo "$status" | grep -E '^[0-9]{14}_' || true)"
if [ "$pending" != "$MIGRATION" ]; then
  echo "$status"
  echo "[DUR] Bekleyen migration yalnız $MIGRATION olmalı. Bulunan: ${pending:-yok}"
  exit 1
fi

echo "[5/6] Migration uygulanıyor"
npx prisma migrate deploy

echo "[6/6] Sonra doğrulama"
after="$(psql "$DATABASE_URL" -At -c "$count_sql")"
echo "      Sonra: $after"
[ "$before" = "$after" ] || { echo "[UYARI] satır sayıları değişti (eşzamanlı kullanıcı yazımı olabilir) — kontrol edin."; }
psql "$DATABASE_URL" -At -c 'SELECT count(*) FROM "ClubApplication";' >/dev/null
open_count="$(psql "$DATABASE_URL" -At -c 'SELECT count(*) FROM "Club" WHERE "applicationsOpen" = true;')"
[ "$open_count" = "0" ] || { echo "[DUR] beklenmedik: $open_count kulüp başvuruya açık görünüyor"; exit 1; }
npx prisma migrate status
echo "TAMAM — yedek: $dump. Şimdi kod main'e itilebilir (migration kapısı artık geçer)."
# Geri alma (yalnız gerekirse, owner kararıyla; yeni veri silinir):
#   DROP TABLE "ClubApplication";
#   ALTER TABLE "ClubMembership" DROP COLUMN "applicationId", DROP COLUMN "includedByMembershipIds";
#   ALTER TABLE "Club" DROP COLUMN "applicationsOpen", DROP COLUMN "audience", DROP COLUMN "endDate", DROP COLUMN "feePeriod",
#     DROP COLUMN "includedSolfegeClubId", DROP COLUMN "includesText", DROP COLUMN "internalNote", DROP COLUMN "maxAge",
#     DROP COLUMN "minAge", DROP COLUMN "scheduleText", DROP COLUMN "startDate", DROP COLUMN "waitlistEnabled";
#   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261007120000_club_applications';
