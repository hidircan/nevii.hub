# Kurum müdürü davet / aktivasyon akışı

**Durum:** Dokümantasyon — bu turda gerçek davet GÖNDERİLMEDİ, gerçek kullanıcı
OLUŞTURULMADI, sabit/açık parola ÜRETİLMEDİ.

Nihal Gedikli, Ezgi Güçlü ile aynı kurum müdürü yetki setine sahip olmalıdır
(`SCHOOL_ADMIN`, finans/personel özeti yok, başka tenant'a geçiş yok). Owner
e-posta adresini vermeden hesap açılmaz.

## Güvenli akış (e-posta verildikten sonra)

Mevcut davet altyapısı (`src/lib/auth/invitation.ts`) düz metin şifre
göndermez. Öğretmen/öğrenci daveti `createPasswordResetToken` (hash'li, tek
kullanımlık, TTL) + aktivasyon linki kullanır.

Kurum müdürü için önerilen adımlar (ayrı onaylı iş kalemi):

1. Owner, Nihal'in e-posta adresini verir.
2. `SCHOOL_ADMIN` kullanıcısı ilgili `tenantId` ile oluşturulur (parola alanı
   yalnız bcrypt hash; düz metin yok).
3. Aynı davet/aktivasyon linki gönderilir; kullanıcı kendi şifresini belirler.
4. Kullanıcı `INSTITUTION_MANAGER_USER_IDS` (veya eşdeğer allowlist) içine
   alınır — böylece Ezgi Güçlü ile aynı finans/personel kısıtı uygulanır.
5. Davet audit kaydı (`receivedBy`/`actorUserId` ile) tutulur.

Bu turda 2–5 **uygulanmadı**.
