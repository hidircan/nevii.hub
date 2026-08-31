/**
 * Expo config regresyon testi — profil fotoğrafı yalnızca galeriden seçilir,
 * kamera izni İSTENMEZ (bkz. Package 1 kapsamı: "Do not add camera
 * permission"). `expo-image-picker` eklenti config'i bunu zaten
 * `cameraPermission: false` ile kapatıyor; bu test o davranışın sessizce
 * geri gelmesini engeller.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

type ImagePickerPluginConfig = { photosPermission?: string; cameraPermission?: boolean | string; microphonePermission?: boolean | string };

function loadAppConfig(): { expo: { plugins: unknown[] } } {
  const raw = readFileSync(path.join(__dirname, "../../../app.json"), "utf8");
  return JSON.parse(raw);
}

function findImagePickerPluginConfig(plugins: unknown[]): ImagePickerPluginConfig {
  const entry = plugins.find((p) => Array.isArray(p) && p[0] === "expo-image-picker") as [string, ImagePickerPluginConfig] | undefined;
  if (!entry) throw new Error("expo-image-picker plugin config not found in app.json");
  return entry[1];
}

describe("apps/mobile/app.json — expo-image-picker izinleri", () => {
  it("kamera izni kapalı (yalnızca galeri seçimi)", () => {
    const config = findImagePickerPluginConfig(loadAppConfig().expo.plugins);
    expect(config.cameraPermission).toBe(false);
  });

  it("mikrofon izni kapalı", () => {
    const config = findImagePickerPluginConfig(loadAppConfig().expo.plugins);
    expect(config.microphonePermission).toBe(false);
  });

  it("galeri (fotoğraflar) izin metni var ve Türkçe", () => {
    const config = findImagePickerPluginConfig(loadAppConfig().expo.plugins);
    expect(config.photosPermission).toBeTruthy();
    expect(config.photosPermission).toMatch(/foto/i);
  });
});
