# Öğretmen / Bildirim / Senkron — Teslim Dokümanı

Tarih: 2026-09-20 · Branch: `release/mobile-review`
Önceki dokümanlar: `MOBILE_GUARDIAN_MULTI_STUDENT.md` (guardian sözleşmesi),
`MOBILE_STORE_RELEASE_CHECKLIST.md` (store kapıları — bu turda geçerli, bkz. §7).

## 1. Teknik plan ve API etkisi (özet)

| Değişiklik | API etkisi | Güvenlik etkisi |
|------------|------------|-----------------|
| `GET /api/v1/mobile/my-children` (yeni) | Salt-okunur; auth zorunlu; tenant/user session'dan; RBAC değişikliği yok | PII-minimize; invited/revoked asla; profil okuma başına `assertStudentAccess` |
| Schedule `branchName` zenginleştirmesi (2 tool) | Display-only alan; yetki/filtre aynı | Yok (kurum içi görünen veri) |
| Öğretmen program/tab/header/müfredat-dışı tüm mobil işler | Yok | Read-only kilitler testle genişletildi |
| Foreground tazeleme (8 ekran) | Ek GET istekleri (aynı uçlar, aynı yetki) | Yok |

## 2. Commit listesi ve test sonuçları

- `657eb4d` my-children endpoint + mobil bağlantı — backend 6 test PASS, mobil 240 PASS.
- `942b43b` öğretmen haftalık program + şube adı — typecheck/test PASS.
- `efb1427` öğretmen panel rework (Hakediş sekmesi, header hesap ikonu) — 244 PASS.
- `eb42272` foreground standardı + senkron sözleşmesi — 248 PASS (33 dosya).
- `apps/mobile`: typecheck PASS · `npm test` 33 dosya / 248 test PASS.
- `verify:mobile-bundle` her ilgili committe PASS (son çalıştırma teslim öncesi tekrarlanacak).
- ESLint değişen dosyalarda temiz. `expo-doctor` ortam engelli (npm cache EPERM + yerel CLI "not supported") — kod dışı, kayda geçti.

## 3. Guardian multi-child sözleşmesi (güncel)

Önceki dokümandaki sözleşme geçerli + bu turda bağlandı: `StudentProvider`
login/restore sonrası `GET /api/v1/mobile/my-children` çeker; liste doluysa
picker/switcher/metadata oradan beslenir, boş/hatalıysa tekil session fallback
(geri uyumlu). SELF → `[]` (picker yok). Persist tercih liste-karşı doğrulamalı.
Erişim iptali → sonraki focus/foreground/session doğrulamasında picker'a dönüş.

## 4. `my-children` API sözleşmesi ve güvenlik testleri

`src/app/api/v1/mobile/my-children/route.ts`: auth zorunlu; `listAccessForUser`
+ `status==="active"` + GUARDIAN filtresi; kayıt başına `getStudentProfileTool`
(`assertStudentAccess` çift katman); yanıt `{id, displayName, accessType,
photoPath, instruments, teacherName}`; sıra displayName (tr) + id; SELF/öğretmen
→ `[]`; tokensız → 401. Testler (`mobile-my-children.test.ts`): 2 çocuk sıralı
liste, invited/revoked hariç, SELF/öğretmen `[]`, izolasyon, 401.

## 5. Öğretmen before-after özeti

- Ana ekran: gün-şeridi + "Kapanış bekleyen" listesi → varsayılan ayrıntılı
  HAFTALIK PROGRAM (günlük bölümler, hafta gezinme, "Bu haftaya dön", tarih
  aralığı, kapalı-gün satırı, boş-gün metni, loading/error/PTR).
- Kartlar: "Yoklama bekliyor" rozeti kaldırıldı (`showStatus={false}`);
  şube adı (business ikonu) + oda ikincil bilgi olarak eklendi.
- Sekmeler: Program / Öğrencilerim / Ödevler / **Hakedişlerim** (26pt ikon,
  13pt etiket, 64pt bar); İş Takip → Hesabım içi; Hesabım sekmesi kaldırıldı →
  zil SAĞINDA profil ikonu (44pt, "Hesabım" etiketli) 4 sekme kökünde.
- Ders detayı: salt-okunur + yönetici-yoklama bilgi bandı aynen.
- Eski `/hafta` route'u ana görünüme `Redirect` (deep-link uyumluluğu).

## 6. Bildirim mimarisi — UYGULANMADI (onay/altyapı blocker'ı)

Mevcut durum (doğrulandı): push altyapısı YOK (`expo-notifications`/FCM/APNs/
token tablosu sıfır eşleşme); in-app bildirimler VAR (pull + rozet + tick ucu
`NOTIFICATION_CRON_SECRET` korumalı, ancak cron'a bağlı DEĞİL — `vercel.json`
minimal); ayar ekranı fiilen yalnız `inAppEnabled` kullanır.
Sahte local-notification yapılmadı.

