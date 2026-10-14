/**
 * Push altyapı anahtarları — secret değerler ASLA loglanmaz/yanıtlanmaz.
 * Varsayılan KAPALI: `PUSH_ENABLED=true` + `EXPO_PUSH_ACCESS_TOKEN` dolu
 * olmadıkça push gönderilmez, `pushEnabled` tercihi `false`'a zorlanır.
 */
export function isPushActive(): boolean {
  return process.env.PUSH_ENABLED === "true" && !!process.env.EXPO_PUSH_ACCESS_TOKEN;
}

export function expoPushAccessToken(): string | null {
  return process.env.EXPO_PUSH_ACCESS_TOKEN || null;
}
