/**
 * NeviiHub zamanlayıcısı (Cloudflare Workers Cron Trigger). vercel.json "crons" ile birebir aynı uçlar ve aynı
 * kimlik doğrulama (Vercel Cron'un gönderdiği `Authorization: Bearer $CRON_SECRET`). Uygulama mantığı yoktur;
 * yalnız saat gelince uygulamanın kendi uç noktasını çağırır.
 */
const JOBS = {
  "*/10 * * * *": "/api/v1/notifications/tick?stages=lessons",
  "0 6 * * *": "/api/v1/notifications/tick",
  "30 0 * * *": "/api/v1/platform/jobs/retention?apply=1",
  "0 1 * * *": "/api/v1/platform/jobs/monthly-accrual?apply=1",
};

const worker = {
  async scheduled(controller, env, ctx) {
    const path = JOBS[controller.cron];
    if (!path || !env.CRON_SECRET) {
      console.error("neviihub-cron: bilinmeyen tetik veya CRON_SECRET eksik", controller.cron);
      return;
    }
    ctx.waitUntil(
      fetch(new URL(path, env.APP_ORIGIN), {
        headers: { authorization: `Bearer ${env.CRON_SECRET}`, "user-agent": "neviihub-cron/1" },
      }).then((res) => {
        if (!res.ok) console.error("neviihub-cron:", path, res.status);
      })
    );
  },
};

export default worker;
