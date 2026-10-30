import { withApiHandler } from "@/lib/api/handler";
import { handleLogin } from "@/lib/auth/login-flow";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/auth/login
 * Public — web girişi: JWT pair in body + HttpOnly cookies; Turnstile etkinse token şart.
 */
export const POST = withApiHandler((args) => handleLogin(args, "web"), { public: true });
