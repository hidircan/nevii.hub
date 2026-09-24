---
name: ai-system
description: Provider chain, heuristic fallback, capability, tool invocation, approval flow, AI audit ve tenant izolasyonunu ele alır.
---

## Ne zaman kullanılır
`src/lib/ai/*`, `src/lib/agent/*`, `src/lib/workflows/*` değişikliklerinde.

## İlk okunacak minimum proje-beyni dokümanları
`docs/project-brain/AI_SYSTEM.md` → `../../CLAUDE.md` §AI platform.

## İncelenecek minimum kod alanları
`src/lib/agent/registry.ts` (`TOOL_REGISTRY`), `src/lib/ai/provider-chain.ts`,
`src/lib/ai/capabilities.ts`/`plan-invocation.ts`, değişen provider dosyası.

## Güvenlik/iş kuralı kontrolleri
- Yeni AI-çağrılabilir yetenek Tool Layer + registry üzerinden mi (bespoke
  DB erişimi YOK)?
- `requiresApproval` doğru işaretli mi — dış mesaj gönderen capability'ler
  taslak-only mu kalıyor (insan onayı zorunlu, PROJECT.md §8.3)?
- `planAiInvocation` tenant/rol eksikliğinde fail-closed mi çalışıyor?
- Provider zinciri sırası (Gemini→Groq→NVIDIA NIM→Cerebras→heuristic)
  korunuyor mu, auth-hatalı provider tekrar denenmiyor mu?

## Hangi testler
`src/lib/ai/__tests__/*` veya eşdeğeri + registry/tool eklenen her yeni
capability için en az bir test.

## Çıktı formatı
Hangi capability/tool eklendiği/değiştiği + `requiresApproval` durumu +
hangi rolün erişebildiği.

## CEO onayı gereken işlemler
Dış mesaj gönderen (WhatsApp/SMS/e-posta) bir capability'yi
`requiresApproval:false` yapmak — asla CEO onayı olmadan.

## Sık yapılan hatalar
- AI tarafı için Tool Layer'ı bypass eden özel DB erişimi yazmak.
- Turn-içi çok-adımlı yeniden planlama varsayımıyla tasarlamak — orchestrator
  tek-adımlık (plan→execute→narrate), zincirleme tool call'a güvenilmez.
