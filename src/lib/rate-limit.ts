import type { Database } from "./db";
import { errors } from "./evlog";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function enforceRateLimit(
  db: Database,
  request: Request,
  options: {
    limit: number;
    scope: string;
    windowSeconds: number;
  }
): Promise<void> {
  const clientIp = request.headers.get("CF-Connecting-IP") ?? "local";
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % options.windowSeconds);
  const keyHash = await sha256Hex(`${options.scope}:${clientIp}`);

  await db
    .prepare(
      "INSERT INTO rate_limits (scope, key_hash, window_start, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(scope, key_hash, window_start) DO UPDATE SET count = count + 1"
    )
    .bind(options.scope, keyHash, windowStart, now)
    .run();

  const row = await db
    .prepare(
      "SELECT count FROM rate_limits WHERE scope = ? AND key_hash = ? AND window_start = ?"
    )
    .bind(options.scope, keyHash, windowStart)
    .first<{ count: number }>();

  if ((row?.count ?? 0) > options.limit) {
    throw errors.tooManyRequests(options.windowSeconds - (now - windowStart));
  }
}
