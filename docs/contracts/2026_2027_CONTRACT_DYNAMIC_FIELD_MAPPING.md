# 2026-2027 Sözleşmesi — Dinamik Alan Eşleme Tablosu

Kaynak: `2026-2027-ogrenci-kayit-sozlesmesi-v1.md`. Bu tablo her placeholder'ın hangi veri kaynağından, hangi katmanda üretildiğini gösterir. Tüm eklemeler **opsiyonel** placeholder'lardır (bkz. `src/lib/contract-template-schema.ts`) — mevcut/eski tenant şablonlarını geriye dönük olarak "eksik" hale getirmez.

| Placeholder | Kaynak veri | Hesaplandığı yer | Zorunlu mu | Immutable snapshot'ta mı |
| --- | --- | --- | --- | --- |
| `branchOptionsText` | `School.branches[]` (tüm şubeler) + `Student.branchId` | `tools.ts createStudentContractTool` (gerçek şube listesiyle ☑/☐ satırı) | Hayır | Hayır (yalnızca render alanı) |
| `studentNationalIdText` | `Student.nationalIdCipher` (şifre çözülmüş) | `tools.ts` (`decryptNationalId`) | Hayır | Hayır |
| `studentBirthDateText` | `Student.birthDate` | `tools.ts` (`formatDate`) | Hayır | Hayır |
| `studentPhoneText` / `studentEmailText` | `Student.phone` / `Student.email` | `tools.ts` | Hayır | Hayır |
| `lessonDurationOptionText` | `Student.lessonDurationMinutes` (30/40/50) | `contracts.ts formatCheckboxOptionsText` | Hayır | Hayır |
| `weeklyFrequencyOptionText` | `Student.weeklyLessonCount` (1/2) | `contracts.ts formatCheckboxOptionsText` | Hayır | Hayır |
| `commitmentDurationOptionText` | `StudentContract.durationMonths` (3-12) | `contracts.ts formatCheckboxOptionsText` | Hayır | Hayır |
| `vatStatusText` | `School.collectionsSettings.contractVatInclusive` | `contracts.ts createContract` | Hayır (varsayılan "Dahil") | Hayır |
| `kvkkNoticeDeliveredCheckboxText` | Personel tarafından form üzerinde işaretlenen `kvkkNoticeDelivered` | `contracts.ts` | Hayır | **Evet** (`ContractDataSnapshot.kvkkNoticeDelivered`) |
| `photoVideoConsentFormCheckboxText` | `photoVideoConsent` objesinin SUNULUP sunulmadığı (`v.data.photoVideoConsent !== undefined`) | `tools.ts` → `contracts.ts` | Hayır | **Evet** (`ContractDataSnapshot.photoVideoConsentFormPresented`) |

## Yeni tip genişletmeleri (migration GEREKMEDİ — hepsi Json/opsiyonel alan)

- `SocialMediaScope` (`src/lib/types.ts`): `print_materials` | `digital_ads` | `in_house_board` eklendi (website/instagram zaten vardı) — `SocialMediaConsent.scopes` zaten `Json` olduğundan şema değişikliği gerekmedi.
- `CollectionsSettings.contractVatInclusive?: boolean` (`src/lib/types.ts`) — `School.collectionsSettings` zaten `Json` olduğundan şema değişikliği gerekmedi.
- `ContractDataSnapshot.kvkkNoticeDelivered?: boolean` / `photoVideoConsentFormPresented?: boolean` (`src/lib/types.ts`) — `StudentContract.contractDataSnapshot` zaten `Json` olduğundan şema değişikliği gerekmedi.
- `StudentContract.photoVideoConsent.scopes?: SocialMediaScope[]` — aynı gerekçeyle migration'sız.

## Minor/yetişkin öğrenci ayrımı

`StudentContract.signatoryRelationship` ("veli" | "öğrenci") zaten mevcuttu ve bu görevde DEĞİŞTİRİLMEDİ — kaynağın Madde 1/5 ve Fotoğraf/Video formunun "18 yaşından küçük öğrenciler" şartını zaten karşılıyor (`isMinor` hesaplaması `computeAge(student.birthDate) < 18`).

## Sunucu tarafı doğrulama

Tüm yeni alanlar ya zaten var olan zod şemasına (`createStudentContractSchema` — `kvkkNoticeDelivered`, `photoVideoConsent.scopes`) eklendi ya da salt-okunur türetilmiş metinlerdir (checkbox satırları) — kullanıcıdan doğrudan serbest metin olarak alınmazlar, bu yüzden ek bir injection/validasyon yüzeyi AÇILMADI.

## Immutable snapshot sonrası değişmezlik

`kvkkNoticeDelivered` ve `photoVideoConsentFormPresented`, `ContractDataSnapshot`'a yazıldıktan sonra hiçbir sonraki kurum ayarı/öğrenci güncellemesi bu sözleşme sürümünü etkilemez (mevcut immutable snapshot deseniyle birebir aynı garanti).
