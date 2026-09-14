# EAS ve Gerçek Cihaz Test Hazırlığı (secret içermez)

- Tarih: 2026-09-13 · Kaynak: `apps/mobile/app.json`, `package.json`, `eas.json`, `assets/`.
- EAS build / `eas init` / submit **yapılmadı**.

## 1. Mevcut durum

| Konu | Durum |
|---|---|
| Expo SDK | **57** (2026-09-14, user-approved upgrade: RN 0.86.3, React 19.2.3, TypeScript 6; new architecture her zaman açık — `newArchEnabled` alanı SDK 57 şemasında yok); `expo-doctor` 21/21, `expo config --type public` hatasız |
| Ad / slug / scheme | `Nevii Hub` / `nevii-hub-mobile` / `neviihub` |
| iOS bundle id / Android package | `com.neviihub.mobile` (app.json'da açık; değiştirilmedi) · `supportsTablet: true` |
| Sürüm | `0.1.0`; `eas.json` `appVersionSource: "remote"` (build numarasını EAS yönetir) |
| **App icon** | ✅ `assets/icon.png` — 1024×1024, alfa yok (App Store şartı). Kaynak: repodaki kanonik NeviiHub favicon'u `src/app/icon.png`, byte olarak aynı kopya (test: `app-assets.test.ts`) |
| **Android adaptive icon** | ✅ `assets/adaptive-icon.png` — aynı kaynaktan, güvenli alan için %62.5 ölçekli (640 px) ve 1024×1024 beyaz tuvale ortalanmış (`sips`); `backgroundColor: #FFFFFF` |
| **Splash** | ✅ `expo-splash-screen` plugin'i (SDK 57 üst düzey `splash`'i kabul etmez): `image = ./assets/icon.png`, `resizeMode: contain`, `backgroundColor: #FFFFFF` |
| Kullanılmayan kaynak | `public/brand/logo.png` KULLANILMADI: şeffaflık yerine piksellere gömülü damalı desen var; ayrıca `src/app/icon.png` ile byte olarak farklı (bkz. §5) |
| `eas.json` | `preview` (internal) + `production` (`autoIncrement`); credential/secret yok |
| Dev client | `expo-dev-client` yok → development profili yok (Expo Go) |
| Push | Sağlayıcı bağlı değil; P0'da push yok |

Kaynak görsel şeffaf DEĞİL (beyaz zeminli, opak). iOS icon için doğru; Android adaptive icon'da beyaz arka plan rengiyle
birleşir. Tasarım ekibi şeffaf zeminli bir vektör/PNG teslim ederse `adaptive-icon.png` onunla yeniden üretilmeli (P1).

## 2. Test backend adresi

- İstemci yalnız `EXPO_PUBLIC_API_URL` okur (`src/api/client.ts`); değer repoya yazılmaz.
- EAS dashboard → Environment variables → `preview` ortamına test backend'in **HTTPS** adresi; `eas.json` `preview`
  profili `environment: "preview"` ile gömer. iOS ATS / Android cleartext nedeniyle `https://` zorunlu.
- Test build'i production API'ye işaret etmemeli.

## 3. Manuel kararlar (tahmin EDİLMEDİ)

1. Apple Developer Team ID ve App Store Connect kaydı (`com.neviihub.mobile`).
2. iOS signing (EAS managed mı, mevcut sertifika mı).
3. Google Play Console kaydı ve upload keystore kararı.
4. `supportsTablet` (korunursa iPad ekran görüntüleri gerekir).
5. Store metinleri, gizlilik politikası URL'si, App Privacy / Data safety beyanları.
6. Test backend HTTPS adresi ve test hesapları (öğretmen / öğrenci / veli — §6).
7. `eas init` (owner hesabıyla; `extra.eas.projectId` yazar).
8. (P1) Şeffaf zeminli marka kaynağı ile adaptive icon'un yeniden üretimi.

## 4. TestFlight + Android Internal Testing — kullanıcı aksiyonları

