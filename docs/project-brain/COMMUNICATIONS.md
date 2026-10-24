# COMMUNICATIONS.md — pointer

Kaynak: `src/lib/email/*` (nodemailer, SMTP-or-console transport) +
`docs/agent-memory/PROJECT_STATE.md` (2026-08-31 girişi, karşılama e-postası
yeniden yazımı) + kök talimatların "E-posta ve davet akışı için zorunlu
kontrol" bölümü.

## DOĞRULANDI (PROJECT_STATE.md üzerinden, koddan tekrar doğrulanmadı bu taramada)
- `sendAccountInvitationEmail`, öğrenci/veli VE öğretmen davet akışlarına
  bağlı (`inviteStudentPortalAccessTool`/`inviteTeacherAccountTool`).
- E-posta gerçekten gönderilmeden başarı sonucu dönülmüyor (iddia —
  `communications-email` skill'i her kullanımda bunu kodda yeniden
  doğrulamalı, tekrar okunmadan gerçek sayılmamalı).
- Mobil app store linkleri env var yokken tamamen gizleniyor (kırık link yok).

## Portal Erişim Yönetimi — yeni e-posta akışları (2026-08-31)
- `sendPasswordResetEmail` (`src/lib/auth/invitation.ts`, YENİ) — admin-tetikli
  "şifre sıfırlama bağlantısı gönder" VE self-servis "şifremi unuttum" akışı
  (`POST /api/v1/auth/forgot-password` — daha önce sessizce e-posta
  GÖNDERMİYORDU, bu oturumda düzeltildi) tarafından ortak kullanılıyor.
  Bağlantı `getAppBaseUrl()` ile üretilir — base URL asla hardcode edilmez,
  production DNS bağlanmadan önce (bkz. TASK_BOARD.md) kırık localhost
  linki gönderilmez.
- Öğretmen daveti öğrenci/veli şablonuyla KARIŞMAZ — `sendAccountInvitationEmail`
  `role: "TEACHER" | "STUDENT"` parametresine göre ayrı karşılama metni
  kullanır ("ekibine hoş geldiniz" vs "ailesine hoş geldiniz") — bu ayrım
  `portal-access-management.test.ts`de test edilir.
- Gönderim hatası admin'e `delivered:false` + `blocked?:boolean` olarak
  gösterilir — sağlayıcının HAM hata metni (`reason`) ServiceResult'a hiç
  DAHIL edilmez, admin'e asla sızdırılmaz.

## Öğretmen iletişim ve portal giriş adresi (2026-10-14)
- `Teacher.email` iletişim adresidir; bağlı `User.email` portal giriş adresidir.
  Hesap eşleştirmesi yalnızca tenant ve `teacherId` ilişkisiyle yapılır; ad
  benzerliği kullanılmaz. Profil düzenlemesi aktif hesabın giriş adresini
  değiştirmez ve Portal Erişimi kartı iki adresi ayrı etiketlerle gösterir.
- Bekleyen davetin iletişim adresi değişirse kullanılmamış davet token'ı
  iptal edilir; yeni davet otomatik gönderilmez. Yönetici açıkça “Davet gönder”
  dediğinde bekleyen hesabın adresi güncel iletişim adresine alınır ve davet
  gerçek alıcı parametresine bu adres verilir. Kabul edilmiş hesaplar bu yolla
  devredilmez; giriş adresi öğretmenin doğrulama akışıyla değiştirilir.
- Davet token'ları `purpose: invitation` ile parola sıfırlama token'larından
  ayrılır. Şema/migration değişiklikleri için migration uygulanmadan DB
  modundaki yeni kodu çalıştırmayın; ortam migration'ı ayrıca onaylanmalıdır.

## Zorunlu kontrol listesi (kök proje talimatından)
Token: tahmin edilemez / süreli / tek kullanımlık / tenant+kullanıcı bağlı /
mümkünse hashlenmiş. Link domaini doğru (localhost sızıntısı yok). Parola
düz metin gönderilmiyor. Alıcı seçimi (öğrenci/veli/öğretmen) iş kuralına
uygun. Hata durumunda güvenli geri bildirim.

## İlgili skill
`communications-email`
