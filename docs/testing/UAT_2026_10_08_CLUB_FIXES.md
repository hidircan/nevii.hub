# UAT — 2026-10-08 kulüp düzeltmeleri (owner canlı testi)

Ön koşul: `20261007120000_club_applications` ve `20261008090000_club_total_lessons_fee_months` migration'ları canlı
DB'de uygulanmış, ardından PR merge edilmiş olmalı. Bu adımlar ajan tarafından ÇALIŞTIRILMADI.

1. **Üye arama** — Kulüpler → kulüp → "Üye ekle": kutu boşken liste kapalı; "şük" yazınca "Şükrü" çıkar (Türkçe harf
   katlama); aynı adlılar şube · doğum yılı · telefonun son 4 hanesiyle ayrılır; mevcut üye "Zaten üye" (seçilemez).
   Ok tuşları/Enter/Escape, dışarı tıklama kapatır; × seçim ve aramayı temizler.
2. **Sonlandır** — aktif üyede "Üyeliği sonlandır" → satır hemen "Ayrılan üyeler"e geçer; üye sayısı ve kontenjan düşer;
   ayrılan üyede sonlandır eylemi yok. Eski (bitişi bugün olan) üyelikler de artık ayrılanlarda.
3. **Sil** — aktif ve ayrılan üyede "Üyeliği sil" → onay (öğrenci + kulüp adı) → üyelik kaybolur; ödenmemiş kulüp ücreti
   Ödemeler'de "iptal" olarak kalır (silinmez); öğrenci kaydı duruyor; kişi yeniden eklenebiliyor. Tahsilatlı üyelikte
   silme reddedilir ve "Üyeliği sonlandır" önerilir.
4. **Genç** — Kulübü düzenle → Yaş grubu: Çocuk / Genç / Yetişkin; portal filtresinde "Genç". Mevcut değerler aynı.
5. **Toplam ders / ay sayısı** — Kulübü düzenle: "Toplam ders sayısı" (başvuruya açmak için gerekli), aylık ücrette
   "Ödeme alınacak ay sayısı" (boş = üyelik sürdükçe). Detayda "Toplam ders: X · planlı Y"; fark varsa uyarı.
6. **Oturum planla** — "Haftalık tekrar sayısı" elle yazılır (1–52, ilk hafta dahil); aynı planı ikinci kez kaydetmek
   "zaten planlı" der, mükerrer oturum açmaz.
7. **Portal** — /basvuru/<kurum>/kulup: önce grup; bilgi alanları ancak grup seçilince açılır; "Grup seçimini kaldır"
   alanları gizler (yazılanlar korunur); özet "Toplam ders sayısı: X" gösterir; "Eğitim geçmişi" boş/boşlukla gönderilemez.
   `?kulup=<geçerli id>` doğrudan bilgi alanlarını açar; geçersiz id uyarı gösterir. Panel başvuru detayında
   "Eğitim geçmişi" etiketi; eski boş başvurular "Belirtilmemiş".
