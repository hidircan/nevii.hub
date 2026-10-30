import { withApiHandler } from "@/lib/api/handler";
import { handleLogin } from "@/lib/auth/login-flow";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/auth/mobile/login
 * Public — native uygulama girişi: yalnız gövdede JWT, çerez yok, sıkı rate limit.
 */
export const POST = withApiHandler((args) => handleLogin(args, "native"), { public: true });
