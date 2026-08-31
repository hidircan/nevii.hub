# Nevii Hub — Ürün Değerlendirmesi & Para Kazanma Yol Haritası
**Tarih:** 29 Temmuz 2026 · **Hedef:** Dikey AI-Agent SaaS ile gelir üretmek

---

## 1. MEVCUT DURUM — Elinde Ne Var?

### İşlevsel SaaS çekirdeği (müzik okulları)
| Modül | Durum | Satış değeri |
|---|---|---|
| Ders programı | ✅ | Orta |
| Yoklama | ✅ | Orta |
| Telafi Merkezi (motor) | ✅ | **Yüksek** — rakip yok |
| Ödemeler | ✅ | Yüksek |
| Öğrenci/Öğretmen yönetimi | ✅ | Taban |
| WhatsApp mesaj kuyruğu (wa.me) | ✅ | **Yüksek** — otomasyon hissi |
| Veli portalı | ✅ | Orta |
| Öğretmen portalı | ✅ | Orta |
| Multi-tenant + JWT/RBAC | ✅ | Enterprise ön şartı |
| REST API (v1) | ✅ | Entegrasyon satışı |

### AI platform katmanı
| Katman | Durum | Not |
|---|---|---|
| AI Asistan (chat + stream) | ✅ | Canlı tool çağırıyor |
| Agent Runtime + Tool Registry (15 tool) | ✅ | Tümü RBAC korumalı |
| LLM provider soyutlaması (OpenAI/Gemini/Heuristic) | ✅ | Maliyet esnekliği |
| Workflow Engine (6 otonom iş) | ✅ | Tekrarlayan agent görevleri |
| WhatsApp webhook | ✅ | Gelen mesaj kanalı hazır |
| Memory Layer (scope: conversation/user/tenant/workflow) | ✅ | Yeni tamamlandı |
| Vector Memory (pgvector/Qdrant/File + 4 embedding provider) | ✅ **commitlenmemiş** | Semantik hafıza hazır |
| Planner (guardrailed execution plan) | ✅ **commitlenmemiş** | Milestone 14 temeli |
| AI Tahsilat Agent (kuyruk + onaylı WhatsApp) | ✅ **commitlenmemiş** | İlk monetize modül |
| AI Metrics / Logs / Dashboard | ✅ | Gözlemlenebilirlik + faturalama temeli |

### Altyapı
- Prisma 7 (MariaDB adapter, MySQL production) + JSON/memory fallback
- Next.js 16 / React 19 / Vercel-ready
- Tenant: User → School → Branch → (Student/Teacher/Room/Lesson/Payment)

---

## 2. ANA STRATEJİK KARAR

**"Horizontal AI agent platformu" satmak henüz erken. Kazandıracak yol:**

```
Nevii Hub (dikey SaaS, müzik okulları)
  → AI Agent eklentileri (her biri ayrı para basan modül)
    → İlk 5 ödeyen müşteri + case study
      → Dikey genişleme (dil, dans, spor akademileri)
        → Bu noktada "Agent Studio" ile platform satışı
```

Kural: **Her geliştirme önce müşteri para kazandıran/kazandırmayı önleyen bir sorunu çözmeli.**

---

## 3. AGENT ÜRÜN HATTI (her biri ayrı abonelik modülü)

| Agent | Müşteri acısı | Gelir etkisi | Durum |
|---|---|---|---|
| **AI Tahsilat Agent** | Geciken aidatlar | Doğrudan nakit | 🟡 v1 var — sonuç takibi eksik |
| **AI Telafi Planlayıcı** | Kaçan dersler → churn | Aidat devamlılığı | ⏭️ Motor hazır |
| **AI Ders Hatırlatıcı** | Unutulan dersler | Yoklama + memnuniyet | ⏭️ Workflow hazır |
| **AI Doluluk Optimize** | Boş öğretmen saatleri | Gelir/doluluk oranı | ⏭️ weekly_reports var |
| **AI Veli Sekreteri** | Cevapsız sorular (7/24) | Zaman tasarrufu | ⏭️ WhatsApp webhook var |

---

## 4. YOL HARİTASI

### Faz 0 — Bugün: Çalışmayı sağlamlaştır (0-1 hafta)
- [ ] `npm run lint` + `npm run build` (ortamda npm yoktu — yerelde çalıştır)
- [ ] Commit: `feat: vector memory + planner + AI tahsilat agent`
- [ ] Prisma şemasına Agent modelleri ekle → production'a taşı (şu an file store)

### Faz 1 — İlk ödeyen müşteri (2-4 hafta)
1. **Tahsilat Agent v2** (şimdi başlıyor):
   - Takip vaka durumu: taslak → onaylandı → gönderildi → yanıt → ödendi
   - ROI kartı: "Bu ay X₺ tahsilata katkı"
2. **Demo paketi**: tek tık demo reset + satış senaryosu videosu
3. İzmir'de 3 müzik okulu → 30 gün pilot → 1'i ücretliye çevir
4. **Fiyat**: Temel 1.500₺/ay + AI Paket 750₺/ay (ilk müşterilere %50 pilot)

### Faz 2 — Kanıt ve tekrarlanabilirlik (1-2 ay)
- Telafi Planlayıcı Agent (şu anki en güçlü farklılaştırıcı)
- Veli Sekreteri v1 (WhatsApp gelen mesaj → AI yanıt taslağı → onay)
- Case study: "Aidat tahsilatı %X hızlandı, kaçan ders kaybı %Y azaldı"
- Onboarding akışı: 15 dakikada okul kurulumu (kritik — satışı ölçekler)

### Faz 3 — Ölçekleme (2-4 ay)
- İkinci dikey: dil okulu veya dans akademisi (aynı çekirdek, yeni tenant konfigi)
- Gerçek WhatsApp Business API (Meta) — wa.me'den otomatik gönderime geçiş
- Billing: kota/kullanım bazlı AI ücretlendirme (metrics tablosu hazır)
- Self-serve kayıt + ödeme (iyzico/Stripe TR)

### Faz 4 — Platform aşaması (6+ ay, ancak gelir varken)
- Agent Studio: müşterinin kendi agent kurallarını tanımlaması
- MCP server: dış agent'ların Nevii Hub'a bağlanması
- White-label: eğitim zincirlerine lisans
- (İsteğe bağlı) Voice agent — ancak dikey kanıtlandıktan sonra

---

## 5. YAPMAMA LİSTESİ (kısa vade)
- ❌ Voice agent — kanal, değer değil; dikey kanıtlanmadan maliyet
- ❌ Multi-agent collaboration — tek agent bile henüz para kazanmadı
- ❌ Agent Marketplace — müşteri yokken pazar yeri kurulmaz
- ❌ Genel amaçlı RAG — okul dokümanları dışında gereksiz kapsam

---

## 6. BU OTURUMDA YAPILANLAR
1. Ürün envanteri çıkarıldı (53 dosya: 33 API route + 16 panel sayfası + 15 agent tool + 6 workflow)
2. Bu yol haritası dokümanı oluşturuldu
3. **Tahsilat Agent v2 → vaka durum takibi (Prisma modeli + service)** eklendi
