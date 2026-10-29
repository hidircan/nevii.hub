import * as SecureStore from "expo-secure-store";

const ACCESS_KEY = "notaplan_access_token";
const REFRESH_KEY = "notaplan_refresh_token";
const EMAIL_KEY = "neviihub_account_email";

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, refreshToken),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([SecureStore.deleteItemAsync(ACCESS_KEY), SecureStore.deleteItemAsync(REFRESH_KEY)]);
}

/**
 * Hesap e-postası — session restore'da ad/e-posta kimliği boş düşmesin diye
 * (kök neden: restore `loadSession("")` ile boş e-posta bırakıyor, profil
 * "Öğretmen" rol etiketine düşüyordu). Yalnız kimlik görüntüsü için;
 * güvenlik sınırı token'lar + sunucu oturumudur.
 */
export async function getStoredEmail(): Promise<string | null> {
  return SecureStore.getItemAsync(EMAIL_KEY);
}

export async function setStoredEmail(email: string): Promise<void> {
  await SecureStore.setItemAsync(EMAIL_KEY, email);
}

export async function clearStoredEmail(): Promise<void> {
  await SecureStore.deleteItemAsync(EMAIL_KEY);
}