1. `npm i -g eas-cli` → `eas login` → `apps/mobile` içinde `eas init`.
2. Dashboard'da `preview` ortamına `EXPO_PUBLIC_API_URL` (test HTTPS).
3. `eas build --profile preview --platform android` → internal link ile cihaz testi.
4. iOS: ASC kaydı → `eas build --profile production --platform ios` → `eas submit -p ios`.
5. Android: Play Console kaydı → `eas build --profile production --platform android` → `eas submit -p android`.

## 5. Sidebar logo testi — baseline ayrımı

`src/lib/__tests__/sidebar-branding.test.ts` ("public/brand/logo.png ve src/app/icon.png BYTE OLARAK aynıdır")
**başlangıçta da kırık**: `origin/test`/HEAD'de `logo.png` sha1 `ffc97f26e093…`, `icon.png` sha1 `18770ba1eeae…`.
Bu turda iki dosyaya da dokunulmadı (`git diff --quiet HEAD -- public/brand/logo.png src/app/icon.png` ✓); mobil
asset'ler yalnız `apps/mobile/assets/` altına KOPYA olarak üretildi. Hangi dosyanın kanonik olduğu web marka kararıdır (P1).

## 6. Guardian Device UAT Prerequisite

Veli persona'sı (STUDENT + GUARDIAN) için test ortamında: login role `STUDENT`; `StudentPortalAccess` `accessType =
GUARDIAN`, `status = active`; sunucunun doğruladığı gerçek öğrenci ilişkisi; test tenant'ı; gerçek kişiye ait olmayan
test hesabı; kurulum yalnız canonical yönetim akışıyla (SQL/seed yok); parola/token/davet linki dokümana yazılmaz.
Doğrulama: `GET /api/v1/mobile/session` → `portalAccessType: "GUARDIAN"`. Ayrıntı: `MOBILE_P0_HANDOFF.md`.

## 7. Go / No-Go

| Hedef | Karar | Gerekçe |
|---|---|---|
| Expo Go ile gerçek cihaz testi (öğretmen) | **GO** | `EXPO_PUBLIC_API_URL` = Mac LAN IP veya test HTTPS; öğretmen test hesabı |
| Expo Go ile veli testi | **GO, §6 ön koşuluyla** | GUARDIAN test hesabı gerekli |
| EAS internal (preview) build | **NO-GO → §4 adım 1–2 (owner) sonrası GO** | icon/splash artık hazır; kalan: `eas init` + test URL |
| TestFlight | **NO-GO** | Apple Team/ASC kaydı, signing, gizlilik beyanı |
| Android Internal Testing | **NO-GO** | Play Console kaydı, keystore kararı |

Tüm satırlar için ön koşul: §8 bundle gate'i (`npm run verify:mobile-bundle`) exit 0.

## 8. Expo SDK 57 Bundle Gate

- Canonical mobil SDK: **Expo SDK 57** (upgrade user-approved, 2026-09-14).
- `@react-navigation/*` ayrı paket olarak **kurulmaz**: SDK 57'de expo-router React Navigation'ı kendi içinde taşır
  (`expo-router/build/react-navigation`) ve SDK 57 `bundledNativeModules.json` bu paketleri listelemez. Ayrı bir
  `@react-navigation/bottom-tabs` kopyası, `Tabs` layout'unun sağladığından FARKLI bir `BottomTabBarHeightContext`
  üretir → context hep `undefined`, içerik tab bar'ın altına kayar (sessiz hata). Doğru import: `expo-router/tabs`.
- expo-router peer'ları doğrudan dependency: `react-native-gesture-handler`, `react-native-reanimated`,
  `react-native-worklets` (SDK pin'leri `npx expo install` ile). Transit/hoisted paketlere güvenilmez: SDK 54'te
  `@react-navigation/bottom-tabs` yalnız expo-router 6'nın alt bağımlılığıydı; SDK 57'de kaybolunca Metro kırıldı.
- Build öncesi: repo kökünde `npm run verify:mobile-bundle` (iOS + Android `expo export`, çıktı `/tmp`) exit 0 olmadan
  EAS Preview / TestFlight / Google Internal build **alınmaz**. Ayrıntı: `MOBILE_DEVICE_UAT_RUNBOOK.md` §0.
