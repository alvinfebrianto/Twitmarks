import { errors } from "./evlog";

export const ADMIN_SESSION_COOKIE = "__Host-twitmarks-admin";

const SESSION_COOKIE_SUFFIX = "Path=/; HttpOnly; Secure; SameSite=Strict";

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

export async function verifyAdminSecret(
  candidate: string,
  configuredSecret?: string
): Promise<void> {
  if (!configuredSecret) {
    throw errors.internal(
      "Internal server error",
      new Error("ADMIN_SECRET missing")
    );
  }

  const [candidateHash, configuredHash] = await Promise.all([
    sha256Hex(candidate),
    sha256Hex(configuredSecret),
  ]);

  if (!timingSafeEqual(candidateHash, configuredHash)) {
    throw errors.unauthorized("Invalid authentication credentials");
  }
}

export async function createSessionValue(
  configuredSecret: string
): Promise<string> {
  return await sha256Hex(configuredSecret);
}

export async function requireAdminSession(
  request: Request,
  configuredSecret?: string
): Promise<void> {
  if (!configuredSecret) {
    throw errors.internal(
      "Internal server error",
      new Error("ADMIN_SECRET missing")
    );
  }

  const sessionValue = getCookieValue(request, ADMIN_SESSION_COOKIE);
  if (!sessionValue) {
    throw errors.unauthorized("Missing admin session");
  }

  const expected = await createSessionValue(configuredSecret);
  if (!timingSafeEqual(sessionValue, expected)) {
    throw errors.unauthorized("Invalid admin session");
  }
}

export async function hasAdminSession(
  request: Request,
  configuredSecret?: string
): Promise<boolean> {
  try {
    await requireAdminSession(request, configuredSecret);
    return true;
  } catch {
    return false;
  }
}

export function buildSetCookie(value: string): string {
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(value)}; ${SESSION_COOKIE_SUFFIX}`;
}

export function buildClearCookie(): string {
  return `${ADMIN_SESSION_COOKIE}=; ${SESSION_COOKIE_SUFFIX}; Max-Age=0`;
}
