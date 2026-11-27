import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { redis } from "./redis";

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newDeviceToken(): string {
  return "fc_" + randomBytes(32).toString("base64url");
}

export async function authenticateDevice(token: string | null | undefined): Promise<string | null> {
  if (!redis || !token || token.length < 30 || token.length > 160) return null;
  const deviceId = await redis.get("family-call:device-token:" + hashDeviceToken(token));
  return deviceId || null;
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] || null;
}
