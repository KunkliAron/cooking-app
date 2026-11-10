const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MAX_FAILURES = 10;

async function sha256(text: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** Compares two strings without leaking where they differ through timing. */
async function safeEqual(a: string, b: string) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "local";
}

/**
 * Checks the app password. Ten failures from one address within 15 minutes lock
 * that address out, including for the correct password, until the window passes.
 */
export async function checkPassword(env: Env, ip: string, password: string): Promise<"ok" | "wrong" | "locked"> {
  const now = Date.now();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at > ?")
    .bind(ip, now - LOCKOUT_WINDOW_MS)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= LOCKOUT_MAX_FAILURES) return "locked";

  if (await safeEqual(password, env.APP_PASSWORD)) return "ok";

  await env.DB.batch([
    env.DB.prepare("INSERT INTO login_attempts (ip, at) VALUES (?, ?)").bind(ip, now),
    env.DB.prepare("DELETE FROM login_attempts WHERE at < ?").bind(now - LOCKOUT_WINDOW_MS),
  ]);
  return "wrong";
}

export const PASSWORD_ERRORS = {
  wrong: "Wrong password.",
  locked: "Too many attempts. Try again in 15 minutes.",
} as const;
