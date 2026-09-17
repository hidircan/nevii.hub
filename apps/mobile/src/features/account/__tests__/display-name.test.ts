/**
 * resolveDisplayName sözleşmesi — profil kimliği regresyon testi.
 * Kök neden: Ebru Şirince hesabında adın bazen yalnız "Öğretmen" görünmesi
 * (restore sonrası boş e-posta → rol etiketi ada düşüyordu).
 */
import { describe, it, expect } from "vitest";
import { resolveDisplayName } from "../display-name";

describe("resolveDisplayName", () => {
  it("öğretmen gerçek adı varsa onu döndürür (e-postayı ezer)", () => {
    expect(resolveDisplayName({ teacherName: "Ebru Şirince", email: "ebru@kurum.com" })).toBe("Ebru Şirince");
  });

  it("ad yoksa e-postayı döndürür", () => {
    expect(resolveDisplayName({ teacherName: null, email: "ebru@kurum.com" })).toBe("ebru@kurum.com");
  });

  it("boşluklardan ibaret ad yok hükmündedir", () => {
    expect(resolveDisplayName({ teacherName: "   ", email: "ebru@kurum.com" })).toBe("ebru@kurum.com");
  });

  it("ikisi de yoksa null döner (iskelet gösterilir, rol etiketi ada konmaz)", () => {
    expect(resolveDisplayName({ teacherName: null, email: "" })).toBeNull();
    expect(resolveDisplayName({})).toBeNull();
  });

  it("ASLA rol etiketi üretmez", () => {
    expect(resolveDisplayName({ email: "" })).not.toBe("Öğretmen");
  });
});
