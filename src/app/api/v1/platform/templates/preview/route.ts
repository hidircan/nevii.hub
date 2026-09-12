import { withApiHandler } from "@/lib/api/handler";
import { fail, ok } from "@/lib/services/result";
import { messageTemplateSchema, renderMessageTemplate } from "@/lib/platform/policies";

export const dynamic = "force-dynamic";

/** Şablon önizlemesi — örnek değişkenlerle render eder, HİÇBİR kanaldan gönderim yapmaz. */
export const POST = withApiHandler(
  async ({ body }) => {
    const parsed = messageTemplateSchema.safeParse(body);
    if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz şablon");
    return ok({
      preview: renderMessageTemplate(parsed.data, {
        kurumAdi: "Örnek Sanat Akademisi",
        adSoyad: "Ayşe Yılmaz",
        davetLinki: "https://example.test/davet/kurum-sahibi?invite=ornek",
        sonGecerlilik: "18.09.2026",
        rol: "Kurum Yöneticisi",
      }),
      sent: false,
    });
  },
  { hyperAdminOnly: true, permission: "platform:read" }
);
