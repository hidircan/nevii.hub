-- DB egress — sorgu başına TAHMİNİ DB→uygulama baytı (2026-10-18). SALT OKUMA; Supabase SQL Editor'da veya
-- psql ile (session 5432) çalıştırılır. pg_stat_statements son sıfırlamadan beri birikir (stats_reset aşağıda).
-- Tahmin = dönen satır × Σ(kolonun dolu-değer genişliği × doluluk oranı + 4 B uzunluk sözcüğü) (pg_stats).
-- Faturalanan egress protokol ek yükünü de içerir; sıralama içindir, mutlak değer Supabase Usage → Egress'tedir.
-- COPY/pg_dump satırları (yedek/geri yükleme) hariç.
with q as (
  select queryid, calls, rows, query,
         split_part(query, ' FROM ', 1) as sel,
         (regexp_match(query, ' FROM "public"\."([A-Za-z_]+)"'))[1] as tbl
  from pg_stat_statements
  where query ~ '^SELECT "public"\.' and rows > 0
), cols as (
  select q.queryid, sum(coalesce(s.avg_width, 8) * (1 - coalesce(s.null_frac, 0)) + 4) as width
  from q
  cross join lateral regexp_matches(q.sel, '"public"\."([A-Za-z_]+)"\."([A-Za-z_]+)"', 'g') as m(arr)
  left join pg_stats s on s.schemaname = 'public' and s.tablename = m.arr[1] and s.attname = m.arr[2]
  group by q.queryid
)
select (select stats_reset from pg_stat_statements_info) as since,
       q.tbl, q.calls, q.rows, round(q.rows::numeric / q.calls) as rows_per_call, c.width as row_bytes,
       pg_size_pretty((q.rows * c.width)::bigint) as est_total,
       pg_size_pretty((q.rows * c.width / q.calls)::bigint) as est_per_call,
       left(regexp_replace(q.query, '"public"\.', '', 'g'), 120) as query
from q join cols c using (queryid)
order by q.rows * c.width desc
limit 25;
