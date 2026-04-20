import type { Database } from "./db";
import { errors } from "./evlog";

export const ADMIN_SESSION_COOKIE = "__Host-twitmarks-admin";
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24;
export const ADMIN_SECRET_MAX_LENGTH = 256;

const SESSION_COOKIE_SUFFIX = "Path=/; HttpOnly; Secure; SameSite=Strict";
const ADMIN_SECRET_CONFIG_ID = 1;

const COOKIE_SPLIT_RE = /;\s*/;

function getCookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) {
    return null;
  }

  for (const part of header.split(COOKIE_SPLIT_RE)) {
    const idx = part.indexOf("=");
    if (idx < 0) {
      continue;
    }
    if (part.slice(0, idx) === name) {
      return decodeURIComponent(part.slice(idx + 1));
    }
  }

  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  // biome-ignore lint/suspicious/noBitwiseOperators: constant-time comparison requires bitwise XOR
  let diff = aBytes.length ^ bBytes.length;
  const max = Math.max(aBytes.length, bBytes.length);

  for (let i = 0; i < max; i++) {
    // biome-ignore lint/suspicious/noBitwiseOperators: constant-time comparison requires bitwise XOR and OR
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }

  return diff === 0;
}

export async function resolveConfiguredAdminSecretHash(
  db: Database,
  configuredSecret?: string
): Promise<string> {
  const configuredHash = await db
    .prepare("SELECT secret_hash FROM admin_secret_config WHERE id = ?")
    .bind(ADMIN_SECRET_CONFIG_ID)
    .first<{ secret_hash: string }>();

  if (
    typeof configuredHash?.secret_hash === "string" &&
    configuredHash.secret_hash
  ) {
    return configuredHash.secret_hash;
  }

  if (!configuredSecret) {
    throw errors.internal(
      "Internal server error",
      new Error("ADMIN_SECRET missing")
    );
  }

  return sha256Hex(configuredSecret);
}

export async function verifyAdminSecret(
  candidate: string,
  db: Database,
  configuredSecret?: string
): Promise<void> {
  const [candidateHash, resolvedConfiguredHash] = await Promise.all([
    sha256Hex(candidate),
    resolveConfiguredAdminSecretHash(db, configuredSecret),
  ]);

  if (!timingSafeEqual(candidateHash, resolvedConfiguredHash)) {
    throw errors.unauthorized("Invalid authentication credentials");
  }
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function createAdminSession(db: Database): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = nowInSeconds() + ADMIN_SESSION_TTL_SECONDS;

  await db
    .prepare(
      "INSERT INTO admin_sessions (token_hash, expires_at, created_at) VALUES (?, ?, ?)"
    )
    .bind(await sha256Hex(token), expiresAt, nowInSeconds())
    .run();

  return token;
}

export async function requireAdminSession(
  request: Request,
  db: Database
): Promise<void> {
  const token = getCookieValue(request, ADMIN_SESSION_COOKIE);
  if (!token) {
    throw errors.unauthorized("Missing admin session");
  }

  const session = await db
    .prepare(
      "SELECT token_hash FROM admin_sessions WHERE token_hash = ? AND expires_at > ?"
    )
    .bind(await sha256Hex(token), nowInSeconds())
    .first();

  if (!session) {
    throw errors.unauthorized("Invalid admin session");
  }
}

export async function hasAdminSession(
  request: Request,
  db: Database
): Promise<boolean> {
  try {
    await requireAdminSession(request, db);
    return true;
  } catch {
    return false;
  }
}

export async function revokeAdminSession(
  request: Request,
  db: Database
): Promise<void> {
  const token = getCookieValue(request, ADMIN_SESSION_COOKIE);

  if (!token) {
    return;
  }

  await db
    .prepare("DELETE FROM admin_sessions WHERE token_hash = ?")
    .bind(await sha256Hex(token))
    .run();
}

export async function updateAdminSecret(
  db: Database,
  nextSecret: string
): Promise<void> {
  await db
    .prepare(
      "INSERT OR REPLACE INTO admin_secret_config (id, secret_hash, updated_at) VALUES (?, ?, ?)"
    )
    .bind(ADMIN_SECRET_CONFIG_ID, await sha256Hex(nextSecret), nowInSeconds())
    .run();
}

export function buildSetCookie(value: string): string {
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(value)}; ${SESSION_COOKIE_SUFFIX}; Max-Age=${ADMIN_SESSION_TTL_SECONDS}`;
}

export function buildClearCookie(): string {
  return `${ADMIN_SESSION_COOKIE}=; ${SESSION_COOKIE_SUFFIX}; Max-Age=0`;
}
