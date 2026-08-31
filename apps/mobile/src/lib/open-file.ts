import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { getAccessToken } from "../auth/token-storage";
import { API_BASE_URL } from "../api/client";

/**
 * Korumalı bir dosya rotasını (ör. /api/v1/teaching-materials/:id/file) Bearer token ile indirir
 * ve OS paylaşım/açma sayfasını gösterir. apiGet/apiPost JSON-only olduğundan burada elle fetch yapılır.
 */
export async function downloadAndOpenFile(path: string, fileName: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const token = await getAccessToken();
  const safeName = fileName.replace(/[\\/]/g, "_") || "dosya";
  const destUri = `${FileSystem.cacheDirectory}${safeName}`;

  try {
    const result = await FileSystem.downloadAsync(`${API_BASE_URL}${path}`, destUri, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (result.status !== 200) return { ok: false, message: "Dosya indirilemedi." };

    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, message: "Bu cihazda dosya paylaşımı desteklenmiyor." };
    }
    await Sharing.shareAsync(result.uri);
    return { ok: true };
  } catch {
    return { ok: false, message: "Dosya indirilemedi. Bağlantınızı kontrol edin." };
  }
}
