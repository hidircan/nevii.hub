# neviihub-cron (Cloudflare Workers Free)

Vercel Pro bırakılıp Hobby'ye dönülürse `vercel.json`'daki `*/10` cron'u deploy'u **reddettirir** (Hobby: günde 1 cron).
Bu worker aynı 4 zamanlayıcıyı Cloudflare'in ücretsiz Cron Trigger'ı ile çalıştırır (istek başına ~1 fetch; Free: 100 000
istek/gün, 5 cron tetiği). Veritabanına erişmez; Supabase egress'ini değiştirmez.

## Devreye alma (yalnız Hobby'ye geçerken, sırayla)
1. `cd apps/cloudflare-cron && npx wrangler login` (Cloudflare hesabı, ücretsiz plan).
2. `npx wrangler secret put CRON_SECRET` → Vercel'deki `CRON_SECRET` değeri (değer hiçbir dosyaya yazılmaz).
3. `npx wrangler deploy` → Cloudflare paneli → Workers → neviihub-cron → Triggers'ta 4 cron görünür.
4. AYNI PR'da `vercel.json` → `crons` dizisini kaldırın (iki zamanlayıcı = çift tick). Vercel Hobby'de `CRON_SECRET` env kalabilir.
5. Kontrol: Workers → neviihub-cron → Logs'ta hata yok; Vercel runtime log'larında `/api/v1/notifications/tick` 10 dk'da bir 200.

Geri alma: `vercel.json` crons'u geri koyun, `npx wrangler delete neviihub-cron`.
