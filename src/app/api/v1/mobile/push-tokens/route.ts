import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { fail, ok } from "@/lib/services/result";
import { disableDevicePushTokens, registerDevicePushToken } from "@/lib/device-push-tokens";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  expoPushToken: z
    .string()
    .min(1)
    .refine((t) => t.startsWith("ExponentPushToken["), "Geçersiz push token biçimi."),
  platform: z.enum(["ios", "android"]),
  appVariant: z.enum(["development", "preview", "production"]).optional(),
  deviceId: z.string().max(128).optional(),
  permission: z.enum(["granted", "denied", "undetermined"]).optional(),
});

/**
 * POST /api/v1/mobile/push-tokens — cihaz push token kaydı (idempotent).
 * Sahibi yalnız oturumdaki kullanıcı (`ctx.userId`), tenant `ctx`'ten.
 * Yanıt/token-log ASLA ham token içermez.
 */
export const POST = withApiHandler(async ({ ctx, body }) => {
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Push token kaydı geçersiz.");
  const rec = await registerDevicePushToken({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    platform: parsed.data.platform,
    expoPushToken: parsed.data.expoPushToken,
    appVariant: parsed.data.appVariant,
    deviceId: parsed.data.deviceId,
    permission: parsed.data.permission,
  });
  return ok({ registered: true, tokenId: rec.id, enabled: rec.enabled });
});

const DeleteBodySchema = z.object({ expoPushToken: z.string().min(1).optional() });

/**
 * DELETE /api/v1/mobile/push-tokens — logout/invalidation: kendi token'larını
 * devre dışı bırakır (body boşsa tüm cihazlar). Başkasının satırına dokunamaz.
 */
export const DELETE = withApiHandler(async ({ ctx, body }) => {
  const parsed = DeleteBodySchema.safeParse(body ?? {});
  if (!parsed.success) return fail("VALIDATION_ERROR", "İstek geçersiz.");
  const count = await disableDevicePushTokens(ctx.tenantId, ctx.userId, parsed.data.expoPushToken);
  return ok({ disabled: count });
});
