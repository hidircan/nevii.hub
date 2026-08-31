# AI_SYSTEM.md — pointer

Kaynak: `../../CLAUDE.md` §AI platform (DOĞRULANDI, kod-referanslı) +
`src/lib/ai/*`, `src/lib/agent/*`, `src/lib/workflows/*`.

## Özet — DOĞRULANDI
Üç yürütme yüzeyi aynı Tool Layer/Agent Runtime'ı paylaşır: interaktif chat
(`orchestrator.ts`, tek-adımlık planla→çalıştır→anlat, turn içi yeniden
planlama YOK), otonom workflow'lar (`src/lib/workflows/*`, 6 zamanlanmış iş),
headless tool execution (`/api/v1/agent/execute`).

Provider zinciri (`provider-chain.ts`): Gemini → Groq → NVIDIA NIM →
Cerebras → heuristic (anahtar yoksa atla, auth hatasından sonra o
provider'ı tekrar deneme). Heuristic (`providers/heuristic.ts`) anahtarsız,
deterministik son çare — her zaman "configured".

Capability policy layer (`capabilities.ts`, `plan-invocation.ts`): her
capability `allowedRoles`/`requiresApproval`/`preferredProvider` bildirir;
dış mesaj gönderen HERHANGİ bir capability (`collectionsMessageDraft` vb.)
sadece TASLAK üretir — gönderim öncesi insan onayı zorunlu, ürün kuralı
(PROJECT.md §8.3), UI convention değil.

Global AI asistan UI: sabit yüzen popup, asla docked panel/fullscreen —
`src/app/layout.tsx`'te bir kez mount edilir.

## İlgili skill
`ai-system`
