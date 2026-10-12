#!/bin/zsh
# Yerel TEK KULLANIMLIK bench DB'sini sıfırdan kurar: drop → create → prisma db push → sentetik seed.
# Guard: yalnız 127.0.0.1 ve adında "bench" geçen DB (seed-egress-bench.ts de aynı kontrolü yapar).
#   scripts/bench/reseed-bench-db.sh [db_adı]     (varsayılan: neviihub_egress_bench_p0)
# Önce/sonra karşılaştırmasında HER koşudan önce çalıştırın (tool bench'i veriyi değiştirir).
set -e
DB=${1:-neviihub_egress_bench_p0}
[[ "$DB" == *bench* ]] || { echo "DB adı 'bench' içermeli: $DB" >&2; exit 1; }
export DATABASE_URL="postgresql://${USER}@127.0.0.1:5432/$DB"
cd "$(dirname "$0")/../.."
dropdb -h 127.0.0.1 --if-exists "$DB"
createdb -h 127.0.0.1 "$DB"
npx prisma db push >/dev/null
STORE_MODE=db npx tsx scripts/bench/seed-egress-bench.ts 2>&1 | tail -1
