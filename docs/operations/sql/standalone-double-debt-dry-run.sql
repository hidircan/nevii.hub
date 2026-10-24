-- SALT OKUNUR (dry-run) — 2026-10-23. Hiçbir satırı DEĞİŞTİRMEZ.
-- Sözleşmenin kapsadığı ayda açık kalmış, HİÇ tahsilat görmemiş sözleşmesiz aylık plan borcu = çift borç adayı.
-- Bu kod sürümünden önce açılmış sözleşmelerden kalır (yeni sözleşmelerde aynı satır sözleşme işleminde askıya alınır).
-- Kriter (hepsi birden):
--   Payment.source = 'monthly_plan', contractId IS NULL, status <> 'voided', paidAmount = 0, paidAt IS NULL
--   aynı öğrencinin canlı sözleşmesi var (status NOT IN cancelled/superseded/draft)
--   aynı branş (sözleşme veya satır branşsız ise eşleşir)
--   satırın dönem ayı (açıklamadaki "Aylık plan — YYYY-MM", yoksa vade ayı) sözleşmenin başlangıç..bitiş ayı içinde
-- Düzeltme ayrıca, owner onayıyla yapılır (bu dosya yazmaz).
with plan as (
  select p.id, p."tenantId", p."studentId", p."enrollmentId", p.amount, p.status,
         coalesce(substring(p.description from '^Aylık plan — (\d{4}-\d{2})'), to_char(p."dueDate", 'YYYY-MM')) as period_month
  from "Payment" p
  where p.source = 'monthly_plan' and p."contractId" is null and p.status <> 'voided'
    and p."paidAmount" = 0 and p."paidAt" is null)
select plan.id as payment_id, s.name, plan.period_month, plan.amount, plan.status,
       c."contractNumber", c.status as contract_status, c."enrollmentStartDate"::date, c."enrollmentEndDate"::date
from plan
join "Student" s on s.id = plan."studentId"
join "StudentContract" c on c."tenantId" = plan."tenantId" and c."studentId" = plan."studentId"
 and c.status not in ('cancelled', 'superseded', 'draft')
 and (c."enrollmentId" is null or plan."enrollmentId" is null or c."enrollmentId" = plan."enrollmentId")
 and plan.period_month between to_char(c."enrollmentStartDate", 'YYYY-MM') and to_char(c."enrollmentEndDate", 'YYYY-MM')
order by s.name, plan.period_month;
