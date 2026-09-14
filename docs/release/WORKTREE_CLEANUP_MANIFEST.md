# Worktree Cleanup Manifest (yalnız plan — hiçbir şey silinmedi)

- Tarih: 2026-09-14 · Canonical release branch: `release/mobile-review` (zincir: `origin/test` → `4e0451c` Claude
  mobile core → `2fb3943` Muse guardian hardening → `976c673` Muse guardian makeup P0 → preflight → noindex/validate).
- Bu belge hazırlanırken **hiçbir worktree/klasör silinmedi, taşınmadı**; `rm -rf`, `git clean`, `git worktree prune`
  veya Git metadata repair **yapılmadı**. Orphan klasörlerin içeriği (commit edilmemiş dosyalar) bu turda incelenmedi.
- "Remote push" koşulu: `release/mobile-review` origin'e push edilip remote SHA yerel HEAD ile eşleşmeden hiçbir
  kaldırma yapılmaz (bugün üç mobil branch'in de remote'u **yok**).

| Worktree | Branch | Durum | İçerik | Release branch'e alındı mı? | Silme zamanı | Silme yöntemi |
|---|---|---|---|---|---|---|
| `~/Projects/nevii-hub` | `main` | Ana checkout | Ana repo (`.git` burada) | — | **Silinmez** | — |
| `~/Projects/neviihub-feature-mobile-p0` | `feature/mobile-p0` @ `4e0451c` | Kayıtlı worktree | Claude mobile core (auth/API/persona, teacher P0, icon/splash, mobile read routes) | **Evet** — `4e0451c` release zincirinin atası | Release branch doğrulandı + remote push yapıldıktan sonra | `git worktree remove ~/Projects/neviihub-feature-mobile-p0` (kirli ise durur; `--force` kullanılmaz) |
| `~/Projects/neviihub-feature-mobile-student-parent-p0` | `feature/mobile-student-parent-p0` @ `976c673` | Kayıtlı worktree | Muse guardian hardening + guardian makeup P0, device UAT docs | **Evet** — `2fb3943`, `976c673` release zincirinde | Release branch doğrulandı + remote push yapıldıktan sonra | `git worktree remove ~/Projects/neviihub-feature-mobile-student-parent-p0` (`--force` yok) |
| `~/Projects/neviihub-feature-mobile-review-preflight` | `release/mobile-review` (eski `feature/mobile-review-preflight`) | Kayıtlı worktree — **final release worktree** | Birleşik mobil P0 + release preflight + runtime noindex | Kendisi release branch | **Silinmez** | Kullanıcı onayından sonra yalnız `git worktree move ~/Projects/neviihub-feature-mobile-review-preflight ~/Projects/neviihub-release-mobile-review` |
| `~/Projects/nevii-hub/.claude/worktrees/mobile-quality-fix` | `worktree-mobile-quality-fix` @ `4ab2f3d` | **Orphan** (`git worktree list`'te yok, `.git/worktrees` kaydı yok) | Branch commit'i `origin/test`'in atası (0 commit ileride); klasördeki commit edilmemiş içerik incelenmedi | Branch commit'leri zaten zincirde; ek içerik alınmadı | Release staging + store testleri geçtikten **sonra**, ayrı onayla | Önce klasör içeriği salt-okunur incelenir; kurtarılacak dosya yoksa kullanıcı onayıyla manuel arşiv/silme — `rm -rf` agent tarafından yapılmaz |
| `~/Projects/nevii-hub/.claude/worktrees/mobile-product-redesign` | `worktree-mobile-product-redesign` @ `4ab2f3d` | **Orphan** (aynı) | Branch commit'i `origin/test`'in atası; klasördeki redesign çalışması (commit edilmemiş) incelenmedi — **bu release'e kod alınmadı** | Hayır (kasıtlı) | Release staging + store testleri geçtikten **sonra**, ayrı onayla | Aynı: önce içerik incelemesi ve kullanıcı kararı; `rm -rf` / `git clean` yok |

## Kapsam dışı (bu manifest karar vermez)

`nevii-hub-exact-billing`, `nevii-hub-makeup-policy-term-demo`, `nevii-hub-portal-redesign`,
`nevii-hub-student-dashboard`, `neviihub-cloudflare-staging`, `neviihub-vercel-test-environment`, `neviios-control`
ve `.claude/worktrees/` altındaki diğer agent klasörleri mobil release ile ilgisizdir; dokunulmadı.