Onay gerektiren tasarım (uygulanmadı):
- Cihaz token tablosu (userId+tenantId kapsamlı), `expo-notifications` + izin
  akışı, APNs/FCM/EAS kimlik bilgileri, harici cron (5–15 dk) → tick;
  tick Europe/Istanbul'a göre 60/15 dk kala hesaplar, `(lessonId+offset)`
  dedupe tablosu, ders değişim/iptalinde iptal; deep-link
  `neviihub://(teacher)/bugun/{lessonId}` + sahiplik kontrolü, eskime/güvenli
  hata; PII-minimize metin (saat+şube, kilit ekranında öğrenci adı yok);
  OS izni + kategori tercihleri (`pushEnabled` fiilen gönderilmiyor — önce
  backend kabulü gerekir).
- Gerçek cihaz test planı: izin kapalı/açık, 60/15 dk tetikleme, çift
  gönderim yok, iptal/değişiklikte susma, deep-link doğru ders + yetkisiz
  derste güvenli hata, kilit-ekranı metin denetimi (iOS + Android).

## 7. Web-mobil veri senkron / parite matrisi

Standart (testle kilitli `sync-standard.test.ts`): liste/ana ekranlar focus +
foreground; PTR tüm kaynakları yeniler (öğrenci evi 8 kaynak); `useApiGet`
kalıcı cache tutmaz; kritik mutation sonrası dönüş listesi focus ile tazeler;
login/restore/switch sonrası tam yeniden doğrulama; revoke → sonraki
doğrulamada picker/empty-state.

| Web (admin) aksiyonu | Mobil persona/ekran | Yenileme | Maks. gecikme* | Test |
|----------------------|---------------------|----------|----------------|------|
| Ders oluştur/değiştir/iptal | Öğretmen Program, öğrenci/veli program+ev | focus+foreground+PTR | foreground dönüşü | UAT 13 |
| Ödev ver | Öğrenci/veli ödev+ev | focus+foreground+PTR | foreground dönüşü | UAT 13 |
| Ödeme/tahsilat | Ödeme ekranları | focus+foreground+PTR | foreground dönüşü | UAT 13 |
| Yoklama (admin) | Veli yoklama özeti, öğretmen kartları (rozetsiz) | focus+foreground+PTR | foreground dönüşü | UAT 13 |
| Erişim ver/iptal (portal) | Picker, çocuk bağlamı, tüm kapsamlı ekranlar | liste her açılışta + focus/foreground | bir sonraki doğrulama | unit + UAT 6 |
| Şube/öğretmen adı değişimi | Program kartları (branchName) | focus+foreground | foreground dönüşü | UAT 13 |
| Duyuru | Bildirimler (in-app pull) | pull + rozet | tick cron'a bağlı (şu an manuel) | UAT 12-kısmi |

\* Gerçek-realtime YOK — bilinçli karar: kırılgan polling yapılmadı. Realtime
gereksinimi doğarsa öneri: tenant+rol+kapsam izoleli event/WebSocket,
auth+reconnect+idempotency+ordering ile — önce onay.

## 8. Store/release blocker listesi (güncel)

Değişmedi, hâlâ blocker: Gizlilik Politikası URL, Kullanım Koşulları URL,
public hesap-silme talep URL'i, backend self-service deletion endpoint'i
(yerine kurum-yöneticisi bilgi akışı var; sahte başarı mesajı YOK).
Eklenen: öğretmen sekme/header değişikliği görsel UAT ister (madde 9-11);
`branchName` yanıtsal alan — privacy beyanını etkilemez (kurum içi veri).

## 9. Gerçek cihaz UAT checklist

1. Açık tema + splash marka görünürlüğü. 2. Üç persona girişi. 3. Login↔welcome
tek-adım + restore. 4. SELF akışı. 5. Tek-çocuk veli. 6. Çok-çocuk: seçim,
switcher, revoke, restore. 7. Değişimde eski veri görünmemesi. 8. Öğretmen:
varsayılan haftalık program, şube adı, yoklama ibaresi yok. 9. İş Takip panelde
yok / Hesabımda var; Hakedişlerim panelde. 10. Hesap ikonu zil sağında.
11. Müsaitlik read-only. 12. Bildirimler: in-app pull+rozet (push: plan onayı
sonrası cihaz testi §6). 13. Web değişikliği → focus/foreground sonrası doğru
veri (program, ödev, ödeme, erişim). 14. Küçük iPhone/büyük font/dark+light/
klavye/offline/timeout/expired-token/logout. 15. Android smoke.

## 10. Sonraki admin mobil faz planı

Bu turda admin'e dokunulmadı (yoklama akışı testle kilitli, aynen).
P0 (mobil gerekli): yoklama alma, temel öğrenci/personel görüntüleme,
erişim/davet yönetimi. P1: tahsilat/ödeme özeti, duyuru/mesaj, onay akışları
(telafi/müsaitlik). P2: raporlar, ileri ayarlar — web-only.
Müfredat notu (öğretmen): öğretmen-kapsamlı müfredat LİSTE ucu YOK
(`POST /curriculum`, `[topicId]`, `bulk-assign` ve per-student okuma var);
öğrenci-detayındaki mevcut "Müfredat ilerlemesi" korunur. Bağımsız Müfredat
ekranı için backend liste ucu gerekir — sahte ekran yapılmadı (blocker).
