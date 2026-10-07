# UAT — Grup dersi başvuru portalı ve kulüp yönetimi (2026-10-07)

Kapsam: kulüp taslak/başvuruya açık ayrımı, halka açık portal `/basvuru/<kurum>/kulup`, Kulüpler → Başvurular,
"Kulübe ekle" (öğrenci eşleştirme → önizleme → onay), dahil solfej, tarih düzeltme, üye ekleme araması.
Migration: `20261007120000_club_applications` (yalnız eklemeli; mevcut kulüpler başvuruya KAPALI kalır).

## Yayın sırası (owner makinesinde)
1. `export DATABASE_URL="<canlı session pooler 5432 adresi>"` (sır dosyadan okunur, ekrana yazılmaz)
2. `bash scripts/ops/release-2026-10-07-club-applications.sh` → yedek + doğrulama + migration + son kontrol.
3. Kod: `git push origin <commit>:main` (hızlı ileri) → Vercel READY (fra1) → `/api/v1/health`, `/api/v1/ready`,
   `/basvuru/<slug>/kulup` 200, panel girişi + `/panel/kulupler`, `/panel/kulupler/basvurular`.
Sıra önemli: migration'sız kod `main` build'inde migration kapısında durur (canlı önceki sürümde kalır).

## Sekiz kulübü oluşturma
Kulüpler → "+ Yeni kulüp". Taslak için ad, alan (enstrüman), kontenjan, ücret, ders süresi yeter; öğretmen ve üye
gerekmez. Portalda görünmesi için: yaş grubu (Çocuk/Yetişkin), şube, başlangıç ve bitiş tarihi + "Başvuruya açık".
Önerilen sıra: önce iki Solfej kulübü (Solfej — Çocuk, Solfej — Yetişkin; alan "Solfej" — listede yoksa
Enstrümanlar ekranından bir kez ekleyin), sonra Keman/Gitar/Şan × Çocuk/Yetişkin ve her birinde "Dahil solfej
kulübü"nden aynı yaş grubundaki solfeji seçin. Ücretin niteliği: Aylık / Dönemlik / Toplam.

## Kısa senaryolar
1. **Taslak + açma:** Kulübü yalnız ad/alan/ücretle kaydet → kart "Başvuruya kapalı". Anahtara bas → eksikler
   (grup, şube, tarih) tek cümlede söylenir. "Kulübü düzenle"den tamamla, tarihleri değiştir/düzelt → aç.
2. **Portal:** Kulüpler ekranında "Başvuru portalını aç" (oturumsuz pencerede de dene). Kulüp seç → özet kartı
   (tarih, gün/saat, şube adresi, ücret niteliği, dahil olanlar, dahil solfej); öğretmen adı hiçbir yerde yok.
   Boş gönder → hatalar alanların yanında, yazdıkların silinmez. Doldur → kulüp adı + KB-xxxxxx referansı.
3. **Kardeş:** Aynı telefonla ikinci çocuk için başvur → kabul edilir; panelde "aynı telefonla başka başvuru" notu.
4. **Bildirim + liste:** Zilde "Yeni grup dersi başvurusu" → tıkla → başvuru detayı açılır. Başvurular listesinde
   kulüp/şube/durum/tarih filtresi ve ad/telefon araması; durumu "İletişime geçildi" yap, not yaz.
5. **Kulübe ekle:** Detayda öğrenciyi öneriden/aramadan seç (yoksa "Aday bilgileriyle yeni öğrenci kaydı aç" →
   kayıttan sonra başvuruya döner) → Önizle (öğrenci, kulüp/şube, kapasite, dahil solfej, ücret notu) → Onayla.
   Hızlı iki kez tıkla → tek üyelik. Öğrencinin Ödemeler'inde yeni borç YOK.
6. **Dahil solfej:** Keman başvurusunu ekle → Solfej kulübünde 0 ₺ "Dahil" üye. Aynı öğrenciyi Gitar'a da ekle →
   solfejde ikinci üyelik açılmaz. Keman üyeliğini sonlandır → solfej kalır; Gitar'ı da sonlandır → solfej de biter.
7. **Tarih düzeltme / geri alma:** Üye satırında "Tarihleri düzelt"; "Üyeliği sonlandır" sonrası "Ayrılan üyeler"de
   "Sonlandırmayı geri al". Oturum ekranında "Oturumu düzelt" (yanlış saat; isterseniz sonraki haftalar da kayar).

## Bilinen sınırlar
- Başvurudan açılan üyelikte ücret otomatik borçlanmaz: aylık kulüpte sonraki aylar mevcut aylık tahakkukla yazılır;
  başlangıç ayı için üye satırındaki "Başlangıç ücretini yaz". Dönemlik/toplam ücret yalnız bu düğmeyle yazılır.
- Yeni öğrenci kaydı (sadece kulüp) için kulübün o alanda öğretmeni olmalı (öğrenci kaydı öğretmen ister).
- Bildirim yalnız uygulama içi (kurum yöneticileri); bu kategori için e-posta/push kanalı yok.
- Oturum planlamak için kulübün en az bir aktif üyesi ve öğretmeni olmalı (oturum = üye başına ders satırı).
