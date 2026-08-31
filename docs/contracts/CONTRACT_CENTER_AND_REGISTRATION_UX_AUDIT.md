# Sözleşme Merkezi ve Kayıt UX Denetimi (kısmi — kapsam daraltıldı)

Bu denetim, koordinatörün talimatıyla **sadece 2 madde** için yapıldı: (1) şablon
deposunun gerçek durumu, (2) "Invalid or expired access token" hatasının kök nedeni.
Kayıt ekranı UX'i, PDF çıktısı, DOCX akışı, toplu içe aktarma **bu turda incelenmedi**
— ayrı bir görev.

## 1. Şablon deposunun gerçek durumu (doğrulandı, veri: `data/document-templates.json`, STORE_MODE=json)

Görev talimatındaki varsayım ("muhtemelen bayat aktif şablon `dtpl_ip169tzdn992`")
**artık doğru değil** — veri, bu oturumdan önce (muhtemelen önceki bir çalışmada,
`updatedAt: 2026-08-30T06:03-06:04`) zaten düzeltilmiş:

| ID | `active` | `name` | `updatedAt` |
|---|---|---|---|
| `dtpl_ip169tzdn992` | **false** | Öğrenci Kayıt Sözleşmesi (eski gövde) | 2026-08-30T06:03:54Z |
| `dtpl_nq8gbjawojm3` | **false** | Öğrenci Kayıt Sözleşmesi (kurumsal kaynaktan taslak — 29.08.2026) | 2026-08-30T06:03:54Z |
| `dtpl_fy9artyvontl` | **true** (AKTİF) | Öğrenci Kayıt Sözleşmesi (kurumsal kaynaktan taslak — 29.08.2026) | 2026-08-30T06:04:24Z |

Üçü de `kind: "student_enrollment_contract"`, aynı tenant (`tenant_nilufer_acar`).
`dtpl_fy9artyvontl` ve `dtpl_nq8gbjawojm3` aynı isme/aynı gövde şablonuna sahip
görünüyor (muhtemelen aynı taslağın iki sürümü/denemesi) — `dtpl_nq8gbjawojm3` artık
`active:false` olduğu için "obsolete draft" teşhisi hâlâ geçerli, sadece "hangisi
aktif" sorusu bu oturumdan önce çözülmüş.

**Sonuç:** Aktif şablon şu an `dtpl_fy9artyvontl` (kurumsal kaynak metnine dayanan
taslak) — görevin varsaydığı "bayat eski şablon aktif" durumu artık YOK. Bu maddede
ek aksiyon gerekmiyor; sadece durum teyit edildi. `dtpl_ip169tzdn992` (eski gövde)
tarihsel olarak SİLİNMEDİ, sadece pasif — doğru davranış.

## 2. "Invalid or expired access token" — kök neden (kod okunarak doğrulandı)

**Konum:** `src/lib/auth/authenticate.ts`, `authenticateRequest()`, satır 86-99.

```ts
} catch {
  auditLog({ action: "auth.invalid_token", ... });
  return { ok: false, code: "UNAUTHORIZED", message: "Invalid or expired access token" };
}
```

**Kök neden:** Bu tek `catch` bloğu, aşağıdaki TAMAMEN FARKLI hata durumlarının
HEPSİNİ aynı sabit İngilizce mesaja indirger:

- Gerçekten süresi dolmuş/geçersiz imzalı access token (`verifyAccessToken` fırlatır),
- Access token da refresh cookie de yok (`throw new Error("Missing access and refresh tokens")` — satır 41),
- Refresh token da geçersiz/süresi dolmuş (`verifyRefreshToken` fırlatır).

Yani mesaj hem gerçek "oturum süresi doldu" hem de "hiç giriş yapılmamış/cookie
temizlenmiş" durumunu ayırt etmeden aynı ham İngilizce string olarak API
tüketicisine (Evraklar Merkezi dahil) döner. Bu, `withApiHandler`
(`src/lib/api/handler.ts`) üzerinden geçen HER `/api/v1/*` isteğini etkileyen
SİSTEMİK bir davranış — yalnızca Documents Center'a özgü bir bug değil.

**Yetki (403) hatası ayrı bir yoldan gelir** — `authenticateRequest` sadece
kimlik doğrulamayı (401) kapsıyor; rol/izin reddi (`assertPermission` vb.) farklı
bir mesaj/kod üretiyor, bu nedenle görevin istediği 3 mesaj ayrımından
("oturum süresi doldu" / "yetkiniz yok" / "veri yüklenemedi") ikincisi zaten farklı
bir koddan geliyor — asıl karışan ayrım birincisi (401 alt nedenleri) ile üçüncüsü
(gerçek 5xx/ağ hatası, bu dosyanın kapsamı dışında, çağıran fetch/try-catch'lerde ele alınmalı).

**Bu turda yapılmadı (ayrı Faz 7 işi):** mesajı `authenticateRequest` dönüşünde
alt-koda ayırmak (`TOKEN_EXPIRED` vb.) ve `src/lib/auth/*`'daki tek kanonik oturum
sistemi üzerinden Türkçe kullanıcı mesajına çevirmek + Evraklar Merkezi
diagnostik/preview/aktivasyon çağrılarının hepsinin aynı auth yolunu kullandığını
doğrulamak. Bu denetimde sadece kök neden tespit edildi, düzeltme YAPILMADI.

## Kapsam dışı bırakılanlar (bu turda incelenmedi)

Kayıt ekranı UX'i (Kayıt Planı, Öğrenci Türü, ödeme günü aralığı girişi, para
girişi spinner'ları), PDF çıktı denetimi (font/A4/sayfa kırılımı/ödeme
tablosu/imza), DOCX/DOC/PDF şablon yönetimi kapasitesi, toplu tarihi sözleşme
içe aktarma. Bunlar ayrı görevlerde ele alınacak.
