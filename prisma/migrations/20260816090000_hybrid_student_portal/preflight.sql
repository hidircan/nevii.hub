-- Karma Öğrenci Portalı — migration ÖNCESİ salt-okunur (read-only) doğrulama
-- sorguları. Hiçbir INSERT/UPDATE/DELETE YOK. Migration'ı hedef ortama
-- (staging/production) uygulamadan ÖNCE bu dosyayı elle çalıştırıp
-- sonuçları gözden geçirin — özellikle #2'nin (geçersiz studentId'li PARENT
-- kullanıcıları) SIFIR olması beklenir; sıfır değilse migration onları
-- SESSİZCE atlar (role='PARENT' olarak kalırlar) ve manuel düzeltme
-- gerekir (studentId'yi düzeltmek veya hesabı devre dışı bırakmak).

-- 1) User.role = 'PARENT' sayısı (toplam dönüştürülecek/incelenecek aday)
SELECT COUNT(*) AS parent_user_count
FROM "User"
WHERE "role" = 'PARENT';

-- 2) studentId'si olmayan/geçersiz PARENT kullanıcı sayısı — bunlar
--    migration tarafından STUDENT'a DÖNÜŞTÜRÜLMEYECEK, manuel incelemeye
--    ayrılacak. "Geçersiz" = studentId NULL OLMASI veya aynı tenant'ta
--    karşılık gelen bir Student satırının OLMAMASI.
SELECT u."id" AS user_id, u."tenantId", u."email", u."studentId"
FROM "User" u
WHERE u."role" = 'PARENT'
  AND (
    u."studentId" IS NULL
    OR NOT EXISTS (SELECT 1 FROM "Student" s WHERE s."id" = u."studentId" AND s."tenantId" = u."tenantId")
  )
ORDER BY u."tenantId", u."email";

-- 2b) Aynı sorgunun sayısı (özet rapor için)
SELECT COUNT(*) AS invalid_or_missing_student_id_parent_count
FROM "User" u
WHERE u."role" = 'PARENT'
  AND (
    u."studentId" IS NULL
    OR NOT EXISTS (SELECT 1 FROM "Student" s WHERE s."id" = u."studentId" AND s."tenantId" = u."tenantId")
  );

-- 3) parentName VE parentPhone İKİSİ DE boş olan öğrenci sayısı
--    (migration'da SELF_MANAGED'e backfill edilecek adaylar)
SELECT COUNT(*) AS both_parent_fields_empty_student_count
FROM "Student"
WHERE COALESCE("parentPhone", '') = ''
  AND COALESCE("parentName", '') = '';

-- 4) Yalnız BİR veli iletişim alanı dolu olan öğrenci sayısı (ikisi de dolu
--    değil, ikisi de boş değil — veri kalitesi açısından ilginç ama
--    migration'da PARENT_MANAGED olarak kalacak, dokunulmayacak grup)
SELECT COUNT(*) AS only_one_parent_field_filled_student_count
FROM "Student"
WHERE (COALESCE("parentPhone", '') = '') <> (COALESCE("parentName", '') = '');

-- 5) Migration sonrası oluşturulması BEKLENEN GUARDIAN StudentPortalAccess
--    sayısı (yalnız geçerli studentId'li PARENT kullanıcıları için — bkz. #2)
SELECT COUNT(*) AS expected_guardian_access_rows
FROM "User" u
WHERE u."role" = 'PARENT'
  AND u."studentId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "Student" s WHERE s."id" = u."studentId" AND s."tenantId" = u."tenantId");

-- 5b) Migration sonrası oluşturulması BEKLENEN SELF StudentPortalAccess
--     sayısı (mevcut STUDENT-role kullanıcıları için — bkz. migration §3)
SELECT COUNT(*) AS expected_self_access_rows
FROM "User" u
WHERE u."role" = 'STUDENT'
  AND u."studentId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "Student" s WHERE s."id" = u."studentId" AND s."tenantId" = u."tenantId");

-- 6) Beklenen accountResponsibility dağılımı (migration sonrası)
--    PARENT_MANAGED = ("parentPhone" veya "parentName" dolu) VEYA (zaten PARENT_MANAGED olarak elle işaretlenmiş)
--    SELF_MANAGED   = ikisi de boş (backfill hedefi) VEYA zaten SELF_MANAGED
SELECT
  CASE
    WHEN COALESCE("parentPhone", '') = '' AND COALESCE("parentName", '') = '' THEN 'SELF_MANAGED (backfill)'
    ELSE 'PARENT_MANAGED (değişmez)'
  END AS expected_account_responsibility,
  COUNT(*) AS student_count
FROM "Student"
GROUP BY 1
ORDER BY 1;
