import { ImageResponse } from "next/og";

/**
 * 10. tur iş #3 — OG/Twitter kart görseli (1200×630), Next dosya
 * konvansiyonu ile sunucu tarafında üretilir (`/opengraph-image`).
 * Harici tasarım aracı/asset gerektirmez; marka + TR sloganı.
 */
export const runtime = "edge";
export const alt = "NeviiHub - Okullar için Yönetim Platformu";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #78350f 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "#f59e0b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            N
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>NeviiHub</div>
        </div>
        <div style={{ marginTop: 32, fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>
          Eğitim Kurumları için Yönetim Platformu
        </div>
        <div style={{ marginTop: 20, fontSize: 30, color: "#fcd34d" }}>
          Okulunuzu tek panelden yönetin
        </div>
      </div>
    ),
    { ...size }
  );
}
