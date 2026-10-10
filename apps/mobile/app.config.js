/* eslint-disable @typescript-eslint/no-require-imports -- Expo config CommonJS */
// app.json statik temeldir; bu dosya yalnız production build'i güvenli API'ye kilitler.
// Production + EAS sunucusunda URL zorunlu; yerelde (eas-cli yapılandırmayı değerlendirirken) yalnız
// tanımlıysa doğrulanır — sunucu tarafı env'i yerelde görünmeyebilir.
const { assertProductionApiUrl } = require("./src/api/api-url-policy");

module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_APP_VARIANT === "production") {
    const url = process.env.EXPO_PUBLIC_API_URL;
    if (process.env.EAS_BUILD === "true" || url) assertProductionApiUrl(url);
  }
  // Android push (FCM v1): google-services.json repoda TUTULMAZ; EAS "file" tipi env değişkeni
  // (GOOGLE_SERVICES_JSON) yolunu verir. Yoksa build yine alınır, ama Android push çalışmaz.
  if (process.env.GOOGLE_SERVICES_JSON) {
    config.android = { ...config.android, googleServicesFile: process.env.GOOGLE_SERVICES_JSON };
  }
  return config;
};
