import type { NextConfig } from "next";
import { robotsPolicyForTier } from "./src/lib/env/robots-policy";

// Fonts are self-hosted via next/font (no Google Fonts CDN at runtime); Supabase is
// only ever called server-side (SUPABASE_SERVICE_ROLE_KEY, no NEXT_PUBLIC_SUPABASE_URL
// fetch from the browser) — so CSP can stay 'self'-only with no external connect-src.
// style-src needs 'unsafe-inline' because Next.js injects critical CSS as inline
// <style> tags. script-src needs it too: the App Router streams RSC payloads and
// hydration data via inline <script> tags (the self.__next_r/__next_f bootstrap) —
// without 'unsafe-inline' the browser silently blocks those scripts, which breaks
// hydration app-wide (dead click handlers everywhere, nothing throws visibly).
// The fully strict alternative is a per-request nonce via proxy.ts (see Next's own
// CSP guide, node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md),
// but that requires opting every page into dynamic rendering — out of scope here.
const isDev = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  // Dev-only 'unsafe-eval': Next.js dev server (Fast Refresh / Turbopack HMR) evals
  // source maps. Never present in a production build.
  // challenges.cloudflare.com: giriş formundaki Turnstile betiği ve iframe'i.
  isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com"
    : "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "frame-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  // PayTR kart kaydı formu DOĞRUDAN paytr.com'a POST eder (kart verisi sunucumuza
  // uğramaz, bkz. saas-billing/paytr-subscription.ts); 'self' tek başına o formu
  // sessizce engellerdi.
  "form-action 'self' https://www.paytr.com",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // Server Actions default to a 1MB request body cap — too small for a
    // base64-encoded logo upload: `validateProfilePhoto` already allows up
    // to 2MB of actual file bytes, which is ~2.7MB once base64-encoded
    // plus the request envelope. Without this, uploads over ~750KB never
    // even reach that validation — they fail at the framework transport
    // layer with a raw "Body exceeded 1 MB limit" runtime error instead of
    // the friendly Turkish message.
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    // Review/test tier'da tüm yanıtlara (HTML + /api) X-Robots-Tag: noindex, nofollow.
    // Production'da null → hiçbir header eklenmez, mevcut SEO değişmez.
    const xRobotsTag = robotsPolicyForTier(process.env.NEVII_DEPLOYMENT_TIER, process.env.VERCEL_ENV).xRobotsTag;
    return [
      {
        source: "/:path*",
        headers: xRobotsTag ? [...SECURITY_HEADERS, { key: "X-Robots-Tag", value: xRobotsTag }] : SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
